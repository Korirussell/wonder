import { NextResponse } from "next/server";
import { sendAbletonCommand, isAbletonConnected } from "@/lib/ableton";

export async function GET() {
  const connected = await isAbletonConnected();

  if (!connected) {
    return NextResponse.json({ connected: false }, { status: 503 });
  }

  try {
    const [sessionInfo, trackInfos] = await Promise.all([
      sendAbletonCommand("get_session_info", {}) as Promise<{
        tempo: number;
        track_count: number;
        scene_count: number;
        is_playing: boolean;
      }>,
      sendAbletonCommand("get_all_track_names", {}) as Promise<string[]>,
    ]);

    // Fetch per-track info for the first 12 tracks max (avoid overwhelming Ableton)
    const trackCount = Math.min(sessionInfo.track_count ?? 0, 12);
    const trackDetails = await Promise.all(
      Array.from({ length: trackCount }, (_, i) =>
        sendAbletonCommand("get_track_info", { track_index: i }).catch(() => null)
      )
    );

    return NextResponse.json({
      connected: true,
      bpm: sessionInfo.tempo ?? 120,
      isPlaying: sessionInfo.is_playing ?? false,
      tracks: trackDetails
        .map((t: unknown, i) => {
          const track = t as Record<string, unknown> | null;
          if (!track) return null;
          return {
            id: i,
            name: Array.isArray(trackInfos) ? (trackInfos[i] ?? `Track ${i + 1}`) : `Track ${i + 1}`,
            volume: (track.volume as number) ?? 0.85,
            pan: (track.pan as number) ?? 0,
            mute: (track.mute as boolean) ?? false,
            solo: (track.solo as boolean) ?? false,
            armed: (track.arm as boolean) ?? false,
            devices: Array.isArray(track.devices)
              ? (track.devices as Array<{ name: string }>).map((d) => d.name)
              : [],
          };
        })
        .filter(Boolean),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
