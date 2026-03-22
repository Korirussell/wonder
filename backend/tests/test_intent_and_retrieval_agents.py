from __future__ import annotations

from services.intent_agent import IntentAgent
from services.retrieval_agent import RetrievalAgent
from services.sample_models import SampleSearchResult


class FakeSearchService:
    def __init__(self, results: list[SampleSearchResult]) -> None:
        self.results = results
        self.requests = []

    def search(self, request):
        self.requests.append(request)
        return self.results


def test_intent_agent_extracts_category_tags_and_duration() -> None:
    result = IntentAgent().analyze("warm analog lead 3 seconds")

    assert result.normalized_prompt == "warm analog lead 3 seconds"
    assert result.inferred_category == "synth"
    assert result.inferred_sub_category == "lead"
    assert result.duration_seconds == 3.0
    assert "warm" in result.extracted_tags


def test_retrieval_agent_builds_filtered_search_request() -> None:
    search = FakeSearchService(
        [
            SampleSearchResult(
                id="1",
                file_path="/tmp/a.wav",
                file_name="a.wav",
                source="local",
                category="drums",
                sub_category="kick",
                tags=["punchy"],
                description="Punchy kick",
                similarity_score=0.8,
            )
        ]
    )
    agent = RetrievalAgent(search)
    intent = IntentAgent().analyze("punchy kick")

    result = agent.retrieve(intent, limit=4)

    assert len(result.candidates) == 1
    request = search.requests[0]
    assert request.limit == 4
    assert request.category == "drums"
    assert request.sub_category == "kick"
    assert "punchy" in request.tags
