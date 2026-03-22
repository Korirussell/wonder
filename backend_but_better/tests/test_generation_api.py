from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from api.generation import get_generation_orchestrator
from main import app
from services.generation_orchestrator import (
    GenerateInstrumentRequest,
    GenerateInstrumentResponse,
)
from services.sample_models import SampleSearchResult


class FakeOrchestrator:
    def __init__(self, response: GenerateInstrumentResponse) -> None:
        self.response = response
        self.requests: list[GenerateInstrumentRequest] = []

    def generate_instrument(
        self, request: GenerateInstrumentRequest
    ) -> GenerateInstrumentResponse:
        self.requests.append(request)
        return self.response


def test_generate_instrument_returns_existing_sample() -> None:
    orchestrator = FakeOrchestrator(
        GenerateInstrumentResponse(
            strategy="existing",
            sample_id="sample-1",
            audio_url="/samples/sample-1/audio",
            file_name="warm_lead.wav",
            description="Warm analog synth lead",
            source="local",
            similarity_score=0.84,
            comparison_score=0.87,
            alternatives=[
                SampleSearchResult(
                    id="sample-2",
                    file_path="/tmp/alt.wav",
                    file_name="alt.wav",
                    source="local",
                    description="Alternate lead",
                    similarity_score=0.73,
                )
            ],
        )
    )
    app.dependency_overrides[get_generation_orchestrator] = lambda: orchestrator
    client = TestClient(app)

    response = client.post(
        "/generate-instrument",
        json={"prompt": "warm analog synth lead", "duration_seconds": 2.0},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["strategy"] == "existing"
    assert body["sample_id"] == "sample-1"
    assert body["audio_url"] == "/samples/sample-1/audio"
    assert len(body["alternatives"]) == 1
    assert orchestrator.requests[0].prompt == "warm analog synth lead"
    app.dependency_overrides.clear()


def test_generate_instrument_returns_generated_sample() -> None:
    orchestrator = FakeOrchestrator(
        GenerateInstrumentResponse(
            strategy="generated",
            sample_id="sample-new",
            audio_url="/samples/sample-new/audio",
            file_name="gen_dark_riser_1.mp3",
            description="Generated from prompt: Dark noisy riser",
            source="elevenlabs",
            similarity_score=None,
            comparison_score=0.44,
            alternatives=[],
        )
    )
    app.dependency_overrides[get_generation_orchestrator] = lambda: orchestrator
    client = TestClient(app)

    response = client.post(
        "/generate-instrument",
        json={"prompt": "Dark noisy riser", "duration_seconds": 1.8},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["strategy"] == "generated"
    assert body["source"] == "elevenlabs"
    assert body["similarity_score"] is None
    app.dependency_overrides.clear()
