"""
Pydantic shapes for API validation and documentation.
MongoDB documents may include additional fields over time.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --- users ---


class AIPreferenceHints(BaseModel):
    """Optional; can be filled later from analytics (e.g. Snowflake batch jobs)."""

    preferred_genres: list[str] = Field(default_factory=list)
    preferred_categories: list[str] = Field(default_factory=list)
    notes: str = ""


class UserPreferences(BaseModel):
    daw: str | None = None
    default_sample_folder: str | None = None
    default_bpm: float | None = None
    theme: str | None = None
    ai_preferences: AIPreferenceHints = Field(default_factory=AIPreferenceHints)


class UserUpsert(BaseModel):
    auth_subject: str = Field(..., description="Stable id from auth provider (e.g. Clerk sub)")
    email: str | None = None
    display_name: str | None = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)


# --- samples ---

SampleSource = Literal["local", "elevenlabs", "other"]


class SampleMath(BaseModel):
    brightness: float | None = None
    punch: float | None = None
    duration: float | None = None


class SampleVibe(BaseModel):
    category: str | None = None
    sub_category: str | None = None
    tags: list[str] = Field(default_factory=list)
    description: str | None = None


class SampleUpsert(BaseModel):
    user_id: str
    file_path: str | None = None
    uri: str | None = None
    file_name: str | None = None
    file_extension: str | None = None
    source: SampleSource = "local"
    math: SampleMath = Field(default_factory=SampleMath)
    vibe: SampleVibe = Field(default_factory=SampleVibe)
    elevenlabs_prompt: str | None = None
    embedding_model: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


# --- sessions ---


class SessionTurn(BaseModel):
    role: Literal["user", "assistant", "system"] = "user"
    content: str = ""
    retrieved_sample_ids: list[str] = Field(default_factory=list)
    load_results: list[dict[str, Any]] = Field(default_factory=list)
    latency_ms: float | None = None
    model: str | None = None
    ts: datetime | None = None


class SessionCreate(BaseModel):
    user_id: str
    session_id: str = Field(..., description="Client-generated UUID for idempotency")
    client: str | None = None
    turns: list[SessionTurn] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)


class SessionAppendTurn(BaseModel):
    turn: SessionTurn
