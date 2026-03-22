"""
Snowflake client for Wonder analytics.

Config via env vars (all optional — all ops are no-ops if SNOWFLAKE_ACCOUNT is unset):
    SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
    SNOWFLAKE_DATABASE  (default: WONDER)
    SNOWFLAKE_SCHEMA    (default: PUBLIC)
    SNOWFLAKE_WAREHOUSE (default: COMPUTE_WH)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_ENABLED = bool(os.getenv("SNOWFLAKE_ACCOUNT"))


def _get_connection() -> Any:
    """Return a Snowflake connection, or None if not configured / unavailable."""
    if not _ENABLED:
        return None
    try:
        import snowflake.connector  # type: ignore[import]

        return snowflake.connector.connect(
            account=os.environ["SNOWFLAKE_ACCOUNT"],
            user=os.environ["SNOWFLAKE_USER"],
            password=os.environ["SNOWFLAKE_PASSWORD"],
            database=os.getenv("SNOWFLAKE_DATABASE", "WONDER"),
            schema=os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
            warehouse=os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"),
        )
    except Exception as exc:
        logger.warning("Snowflake connection failed: %s", exc)
        return None


def ensure_tables() -> None:
    """Create wonder_events table and wonder_user_prefs view if they don't exist."""
    conn = _get_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS wonder_events (
                event_id   VARCHAR,
                user_id    VARCHAR,
                session_id VARCHAR,
                ts         TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP,
                event_type VARCHAR,
                tool_name  VARCHAR,
                genre      VARCHAR,
                bpm        FLOAT,
                key_name   VARCHAR,
                scale      VARCHAR,
                track_count INTEGER,
                details    VARIANT
            )
            """
        )
        cur.execute(
            """
            CREATE OR REPLACE VIEW wonder_user_prefs AS
            SELECT
                user_id,
                MODE(genre)      AS preferred_genre,
                MEDIAN(bpm)      AS median_bpm,
                MODE(key_name)   AS preferred_key,
                MODE(scale)      AS preferred_scale,
                COUNT(DISTINCT session_id) AS session_count,
                SUM(track_count) AS total_tracks
            FROM wonder_events
            WHERE event_type IN ('session_end', 'tool_call')
              AND genre IS NOT NULL
            GROUP BY user_id
            """
        )
        conn.commit()
    except Exception as exc:
        logger.warning("Snowflake table setup failed (non-critical): %s", exc)
    finally:
        conn.close()


def _sync_insert(row: dict[str, Any]) -> None:
    conn = _get_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO wonder_events
                (event_id, user_id, session_id, event_type, tool_name,
                 genre, bpm, key_name, scale, track_count, details)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, PARSE_JSON(%s))
            """,
            (
                row.get("event_id", ""),
                row.get("user_id", ""),
                row.get("session_id", ""),
                row.get("event_type", ""),
                row.get("tool_name"),
                row.get("genre"),
                row.get("bpm"),
                row.get("key_name"),
                row.get("scale"),
                row.get("track_count"),
                json.dumps(row.get("details", {})),
            ),
        )
        conn.commit()
    except Exception as exc:
        logger.debug("Snowflake insert failed (non-critical): %s", exc)
    finally:
        conn.close()


async def insert_event(row: dict[str, Any]) -> None:
    """Async fire-and-forget INSERT. Never raises."""
    if not _ENABLED:
        return
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _sync_insert, row)
    except Exception as exc:
        logger.debug("insert_event failed silently: %s", exc)


def query_user_prefs(user_id: str) -> dict[str, Any]:
    """Query wonder_user_prefs for a user. Returns {} if not found or Snowflake is unavailable."""
    conn = _get_connection()
    if not conn:
        return {}
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT preferred_genre, median_bpm, preferred_key, preferred_scale, "
            "session_count, total_tracks FROM wonder_user_prefs WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        if row:
            return {
                "preferred_genre": row[0],
                "median_bpm": row[1],
                "preferred_key": row[2],
                "preferred_scale": row[3],
                "session_count": row[4],
                "total_tracks": row[5],
            }
        return {}
    except Exception as exc:
        logger.debug("query_user_prefs failed silently: %s", exc)
        return {}
    finally:
        conn.close()
