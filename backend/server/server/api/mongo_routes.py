"""
REST endpoints that read/write MongoDB through ``WonderMongoRepository``.

**How your team split fits (plain English)**

- **Frontend:** Signs users in (e.g. Clerk). The browser knows "who is logged in" and can send that
  user's stable id (often called ``sub``) to this API in JSON or query params. This Python server
  does **not** re-verify the session token unless someone adds that later.

- **Teammate / infra:** Atlas connection string, cluster rules, backups, etc. live in env + their work.
  This file only calls ``get_repository()`` — if ``MONGODB_URI`` is missing, routes return **503**.

- **This file's job:** Map HTTP (paths, JSON bodies) → repository methods → JSON responses.
  ``_json_safe`` turns Mongo types (ObjectId, datetimes) into stuff FastAPI can serialize.

**Security reality (don't skip this)**

Anything you put in the URL/body (``auth_subject``, ``user_id``) is **whatever the client sent**.
For a public API you'd verify identity on the server. Your teammate may put this API behind a
gateway or add ``Depends(...)`` later. Until then, treat these routes as **trusted-caller** or dev-only.

See ``server/mongo/models.py`` (shapes) and ``server/mongo/repository.py`` (actual DB calls).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Query

from ..mongo import get_repository
from ..mongo.models import (
    SampleUpsert,
    SessionAppendTurn,
    SessionCreate,
    UserUpsert,
)
from ..mongo.snowflake_events import session_document_to_analytics_events

router = APIRouter(prefix="/api/mongo", tags=["mongo"])


def _json_safe(value: Any) -> Any:
    """
    Walk a value from PyMongo and return JSON-friendly data.

    Mongo uses special types (ObjectId, datetime). FastAPI's default JSON encoder does not
    always handle those inside nested dicts, so we normalize recursively here.
    """
    if value is None:
        return None
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    return value


def _require_repo():
    """
    Shared guard: Mongo must be configured on this machine (``MONGODB_URI`` in root ``.env``).

    If not, we refuse to pretend we saved anything — **503** with a clear message.
    """
    repo = get_repository()
    if repo is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB not configured (set MONGODB_URI in the environment).",
        )
    return repo


def _session_or_404(repo, session_id: str) -> dict[str, Any]:
    """
    Load one session document by its ``session_id`` field (not Mongo's ``_id``).

    Raises **404** if no document exists — same idea as "not found" in any CRUD app.
    """
    doc = repo.get_session(session_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return doc


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------


@router.put(
    "/users",
    summary="Create or update a user profile",
    description=(
        "Upserts by ``auth_subject``. The frontend should send the logged-in user's id "
        "(same id your auth provider uses, e.g. Clerk ``sub``)."
    ),
)
def put_user(body: UserUpsert) -> dict[str, Any]:
    # ``UserUpsert`` is validated by Pydantic (see mongo/models.py): email, preferences, etc.
    # ``upsert`` = update if this auth_subject exists, insert if not.
    repo = _require_repo()
    doc = repo.upsert_user(body)
    return _json_safe(doc)


@router.get(
    "/users/me",
    summary="Fetch the user row for whoever id you pass in",
    description=(
        "Passes ``auth_subject`` via header ``X-Auth-Subject`` or query ``auth_subject``. "
        "Useful when the frontend already knows the id from sign-in and you want a simple GET."
    ),
)
def get_user_me(
    x_auth_subject: Annotated[
        str | None,
        Header(
            alias="X-Auth-Subject",
            description="Stable user id from your auth provider (e.g. Clerk sub).",
        ),
    ] = None,
    auth_subject: Annotated[
        str | None,
        Query(description="Same as header; handy for quick tests in a browser."),
    ] = None,
) -> dict[str, Any]:
    # We accept two ways to pass the id so curl and browsers are both easy.
    # Header is slightly nicer for real apps (doesn't clutter the URL).
    subject = x_auth_subject or auth_subject
    if not subject:
        raise HTTPException(
            status_code=400,
            detail="Provide X-Auth-Subject header or auth_subject query parameter.",
        )

    repo = _require_repo()
    doc = repo.get_user_by_auth_subject(subject)
    if doc is None:
        # No row yet — they may need to call PUT /users first to create the profile.
        raise HTTPException(status_code=404, detail="User not found")
    return _json_safe(doc)


@router.get(
    "/users/{auth_subject}",
    summary="Fetch a user by auth_subject path segment",
    description=(
        "Same data as GET /users/me, but the id is in the path. "
        "Only expose this if your deployment model is OK with id-in-URL (teammate/gateway may restrict)."
    ),
)
def get_user_by_subject(auth_subject: str) -> dict[str, Any]:
    # Path parameter ``{auth_subject}`` is filled in by FastAPI from the URL automatically.
    repo = _require_repo()
    doc = repo.get_user_by_auth_subject(auth_subject)
    if doc is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _json_safe(doc)


# ---------------------------------------------------------------------------
# Samples (per-user metadata: paths, tags, etc.)
# ---------------------------------------------------------------------------


@router.put(
    "/samples",
    summary="Create or update a sample document",
    description=(
        "``user_id`` should match the logged-in user your frontend is acting as. "
        "Repository matches on user_id + file_path or user_id + uri."
    ),
)
def put_sample(body: SampleUpsert) -> dict[str, Any]:
    # ``ValueError`` from the repo means "bad payload" (e.g. missing both file_path and uri).
    # We turn that into HTTP 400 so the client gets a normal error, not a 500 crash.
    repo = _require_repo()
    try:
        doc = repo.upsert_sample(body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _json_safe(doc)


@router.get(
    "/samples",
    summary="List samples for one user",
    description=(
        "Paginated list, newest first. ``limit`` caps how many; ``skip`` skips that many "
        "(page 2 ≈ skip=100 if limit=100)."
    ),
)
def list_samples(
    user_id: Annotated[str, Query(description="Whose samples — should match the signed-in user.")],
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    skip: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, Any]]:
    # Returns a plain list; each item is one Mongo document, json-safe'd.
    repo = _require_repo()
    docs = repo.list_samples_for_user(user_id, limit=limit, skip=skip)
    return [_json_safe(d) for d in docs]


# ---------------------------------------------------------------------------
# Sessions (chat / agent runs with embedded turns[])
# ---------------------------------------------------------------------------


@router.put(
    "/sessions",
    summary="Create or ensure a session document exists",
    description=(
        "``session_id`` should be a client-generated UUID for idempotency. "
        "If the session already exists, repository behavior is create-style (see repository docstring)."
    ),
)
def put_session(body: SessionCreate) -> dict[str, Any]:
    # ``SessionCreate`` carries user_id, session_id, optional turns[], meta, etc.
    repo = _require_repo()
    doc = repo.create_session(body)
    return _json_safe(doc)


@router.get(
    "/sessions/{session_id}",
    summary="Get one session document",
    description="404 if that session_id was never created.",
)
def get_session(session_id: str) -> dict[str, Any]:
    # ``session_id`` here is the string you stored in the document, not Mongo's internal _id.
    repo = _require_repo()
    doc = _session_or_404(repo, session_id)
    return _json_safe(doc)


@router.post(
    "/sessions/{session_id}/turns",
    summary="Append one turn to the session's turns array",
    description="404 if no session with that session_id exists (nothing to push into).",
)
def post_session_turn(session_id: str, body: SessionAppendTurn) -> dict[str, Any]:
    # ``SessionAppendTurn`` wraps a single ``SessionTurn`` (role, content, etc.).
    # Repository pushes onto the ``turns`` array and returns the updated full document.
    repo = _require_repo()
    doc = repo.append_session_turn(session_id, body)
    if doc is None:
        # No document matched that session_id — same as "session not found".
        raise HTTPException(status_code=404, detail="Session not found")
    return _json_safe(doc)


@router.get(
    "/sessions/{session_id}/analytics-events",
    summary="Expand a session into flat rows (Snowflake / analytics friendly)",
    description=(
        "Debug or ETL helper: uses ``session_document_to_analytics_events`` in mongo/snowflake_events.py. "
        "Same 404 rules as GET session."
    ),
)
def get_session_analytics_events(session_id: str) -> list[dict[str, Any]]:
    # First load the session; then transform it into a list of simple dicts for warehousing.
    repo = _require_repo()
    doc = _session_or_404(repo, session_id)
    events = session_document_to_analytics_events(doc)
    return [_json_safe(e) for e in events]
