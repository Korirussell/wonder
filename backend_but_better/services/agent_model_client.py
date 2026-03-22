from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_SERVICE_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _SERVICE_DIR.parent
_WORKSPACE_ROOT = _BACKEND_ROOT.parent

load_dotenv(_WORKSPACE_ROOT / ".env")
load_dotenv(_BACKEND_ROOT / ".env")


@dataclass(slots=True)
class AgentModelConfig:
    api_key: str | None = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    model_name: str = os.getenv("GEMINI_AGENT_MODEL", "gemini-2.5-flash")


class AgentModelClient:
    def __init__(self, config: AgentModelConfig | None = None) -> None:
        self.config = config or AgentModelConfig()

    def is_available(self) -> bool:
        return bool(self.config.api_key)

    def generate_json(self, prompt: str) -> dict[str, object]:
        if not self.config.api_key:
            raise ValueError("Missing Gemini API key for agent model client")

        import google.generativeai as genai

        genai.configure(api_key=self.config.api_key)
        model = genai.GenerativeModel(self.config.model_name)
        response = model.generate_content(prompt)
        text = getattr(response, "text", None) or ""
        cleaned = _extract_json(text)
        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("Agent model response must be a JSON object")
        return data


def _extract_json(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return stripped
