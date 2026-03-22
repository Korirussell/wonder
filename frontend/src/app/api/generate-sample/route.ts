/**
 * /api/generate-sample — Proxy to FastAPI's /generate-sample endpoint
 *
 * POST { prompt: string, duration_seconds?: number }
 * → backend: POST http://localhost:8000/generate-sample
 * → returns: { audio_base64: string, prompt: string }
 *
 * The backend injects the Wonder style profile before calling ElevenLabs,
 * and returns the raw MP3 as base64 so the frontend can build a data URI
 * without any filesystem paths (which break in split dev environments).
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const resp = await fetch(`${BACKEND_URL}/generate-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: body.prompt,
        duration_seconds: body.duration_seconds ?? 22.0,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[generate-sample] backend error ${resp.status}: ${err}`);
      return NextResponse.json({ error: `Backend error: ${err}` }, { status: resp.status });
    }

    return NextResponse.json(await resp.json());
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[generate-sample] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
