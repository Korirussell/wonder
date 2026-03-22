"""
Wonder Agent FastAPI server.

Run:
    wonder-agent
    # or
    uv run uvicorn agent.server:app --port 8001 --reload
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.utils.context_utils import Aclosing
from google.genai import types

from .agent import root_agent

APP_NAME = "wonder"

# Session service — MongoDB if available, otherwise in-memory
try:
    from .db.mongo_session_service import MongoSessionService
    session_service: Any = MongoSessionService()
except ImportError:
    from google.adk.sessions.in_memory_session_service import InMemorySessionService
    session_service = InMemorySessionService()

runner = Runner(
    app_name=APP_NAME,
    agent=root_agent,
    session_service=session_service,
)

app = FastAPI(title="Wonder Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the audio-processing REST server at /audio so external tools
# (frontend /api/transcribe, etc.) can still reach it without a separate process.
try:
    from server.rest import app as _audio_app
    app.mount("/audio", _audio_app)
except ImportError:
    pass


# ── Request / response models ────────────────────────────────────────────────


class SessionRequest(BaseModel):
    user_id: str = "default_user"
    state: dict[str, Any] = {}


class ChatRequest(BaseModel):
    session_id: str
    user_id: str = "default_user"
    message: str = ""
    audio_data: str | None = None  # base64-encoded audio
    mime_type: str = "audio/webm"
    midi_context: dict[str, Any] | None = None
    rhythm_context: dict[str, Any] | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _build_content(req: ChatRequest) -> types.Content:
    """Build a Gemini Content object from the chat request."""
    parts: list[types.Part] = []
    text = req.message or ""

    if req.midi_context:
        ctx = req.midi_context
        text += (
            f"\n\nUSER'S HUMMED MELODY (midi_id: {ctx.get('midi_id', '')}):\n"
            f"- {ctx.get('note_count', 0)} notes detected\n"
            f"- Suggested clip length: {ctx.get('suggested_clip_length', 0)} beats\n"
            f"- Detected tempo: {ctx.get('tempo_bpm', 120)} BPM\n"
            "TO USE: Call load_midi_notes then create a clip and call add_notes_to_clip."
        )

    if req.rhythm_context:
        rc = req.rhythm_context
        starts = rc.get("note_starts_beats", [])[:64]
        durs = rc.get("note_durations_beats", [])[:64]
        text += (
            f"\n\nUSER RHYTHM CAPTURE (space-bar tapping):\n"
            f"- Notes captured: {len(starts)}\n"
            f"- Reference BPM: {rc.get('reference_bpm', 120)}\n"
            f"- Timing confidence: {rc.get('timing_confidence', 1.0)}\n"
            f"- Quantization hint: {rc.get('quantization_hint', 'medium')}\n"
            f"- Beat starts: {starts}\n"
            f"- Beat durations: {durs}\n"
            "Use this as the timing skeleton for your MIDI. "
            "Keep the session tempo unchanged unless explicitly asked."
        )

    if text:
        parts.append(types.Part.from_text(text=text))

    if req.audio_data:
        import base64
        audio_bytes = base64.b64decode(req.audio_data)
        parts.append(
            types.Part(inline_data=types.Blob(mime_type=req.mime_type, data=audio_bytes))
        )

    return types.Content(role="user", parts=parts)


def _extract_text(events: list[Any]) -> str:
    """Extract the final text response from a list of ADK events."""
    parts: list[str] = []
    for event in events:
        if hasattr(event, "content") and event.content:
            for part in event.content.parts or []:
                if hasattr(part, "text") and part.text:
                    parts.append(part.text)
    return "".join(parts)


async def _ensure_session(user_id: str, session_id: str) -> None:
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )
    if session is None:
        await session_service.create_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id
        )


def _fire_analytics(req: ChatRequest) -> None:
    """Non-blocking analytics emit."""
    try:
        from .analytics.events import emit_event
        asyncio.ensure_future(
            emit_event(
                user_id=req.user_id,
                session_id=req.session_id,
                event_type="chat_turn",
                message_preview=req.message[:100],
            )
        )
    except Exception:
        pass


# ── Endpoints ─────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/session/new")
async def new_session(req: SessionRequest) -> dict[str, str]:
    """Create a new persistent session and return its ID."""
    session_id = str(uuid.uuid4())
    await session_service.create_session(
        app_name=APP_NAME,
        user_id=req.user_id,
        session_id=session_id,
        state=req.state,
    )
    return {"session_id": session_id}


@app.post("/chat")
async def chat(req: ChatRequest) -> dict[str, Any]:
    """Non-streaming chat. Collects all events and returns the final text."""
    await _ensure_session(req.user_id, req.session_id)
    content = _build_content(req)

    events: list[Any] = []
    async with Aclosing(
        runner.run_async(
            user_id=req.user_id,
            session_id=req.session_id,
            new_message=content,
        )
    ) as agen:
        async for event in agen:
            events.append(event)

    _fire_analytics(req)
    return {"content": _extract_text(events)}


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """SSE streaming chat. Returns server-sent events."""
    await _ensure_session(req.user_id, req.session_id)
    content = _build_content(req)

    async def event_gen():
        try:
            async with Aclosing(
                runner.run_async(
                    user_id=req.user_id,
                    session_id=req.session_id,
                    new_message=content,
                    run_config=RunConfig(streaming_mode=StreamingMode.SSE),
                )
            ) as agen:
                async for event in agen:
                    yield f"data: {event.model_dump_json(exclude_none=True, by_alias=True)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    _fire_analytics(req)
    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.websocket("/chat/live")
async def chat_live(
    websocket: WebSocket,
    session_id: str,
    user_id: str = "default_user",
) -> None:
    """WebSocket endpoint for bidirectional live audio streaming."""
    await websocket.accept()

    from google.adk.agents.live_request_queue import LiveRequest, LiveRequestQueue

    await _ensure_session(user_id, session_id)
    session = await session_service.get_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )

    live_queue = LiveRequestQueue()

    async def forward_events() -> None:
        async with Aclosing(
            runner.run_live(
                session=session,
                live_request_queue=live_queue,
                run_config=RunConfig(response_modalities=["TEXT", "AUDIO"]),
            )
        ) as agen:
            async for event in agen:
                await websocket.send_text(
                    event.model_dump_json(exclude_none=True, by_alias=True)
                )

    async def receive_messages() -> None:
        try:
            while True:
                data = await websocket.receive_text()
                live_queue.send(LiveRequest.model_validate_json(data))
        except WebSocketDisconnect:
            pass

    tasks = [
        asyncio.create_task(forward_events()),
        asyncio.create_task(receive_messages()),
    ]
    _, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()


@app.get("/user/{user_id}/preferences")
async def get_preferences(user_id: str) -> dict[str, Any]:
    """Return Snowflake-derived user preference profile."""
    try:
        from .analytics.preferences import get_user_preferences
        return await get_user_preferences(user_id)
    except ImportError:
        return {"error": "Analytics not configured"}


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> None:
    import uvicorn
    uvicorn.run("agent.server:app", host="0.0.0.0", port=8001, reload=True)


if __name__ == "__main__":
    main()
