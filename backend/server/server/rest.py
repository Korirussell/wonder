"""
FastAPI REST server.

Run:
    uvicorn server.rest:app --reload
    # or
    server-rest
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Annotated, Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ._handlers import OUTPUT_ROOT, handle_generate, handle_split, handle_split_and_generate

app = FastAPI(
    title="Wonder Server",
    description="Split audio into DAW components and generate sounds via ElevenLabs.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve all output files under /files/
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(OUTPUT_ROOT)), name="files")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# /split
# ---------------------------------------------------------------------------

@app.post("/split")
async def split_audio(
    file: Annotated[UploadFile, File(description="Audio file (WAV, FLAC, M4A, MP3, AIFC…)")],
    input_type: Annotated[str, Form()] = "auto",
    stems: Annotated[bool, Form()] = False,
    midi: Annotated[bool, Form()] = True,
    beat_grid: Annotated[bool, Form()] = True,
    key: Annotated[bool, Form()] = True,
    denoise: Annotated[bool, Form()] = True,
    normalize: Annotated[bool, Form()] = True,
) -> dict[str, Any]:
    """
    Upload an audio file and split it into DAW-ready components.

    Returns detected type, BPM, key, MIDI paths, stem paths, and F0 contour
    (for hums). File paths are also accessible via /files/<session>/<name>.
    """
    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        result = handle_split(
            tmp_path,
            input_type=input_type,
            stems=stems,
            midi=midi,
            beat_grid=beat_grid,
            key=key,
            denoise=denoise,
            normalize=normalize,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    # Convert absolute paths → /files/-relative URLs for easy download
    result = _absolutize_to_urls(result)
    return result


# ---------------------------------------------------------------------------
# /generate
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    description: str = ""
    category: str | None = None
    pitch: str | None = None
    duration_seconds: float | None = None
    reverb: str | None = None
    intensity_label: str | None = None
    api_key: str | None = None


@app.post("/generate")
async def generate_sound(body: GenerateRequest) -> dict[str, Any]:
    """
    Generate a sound effect via ElevenLabs from a natural language description
    or structured parameters.
    """
    try:
        result = handle_generate(
            body.description,
            category=body.category,
            pitch=body.pitch,
            duration_seconds=body.duration_seconds,
            reverb=body.reverb,
            intensity_label=body.intensity_label,
            api_key=body.api_key,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _absolutize_to_urls(result)


# ---------------------------------------------------------------------------
# /split-and-generate
# ---------------------------------------------------------------------------

@app.post("/split-and-generate")
async def split_and_generate(
    file: Annotated[UploadFile, File(description="Reference audio file")],
    description: Annotated[str, Form()] = "",
    api_key: Annotated[str | None, Form()] = None,
) -> dict[str, Any]:
    """
    Analyse an uploaded audio file's tonal/timbral features, then use them
    to generate a new sound effect via ElevenLabs.
    """
    suffix = Path(file.filename or "audio").suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        result = handle_split_and_generate(tmp_path, description, api_key=api_key)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    return _absolutize_to_urls(result)


# ---------------------------------------------------------------------------
# /download — explicit file download by absolute path
# ---------------------------------------------------------------------------

@app.get("/download")
def download_file(path: str) -> FileResponse:
    """Download any output file by its absolute server path."""
    p = Path(path)
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    # Safety: only serve files inside OUTPUT_ROOT
    try:
        p.relative_to(OUTPUT_ROOT)
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    return FileResponse(str(p), filename=p.name)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _absolutize_to_urls(data: dict[str, Any]) -> dict[str, Any]:
    """
    Replace absolute output paths with /files/-relative URLs so the client
    can download them directly.
    """
    url_keys = ("midi_path", "hum_midi_path", "beatbox_midi_path", "output_path")
    for key in url_keys:
        if key in data and data[key]:
            try:
                rel = Path(data[key]).relative_to(OUTPUT_ROOT)
                data[f"{key}_url"] = f"/files/{rel}"
            except ValueError:
                pass  # path outside OUTPUT_ROOT, leave as-is

    if "stem_paths" in data:
        data["stem_path_urls"] = {}
        for stem, abs_path in (data.get("stem_paths") or {}).items():
            try:
                rel = Path(abs_path).relative_to(OUTPUT_ROOT)
                data["stem_path_urls"][stem] = f"/files/{rel}"
            except ValueError:
                pass

    return data


def main() -> None:
    import uvicorn
    uvicorn.run("server.rest:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
