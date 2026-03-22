from __future__ import annotations

import numpy as np


def detect_tempo(
    audio_mono: np.ndarray,
    sr: int,
) -> tuple[float, list[float], list[float]]:
    """
    Detect tempo and beat positions from a mono audio signal.

    Returns:
        bpm: estimated tempo in beats-per-minute
        beat_times: beat timestamps in seconds
        downbeat_times: estimated downbeat timestamps (every 4th beat, assumes 4/4)
    """
    import librosa

    # beat_track returns (tempo, beat_frames) — tempo may be a 0-d or 1-d array
    tempo, beat_frames = librosa.beat.beat_track(y=audio_mono, sr=sr, units="frames")
    beat_times: list[float] = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    downbeat_times: list[float] = beat_times[::4]
    bpm = float(np.atleast_1d(tempo)[0])

    return bpm, beat_times, downbeat_times


def detect_time_signature(
    audio_mono: np.ndarray,  # noqa: ARG001
    sr: int,  # noqa: ARG001
    beat_times: list[float],  # noqa: ARG001
) -> str:
    """
    Heuristic time signature detection.

    Currently returns '4/4' always. A future version can use librosa's tempogram
    or onset autocorrelation to distinguish 3/4, 6/8, etc.
    """
    return "4/4"
