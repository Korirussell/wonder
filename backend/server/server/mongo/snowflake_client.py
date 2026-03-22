"""
Snowflake writer for Wonder analytics events.

Environment variables (all optional — when absent, writes are silently skipped):
  SNOWFLAKE_ACCOUNT   — e.g. xy12345.us-east-1
  SNOWFLAKE_USER      — service account username
  SNOWFLAKE_PASSWORD  — service account password
  SNOWFLAKE_DATABASE  — default: WONDER
  SNOWFLAKE_SCHEMA    — default: ANALYTICS
  SNOWFLAKE_WAREHOUSE — default: WONDER_WH
  SNOWFLAKE_ROLE      — optional role override
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from functools import lru_cache
from typing import Any

logger = logging.getLogger(__name__)

_INSERT_SQL = """
INSERT INTO WONDER_EVENTS (
    EVENT_ID, EVENT_TYPE, USER_ID, SESSION_ID, TS,
    TURN_INDEX, ROLE, QUERY_TEXT, RESULT_COUNT,
    LATENCY_MS, MODEL, LOAD_INDEX, SUCCESS, DAW,
    SAMPLE_ID, DETAIL, FEEDBACK, MESSAGE_ID,
    REPORT_TYPE, SUBJECT, EXTRA
) SELECT
    %(event_id)s, %(event_type)s, %(user_id)s, %(session_id)s, %(ts)s,
    %(turn_index)s, %(role)s, %(query_text)s, %(result_count)s,
    %(latency_ms)s, %(model)s, %(load_index)s, %(success)s, %(daw)s,
    %(sample_id)s, %(detail)s, %(feedback)s, %(message_id)s,
    %(report_type)s, %(subject)s, PARSE_JSON(%(extra)s)
"""


def _snowflake_configured() -> bool:
    return bool(os.getenv("SNOWFLAKE_ACCOUNT") and os.getenv("SNOWFLAKE_USER"))


@lru_cache(maxsize=1)
def _get_connection():
    import snowflake.connector  # type: ignore[import]

    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ.get("SNOWFLAKE_PASSWORD", ""),
        database=os.environ.get("SNOWFLAKE_DATABASE", "WONDER"),
        schema=os.environ.get("SNOWFLAKE_SCHEMA", "ANALYTICS"),
        warehouse=os.environ.get("SNOWFLAKE_WAREHOUSE", "WONDER_WH"),
        role=os.environ.get("SNOWFLAKE_ROLE") or None,
    )


def _normalise(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": r.get("event_type"),
        "user_id": r.get("user_id"),
        "session_id": r.get("session_id"),
        "ts": r.get("ts"),
        "turn_index": r.get("turn_index"),
        "role": r.get("role"),
        "query_text": r.get("query_text"),
        "result_count": r.get("result_count"),
        "latency_ms": r.get("latency_ms"),
        "model": r.get("model"),
        "load_index": r.get("load_index"),
        "success": r.get("success"),
        "daw": r.get("daw"),
        "sample_id": r.get("sample_id"),
        "detail": r.get("detail"),
        "feedback": r.get("feedback"),
        "message_id": r.get("message_id"),
        "report_type": r.get("report_type"),
        "subject": r.get("subject"),
        "extra": json.dumps(r.get("extra") or {}),
    }


def emit_events(rows: list[dict[str, Any]]) -> None:
    """
    Batch INSERT rows into WONDER_EVENTS. Silently skips if Snowflake is not
    configured. Call via asyncio.to_thread() to avoid blocking the event loop.
    """
    if not rows or not _snowflake_configured():
        return
    try:
        conn = _get_connection()
        cur = conn.cursor()
        cur.executemany(_INSERT_SQL, [_normalise(r) for r in rows])
        conn.commit()
    except Exception:
        logger.exception("Snowflake emit_events failed — dropping %d rows", len(rows))
