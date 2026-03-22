from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, cast

from services.intent_agent import IntentAgent
from services.retrieval_agent import RetrievalResult
from services.sample_generation import SampleGenerationService, SavedGeneratedSample
from services.sample_models import SampleSearchResult
from services.sample_selection import SampleSelectionService


class SampleGenerator(Protocol):
    def generate_and_save(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ) -> SavedGeneratedSample: ...


class RetrievalExecutor(Protocol):
    def retrieve(self, intent, *, limit: int = 5) -> RetrievalResult: ...


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
    comparison_score: float | None
    alternatives: list[SampleSearchResult]


class GenerationOrchestrator:
    def __init__(
        self,
        retrieval_agent: RetrievalExecutor,
        generation_service: SampleGenerator,
        intent_agent: IntentAgent | None = None,
        selection_service: SampleSelectionService | None = None,
        reuse_threshold: float | None = None,
    ) -> None:
        self.intent_agent = intent_agent or IntentAgent()
        self.retrieval_agent = retrieval_agent
        self.generation_service = generation_service
        self.selection_service = selection_service or SampleSelectionService(
            reuse_threshold=reuse_threshold
        )

    def generate_instrument(
        self,
        request: GenerateInstrumentRequest,
    ) -> GenerateInstrumentResponse:
        intent = self.intent_agent.analyze(request.prompt)
        retrieval = self.retrieval_agent.retrieve(intent, limit=request.search_limit)
        candidates = retrieval.candidates
        decision = self.selection_service.choose_strategy(candidates)
        best = decision.selected

        if decision.strategy == "existing" and best is not None:
            return GenerateInstrumentResponse(
                strategy="existing",
                sample_id=best.id,
                audio_url=f"/samples/{best.id}/audio",
                file_name=best.file_name,
                description=best.description,
                source=best.source,
                similarity_score=best.similarity_score,
                comparison_score=best.comparison_score,
                alternatives=decision.alternatives,
            )

        saved = self.generation_service.generate_and_save(
            intent.normalized_prompt,
            duration_seconds=intent.duration_seconds or request.duration_seconds,
            output_format=request.output_format,
        )
        saved_record = cast(SavedGeneratedSample, saved).record
        return GenerateInstrumentResponse(
            strategy="generated",
            sample_id=saved_record.id or "",
            audio_url=f"/samples/{saved_record.id}/audio",
            file_name=saved_record.file_name,
            description=saved_record.description,
            source=saved_record.source,
            similarity_score=None,
            comparison_score=decision.confidence_score,
            alternatives=decision.alternatives,
        )
