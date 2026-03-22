from __future__ import annotations

import wave
from pathlib import Path


def write_silent_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(44100)
        wav_file.writeframes(b"\x00\x00" * 32)


def make_test_database(tmp_path: Path, *, vector_dim: int = 4):
    from services.sample_database import SampleDatabaseService

    return SampleDatabaseService(
        db_path=str(tmp_path / "sample_library.lance"),
        table_name="samples",
        vector_dim=vector_dim,
    )


class FixedVectorEmbeddingService:
    """Embedding stub that always returns a fixed vector, for search tests."""

    def __init__(self, embedding: list[float]) -> None:
        self.embedding = embedding

    def embed_query(self, query: str) -> list[float]:  # noqa: ARG002
        return self.embedding
