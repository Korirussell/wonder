"""
Derive flat analytics-friendly rows from MongoDB ``sessions`` documents.

Use these as payloads to Snowflake (SQL ingest, Snowpipe, HTTP API, etc.).
Aligns conceptually with ``Zach_Ideas/Snowflake.md`` event types.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def _iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def session_document_to_analytics_events(session: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Expand a session document into zero or more row-shaped dicts.

    Each row is suitable for a ``wonder_events``-style table with at least:
    ``event_type``, ``user_id``, ``session_id``, ``ts``, plus type-specific fields.
    """
    user_id = session.get("user_id")
    session_id = session.get("session_id")
    if not user_id or not session_id:
        return []

    events: list[dict[str, Any]] = []
    base_ts = session.get("updated_at") or session.get("created_at")

    for i, turn in enumerate(session.get("turns") or []):
        ts = turn.get("ts") or base_ts
        events.append(
            {
                "event_type": "copilot_turn",
                "user_id": user_id,
                "session_id": session_id,
                "turn_index": i,
                "role": turn.get("role"),
                "query_text": (turn.get("content") or "")[:4000],
                "result_count": len(turn.get("retrieved_sample_ids") or []),
                "latency_ms": turn.get("latency_ms"),
                "model": turn.get("model"),
                "ts": _iso(ts),
            }
        )

        for j, load in enumerate(turn.get("load_results") or []):
            events.append(
                {
                    "event_type": "sample_loaded_daw",
                    "user_id": user_id,
                    "session_id": session_id,
                    "turn_index": i,
                    "load_index": j,
                    "success": load.get("success", True),
                    "daw": load.get("daw"),
                    "sample_id": load.get("sample_id"),
                    "detail": str(load.get("detail", ""))[:2000],
                    "ts": _iso(ts),
                }
            )

    return events
