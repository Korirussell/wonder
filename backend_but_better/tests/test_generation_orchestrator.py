from __future__ import annotations

from services.generation_orchestrator import (
    GenerateInstrumentRequest,
    GenerationOrchestrator,
)
from services.retrieval_agent import RetrievalResult
from services.sample_generation import SavedGeneratedSample
from services.sample_models import SampleRecord, SampleSearchResult


class FakeRetrievalAgent:
    def __init__(self, results: list[SampleSearchResult]) -> None:
        self.results = results

    def retrieve(self, intent, *, limit: int = 5) -> RetrievalResult:
        return RetrievalResult(self.results[:limit])


class FakeGenerationService:
    def __init__(self, saved: SavedGeneratedSample) -> None:
        self.saved = saved
        self.calls: list[tuple[str, float, str | None]] = []

    def generate_and_save(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ) -> SavedGeneratedSample:
        self.calls.append((prompt, duration_seconds, output_format))
        return self.saved


def test_orchestrator_reuses_existing_sample_above_threshold() -> None:
    retrieval = FakeRetrievalAgent(
        [
            SampleSearchResult(
                id="existing-1",
                file_path="/tmp/existing.wav",
                file_name="existing.wav",
                source="local",
                category="synth",
                sub_category="lead",
                tags=["warm", "analog"],
                description="Existing match",
                similarity_score=0.91,
                comparison_score=0.88,
            ),
            SampleSearchResult(
                id="existing-2",
                file_path="/tmp/other.wav",
                file_name="other.wav",
                source="local",
                category="fx",
                tags=["other"],
                description="Other match",
                similarity_score=0.8,
                comparison_score=0.51,
            ),
        ]
    )
    generation = FakeGenerationService(
        SavedGeneratedSample(
            record=SampleRecord(file_path="/tmp/new.mp3", file_name="new.mp3"),
            saved_path="/tmp/new.mp3",
        )
    )
    orchestrator = GenerationOrchestrator(retrieval, generation, reuse_threshold=0.75)

    result = orchestrator.generate_instrument(
        GenerateInstrumentRequest(prompt="warm lead")
    )

    assert result.strategy == "existing"
    assert result.sample_id == "existing-1"
    assert len(result.alternatives) == 1
    assert result.comparison_score is not None
    assert generation.calls == []


def test_orchestrator_generates_when_best_result_is_below_threshold() -> None:
    retrieval = FakeRetrievalAgent(
        [
            SampleSearchResult(
                id="existing-1",
                file_path="/tmp/existing.wav",
                file_name="existing.wav",
                source="local",
                category="drums",
                tags=["weak"],
                description="Weak match",
                similarity_score=0.42,
                comparison_score=0.45,
            )
        ]
    )
    saved = SavedGeneratedSample(
        record=SampleRecord(
            id="generated-1",
            file_path="/tmp/generated.mp3",
            file_name="generated.mp3",
            source="elevenlabs",
            description="Generated from prompt: noisy riser",
        ),
        saved_path="/tmp/generated.mp3",
    )
    generation = FakeGenerationService(saved)
    orchestrator = GenerationOrchestrator(retrieval, generation, reuse_threshold=0.85)

    result = orchestrator.generate_instrument(
        GenerateInstrumentRequest(prompt="noisy riser", duration_seconds=1.4)
    )

    assert result.strategy == "generated"
    assert result.sample_id == "generated-1"
    assert result.audio_url == "/samples/generated-1/audio"
    assert result.alternatives[0].id == "existing-1"
    assert result.comparison_score is not None
    assert generation.calls == [("noisy riser", 1.4, None)]
