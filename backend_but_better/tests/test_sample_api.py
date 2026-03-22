from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from api.samples import get_sample_database
from main import app
from services.sample_database import SampleDatabaseService
from services.sample_models import SampleRecord
from tests.helpers import write_silent_wav


def make_database(tmp_path: Path) -> SampleDatabaseService:
    return SampleDatabaseService(
        db_path=str(tmp_path / "sample_library.lance"),
        table_name="samples",
        vector_dim=4,
    )


class FakeEmbeddingService:
    def __init__(self, embedding: list[float]) -> None:
        self.embedding = embedding

    def embed_query(self, query: str) -> list[float]:
        return self.embedding


def seed_record(tmp_path: Path, database: SampleDatabaseService) -> SampleRecord:
    audio_path = tmp_path / "generated.wav"
    write_silent_wav(audio_path)
    record = SampleRecord(
        file_path=str(audio_path),
        file_name="generated.wav",
        source="local",
        category="synth",
        sub_category="lead",
        tags=["warm", "analog"],
        description="Warm analog synth lead",
        vector=[0.3, 0.9],
        duration=1.2,
    )
    database.upsert_samples([record])
    return record.normalized(4)


def test_search_endpoint_returns_ranked_results(tmp_path: Path) -> None:
    database = make_database(tmp_path)
    seed_record(tmp_path, database)
    database.embedding_service = FakeEmbeddingService([0.3, 0.9, 0.0, 0.0])
    app.dependency_overrides[get_sample_database] = lambda: database
    client = TestClient(app)

    response = client.post(
        "/samples/search",
        json={"query": "warm synth lead", "limit": 3},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["file_name"] == "generated.wav"
    assert body[0]["similarity_score"] > 0
    app.dependency_overrides.clear()


def test_audio_endpoint_streams_wav_file(tmp_path: Path) -> None:
    database = make_database(tmp_path)
    stored = seed_record(tmp_path, database)
    app.dependency_overrides[get_sample_database] = lambda: database
    client = TestClient(app)

    response = client.get(f"/samples/{stored.id}/audio")

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content.startswith(b"RIFF")
    app.dependency_overrides.clear()
