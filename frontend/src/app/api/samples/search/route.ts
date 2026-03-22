/**
 * /api/samples/search — Proxy to FastAPI's /samples/search endpoint
 *
 * POST { query: string, limit?: number, tags?: string[], source?: string, category?: string, sub_category?: string }
 * → backend: POST http://localhost:8000/samples/search
 * → returns: JSON search results
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.query || typeof body.query !== "string") {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const resp = await fetch(`${BACKEND_URL}/samples/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[samples/search] backend error ${resp.status}: ${err}`);
      return NextResponse.json({ error: `Backend error: ${err}` }, { status: resp.status });
    }

    return NextResponse.json(await resp.json());
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[samples/search] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
