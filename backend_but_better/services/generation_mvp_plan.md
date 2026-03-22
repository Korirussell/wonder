# Generation MVP Plan

## Goal

Ship a first frontend-usable generation flow on top of the current backend foundation.

## Current Foundation

Already implemented:

- sample search via `api/samples.py`
- LanceDB-backed storage and retrieval via `services/sample_database.py`
- vector search via `services/sample_search.py`
- local sample indexing via `services/sample_indexing.py`
- ElevenLabs generation client via `services/elevenlabs_service.py`
- generated sample save/index flow via `services/sample_generation.py`
- audio retrieval via `GET /samples/{sample_id}/audio`

This is enough to build a first MVP for frontend integration.

## MVP Approach

Do not start with full multi-agent orchestration.

Start with a deterministic orchestration endpoint:

- `POST /generate-instrument`

Flow:

1. receive prompt
2. search existing samples
3. if top result is above a confidence threshold, return it
4. otherwise generate with ElevenLabs
5. save and index the generated result
6. return the final asset to the frontend

## Recommended Response Shape

- `strategy` (`existing` or `generated`)
- `sample_id`
- `audio_url`
- `file_name`
- `description`
- `source`
- `alternatives` (optional list of additional matches)

Recommended default:

- always return one final chosen asset
- also return `alternatives[]` so the frontend can expose fallback choices later

## Why This Is The Right MVP

- it uses the backend pieces that already exist
- it unblocks frontend work immediately
- it avoids premature complexity from a full agent graph
- it keeps the API contract stable for later upgrades

## What Is Implemented Now

- `POST /generate-instrument` exists
- deterministic orchestration is in `services/generation_orchestrator.py`
- candidate reranking is in `services/sample_compare.py`
- reuse-vs-generate policy is in `services/sample_selection.py`

## What Not To Build Yet

- full multi-agent orchestration
- layered sample generation
- rich vibe + math score blending
- broader session/profile persistence

## Recommended Next Implementation Steps

1. add the first narrow agent layer behind the same endpoint
2. introduce an `intent_agent` that structures prompts for retrieval/generation
3. introduce a `retrieval_agent` that wraps search + compare
4. add prompt evaluation fixtures for threshold tuning
5. later swap deterministic intent/retrieval logic for model-backed agents

## Extensible Follow-Up Path

After the MVP works:

1. keep the same `POST /generate-instrument` contract
2. add model-backed specialist agents one by one
3. keep generation and persistence deterministic underneath
4. add richer selection and layering without breaking frontend integration

## Notes

- current search should be good enough for a first pass, but thresholds will need tuning
- current indexed metadata is still simpler than a future full Gemini tagging pipeline
- `google.generativeai` works now, but should later move to `google.genai`
- the best migration path is to keep the endpoint stable and evolve internals from deterministic helpers into narrow agents
