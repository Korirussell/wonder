from __future__ import annotations

from services.sample_compare import SampleCompareService
from services.sample_models import SampleSearchResult


def test_compare_service_boosts_exact_tag_and_category_matches() -> None:
    service = SampleCompareService()
    candidates = [
        SampleSearchResult(
            id="a",
            file_path="/tmp/a.wav",
            file_name="warm_lead.wav",
            source="local",
            category="synth",
            sub_category="lead",
            tags=["warm", "analog"],
            description="Warm analog lead",
            similarity_score=0.7,
        ),
        SampleSearchResult(
            id="b",
            file_path="/tmp/b.wav",
            file_name="random.wav",
            source="local",
            category="fx",
            sub_category="impact",
            tags=["noise"],
            description="Noisy fx",
            similarity_score=0.72,
        ),
    ]

    reranked = service.rerank_candidates("warm analog synth lead", candidates)

    assert reranked[0].id == "a"
    assert reranked[0].comparison_score is not None
    assert reranked[0].comparison_score > reranked[1].comparison_score
