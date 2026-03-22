from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

from services.agent_model_client import AgentModelClient


TOKEN_RE = re.compile(r"[a-z0-9]+")
DURATION_RE = re.compile(
    r"(?P<value>\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b", re.IGNORECASE
)

KNOWN_INSTRUMENTS = {
    "kick",
    "snare",
    "hat",
    "hihat",
    "clap",
    "perc",
    "percussion",
    "bass",
    "lead",
    "pad",
    "pluck",
    "riser",
    "impact",
    "fx",
    "synth",
}


@dataclass(slots=True)
class IntentResult:
    prompt: str
    normalized_prompt: str
    search_query: str
    extracted_tags: list[str] = field(default_factory=list)
    inferred_category: str | None = None
    inferred_sub_category: str | None = None
    duration_seconds: float | None = None


class IntentAgent:
    def __init__(
        self,
        *,
        use_model: bool | None = None,
        model_client: AgentModelClient | None = None,
    ) -> None:
        self.model_client = model_client or AgentModelClient()
        self.use_model = (
            use_model
            if use_model is not None
            else os.getenv("USE_MODEL_INTENT_AGENT", "false").lower() == "true"
        )

    def analyze(self, prompt: str) -> IntentResult:
        fallback = self._analyze_deterministic(prompt)
        if not self.use_model or not self.model_client.is_available():
            return fallback
        try:
            return self._analyze_with_model(prompt, fallback)
        except Exception:
            return fallback

    def _analyze_deterministic(self, prompt: str) -> IntentResult:
        normalized_prompt = " ".join(prompt.split())
        tokens = TOKEN_RE.findall(normalized_prompt.lower())
        duration_match = DURATION_RE.search(normalized_prompt)
        duration_seconds = (
            min(5.0, max(0.5, float(duration_match.group("value"))))
            if duration_match
            else None
        )

        inferred_sub_category = next(
            (token for token in tokens if token in KNOWN_INSTRUMENTS), None
        )
        inferred_category = _infer_category(inferred_sub_category)
        extracted_tags = []
        for token in tokens:
            if token == inferred_sub_category:
                continue
            if token not in extracted_tags:
                extracted_tags.append(token)

        return IntentResult(
            prompt=prompt,
            normalized_prompt=normalized_prompt,
            search_query=normalized_prompt,
            extracted_tags=extracted_tags[:8],
            inferred_category=inferred_category,
            inferred_sub_category=inferred_sub_category,
            duration_seconds=duration_seconds,
        )

    def _analyze_with_model(
        self,
        prompt: str,
        fallback: IntentResult,
    ) -> IntentResult:
        response = self.model_client.generate_json(
            "\n".join(
                [
                    "You extract music-generation intent.",
                    "Return only JSON with keys:",
                    "normalized_prompt, search_query, extracted_tags, inferred_category, inferred_sub_category, duration_seconds",
                    "Use null when unknown. Keep extracted_tags short.",
                    f"Prompt: {prompt}",
                    f"Fallback guess: {fallback}",
                ]
            )
        )
        return IntentResult(
            prompt=prompt,
            normalized_prompt=str(
                response.get("normalized_prompt") or fallback.normalized_prompt
            ),
            search_query=str(response.get("search_query") or fallback.search_query),
            extracted_tags=_normalize_tags(
                response.get("extracted_tags"), fallback.extracted_tags
            ),
            inferred_category=_optional_str(
                response.get("inferred_category"), fallback.inferred_category
            ),
            inferred_sub_category=_optional_str(
                response.get("inferred_sub_category"), fallback.inferred_sub_category
            ),
            duration_seconds=_optional_float(
                response.get("duration_seconds"), fallback.duration_seconds
            ),
        )


def _infer_category(sub_category: str | None) -> str | None:
    if sub_category in {"kick", "snare", "hat", "hihat", "clap", "perc", "percussion"}:
        return "drums"
    if sub_category in {"bass", "lead", "pad", "pluck", "synth"}:
        return "synth"
    if sub_category in {"riser", "impact", "fx"}:
        return "fx"
    return None


def _optional_str(value: object, fallback: str | None) -> str | None:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback


def _optional_float(value: object, fallback: float | None) -> float | None:
    if value is None:
        return fallback
    try:
        return min(5.0, max(0.5, float(value)))
    except (TypeError, ValueError):
        return fallback


def _normalize_tags(value: object, fallback: list[str]) -> list[str]:
    if not isinstance(value, list):
        return fallback
    tags: list[str] = []
    for item in value:
        text = str(item).strip().lower()
        if text and text not in tags:
            tags.append(text)
    return tags[:8] or fallback
