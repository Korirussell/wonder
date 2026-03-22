from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from services.sample_database import SampleDatabaseService
from services.sample_embedding import SampleEmbeddingService
from services.sample_models import SampleRecord


TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


class DocumentEmbeddingService(Protocol):
    def embed_document(self, text: str) -> list[float]: ...


@dataclass(slots=True)
class SampleIndexingResult:
    sample_root: str
    processed_files: int
    indexed_records: int


class SampleIndexingService:
    def __init__(
        self,
        database: SampleDatabaseService,
        embedding_service: DocumentEmbeddingService | None = None,
        sample_root: str | None = None,
        sample_extensions: tuple[str, ...] = (".wav", ".aif", ".aiff", ".mp3"),
    ) -> None:
        self.database = database
        self.embedding_service = embedding_service or SampleEmbeddingService(
            database.embedding_service.config
        )
        self.sample_root = self._resolve_sample_root(
            sample_root or os.getenv("SAMPLE_DIR", "./samples")
        )
        self.sample_extensions = tuple(ext.lower() for ext in sample_extensions)

    def index_local_samples(self) -> SampleIndexingResult:
        sample_root = Path(self.sample_root)
        if not sample_root.exists() or not sample_root.is_dir():
            raise FileNotFoundError(f"Sample directory not found: {sample_root}")

        records: list[SampleRecord] = []
        processed_files = 0
        for path in sorted(sample_root.rglob("*"), key=lambda item: str(item).lower()):
            if not path.is_file() or path.suffix.lower() not in self.sample_extensions:
                continue
            processed_files += 1
            records.append(self._build_record(path, sample_root))

        indexed = self.database.upsert_samples(records)
        return SampleIndexingResult(
            sample_root=str(sample_root),
            processed_files=processed_files,
            indexed_records=len(indexed),
        )

    def _build_record(self, path: Path, sample_root: Path) -> SampleRecord:
        relative = path.relative_to(sample_root)
        parts = relative.parts[:-1]
        category = self._clean_label(parts[-1]) if parts else None
        sub_category = self._clean_label(parts[-2]) if len(parts) >= 2 else None
        tags = self._build_tags(relative)

        record = SampleRecord(
            file_path=str(path),
            file_name=path.name,
            file_extension=path.suffix.lower(),
            source="local",
            category=category,
            sub_category=sub_category,
            tags=tags,
            description=self._describe(relative),
            duration=None,
        ).normalized(self.database.vector_dim)
        record = record.model_copy(
            update={
                "vector": self.embedding_service.embed_document(
                    record.search_text or ""
                )
            }
        )
        return record.normalized(self.database.vector_dim)

    def _build_tags(self, relative: Path) -> list[str]:
        tags: list[str] = []
        for part in list(relative.parts[:-1]) + [relative.stem]:
            for token in TOKEN_RE.findall(part.lower()):
                if token not in tags:
                    tags.append(token)
        return tags

    def _describe(self, relative: Path) -> str:
        folders = [
            self._clean_label(part)
            for part in relative.parts[:-1]
            if self._clean_label(part)
        ]
        if folders:
            return f"Local sample from {' > '.join(folders)}"
        return "Local sample"

    def _clean_label(self, value: str) -> str:
        cleaned = re.sub(r"[_-]+", " ", value).strip()
        return cleaned or value.strip()

    def _resolve_sample_root(self, sample_root: str) -> str:
        path = Path(sample_root).expanduser()
        if path.is_absolute():
            return str(path)
        backend_root = Path(__file__).resolve().parent.parent
        return str((backend_root / path).resolve())
