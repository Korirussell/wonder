from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

# Formats soundfile handles natively (libsndfile)
_SOUNDFILE_FORMATS = {".wav", ".flac", ".aif", ".aiff", ".aifc", ".au", ".snd", ".caf"}
# Formats that need a decoder; we try audioread first (uses Core Audio on macOS,
# no ffmpeg required), then fall back to pydub+ffmpeg.
_ENCODED_FORMATS = {".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wma"}


def load_audio(path: str | Path, mono: bool = False) -> tuple[np.ndarray, int]:
    """
    Load an audio file. Returns (audio, sample_rate).

    audio shape: (samples,) if mono=True, else (channels, samples).

    Format support:
      - WAV, FLAC, AIFF, AIFC, CAF     — soundfile (no extra deps)
      - M4A, AAC, MP3, OGG             — audioread (Core Audio on macOS, no ffmpeg)
                                          falls back to pydub+ffmpeg if audioread fails
    """
    path = Path(path)
    suffix = path.suffix.lower()

    if suffix in _SOUNDFILE_FORMATS:
        data, sr = sf.read(str(path), always_2d=True)
        audio = data.T.astype(np.float32)  # (channels, samples)
    elif suffix in _ENCODED_FORMATS:
        audio, sr = _load_via_audioread(path)
    else:
        # Unknown format: let soundfile try first, then audioread
        try:
            data, sr = sf.read(str(path), always_2d=True)
            audio = data.T.astype(np.float32)
        except Exception:
            audio, sr = _load_via_audioread(path)

    if mono:
        audio = to_mono(audio)

    return audio, sr


def _load_via_audioread(path: Path) -> tuple[np.ndarray, int]:
    """Decode compressed audio via audioread (Core Audio on macOS, no ffmpeg needed)."""
    try:
        import audioread
    except ImportError as e:
        raise ImportError("audioread is required for M4A/MP3/AAC files.") from e

    try:
        with audioread.audio_open(str(path)) as f:
            sr = f.samplerate
            n_channels = f.channels
            raw = b"".join(f)

        samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
        if n_channels > 1:
            audio = samples.reshape(-1, n_channels).T  # (channels, samples)
        else:
            audio = samples[np.newaxis, :]
        return audio, sr

    except Exception as e:
        # Last resort: pydub+ffmpeg
        return _load_via_pydub(path)


def _load_via_pydub(path: Path) -> tuple[np.ndarray, int]:
    try:
        from pydub import AudioSegment
    except ImportError as exc:
        raise ImportError(
            "Could not decode audio. Install ffmpeg: brew install ffmpeg"
        ) from exc

    seg = AudioSegment.from_file(str(path))
    sr = seg.frame_rate
    n_bits = seg.sample_width * 8
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
    samples /= 2 ** (n_bits - 1)

    if seg.channels > 1:
        audio = samples.reshape(-1, seg.channels).T
    else:
        audio = samples[np.newaxis, :]

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
