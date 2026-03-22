from __future__ import annotations

from services.sample_models import SampleSearchResult
from services.sample_selection import SampleSelectionService


def test_selection_reuses_when_best_score_and_margin_are_strong() -> None:
    service = SampleSelectionService(reuse_threshold=0.75, margin_threshold=0.05)
    decision = service.choose_strategy(
        [
            SampleSearchResult(
                id="best",
                file_path="/tmp/best.wav",
                file_name="best.wav",
                source="local",
                similarity_score=0.8,
                comparison_score=0.84,
            ),
            SampleSearchResult(
                id="next",
                file_path="/tmp/next.wav",
                file_name="next.wav",
                source="local",
                similarity_score=0.78,
                comparison_score=0.76,
            ),
        ]
    )

    assert decision.strategy == "existing"
    assert decision.selected is not None
    assert decision.selected.id == "best"


def test_selection_generates_when_best_score_is_too_weak() -> None:
    service = SampleSelectionService(reuse_threshold=0.75, margin_threshold=0.05)
    decision = service.choose_strategy(
        [
            SampleSearchResult(
                id="weak",
                file_path="/tmp/weak.wav",
                file_name="weak.wav",
                source="local",
                similarity_score=0.61,
                comparison_score=0.64,
            )
        ]
    )

    assert decision.strategy == "generated"
    assert decision.selected is None
    assert decision.alternatives[0].id == "weak"
