/**
 * /api/agent/session — Proxy to Wonder Agent server's session management
 *
 * POST { user_id?: string, state?: object }
 * → agent: POST http://localhost:8001/session/new
 * → returns: { session_id: string }
 *
 * Call this once per page load to get a session_id for use with /api/agent/chat.
 */

import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8001";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const resp = await fetch(`${AGENT_URL}/session/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: body.user_id ?? "default_user",
        state: body.state ?? {},
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return NextResponse.json({ error: `Agent error: ${err}` }, { status: resp.status });
    }

    return NextResponse.json(await resp.json());
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[agent/session] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
