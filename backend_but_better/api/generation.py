from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from api.samples import get_sample_database, get_sample_search_service
from services.generation_orchestrator import (
    GenerateInstrumentRequest,
    GenerateInstrumentResponse,
    GenerationOrchestrator,
)
from services.sample_generation import SampleGenerationService
from services.sample_search import SampleSearchService


router = APIRouter(tags=["generation"])


class GenerateInstrumentBody(BaseModel):
    prompt: str
    duration_seconds: float = Field(default=2.0, ge=0.5, le=5.0)
    output_format: str | None = None
    search_limit: int = Field(default=5, ge=1, le=10)


class GenerateInstrumentResult(BaseModel):
    strategy: str
    sample_id: str
    audio_url: str
    file_name: str
    description: str | None = None
    source: str
    similarity_score: float | None = None
    alternatives: list[dict[str, object]] = Field(default_factory=list)


def get_sample_generation_service(
    database=Depends(get_sample_database),
) -> SampleGenerationService:
    return SampleGenerationService(database=database)


def get_generation_orchestrator(
    search_service: SampleSearchService = Depends(get_sample_search_service),
    generation_service: SampleGenerationService = Depends(
        get_sample_generation_service
    ),
) -> GenerationOrchestrator:
    return GenerationOrchestrator(search_service, generation_service)


@router.post("/generate-instrument", response_model=GenerateInstrumentResult)
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
        alternatives=[
            candidate.model_dump(mode="python") for candidate in result.alternatives
        ],
    )
