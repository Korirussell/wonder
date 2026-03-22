"""
Audio transcription and MIDI retrieval tools for Wonder ADK agent.

Both tools call the Python REST server at PYTHON_API_URL (default localhost:8000).
"""
from __future__ import annotations

import os

import httpx

PYTHON_API_URL = os.getenv("PYTHON_API_URL", "http://localhost:8000")


async def transcribe_audio(
    audio_data: str,
    input_format: str = "webm",
    tempo_bpm: float = 120.0,
    pitch_correction_strength: float = 0.7,
) -> dict:
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
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{PYTHON_API_URL}/transcribe",
                json={
                    "audio_data": audio_data,
                    "input_format": input_format,
                    "tempo_bpm": tempo_bpm,
                    "pitch_correction_strength": pitch_correction_strength,
                },
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}: {exc.response.text}", "success": False}
    except Exception as exc:
        return {"error": str(exc), "success": False}


async def load_midi_notes(midi_id: str) -> dict:
    """
    Retrieve MIDI notes for a previously transcribed audio file by its midi_id.

    Returns {notes, note_count, midi_id, tempo_bpm}.
    Notes format: [{pitch, start_time, duration, velocity, mute}].
    Call this after transcribe_audio when you need the actual notes array.

    Args:
        midi_id: The ID returned by a prior transcribe_audio call.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{PYTHON_API_URL}/midi/{midi_id}")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}: {exc.response.text}", "success": False}
    except Exception as exc:
        return {"error": str(exc), "success": False}
