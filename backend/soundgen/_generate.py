from __future__ import annotations

from pathlib import Path

from ._client import ElevenLabsClient
from ._prompt import build_prompt
from ._types import SoundParams, SoundRequest, SoundResult


def generate(
    params: SoundParams | str,
    *,
    api_key: str | None = None,
    save_to: str | Path | None = None,
    client: ElevenLabsClient | None = None,
) -> SoundResult:
    """
    Generate a sound effect via the ElevenLabs API.

    Parameters
    ----------
    params:
        Either a SoundParams dataclass or a plain string (natural language description).
    api_key:
        ElevenLabs API key. Falls back to ELEVENLABS_API_KEY env var.
    save_to:
        If provided, write the audio bytes to this file path.
    client:
        Optional pre-constructed ElevenLabsClient (useful for testing/batching).

    Returns
    -------
    SoundResult
    """
    # 1. Normalize string → SoundParams
    if isinstance(params, str):
        params = SoundParams(description=params)

    # 2. Extract and merge reference features
    reference_features: dict = {}
    if params.reference_audio_path is not None:
        from ._reference import extract_reference_features, merge_features_into_params

        features = extract_reference_features(params.reference_audio_path)
        merge_features_into_params(params, features)
        reference_features = {
            "pitch_hz": features.pitch_hz,
            "pitch_region": features.pitch_region,
            "intensity_label": features.intensity_label,
            "brightness": features.brightness,
            "duration_seconds": features.duration_seconds,
        }

    # 3. Build prompt
    prompt = build_prompt(params)

    # 4. Construct SoundRequest
    request = SoundRequest(
        prompt=prompt,
        duration_seconds=params.duration_seconds,
        prompt_influence=params.prompt_influence,
        reference_features=reference_features,
    )

    # 5. Call API
    if client is None:
        client = ElevenLabsClient(api_key=api_key)

    audio_bytes = client.generate_sound(request)

    # 6. Write to disk if requested
    output_path: Path | None = None
    if save_to is not None:
        output_path = Path(save_to)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio_bytes)

    # 7. Return result
    return SoundResult(
        audio_bytes=audio_bytes,
        prompt_used=prompt,
        duration_seconds=params.duration_seconds,
        output_path=output_path,
        params=params,
        request=request,
    )
