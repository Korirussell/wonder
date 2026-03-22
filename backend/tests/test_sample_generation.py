from __future__ import annotations

from pathlib import Path

from services.elevenlabs_service import GeneratedSoundResult
from services.sample_generation import SampleGenerationService
from services.sample_models import SampleSearchRequest
from services.sample_search import SampleSearchService
from tests.helpers import make_test_database


class FakeGenerationClient:
    def __init__(self, generated: GeneratedSoundResult) -> None:
        self.generated = generated
        self.calls: list[tuple[str, float, str | None]] = []

    def generate_sound(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ) -> GeneratedSoundResult:
        self.calls.append((prompt, duration_seconds, output_format))
        return self.generated


class FakeEmbeddingService:
    def __init__(self, vector_dim: int) -> None:
        self.vector_dim = vector_dim
        self.calls: list[str] = []

    def embed_document(self, text: str) -> list[float]:
        self.calls.append(text)
        return [0.9, 0.1] + [0.0] * (self.vector_dim - 2)

    def embed_query(self, query: str) -> list[float]:
        return [0.9, 0.1] + [0.0] * (self.vector_dim - 2)


def test_save_generated_sound_persists_file_and_indexes_record(tmp_path: Path) -> None:
    database = make_test_database(tmp_path)
    embedding = FakeEmbeddingService(vector_dim=4)
    generated = GeneratedSoundResult(
        audio_bytes=b"ID3fake-mp3",
        content_type="audio/mpeg",
        prompt="Warm analog synth stab",
        duration_seconds=2.5,
        output_format="mp3_44100_128",
        provider="elevenlabs",
        model_id="sfx-v1",
    )
    service = SampleGenerationService(
        database=database,
        generation_client=FakeGenerationClient(generated),
        embedding_service=embedding,
        output_dir=str(tmp_path / "generated"),
    )

    saved = service.save_generated_sound(generated)
    stored = database.get_sample(saved.record.id or "")

    assert Path(saved.saved_path).exists()
    assert Path(saved.saved_path).read_bytes() == b"ID3fake-mp3"
    assert stored is not None
    assert stored.source == "elevenlabs"
    assert stored.provider == "elevenlabs"
    assert stored.provider_asset_id == "sfx-v1"
    assert stored.generation_prompt == "Warm analog synth stab"
    assert stored.file_extension == ".mp3"
    assert embedding.calls == [stored.search_text]


def test_generate_and_save_indexes_result_searchable(tmp_path: Path) -> None:
    database = make_test_database(tmp_path)
    embedding = FakeEmbeddingService(vector_dim=4)
    generation_client = FakeGenerationClient(
        GeneratedSoundResult(
            audio_bytes=b"ID3searchable",
            content_type="audio/mpeg",
            prompt="Dark noisy riser",
            duration_seconds=1.8,
            output_format="mp3_44100_128",
            provider="elevenlabs",
            model_id="sfx-v2",
        )
    )
    database.embedding_service = embedding
    service = SampleGenerationService(
        database=database,
        generation_client=generation_client,
        embedding_service=embedding,
        output_dir=str(tmp_path / "generated"),
    )

    service.generate_and_save("Dark noisy riser", duration_seconds=1.8)
    search = SampleSearchService(database, embedding_service=embedding)
    results = search.search(
        SampleSearchRequest(query="Dark noisy riser", limit=5, source="elevenlabs")
    )

    assert generation_client.calls == [("Dark noisy riser", 1.8, None)]
    assert len(results) == 1
    assert results[0].source == "elevenlabs"
    assert results[0].similarity_score > 0
