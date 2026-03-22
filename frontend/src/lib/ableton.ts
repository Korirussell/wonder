import * as net from "net";

const ABLETON_HOST = process.env.ABLETON_HOST || "localhost";
const ABLETON_PORT = parseInt(process.env.ABLETON_PORT || "9877");
const TIMEOUT_MS = 5000;

interface AbletonCommandOptions {
  timeoutMs?: number;
}

export async function sendAbletonCommand(
  commandType: string,
  params: Record<string, unknown> = {},
  options: AbletonCommandOptions = {}
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buffer = "";
    let settled = false;
    const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

    const done = (err: Error | null, result?: unknown) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.connect(ABLETON_PORT, ABLETON_HOST, () => {
      socket.write(JSON.stringify({ type: commandType, params }));
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      try {
        const parsed = JSON.parse(buffer);
        if (parsed.status === "error") {
          done(new Error(parsed.message || "Unknown Ableton error"));
        } else {
          done(null, parsed.result ?? {});
        }
      } catch {
        // Incomplete JSON — keep buffering
      }
    });

    socket.on("timeout", () => done(new Error("Ableton response timeout")));
    socket.on("error", (err) => done(new Error(`Ableton socket error: ${err.message}`)));
    socket.on("close", () => {
      if (!settled) done(new Error("Ableton connection closed unexpectedly"));
    });
  });
}

export async function isAbletonConnected(): Promise<boolean> {
  try {
    await sendAbletonCommand("get_session_info", {});
    return true;
  } catch {
    return false;
  }
}
