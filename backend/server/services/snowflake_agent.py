"""
Quarantined Snowflake agent service.

Drop your teammate's logic into `_run_core_logic()` below.
This module is intentionally isolated — it has no imports from the rest of
the Wonder server so a crash here cannot propagate upward.
"""
from __future__ import annotations

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

# ---------------------------------------------------------------------------
# Snowflake credentials — all sourced from env, never hardcoded
# ---------------------------------------------------------------------------

SNOWFLAKE_ACCOUNT    = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER       = os.getenv("SNOWFLAKE_USER", "")
SNOWFLAKE_PASSWORD   = os.getenv("SNOWFLAKE_PASSWORD", "")
SNOWFLAKE_WAREHOUSE  = os.getenv("SNOWFLAKE_WAREHOUSE", "")
SNOWFLAKE_DATABASE   = os.getenv("SNOWFLAKE_DATABASE", "")
SNOWFLAKE_SCHEMA     = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")
SNOWFLAKE_ROLE       = os.getenv("SNOWFLAKE_ROLE", "")

# ---------------------------------------------------------------------------
# Thread pool — Snowflake connector is synchronous; run it off the event loop
# ---------------------------------------------------------------------------

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="snowflake")


# ---------------------------------------------------------------------------
# ▼▼▼  PASTE YOUR TEAMMATE'S LOGIC HERE  ▼▼▼
# ---------------------------------------------------------------------------

def _run_core_logic(payload: dict) -> dict:
    """
    Synchronous Snowflake logic.  Replace the body of this function with
    your teammate's code.  It receives the raw request payload dict and must
    return a plain dict that will be JSON-serialised back to the client.

    Example skeleton using snowflake-connector-python:

        import snowflake.connector

        conn = snowflake.connector.connect(
            account=SNOWFLAKE_ACCOUNT,
            user=SNOWFLAKE_USER,
            password=SNOWFLAKE_PASSWORD,
            warehouse=SNOWFLAKE_WAREHOUSE,
            database=SNOWFLAKE_DATABASE,
            schema=SNOWFLAKE_SCHEMA,
            role=SNOWFLAKE_ROLE,
        )
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM your_table")
        row = cur.fetchone()
        cur.close()
        conn.close()
        return {"count": row[0]}
    """
    # ---- YOUR TEAMMATE'S CODE GOES HERE ----
    raise NotImplementedError("Paste your teammate's Snowflake logic here.")


# ---------------------------------------------------------------------------
# Public async wrapper — called by the FastAPI endpoint
# ---------------------------------------------------------------------------

async def run_snowflake_agent(payload: dict) -> dict:
    """
    Run the synchronous Snowflake logic in a thread so the event loop stays free.
    Any exception bubbles up to the endpoint's blast-shield try/except.
    """
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(_executor, _run_core_logic, payload)
    return result
