from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

InputType = Literal["music", "hum", "whistle", "beatbox", "vocal_melody"]


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
class HumResult:
    """Output for hum / whistle / vocal melody inputs."""
    midi_path: Path | None = None
    f0_times: list[float] = field(default_factory=list)
    f0_hz: list[float] = field(default_factory=list)
    f0_confidence: list[float] = field(default_factory=list)


@dataclass
class BeatboxResult:
    """Output for beatbox inputs."""
    midi_path: Path | None = None
    onset_times: list[float] = field(default_factory=list)
    onset_labels: list[str] = field(default_factory=list)  # "kick" | "snare" | "hihat"


@dataclass
class SplitResult:
    output_dir: Path
    source_file: Path | None = None
    duration_s: float | None = None

    # Detected input type
    input_type: InputType | None = None

    # Tempo / rhythm
    bpm: float | None = None
    time_signature: str | None = None
    beat_times: list[float] = field(default_factory=list)
    downbeat_times: list[float] = field(default_factory=list)

    # Tonal
    key: str | None = None  # e.g. "A minor"

    # Music: separated audio stems
    stems: StemPaths | None = None

    # Music: polyphonic MIDI transcription
    midi_path: Path | None = None
    stem_midi: dict[str, Path] = field(default_factory=dict)

    # Hum / whistle / vocal melody: monophonic pitch transcription
    hum: HumResult | None = None

    # Beatbox: onset-based drum MIDI
    beatbox: BeatboxResult | None = None

    def to_dict(self) -> dict:
        midi_available = list(self.stem_midi.keys())
        if self.midi_path:
            midi_available.insert(0, "full_song")
        d: dict = {
            "source_file": str(self.source_file) if self.source_file else None,
            "duration_s": self.duration_s,
            "input_type": self.input_type,
            "bpm": self.bpm,
            "time_signature": self.time_signature,
            "beat_times": self.beat_times,
            "downbeat_times": self.downbeat_times,
            "key": self.key,
            "stems_available": list(self.stems.as_dict().keys()) if self.stems else [],
            "midi_available": midi_available,
        }
        if self.hum:
            d["hum"] = {
                "midi_path": str(self.hum.midi_path) if self.hum.midi_path else None,
                "f0_times": self.hum.f0_times,
                "f0_hz": self.hum.f0_hz,
                "f0_confidence": self.hum.f0_confidence,
            }
        if self.beatbox:
            d["beatbox"] = {
                "midi_path": str(self.beatbox.midi_path) if self.beatbox.midi_path else None,
                "onset_times": self.beatbox.onset_times,
                "onset_labels": self.beatbox.onset_labels,
            }
        return d
