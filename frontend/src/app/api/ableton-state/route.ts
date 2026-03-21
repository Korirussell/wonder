import { NextResponse } from "next/server";
import { sendAbletonCommand, isAbletonConnected } from "@/lib/ableton";

export async function GET() {
  const connected = await isAbletonConnected();

  if (!connected) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  try {
    // Two fast calls — avoid per-track detail fetching which times out
    const [sessionInfo, trackNames] = await Promise.all([
      sendAbletonCommand("get_session_info", {}) as Promise<Record<string, unknown>>,
      sendAbletonCommand("get_all_track_names", {}) as Promise<string[]>,
    ]);

    const names = Array.isArray(trackNames) ? trackNames : [];

    const tracks = names.map((name, i) => ({
      id: i,
      name: name || `Track ${i + 1}`,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      armed: false,
      devices: [],
    }));

    return NextResponse.json({
      connected: true,
      bpm: (sessionInfo.tempo as number) ?? 120,
      isPlaying: (sessionInfo.is_playing as boolean) ?? false,
      trackCount: (sessionInfo.track_count as number) ?? 0,
      tracks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
