#!/usr/bin/env python3
"""
Sound indexing search script for Wonder.
Performs semantic vector search with filtering on indexed samples.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import lancedb
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def search_samples(
    query: str,
    limit: int = 10,
    tags: list[str] | None = None,
    bpm_min: float | None = None,
    bpm_max: float | None = None,
    key: str | None = None,
) -> list[dict]:
    """
    Search indexed samples using semantic vector search with optional filters.
    
    Args:
        query: Natural language search query
        limit: Maximum number of results
        tags: Filter by tags (AND logic)
        bpm_min: Minimum BPM
        bpm_max: Maximum BPM
        key: Musical key filter
    
    Returns:
        List of matching samples with metadata
    """
    db_path = os.getenv("TAG_DB_PATH", "./data/sample_library.lance")
    db_table = os.getenv("TAG_DB_TABLE", "samples")
    
    if not Path(db_path).exists():
        print(json.dumps([]))
        return []
    
    try:
        db = lancedb.connect(db_path)
        table = db.open_table(db_table)
        
        # Build filter conditions
        filters = []
        
        if tags:
            for tag in tags:
                filters.append(f"array_contains(tags, '{tag}')")
        
        if bpm_min is not None:
            filters.append(f"bpm >= {bpm_min}")
        
        if bpm_max is not None:
            filters.append(f"bpm <= {bpm_max}")
        
        if key:
            filters.append(f"key = '{key}'")
        
        # Perform vector search
        search_query = table.search(query)
        
        if filters:
            filter_expr = " AND ".join(filters)
            search_query = search_query.where(filter_expr)
        
        results = search_query.limit(limit).to_list()
        
        # Format results
        formatted = []
        for row in results:
            formatted.append({
                "id": row.get("file_path", ""),
                "name": row.get("file_name", ""),
                "file_path": row.get("file_path", ""),
                "tags": row.get("tags", []),
                "bpm": row.get("bpm"),
                "key": row.get("key"),
                "duration_s": row.get("duration", 0),
                "category": row.get("category"),
                "sub_category": row.get("sub_category"),
                "description": row.get("description"),
                "similarity_score": row.get("_distance", 0),
            })
        
        print(json.dumps(formatted))
        return formatted
        
    except Exception as e:
        print(f"Search error: {e}", file=sys.stderr)
        print(json.dumps([]))
        return []


def main():
    parser = argparse.ArgumentParser(description="Search indexed audio samples")
    parser.add_argument("--query", required=True, help="Search query")
    parser.add_argument("--limit", type=int, default=10, help="Max results")
    parser.add_argument("--tags", help="Comma-separated tags to filter by")
    parser.add_argument("--bpm-min", type=float, help="Minimum BPM")
    parser.add_argument("--bpm-max", type=float, help="Maximum BPM")
    parser.add_argument("--key", help="Musical key filter")
    
    args = parser.parse_args()
    
    tags = args.tags.split(",") if args.tags else None
    
    search_samples(
        query=args.query,
        limit=args.limit,
        tags=tags,
        bpm_min=args.bpm_min,
        bpm_max=args.bpm_max,
        key=args.key,
    )


if __name__ == "__main__":
    main()
