"""
Sound generation tools for Wonder ADK agent.

Both tools call the Python REST server at PYTHON_API_URL (default localhost:8000),
which wraps the ElevenLabs sound generation API.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

PYTHON_API_URL = os.getenv("PYTHON_API_URL", "http://localhost:8000")


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

    Returns {prompt_used, output_path, output_path_url, duration_seconds, size_bytes}.
    Requires an ElevenLabs API key — ask the user if not yet provided.

    Args:
        description: Natural language description of the sound (e.g. "punchy 808 kick with long tail").
        category: Sound category: nature, percussion, ambient, mechanical, foley,
                  electronic, animal, human, musical, weather.
        pitch: Pitch hint: "low", "mid", or "high".
        duration_seconds: Target duration in seconds.
        reverb: Reverb preset: "none", "small", "medium", "large", or "huge".
        intensity_label: Intensity: "soft", "medium", or "loud".
        api_key: ElevenLabs API key. If None, the server reads from its env.
    """
    body: dict[str, Any] = {"description": description}
    if category is not None:
        body["category"] = category
    if pitch is not None:
        body["pitch"] = pitch
    if duration_seconds is not None:
        body["duration_seconds"] = duration_seconds
    if reverb is not None:
        body["reverb"] = reverb
    if intensity_label is not None:
        body["intensity_label"] = intensity_label
    if api_key is not None:
        body["api_key"] = api_key

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{PYTHON_API_URL}/generate", json=body)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}: {exc.response.text}", "success": False}
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

    Returns {prompt_used, output_path, output_path_url}.
    Useful for "make something that sounds like this but different" requests.

    Args:
        file_path: Absolute path to the reference audio file on the server.
        description: Optional extra description to guide generation.
        api_key: ElevenLabs API key. If None, the server reads from its env.
    """
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            with open(file_path, "rb") as f:
                data: dict[str, Any] = {"description": description}
                if api_key is not None:
                    data["api_key"] = api_key
                resp = await client.post(
                    f"{PYTHON_API_URL}/split-and-generate",
                    files={"file": f},
                    data=data,
                )
            resp.raise_for_status()
            return resp.json()
    except FileNotFoundError:
        return {"error": f"File not found: {file_path}", "success": False}
    except httpx.HTTPStatusError as exc:
        return {"error": f"HTTP {exc.response.status_code}: {exc.response.text}", "success": False}
    except Exception as exc:
        return {"error": str(exc), "success": False}
