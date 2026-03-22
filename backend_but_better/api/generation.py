from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.samples import get_sample_database, get_sample_search_service
from services.elevenlabs_service import ElevenLabsService
from services.generation_orchestrator import (
    GenerateInstrumentRequest,
    GenerateInstrumentResponse,
    GenerationOrchestrator,
)
from services.retrieval_agent import RetrievalAgent
from services.sample_generation import SampleGenerationService
from services.sample_search import SampleSearchService


router = APIRouter(tags=["generation"])

# Silently injected to every /generate-sample call so all sounds match the Wonder vibe
_WONDER_STYLE_SUFFIX = ", warm, analog, lo-fi aesthetic, vinyl noise, tape saturation"


class GenerateSampleBody(BaseModel):
    prompt: str = Field(description="Natural-language description of the requested sound")
    duration_seconds: float = Field(default=2.0, ge=0.5, le=5.0)


@router.post(
    "/generate-sample",
    summary="Generate a custom sound effect and return as base64 audio",
    description="Calls ElevenLabs with the Wonder style profile baked in. Returns raw MP3 as a base64 string so the frontend can load it as a data URI without touching the filesystem.",
)
def generate_sample(body: GenerateSampleBody) -> dict[str, str]:
    styled_prompt = body.prompt.strip() + _WONDER_STYLE_SUFFIX
    try:
        result = ElevenLabsService().generate_sound(
            styled_prompt, duration_seconds=body.duration_seconds
        )
        return {
            "audio_base64": base64.b64encode(result.audio_bytes).decode("utf-8"),
            "prompt": body.prompt,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


class GenerateLoopBody(BaseModel):
    prompt: str = Field(description="Enriched description including BPM and key (injected by frontend)")
    duration_seconds: float = Field(default=8.0, ge=0.5, le=22.0, description="Exact BPM-derived duration, clamped to ElevenLabs 22s max")
    bars: int = Field(default=4, ge=1, le=16)
    bpm: float = Field(default=120.0)
    loop: bool = Field(default=True)


@router.post(
    "/generate-loop",
    summary="Generate a BPM-synced looping backing track and return as base64",
    description=(
        "Receives a pre-enriched prompt (BPM + key already injected by the frontend). "
        "Appends the Wonder style suffix and calls ElevenLabs at the exact calculated duration. "
        "Returns raw MP3 as base64 — no filesystem writes, safe across split dev environments."
    ),
)
def generate_loop(body: GenerateLoopBody) -> dict[str, object]:
    styled_prompt = body.prompt.strip() + _WONDER_STYLE_SUFFIX
    try:
        result = ElevenLabsService().generate_sound(
            styled_prompt, duration_seconds=body.duration_seconds
        )
        return {
            "audio_base64": base64.b64encode(result.audio_bytes).decode("utf-8"),
            "prompt": body.prompt,
            "duration_seconds": body.duration_seconds,
            "bars": body.bars,
            "bpm": body.bpm,
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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
