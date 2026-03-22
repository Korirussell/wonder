# DB Service Plan

## Goal

Build a sample database service that supports:

- indexing local and generated samples
- semantic and metadata-based search
- comparison/reranking of candidate sounds
- Gemini orchestration inside backend endpoints
- returning a final `.wav` asset back to the frontend

This replaces the old script-first flow and removes MCP from the architecture.

## Core Principle

The database layer should be a normal backend service, not an LLM-specific subsystem.

- backend services own storage, indexing, search, comparison, and file access
- Gemini uses internal tool-style wrappers over those services during orchestration
- frontend talks to FastAPI endpoints, not directly to LanceDB or raw filesystem logic

## Recommended Architecture

### Service responsibilities

`sample_database.py`
- open and manage LanceDB
- normalize paths and vectors
- upsert sample rows
- fetch rows by id/path
- perform basic filtered queries

`sample_indexing.py`
- scan sample folders
- extract metadata and math features
- run vibe tagging and embedding generation
- save indexed rows into LanceDB

`sample_search.py`
- semantic search from prompt text
- apply structured filters
- return ranked candidates for orchestration

`sample_compare.py`
- compare candidates using multiple signals
- combine vector similarity, tag overlap, and math feature distance
- support reranking for final selection

`sample_generation.py`
- call ElevenLabs when no strong match exists
- save generated audio to disk
- create a new database record for generated audio
- trigger tagging and embedding for the saved file

`sample_audio.py`
- resolve sample ids to files
- validate file access
- stream `.wav` files to the frontend

`gemini_orchestrator.py`
- define internal Gemini tools
- run the tool-calling loop inside generate endpoints
- decide whether to reuse, layer, or generate a sound

## Database Choice

Start with LanceDB.

Why:

- the old code already uses it
- it supports vector search well
- it matches the current tagging/indexing pipeline
- it is enough for local sample cataloging in the rewrite

If needed later, metadata can be split into another store, but the first pass should keep one catalog in LanceDB.

## Sample Record Schema

Each sample row should support search, orchestration, and retrieval.

Required fields:

- `id`
- `file_path`
- `file_name`
- `file_extension`
- `source` (`local`, `elevenlabs`, `user_upload`, `derived`)
- `category`
- `sub_category`
- `tags`
- `description`
- `vector`
- `brightness`
- `punch`
- `duration`
- `created_at`

Recommended fields for generation and lifecycle:

- `generation_prompt`
- `provider`
- `provider_asset_id`
- `parent_sample_ids`
- `is_generated`
- `is_layered`

Optional later fields:

- `bpm`
- `key`
- `mfcc_summary`
- `instrument_family`
- `usage_count`

## Legacy Code To Reuse

Primary sources:

- `tagging/tagging.py`
  - metadata shaping
  - vector normalization
  - LanceDB merge/upsert logic
  - math feature extraction
  - vibe tagging flow
  - embedding generation
- `tagging/search.py`
  - basic semantic search flow

Important note:

The old code has useful pieces, but not the final architecture. It should be split into service modules rather than copied as one large script.

## Search Design

Search should use explicit LanceDB vector search over stored sample embeddings.

Recommended approach:

- every indexed sample stores a `search_text` field built from its tags and metadata
- every indexed sample stores a normalized `vector` embedding generated from that `search_text`
- at query time, the backend generates a query embedding with the same Gemini embedding path used at ingest time
- the database layer calls `table.search(query_vector, query_type="vector", vector_column_name="vector")`
- metadata filters are applied with LanceDB `where(...)`

Why this approach:

- the old tagging flow already stores vectors in LanceDB
- it keeps ingestion and retrieval on the same embedding contract
- it avoids relying on LanceDB auto-embedding table metadata during the first implementation
- it gives predictable behavior even if the embedding provider/model changes later

Optional fallback modes later:

- metadata token search over `search_text`
- LanceDB FTS / hybrid search when table indexing is added

The output should be metadata-first, not raw audio bytes.

Suggested search response fields:

- `id`
- `file_name`
- `file_path`
- `source`
- `category`
- `sub_category`
- `tags`
- `description`
- `duration`
- `similarity_score`
- `comparison_score` if reranked

## Comparison Design

Comparison should be a separate service from search.

Why:

- search finds candidates
- comparison decides which candidate is best for the prompt or target sound

Suggested comparison inputs:

- target prompt
- optional target feature profile
- candidate sample ids

Suggested scoring signals:

- vector similarity
- tag overlap
- category/sub-category match
- math feature distance for duration/brightness/punch

The first version can use a weighted score with clear constants.

## Generated Audio Lifecycle

When no suitable sample exists:

1. generate audio with ElevenLabs
2. save the resulting `.wav` to a managed folder
3. create metadata for the new file
4. run tagging and embedding on it
5. insert it into LanceDB
6. return the sample id and audio path/URL

Generated samples should be treated like first-class catalog items.

## Gemini Tooling Strategy

Gemini orchestration should happen inside backend endpoints.

That means the model can call internal app tools such as:

- `search_samples`
- `compare_samples`
- `get_sample_metadata`
- `generate_with_elevenlabs`
- `save_generated_sample`
- later: `layer_samples`

These should not be MCP tools. They should be Python wrappers around backend services.

## Audio Retrieval Strategy

Do not make raw audio retrieval a primary general-purpose Gemini tool unless there is a real model need for audio bytes.

Preferred pattern:

- Gemini finds or creates the best sample
- backend returns a `sample_id`
- frontend fetches the final audio from an HTTP endpoint

Recommended endpoint shape:

- `GET /samples/{sample_id}/audio`

This keeps file access secure and centralized.

## API Endpoints To Support

Recommended initial routes:

- `POST /samples/search`
- `POST /samples/compare`
- `POST /samples/save-generated`
- `GET /samples/{sample_id}`
- `GET /samples/{sample_id}/audio`
- `POST /generate-instrument`

`POST /generate-instrument` should:

- accept the user prompt
- start Gemini orchestration
- search existing samples first
- generate with ElevenLabs if needed
- optionally return alternatives
- return one final `.wav` asset or a URL to it

## Recommendation On Functions vs Classes

Use function-first services with small classes only where stateful clients help.

Good class candidates:

- LanceDB client/service
- Gemini client
- ElevenLabs client

Good function candidates:

- row normalization
- score calculation
- metadata shaping
- path resolution
- filter building

This keeps the code easy to test and avoids over-engineering early.

## DB Implementation Shape

`sample_models.py`
- define the shared sample row schema
- include `search_text` alongside `vector`
- normalize paths, tags, and vectors

`sample_embedding.py`
- build searchable text from sample metadata
- generate query embeddings using the same model family used during indexing
- normalize dimensions before search/write

`sample_database.py`
- own LanceDB connection and table access
- support upsert, get, and filtered reads
- add `search_by_vector(...)` as the primary retrieval method

`sample_search.py`
- take a user prompt
- ask `sample_embedding.py` for a query vector
- call `sample_database.py.search_by_vector(...)`
- optionally apply lightweight app-level reranking

## First Step

The first implementation step for this design is:

1. add `search_text` to the shared sample schema
2. auto-build `search_text` from `category`, `sub_category`, `tags`, `description`, and `file_name`
3. add a dedicated `sample_embedding.py` service that owns query-text preparation and vector normalization

This step does not yet switch the search endpoint over to vector retrieval. It prepares the schema and service boundary so the next step can replace the temporary token-based search cleanly.

## Phased Implementation Plan

### Phase 1

- port LanceDB access into `sample_database.py`
- define the shared sample record schema
- add `search_text` and embedding-service boundaries
- add sample audio retrieval endpoint

### Phase 2

- replace temporary metadata scoring with explicit LanceDB vector search
- add query embedding generation in the search flow
- support LanceDB metadata filters with `where(...)`

### Phase 3

- add generated-sample save/index flow
- add ElevenLabs integration service
- make generated sounds first-class DB records

### Phase 4

- add comparison/reranking service
- expose compare endpoint
- improve score blending between vibe and math features

### Phase 5

- add `generate-instrument` orchestration endpoint
- wire Gemini internal tools to backend services
- return final chosen/generated asset plus alternatives

### Phase 6

- support layered instruments assembled from multiple samples
- save derived renders back into the database

## First Practical Milestone

The best first milestone is:

1. searchable sample catalog in LanceDB
2. direct audio retrieval by sample id
3. generated sample save-and-index flow

Once those exist, Gemini orchestration can be added cleanly on top instead of being mixed into storage concerns.
