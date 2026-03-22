import { NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 1500;

let cachedState:
  | {
      expiresAt: number;
      payload: Record<string, unknown>;
      status: number;
    }
  | null = null;

let inFlightRequest: Promise<{ payload: Record<string, unknown>; status: number }> | null = null;

function buildKeyString(sessionInfo: Record<string, unknown>): string | null {
  const rootNote = sessionInfo.root_note;
  const scaleName = sessionInfo.scale_name;
  if (rootNote === undefined || rootNote === null) return null;

  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const root = noteNames[Number(rootNote) % 12] ?? null;
  if (!root) return null;

  const scale = typeof scaleName === "string" ? scaleName : "Major";
  return `${root} ${scale}`;
}

export async function GET() {
  const now = Date.now();
  if (cachedState && cachedState.expiresAt > now) {
    return NextResponse.json(cachedState.payload, { status: cachedState.status });
  }

  if (inFlightRequest) {
    const { payload, status } = await inFlightRequest;
    return NextResponse.json(payload, { status });
  }

  inFlightRequest = (async () => {
    try {
      const sessionInfo = await sendAbletonCommand("get_session_info", {}) as Record<string, unknown>;
      const trackCount = (sessionInfo.track_count as number) ?? 0;

      const tracks = [];
      for (let i = 0; i < Math.min(trackCount, 16); i++) {
        try {
          const info = await sendAbletonCommand("get_track_info", { track_index: i }) as Record<string, unknown>;
          type RawSlot = { has_clip: boolean; clip?: { name?: string; length?: number; is_playing?: boolean } };
          const rawSlots = (info.clip_slots as RawSlot[] | undefined) ?? [];
          const clips = rawSlots.slice(0, 8).flatMap((slot, slotIdx) => {
            if (!slot.has_clip) return [];
            return [{
              index: slotIdx,
              name: slot.clip?.name || `Clip ${slotIdx + 1}`,
              length: slot.clip?.length ?? 4,
              isPlaying: slot.clip?.is_playing ?? false,
            }];
          });

          tracks.push({
            id: i,
            name: (info.name as string) || `Track ${i + 1}`,
            volume: typeof info.volume === "number" ? info.volume : 0.85,
            pan: typeof info.panning === "number" ? info.panning : 0,
            mute: Boolean(info.mute),
            solo: Boolean(info.solo),
            armed: Boolean(info.arm),
            devices: Array.isArray(info.devices)
              ? info.devices
                  .map((device) => {
                    if (!device || typeof device !== "object") return null;
                    const maybeDevice = device as { name?: unknown; type?: unknown };
                    if (typeof maybeDevice.name !== "string" || maybeDevice.name.length === 0) return null;
                    return typeof maybeDevice.type === "string"
                      ? `${maybeDevice.name} (${maybeDevice.type})`
                      : maybeDevice.name;
                  })
                  .filter((deviceName): deviceName is string => Boolean(deviceName))
              : [],
            clips,
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
            clips: [],
          });
        }
      }

      const payload = {
        connected: true,
        bpm: (sessionInfo.tempo as number) ?? 120,
        isPlaying: (sessionInfo.is_playing as boolean) ?? false,
        key: buildKeyString(sessionInfo),
        trackCount,
        tracks,
      };

      cachedState = {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload,
        status: 200,
      };

      return { payload, status: 200 };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("timeout") || message.includes("socket") ? 503 : 500;
      const payload = { connected: false, error: message };

      cachedState = {
        expiresAt: Date.now() + 500,
        payload,
        status,
      };

      return { payload, status };
    }
  })();

  try {
    const { payload, status } = await inFlightRequest;
    return NextResponse.json(payload, { status });
  } finally {
    inFlightRequest = null;
  }
}
