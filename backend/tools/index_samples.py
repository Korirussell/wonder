from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from services.sample_database import SampleDatabaseService
from services.sample_indexing import SampleIndexingService


def main() -> None:
    parser = argparse.ArgumentParser(description="Index local samples into LanceDB")
    parser.add_argument(
        "--sample-root",
        help="Directory of samples to index (defaults to SAMPLE_DIR or ./samples)",
    )
    args = parser.parse_args()

    database = SampleDatabaseService()
    indexer = SampleIndexingService(database=database, sample_root=args.sample_root)
    result = indexer.index_local_samples()
    print(
        f"Indexed {result.indexed_records} sample(s) from {result.sample_root} "
        f"({result.processed_files} audio file(s) scanned)."
    )


if __name__ == "__main__":
    main()
