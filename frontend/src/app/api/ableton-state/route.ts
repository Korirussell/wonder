import { NextResponse } from "next/server";
import { sendAbletonCommand, isAbletonConnected } from "@/lib/ableton";

// Force dynamic to prevent Next.js 15 caching this GET route
export const dynamic = "force-dynamic";

function buildKeyString(sessionInfo: Record<string, unknown>): string | null {
  // Ableton MCP may expose root_note (0-11) and scale_name
  const rootNote = sessionInfo.root_note;
  const scaleName = sessionInfo.scale_name;
  if (rootNote === undefined || rootNote === null) return null;

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const root = NOTE_NAMES[Number(rootNote) % 12] ?? null;
  if (!root) return null;

  const scale = typeof scaleName === "string" ? scaleName : "Major";
  return `${root} ${scale}`;
}

export async function GET() {
  const connected = await isAbletonConnected();

  if (!connected) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  try {
    const sessionInfo = await sendAbletonCommand("get_session_info", {}) as Record<string, unknown>;
    const trackCount = (sessionInfo.track_count as number) ?? 0;

    // Build track list from session info — fetch individual track info for names
    const tracks = [];
    for (let i = 0; i < Math.min(trackCount, 16); i++) {
      try {
        const info = await sendAbletonCommand("get_track_info", { track_index: i }) as Record<string, unknown>;
        tracks.push({
          id: i,
          name: (info.name as string) || `Track ${i + 1}`,
          volume: 0.85,
          pan: 0,
          mute: false,
          solo: false,
          armed: false,
          devices: [],
        });
      } catch {
        tracks.push({
          id: i,
          name: `Track ${i + 1}`,
          volume: 0.85,
          pan: 0,
          mute: false,
          solo: false,
          armed: false,
          devices: [],
        });
      }
    }

    return NextResponse.json({
      connected: true,
      bpm: (sessionInfo.tempo as number) ?? 120,
      isPlaying: (sessionInfo.is_playing as boolean) ?? false,
      key: buildKeyString(sessionInfo),
      trackCount,
      tracks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
