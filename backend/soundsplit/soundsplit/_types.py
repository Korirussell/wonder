from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class StemPaths:
    vocals: Path | None = None
    drums: Path | None = None
    bass: Path | None = None
    guitar: Path | None = None
    piano: Path | None = None
    other: Path | None = None

    def as_dict(self) -> dict[str, Path]:
        return {k: v for k, v in vars(self).items() if v is not None}


@dataclass
class SplitResult:
    output_dir: Path
    source_file: Path | None = None
    duration_s: float | None = None

    # Tempo / rhythm
    bpm: float | None = None
    time_signature: str | None = None
    beat_times: list[float] = field(default_factory=list)
    downbeat_times: list[float] = field(default_factory=list)

    # Tonal
    key: str | None = None  # e.g. "A minor"

    # Audio
    stems: StemPaths | None = None

    # MIDI
    midi_path: Path | None = None          # full-song transcription
    stem_midi: dict[str, Path] = field(default_factory=dict)  # per-stem transcriptions

    def to_dict(self) -> dict:
        midi_available = list(self.stem_midi.keys())
        if self.midi_path:
            midi_available.insert(0, "full_song")
        return {
            "source_file": str(self.source_file) if self.source_file else None,
            "duration_s": self.duration_s,
            "bpm": self.bpm,
            "time_signature": self.time_signature,
            "beat_times": self.beat_times,
            "downbeat_times": self.downbeat_times,
            "key": self.key,
            "stems_available": list(self.stems.as_dict().keys()) if self.stems else [],
            "midi_available": midi_available,
        }
