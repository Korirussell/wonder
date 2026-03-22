import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const EMPTY_STATS = { session_count: 0, messages_sent: 0, liked: 0, disliked: 0, sounds_saved: 0 };

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${BACKEND_URL}/analytics/user/${encodeURIComponent(userId)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(EMPTY_STATS);
  }
}
