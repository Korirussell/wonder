"""
soundsplit — Split audio into DAW-ready components.

Basic usage::

    from soundsplit import split

    result = split("my_song.mp3", output_dir="./out")
    print(result.bpm, result.key)
    # stems in result.stems.vocals, result.stems.drums, ...
    # MIDI in result.midi_path
"""

from ._core import split
from ._types import SplitResult, StemPaths

__all__ = ["split", "SplitResult", "StemPaths"]
