from __future__ import annotations

import os

from ._types import SoundGenAPIError, SoundRequest


class ElevenLabsClient:
    """Thin wrapper around the ElevenLabs SDK for sound-effect generation."""

    def __init__(self, api_key: str | None = None) -> None:
        self._api_key = api_key or os.environ.get("ELEVENLABS_API_KEY")
        if not self._api_key:
            raise SoundGenAPIError(
                "No ElevenLabs API key provided. "
                "Set the ELEVENLABS_API_KEY environment variable or pass api_key=."
            )

        try:
            from elevenlabs.client import ElevenLabs
        except ImportError as exc:
            raise ImportError(
                "elevenlabs package is required. Install it: pip install elevenlabs"
            ) from exc

        self._client = ElevenLabs(api_key=self._api_key)

    def generate_sound(self, request: SoundRequest) -> bytes:
        """
        Call the ElevenLabs text-to-sound-effects API.

        Returns raw audio bytes (MP3).
        Raises SoundGenAPIError on API failure.
        """
        try:
            kwargs: dict = {
                "text": request.prompt,
                "prompt_influence": request.prompt_influence,
            }
            if request.duration_seconds is not None:
                kwargs["duration_seconds"] = request.duration_seconds

            generator = self._client.text_to_sound_effects.convert(**kwargs)
            return b"".join(generator)
        except Exception as exc:
            raise SoundGenAPIError(f"ElevenLabs API error: {exc}") from exc
