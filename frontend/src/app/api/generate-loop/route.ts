/**
 * /api/generate-loop — Proxy to FastAPI's /generate-loop endpoint
 *
 * POST { prompt, duration_seconds, bars, bpm, loop? }
 * → backend: POST http://localhost:8000/generate-loop
 * → returns: { audio_base64: string, duration_seconds: number, bars: number, bpm: number }
 *
 * The frontend pre-enriches the prompt with BPM + key before calling here.
 * The backend injects the Wonder style suffix before calling ElevenLabs.
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.prompt || typeof body.prompt !== "string") {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    if (typeof body.duration_seconds !== "number") {
      return NextResponse.json({ error: "duration_seconds is required" }, { status: 400 });
    }

    console.log(
      `[generate-loop] "${body.prompt}" — ${body.bars ?? "?"}bars @ ${body.bpm ?? "?"}BPM = ${body.duration_seconds.toFixed(2)}s`,
    );

    const resp = await fetch(`${BACKEND_URL}/generate-loop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt:           body.prompt,
        duration_seconds: body.duration_seconds,
        bars:             body.bars  ?? 4,
        bpm:              body.bpm   ?? 120,
        loop:             body.loop  ?? true,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[generate-loop] backend error ${resp.status}: ${err}`);
      return NextResponse.json({ error: `Backend error: ${err}` }, { status: resp.status });
    }

    return NextResponse.json(await resp.json());
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[generate-loop] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
