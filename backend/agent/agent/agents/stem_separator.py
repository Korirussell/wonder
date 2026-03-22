"""
Stem separator sub-agent: splits audio into stems and loads them into Ableton.

Calls server._handlers.handle_split directly (same process — no HTTP).
Runs Demucs — typically 30–60 seconds on CPU.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from google.adk.agents import Agent

from ..logging_config import get_logger
from ..tools.ableton import (
    create_audio_track,
    get_session_info,
    load_sample_by_path,
    set_tempo,
    set_track_name,
)

logger = get_logger("wonder.stem_separator")


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
    p = Path(file_path)
    if not p.exists():
        return {"error": f"File not found: {file_path}", "success": False}

    logger.info("split_audio  %s  stems=%s  midi=%s", p.name, stems, midi)
    try:
        from server._handlers import handle_split

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: handle_split(
                p,
                stems=stems,
                midi=midi,
                beat_grid=beat_grid,
                key=key,
            ),
        )
        logger.info(
            "split_audio done  bpm=%s  key=%s  stems=%s",
            result.get("bpm"),
            result.get("key"),
            list(result.get("stem_paths", {}).keys()),
        )
        return result
    except Exception as exc:
        logger.error("split_audio failed: %s", exc, exc_info=True)
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
