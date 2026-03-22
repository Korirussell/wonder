from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    pass


@dataclass
class ReferenceFeatures:
    pitch_hz: float | None = None
    pitch_region: str | None = None      # "low", "mid", "high"
    intensity_label: str | None = None
    brightness: str | None = None        # "bright", "dark"
    duration_seconds: float | None = None
    extra: dict = field(default_factory=dict)


def extract_reference_features(path: Path) -> ReferenceFeatures:
    """
    Extract timbral and tonal features from a reference audio file.

    Uses librosa for analysis (optional dep). Falls back to soundfile
    for basic loading if soundsplit is not installed.
    """
    audio_mono, sr = _load_mono(path)
    features = ReferenceFeatures()

    duration = audio_mono.shape[0] / sr
    features.duration_seconds = duration

    # RMS → intensity label
    rms = float(np.sqrt(np.mean(audio_mono ** 2)))
    features.intensity_label = _rms_to_intensity_label(rms)

    try:
        import librosa

        # Spectral centroid → pitch region
        centroid = librosa.feature.spectral_centroid(y=audio_mono, sr=sr)
        mean_centroid = float(np.mean(centroid))
        if mean_centroid < 300:
            features.pitch_region = "low"
        elif mean_centroid < 2000:
            features.pitch_region = "mid"
        else:
            features.pitch_region = "high"

        # Spectral rolloff → brightness
        rolloff = librosa.feature.spectral_rolloff(y=audio_mono, sr=sr, roll_percent=0.85)
        mean_rolloff = float(np.mean(rolloff))
        features.brightness = "bright" if mean_rolloff > 4000 else "dark"

        # pyin pitch tracking → fundamental Hz
        try:
            f0, voiced_flag, _ = librosa.pyin(
                audio_mono,
                fmin=librosa.note_to_hz("C2"),
                fmax=librosa.note_to_hz("C7"),
                sr=sr,
            )
            voiced_f0 = f0[voiced_flag] if f0 is not None else np.array([])
            if len(voiced_f0) > 0:
                features.pitch_hz = float(np.median(voiced_f0))
        except Exception:
            pass

    except ImportError:
        # librosa not installed — skip spectral analysis
        pass

    return features


def merge_features_into_params(
    params,  # SoundParams — avoid circular import
    features: ReferenceFeatures,
) -> None:
    """
    Fill gaps in SoundParams with extracted reference features.
    User-set values always win (not overwritten).
    """
    if params.pitch_hz is None and features.pitch_hz is not None:
        params.pitch_hz = features.pitch_hz

    if params.pitch is None and features.pitch_region is not None:
        params.pitch = features.pitch_region

    if params.intensity_label is None and features.intensity_label is not None:
        params.intensity_label = features.intensity_label  # type: ignore[assignment]

    if params.duration_seconds is None and features.duration_seconds is not None:
        params.duration_seconds = features.duration_seconds

    # Inject brightness as timbre hint if not already set
    if features.brightness and features.brightness not in (params.timbre or []):
        if not params.timbre:
            params.timbre = [features.brightness]  # type: ignore[list-item]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_mono(path: Path) -> tuple[np.ndarray, int]:
    """Load audio as mono float32 array."""
    try:
        # Prefer soundsplit's loader (supports more formats)
        from soundsplit._audio import load_audio, to_mono
        audio, sr = load_audio(path, mono=False)
        return to_mono(audio), sr
    except ImportError:
        pass

    try:
        import soundfile as sf
        data, sr = sf.read(str(path), always_2d=True)
        audio = data.T.astype(np.float32)
        mono = audio.mean(axis=0) if audio.ndim > 1 else audio
        return mono, sr
    except Exception as e:
        raise ImportError(
            "Could not load reference audio. Install soundfile: pip install soundfile"
        ) from e


def _rms_to_intensity_label(rms: float) -> str:
    if rms < 0.02:
        return "quiet"
    elif rms < 0.08:
        return "soft"
    elif rms < 0.20:
        return "medium"
    elif rms < 0.50:
        return "loud"
    else:
        return "very loud"
