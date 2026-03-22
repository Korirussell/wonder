# DO NOT RUN FROM TAGGING... RUN FROM WONDER SO THAT IT CAN GRAB YOU .ENV DATA

import json
import math
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import google.generativeai as genai
import lancedb
import librosa
from dotenv import load_dotenv

'''
When searching tags:
vector search on semantic embedding
filter/rerank search results with math
'''

# Loads project-local .env when present (for GEMINI_API_KEY, SAMPLE_DIR, etc.).
load_dotenv()


def _project_root() -> Path:
    """Repo root (parent of `tagging/`)."""
    return Path(__file__).resolve().parent.parent


def resolve_db_path(db_path: str) -> str:
    """Use absolute paths so the DB saves in the same place no matter the cwd."""
    p = Path(db_path).expanduser()
    if p.is_absolute():
        return str(p)
    return str(_project_root() / p)


def resolve_sample_dir(sample_dir: str) -> str:
    """Resolve SAMPLE_DIR relative to repo root when not absolute."""
    p = Path(sample_dir).expanduser()
    if p.is_absolute():
        return str(p)
    return str(_project_root() / p)


def canonical_file_path(path: str) -> str:
    """Stable key for merging rows (absolute + normalized; case-folded on case-insensitive FS)."""
    return os.path.normcase(os.path.normpath(os.path.abspath(os.path.expanduser(path))))


def resolve_indexing_sample_root(config: "IndexingConfig") -> str:
    """
    Which folder to crawl.

    - SAMPLE_PROFILE=dev  → SAMPLE_DIR_DEV or ./dev_samples (repo-relative)
    - SAMPLE_PROFILE=all  → SAMPLE_DIR_ALL or ./SAMPLES (repo-relative)
    - otherwise           → SAMPLE_DIR from config (existing behavior)
    """
    profile = (os.getenv("SAMPLE_PROFILE") or "").strip().lower()
    if profile == "dev":
        return resolve_sample_dir(os.getenv("SAMPLE_DIR_DEV", "./dev_samples"))
    if profile == "all":
        return resolve_sample_dir(os.getenv("SAMPLE_DIR_ALL", "./SAMPLES"))
    return resolve_sample_dir(config.sample_dir)


def _row_for_lance(row: dict[str, Any]) -> dict[str, Any]:
    """Convert numpy / other array-likes in a row to plain Python for LanceDB."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if hasattr(v, "tolist"):
            out[k] = v.tolist()
        else:
            out[k] = v
    return out


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or str(raw).strip() == "":
        return default
    return int(str(raw).strip(), 10)


def normalize_vector_for_lance(
    vec: Any,
    dim: int,
    *,
    path_hint: str = "",
) -> list[float]:
    """
    LanceDB requires a fixed-size vector column. Pad with zeros or truncate to `dim`.

    Handles None, NaN, empty lists, numpy arrays, and legacy rows from older embedding models.
    """
    if dim <= 0:
        raise ValueError("embedding_vector_dim must be positive")

    if vec is None:
        nums: list[float] = []
    elif isinstance(vec, float) and math.isnan(vec):
        nums = []
    elif hasattr(vec, "tolist"):
        raw = vec.tolist()
        nums = [float(x) for x in raw] if isinstance(raw, (list, tuple)) else []
    elif isinstance(vec, (list, tuple)):
        nums = []
        for x in vec:
            if x is None:
                continue
            if isinstance(x, float) and math.isnan(x):
                continue
            nums.append(float(x))
    else:
        nums = []

    if len(nums) > dim:
        if path_hint:
            print(
                f"[vector] truncating length {len(nums)} → {dim} for {path_hint}",
                flush=True,
            )
        nums = nums[:dim]
    elif len(nums) < dim:
        nums.extend([0.0] * (dim - len(nums)))
    return nums


def finalize_rows_vectors(rows: list[dict[str, Any]], config: "IndexingConfig") -> list[dict[str, Any]]:
    """Return shallow copies with every `vector` fixed to embedding_vector_dim."""
    dim = config.embedding_vector_dim
    out: list[dict[str, Any]] = []
    for row in rows:
        r = dict(row)
        hint = str(r.get("file_path", ""))
        r["vector"] = normalize_vector_for_lance(r.get("vector"), dim, path_hint=hint)
        out.append(r)
    return out


def _log(msg: str) -> None:
    """Timestamped line so you can see where time is spent (flush for live output)."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# CONFIGURATIONS FOR RUNTIME
# ALL STUFF IS HERE RATHER THAN IN SUBSEQUENT FUNCTIONS
@dataclass
class IndexingConfig:
    api_key: str = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
    # Resolved in run_indexing via resolve_sample_dir()
    sample_dir: str = os.getenv("SAMPLE_DIR", "./SAMPLES")
    db_backend: str = os.getenv("TAG_DB_BACKEND", "lancedb")
    db_path: str = os.getenv("TAG_DB_PATH", "./data/sample_library.lance")
    db_table: str = os.getenv("TAG_DB_TABLE", "samples")
    # merge = update rows for paths seen this run, keep others (default)
    # overwrite = replace entire table with this run only
    # append = add rows without deduplication (legacy)
    db_write_mode: str = os.getenv("TAG_DB_WRITE_MODE", "merge")
    sample_extensions: tuple[str, ...] = (".wav", ".aif", ".aiff")
    audio_load_duration_sec: float | None = 3.0
    # Use names from https://ai.google.dev/gemini-api/docs/models — gemini-1.5-flash often 404s on newer API routes
    embedding_model: str = os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")
    vibe_model: str = os.getenv("GEMINI_VIBE_MODEL", os.getenv("TAG_VIBE_MODEL", "gemini-2.5-flash"))
    # Fixed width for LanceDB `vector` (gemini-embedding-001 default is 3072 unless API uses MRL).
    embedding_vector_dim: int = _int_env("GEMINI_EMBEDDING_DIM", _int_env("TAG_EMBEDDING_DIM", 3072))
    # Merge mode only: call Lance merge every N successful files (0 = disabled).
    checkpoint_every_n: int = _int_env("TAG_CHECKPOINT_EVERY_N", 0)
    # Add/remove fields here without changing the indexing loop.
    math_attributes: tuple[str, ...] = ("brightness", "punch", "duration")
    vibe_attributes: tuple[str, ...] = ("category", "sub_category", "tags", "description")
    metadata_fields: tuple[str, ...] = ("file_path", "file_name", "file_extension", "source")


# ABSTRACT CLASS FOR CONCEPT OF A FEATURE EXTRACTOR
class FeatureExtractor(ABC):
    @abstractmethod
    def extract(self, sample_path: str, config: IndexingConfig) -> dict[str, Any]:
        raise NotImplementedError

# SPECIFIC IMPLIMENTATION (THIS IS WHAT SHOULD BE CHANGING AS WE DECIDE TECH STACK)
class MathFeatureExtractor(FeatureExtractor):
    def extract(self, sample_path: str, config: IndexingConfig) -> dict[str, Any]:
        t0 = time.perf_counter()
        _log("  [1/4] math: loading audio (librosa) …")
        y, sr = librosa.load(sample_path, duration=config.audio_load_duration_sec)
        _log(f"  [1/4] math: computing spectral/RMS features … ({time.perf_counter() - t0:.2f}s elapsed)")
        raw_values = {
            "brightness": float(librosa.feature.spectral_centroid(y=y, sr=sr).mean()),
            "punch": float(librosa.feature.rms(y=y).mean() * 100.0),
            "duration": float(librosa.get_duration(y=y, sr=sr)),
        }
        _log(f"  [1/4] math: done in {time.perf_counter() - t0:.2f}s total")
        return {k: raw_values[k] for k in config.math_attributes if k in raw_values}

# SPECIFIC IMPLIMENTATION (THIS IS WHAT SHOULD BE CHANGING AS WE DECIDE TECH STACK)
class VibeFeatureExtractor(FeatureExtractor):
    def __init__(self, model_name: str):
        self._model_name = model_name
        self._model = genai.GenerativeModel(model_name)

    def extract(self, sample_path: str, config: IndexingConfig) -> dict[str, Any]:
        t0 = time.perf_counter()
        _log(f"  [2/4] vibe: uploading file to Gemini (model={self._model_name}) …")
        t_up = time.perf_counter()
        audio_file = genai.upload_file(path=sample_path)
        _log(f"  [2/4] vibe: upload finished in {time.perf_counter() - t_up:.2f}s")
        prompt = """
                Analyze this audio sample and return ONLY valid JSON with fields:
                {
                "category": "Kick/Snare/Hat/Vox/etc",
                "sub_category": "808/Acoustic/etc",
                "tags": ["tag1", "tag2", "tag3"],
                "description": "one sentence vibe check"
                }
                """
        _log("  [3/4] vibe: generate_content (JSON tags) … (this is often the slowest step)")
        t_gen = time.perf_counter()
        response = self._model.generate_content([prompt, audio_file])
        _log(f"  [3/4] vibe: generate_content done in {time.perf_counter() - t_gen:.2f}s")
        cleaned = response.text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        _log(f"  [2–3/4] vibe: total Gemini time {time.perf_counter() - t0:.2f}s")
        return {k: parsed.get(k) for k in config.vibe_attributes}


#ABSTRACT METHOD FOR DATA STORAGE
class DatabaseAdapter(ABC):
    @abstractmethod
    def upsert(self, rows: list[dict[str, Any]], config: IndexingConfig) -> None:
        raise NotImplementedError

# LANCE WILL PERSIST
class LanceDbAdapter(DatabaseAdapter):
    def __init__(self, db_path: str):
        resolved = resolve_db_path(db_path)
        parent = Path(resolved).parent
        parent.mkdir(parents=True, exist_ok=True)
        self._db = lancedb.connect(resolved)
        self._uri = resolved

    def upsert(self, rows: list[dict[str, Any]], config: IndexingConfig) -> None:
        mode = (config.db_write_mode or "merge").lower().strip()
        table = config.db_table

        if mode == "append":
            if not rows:
                print("[LanceDbAdapter] No rows to save — skipping table write.")
                return
            rows = finalize_rows_vectors(rows, config)
            if table in self._db.table_names():
                tbl = self._db.open_table(table)
                tbl.add(rows)
                print(f"[LanceDbAdapter] Appended {len(rows)} rows to '{table}' at {self._uri}")
            else:
                self._db.create_table(table, data=rows, mode="overwrite")
                print(f"[LanceDbAdapter] Created '{table}' with {len(rows)} rows at {self._uri}")
            return

        if mode == "overwrite":
            if not rows:
                print("[LanceDbAdapter] No rows to save — skipping table write.")
                return
            rows = finalize_rows_vectors(rows, config)
            self._db.create_table(table, data=rows, mode="overwrite")
            print(f"[LanceDbAdapter] Wrote {len(rows)} rows to '{table}' at {self._uri} (mode=overwrite)")
            return

        if mode == "merge":
            if not rows:
                print(
                    "[LanceDbAdapter] merge: no successfully indexed rows this run — "
                    "leaving existing table unchanged."
                )
                return
            by_path: dict[str, dict[str, Any]] = {}
            if table in self._db.table_names():
                tbl = self._db.open_table(table)
                existing = tbl.to_pandas().to_dict("records")
                for r in existing:
                    fp = r.get("file_path")
                    if fp:
                        by_path[canonical_file_path(str(fp))] = _row_for_lance(r)
            for row in rows:
                fp = row.get("file_path")
                if fp:
                    by_path[canonical_file_path(str(fp))] = _row_for_lance(row)
            merged = finalize_rows_vectors(list(by_path.values()), config)
            self._db.create_table(table, data=merged, mode="overwrite")
            print(
                f"[LanceDbAdapter] merge: wrote {len(merged)} total rows to '{table}' at {self._uri} "
                f"({len(rows)} updated/added from this run)."
            )
            return

        raise ValueError(
            f"Unsupported TAG_DB_WRITE_MODE: {config.db_write_mode!r}. "
            "Use 'merge', 'overwrite', or 'append'."
        )


def _warn_if_merge_table_vector_mismatch(config: IndexingConfig, db_adapter: DatabaseAdapter) -> None:
    """Log if on-disk vectors differ from embedding_vector_dim (we will pad/truncate)."""
    if config.db_backend != "lancedb":
        return
    if (config.db_write_mode or "merge").lower().strip() != "merge":
        return
    if not isinstance(db_adapter, LanceDbAdapter):
        return
    table = config.db_table
    if table not in db_adapter._db.table_names():
        return
    tbl = db_adapter._db.open_table(table)
    df = tbl.to_pandas()
    if df.empty or "vector" not in df.columns:
        return
    dim = config.embedding_vector_dim
    lengths: set[int] = set()
    for v in df["vector"].head(500):
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        try:
            if hasattr(v, "__len__") and not isinstance(v, str):
                lengths.add(len(v))
        except TypeError:
            continue
    odd = {L for L in lengths if L not in (0, dim)}
    if odd:
        _log(
            f"  WARNING: existing '{table}' has vector length(s) {sorted(odd)[:8]} "
            f"(target {dim}) — will pad/truncate on save. Set GEMINI_EMBEDDING_DIM to match."
        )


# GOOD FOR TESTING
class InMemoryAdapter(DatabaseAdapter):
    """Useful for testing pipeline logic without a DB dependency."""

    def __init__(self):
        self.rows: list[dict[str, Any]] = []

    def upsert(self, rows: list[dict[str, Any]], config: IndexingConfig) -> None:
        mode = (config.db_write_mode or "merge").lower().strip()
        if mode == "merge":
            if not rows:
                print(
                    f"[InMemoryAdapter] merge: no new rows — keeping {len(self.rows)} rows "
                    f"for '{config.db_table}'."
                )
                return
            by_path: dict[str, dict[str, Any]] = {}
            for r in self.rows:
                fp = r.get("file_path")
                if fp:
                    by_path[canonical_file_path(str(fp))] = r
            for row in rows:
                fp = row.get("file_path")
                if fp:
                    by_path[canonical_file_path(str(fp))] = row
            self.rows = finalize_rows_vectors(list(by_path.values()), config)
            print(
                f"[InMemoryAdapter] merge: {len(self.rows)} rows for '{config.db_table}' "
                f"({len(rows)} from this run)."
            )
            return
        if mode == "append":
            if rows:
                self.rows.extend(finalize_rows_vectors(rows, config))
            print(f"[InMemoryAdapter] append: now {len(self.rows)} rows for '{config.db_table}'.")
            return
        self.rows = finalize_rows_vectors(list(rows), config)
        print(f"[InMemoryAdapter] Stored {len(self.rows)} rows for '{config.db_table}' (overwrite).")


# returns the specific db being used by the IndexingConfig object
def create_db_adapter(config: IndexingConfig) -> DatabaseAdapter:
    backends: dict[str, DatabaseAdapter] = {
        "lancedb": LanceDbAdapter(resolve_db_path(config.db_path)),
        "memory": InMemoryAdapter(),
    }
    if config.db_backend not in backends:
        raise ValueError(f"Unsupported DB backend: {config.db_backend}")
    return backends[config.db_backend]


# filters out non-audio file formats (determined by the config)
def should_index_file(path: str, config: IndexingConfig) -> bool:
    return path.lower().endswith(config.sample_extensions)


def sample_metadata(path: str) -> dict[str, Any]:
    base_name = os.path.basename(path)
    extension = os.path.splitext(base_name)[1].lower()
    metadata = {
        "file_path": path,
        "file_name": base_name,
        "file_extension": extension,
        "source": "local_filesystem",
    }
    return metadata


# this is for vibe/semantic searching
def build_embedding(vibe_data: dict[str, Any], config: IndexingConfig) -> list[float]:
    dim = config.embedding_vector_dim
    text_parts = []
    for key in ("category", "sub_category", "description"):
        value = vibe_data.get(key)
        if value:
            text_parts.append(str(value))
    tags = vibe_data.get("tags") or []
    if isinstance(tags, list):
        text_parts.extend(str(tag) for tag in tags)
    search_text = " ".join(text_parts).strip()
    if not search_text:
        _log(f"  [4/4] embed: no vibe text — zero vector ({dim} dims) for LanceDB")
        return normalize_vector_for_lance([], dim)
    t0 = time.perf_counter()
    _log(f"  [4/4] embed: calling embed_content (model={config.embedding_model}) …")
    embedding_result = genai.embed_content(model=config.embedding_model, content=search_text)
    _log(f"  [4/4] embed: done in {time.perf_counter() - t0:.2f}s")
    raw = embedding_result["embedding"]
    return normalize_vector_for_lance(raw, dim)


# Offline loop through Ableton samples to update db
def run_indexing(config: IndexingConfig | None = None) -> None:
    config = config or IndexingConfig()
    if config.api_key == "YOUR_GEMINI_API_KEY":
        raise ValueError("Set GEMINI_API_KEY env var or update IndexingConfig.api_key.")
    sample_root = resolve_indexing_sample_root(config)
    genai.configure(api_key=config.api_key)

    profile = (os.getenv("SAMPLE_PROFILE") or "").strip().lower() or "(unset — using SAMPLE_DIR)"

    _log("=== Wonder tagging — startup ===")
    _log(f"  SAMPLE_PROFILE: {profile}")
    _log(f"  SAMPLE_DIR (resolved): {sample_root}")
    _log(f"  vibe model: {config.vibe_model}")
    _log(f"  embedding model: {config.embedding_model}")
    _log(
        f"  DB: {config.db_backend} → {resolve_db_path(config.db_path)} "
        f"table={config.db_table} write_mode={config.db_write_mode}"
    )
    if not os.path.isdir(sample_root):
        raise FileNotFoundError(f"SAMPLE_DIR is not a directory: {sample_root}")

    if config.embedding_vector_dim <= 0:
        raise ValueError("embedding_vector_dim must be positive (set GEMINI_EMBEDDING_DIM / TAG_EMBEDDING_DIM).")

    db_adapter = create_db_adapter(config)
    _warn_if_merge_table_vector_mismatch(config, db_adapter)
    math_extractor = MathFeatureExtractor()
    vibe_extractor = VibeFeatureExtractor(config.vibe_model)

    _log(f"  embedding vector dim: {config.embedding_vector_dim} (pad/truncate for LanceDB)")
    if config.checkpoint_every_n > 0:
        wmode = (config.db_write_mode or "merge").lower().strip()
        if wmode != "merge":
            _log(
                f"  checkpoint: TAG_CHECKPOINT_EVERY_N={config.checkpoint_every_n} ignored "
                f"(only applies when TAG_DB_WRITE_MODE=merge, current={wmode!r})"
            )
        else:
            _log(f"  checkpoint: every {config.checkpoint_every_n} successful file(s) (merge to LanceDB)")

    rows: list[dict[str, Any]] = []
    for root, dirnames, files in os.walk(sample_root):
        dirnames.sort(key=str.lower)
        for file_name in sorted(files, key=str.lower):
            path = os.path.join(root, file_name)
            if not should_index_file(path, config):
                continue

            file_t0 = time.perf_counter()
            rel = os.path.relpath(path, sample_root)
            _log(f"── File: {rel} ──")
            try:
                math_data = math_extractor.extract(path, config)
                vibe_data = vibe_extractor.extract(path, config)
                row = {**sample_metadata(path), **math_data, **vibe_data}
                row["vector"] = build_embedding(vibe_data, config)
                rows.append(row)
                _log(f"✓ Finished {rel} in {time.perf_counter() - file_t0:.2f}s total")
                if (
                    config.checkpoint_every_n > 0
                    and (config.db_write_mode or "merge").lower().strip() == "merge"
                    and len(rows) % config.checkpoint_every_n == 0
                ):
                    _log(f"  [checkpoint] merging {len(rows)} row(s) from this run into LanceDB …")
                    db_adapter.upsert(rows, config)
            except Exception as exc:
                _log(f"✗ Skipping {rel} — {exc}")

    db_adapter.upsert(rows, config)
    print(
        f"Success! Processed {len(rows)} file(s) this run → backend '{config.db_backend}' "
        f"table '{config.db_table}' (write_mode={config.db_write_mode})."
    )


if __name__ == "__main__":
    run_indexing()