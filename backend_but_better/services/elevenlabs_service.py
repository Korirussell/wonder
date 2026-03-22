from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from dotenv import load_dotenv

_SERVICE_DIR = Path(__file__).resolve().parent
_BACKEND_ROOT = _SERVICE_DIR.parent
_WORKSPACE_ROOT = _BACKEND_ROOT.parent

load_dotenv(_WORKSPACE_ROOT / ".env")
load_dotenv(_BACKEND_ROOT / ".env")


@dataclass(slots=True)
class ElevenLabsConfig:
    api_key: str | None = os.getenv("ELEVENLABS_API_KEY")
    base_url: str = os.getenv("ELEVENLABS_API_BASE", "https://api.elevenlabs.io/v1")
    output_format: str = os.getenv("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")


@dataclass(slots=True)
class GeneratedSoundResult:
    audio_bytes: bytes
    content_type: str
    prompt: str
    duration_seconds: float
    output_format: str
    provider: str = "elevenlabs"
    model_id: str | None = None


class ElevenLabsService:
    def __init__(self, config: ElevenLabsConfig | None = None) -> None:
        self.config = config or ElevenLabsConfig()

    def generate_sound(
        self,
        prompt: str,
        *,
        duration_seconds: float = 2.0,
        output_format: str | None = None,
    ) -> GeneratedSoundResult:
        prepared_prompt = " ".join(prompt.split())
        if not prepared_prompt:
            raise ValueError("Prompt must not be empty")
        if not self.config.api_key:
            raise ValueError("Missing ELEVENLABS_API_KEY in the environment")

        clamped_duration = min(5.0, max(0.5, float(duration_seconds)))
        chosen_format = output_format or self.config.output_format
        payload = {
            "text": prepared_prompt,
            "duration_seconds": clamped_duration,
            "output_format": chosen_format,
        }
        response = self._post_json("/sound-generation", payload)
        return GeneratedSoundResult(
            audio_bytes=cast(bytes, response["body"]),
            content_type=cast(str, response["content_type"]),
            prompt=prepared_prompt,
            duration_seconds=clamped_duration,
            output_format=chosen_format,
            model_id=cast(str | None, response["model_id"]),
        )

    def _post_json(self, path: str, payload: dict[str, object]) -> dict[str, object]:
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url=f"{self.config.base_url.rstrip('/')}{path}",
            data=body,
            method="POST",
            headers={
                "xi-api-key": self.config.api_key or "",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request) as response:
                audio_bytes = response.read()
                content_type = response.headers.get_content_type() or "audio/mpeg"
                model_id = response.headers.get("x-elevenlabs-model-id")
                return {
                    "body": audio_bytes,
                    "content_type": content_type,
                    "model_id": model_id,
                }
        except urllib.error.HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"ElevenLabs request failed ({exc.code}): {error_body}"
            ) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"ElevenLabs request failed: {exc.reason}") from exc
