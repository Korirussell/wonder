from __future__ import annotations

import json
from pathlib import Path

from ._types import SplitResult


def write_metadata(result: SplitResult) -> Path:
    """Write metadata.json to output_dir. Returns the path."""
    path = result.output_dir / "metadata.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(result.to_dict(), f, indent=2)
    return path


def write_beat_grid(result: SplitResult) -> Path | None:
    """Write beat_grid.json if beat data is present. Returns the path."""
    if not result.beat_times:
        return None
    path = result.output_dir / "beat_grid.json"
    with open(path, "w") as f:
        json.dump(
            {
                "bpm": result.bpm,
                "time_signature": result.time_signature,
                "beats": result.beat_times,
                "downbeats": result.downbeat_times,
            },
            f,
            indent=2,
        )
    return path
