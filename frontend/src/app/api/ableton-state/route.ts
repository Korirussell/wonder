import { NextResponse } from "next/server";
import { sendAbletonCommand, isAbletonConnected } from "@/lib/ableton";

export async function GET() {
  const connected = await isAbletonConnected();

  if (!connected) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  try {
    const sessionInfo = await sendAbletonCommand("get_session_info", {}) as Record<string, unknown>;

    return NextResponse.json({
      connected: true,
      bpm: sessionInfo.tempo ?? 120,
      key: sessionInfo.key ?? null,
      isPlaying: sessionInfo.is_playing ?? false,
      trackCount: sessionInfo.track_count ?? 0,
      // Full per-track details are expensive — SessionMirror uses this for the HUD only.
      // For the track list, Wonder updates it via chat tool call results instead.
      tracks: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
