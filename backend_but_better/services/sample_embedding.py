from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_SERVICE_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _SERVICE_DIR.parent
_WORKSPACE_ROOT = _BACKEND_ROOT.parent

load_dotenv(_WORKSPACE_ROOT / ".env")
load_dotenv(_BACKEND_ROOT / ".env")

from services.sample_models import SampleRecord, build_search_text, normalize_vector


@dataclass(slots=True)
class EmbeddingConfig:
    model_name: str = os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")
    vector_dim: int = int(
        os.getenv("SAMPLE_VECTOR_DIM", os.getenv("GEMINI_EMBEDDING_DIM", "3072"))
    )
    api_key: str | None = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")


class SampleEmbeddingService:
    def __init__(self, config: EmbeddingConfig | None = None) -> None:
        self.config = config or EmbeddingConfig()

    def build_sample_search_text(self, record: SampleRecord) -> str:
        return build_search_text(record.model_dump())

    def prepare_query_text(self, query: str) -> str:
        return " ".join(query.split())

    def normalize_embedding(self, vector: object) -> list[float]:
        return normalize_vector(vector, self.config.vector_dim)

    def embed_document(self, text: str) -> list[float]:
        return self._embed_text(text, task_type="retrieval_document")

    def embed_query(self, query: str) -> list[float]:
        return self._embed_text(query, task_type="retrieval_query")

    def _embed_text(self, text: str, *, task_type: str) -> list[float]:
        prepared = self.prepare_query_text(text)
        if not prepared:
            return self.normalize_embedding([])
        if not self.config.api_key:
            raise ValueError(
                "Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in the environment."
            )

        import google.generativeai as genai

        genai.configure(api_key=self.config.api_key)
        response = genai.embed_content(
            model=self.config.model_name,
            content=prepared,
            task_type=task_type,
        )
        return self.normalize_embedding(response["embedding"])
