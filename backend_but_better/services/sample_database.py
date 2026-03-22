from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from typing import cast

import lancedb

from services.sample_embedding import EmbeddingConfig, SampleEmbeddingService
from services.sample_models import (
    SampleRecord,
    SampleSearchResult,
    canonical_file_path,
    sample_id_for_path,
)


class SampleDatabaseService:
    def __init__(
        self,
        db_path: str | None = None,
        table_name: str | None = None,
        vector_dim: int | None = None,
    ) -> None:
        self.db_path = self._resolve_db_path(
            db_path or os.getenv("TAG_DB_PATH", "./data/sample_library.lance")
        )
        self.table_name = table_name or os.getenv("TAG_DB_TABLE", "samples")
        self.vector_dim = vector_dim or int(os.getenv("SAMPLE_VECTOR_DIM", "3072"))
        self.embedding_service = SampleEmbeddingService(
            EmbeddingConfig(vector_dim=self.vector_dim)
        )
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = lancedb.connect(self.db_path)

    @staticmethod
    def _resolve_db_path(db_path: str) -> str:
        path = Path(db_path).expanduser()
        if path.is_absolute():
            return str(path)
        project_root = Path(__file__).resolve().parent.parent
        return str(project_root / path)

    def upsert_samples(self, records: list[SampleRecord]) -> list[SampleRecord]:
        if not records:
            return []
        normalized = [record.normalized(self.vector_dim) for record in records]
        merged = {record.id: record for record in self.list_samples()}
        for record in normalized:
            merged[record.id] = record
        payload = [record.model_dump(mode="python") for record in merged.values()]
        self._db.create_table(self.table_name, data=payload, mode="overwrite")
        return normalized

    def list_samples(self) -> list[SampleRecord]:
        if self.table_name not in self._table_names():
            return []
        table = self._db.open_table(self.table_name)
        return [self._to_record(row) for row in table.to_arrow().to_pylist()]

    def get_sample(self, sample_id: str) -> SampleRecord | None:
        for record in self.list_samples():
            if record.id == sample_id:
                return record
        return None

    def get_sample_by_path(self, file_path: str) -> SampleRecord | None:
        canonical = canonical_file_path(file_path)
        sample_id = sample_id_for_path(canonical)
        return self.get_sample(sample_id)

    def filtered_samples(
        self,
        *,
        tags: list[str] | None = None,
        source: str | None = None,
        category: str | None = None,
        sub_category: str | None = None,
    ) -> list[SampleRecord]:
        records = self.list_samples()
        filtered: list[SampleRecord] = []
        required_tags = {tag.lower() for tag in tags or []}
        for record in records:
            if source and (record.source or "").lower() != source.lower():
                continue
            if category and (record.category or "").lower() != category.lower():
                continue
            if (
                sub_category
                and (record.sub_category or "").lower() != sub_category.lower()
            ):
                continue
            record_tags = {tag.lower() for tag in record.tags}
            if required_tags and not required_tags.issubset(record_tags):
                continue
            filtered.append(record)
        return filtered

    def search_by_vector(
        self,
        query_vector: list[float],
        *,
        limit: int,
        tags: list[str] | None = None,
        source: str | None = None,
        category: str | None = None,
        sub_category: str | None = None,
    ) -> list[SampleSearchResult]:
        if self.table_name not in self._table_names():
            return []

        table = self._db.open_table(self.table_name)
        search = table.search(
            query_vector,
            query_type="vector",
            vector_column_name="vector",
        )

        filter_expression = self._build_filter_expression(
            tags=tags,
            source=source,
            category=category,
            sub_category=sub_category,
        )
        if filter_expression:
            search = search.where(filter_expression, prefilter=True)

        rows = search.limit(limit).to_arrow().to_pylist()
        results: list[SampleSearchResult] = []
        for row in rows:
            distance = float(row.get("_distance", 0.0))
            record = self._to_record(row)
            results.append(
                SampleSearchResult(
                    id=record.id or "",
                    file_path=record.file_path,
                    file_name=record.file_name,
                    source=record.source,
                    category=record.category,
                    sub_category=record.sub_category,
                    tags=record.tags,
                    description=record.description,
                    duration=record.duration,
                    similarity_score=1.0 / (1.0 + distance),
                )
            )
        return results

    def _to_record(self, row: dict[str, Any]) -> SampleRecord:
        return SampleRecord.model_validate(row).normalized(self.vector_dim)

    def _build_filter_expression(
        self,
        *,
        tags: list[str] | None = None,
        source: str | None = None,
        category: str | None = None,
        sub_category: str | None = None,
    ) -> str | None:
        filters: list[str] = []
        if source:
            filters.append(f"source = '{self._escape(source)}'")
        if category:
            filters.append(f"category = '{self._escape(category)}'")
        if sub_category:
            filters.append(f"sub_category = '{self._escape(sub_category)}'")
        for tag in tags or []:
            filters.append(f"array_contains(tags, '{self._escape(tag)}')")
        return " AND ".join(filters) or None

    def _escape(self, value: str) -> str:
        return value.replace("'", "\\'")

    def _table_names(self) -> list[str]:
        tables = self._db.list_tables()
        names: list[str] = []
        raw_items = cast(Any, getattr(tables, "tables", tables))
        for item in raw_items:
            if isinstance(item, str):
                names.append(item)
            elif isinstance(item, tuple) and item:
                names.append(str(item[0]))
            else:
                names.append(str(item))
        return names
