from __future__ import annotations

import re

from services.sample_database import SampleDatabaseService
from services.sample_models import SampleRecord, SampleSearchRequest, SampleSearchResult


TOKEN_RE = re.compile(r"[a-z0-9]+")


class SampleSearchService:
    def __init__(self, database: SampleDatabaseService):
        self.database = database

    def search(self, request: SampleSearchRequest) -> list[SampleSearchResult]:
        candidates = self.database.filtered_samples(
            tags=request.tags,
            source=request.source,
            category=request.category,
            sub_category=request.sub_category,
        )
        query_tokens = _tokenize(request.query)
        if not query_tokens:
            return []

        scored: list[SampleSearchResult] = []
        for candidate in candidates:
            score = _score_candidate(request.query, query_tokens, candidate)
            if score <= 0:
                continue
            scored.append(
                SampleSearchResult(
                    id=candidate.id or "",
                    file_path=candidate.file_path,
                    file_name=candidate.file_name,
                    source=candidate.source,
                    category=candidate.category,
                    sub_category=candidate.sub_category,
                    tags=candidate.tags,
                    description=candidate.description,
                    duration=candidate.duration,
                    similarity_score=score,
                )
            )

        scored.sort(
            key=lambda result: (-result.similarity_score, result.file_name.lower())
        )
        return scored[: request.limit]


def _tokenize(value: str) -> set[str]:
    return set(TOKEN_RE.findall(value.lower()))


def _score_candidate(
    query: str, query_tokens: set[str], candidate: SampleRecord
) -> float:
    weighted_fields = [
        (candidate.category or "", 3.0),
        (candidate.sub_category or "", 2.5),
        (" ".join(candidate.tags), 2.5),
        (candidate.file_name, 1.5),
        (candidate.description or "", 1.0),
        (candidate.source, 0.5),
    ]
    score = 0.0
    for field_value, weight in weighted_fields:
        field_tokens = _tokenize(field_value)
        overlap = query_tokens & field_tokens
        if overlap:
            score += weight * (len(overlap) / len(query_tokens))
    full_text = " ".join(
        [
            candidate.file_name,
            candidate.category or "",
            candidate.sub_category or "",
            " ".join(candidate.tags),
            candidate.description or "",
        ]
    ).lower()
    phrase = " ".join(TOKEN_RE.findall(query.lower()))
    if phrase and phrase in full_text:
        score += 0.5
    return round(score, 6)
