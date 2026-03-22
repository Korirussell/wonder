from __future__ import annotations

import os
from dataclasses import dataclass

from services.sample_models import SampleRecord, build_search_text, normalize_vector


@dataclass(slots=True)
class EmbeddingConfig:
    model_name: str = os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")
    vector_dim: int = int(
        os.getenv("SAMPLE_VECTOR_DIM", os.getenv("GEMINI_EMBEDDING_DIM", "3072"))
    )


class SampleEmbeddingService:
    def __init__(self, config: EmbeddingConfig | None = None) -> None:
        self.config = config or EmbeddingConfig()

    def build_sample_search_text(self, record: SampleRecord) -> str:
        return build_search_text(record.model_dump())

    def prepare_query_text(self, query: str) -> str:
        return " ".join(query.split())

    def normalize_embedding(self, vector: object) -> list[float]:
        return normalize_vector(vector, self.config.vector_dim)

    def embed_query(self, query: str) -> list[float]:
        raise NotImplementedError(
            "Query embedding is not wired yet. Next step: connect Gemini embedding generation here "
            "and pass the normalized vector into LanceDB table.search(...)."
        )
