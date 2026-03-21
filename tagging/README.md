# Tagging Workflow

This folder contains the sample tagging/indexing pipeline and a local practice test.

## Files

- `tagging.py`: Main indexing pipeline (math features + vibe tags + embeddings + DB write)
- `inspect_lancedb.py`: **CLI to preview rows** in the local LanceDB index (paths from `.env` / `TAG_DB_PATH` / `TAG_DB_TABLE`)
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
# export TAG_DB_WRITE_MODE="merge"   # default; see below

# Dev vs full library (pick one style):
# export SAMPLE_PROFILE=dev          # uses ./dev_samples (or SAMPLE_DIR_DEV)
# export SAMPLE_PROFILE=all          # uses ./SAMPLES (or SAMPLE_DIR_ALL)
# Or leave SAMPLE_PROFILE unset and use SAMPLE_DIR only.

python tagging/tagging.py
```

## Dev samples vs full library (`SAMPLE_PROFILE`)

| Env | Folder crawled (repo-relative unless absolute) |
|-----|------------------------------------------------|
| `SAMPLE_PROFILE=dev` | `SAMPLE_DIR_DEV` or **`wonder/dev_samples/`** |
| `SAMPLE_PROFILE=all` | `SAMPLE_DIR_ALL` or **`wonder/SAMPLES/`** |
| unset | `SAMPLE_DIR` from `.env` (unchanged behavior) |

Put a small subset under **`dev_samples/`** for fast iteration; keep the full pack under **`SAMPLES/`**.

## Where data is saved (LanceDB)

- Default path is **`wonder/data/sample_library.lance`** (relative to the **repo root**, not your shell cwd).
- The **`data/`** directory is created automatically if missing.
- **`TAG_DB_WRITE_MODE`**:
  - **`merge`** (default): loads the existing table (if any), then **replaces rows whose `file_path` matches** files successfully indexed this run; **all other rows stay**. If this run produces **no** successful rows, the DB is **unchanged**.
  - **`overwrite`**: replaces the **entire** table with **only** this run’s rows.
  - **`append`**: adds new rows without deduplication (legacy).

Rows are matched by **canonical absolute `file_path`** (not basename alone), so two `kick.wav` files in different folders stay distinct.

### Inspect the database (terminal)

From **`wonder/`** (same as the indexer, so `.env` applies):

```bash
python tagging/inspect_lancedb.py
python tagging/inspect_lancedb.py --limit 10
python tagging/inspect_lancedb.py --list-tables
python tagging/inspect_lancedb.py --with-vector
python tagging/inspect_lancedb.py --json | jq .
```

Uses **`TAG_DB_PATH`** and **`TAG_DB_TABLE`** when set; override with `--path` / `--table`.

**Default output** is a **friendly layout**: repo-relative paths with **shared parent folders removed** across the batch (so you see `hats/kick.wav` instead of long absolute paths), then **category › sub_category**, **tags** (` · ` separated), a **wrapped description**, and dimmed duration / RMS. Use **`--raw-table`** for the old wide pandas dump. **`--width`** sets description wrap width; **`--no-color`** or **`NO_COLOR=1`** disables bold/dim. **`--with-vector`** adds a vector summary line per row in friendly mode.

By default, rows are **omitted** from the table/`--json` output if they look **invalid** (bad `duration` / `punch`), **near-silent** (very low `punch`), **empty vibe** (no category/sub_category/description/tags), or **all-zero embedding**. Use **`--all`** to print every row. **`--min-punch 0`** turns off the silence cutoff only. **`--require-existing-files`** also hides rows whose `file_path` is not on disk.

### Fixed-size vectors (LanceDB)

Lance requires every row’s `vector` column to have the **same length**. The indexer **pads with zeros** or **truncates** to **`GEMINI_EMBEDDING_DIM`** (default **3072**, matching `gemini-embedding-001`’s default). Rows with **no vibe text** get a **zero vector** of that length (never an empty list).

If you change embedding model or use a smaller `outputDimensionality` in the API, set **`GEMINI_EMBEDDING_DIM`** (or **`TAG_EMBEDDING_DIM`**) to match so you don’t truncate useful dimensions silently.

### Checkpoints (long runs)

Set **`TAG_CHECKPOINT_EVERY_N`** (e.g. `25`) **and** **`TAG_DB_WRITE_MODE=merge`**. After each batch of N successful files, the script **merges into LanceDB** so a crash near the end doesn’t lose the whole run. Checkpoints are **ignored** for `overwrite` / `append` (only merge is safe).

## Walk order

Directories and files are sorted **case-insensitively** so runs are reproducible.

After a successful run you should see a log line like:
`[LanceDbAdapter] merge: wrote N total rows to 'samples' at ... (M updated/added from this run).`
