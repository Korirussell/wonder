# Local Sample Indexing

Use the local indexing script to backfill LanceDB with searchable sample records.

## Run

From `backend_but_better/`:

```bash
uv run python tools/index_samples.py --sample-root ./samples
```

If `--sample-root` is omitted, the script uses `SAMPLE_DIR` from the environment, or defaults to `./samples`.

## What it does

- walks the sample folder recursively
- builds sample metadata from file and folder names
- creates `search_text` for each sample
- generates Gemini document embeddings
- upserts rows into LanceDB at `TAG_DB_PATH` / `TAG_DB_TABLE`

## Example output

```text
Indexed 39 sample(s) from /path/to/backend_but_better/samples (39 audio file(s) scanned).
```

## Requirements

- a valid `.env` with `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- network access for Gemini embeddings
- sample files under the target folder

## After indexing

You can search indexed samples through the backend search service or the `POST /samples/search` endpoint.
