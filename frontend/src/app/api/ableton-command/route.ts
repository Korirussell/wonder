import { NextRequest, NextResponse } from "next/server";
import { sendAbletonCommand } from "@/lib/ableton";

// Explicit allowlist — prevents arbitrary command injection from client-side components
const ALLOWED_COMMANDS = new Set([
  "start_playback",
  "stop_playback",
  "set_track_mute",
  "set_track_volume",
  "fire_clip",
  "stop_clip",
  "load_instrument_by_name",
]);

export async function POST(req: NextRequest) {
  const { command, params } = await req.json() as {
    command: string;
    params?: Record<string, unknown>;
  };

  if (!ALLOWED_COMMANDS.has(command)) {
    return NextResponse.json(
      { error: `Command not allowed: "${command}"` },
      { status: 400 }
    );
  }

  try {
    const result = await sendAbletonCommand(command, params ?? {});
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
