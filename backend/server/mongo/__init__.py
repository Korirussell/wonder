"""
MongoDB (Atlas) layer for Wonder: users, samples, sessions.

Environment:
  MONGODB_URI — Atlas connection string (required for DB calls)
  MONGODB_DB_NAME — database name (default: ``wonder``)
"""

from __future__ import annotations

from .client import get_database, mongo_health
from .models import (
    SampleUpsert,
    SessionAppendTurn,
    SessionCreate,
    SessionTurn,
    UserUpsert,
)
from .repository import WonderMongoRepository, get_repository
from .snowflake_events import session_document_to_analytics_events

__all__ = [
    "SampleUpsert",
    "SessionAppendTurn",
    "SessionCreate",
    "SessionTurn",
    "UserUpsert",
    "WonderMongoRepository",
    "get_database",
    "get_repository",
    "mongo_health",
    "session_document_to_analytics_events",
]
