# Tagging Workflow

This folder contains the sample tagging/indexing pipeline and a local practice test.

## Files

- `tagging.py`: Main indexing pipeline (math features + vibe tags + embeddings + DB write)
- `tagging_test.py`: Dummy in-memory practice run (no Gemini calls, no audio loading, no external DB)
- `tagging_requirements.txt`: Python dependencies for tagging scripts

## Run the Tagging Practice Test

Use this to validate the workflow shape quickly before running the real indexer.

```bash
cd wonder
python3 tagging/tagging_test.py
```

Expected output includes:

- `[InMemoryAdapter] Stored 3 rows for 'samples_practice'.`
- `Practice run indexed 3 rows.`
- A per-row summary with file name, category, tags, and vector dimension

## Run the Real Indexer

1. Activate your virtual environment.
2. Install dependencies.
3. Create a project-local `.env` file from `.env.example`.
4. Run `tagging.py`.

```bash
cd wonder
source .venv/bin/activate
python -m pip install -r tagging/tagging_requirements.txt

# Create your local env file (contains GEMINI_API_KEY + SAMPLE_DIR)
cp .env.example .env
# Then edit .env with your real values

# Optional: export values directly instead of using .env
# export GEMINI_API_KEY="YOUR_KEY"
# export SAMPLE_DIR="/absolute/path/to/sample/library"
# Optional:
# export TAG_DB_BACKEND="lancedb"
# export TAG_DB_PATH="./data/sample_library.lance"
# export TAG_DB_TABLE="samples"

python tagging/tagging.py
```
