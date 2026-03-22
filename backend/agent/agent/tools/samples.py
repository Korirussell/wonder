"""
Sample library tools for the Wonder agent.

Let the agent query and store user samples in MongoDB so it can recommend
previously generated/uploaded sounds and keep the library organised.
"""
from __future__ import annotations

from typing import Any

from ..logging_config import get_logger

logger = get_logger("wonder.samples")


async def list_user_samples(
    user_id: str,
    limit: int = 50,
) -> dict[str, Any]:
    """
    List audio samples saved in the user's Wonder library.

    Returns {samples: [{sample_id, name, file_path, tags, bpm, key, created_at}], count}.
    Call this when the user asks to browse their library, find a previous sample,
    or when you want to reuse an existing sound.

    Args:
        user_id: The authenticated user's ID.
        limit:   Maximum number of samples to return (1–200).
    """
    logger.info("list_user_samples  user=%s  limit=%d", user_id, limit)
    try:
        from server.mongo import get_repository

        repo = get_repository()
        if repo is None:
            return {"samples": [], "count": 0, "note": "MongoDB not configured"}

        limit = max(1, min(limit, 200))
        raw = list(repo.list_samples_for_user(user_id, limit=limit, skip=0))
        samples = []
        for doc in raw:
            doc.pop("_id", None)
            samples.append(doc)

        logger.info("list_user_samples done  user=%s  count=%d", user_id, len(samples))
        return {"samples": samples, "count": len(samples)}
    except Exception as exc:
        logger.error("list_user_samples failed: %s", exc, exc_info=True)
        return {"error": str(exc), "success": False}


async def save_sample(
    user_id: str,
    name: str,
    file_path: str,
    tags: list[str] | None = None,
    bpm: float | None = None,
    key: str | None = None,
    description: str = "",
) -> dict[str, Any]:
    """
    Save or update a sample in the user's Wonder library.

    Returns {sample_id, name, file_path}.
    Call this after generating a sound, loading stems, or any time the user
    explicitly wants to save an audio file for future sessions.

    Args:
        user_id:     The authenticated user's ID.
        name:        Human-readable name for the sample.
        file_path:   Absolute server path (or URL) to the audio file.
        tags:        Optional list of tags, e.g. ["bass", "808", "generated"].
        bpm:         Detected or user-specified BPM of the sample.
        key:         Musical key, e.g. "C minor".
        description: Free-text description of the sample.
    """
    logger.info("save_sample  user=%s  name=%r  path=%s", user_id, name, file_path)
    try:
        from server.mongo import get_repository
        from server.mongo.models import SampleUpsert, SampleVibe

        repo = get_repository()
        if repo is None:
            return {"error": "MongoDB not configured", "success": False}

        payload = SampleUpsert(
            user_id=user_id,
            file_path=file_path,
            file_name=name,
            vibe=SampleVibe(tags=tags or [], description=description or None),
            extra={"bpm": bpm, "key": key} if (bpm or key) else {},
        )
        doc = repo.upsert_sample(payload)
        if doc:
            doc.pop("_id", None)
        logger.info("save_sample done  user=%s  name=%r", user_id, name)
        return doc or {"success": True, "name": name}
    except Exception as exc:
        logger.error("save_sample failed: %s", exc, exc_info=True)
        return {"error": str(exc), "success": False}
