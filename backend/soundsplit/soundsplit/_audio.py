from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

_PYDUB_FORMATS = {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wma"}


def load_audio(path: str | Path, mono: bool = False) -> tuple[np.ndarray, int]:
    """
    Load an audio file. Returns (audio, sample_rate).

    audio shape: (samples,) if mono=True, else (channels, samples).
    Supports WAV/FLAC/AIFF natively via soundfile; MP3/AAC/OGG via pydub+ffmpeg.
    """
    path = Path(path)
    if path.suffix.lower() in _PYDUB_FORMATS:
        audio, sr = _load_via_pydub(path)
    else:
        data, sr = sf.read(str(path), always_2d=True)
        audio = data.T.astype(np.float32)  # (channels, samples)

    if mono:
        audio = to_mono(audio)

    return audio, sr


def _load_via_pydub(path: Path) -> tuple[np.ndarray, int]:
    try:
        from pydub import AudioSegment
    except ImportError as e:
        raise ImportError(
            "pydub is required to load MP3/AAC/OGG files. "
            "Install it with: pip install pydub\n"
            "Also ensure ffmpeg is installed: brew install ffmpeg"
        ) from e

    seg = AudioSegment.from_file(str(path))
    sr = seg.frame_rate
    n_bits = seg.sample_width * 8
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
    samples /= 2 ** (n_bits - 1)

    if seg.channels > 1:
        audio = samples.reshape(-1, seg.channels).T  # (channels, samples)
    else:
        audio = samples[np.newaxis, :]  # (1, samples)

    return audio, sr


def to_mono(audio: np.ndarray) -> np.ndarray:
    """Downmix to mono float32. Accepts (channels, samples) or (samples,)."""
    if audio.ndim == 1:
        return audio.astype(np.float32)
    return audio.mean(axis=0).astype(np.float32)


def write_wav(path: Path, audio: np.ndarray, sr: int, subtype: str = "PCM_24") -> None:
    """
    Write a WAV file at 24-bit PCM (DAW import standard).
    audio: (channels, samples) or (samples,).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    if audio.ndim > 1:
        data = audio.T  # soundfile expects (samples, channels)
    else:
        data = audio
    sf.write(str(path), data, sr, subtype=subtype)
