from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


SoundCategory = Literal[
    "nature", "percussion", "ambient", "mechanical", "foley",
    "electronic", "animal", "human", "musical", "weather",
]

Envelope = Literal["sharp", "soft", "punchy", "smooth", "click", "pluck"]

Timbre = Literal[
    "dark", "bright", "hollow", "metallic", "wooden", "warm",
    "cold", "rich", "thin", "resonant", "dry", "wet",
]


@dataclass
class SoundParams:
    # What kind of sound
    category: SoundCategory | None = None
    description: str | None = None

    # Tonal
    pitch: str | None = None          # "low", "mid", "high", or note like "C4"
    pitch_hz: float | None = None

    # Temporal
    duration_seconds: float | None = None   # 0.5–22.0
    attack: Envelope | None = None
    decay: str | None = None               # "fast fade", "abrupt", "long reverb tail"

    # Dynamics
    intensity: float | None = None          # 0.0–1.0
    intensity_label: Literal["quiet", "soft", "medium", "loud", "very loud"] | None = None

    # Timbre
    timbre: list[Timbre] = field(default_factory=list)
    texture: str | None = None             # "grainy", "clean", "layered"

    # Spatial
    reverb: Literal["none", "small room", "hall", "cave", "plate", "spring"] | None = None
    stereo_width: Literal["mono", "narrow", "wide"] | None = None

    # API
    prompt_influence: float = 0.5          # 0–1
    reference_audio_path: Path | None = None


@dataclass
class SoundRequest:
    """Resolved API-ready payload (loggable, cacheable, transportable)."""
    prompt: str
    duration_seconds: float | None = None
    prompt_influence: float = 0.5
    reference_features: dict = field(default_factory=dict)


@dataclass
class SoundResult:
    audio_bytes: bytes
    prompt_used: str
    duration_seconds: float | None = None
    output_path: Path | None = None
    params: SoundParams | None = None
    request: SoundRequest | None = None


class SoundGenAPIError(Exception):
    """Raised when the ElevenLabs API returns an error."""
