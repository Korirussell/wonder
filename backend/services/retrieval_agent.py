from __future__ import annotations

import os
from dataclasses import dataclass

from services.agent_model_client import AgentModelClient
from services.intent_agent import IntentResult
from services.sample_compare import SampleCompareService
from services.sample_models import SampleSearchRequest, SampleSearchResult
from services.sample_search import SampleSearchService


@dataclass(slots=True)
class RetrievalResult:
    candidates: list[SampleSearchResult]


class RetrievalAgent:
    def __init__(
        self,
        search_service: SampleSearchService,
        compare_service: SampleCompareService | None = None,
        *,
        use_model: bool | None = None,
        model_client: AgentModelClient | None = None,
    ) -> None:
        self.search_service = search_service
        self.compare_service = compare_service or SampleCompareService()
        self.model_client = model_client or AgentModelClient()
        self.use_model = (
            use_model
            if use_model is not None
            else os.getenv("USE_MODEL_RETRIEVAL_AGENT", "false").lower() == "true"
        )

    def retrieve(self, intent: IntentResult, *, limit: int = 5) -> RetrievalResult:
        search_request = SampleSearchRequest(
            query=intent.search_query,
            limit=limit,
            tags=intent.extracted_tags[:3],
            category=intent.inferred_category,
            sub_category=intent.inferred_sub_category,
        )
        initial = self.search_service.search(search_request)
        reranked = self.compare_service.rerank_candidates(
            intent.normalized_prompt, initial
        )
        if self.use_model and self.model_client.is_available() and reranked:
            try:
                reranked = self._rerank_with_model(intent, reranked)
            except Exception:
                pass
        return RetrievalResult(candidates=reranked)

    def _rerank_with_model(
        self,
        intent: IntentResult,
        candidates: list[SampleSearchResult],
    ) -> list[SampleSearchResult]:
        response = self.model_client.generate_json(
            "\n".join(
                [
                    "You rerank sample-search candidates for music generation.",
                    "Return only JSON with key ordered_ids as an array of candidate ids in best-first order.",
                    f"Prompt: {intent.normalized_prompt}",
                    f"Category: {intent.inferred_category}",
                    f"Sub-category: {intent.inferred_sub_category}",
                    f"Candidates: {[candidate.model_dump(mode='python') for candidate in candidates[:8]]}",
                ]
            )
        )
        ordered_ids = response.get("ordered_ids")
        if not isinstance(ordered_ids, list):
            return candidates
        by_id = {candidate.id: candidate for candidate in candidates}
        ordered: list[SampleSearchResult] = []
        for item in ordered_ids:
            candidate = by_id.get(str(item))
            if candidate and candidate not in ordered:
                ordered.append(candidate)
        for candidate in candidates:
            if candidate not in ordered:
                ordered.append(candidate)
        return ordered
