"""
MongoDB-backed session service for Google ADK.

Config:
    MONGO_URI: MongoDB connection string (default: mongodb://localhost:27017)
    MONGO_DB: Database name (default: wonder)

Falls back to in-memory if MongoDB is unavailable or motor is not installed.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from google.adk.sessions.base_session_service import BaseSessionService, ListSessionsResponse
from google.adk.sessions.session import Session

logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "wonder")

_motor_asyncio: Any = None
try:
    import motor.motor_asyncio as _motor_asyncio
    _MONGO_AVAILABLE = True
except ImportError:
    _MONGO_AVAILABLE = False
    logger.warning("motor not installed — MongoDB session service unavailable")


def _session_to_doc(session: Session, *, created_at: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "_id": session.id,
        "app_name": session.app_name,
        "user_id": session.user_id,
        "state": dict(session.state) if session.state else {},
        "events": list(session.events) if session.events else [],
        "created_at": created_at or now,
        "updated_at": now,
    }


def _doc_to_session(doc: dict[str, Any]) -> Session:
    return Session(
        id=doc["_id"],
        app_name=doc.get("app_name", "wonder"),
        user_id=doc.get("user_id", ""),
        state=doc.get("state", {}),
        events=doc.get("events", []),
    )


class MongoSessionService(BaseSessionService):
    """
    ADK session service backed by MongoDB.

    Stores session state and conversation history persistently.
    Falls back to an in-memory dict if MongoDB is unavailable or motor is not installed.
    """

    def __init__(self) -> None:
        self._fallback: dict[str, dict[str, Any]] = {}
        self._collection = None
        if _MONGO_AVAILABLE and _motor_asyncio is not None:
            try:
                client = _motor_asyncio.AsyncIOMotorClient(
                    MONGO_URI, serverSelectionTimeoutMS=3000
                )
                self._collection = client[MONGO_DB]["wonder_sessions"]
                logger.info("MongoSessionService connected: %s/%s", MONGO_URI, MONGO_DB)
            except Exception as exc:
                logger.warning("MongoDB connection failed, using in-memory fallback: %s", exc)

    def _key(self, app_name: str, user_id: str, session_id: str) -> str:
        return f"{app_name}:{user_id}:{session_id}"

    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: Optional[dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> Session:
        """Create and persist a new session."""
        sid = session_id or str(uuid.uuid4())
        session = Session(
            id=sid,
            app_name=app_name,
            user_id=user_id,
            state=state or {},
            events=[],
        )
        doc = _session_to_doc(session)

        if self._collection is not None:
            try:
                await self._collection.update_one(
                    {"_id": sid},
                    {"$setOnInsert": doc},
                    upsert=True,
                )
                return session
            except Exception as exc:
                logger.warning("create_session MongoDB error, falling back: %s", exc)

        self._fallback.setdefault(self._key(app_name, user_id, sid), doc)
        return session

    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: Any = None,
    ) -> Optional[Session]:
        """Return the session with the given ID, or None if not found."""
        if self._collection is not None:
            try:
                doc = await self._collection.find_one({"_id": session_id})
                return _doc_to_session(doc) if doc is not None else None
            except Exception as exc:
                logger.warning("get_session MongoDB error, falling back: %s", exc)

        doc = self._fallback.get(self._key(app_name, user_id, session_id))
        return _doc_to_session(doc) if doc is not None else None

    async def update_session(self, session: Session) -> None:
        """Persist an updated session."""
        app_name = session.app_name
        user_id = session.user_id
        session_id = session.id
        key = self._key(app_name, user_id, session_id)
        created_at = self._fallback.get(key, {}).get("created_at")
        doc = _session_to_doc(session, created_at=created_at)

        if self._collection is not None:
            try:
                await self._collection.replace_one({"_id": session_id}, doc, upsert=True)
                return
            except Exception as exc:
                logger.warning("update_session MongoDB error, falling back: %s", exc)

        self._fallback[key] = doc

    async def delete_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
    ) -> None:
        """Delete the session with the given ID."""
        if self._collection is not None:
            try:
                await self._collection.delete_one({"_id": session_id})
                return
            except Exception as exc:
                logger.warning("delete_session MongoDB error, falling back: %s", exc)

        self._fallback.pop(self._key(app_name, user_id, session_id), None)

    async def list_sessions(
        self,
        *,
        app_name: str,
        user_id: Optional[str] = None,
    ) -> ListSessionsResponse:
        """Return all sessions for the given user (or all users if user_id is None)."""
        query: dict[str, Any] = {"app_name": app_name}
        if user_id is not None:
            query["user_id"] = user_id

        if self._collection is not None:
            try:
                cursor = self._collection.find(query)
                docs = await cursor.to_list(length=1000)
                return ListSessionsResponse(sessions=[_doc_to_session(d) for d in docs])
            except Exception as exc:
                logger.warning("list_sessions MongoDB error, falling back: %s", exc)

        prefix = f"{app_name}:{user_id}:" if user_id else f"{app_name}:"
        sessions = [
            _doc_to_session(doc)
            for key, doc in self._fallback.items()
            if key.startswith(prefix)
        ]
        return ListSessionsResponse(sessions=sessions)
