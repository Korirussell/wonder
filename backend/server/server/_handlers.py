"""
Shared business logic used by both rest.py and mcp.py.

Both servers call these functions directly — no HTTP/MCP concerns here.
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import Any

# Output root: $SERVER_OUTPUT_DIR or /tmp/wonder_server
OUTPUT_ROOT = Path(os.environ.get("SERVER_OUTPUT_DIR", "/tmp/wonder_server"))


def _session_dir() -> Path:
    d = OUTPUT_ROOT / uuid.uuid4().hex
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# split
# ---------------------------------------------------------------------------

def handle_split(
    audio_path: Path,
    *,
    input_type: str = "auto",
    stems: bool = False,
    midi: bool = True,
    beat_grid: bool = True,
    key: bool = True,
    denoise: bool = True,
    normalize: bool = True,
) -> dict[str, Any]:
    """
    Run soundsplit on an audio file and return a JSON-serialisable dict.

    stems=False by default — demucs is slow and not always needed.
    Callers can opt in explicitly.
    """
    from soundsplit import split

    out_dir = _session_dir()

    result = split(
        audio_path,
        output_dir=out_dir,
        input_type=input_type,  # type: ignore[arg-type]
        stems=stems,
        midi=midi,
        per_stem_midi=False,
        beat_grid=beat_grid,
        key=key,
        denoise=denoise,
        normalize=normalize,
    )

    data = result.to_dict()

    # Attach absolute file paths so callers know where to find outputs
    data["output_dir"] = str(out_dir)
    if result.midi_path:
        data["midi_path"] = str(result.midi_path)
    if result.hum and result.hum.midi_path:
        data["hum_midi_path"] = str(result.hum.midi_path)
    if result.beatbox and result.beatbox.midi_path:
        data["beatbox_midi_path"] = str(result.beatbox.midi_path)
    if result.stems:
        data["stem_paths"] = {k: str(v) for k, v in result.stems.as_dict().items()}

    return data


# ---------------------------------------------------------------------------
# generate
# ---------------------------------------------------------------------------

def handle_generate(
    description: str,
    *,
    category: str | None = None,
    pitch: str | None = None,
    duration_seconds: float | None = None,
    reverb: str | None = None,
    intensity_label: str | None = None,
    reference_audio_path: Path | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Generate a sound effect via ElevenLabs and return a JSON-serialisable dict.
    """
    from soundgen import generate, SoundParams

    out_dir = _session_dir()
    out_file = out_dir / "generated.mp3"

    params = SoundParams(
        description=description or None,
        category=category,  # type: ignore[arg-type]
        pitch=pitch,
        duration_seconds=duration_seconds,
        reverb=reverb,  # type: ignore[arg-type]
        intensity_label=intensity_label,  # type: ignore[arg-type]
        reference_audio_path=reference_audio_path,
    )

    result = generate(params, api_key=api_key, save_to=out_file)

    return {
        "prompt_used": result.prompt_used,
        "duration_seconds": result.duration_seconds,
        "output_path": str(result.output_path),
        "output_dir": str(out_dir),
        "size_bytes": len(result.audio_bytes),
    }


# ---------------------------------------------------------------------------
# split + generate (combined pipeline)
# ---------------------------------------------------------------------------

def handle_split_and_generate(
    audio_path: Path,
    extra_description: str = "",
    *,
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Split an input sound to extract its tonal/timbral features, then use those
    features to generate a new sound effect via ElevenLabs.
    """
    from soundgen import generate, SoundParams

    out_dir = _session_dir()
    out_file = out_dir / "generated.mp3"

    params = SoundParams(
        description=extra_description or None,
        reference_audio_path=audio_path,
    )
    result = generate(params, api_key=api_key, save_to=out_file)

    return {
        "prompt_used": result.prompt_used,
        "duration_seconds": result.duration_seconds,
        "output_path": str(result.output_path),
        "output_dir": str(out_dir),
        "size_bytes": len(result.audio_bytes),
    }
