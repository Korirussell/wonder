"""
Wonder Backend — Lightweight Hackathon Edition
Only job: proxy ElevenLabs Sound Effects API.
No librosa. No sklearn. No numpy. No heavy deps.

Run: uvicorn server_lite:app --port 8000 --reload
"""

import os
import logging
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Wonder Lite API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


def get_api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not set")
    return key


# ─── Models ──────────────────────────────────────────────────────────────────


class SoundEffectRequest(BaseModel):
    description: str = Field(..., description="Text description of the sound to generate")
    duration_seconds: float = Field(default=2.0, ge=0.5, le=5.0)


class SoundEffectResponse(BaseModel):
    description: str
    duration_seconds: float
    content_type: str
    size_bytes: int


# ─── Endpoints ───────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0-lite"}


@app.post("/generate-sfx")
async def generate_sound_effect(req: SoundEffectRequest):
    """
    Generate a sound effect via ElevenLabs and return the raw audio bytes.
    The frontend loads this directly into Tone.Player.
    """
    api_key = get_api_key()

    logger.info(f"[SFX] Generating: '{req.description}' ({req.duration_seconds}s)")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{ELEVENLABS_API_BASE}/sound-generation",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": req.description,
                "duration_seconds": req.duration_seconds,
                "output_format": "mp3_44100_128",
            },
        )

    if response.status_code != 200:
        logger.error(f"[SFX] ElevenLabs error {response.status_code}: {response.text}")
        raise HTTPException(
            status_code=response.status_code,
            detail=f"ElevenLabs API error: {response.text}",
        )

    audio_bytes = response.content
    logger.info(f"[SFX] Generated {len(audio_bytes)} bytes for '{req.description}'")

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'inline; filename="sfx_{req.description[:30].replace(" ", "_")}.mp3"',
            "X-Wonder-Description": req.description,
            "X-Wonder-Duration": str(req.duration_seconds),
        },
    )


@app.post("/generate-sfx-json", response_model=SoundEffectResponse)
async def generate_sound_effect_json(req: SoundEffectRequest):
    """
    Same as /generate-sfx but returns metadata only (no audio bytes in JSON).
    Audio is fetched separately via /generate-sfx.
    """
    api_key = get_api_key()

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{ELEVENLABS_API_BASE}/sound-generation",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": req.description,
                "duration_seconds": req.duration_seconds,
                "output_format": "mp3_44100_128",
            },
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"ElevenLabs API error: {response.text}",
        )

    return SoundEffectResponse(
        description=req.description,
        duration_seconds=req.duration_seconds,
        content_type="audio/mpeg",
        size_bytes=len(response.content),
    )
