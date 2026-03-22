from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

# backend/server/server/mongo/client.py → repo root is parents[4]
_REPO_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(_REPO_ROOT / ".env")


def mongodb_uri() -> str | None:
    raw = os.getenv("MONGODB_URI", "").strip()
    return raw or None


def mongodb_db_name() -> str:
    return os.getenv("MONGODB_DB_NAME", "wonder").strip() or "wonder"


@lru_cache(maxsize=1)
def get_client():
    """Singleton PyMongo client."""
    from pymongo import MongoClient

    uri = mongodb_uri()
    if not uri:
        raise RuntimeError("MONGODB_URI is not set in the environment.")
    return MongoClient(uri)


def get_database():
    """Default Wonder application database."""
    return get_client()[mongodb_db_name()]


def mongo_health() -> dict[str, Any]:
    """
    Safe health check for ``GET /health/mongo`` — does not connect if URI unset.
    """
    if not mongodb_uri():
        return {
            "configured": False,
            "ok": False,
            "detail": "MONGODB_URI not set",
        }
    try:
        get_client().admin.command("ping")
        return {
            "configured": True,
            "ok": True,
            "database": mongodb_db_name(),
            "detail": "ping ok",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "configured": True,
            "ok": False,
            "detail": str(exc),
        }
