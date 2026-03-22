from __future__ import annotations

import numpy as np

_PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles (1990)
_MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


def detect_key(audio_mono: np.ndarray, sr: int) -> str:
    """
    Detect the musical key of a mono audio signal.

    Uses the Krumhansl-Schmuckler algorithm: computes a chroma vector via CQT,
    then correlates it against all 24 major/minor key profiles.

    Returns a string like "A minor" or "C major".
    """
    import librosa

    chroma = librosa.feature.chroma_cqt(y=audio_mono, sr=sr)
    mean_chroma = chroma.mean(axis=1)  # (12,)

    best_score = -np.inf
    best_root = 0
    best_mode = "major"

    for root in range(12):
        rotated = np.roll(mean_chroma, -root)
        for profile, mode in ((_MAJOR_PROFILE, "major"), (_MINOR_PROFILE, "minor")):
            score = float(np.corrcoef(rotated, profile)[0, 1])
            if score > best_score:
                best_score = score
                best_root = root
                best_mode = mode

    return f"{_PITCH_NAMES[best_root]} {best_mode}"


def key_to_midi_root(key: str) -> int:
    """
    Convert a key string like "A minor" to a MIDI root pitch class (0=C … 11=B).
    Useful for DAW/session integrations that take an integer root.
    """
    root_name = key.split()[0]
    return _PITCH_NAMES.index(root_name)
