/**
 * /api/samples/generate — Proxy to FastAPI's /generate-instrument endpoint
 *
 * POST { prompt: string, duration_seconds?: number, search_limit?: number }
 * → backend: POST http://localhost:8000/generate-instrument
 * → returns: JSON (includes strategy, sample_id, audio_url, etc.)
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const resp = await fetch(`${BACKEND_URL}/generate-instrument`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[samples/generate] backend error ${resp.status}: ${err}`);
      return NextResponse.json({ error: `Backend error: ${err}` }, { status: resp.status });
    }

    return NextResponse.json(await resp.json());
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[samples/generate] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
