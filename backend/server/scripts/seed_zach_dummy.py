#!/usr/bin/env python3
"""
Replace fixed "Zach dummy" rows in Mongo on each smoke run (no accumulation).

Deletes previous rows for ``auth_subject`` / ``user_id`` ``zwest2563`` and session
``SMOKE_ZACH_SESSION_ID``, then upserts:
  - user profile (from .env SAMPLE_DIR, genres, etc.)
  - one sample from LanceDB (first row) if available
  - one session with dummy turns

Run from ``backend/server``::

    python scripts/seed_zach_dummy.py

Loads ``wonder/.env`` from repo root (same as ``server.mongo.client``).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# backend/server is on path for `import server`
_SERVER_ROOT = Path(__file__).resolve().parents[1]
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVER_ROOT))

from dotenv import load_dotenv

load_dotenv(_REPO_ROOT / ".env")

AUTH_SUBJECT = "zwest2563"
# Fixed session id so delete + recreate replaces the same logical session each run.
SMOKE_ZACH_SESSION_ID = "00000000-0000-4000-8000-00000000d0d0"


def _resolve_lance_path(raw: str) -> Path:
    p = Path(raw).expanduser()
    if p.is_absolute():
        return p
    return _REPO_ROOT / p


def _first_lance_row() -> dict | None:
    try:
        import lancedb  # noqa: PLC0415
    except ImportError:
        print("[seed_zach_dummy] lancedb not installed — skip sample from Lance.", file=sys.stderr)
        return None

    try:
        db_path = os.getenv("TAG_DB_PATH", "./data/sample_library.lance")
        table_name = os.getenv("TAG_DB_TABLE", "samples")
        resolved = _resolve_lance_path(db_path)
        if not resolved.exists():
            print(f"[seed_zach_dummy] Lance path missing: {resolved} — skip sample.", file=sys.stderr)
            return None

        db = lancedb.connect(str(resolved))
        if hasattr(db, "list_tables"):
            resp = db.list_tables()
            raw_tables = getattr(resp, "tables", resp)
            table_list = [str(t) for t in (raw_tables or [])]
        else:
            tn = getattr(db, "table_names", None)
            table_list = list(tn()) if callable(tn) else []
        if table_name not in table_list:
            print(f"[seed_zach_dummy] No table {table_name!r} — skip sample.", file=sys.stderr)
            return None

        tbl = db.open_table(table_name)
        df = tbl.to_pandas()
        if df is None or len(df) == 0:
            print("[seed_zach_dummy] Lance table empty — skip sample.", file=sys.stderr)
            return None

        return df.iloc[0].to_dict()
    except Exception as exc:  # noqa: BLE001
        print(f"[seed_zach_dummy] Lance read failed: {exc} — skip sample.", file=sys.stderr)
        return None


def _map_source(raw: object) -> str:
    s = str(raw or "local").lower()
    if "local" in s or "filesystem" in s:
        return "local"
    if "eleven" in s:
        return "elevenlabs"
    return "other"


def _delete_dummy_docs() -> None:
    from server.mongo.client import get_database, mongodb_uri  # noqa: PLC0415

    if not mongodb_uri():
        return
    db = get_database()
    db["users"].delete_many({"auth_subject": AUTH_SUBJECT})
    db["samples"].delete_many({"user_id": AUTH_SUBJECT})
    db["sessions"].delete_many(
        {"$or": [{"session_id": SMOKE_ZACH_SESSION_ID}, {"user_id": AUTH_SUBJECT}]}
    )


def main() -> int:
    from server.mongo import get_repository  # noqa: PLC0415
    from server.mongo.models import (  # noqa: PLC0415
        AIPreferenceHints,
        SampleMath,
        SampleUpsert,
        SampleVibe,
        SessionCreate,
        SessionTurn,
        UserPreferences,
        UserUpsert,
    )

    if not os.getenv("MONGODB_URI", "").strip():
        print("[seed_zach_dummy] MONGODB_URI unset — skip seed.")
        return 0

    _delete_dummy_docs()

    repo = get_repository()
    if repo is None:
        print("[seed_zach_dummy] get_repository() is None — skip seed.")
        return 0

    sample_dir = os.getenv("SAMPLE_DIR", "").strip() or None

    user = UserUpsert(
        auth_subject=AUTH_SUBJECT,
        email="zwest@example.com",
        display_name="Zachary West",
        preferences=UserPreferences(
            daw="ableton",
            theme="light",
            default_bpm=100.0,
            default_sample_folder=sample_dir,
            ai_preferences=AIPreferenceHints(
                preferred_genres=["folk", "rock", "pop"],
            ),
        ),
    )
    repo.upsert_user(user)
    print(f"[seed_zach_dummy] upserted user {AUTH_SUBJECT!r}")

    row = _first_lance_row()
    if row:
        fp = row.get("file_path")
        if fp:
            math = SampleMath(
                brightness=row.get("brightness"),
                punch=row.get("punch"),
                duration=row.get("duration"),
            )
            tags = row.get("tags")
            if not isinstance(tags, list):
                tags = []
            vibe = SampleVibe(
                category=row.get("category"),
                sub_category=row.get("sub_category"),
                tags=[str(t) for t in tags],
                description=(row.get("description") if row.get("description") is not None else None),
            )
            sample = SampleUpsert(
                user_id=AUTH_SUBJECT,
                file_path=str(fp),
                file_name=row.get("file_name"),
                file_extension=row.get("file_extension"),
                source=_map_source(row.get("source")),  # type: ignore[arg-type]
                math=math,
                vibe=vibe,
                embedding_model=row.get("embedding_model") or os.getenv("GEMINI_EMBEDDING_MODEL"),
                extra={"seed": "smoke_zach_dummy", "from_lance": True},
            )
            repo.upsert_sample(sample)
            print(f"[seed_zach_dummy] upserted sample {fp!r}")
        else:
            print("[seed_zach_dummy] Lance row has no file_path — skip sample.", file=sys.stderr)
    else:
        # Minimal placeholder so Mongo still has a sample row for UI tests
        fallback = os.getenv("SAMPLE_DIR", "").strip()
        if fallback:
            placeholder = str(Path(fallback).expanduser() / "_smoke_placeholder.wav")
            repo.upsert_sample(
                SampleUpsert(
                    user_id=AUTH_SUBJECT,
                    file_path=placeholder,
                    source="local",
                    vibe=SampleVibe(category="smoke", tags=["placeholder"]),
                    extra={"seed": "smoke_zach_dummy", "note": "no Lance row; path is placeholder"},
                )
            )
            print(f"[seed_zach_dummy] upserted placeholder sample {placeholder!r}")

    session = SessionCreate(
        user_id=AUTH_SUBJECT,
        session_id=SMOKE_ZACH_SESSION_ID,
        client="smoke-seed-zach",
        turns=[
            SessionTurn(role="user", content="Find a folk kick similar to my last search."),
            SessionTurn(
                role="assistant",
                content="Here are three candidates from your library (dummy smoke data).",
            ),
        ],
        meta={"seed": "smoke_zach_dummy"},
    )
    repo.create_session(session)
    print(f"[seed_zach_dummy] created session {SMOKE_ZACH_SESSION_ID!r}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001
        print(f"[seed_zach_dummy] error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
