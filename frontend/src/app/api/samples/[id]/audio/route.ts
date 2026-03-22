/**
 * /api/samples/[id]/audio — Proxy to FastAPI's /samples/{id}/audio endpoint
 *
 * GET → backend: GET http://localhost:8000/samples/{id}/audio
 * → streams binary audio response with correct Content-Type
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const resp = await fetch(`${BACKEND_URL}/samples/${id}/audio`);

    if (!resp.ok) {
      return NextResponse.json({ error: "Not found" }, { status: resp.status });
    }

    const contentType = resp.headers.get("content-type") ?? "audio/wav";
    const buffer = await resp.arrayBuffer();
    return new Response(buffer, { headers: { "Content-Type": contentType } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[samples/[id]/audio] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
