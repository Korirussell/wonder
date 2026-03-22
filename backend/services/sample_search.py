from __future__ import annotations

from typing import Protocol

from services.sample_database import SampleDatabaseService
from services.sample_embedding import SampleEmbeddingService
from services.sample_models import SampleSearchRequest, SampleSearchResult


class QueryEmbeddingService(Protocol):
    def embed_query(self, query: str) -> list[float]: ...


class SampleSearchService:
    def __init__(
        self,
        database: SampleDatabaseService,
        embedding_service: QueryEmbeddingService | None = None,
    ):
        self.database = database
        self.embedding_service = embedding_service or database.embedding_service

    def search(self, request: SampleSearchRequest) -> list[SampleSearchResult]:
        query_vector = self.embedding_service.embed_query(request.query)
        return self.database.search_by_vector(
            query_vector,
            limit=request.limit,
            tags=request.tags,
            source=request.source,
            category=request.category,
            sub_category=request.sub_category,
        )
