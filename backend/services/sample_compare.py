from __future__ import annotations

import re
from dataclasses import dataclass

from services.sample_models import SampleSearchResult


TOKEN_RE = re.compile(r"[a-z0-9]+")


@dataclass(slots=True)
class SampleCompareConfig:
    similarity_weight: float = 0.7
    tag_weight: float = 0.15
    category_weight: float = 0.1
    description_weight: float = 0.05


class SampleCompareService:
    def __init__(self, config: SampleCompareConfig | None = None) -> None:
        self.config = config or SampleCompareConfig()

    def rerank_candidates(
        self,
        prompt: str,
        candidates: list[SampleSearchResult],
    ) -> list[SampleSearchResult]:
        prompt_tokens = _tokenize(prompt)
        rescored: list[SampleSearchResult] = []
        for candidate in candidates:
            comparison_score = self._score_candidate(prompt_tokens, candidate)
            rescored.append(
                candidate.model_copy(update={"comparison_score": comparison_score})
            )
        rescored.sort(
            key=lambda item: (
                -(item.comparison_score or 0.0),
                -item.similarity_score,
                item.file_name.lower(),
            )
        )
        return rescored

    def _score_candidate(
        self,
        prompt_tokens: set[str],
        candidate: SampleSearchResult,
    ) -> float:
        similarity_component = (
            candidate.similarity_score * self.config.similarity_weight
        )
        tag_component = (
            _overlap_score(prompt_tokens, candidate.tags) * self.config.tag_weight
        )
        category_terms = [
            term for term in [candidate.category, candidate.sub_category] if term
        ]
        category_component = (
            _overlap_score(prompt_tokens, category_terms) * self.config.category_weight
        )
        description_component = (
            _overlap_score(
                prompt_tokens,
                [candidate.description or "", candidate.file_name],
            )
            * self.config.description_weight
        )
        return round(
            similarity_component
            + tag_component
            + category_component
            + description_component,
            6,
        )


def _tokenize(value: str) -> set[str]:
    return set(TOKEN_RE.findall(value.lower()))


def _overlap_score(prompt_tokens: set[str], values: list[str]) -> float:
    if not prompt_tokens:
        return 0.0
    candidate_tokens: set[str] = set()
    for value in values:
        candidate_tokens.update(_tokenize(value))
    if not candidate_tokens:
        return 0.0
    return len(prompt_tokens & candidate_tokens) / len(prompt_tokens)
