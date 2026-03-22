from __future__ import annotations

import hashlib
import os
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import cast

from pydantic import BaseModel, Field, field_validator


def canonical_file_path(path: str) -> str:
    return os.path.normpath(os.path.abspath(os.path.expanduser(str(path).strip())))


def sample_id_for_path(path: str) -> str:
    canonical = canonical_file_path(path)
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:16]


class SampleRecord(BaseModel):
    id: str | None = None
    file_path: str
    file_name: str
    file_extension: str = ".wav"
    source: str = "local"
    provider: str | None = None
    provider_asset_id: str | None = None
    generation_prompt: str | None = None
    category: str | None = None
    sub_category: str | None = None
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    search_text: str | None = None
    vector: list[float] = Field(default_factory=list)
    brightness: float | None = None
    punch: float | None = None
    duration: float | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        if isinstance(value, list):
            return [str(item) for item in value]
        return [str(value)]

    def normalized(self, vector_dim: int) -> "SampleRecord":
        values = self.model_dump()
        path = canonical_file_path(values["file_path"])
        values["file_path"] = path
        values["id"] = values["id"] or sample_id_for_path(path)
        values["search_text"] = build_search_text(values)
        values["vector"] = normalize_vector(values.get("vector"), vector_dim)
        return SampleRecord.model_validate(values)


class SampleSearchRequest(BaseModel):
    query: str
    limit: int = Field(default=10, ge=1, le=100)
    tags: list[str] = Field(default_factory=list)
    source: str | None = None
    category: str | None = None
    sub_category: str | None = None


class SampleSearchResult(BaseModel):
    id: str
    file_path: str
    file_name: str
    source: str
    category: str | None = None
    sub_category: str | None = None
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    duration: float | None = None
    similarity_score: float


def normalize_vector(value: object, vector_dim: int) -> list[float]:
    if vector_dim <= 0:
        raise ValueError("vector_dim must be positive")
    if value is None:
        vector: list[float] = []
    elif isinstance(value, list):
        vector = [float(item) for item in value]
    elif isinstance(value, tuple):
        vector = [float(item) for item in value]
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        numeric_items = cast(Sequence[object], value)
        vector = [float(item) for item in numeric_items]
    else:
        raise TypeError("vector value must be a sequence of numbers or None")
    if len(vector) > vector_dim:
        return vector[:vector_dim]
    if len(vector) < vector_dim:
        return vector + [0.0] * (vector_dim - len(vector))
    return vector


def build_search_text(values: dict[str, object]) -> str:
    parts: list[str] = []
    for key in ("file_name", "category", "sub_category", "description"):
        value = values.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(value.strip())
    tags = values.get("tags")
    if isinstance(tags, list):
        parts.extend(str(tag).strip() for tag in tags if str(tag).strip())
    seen: set[str] = set()
    ordered_parts: list[str] = []
    for part in parts:
        lowered = part.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        ordered_parts.append(part)
    return " ".join(ordered_parts)
