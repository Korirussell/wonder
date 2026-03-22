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


def write_f0_contour(result: SplitResult) -> Path | None:
    """Write f0_contour.json for hum/whistle results. Returns the path."""
    if result.hum is None or not result.hum.f0_times:
        return None
    path = result.output_dir / "f0_contour.json"
    with open(path, "w") as f:
        json.dump(
            {
                "times": result.hum.f0_times,
                "f0_hz": result.hum.f0_hz,
                "f0_confidence": result.hum.f0_confidence,
            },
            f,
            indent=2,
        )
    return path
