"""
Audio transcription and MIDI retrieval tools for Wonder ADK agent.

Calls server handlers directly (same process) — no HTTP round-trip.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from ..logging_config import get_logger

logger = get_logger("wonder.audio")


async def transcribe_audio(
    audio_data: str,
    input_format: str = "webm",
    tempo_bpm: float = 120.0,
    pitch_correction_strength: float = 0.7,
) -> dict[str, Any]:
    """
    Convert base64-encoded audio (WebM or WAV) to MIDI notes using Spotify basic-pitch.

    Returns {notes, note_count, midi_id, suggested_clip_length, tempo_bpm}.
    Use when the user hums, sings, whistles, or beatboxes a melody.
    After calling this, use load_midi_notes with the returned midi_id to get the full
    notes array, then create a clip and call add_notes_to_clip.

    Args:
        audio_data: Base64-encoded audio bytes.
        input_format: "webm" or "wav".
        tempo_bpm: Reference BPM for beat-relative timing.
        pitch_correction_strength: 0–1 float; higher = more pitch correction.
    """
    logger.info("transcribe_audio  fmt=%s  tempo=%.0f  size=%d chars", input_format, tempo_bpm, len(audio_data))
    t0 = time.perf_counter()
    try:
        from server.utils.audio_to_midi import transcribe_audio_base64

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: transcribe_audio_base64(
                audio_data,
                input_format,
                tempo_bpm,
                0.5,   # onset_threshold default
                0.3,   # frame_threshold default
                pitch_correction_strength,
            ),
        )
        logger.info(
            "transcribe_audio done  notes=%s  midi_id=%s  %.1fs",
            result.get("note_count", "?"),
            result.get("midi_id", "?"),
            time.perf_counter() - t0,
        )
        return result
    except Exception as exc:
        logger.error("transcribe_audio failed: %s", exc, exc_info=True)
        return {"error": str(exc), "success": False}


async def load_midi_notes(midi_id: str) -> dict[str, Any]:
    """
    Retrieve MIDI notes for a previously transcribed audio file by its midi_id.

    Returns {notes, note_count, midi_id, tempo_bpm}.
    Notes format: [{pitch, start_time, duration, velocity, mute}].
    Call this after transcribe_audio when you need the actual notes array.

    Args:
        midi_id: The ID returned by a prior transcribe_audio call.
    """
    logger.info("load_midi_notes  midi_id=%s", midi_id)
    try:
        from server.utils.audio_to_midi import get_midi_file_path, parse_midi_file_to_notes

        midi_path = get_midi_file_path(midi_id)
        if not midi_path:
            return {"error": f"MIDI not found: {midi_id}", "success": False}

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, lambda: parse_midi_file_to_notes(midi_path))
        logger.info("load_midi_notes done  notes=%s", result.get("note_count", "?"))
        return result
    except Exception as exc:
        logger.error("load_midi_notes failed: %s", exc, exc_info=True)
        return {"error": str(exc), "success": False}
