"""
Sound generation tools for Wonder ADK agent.

Calls server handlers directly (same process) — no HTTP round-trip.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any


async def generate_sound(
    description: str,
    category: str | None = None,
    pitch: str | None = None,
    duration_seconds: float | None = None,
    reverb: str | None = None,
    intensity_label: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Generate a custom sound effect via ElevenLabs from a text description.

    Returns {prompt_used, output_path, duration_seconds, size_bytes}.
    Requires an ElevenLabs API key — ask the user if not yet provided.

    Args:
        description: Natural language description of the sound (e.g. "punchy 808 kick with long tail").
        category: Sound category: nature, percussion, ambient, mechanical, foley,
                  electronic, animal, human, musical, weather.
        pitch: Pitch hint: "low", "mid", or "high".
        duration_seconds: Target duration in seconds.
        reverb: Reverb preset: "none", "small room", "hall", "cave", "plate", "spring".
        intensity_label: Intensity: "quiet", "soft", "medium", "loud", "very loud".
        api_key: ElevenLabs API key. If None, reads from ELEVENLABS_API_KEY env var.
    """
    try:
        from server._handlers import handle_generate

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: handle_generate(
                description,
                category=category,
                pitch=pitch,
                duration_seconds=duration_seconds,
                reverb=reverb,
                intensity_label=intensity_label,
                api_key=api_key,
            ),
        )
    except Exception as exc:
        return {"error": str(exc), "success": False}


async def split_and_generate_sound(
    file_path: str,
    description: str = "",
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Analyse a reference audio file's timbral features, then generate a new sound
    with similar characteristics via ElevenLabs.

    Returns {prompt_used, output_path, duration_seconds, size_bytes}.
    Useful for "make something that sounds like this but different" requests.

    Args:
        file_path: Absolute path to the reference audio file on the server.
        description: Optional extra description to guide generation.
        api_key: ElevenLabs API key. If None, reads from ELEVENLABS_API_KEY env var.
    """
    p = Path(file_path)
    if not p.exists():
        return {"error": f"File not found: {file_path}", "success": False}

    try:
        from server._handlers import handle_split_and_generate

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: handle_split_and_generate(p, description, api_key=api_key),
        )
    except Exception as exc:
        return {"error": str(exc), "success": False}
