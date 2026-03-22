"""
Session State Tracker and Music Validator for Wonder.

Python port of sessionState.ts and musicValidator.ts — tracks DAW state
across tool calls and validates MIDI notes against music theory rules.
"""
from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field
from typing import Any

SCALES: dict[str, list[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
    "melodic minor": [0, 2, 3, 5, 7, 9, 11],
    "pentatonic major": [0, 2, 4, 7, 9],
    "pentatonic minor": [0, 3, 5, 7, 10],
    "blues": [0, 3, 5, 6, 7, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
}

NOTE_MAP: dict[str, int] = {
    "C": 0, "C#": 1, "Db": 1,
    "D": 2, "D#": 3, "Eb": 3,
    "E": 4,
    "F": 5, "F#": 6, "Gb": 6,
    "G": 7, "G#": 8, "Ab": 8,
    "A": 9, "A#": 10, "Bb": 10,
    "B": 11,
}

KEY_MAP: list[str] = [
    "C", "Db", "D", "Eb", "E", "F",
    "Gb", "G", "Ab", "A", "Bb", "B",
]


@dataclass
class TrackState:
    """Lightweight representation of a single DAW track."""

    index: int
    name: str = ""
    track_type: str = "midi"
    has_instrument: bool = False
    instrument: str | None = None
    clips: list[dict[str, Any]] = field(default_factory=list)
    volume: float = 0.85
    muted: bool = False


@dataclass
class WonderSessionState:
    """Full snapshot of the Wonder DAW session."""

    bpm: float = 120.0
    key: str = "C"
    scale: str = "major"
    time_signature_numerator: int = 4
    time_signature_denominator: int = 4
    swing: float = 0.0
    tracks: list[TrackState] = field(default_factory=list)
    is_playing: bool = False


def create_initial_state() -> WonderSessionState:
    """Create a fresh session state with default values."""
    return WonderSessionState()


def update_state_after_tool(
    tool_name: str,
    result: dict[str, Any],
    state: WonderSessionState,
) -> WonderSessionState:
    """
    Mutate *state* in-place based on a completed tool call.

    Handled tool names:
        set_tempo, set_swing_amount, create_midi_track, create_audio_track,
        set_track_name, set_track_mute, load_browser_item, load_plugin_by_name,
        create_clip, add_notes_to_clip, create_wonder_session,
        generate_drum_pattern, generate_bassline, get_session_info.

    The *result* dict should contain the tool's params/result payload.
    Returns the (mutated) state for convenience.
    """
    if tool_name == "set_tempo":
        tempo = result.get("tempo")
        if tempo is not None:
            state.bpm = float(tempo)

    elif tool_name == "set_swing_amount":
        amount = result.get("amount")
        if amount is not None:
            state.swing = float(amount)

    elif tool_name in ("create_midi_track", "create_audio_track"):
        idx = result.get("index")
        if idx is not None:
            track_type = "midi" if tool_name == "create_midi_track" else "audio"
            state.tracks.append(
                TrackState(
                    index=int(idx),
                    name=f"Track {idx}",
                    track_type=track_type,
                )
            )

    elif tool_name == "set_track_name":
        track_index = result.get("track_index")
        name = result.get("name")
        if track_index is not None and name is not None:
            track = _find_track(state, int(track_index))
            if track is not None:
                track.name = str(name)

    elif tool_name == "set_track_mute":
        track_index = result.get("track_index")
        mute = result.get("mute")
        if track_index is not None and mute is not None:
            track = _find_track(state, int(track_index))
            if track is not None:
                track.muted = bool(mute)

    elif tool_name in ("load_browser_item", "load_plugin_by_name"):
        track_index = result.get("track_index")
        if track_index is not None:
            track = _find_track(state, int(track_index))
            if track is not None:
                track.instrument = str(
                    result.get("item_uri")
                    or result.get("plugin_name")
                    or "Unknown"
                )
                track.has_instrument = True

    elif tool_name == "create_clip":
        track_index = result.get("track_index")
        if track_index is not None:
            track = _find_track(state, int(track_index))
            if track is not None:
                track.clips.append(
                    {
                        "index": result.get("clip_index"),
                        "length": result.get("length"),
                        "notes": [],
                        "notes_count": 0,
                    }
                )

    elif tool_name == "add_notes_to_clip":
        track_index = result.get("track_index")
        clip_index = result.get("clip_index")
        notes = result.get("notes")
        if track_index is not None and clip_index is not None:
            track = _find_track(state, int(track_index))
            if track is not None:
                clip = _find_clip(track, clip_index)
                if clip is not None and notes is not None:
                    clip["notes"] = notes
                    clip["notes_count"] = len(notes)

    elif tool_name == "create_wonder_session":
        if result.get("bpm") is not None:
            state.bpm = float(result["bpm"])
        if result.get("swing") is not None:
            state.swing = float(result["swing"])
        key_root = result.get("key_root")
        scale = result.get("scale")
        if key_root is not None and scale is not None:
            state.key = KEY_MAP[int(key_root) % 12]
            state.scale = str(scale)

    elif tool_name in ("generate_drum_pattern", "generate_bassline"):
        track_index = result.get("track_index")
        clip_index = result.get("clip_index")
        if track_index is not None and clip_index is not None:
            track = _find_track(state, int(track_index))
            if track is not None:
                clip = _find_clip(track, clip_index)
                if clip is not None:
                    clip["pattern_type"] = (
                        result.get("style")
                        or result.get("root")
                        or "generated"
                    )

    elif tool_name == "get_session_info":
        if result.get("bpm") is not None:
            state.bpm = float(result["bpm"])
        if result.get("is_playing") is not None:
            state.is_playing = bool(result["is_playing"])

    return state


def validate_notes(
    notes: list[dict[str, Any]],
    key: str = "C",
    scale: str = "major",
) -> list[str]:
    """
    Validate a list of MIDI note dicts.

    Each note dict is expected to contain:
        pitch      – int, MIDI pitch 0-127
        velocity   – int, MIDI velocity 0-127
        duration   – float, duration in beats (> 0)
        start_time – float, start time in beats (>= 0)
        mute       – bool (optional)

    Returns a list of warning/error strings (empty = all valid).
    Checks pitch range, velocity range, duration positivity, start_time
    non-negativity, and optional key/scale consistency.
    """
    warnings: list[str] = []

    root = NOTE_MAP.get(key)
    scale_intervals = SCALES.get(scale.lower()) if scale else None
    valid_pitch_classes: set[int] | None = None
    if root is not None and scale_intervals is not None:
        valid_pitch_classes = {(root + interval) % 12 for interval in scale_intervals}

    for i, note in enumerate(notes):
        pitch = note.get("pitch")
        velocity = note.get("velocity")
        duration = note.get("duration")
        start_time = note.get("start_time")

        if pitch is None:
            warnings.append(f"Note {i}: missing 'pitch' field")
        else:
            p = int(pitch)
            if not (0 <= p <= 127):
                warnings.append(f"Note {i}: pitch {pitch} is out of MIDI range (0-127)")
            elif valid_pitch_classes is not None and p % 12 not in valid_pitch_classes:
                warnings.append(f"Note {i}: pitch {pitch} is not in {key} {scale} scale")

        if velocity is None:
            warnings.append(f"Note {i}: missing 'velocity' field")
        elif not (0 <= int(velocity) <= 127):
            warnings.append(f"Note {i}: velocity {velocity} is out of range (0-127)")

        if duration is None:
            warnings.append(f"Note {i}: missing 'duration' field")
        elif float(duration) <= 0:
            warnings.append(f"Note {i}: duration {duration} must be greater than 0")

        if start_time is None:
            warnings.append(f"Note {i}: missing 'start_time' field")
        elif float(start_time) < 0:
            warnings.append(f"Note {i}: start_time {start_time} must be >= 0")

    return warnings


def serialize_state(state: WonderSessionState) -> str:
    """Serialize *state* to a compact JSON string for injection into prompts."""
    return json.dumps(dataclasses.asdict(state), indent=2)


def _find_track(state: WonderSessionState, index: int) -> TrackState | None:
    for track in state.tracks:
        if track.index == index:
            return track
    return None


def _find_clip(track: TrackState, clip_index: Any) -> dict[str, Any] | None:
    for clip in track.clips:
        if clip.get("index") == clip_index:
            return clip
    return None
