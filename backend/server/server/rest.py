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
    import pretty_midi

    midi_path = get_midi_file_path(midi_id)
    if not midi_path:
        raise HTTPException(status_code=404, detail=f"MIDI not found: {midi_id}")

    try:
        pm = pretty_midi.PrettyMIDI(midi_path)
        _, tempos = pm.get_tempo_change_times()
        tempo_bpm = float(tempos[0]) if len(tempos) > 0 else 120.0
        beats_per_second = tempo_bpm / 60.0

        notes = []
        for instrument in pm.instruments:
            for note in instrument.notes:
                notes.append({
                    "pitch": note.pitch,
                    "start_time": round(note.start * beats_per_second, 4),
                    "duration": round((note.end - note.start) * beats_per_second, 4),
                    "velocity": note.velocity,
                    "mute": False,
                })

        return {
            "success": True,
            "midi_id": midi_id,
            "notes": notes,
            "note_count": len(notes),
            "tempo_bpm": tempo_bpm,
        }
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


def main() -> None:
    import uvicorn
    uvicorn.run("server.rest:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
