from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Protocol

from services.sample_generation import SampleGenerationService
from services.sample_models import SampleSearchRequest, SampleSearchResult
from services.sample_search import SampleSearchService


class SampleGenerator(Protocol):
    def generate_and_save(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ): ...


@dataclass(slots=True)
class GenerateInstrumentRequest:
    prompt: str
    duration_seconds: float = 2.0
    output_format: str | None = None
    search_limit: int = 5


@dataclass(slots=True)
class GenerateInstrumentResponse:
    strategy: str
    sample_id: str
    audio_url: str
    file_name: str
    description: str | None
    source: str
    similarity_score: float | None
    alternatives: list[SampleSearchResult]


class GenerationOrchestrator:
    def __init__(
        self,
        search_service: SampleSearchService,
        generation_service: SampleGenerator,
        reuse_threshold: float | None = None,
    ) -> None:
        self.search_service = search_service
        self.generation_service = generation_service
        self.reuse_threshold = reuse_threshold or float(
            os.getenv("SAMPLE_REUSE_THRESHOLD", "0.72")
        )

    def generate_instrument(
        self,
        request: GenerateInstrumentRequest,
    ) -> GenerateInstrumentResponse:
        query = SampleSearchRequest(query=request.prompt, limit=request.search_limit)
        candidates = self.search_service.search(query)
        best = candidates[0] if candidates else None

        if best and best.similarity_score >= self.reuse_threshold:
            return GenerateInstrumentResponse(
                strategy="existing",
                sample_id=best.id,
                audio_url=f"/samples/{best.id}/audio",
                file_name=best.file_name,
                description=best.description,
                source=best.source,
                similarity_score=best.similarity_score,
                alternatives=candidates[1:],
            )

        saved = self.generation_service.generate_and_save(
            request.prompt,
            duration_seconds=request.duration_seconds,
            output_format=request.output_format,
        )
        return GenerateInstrumentResponse(
            strategy="generated",
            sample_id=saved.record.id or "",
            audio_url=f"/samples/{saved.record.id}/audio",
            file_name=saved.record.file_name,
            description=saved.record.description,
            source=saved.record.source,
            similarity_score=None,
            alternatives=candidates,
        )
