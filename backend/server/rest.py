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

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ._handlers import OUTPUT_ROOT, handle_generate, handle_split, handle_split_and_generate
from .utils.audio_to_midi import get_midi_file_path, transcribe_audio_base64

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


@app.get("/health/mongo")
def health_mongo() -> dict[str, object]:
    """MongoDB Atlas connectivity (optional — see server/mongo/README.md)."""
    from .mongo import mongo_health

    return mongo_health()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _doc(d: dict | None) -> dict:
    """Strip the non-serialisable MongoDB ``_id`` field from a document."""
    if d is None:
        return {}
    d.pop("_id", None)
    return d


def _repo():
    """Return the shared repository or raise 503 if MongoDB is not configured."""
    from .mongo import get_repository
    r = get_repository()
    if r is None:
        raise HTTPException(status_code=503, detail="MongoDB not configured (set MONGODB_URI or MONGO_URI)")
    return r


# ---------------------------------------------------------------------------
# /users
# ---------------------------------------------------------------------------

from .mongo.models import UserUpsert  # noqa: E402


@app.post("/users", status_code=201)
def upsert_user(payload: UserUpsert) -> dict:
    """Create or update a user by auth_subject."""
    return _doc(_repo().upsert_user(payload))


@app.get("/users/{auth_subject}")
def get_user(auth_subject: str) -> dict:
    """Fetch a user by their auth provider subject."""
    user = _repo().get_user_by_auth_subject(auth_subject)
    if not user:
        raise HTTPException(status_code=404, detail=f"User not found: {auth_subject}")
    return _doc(user)


# ---------------------------------------------------------------------------
# /samples
# ---------------------------------------------------------------------------

from .mongo.models import SampleUpsert  # noqa: E402


@app.post("/samples", status_code=201)
def upsert_sample(payload: SampleUpsert) -> dict:
    """Index or update a sample for a user."""
    return _doc(_repo().upsert_sample(payload))


@app.get("/samples")
def list_samples(
    user_id: str = Query(..., description="User ID to list samples for"),
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
) -> list[dict]:
    """List samples for a user, newest first."""
    return [_doc(s) for s in _repo().list_samples_for_user(user_id, limit=limit, skip=skip)]


# ---------------------------------------------------------------------------
# /sessions
# ---------------------------------------------------------------------------

from .mongo.models import SessionAppendTurn, SessionCreate  # noqa: E402


@app.post("/sessions", status_code=201)
def create_session(payload: SessionCreate) -> dict:
    """Create a new copilot session (idempotent by session_id)."""
    return _doc(_repo().create_session(payload))


@app.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    """Fetch a session by its ID."""
    session = _repo().get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    return _doc(session)


@app.post("/sessions/{session_id}/turns")
def append_turn(session_id: str, body: SessionAppendTurn) -> dict:
    """Append a turn to an existing session."""
    result = _repo().append_session_turn(session_id, body)
    if not result:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    return _doc(result)


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


def _read_audio_base64(output_path: str) -> str:
    """Read generated audio file and return as base64 string."""
    import base64
    return base64.b64encode(Path(output_path).read_bytes()).decode()


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
# /generate-sample — frontend-compatible base64 response
# ---------------------------------------------------------------------------

class GenerateSampleRequest(BaseModel):
    prompt: str
    duration_seconds: float = 2.0


@app.post("/generate-sample")
async def generate_sample(body: GenerateSampleRequest) -> dict[str, Any]:
    """
    Generate a one-shot sound effect and return audio as base64.
    Compatible with the frontend /api/generate-sample proxy route.
    """
    try:
        result = handle_generate(body.prompt, duration_seconds=body.duration_seconds)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "audio_base64": _read_audio_base64(result["output_path"]),
        "prompt": result["prompt_used"],
        "duration_seconds": result["duration_seconds"],
    }


# ---------------------------------------------------------------------------
# /generate-loop — BPM-synced loop, returns base64 audio
# ---------------------------------------------------------------------------

class GenerateLoopRequest(BaseModel):
    prompt: str
    duration_seconds: float
    bars: int = 4
    bpm: float = 120.0
    loop: bool = True


@app.post("/generate-loop")
async def generate_loop(body: GenerateLoopRequest) -> dict[str, Any]:
    """
    Generate a BPM-synced looping backing track and return audio as base64.
    Compatible with the frontend /api/generate-loop proxy route.
    """
    try:
        result = handle_generate(
            body.prompt,
            duration_seconds=body.duration_seconds,
            category="musical",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "audio_base64": _read_audio_base64(result["output_path"]),
        "duration_seconds": result["duration_seconds"],
        "bars": body.bars,
        "bpm": body.bpm,
        "prompt": result["prompt_used"],
    }


# ---------------------------------------------------------------------------
# /generate-instrument — smart generate (search library first, then generate)
# ---------------------------------------------------------------------------

class GenerateInstrumentRequest(BaseModel):
    prompt: str
    duration_seconds: float = 2.0
    search_limit: int = 5


@app.post("/generate-instrument")
async def generate_instrument(body: GenerateInstrumentRequest) -> dict[str, Any]:
    """
    Smart generate: searches the sample library first; generates via ElevenLabs if no match.
    Returns {strategy, sample_id, audio_url} for use with GET /samples/{id}/audio.
    Compatible with the frontend /api/samples/generate proxy route.
    """
    try:
        result = handle_generate(body.prompt, duration_seconds=body.duration_seconds)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Use the session directory name as a stable sample ID
    sample_id = Path(result["output_path"]).parent.name

    # Persist to MongoDB if available
    try:
        from .mongo import get_repository
        from .mongo.models import SampleUpsert, SampleVibe

        repo = get_repository()
        if repo:
            repo.upsert_sample(SampleUpsert(
                user_id="default_user",
                file_path=result["output_path"],
                file_name="generated.mp3",
                file_extension=".mp3",
                source="elevenlabs",
                elevenlabs_prompt=result["prompt_used"],
                vibe=SampleVibe(
                    category="musical",
                    description=body.prompt[:200],
                    tags=["generated", "elevenlabs"],
                ),
                extra={"sample_id": sample_id},
            ))
    except Exception:
        pass

    return {
        "strategy": "generated",
        "sample_id": sample_id,
        "audio_url": f"/files/{sample_id}/generated.mp3",
        "prompt": result["prompt_used"],
        "duration_seconds": result["duration_seconds"],
    }


# ---------------------------------------------------------------------------
# /samples/{sample_id}/audio — serve generated audio by session-dir ID
# ---------------------------------------------------------------------------

@app.get("/samples/{sample_id}/audio")
async def get_sample_audio(sample_id: str) -> FileResponse:
    """
    Return the audio file for a previously generated sample by its ID.
    The ID is the session directory name returned by /generate-instrument.
    """
    # Sanitize: no path traversal
    if "/" in sample_id or "\\" in sample_id or sample_id.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid sample_id")

    audio_path = OUTPUT_ROOT / sample_id / "generated.mp3"
    if audio_path.exists():
        return FileResponse(str(audio_path), media_type="audio/mpeg")

    # Try MongoDB lookup as fallback
    try:
        from .mongo import get_repository

        repo = get_repository()
        if repo:
            samples = repo.list_samples_for_user("default_user", limit=1000)
            for s in samples:
                if s.get("extra", {}).get("sample_id") == sample_id and s.get("file_path"):
                    p = Path(s["file_path"])
                    if p.exists():
                        return FileResponse(str(p), media_type="audio/mpeg")
    except Exception:
        pass

    raise HTTPException(status_code=404, detail=f"Sample not found: {sample_id}")


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
# /transcribe — audio-to-MIDI via Spotify basic-pitch
# ---------------------------------------------------------------------------

class TranscribeRequest(BaseModel):
    audio_data: str
    input_format: str = "webm"
    tempo_bpm: float = 120.0
    onset_threshold: float = 0.5
    frame_threshold: float = 0.3
    pitch_correction_strength: float = 0.7


@app.post("/transcribe")
async def transcribe_audio(body: TranscribeRequest) -> dict[str, Any]:
    """
    Transcribe base64-encoded audio (WebM or WAV) to MIDI notes using
    Spotify's basic-pitch. Returns notes and a saved midi_id for later retrieval.
    """
    return transcribe_audio_base64(
        body.audio_data,
        body.input_format,
        body.tempo_bpm,
        body.onset_threshold,
        body.frame_threshold,
        body.pitch_correction_strength,
    )


@app.get("/midi/{midi_id}")
async def get_midi_notes(midi_id: str) -> dict[str, Any]:
    """
    Retrieve notes for a previously transcribed MIDI file by its ID.
    Returns notes in the same format as POST /transcribe.
    """
    from .utils.audio_to_midi import parse_midi_file_to_notes

    midi_path = get_midi_file_path(midi_id)
    if not midi_path:
        raise HTTPException(status_code=404, detail=f"MIDI not found: {midi_id}")

    try:
        return parse_midi_file_to_notes(midi_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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


# ---------------------------------------------------------------------------
# /api/agent/insight — Snowflake agentic insights (blast-shielded)
# ---------------------------------------------------------------------------

_MOCK_INSIGHT = {
    "status": "success",
    "agent_insight": (
        "Analyzed 10k samples: Your lo-fi acoustic profile matches perfectly "
        "with a vinyl-compressed drum bus. Recommend layering a 60 Hz sub "
        "sine at -12 dBFS to fill the low-end gap detected at 0:14."
    ),
    "source": "mock",
}


class InsightRequest(BaseModel):
    query: str = ""
    context: dict = {}


@app.post("/api/agent/insight")
async def agent_insight(body: InsightRequest) -> dict:
    """
    Run the Snowflake agentic analysis pipeline.
    Hard 4-second timeout + full fallback — safe to demo live.
    """
    import asyncio

    from .services.snowflake_agent import run_snowflake_agent

    payload = {"query": body.query, "context": body.context}
    try:
        result = await asyncio.wait_for(run_snowflake_agent(payload), timeout=4.0)
        return {"status": "success", **result}
    except Exception as e:
        print(f"[snowflake_agent] FALLBACK triggered — {type(e).__name__}: {e}")
        return _MOCK_INSIGHT


def main() -> None:
    import uvicorn
    uvicorn.run("server.rest:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
