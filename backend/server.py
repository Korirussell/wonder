"""
Wonder — Unified Backend Server

Runs all endpoints on a single port:
  DSP processing    — /extract-harmonics, /process-reverb, /adjust-pitch,
                       /adjust-speed, /chop-audio
  Sample library    — /generate-sample, /generate-loop, /generate-instrument,
                       /samples/search, /samples/{id}, /samples/{id}/audio
  Audio analysis    — /api/analyze-audio
  REST (session/user/split/generate/transcribe)
  Health            — /health, /

Run with:
  uvicorn server:app --port 8000
"""

import io
import os
import tempfile
import base64
import logging
from typing import Any, Optional

import librosa
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from audio_processing import get_harmonic_components, add_reverb, adjust_pitch, adjust_speed

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Wonder Audio API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Optional router includes ─────────────────────────────────────────────────

try:
    from api.generation import router as generation_router
    from api.samples import router as samples_router
    from api.analyze import router as analyze_router
    app.include_router(generation_router)
    app.include_router(samples_router)
    app.include_router(analyze_router)
    logger.info("Loaded api.generation, api.samples, api.analyze routers")
except ImportError as e:
    logger.warning(f"api/ routers not available: {e}")

try:
    from server.rest import app as rest_app
    for route in rest_app.routes:
        if hasattr(route, "path") and route.path not in {r.path for r in app.routes}:
            app.routes.append(route)
    logger.info("Loaded server.rest routes")
except ImportError as e:
    logger.warning(f"server.rest not available: {e}")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "2.0.0"}


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Wonder backend is running"}


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class _AudioBase(BaseModel):
    audio_data: str = Field(..., description="Base64 encoded audio data")
    filename: Optional[str] = Field(default="audio.wav")

    @field_validator("audio_data")
    @classmethod
    def validate_audio_data(cls, v: str) -> str:
        if not v:
            raise ValueError("audio_data must be a non-empty string")
        try:
            base64.b64decode(v)
        except Exception:
            raise ValueError("audio_data must be valid base64 encoded data")
        return v


class AudioInput(_AudioBase):
    pass


class ReverbInput(_AudioBase):
    room_size: float = Field(default=0.5, ge=0.0, le=1.0)
    damping: float = Field(default=0.5, ge=0.0, le=1.0)
    wet_level: float = Field(default=0.3, ge=0.0, le=1.0)
    dry_level: float = Field(default=0.7, ge=0.0, le=1.0)


class ChopInput(_AudioBase):
    default_length: float = Field(default=1.8, ge=0.1, le=10.0)
    min_duration: float = Field(default=0.2, ge=0.05, le=2.0)
    n_clusters: int = Field(default=3, ge=1, le=20)


class PitchInput(_AudioBase):
    semitones: float = Field(..., description="Semitones to shift. Positive = up, negative = down")


class SpeedInput(_AudioBase):
    speed_factor: float = Field(..., ge=0.1, le=10.0)


class AudioOutput(BaseModel):
    audio_data: str
    filename: str
    metadata: dict[str, Any]


class ChopOutput(BaseModel):
    chops: list[dict[str, Any]]
    metadata: dict[str, Any]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _decode(audio_data: str) -> bytes:
    try:
        return base64.b64decode(audio_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64: {e}")


def _load(audio_data: str, filename: str = "audio.wav"):
    audio_bytes = _decode(audio_data)
    ext = ("." + filename.split(".")[-1].lower()) if filename and "." in filename else ".wav"
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp.write(audio_bytes)
        tmp.close()
        y, sr = librosa.load(tmp.name, sr=None)
        if len(y) == 0:
            raise ValueError("Audio file is empty or corrupted")
        return y, sr
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error loading audio: {e}")
    finally:
        tmp.close()
        if os.path.exists(tmp.name):
            os.unlink(tmp.name)


def _save_audio_to_base64(y: np.ndarray, sr: int) -> str:
    buf = io.BytesIO()
    sf.write(buf, y, int(sr), format="WAV")
    return base64.b64encode(buf.getvalue()).decode()


def _audio_metadata(filename: str | None, processing_type: str, y_out: np.ndarray, sr: int, y_orig: np.ndarray) -> dict[str, Any]:
    return {
        "original_filename": filename,
        "processing_type": processing_type,
        "sample_rate": int(sr),
        "duration_seconds": float(len(y_out) / sr),
        "channels": 1 if y_out.ndim == 1 else y_out.shape[0],
        "original_duration": float(len(y_orig) / sr),
    }


# ─── DSP Endpoints ───────────────────────────────────────────────────────────

@app.post("/extract-harmonics", response_model=AudioOutput)
async def extract_harmonics(body: AudioInput) -> AudioOutput:
    y, sr = _load(body.audio_data, body.filename or "audio.wav")
    y_harmonic = get_harmonic_components(y)
    base = (body.filename or "audio").split(".")[0]
    return AudioOutput(
        audio_data=_save_audio_to_base64(y_harmonic, sr),
        filename=f"harmonic_{base}.wav",
        metadata=_audio_metadata(body.filename, "harmonic_extraction", y_harmonic, sr, y),
    )


@app.post("/process-reverb", response_model=AudioOutput)
async def process_reverb(body: ReverbInput) -> AudioOutput:
    y, sr = _load(body.audio_data, body.filename or "audio.wav")
    y_reverb = add_reverb(y, sample_rate=sr, room_size=body.room_size,
                          damping=body.damping, wet_level=body.wet_level, dry_level=body.dry_level)
    base = (body.filename or "audio").split(".")[0]
    meta = _audio_metadata(body.filename, "reverb", y_reverb, sr, y)
    meta["reverb_settings"] = {"room_size": body.room_size, "damping": body.damping,
                                "wet_level": body.wet_level, "dry_level": body.dry_level}
    return AudioOutput(audio_data=_save_audio_to_base64(y_reverb, sr), filename=f"reverb_{base}.wav", metadata=meta)


@app.post("/adjust-pitch", response_model=AudioOutput)
async def adjust_pitch_endpoint(body: PitchInput) -> AudioOutput:
    y, sr = _load(body.audio_data, body.filename or "audio.wav")
    y_pitched = adjust_pitch(y, sr, body.semitones)
    base = (body.filename or "audio").split(".")[0]
    direction = "up" if body.semitones >= 0 else "down"
    meta = _audio_metadata(body.filename, "pitch_adjustment", y_pitched, sr, y)
    meta["pitch_settings"] = {"semitones": body.semitones}
    return AudioOutput(audio_data=_save_audio_to_base64(y_pitched, sr),
                       filename=f"pitch_{direction}{abs(body.semitones)}st_{base}.wav", metadata=meta)


@app.post("/adjust-speed", response_model=AudioOutput)
async def adjust_speed_endpoint(body: SpeedInput) -> AudioOutput:
    y, sr = _load(body.audio_data, body.filename or "audio.wav")
    y_speed = adjust_speed(y, body.speed_factor)
    base = (body.filename or "audio").split(".")[0]
    meta = _audio_metadata(body.filename, "speed_adjustment", y_speed, sr, y)
    meta["speed_settings"] = {"speed_factor": body.speed_factor}
    return AudioOutput(audio_data=_save_audio_to_base64(y_speed, sr),
                       filename=f"speed_{body.speed_factor}x_{base}.wav", metadata=meta)


_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@app.post("/chop-audio", response_model=ChopOutput)
async def chop_audio(body: ChopInput) -> ChopOutput:
    y, sr = _load(body.audio_data, body.filename or "audio.wav")

    y_harmonic, _ = librosa.effects.hpss(y)
    oenv = librosa.onset.onset_strength(y=y_harmonic, sr=sr, hop_length=512)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=oenv, sr=sr, hop_length=512,
        backtrack=True, pre_max=7, post_max=7, pre_avg=7, post_avg=7, delta=0.25, wait=0,
    )
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=512)

    n = len(onset_times)
    chops_sec = []
    for i, t in enumerate(onset_times):
        start = float(t)
        end = float(onset_times[i + 1]) if i < n - 1 else start + body.default_length
        if end - start < body.min_duration:
            end = start + body.default_length
        chops_sec.append((start, max(end, start + body.min_duration)))

    if not chops_sec:
        chops_sec = [(0.0, len(y_harmonic) / sr)]

    chops: list[dict[str, Any]] = []
    feature_matrix: list[list[float]] = []

    for i, (start, end) in enumerate(chops_sec):
        s0, s1 = int(round(start * sr)), int(round(end * sr))
        y_slice = y_harmonic[s0:s1]

        if y_slice.size == 0:
            feat: dict[str, Any] = {"rms": 0.0, "centroid": 0.0, "zcr": 0.0,
                                     "chroma_mean": [0.0] * 12, "mfcc_mean": [0.0] * 13,
                                     "dominant_pc": None, "dominant_note": None}
        else:
            chroma = librosa.feature.chroma_stft(y=y_slice, sr=sr)
            chroma_mean = [float(x) for x in np.mean(chroma, axis=1)]
            dom = int(np.argmax(chroma_mean)) if chroma_mean else None
            feat = {
                "rms": float(np.mean(librosa.feature.rms(y=y_slice)[0])),
                "centroid": float(np.mean(librosa.feature.spectral_centroid(y=y_slice, sr=sr)[0])),
                "zcr": float(np.mean(librosa.feature.zero_crossing_rate(y_slice)[0])),
                "chroma_mean": chroma_mean,
                "mfcc_mean": [float(x) for x in np.mean(librosa.feature.mfcc(y=y_slice, sr=sr, n_mfcc=13), axis=1)],
                "dominant_pc": dom,
                "dominant_note": _NOTE_NAMES[dom] if dom is not None else None,
            }

        feature_matrix.append([feat["rms"], feat["centroid"], feat["zcr"]] + feat["mfcc_mean"][:4])
        chops.append({
            "id": f"harmonic_chop_{i:03d}",
            "audio_data": _save_audio_to_base64(y_slice, sr),
            "start": start, "end": end, "duration": end - start,
            "features": feat,
            "descriptor": f"Harmonic | RMS={feat['rms']:.4f} | Dur={end - start:.2f}",
        })

    if feature_matrix:
        X = np.array(feature_matrix)
        k = min(body.n_clusters, X.shape[0])
        if k > 1:
            try:
                labels = KMeans(n_clusters=k, random_state=0, n_init=10).fit(StandardScaler().fit_transform(X)).labels_
                for chop, label in zip(chops, labels):
                    chop["cluster_label"] = int(label)
                    chop["descriptor"] += f" | Cluster={label}"
            except Exception as e:
                logger.warning(f"Clustering failed: {e}")
                for chop in chops:
                    chop["cluster_label"] = 0
        else:
            for chop in chops:
                chop["cluster_label"] = 0

    return ChopOutput(chops=chops, metadata={
        "original_filename": body.filename,
        "processing_type": "audio_chopping",
        "sample_rate": int(sr),
        "total_chops": len(chops),
        "chopping_params": {"default_length": body.default_length,
                            "min_duration": body.min_duration, "n_clusters": body.n_clusters},
        "onset_detection": {"onsets_detected": len(onset_times),
                            "onset_times": [float(t) for t in onset_times]},
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
