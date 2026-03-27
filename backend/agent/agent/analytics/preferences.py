"""User preferences derived from Snowflake analytics."""
from __future__ import annotations

import asyncio
from typing import Any

from .snowflake_client import query_user_prefs


async def get_user_preferences(user_id: str) -> dict[str, Any]:
    """
    Retrieve aggregated music preferences for a user from Snowflake analytics.

    Returns a dict with:
        preferred_genre, median_bpm, preferred_key, preferred_scale,
        session_count, total_tracks.

    Returns an empty dict if the user has no history or Snowflake is not configured.
    Call this at the start of a new session to personalise your creative choices.

    Args:
        user_id: The user ID to look up.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, query_user_prefs, user_id)
