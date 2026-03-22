from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from services.sample_database import SampleDatabaseService
from services.sample_embedding import EmbeddingConfig, SampleEmbeddingService
from services.sample_models import SampleRecord
from services.sample_models import SampleSearchRequest
from services.sample_search import SampleSearchService
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


def seed_records(tmp_path: Path, database: SampleDatabaseService) -> list[SampleRecord]:
    kick_path = tmp_path / "kick.wav"
    hat_path = tmp_path / "hat.wav"
    write_silent_wav(kick_path)
    write_silent_wav(hat_path)

    records = [
        SampleRecord(
            file_path=str(kick_path),
            file_name="kick.wav",
            source="local",
            category="drums",
            sub_category="kick",
            tags=["punchy", "808", "tight"],
            description="Punchy 808 kick drum",
            vector=[1.0, 0.5],
            brightness=0.2,
            punch=0.9,
            duration=0.5,
        ),
        SampleRecord(
            file_path=str(hat_path),
            file_name="hat.wav",
            source="local",
            category="drums",
            sub_category="hat",
            tags=["airy", "bright"],
            description="Bright airy hi hat",
            vector=[0.2, 0.1, 0.6],
            brightness=0.8,
            punch=0.2,
            duration=0.25,
        ),
    ]
    database.upsert_samples(records)
    return records


def test_upsert_and_get_sample(tmp_path: Path) -> None:
    database = make_database(tmp_path)
    records = seed_records(tmp_path, database)

    stored = database.get_sample(records[0].normalized(4).id or "")

    assert stored is not None
    assert stored.file_name == "kick.wav"
    assert (
        stored.search_text
        == "kick.wav drums kick Punchy 808 kick drum punchy 808 tight"
    )
    assert stored.vector == [1.0, 0.5, 0.0, 0.0]


def test_filtered_samples_require_all_tags(tmp_path: Path) -> None:
    database = make_database(tmp_path)
    seed_records(tmp_path, database)

    results = database.filtered_samples(tags=["808", "tight"], category="drums")

    assert [record.file_name for record in results] == ["kick.wav"]


def test_search_ranks_most_relevant_sample_first(tmp_path: Path) -> None:
    database = make_database(tmp_path)
    seed_records(tmp_path, database)
    search_service = SampleSearchService(
        database,
        embedding_service=FakeEmbeddingService([1.0, 0.5, 0.0, 0.0]),
    )

    results = search_service.search(
        SampleSearchRequest(query="punchy 808 kick", limit=5)
    )

    assert [result.file_name for result in results] == ["kick.wav", "hat.wav"]
    assert results[0].similarity_score > 0


def test_embedding_service_builds_and_normalizes_search_inputs() -> None:
    service = SampleEmbeddingService(EmbeddingConfig(vector_dim=4))
    record = SampleRecord(
        file_path="/tmp/demo.wav",
        file_name="demo.wav",
        category="synth",
        sub_category="lead",
        tags=["warm", "analog"],
        description="Warm analog synth lead",
    )

    assert service.build_sample_search_text(record) == (
        "demo.wav synth lead Warm analog synth lead warm analog"
    )
    assert service.prepare_query_text("  warm   synth lead  ") == "warm synth lead"
    assert service.normalize_embedding([1.0, 2.0]) == [1.0, 2.0, 0.0, 0.0]


def test_embedding_service_embeds_query_with_gemini_client() -> None:
    service = SampleEmbeddingService(
        EmbeddingConfig(
            vector_dim=4,
            api_key="test-key",
            model_name="models/gemini-embedding-001",
        )
    )

    with (
        patch("google.generativeai.configure") as configure_mock,
        patch(
            "google.generativeai.embed_content",
            return_value={"embedding": [0.1, 0.2]},
        ) as embed_mock,
    ):
        result = service.embed_query(" warm synth lead ")

    configure_mock.assert_called_once_with(api_key="test-key")
    embed_mock.assert_called_once_with(
        model="models/gemini-embedding-001",
        content="warm synth lead",
        task_type="retrieval_query",
    )
    assert result == [0.1, 0.2, 0.0, 0.0]


def test_embedding_service_embeds_document_with_gemini_client() -> None:
    service = SampleEmbeddingService(
        EmbeddingConfig(
            vector_dim=4,
            api_key="test-key",
            model_name="models/gemini-embedding-001",
        )
    )

    with (
        patch("google.generativeai.configure") as configure_mock,
        patch(
            "google.generativeai.embed_content",
            return_value={"embedding": [0.4, 0.5, 0.6]},
        ) as embed_mock,
    ):
        result = service.embed_document(" warm analog synth ")

    configure_mock.assert_called_once_with(api_key="test-key")
    embed_mock.assert_called_once_with(
        model="models/gemini-embedding-001",
        content="warm analog synth",
        task_type="retrieval_document",
    )
    assert result == [0.4, 0.5, 0.6, 0.0]
