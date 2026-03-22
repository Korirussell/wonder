from __future__ import annotations

from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError

from services.elevenlabs_service import ElevenLabsConfig, ElevenLabsService


class FakeHttpResponse:
    def __init__(self, body: bytes, content_type: str = "audio/mpeg") -> None:
        self._body = body
        self.headers = Message()
        self.headers["Content-Type"] = content_type
        self.headers["x-elevenlabs-model-id"] = "sound-model-v1"

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "FakeHttpResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


def test_generate_sound_posts_expected_payload() -> None:
    service = ElevenLabsService(
        ElevenLabsConfig(api_key="test-key", base_url="https://api.elevenlabs.io/v1")
    )

    with patch(
        "urllib.request.urlopen",
        return_value=FakeHttpResponse(b"audio-bytes"),
    ) as urlopen_mock:
        result = service.generate_sound("  warm synth stab  ", duration_seconds=7.0)

    request = urlopen_mock.call_args.args[0]
    assert request.full_url == "https://api.elevenlabs.io/v1/sound-generation"
    assert request.headers["Xi-api-key"] == "test-key"
    assert request.headers["Content-type"] == "application/json"
    assert request.data == (
        b'{"text": "warm synth stab", "duration_seconds": 5.0, "output_format": "mp3_44100_128"}'
    )
    assert result.audio_bytes == b"audio-bytes"
    assert result.duration_seconds == 5.0
    assert result.prompt == "warm synth stab"
    assert result.content_type == "audio/mpeg"
    assert result.model_id == "sound-model-v1"


def test_generate_sound_requires_key() -> None:
    service = ElevenLabsService(ElevenLabsConfig(api_key=None))

    try:
        service.generate_sound("kick drum")
    except ValueError as exc:
        assert "ELEVENLABS_API_KEY" in str(exc)
    else:
        raise AssertionError("Expected ValueError when API key is missing")


def test_generate_sound_surfaces_http_error() -> None:
    service = ElevenLabsService(ElevenLabsConfig(api_key="test-key"))
    error = HTTPError(
        url="https://api.elevenlabs.io/v1/sound-generation",
        code=400,
        msg="Bad Request",
        hdrs=None,
        fp=None,
    )
    error.read = lambda: b'{"detail":"invalid request"}'

    with patch("urllib.request.urlopen", side_effect=error):
        try:
            service.generate_sound("snare")
        except RuntimeError as exc:
            assert "400" in str(exc)
            assert "invalid request" in str(exc)
        else:
            raise AssertionError("Expected RuntimeError for ElevenLabs HTTP error")
