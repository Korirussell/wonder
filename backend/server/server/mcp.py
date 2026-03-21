"""
MCP server (FastMCP).

Run:
    server-mcp
    # or
    python -m server.mcp
"""
from __future__ import annotations

import json
from pathlib import Path

from mcp.server.fastmcp import FastMCP

from ._handlers import handle_generate, handle_split, handle_split_and_generate

mcp = FastMCP("WonderServer", json_response=True)


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def split_audio(
    path: str,
    input_type: str = "auto",
    stems: bool = False,
    midi: bool = True,
    beat_grid: bool = True,
    key: bool = True,
    denoise: bool = True,
    normalize: bool = True,
) -> str:
    """
    Split an audio file into DAW-ready components.

    Analyses the file at `path` and returns a JSON string containing:
    - input_type: detected signal type ("hum", "beatbox", "music", …)
    - bpm, time_signature, key
    - beat_times, downbeat_times
    - midi_path / hum_midi_path / beatbox_midi_path: absolute paths to MIDI files
    - stem_paths: dict of stem name → absolute WAV path (if stems=True)
    - hum.f0_times / f0_hz / f0_confidence: raw pitch contour for hums

    Parameters
    ----------
    path:        Absolute path to the audio file.
    input_type:  "auto" (default) or one of: music, hum, whistle, beatbox, vocal_melody.
    stems:       Separate into demucs stems (slow — ~1.5× realtime on CPU).
    midi:        Transcribe full mix to MIDI (music/vocal_melody only).
    beat_grid:   Detect BPM and beat timestamps.
    key:         Detect musical key.
    denoise:     Apply spectral noise reduction before analysis.
    normalize:   RMS-normalize to –20 dBFS before analysis.
    """
    audio_path = Path(path)
    if not audio_path.exists():
        return json.dumps({"error": f"File not found: {path}"})

    try:
        result = handle_split(
            audio_path,
            input_type=input_type,
            stems=stems,
            midi=midi,
            beat_grid=beat_grid,
            key=key,
            denoise=denoise,
            normalize=normalize,
        )
        return json.dumps(result, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.tool()
def generate_sound(
    description: str,
    category: str | None = None,
    pitch: str | None = None,
    duration_seconds: float | None = None,
    reverb: str | None = None,
    intensity_label: str | None = None,
    api_key: str | None = None,
) -> str:
    """
    Generate a sound effect via the ElevenLabs API.

    Returns a JSON string with:
    - prompt_used: the final prompt sent to ElevenLabs
    - output_path: absolute path to the generated MP3
    - duration_seconds, size_bytes

    Parameters
    ----------
    description:       Natural language description (e.g. "a deep metallic thud").
    category:          Sound category hint: nature, percussion, ambient, mechanical,
                       foley, electronic, animal, human, musical, weather.
    pitch:             Pitch hint: "low", "mid", "high", or a note like "C4".
    duration_seconds:  Target duration 0.5–22.0 s. None = model decides.
    reverb:            none | small room | hall | cave | plate | spring.
    intensity_label:   quiet | soft | medium | loud | very loud.
    api_key:           ElevenLabs API key. Falls back to ELEVENLABS_API_KEY env var.
    """
    try:
        result = handle_generate(
            description,
            category=category,
            pitch=pitch,
            duration_seconds=duration_seconds,
            reverb=reverb,
            intensity_label=intensity_label,
            api_key=api_key,
        )
        return json.dumps(result, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.tool()
def split_and_generate(
    path: str,
    description: str = "",
    api_key: str | None = None,
) -> str:
    """
    Analyse a reference audio file's tonal/timbral character, then generate
    a new sound effect via ElevenLabs that shares those qualities.

    Useful for: "make something that sounds like this but different".

    Returns a JSON string with the generated file's output_path and prompt_used.

    Parameters
    ----------
    path:        Absolute path to the reference audio file.
    description: Optional extra description to blend in (e.g. "but more metallic").
    api_key:     ElevenLabs API key. Falls back to ELEVENLABS_API_KEY env var.
    """
    audio_path = Path(path)
    if not audio_path.exists():
        return json.dumps({"error": f"File not found: {path}"})

    try:
        result = handle_split_and_generate(audio_path, description, api_key=api_key)
        return json.dumps(result, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
