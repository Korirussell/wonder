from __future__ import annotations

import json
from pathlib import Path

from services.generation_orchestrator import (
    GenerateInstrumentRequest,
    GenerationOrchestrator,
)
from services.intent_agent import IntentAgent
from services.sample_generation import SavedGeneratedSample
from services.sample_models import SampleRecord, SampleSearchResult
from services.sample_selection import SampleSelectionService


class FakeRetrievalAgent:
    def __init__(self, candidates: list[SampleSearchResult]) -> None:
        self.candidates = candidates

    def retrieve(self, intent, *, limit: int = 5):
        class Result:
            def __init__(self, candidates):
                self.candidates = candidates

        return Result(self.candidates[:limit])


class FakeGenerationService:
    def __init__(self) -> None:
        self.calls = []

    def generate_and_save(
        self, prompt: str, *, duration_seconds: float = 2.0, output_format=None
    ):
        self.calls.append((prompt, duration_seconds, output_format))
        return SavedGeneratedSample(
            record=SampleRecord(
                id="generated-1",
                file_path="/tmp/generated.mp3",
                file_name="generated.mp3",
                source="elevenlabs",
                description=f"Generated from prompt: {prompt}",
            ),
            saved_path="/tmp/generated.mp3",
        )


def test_generation_eval_cases() -> None:
    cases = json.loads(
        Path(__file__)
        .with_name("generation_eval_cases.json")
        .read_text(encoding="utf-8")
    )
    for case in cases:
        candidates = [
            SampleSearchResult.model_validate(item) for item in case["candidates"]
        ]
        generation = FakeGenerationService()
        orchestrator = GenerationOrchestrator(
            FakeRetrievalAgent(candidates),
            generation,
            intent_agent=IntentAgent(),
            selection_service=SampleSelectionService(
                reuse_threshold=0.75, margin_threshold=0.05
            ),
        )

        result = orchestrator.generate_instrument(
            GenerateInstrumentRequest(prompt=case["prompt"])
        )

        assert result.strategy == case["expected_strategy"], case["name"]
