from __future__ import annotations

import io
import os

import numpy as np
from fastapi import APIRouter, UploadFile

router = APIRouter(tags=["analyze"])

# Krumhansl-Schmuckler key profiles (raw)
_KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
# Mean-centered profiles — precomputed so _detect_key avoids recomputing per root
_KS_MAJOR_NORM = _KS_MAJOR - _KS_MAJOR.mean()
_KS_MINOR_NORM = _KS_MINOR - _KS_MINOR.mean()
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _detect_key(chroma: np.ndarray) -> str:
    """Return e.g. 'G Major' or 'A Minor' via Krumhansl-Schmuckler correlation."""
    chroma_sum = chroma.sum(axis=1)  # shape (12,)
    chroma_norm = chroma_sum - chroma_sum.mean()

    best_score = -np.inf
    best_label = "C Major"

    for root in range(12):
        rotated = np.roll(chroma_norm, -root)

        major_r = float(np.corrcoef(rotated, _KS_MAJOR_NORM)[0, 1])
        minor_r = float(np.corrcoef(rotated, _KS_MINOR_NORM)[0, 1])

        if major_r > best_score:
            best_score = major_r
            best_label = f"{_NOTE_NAMES[root]} Major"
        if minor_r > best_score:
            best_score = minor_r
            best_label = f"{_NOTE_NAMES[root]} Minor"

    return best_label


@router.post("/api/analyze-audio")
async def analyze_audio(file: UploadFile) -> dict[str, object]:
    try:
        import librosa
        from pydub import AudioSegment
        from pydub.utils import which

        # Ensure ffmpeg is on PATH even when the server is launched outside a brew shell
        if not which("ffmpeg"):
            os.environ["PATH"] += ":/opt/homebrew/bin:/usr/local/bin"

        raw_bytes = await file.read()

        # pydub auto-detects format (webm, ogg, mp4, wav, etc.)
        # and converts to a standard PCM representation via ffmpeg.
        audio_seg = AudioSegment.from_file(io.BytesIO(raw_bytes))
        audio_seg = audio_seg.set_channels(1).set_frame_rate(22050).set_sample_width(2)

        wav_buf = io.BytesIO()
        audio_seg.export(wav_buf, format="wav")
        wav_buf.seek(0)

        y, sr = librosa.load(wav_buf, sr=22050, mono=True)

        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(np.atleast_1d(tempo)[0]))

        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        key = _detect_key(chroma)

        return {"bpm": bpm, "key": key}

    except Exception as exc:  # noqa: BLE001
        return {"bpm": 90, "key": "C Major", "error": str(exc)}
