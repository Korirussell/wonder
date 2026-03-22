"""
Stem separator sub-agent: splits audio into stems and loads them into Ableton.

Runs Demucs via the REST server — typically 30–60 seconds on CPU.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

from google.adk.agents import Agent

from ..tools.ableton import (
    create_audio_track,
    get_session_info,
    load_sample_by_path,
    set_tempo,
    set_track_name,
)

PYTHON_API_URL = os.getenv("PYTHON_API_URL", "http://localhost:8000")


async def split_audio(
    file_path: str,
    stems: bool = True,
    midi: bool = True,
    beat_grid: bool = True,
    key: bool = True,
) -> dict[str, Any]:
    """
    Split an audio file into DAW components via Demucs.

    Returns BPM, key, stem_paths (vocals/drums/bass/other), midi_path, beat_times.
    WARNING: This takes 30-60 seconds on CPU. Inform the user before calling.

    Args:
        file_path: Absolute server path to the audio file.
        stems: Whether to run Demucs stem separation.
        midi: Whether to extract MIDI from melodic content.
        beat_grid: Whether to extract beat grid / downbeats.
        key: Whether to detect musical key.
    """
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            with open(file_path, "rb") as f:
                resp = await client.post(
                    f"{PYTHON_API_URL}/split",
                    files={"file": f},
                    data={
                        "stems": str(stems).lower(),
                        "midi": str(midi).lower(),
                        "beat_grid": str(beat_grid).lower(),
                        "key": str(key).lower(),
                    },
                )
            resp.raise_for_status()
            return resp.json()
    except FileNotFoundError:
        return {"error": f"File not found: {file_path}", "success": False}
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}: {exc.response.text}", "success": False}
    except Exception as exc:
        return {"error": str(exc), "success": False}


stem_separator_agent = Agent(
    model="gemini-2.5-flash",
    name="stem_separator_agent",
    description=(
        "Separate audio into stems (drums, bass, vocals, other) using Demucs, "
        "then load them into Ableton as audio tracks. "
        "Use for remix, sampling, or audio analysis workflows. "
        "Takes 30-60 seconds — inform the user before starting."
    ),
    instruction=(
        "You specialise in audio analysis and stem separation.\n\n"
        "IMPORTANT: Stem separation takes 30-60 seconds on CPU. "
        "Always tell the user this before calling split_audio.\n\n"
        "Workflow:\n"
        "1. Call get_session_info to confirm the current session\n"
        "2. Call split_audio with the provided file path and stems=True\n"
        "3. Report detected BPM and key\n"
        "4. Call set_tempo with the detected BPM\n"
        "5. For each stem path in the result, call create_audio_track then load_sample_by_path\n"
        "6. Name tracks: 'Drums (Stem)', 'Bass (Stem)', 'Vocals (Stem)', 'Other (Stem)'\n"
        "7. Summarise: what was found, what was loaded, key and tempo."
    ),
    tools=[split_audio, get_session_info, set_tempo, create_audio_track, load_sample_by_path, set_track_name],
)
