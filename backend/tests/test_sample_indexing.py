from __future__ import annotations

from pathlib import Path

from services.sample_indexing import SampleIndexingService
from tests.helpers import make_test_database, write_silent_wav


class FakeDocumentEmbeddingService:
    def __init__(self, vector_dim: int) -> None:
        self.vector_dim = vector_dim
        self.calls: list[str] = []

    def embed_document(self, text: str) -> list[float]:
        self.calls.append(text)
        values = [float(len(text)), float(len(self.calls))]
        return values + [0.0] * (self.vector_dim - len(values))


def test_index_local_samples_creates_records(tmp_path: Path) -> None:
    sample_root = tmp_path / "samples"
    audio_path = sample_root / "drums" / "kicks" / "kick one.wav"
    audio_path.parent.mkdir(parents=True)
    write_silent_wav(audio_path)

    database = make_test_database(tmp_path)
    embedding_service = FakeDocumentEmbeddingService(vector_dim=4)
    indexer = SampleIndexingService(
        database=database,
        embedding_service=embedding_service,
        sample_root=str(sample_root),
    )

    result = indexer.index_local_samples()
    records = database.list_samples()

    assert result.processed_files == 1
    assert result.indexed_records == 1
    assert len(records) == 1
    assert records[0].category == "kicks"
    assert records[0].sub_category == "drums"
    assert "kick" in records[0].tags
    assert records[0].search_text is not None
    assert embedding_service.calls == [records[0].search_text]


def test_reindex_updates_existing_sample_without_duplicates(tmp_path: Path) -> None:
    sample_root = tmp_path / "samples"
    audio_path = sample_root / "synth" / "lead.wav"
    audio_path.parent.mkdir(parents=True)
    write_silent_wav(audio_path)

    database = make_test_database(tmp_path)
    embedding_service = FakeDocumentEmbeddingService(vector_dim=4)
    indexer = SampleIndexingService(
        database=database,
        embedding_service=embedding_service,
        sample_root=str(sample_root),
    )

    first = indexer.index_local_samples()
    second = indexer.index_local_samples()
    records = database.list_samples()

    assert first.indexed_records == 1
    assert second.indexed_records == 1
    assert len(records) == 1
    assert records[0].file_name == "lead.wav"
