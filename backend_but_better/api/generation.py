from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.samples import get_sample_database, get_sample_search_service
from services.generation_orchestrator import (
    GenerateInstrumentRequest,
    GenerateInstrumentResponse,
    GenerationOrchestrator,
)
from services.retrieval_agent import RetrievalAgent
from services.sample_generation import SampleGenerationService
from services.sample_search import SampleSearchService


router = APIRouter(tags=["generation"])


class GenerateInstrumentBody(BaseModel):
    prompt: str = Field(
        description="Natural-language description of the requested sound"
    )
    duration_seconds: float = Field(
        default=2.0, ge=0.5, le=5.0, description="Optional target duration in seconds"
    )
    output_format: str | None = Field(
        default=None, description="Optional generation provider output format override"
    )
    search_limit: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Number of indexed candidates to inspect before generating",
    )


class GenerateInstrumentResult(BaseModel):
    strategy: str
    sample_id: str
    audio_url: str
    file_name: str
    description: str | None = None
    source: str
    similarity_score: float | None = None
    comparison_score: float | None = None
    alternatives: list[dict[str, object]] = Field(default_factory=list)


def get_sample_generation_service(
    database=Depends(get_sample_database),
) -> SampleGenerationService:
    return SampleGenerationService(database=database)


def get_retrieval_agent(
    search_service: SampleSearchService = Depends(get_sample_search_service),
) -> RetrievalAgent:
    return RetrievalAgent(search_service)


def get_generation_orchestrator(
    retrieval_agent: RetrievalAgent = Depends(get_retrieval_agent),
    generation_service: SampleGenerationService = Depends(
        get_sample_generation_service
    ),
) -> GenerationOrchestrator:
    return GenerationOrchestrator(retrieval_agent, generation_service)


@router.post(
    "/generate-instrument",
    response_model=GenerateInstrumentResult,
    summary="Find or generate an instrument sample",
    description="Searches indexed samples first, then falls back to ElevenLabs generation if confidence is too low.",
)
def generate_instrument(
    body: GenerateInstrumentBody,
    orchestrator: GenerationOrchestrator = Depends(get_generation_orchestrator),
) -> GenerateInstrumentResult:
    result = orchestrator.generate_instrument(
        GenerateInstrumentRequest(
            prompt=body.prompt,
            duration_seconds=body.duration_seconds,
            output_format=body.output_format,
            search_limit=body.search_limit,
        )
    )
    return GenerateInstrumentResult(
        strategy=result.strategy,
        sample_id=result.sample_id,
        audio_url=result.audio_url,
        file_name=result.file_name,
        description=result.description,
        source=result.source,
        similarity_score=result.similarity_score,
        comparison_score=result.comparison_score,
        alternatives=[
            candidate.model_dump(mode="python") for candidate in result.alternatives
        ],
    )
