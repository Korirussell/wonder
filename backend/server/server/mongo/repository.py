from __future__ import annotations

from typing import Any

from .client import get_database, mongodb_uri
from .models import (
    SampleUpsert,
    SessionAppendTurn,
    SessionCreate,
    UserUpsert,
    utcnow,
)


def ensure_indexes(db) -> None:
    """Create recommended indexes (idempotent). Call once at startup or first use."""
    users = db["users"]
    samples = db["samples"]
    sessions = db["sessions"]

    users.create_index("auth_subject", unique=True)
    users.create_index("updated_at")

    samples.create_index([("user_id", 1), ("updated_at", -1)])
    samples.create_index([("user_id", 1), ("file_path", 1)])
    samples.create_index([("user_id", 1), ("source", 1)])

    sessions.create_index("session_id", unique=True)
    sessions.create_index([("user_id", 1), ("updated_at", -1)])


class WonderMongoRepository:
    """
    Thin CRUD helpers for ``users``, ``samples``, ``sessions``.

    Raises ``RuntimeError`` if ``MONGODB_URI`` is not configured.
    """

    def __init__(self) -> None:
        self._db = get_database()
        ensure_indexes(self._db)

    @property
    def users(self):
        return self._db["users"]

    @property
    def samples(self):
        return self._db["samples"]

    @property
    def sessions(self):
        return self._db["sessions"]

    # --- users ---

    def upsert_user(self, payload: UserUpsert) -> dict[str, Any]:
        now = utcnow()
        doc = {
            "auth_subject": payload.auth_subject,
            "email": payload.email,
            "display_name": payload.display_name,
            "preferences": payload.preferences.model_dump(),
            "updated_at": now,
        }
        self.users.update_one(
            {"auth_subject": payload.auth_subject},
            {
                "$set": doc,
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return self.users.find_one({"auth_subject": payload.auth_subject}) or doc

    def get_user_by_auth_subject(self, auth_subject: str) -> dict[str, Any] | None:
        return self.users.find_one({"auth_subject": auth_subject})

    # --- samples ---

    def upsert_sample(self, payload: SampleUpsert) -> dict[str, Any]:
        now = utcnow()
        filt: dict[str, Any] = {"user_id": payload.user_id}
        if payload.file_path:
            filt["file_path"] = payload.file_path
        elif payload.uri:
            filt["uri"] = payload.uri
        else:
            raise ValueError("SampleUpsert requires file_path or uri")

        doc = {
            "user_id": payload.user_id,
            "file_path": payload.file_path,
            "uri": payload.uri,
            "file_name": payload.file_name,
            "file_extension": payload.file_extension,
            "source": payload.source,
            "math": payload.math.model_dump(),
            "vibe": payload.vibe.model_dump(),
            "elevenlabs_prompt": payload.elevenlabs_prompt,
            "embedding_model": payload.embedding_model,
            "extra": payload.extra,
            "updated_at": now,
        }
        self.samples.update_one(
            filt,
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return self.samples.find_one(filt) or doc

    def list_samples_for_user(
        self,
        user_id: str,
        *,
        limit: int = 100,
        skip: int = 0,
    ) -> list[dict[str, Any]]:
        cur = (
            self.samples.find({"user_id": user_id})
            .sort("updated_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return list(cur)

    # --- sessions ---

    def create_session(self, payload: SessionCreate) -> dict[str, Any]:
        now = utcnow()
        turns = [t.model_dump() for t in payload.turns]
        for t in turns:
            if t.get("ts") is None:
                t["ts"] = now
        doc = {
            "user_id": payload.user_id,
            "session_id": payload.session_id,
            "client": payload.client,
            "turns": turns,
            "meta": payload.meta,
            "created_at": now,
            "updated_at": now,
        }
        self.sessions.update_one(
            {"session_id": payload.session_id},
            {"$setOnInsert": doc},
            upsert=True,
        )
        return self.sessions.find_one({"session_id": payload.session_id}) or doc

    def append_session_turn(self, session_id: str, body: SessionAppendTurn) -> dict[str, Any] | None:
        now = utcnow()
        turn = body.turn.model_dump()
        if turn.get("ts") is None:
            turn["ts"] = now
        self.sessions.update_one(
            {"session_id": session_id},
            {
                "$push": {"turns": turn},
                "$set": {"updated_at": now},
            },
        )
        return self.sessions.find_one({"session_id": session_id})

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        return self.sessions.find_one({"session_id": session_id})


_repo: WonderMongoRepository | None = None


def get_repository() -> WonderMongoRepository | None:
    """
    Shared repository instance, or ``None`` if MongoDB is not configured.
    """
    global _repo
    if not mongodb_uri():
        return None
    if _repo is None:
        _repo = WonderMongoRepository()
    return _repo
