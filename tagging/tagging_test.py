"""
In-memory practice run for the tagging pipeline.

This script does not call Gemini, does not read audio files, and does not write to
an external database. It demonstrates the indexing workflow with dummy data.
"""

import os
from dataclasses import dataclass
from typing import Any


@dataclass
class PracticeConfig:
    sample_extensions: tuple[str, ...] = (".wav", ".aif", ".aiff")
    db_table: str = "samples_practice"


class InMemoryAdapter:
    def __init__(self):
        self.rows: list[dict[str, Any]] = []

    def upsert(self, rows: list[dict[str, Any]], config: PracticeConfig) -> None:
        self.rows = list(rows)
        print(f"[InMemoryAdapter] Stored {len(self.rows)} rows for '{config.db_table}'.")


def should_index_file(path: str, config: PracticeConfig) -> bool:
    return path.lower().endswith(config.sample_extensions)


def sample_metadata(path: str) -> dict[str, Any]:
    base_name = os.path.basename(path)
    extension = os.path.splitext(base_name)[1].lower()
    return {
        "file_path": path,
        "file_name": base_name,
        "file_extension": extension,
        "source": "local_filesystem",
    }


def dummy_math_features(sample_path: str) -> dict[str, Any]:
    """Deterministic fake math features based on filename."""
    name = os.path.basename(sample_path).lower()
    if "hat" in name or "shaker" in name:
        return {"brightness": 3400.0, "punch": 58.0, "duration": 0.22}
    if "kick" in name:
        return {"brightness": 1400.0, "punch": 96.0, "duration": 0.35}
    if "snare" in name:
        return {"brightness": 2400.0, "punch": 84.0, "duration": 0.28}
    if "bass" in name:
        return {"brightness": 900.0, "punch": 74.0, "duration": 1.40}
    if "chord" in name or "keys" in name:
        return {"brightness": 1900.0, "punch": 52.0, "duration": 2.80}
    if "vox" in name:
        return {"brightness": 2200.0, "punch": 48.0, "duration": 1.90}
    if "fx" in name:
        return {"brightness": 2800.0, "punch": 44.0, "duration": 3.20}
    return {"brightness": 1800.0, "punch": 62.0, "duration": 2.0}


def dummy_vibe_features(sample_path: str) -> dict[str, Any]:
    """Deterministic fake vibe metadata based on filename."""
    name = os.path.basename(sample_path).lower()
    if "kick" in name:
        return {
            "category": "Kick",
            "sub_category": "Electronic",
            "tags": ["tight", "punchy", "club"],
            "description": "A focused electronic kick for dance grooves.",
        }
    if "hat" in name:
        return {
            "category": "Hat",
            "sub_category": "Closed",
            "tags": ["bright", "crisp", "short"],
            "description": "A crisp closed hat with a bright top end.",
        }
    if "snare" in name:
        return {
            "category": "Snare",
            "sub_category": "Electronic",
            "tags": ["snappy", "midrange", "tight"],
            "description": "A snappy electronic snare for modern beats.",
        }
    if "bass" in name:
        return {
            "category": "Bass",
            "sub_category": "Synth",
            "tags": ["sub", "warm", "rounded"],
            "description": "A warm synth bass with solid low-end weight.",
        }
    if "chord" in name or "keys" in name:
        return {
            "category": "Keys",
            "sub_category": "Chord",
            "tags": ["lush", "wide", "musical"],
            "description": "A lush chord stab progression for harmonic layers.",
        }
    if "vox" in name:
        return {
            "category": "Vox",
            "sub_category": "Chop",
            "tags": ["airy", "human", "textural"],
            "description": "An airy vocal chop suitable for hooks and fills.",
        }
    if "fx" in name:
        return {
            "category": "FX",
            "sub_category": "Riser",
            "tags": ["sweep", "cinematic", "transition"],
            "description": "A cinematic riser useful for transitions.",
        }
    return {
        "category": "Perc",
        "sub_category": "Loop",
        "tags": ["textured", "organic"],
        "description": "A textured percussive loop with natural swing.",
    }


def dummy_embedding(vibe_data: dict[str, Any]) -> list[float]:
    """Simple fake embedding so the row shape matches production data."""
    seed = sum(ord(ch) for ch in str(vibe_data))
    return [float((seed + i) % 101) / 100.0 for i in range(8)]


def run_practice_index() -> None:
    config = PracticeConfig()
    db_adapter = InMemoryAdapter()

    dummy_samples = [
        "/dummy/library/drums/kick_oneshot_01.wav",
        "/dummy/library/drums/snare_oneshot_03.wav",
        "/dummy/library/drums/hat_closed_oneshot_02.aif",
        "/dummy/library/bass/bass_subline_01.wav",
        "/dummy/library/keys/chord_stab_minor_01.wav",
        "/dummy/library/vocals/vox_chop_phrase_01.aiff",
        "/dummy/library/fx/fx_riser_noise_01.wav",
        "/dummy/library/loops/perc_loop_120bpm.wav",
        "/dummy/library/readme.txt",  # filtered out by should_index_file
    ]

    rows: list[dict[str, Any]] = []
    for path in dummy_samples:
        if not should_index_file(path, config):
            continue

        math_data = dummy_math_features(path)
        vibe_data = dummy_vibe_features(path)
        row = {**sample_metadata(path), **math_data, **vibe_data}
        row["vector"] = dummy_embedding(vibe_data)
        rows.append(row)

    db_adapter.upsert(rows, config)
    print(f"Practice run indexed {len(db_adapter.rows)} rows.")
    for idx, row in enumerate(db_adapter.rows, start=1):
        print(
            f"{idx}. {row['file_name']} | {row['category']} | "
            f"brightness={row['brightness']}, punch={row['punch']}, duration={row['duration']} | "
            f"tags={row['tags']} | vector_dim={len(row['vector'])}"
        )


if __name__ == "__main__":
    run_practice_index()
