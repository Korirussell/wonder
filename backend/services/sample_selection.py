from __future__ import annotations

import os
from dataclasses import dataclass

from services.sample_models import SampleSearchResult


@dataclass(slots=True)
class SelectionDecision:
    strategy: str
    selected: SampleSearchResult | None
    alternatives: list[SampleSearchResult]
    confidence_score: float | None
    reason: str


class SampleSelectionService:
    def __init__(
        self,
        reuse_threshold: float | None = None,
        margin_threshold: float | None = None,
    ) -> None:
        self.reuse_threshold = reuse_threshold or float(
            os.getenv("SAMPLE_REUSE_THRESHOLD", "0.72")
        )
        self.margin_threshold = margin_threshold or float(
            os.getenv("SAMPLE_REUSE_MARGIN_THRESHOLD", "0.05")
        )

    def choose_strategy(
        self,
        candidates: list[SampleSearchResult],
    ) -> SelectionDecision:
        if not candidates:
            return SelectionDecision(
                strategy="generated",
                selected=None,
                alternatives=[],
                confidence_score=None,
                reason="no_candidates",
            )

        best = candidates[0]
        best_score = best.comparison_score or best.similarity_score
        second_score = (
            candidates[1].comparison_score or candidates[1].similarity_score
            if len(candidates) > 1
            else 0.0
        )

        if (
            best_score >= self.reuse_threshold
            and (best_score - second_score) >= self.margin_threshold
        ):
            return SelectionDecision(
                strategy="existing",
                selected=best,
                alternatives=candidates[1:],
                confidence_score=best_score,
                reason="score_above_threshold",
            )

        return SelectionDecision(
            strategy="generated",
            selected=None,
            alternatives=candidates,
            confidence_score=best_score,
            reason="insufficient_confidence",
        )
