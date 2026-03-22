#!/usr/bin/env python3
"""
Peek at the local LanceDB index (same paths as tagging.py via .env).

Run from the **repo root** (`wonder/`) so `.env` and relative paths resolve:

    cd wonder
    source .venv/bin/activate
    python tagging/inspect_lancedb.py
    python tagging/inspect_lancedb.py --limit 5
    python tagging/inspect_lancedb.py --list-tables
    python tagging/inspect_lancedb.py --path ./data/sample_library.lance --table samples
    python tagging/inspect_lancedb.py --all              # include invalid / empty / silent rows
    python tagging/inspect_lancedb.py --min-punch 0       # disable low-RMS (silence) cutoff
    python tagging/inspect_lancedb.py --require-existing-files
    python tagging/inspect_lancedb.py --raw-table   # wide pandas layout
    python tagging/inspect_lancedb.py --width 72 --no-color
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
from pathlib import Path
from typing import Any

import numpy as np
from dotenv import load_dotenv
import lancedb
import pandas as pd

# Same as tagging.py: load wonder/.env when cwd is repo root.
load_dotenv()


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def resolve_db_path(db_path: str) -> str:
    p = Path(db_path).expanduser()
    if p.is_absolute():
        return str(p)
    return str(_project_root() / p)


def _list_table_names(db: Any) -> list[str]:
    list_tables = getattr(db, "list_tables", None)
    if callable(list_tables):
        raw = list_tables()
        # Newer LanceDB: ListTablesResponse with .tables = ['name', ...]
        nested = getattr(raw, "tables", None)
        if isinstance(nested, list):
            return [str(x) for x in nested]
        # Older / list return
        if isinstance(raw, list):
            out: list[str] = []
            for t in raw:
                if isinstance(t, str):
                    out.append(t)
                else:
                    name = getattr(t, "name", None)
                    out.append(name if isinstance(name, str) else str(t))
            return out
    tn = getattr(db, "table_names", None)
    if callable(tn):
        return list(tn())
    return []


def _str_field(row: pd.Series, key: str) -> str:
    if key not in row.index:
        return ""
    v = row.get(key)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def _tags_list(row: pd.Series) -> list[str]:
    if "tags" not in row.index:
        return []
    t = row.get("tags")
    if t is None or (isinstance(t, float) and pd.isna(t)):
        return []
    if hasattr(t, "tolist"):
        t = t.tolist()
    if not isinstance(t, (list, tuple)):
        return []
    out: list[str] = []
    for x in t:
        if x is None or (isinstance(x, float) and pd.isna(x)):
            continue
        s = str(x).strip()
        if s:
            out.append(s)
    return out


def _has_usable_vibe(row: pd.Series) -> bool:
    for k in ("category", "sub_category", "description"):
        if _str_field(row, k):
            return True
    return len(_tags_list(row)) > 0


def _is_zero_vector(value: Any) -> bool:
    if value is None:
        return True
    try:
        arr = np.asarray(value, dtype=float).ravel()
        if arr.size == 0:
            return True
        return bool(np.allclose(arr, 0.0, atol=1e-12))
    except (TypeError, ValueError):
        return True


def apply_display_filters(
    df: pd.DataFrame,
    *,
    show_all: bool,
    min_punch: float,
    require_existing_file: bool,
) -> tuple[pd.DataFrame, int]:
    """
    Drop rows that look invalid, silent, or devoid of usable tags (same table as tagging.py).

    Returns (filtered_dataframe, number_of_rows_removed).
    """
    if show_all or df.empty:
        return df, 0

    n0 = len(df)
    keep = pd.Series(True, index=df.index)

    if "duration" in df.columns:
        d = pd.to_numeric(df["duration"], errors="coerce")
        keep &= d.notna() & (d > 0)

    if "punch" in df.columns:
        pu = pd.to_numeric(df["punch"], errors="coerce")
        keep &= pu.notna()
        if min_punch > 0:
            keep &= pu >= min_punch

    def row_ok(r: pd.Series) -> bool:
        if not _has_usable_vibe(r):
            return False
        if "vector" in r.index and _is_zero_vector(r.get("vector")):
            return False
        return True

    keep &= df.apply(row_ok, axis=1)

    if require_existing_file and "file_path" in df.columns:
        def file_exists(p: Any) -> bool:
            if p is None or (isinstance(p, float) and pd.isna(p)):
                return False
            return Path(str(p)).expanduser().is_file()

        keep &= df["file_path"].map(file_exists)

    out = df.loc[keep].reset_index(drop=True)
    return out, n0 - len(out)


def _use_ansi() -> bool:
    return bool(sys.stdout.isatty() and not os.environ.get("NO_COLOR", "").strip())


def _style(code: str, s: str) -> str:
    if not _use_ansi() or not s:
        return s
    return f"{code}{s}\033[0m"


def bold(s: str) -> str:
    return _style("\033[1m", s)


def dim(s: str) -> str:
    return _style("\033[2m", s)


def _parent_parts(rel: str) -> tuple[str, ...]:
    """Directory parts of a relative path (no filename)."""
    parts = Path(rel.replace("\\", "/")).parts
    return tuple(parts[:-1]) if len(parts) > 1 else ()


def _common_parent_prefix(relative_paths: list[str]) -> str:
    """Longest shared parent directory among relative paths (POSIX-style)."""
    rels = [p.replace("\\", "/").strip("/") for p in relative_paths if p]
    if not rels:
        return ""
    parts_list = [_parent_parts(r) for r in rels]
    if not any(parts_list):
        return ""
    common: list[str] = []
    for tup in zip(*parts_list):
        if len(set(tup)) == 1:
            common.append(tup[0])
        else:
            break
    return "/".join(common)


def shorten_paths_for_display(paths: list[str], repo_root: Path) -> list[str]:
    """
    Repo-relative paths, then drop directory segments shared by the whole batch
    so only distinctive tails remain (e.g. ``hats/kick.wav`` not ``Drums copy/hats/...``).
    """
    root = repo_root.resolve()
    rels: list[str] = []
    for p in paths:
        if p is None or (isinstance(p, float) and pd.isna(p)):
            rels.append("")
            continue
        try:
            r = Path(str(p)).expanduser().resolve().relative_to(root)
            rels.append(str(r).replace("\\", "/"))
        except ValueError:
            rels.append(Path(str(p)).name)

    nonempty = [r for r in rels if r]
    # Only strip shared parent dirs when 2+ rows (single row keeps full repo-relative path).
    common = _common_parent_prefix(nonempty) if len(nonempty) >= 2 else ""
    out: list[str] = []
    for r in rels:
        if not r:
            out.append("(no path)")
            continue
        if common:
            try:
                tail = Path(r).relative_to(Path(common)).as_posix()
                if tail in (".", ""):
                    out.append(Path(r).name)
                else:
                    out.append(tail)
                continue
            except ValueError:
                pass
        out.append(r)
    return out


def _format_tags_line(row: pd.Series, max_chars: int = 96) -> str:
    tags = _tags_list(row)
    if not tags:
        return ""
    # Title-case short tokens for readability; keep original if mixed case long
    parts = []
    total = 0
    for t in tags:
        sep = " · " if parts else ""
        if total + len(sep) + len(t) > max_chars:
            parts.append("…")
            break
        parts.append(t)
        total += len(sep) + len(t)
    return " · ".join(parts)


def _format_category_line(row: pd.Series) -> str:
    cat = _str_field(row, "category")
    sub = _str_field(row, "sub_category")
    if cat and sub:
        return f"{cat} › {sub}"
    return cat or sub or ""


def print_friendly_rows(
    df: pd.DataFrame,
    *,
    repo_root: Path,
    wrap_width: int = 88,
    with_vector: bool = False,
) -> None:
    """
    Human-oriented listing: short path, bold kind line, tags, wrapped description.
    """
    if df.empty:
        return

    paths = [str(df["file_path"].iloc[i]) if "file_path" in df.columns else "" for i in range(len(df))]
    short_paths = shorten_paths_for_display(paths, repo_root)

    w = max(40, min(wrap_width, 120))
    sep = dim("─" * min(w, 72))

    for i, (_, row) in enumerate(df.iterrows()):
        label = short_paths[i] if i < len(short_paths) else _str_field(row, "file_name") or "?"
        print(f"\n{sep}")
        print(bold(label))

        kind = _format_category_line(row)
        if kind:
            print(f"  {bold(kind)}")

        tags_line = _format_tags_line(row, max_chars=w + 10)
        if tags_line:
            print(f"  {tags_line}")

        desc = _str_field(row, "description")
        if desc:
            wrapped = textwrap.fill(
                desc,
                width=w,
                initial_indent="  ",
                subsequent_indent="  ",
                break_long_words=True,
            )
            print(wrapped)

        meta_bits: list[str] = []
        fn = _str_field(row, "file_name") if "file_name" in row.index else ""
        # Skip filename in meta when the short path already ends with that basename.
        if fn and Path(label.replace("\\", "/")).name != fn:
            meta_bits.append(fn)
        for key, fmt in (("duration", "{:.2f}s"), ("punch", "rms×100 {:.3f}")):
            if key not in row.index:
                continue
            v = row.get(key)
            if v is None or (isinstance(v, float) and pd.isna(v)):
                continue
            try:
                fv = float(v)
                if key == "duration":
                    meta_bits.append(fmt.format(fv))
                else:
                    meta_bits.append(fmt.format(fv))
            except (TypeError, ValueError):
                continue
        if meta_bits:
            print(dim("  " + "  ·  ".join(meta_bits)))

        if with_vector and "vector" in row.index:
            print(dim(f"  {_vector_summary(row.get('vector'))}"))

    print(f"\n{sep}\n")


def _vector_summary(value: Any) -> str:
    if value is None:
        return "None"
    if hasattr(value, "__len__") and not isinstance(value, str):
        try:
            n = len(value)
            return f"<vector len={n}>"
        except TypeError:
            pass
    return repr(value)[:80]


def main() -> int:
    default_path = os.getenv("TAG_DB_PATH", "./data/sample_library.lance")
    default_table = os.getenv("TAG_DB_TABLE", "samples")

    p = argparse.ArgumentParser(description="Inspect Wonder LanceDB sample index.")
    p.add_argument(
        "--path",
        default=default_path,
        help=f"DB directory (default: env TAG_DB_PATH or {default_path!r})",
    )
    p.add_argument(
        "--table",
        default=default_table,
        help=f"Table name (default: env TAG_DB_TABLE or {default_table!r})",
    )
    p.add_argument("--limit", type=int, default=20, metavar="N", help="Max rows to print (default: 20)")
    p.add_argument(
        "--list-tables",
        action="store_true",
        help="Only print table names and row counts, then exit",
    )
    p.add_argument(
        "--with-vector",
        action="store_true",
        help="Include a short vector summary column instead of hiding vectors",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Print only the first row as JSON on stdout (pipe-friendly; vector omitted unless --with-vector)",
    )
    p.add_argument(
        "--all",
        action="store_true",
        help="Show every row (disable filtering of invalid / empty-vibe / silent / zero-vector rows)",
    )
    p.add_argument(
        "--min-punch",
        type=float,
        default=1e-7,
        metavar="X",
        help="Hide rows with punch < X (RMS-based; tagging uses rms*100). 0 disables this check. Default: 1e-7",
    )
    p.add_argument(
        "--require-existing-files",
        action="store_true",
        help="Hide rows whose file_path is missing on disk",
    )
    p.add_argument(
        "--raw-table",
        action="store_true",
        help="Print the wide pandas table instead of the friendly layout",
    )
    p.add_argument(
        "--width",
        type=int,
        default=88,
        metavar="COLS",
        help="Max columns for wrapping descriptions in friendly mode (default: 88)",
    )
    p.add_argument(
        "--no-color",
        action="store_true",
        help="Disable bold/dim ANSI formatting (or set NO_COLOR=1)",
    )
    args = p.parse_args()

    if args.no_color:
        os.environ["NO_COLOR"] = "1"

    resolved = resolve_db_path(args.path)
    if not Path(resolved).exists():
        print(f"Error: database path does not exist: {resolved}", file=sys.stderr)
        print("  (Run from repo root, or pass --path to your .lance directory.)", file=sys.stderr)
        return 1

    db = lancedb.connect(resolved)
    names = _list_table_names(db)
    if not names:
        print(f"Connected to {resolved!r} — no tables found.")
        return 0

    if args.list_tables:
        print(f"LanceDB: {resolved}\n")
        for name in names:
            try:
                n = db.open_table(name).count_rows()
            except Exception as exc:  # noqa: BLE001
                n = f"? ({exc})"
            print(f"  • {name!r}  rows={n}")
        return 0

    if args.table not in names:
        print(f"Error: no table {args.table!r}. Available: {', '.join(names)}", file=sys.stderr)
        return 1

    table = db.open_table(args.table)
    try:
        n_rows = table.count_rows()
    except Exception:  # noqa: BLE001
        n_rows = None

    df = table.to_pandas()
    if df.empty:
        if args.json:
            print("null")
        else:
            print(f"LanceDB: {resolved}")
            print(f"Table:   {args.table!r}" + (f"  ({n_rows} rows)" if n_rows is not None else ""))
            print()
            print("(empty table)")
        return 0

    df_view, n_hidden = apply_display_filters(
        df,
        show_all=args.all,
        min_punch=max(0.0, args.min_punch),
        require_existing_file=args.require_existing_files,
    )

    if args.json:
        if df_view.empty:
            print("null")
            return 0
        row = df_view.iloc[0].to_dict()
        out = {}
        for k, v in row.items():
            if k == "vector" and not args.with_vector:
                out[k] = _vector_summary(v)
            elif k == "vector" and args.with_vector:
                try:
                    lv = list(v)[:8] if hasattr(v, "__iter__") and not isinstance(v, str) else v
                    out[k] = {"preview": lv, "len": len(v) if hasattr(v, "__len__") else None}
                except Exception:  # noqa: BLE001
                    out[k] = _vector_summary(v)
            else:
                if hasattr(v, "tolist"):
                    out[k] = v.tolist()
                else:
                    out[k] = v
        print(json.dumps(out, indent=2, default=str))
        return 0

    print(f"LanceDB: {resolved}")
    table_line = f"Table:   {args.table!r}"
    if n_rows is not None:
        table_line += f"  ({n_rows} rows"
        if n_hidden:
            table_line += f"; {n_hidden} hidden by filters"
        table_line += ")"
    elif n_hidden:
        table_line += f"  ({n_hidden} row(s) hidden by filters)"
    print(table_line)
    if n_hidden and not args.all:
        print(
            "  Filters: duration>0, punch OK, min punch, non-empty vibe, non-zero vector"
            + ("; file must exist" if args.require_existing_files else "")
            + "  →  --all  disables  |  --min-punch 0  drops silence cutoff",
        )
    print()

    if df_view.empty:
        print("(no rows left after filters; use --all to see everything)")
        return 0

    display = df_view.head(max(1, args.limit)).copy()

    if args.raw_table:
        if "vector" in display.columns and not args.with_vector:
            display = display.drop(columns=["vector"])
        elif "vector" in display.columns and args.with_vector:
            display["vector"] = display["vector"].map(_vector_summary)

        with pd.option_context(
            "display.max_columns",
            None,
            "display.width",
            120,
            "display.max_colwidth",
            60,
        ):
            print(display.to_string(index=False))
    else:
        print_friendly_rows(
            display,
            repo_root=_project_root(),
            wrap_width=args.width,
            with_vector=args.with_vector,
        )

    print()
    total_shown_pool = len(df_view)
    if n_hidden:
        pool_label = "rows after filters"
    else:
        pool_label = "rows"
    if len(display) < total_shown_pool:
        print(f"(showing {len(display)} of {total_shown_pool} {pool_label}; use --limit to see more)")
    elif n_rows is not None and (n_hidden or len(display) < n_rows):
        extra = f" of {n_rows} in table" if n_rows != len(display) else ""
        print(f"(showing all {len(display)} {pool_label}{extra})")
    if args.raw_table and "vector" in df.columns and not args.with_vector:
        print("(column `vector` hidden; use --with-vector for a length summary per row)")
    elif not args.raw_table and not args.with_vector:
        print("(friendly layout — vectors omitted; use --with-vector or --raw-table)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
