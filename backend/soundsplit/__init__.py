"""
soundsplit — Split audio into DAW-ready components.

Handles full music tracks and human-generated sounds (hums, whistles, beatboxing).

Basic usage::

    from soundsplit import split

    # Full music track
    result = split("song.mp3", output_dir="./out")

    # Human sound — auto-detected
    result = split("my_hum.wav", output_dir="./out")
    result = split("beatbox.wav", output_dir="./out")

    # Explicit type
    result = split("my_hum.wav", input_type="hum")

    print(result.bpm, result.key, result.input_type)
    # result.hum.midi_path      — for hums/whistles
    # result.beatbox.midi_path  — for beatbox
    # result.stems.vocals       — for music
"""

from ._core import split
from ._types import BeatboxResult, HumResult, InputType, SplitResult, StemPaths

__all__ = [
    "split",
    "SplitResult",
    "StemPaths",
    "HumResult",
    "BeatboxResult",
    "InputType",
]
