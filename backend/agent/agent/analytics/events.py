"""Fire-and-forget analytics event emission to Snowflake."""
from __future__ import annotations

import uuid
from typing import Any

from .snowflake_client import insert_event


async def emit_event(
    user_id: str,
    session_id: str,
    event_type: str,
    **kwargs: Any,
) -> None:
    """Emit a generic analytics event. Never raises."""
    try:
        await insert_event(
            {
                "event_id": str(uuid.uuid4()),
                "user_id": user_id,
                "session_id": session_id,
                "event_type": event_type,
                "details": kwargs,
            }
        )
    except Exception:
        pass


async def emit_tool_call(
    user_id: str,
    session_id: str,
    tool_name: str,
    params: dict[str, Any],
    result: dict[str, Any],
) -> None:
    """Emit a structured tool_call event, extracting music-relevant fields."""
    try:
        await insert_event(
            {
                "event_id": str(uuid.uuid4()),
                "user_id": user_id,
                "session_id": session_id,
                "event_type": "tool_call",
                "tool_name": tool_name,
                "genre": params.get("style") or params.get("genre"),
                "bpm": params.get("bpm") or params.get("tempo"),
                "key_name": params.get("key") or params.get("root_note"),
                "scale": params.get("scale"),
                "track_count": result.get("track_count"),
                "details": {"params": params, "result_keys": list(result.keys())},
            }
        )
    except Exception:
        pass
