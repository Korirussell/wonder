from __future__ import annotations

from services.intent_agent import IntentAgent
from services.retrieval_agent import RetrievalAgent
from services.sample_models import SampleSearchResult


class FakeModelClient:
    def __init__(self, response: dict[str, object], available: bool = True) -> None:
        self.response = response
        self.available = available
        self.prompts: list[str] = []

    def is_available(self) -> bool:
        return self.available

    def generate_json(self, prompt: str) -> dict[str, object]:
        self.prompts.append(prompt)
        return self.response


class RaisingModelClient(FakeModelClient):
    def generate_json(self, prompt: str) -> dict[str, object]:
        raise RuntimeError("boom")


class FakeSearchService:
    def __init__(self, results: list[SampleSearchResult]) -> None:
        self.results = results

    def search(self, request):
        return self.results


def test_intent_agent_uses_model_when_enabled() -> None:
    client = FakeModelClient(
        {
            "normalized_prompt": "warm lead",
            "search_query": "warm synth lead",
            "extracted_tags": ["warm", "analog"],
            "inferred_category": "synth",
            "inferred_sub_category": "lead",
            "duration_seconds": 2.5,
        }
    )
    agent = IntentAgent(use_model=True, model_client=client)

    result = agent.analyze("warm lead")

    assert result.search_query == "warm synth lead"
    assert result.inferred_sub_category == "lead"
    assert result.duration_seconds == 2.5
    assert client.prompts


def test_intent_agent_falls_back_when_model_fails() -> None:
    agent = IntentAgent(use_model=True, model_client=RaisingModelClient({}))

    result = agent.analyze("punchy kick 3 seconds")

    assert result.inferred_category == "drums"
    assert result.duration_seconds == 3.0


def test_retrieval_agent_uses_model_order_when_enabled() -> None:
    search = FakeSearchService(
        [
            SampleSearchResult(
                id="a",
                file_path="/tmp/a.wav",
                file_name="a.wav",
                source="local",
                category="synth",
                sub_category="lead",
                tags=["warm"],
                description="Warm lead",
                similarity_score=0.7,
                comparison_score=0.75,
            ),
            SampleSearchResult(
                id="b",
                file_path="/tmp/b.wav",
                file_name="b.wav",
                source="local",
                category="synth",
                sub_category="lead",
                tags=["analog"],
                description="Analog lead",
                similarity_score=0.69,
                comparison_score=0.74,
            ),
        ]
    )
    client = FakeModelClient({"ordered_ids": ["b", "a"]})
    agent = RetrievalAgent(search, use_model=True, model_client=client)
    intent = IntentAgent(use_model=False).analyze("warm analog lead")

    result = agent.retrieve(intent)

    assert [candidate.id for candidate in result.candidates] == ["b", "a"]
    assert client.prompts


def test_retrieval_agent_falls_back_when_model_fails() -> None:
    search = FakeSearchService(
        [
            SampleSearchResult(
                id="a",
                file_path="/tmp/a.wav",
                file_name="a.wav",
                source="local",
                category="drums",
                sub_category="kick",
                tags=["punchy", "kick"],
                description="Punchy kick",
                similarity_score=0.8,
            ),
            SampleSearchResult(
                id="b",
                file_path="/tmp/b.wav",
                file_name="b.wav",
                source="local",
                category="fx",
                sub_category="impact",
                tags=["noise"],
                description="Impact",
                similarity_score=0.81,
            ),
        ]
    )
    agent = RetrievalAgent(search, use_model=True, model_client=RaisingModelClient({}))
    intent = IntentAgent(use_model=False).analyze("punchy kick")

    result = agent.retrieve(intent)

    assert result.candidates[0].id == "a"
