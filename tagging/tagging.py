import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
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


# CONFIGURATIONS FOR RUNTIME
# ALL STUFF IS HERE RATHER THAN IN SUBSEQUENT FUNCTIONS
@dataclass
class IndexingConfig:
    api_key: str = os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY")
    sample_dir: str = os.getenv("SAMPLE_DIR", "/path/to/your/ableton/library")
    db_backend: str = os.getenv("TAG_DB_BACKEND", "lancedb")
    db_path: str = os.getenv("TAG_DB_PATH", "./data/sample_library.lance")
    db_table: str = os.getenv("TAG_DB_TABLE", "samples")
    sample_extensions: tuple[str, ...] = (".wav", ".aif", ".aiff")
    audio_load_duration_sec: float | None = 3.0
    embedding_model: str = "models/text-embedding-004"
    vibe_model: str = "gemini-1.5-flash"
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
        y, sr = librosa.load(sample_path, duration=config.audio_load_duration_sec)
        raw_values = {
            "brightness": float(librosa.feature.spectral_centroid(y=y, sr=sr).mean()),
            "punch": float(librosa.feature.rms(y=y).mean() * 100.0),
            "duration": float(librosa.get_duration(y=y, sr=sr)),
        }
        return {k: raw_values[k] for k in config.math_attributes if k in raw_values}

# SPECIFIC IMPLIMENTATION (THIS IS WHAT SHOULD BE CHANGING AS WE DECIDE TECH STACK)
class VibeFeatureExtractor(FeatureExtractor):
    def __init__(self, model_name: str):
        self._model = genai.GenerativeModel(model_name)

    def extract(self, sample_path: str, config: IndexingConfig) -> dict[str, Any]:
        audio_file = genai.upload_file(path=sample_path)
        prompt = """
                Analyze this audio sample and return ONLY valid JSON with fields:
                {
                "category": "Kick/Snare/Hat/Vox/etc",
                "sub_category": "808/Acoustic/etc",
                "tags": ["tag1", "tag2", "tag3"],
                "description": "one sentence vibe check"
                }
                """
        response = self._model.generate_content([prompt, audio_file])
        cleaned = response.text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        return {k: parsed.get(k) for k in config.vibe_attributes}


#ABSTRACT METHOD FOR DATA STORAGE
class DatabaseAdapter(ABC):
    @abstractmethod
    def upsert(self, rows: list[dict[str, Any]], config: IndexingConfig) -> None:
        raise NotImplementedError

# LANCE WILL PERSIST
class LanceDbAdapter(DatabaseAdapter):
    def __init__(self, db_path: str):
        self._db = lancedb.connect(db_path)

    def upsert(self, rows: list[dict[str, Any]], config: IndexingConfig) -> None:
        self._db.create_table(config.db_table, data=rows, mode="overwrite")

# GOOD FOR TESTING
class InMemoryAdapter(DatabaseAdapter):
    """Useful for testing pipeline logic without a DB dependency."""

    def __init__(self):
        self.rows: list[dict[str, Any]] = []

    def upsert(self, rows: list[dict[str, Any]], config: IndexingConfig) -> None:
        self.rows = list(rows)
        print(f"[InMemoryAdapter] Stored {len(self.rows)} rows for '{config.db_table}'.")


# returns the specific db being used by the IndexingConfig object
def create_db_adapter(config: IndexingConfig) -> DatabaseAdapter:
    backends: dict[str, DatabaseAdapter] = {
        "lancedb": LanceDbAdapter(config.db_path),
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
        return []
    embedding_result = genai.embed_content(model=config.embedding_model, content=search_text)
    return embedding_result["embedding"]


# Offline loop through Ableton samples to update db
def run_indexing(config: IndexingConfig | None = None) -> None:
    config = config or IndexingConfig()
    if config.api_key == "YOUR_GEMINI_API_KEY":
        raise ValueError("Set GEMINI_API_KEY env var or update IndexingConfig.api_key.")
    genai.configure(api_key=config.api_key)

    db_adapter = create_db_adapter(config)
    math_extractor = MathFeatureExtractor()
    vibe_extractor = VibeFeatureExtractor(config.vibe_model)

    rows: list[dict[str, Any]] = []
    for root, _, files in os.walk(config.sample_dir):
        for file_name in files:
            path = os.path.join(root, file_name)
            if not should_index_file(path, config):
                continue

            print(f"Indexing: {file_name}")
            try:
                math_data = math_extractor.extract(path, config)
                vibe_data = vibe_extractor.extract(path, config)
                row = {**sample_metadata(path), **math_data, **vibe_data}
                row["vector"] = build_embedding(vibe_data, config)
                rows.append(row)
            except Exception as exc:
                print(f"Skipping {file_name} due to error: {exc}")

    db_adapter.upsert(rows, config)
    print(
        f"Success! Indexed {len(rows)} files to backend '{config.db_backend}' table '{config.db_table}'."
    )


if __name__ == "__main__":
    run_indexing()