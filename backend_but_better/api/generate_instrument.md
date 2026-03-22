# `POST /generate-instrument`

Frontend MVP endpoint for finding or generating a sound clip.

## Request

```json
{
  "prompt": "warm analog synth lead",
  "duration_seconds": 2.0,
  "search_limit": 5
}
```

Fields:

- `prompt`: natural-language description of the requested sound
- `duration_seconds`: optional target duration, clamped to `0.5`-`5.0`
- `output_format`: optional provider format override
- `search_limit`: how many existing candidates to inspect before deciding

## Response

```json
{
  "strategy": "existing",
  "sample_id": "abc123",
  "audio_url": "/samples/abc123/audio",
  "file_name": "warm_lead.wav",
  "description": "Warm analog synth lead",
  "source": "local",
  "similarity_score": 0.84,
  "comparison_score": 0.87,
  "alternatives": []
}
```

## Strategy meanings

- `existing`: an indexed sample was good enough to reuse
- `generated`: no candidate was strong enough, so ElevenLabs generated a new one and it was saved/indexed

## Frontend flow

1. call `POST /generate-instrument`
2. read `sample_id` and `audio_url`
3. play or download the clip from `audio_url`
4. optionally show `alternatives` if the UI supports user choice

## Notes

- the endpoint contract is intended to stay stable while orchestration becomes more agent-driven internally
- intent and retrieval are already separated internally, with deterministic fallback behavior when model-backed agents are unavailable
