"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Paperclip, Mic, Send, StopCircle, Music2, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentEventType =
  | "thought"
  | "tool_call"
  | "tool_response"
  | "code"
  | "code_result"
  | "status"
  | "text"
  | "error";

interface AgentEvent {
  id: string;
  type: AgentEventType;
  text?: string;
  label?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  response?: unknown;
  data?: unknown;
}

interface RichMessage {
  id: string;
  role: "user" | "assistant";
  content?: string;       // plain-text for user & initial greeting
  events?: AgentEvent[];  // streamed ADK events for assistant
  isStreaming?: boolean;
  timestamp: Date;
}

// ── ADK SSE parsing ───────────────────────────────────────────────────────────

interface SseFrame {
  data: string;
  event?: string;
  id?: string;
}

interface AdkSsePayload {
  id?: string;
  content?: {
    parts?: unknown[];
    role?: string;
  };
  partial?: boolean;
  turnComplete?: boolean;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
  actions?: {
    transferToAgent?: string;
    escalate?: boolean;
    endOfAgent?: boolean;
    stateDelta?: Record<string, unknown>;
    requestedToolConfirmations?: Record<string, unknown>;
    requestedAuthConfigs?: Record<string, unknown>;
    renderUiWidgets?: unknown[];
  };
}

function stringifyData(data: unknown): string {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function getPartName(part: Record<string, unknown>, key: "functionCall" | "functionResponse"): string {
  const value = part[key];
  if (!value || typeof value !== "object") return "unknown";
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && record.name ? record.name : "unknown";
}

function parseSseFrames(chunk: string): { frames: SseFrame[]; remainder: string } {
  const normalized = chunk.replace(/\r\n/g, "\n");
  const rawFrames = normalized.split("\n\n");
  const remainder = rawFrames.pop() ?? "";
  const frames = rawFrames
    .map((rawFrame) => {
      const lines = rawFrame.split("\n");
      const dataLines: string[] = [];
      let event: string | undefined;
      let id: string | undefined;

      for (const line of lines) {
        if (!line || line.startsWith(":")) continue;
        const separatorIndex = line.indexOf(":");
        const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
        const value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).trimStart();

        if (field === "data") dataLines.push(value);
        if (field === "event") event = value;
        if (field === "id") id = value;
      }

      return { data: dataLines.join("\n"), event, id };
    })
    .filter((frame) => frame.data);

  return { frames, remainder };
}

function parseAdkEvent(dataStr: string): AgentEvent[] {
  let json: AdkSsePayload;
  try {
    json = JSON.parse(dataStr) as AdkSsePayload;
  } catch {
    return [];
  }

  const events: AgentEvent[] = [];
  const eventPrefix = json.id ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (json.error || json.errorMessage) {
    events.push({
      id: `${eventPrefix}-error`,
      type: "error",
      text: json.error ?? json.errorMessage ?? "Unknown agent error",
      label: json.errorCode,
    });
  }

  if (json.actions?.transferToAgent) {
    events.push({
      id: `${eventPrefix}-transfer`,
      type: "status",
      label: "handoff",
      text: `Transferred to ${json.actions.transferToAgent}`,
    });
  }

  if (json.actions?.escalate) {
    events.push({
      id: `${eventPrefix}-escalate`,
      type: "status",
      label: "escalation",
      text: "Escalating to a higher-level agent",
    });
  }

  if (json.actions?.stateDelta && Object.keys(json.actions.stateDelta).length > 0) {
    events.push({
      id: `${eventPrefix}-state`,
      type: "status",
      label: "state update",
      data: json.actions.stateDelta,
    });
  }

  if (json.actions?.requestedToolConfirmations && Object.keys(json.actions.requestedToolConfirmations).length > 0) {
    events.push({
      id: `${eventPrefix}-confirm`,
      type: "status",
      label: "tool confirmation",
      data: json.actions.requestedToolConfirmations,
    });
  }

  if (json.actions?.requestedAuthConfigs && Object.keys(json.actions.requestedAuthConfigs).length > 0) {
    events.push({
      id: `${eventPrefix}-auth`,
      type: "status",
      label: "auth request",
      data: json.actions.requestedAuthConfigs,
    });
  }

  if (json.actions?.renderUiWidgets && json.actions.renderUiWidgets.length > 0) {
    events.push({
      id: `${eventPrefix}-widgets`,
      type: "status",
      label: "ui widgets",
      data: json.actions.renderUiWidgets,
    });
  }

  const parts = json.content?.parts ?? [];
  for (let index = 0; index < parts.length; index += 1) {
    const p = parts[index] as Record<string, unknown>;
    const partId = `${eventPrefix}-part-${index}`;

    if (p.thought && typeof p.text === "string" && p.text) {
      events.push({ id: partId, type: "thought", text: p.text });
      continue;
    }

    if (p.functionCall && typeof p.functionCall === "object") {
      const fc = p.functionCall as Record<string, unknown>;
      events.push({
        id: partId,
        type: "tool_call",
        toolName: getPartName(p, "functionCall"),
        args: (fc.args as Record<string, unknown> | undefined) ?? undefined,
      });
      continue;
    }

    if (p.functionResponse && typeof p.functionResponse === "object") {
      const fr = p.functionResponse as Record<string, unknown>;
      events.push({
        id: partId,
        type: "tool_response",
        toolName: getPartName(p, "functionResponse"),
        response: fr.response,
      });
      continue;
    }

    if (p.executableCode && typeof p.executableCode === "object") {
      const code = p.executableCode as Record<string, unknown>;
      events.push({
        id: partId,
        type: "code",
        label: typeof code.language === "string" ? code.language.toLowerCase() : "code",
        text: typeof code.code === "string" ? code.code : stringifyData(code),
      });
      continue;
    }

    if (p.codeExecutionResult && typeof p.codeExecutionResult === "object") {
      const result = p.codeExecutionResult as Record<string, unknown>;
      events.push({
        id: partId,
        type: "code_result",
        label: typeof result.outcome === "string" ? result.outcome.toLowerCase() : "result",
        text: typeof result.output === "string" ? result.output : stringifyData(result),
      });
      continue;
    }

    if (typeof p.text === "string" && p.text) {
      events.push({ id: partId, type: "text", text: p.text });
    }
  }

  if (json.turnComplete || json.actions?.endOfAgent) {
    events.push({
      id: `${eventPrefix}-done`,
      type: "status",
      label: "turn complete",
      text: "Response complete",
    });
  }

  return events;
}

function mergeEvents(existing: AgentEvent[], incoming: AgentEvent[]): AgentEvent[] {
  const result = [...existing];
  for (const event of incoming) {
    const last = result[result.length - 1];
    const shouldMergeText =
      event.type === "text" &&
      last?.type === "text" &&
      event.id.split("-part-")[0] === last.id.split("-part-")[0];
    const shouldMergeThought =
      event.type === "thought" &&
      last?.type === "thought" &&
      event.id.split("-part-")[0] === last.id.split("-part-")[0];

    if (shouldMergeText || shouldMergeThought) {
      result[result.length - 1] = {
        ...last,
        text: `${last.text ?? ""}${event.text ?? ""}`,
      };
      continue;
    }

    if (
      event.type === "status" &&
      last?.type === "status" &&
      event.label === "turn complete" &&
      last.label === "turn complete"
    ) {
      continue;
    }

    result.push(event);
  }
  return result;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThoughtBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#2D2D2D]/20 rounded-xl bg-[#F5F0FF] overflow-hidden mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px] opacity-60">◆</span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#68587c] opacity-70 flex-1">
          Thinking
        </span>
        <ChevronDown
          size={12}
          className={`text-[#68587c] opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="px-3 pb-3 font-mono text-[11px] text-[#68587c] opacity-70 italic leading-relaxed whitespace-pre-wrap">
          {text}
        </p>
      )}
    </div>
  );
}

function ToolCallBlock({ name, args }: { name: string; args?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const hasArgs = args && Object.keys(args).length > 0;
  return (
    <div className="border border-[#2D2D2D]/20 rounded-xl bg-[#FFFBEB] overflow-hidden mb-2">
      <button
        onClick={() => hasArgs && setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px]">⚡</span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#92400e] flex-1">
          {name}
        </span>
        {hasArgs && (
          <ChevronDown
            size={12}
            className={`text-[#92400e] opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {open && hasArgs && (
        <pre className="px-3 pb-3 font-mono text-[10px] text-[#92400e] opacity-70 overflow-x-auto leading-relaxed">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResponseBlock({ name, response }: { name: string; response?: unknown }) {
  const [open, setOpen] = useState(false);
  const responseStr = JSON.stringify(response, null, 2);
  return (
    <div className="border border-[#2D2D2D]/20 rounded-xl bg-[#F0FDF4] overflow-hidden mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px]">✓</span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#14532d] flex-1">
          {name} · done
        </span>
        <ChevronDown
          size={12}
          className={`text-[#14532d] opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <pre className="px-3 pb-3 font-mono text-[10px] text-[#14532d] opacity-70 overflow-x-auto leading-relaxed max-h-48">
          {responseStr}
        </pre>
      )}
    </div>
  );
}

function StatusBlock({ label, text, data }: { label?: string; text?: string; data?: unknown }) {
  const [open, setOpen] = useState(false);
  const hasData = data !== undefined;
  return (
    <div className="border border-[#2D2D2D]/20 rounded-xl bg-[#EEF2FF] overflow-hidden mb-2">
      <button
        onClick={() => hasData && setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px]">◎</span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#3730a3] flex-1">
          {label ?? "status"}
        </span>
        {hasData && (
          <ChevronDown
            size={12}
            className={`text-[#3730a3] opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {text && (
        <p className={`px-3 font-body text-sm text-[#312e81] leading-relaxed whitespace-pre-wrap ${open && hasData ? "pb-2" : "pb-3"}`}>
          {text}
        </p>
      )}
      {open && hasData && (
        <pre className="px-3 pb-3 font-mono text-[10px] text-[#3730a3] opacity-80 overflow-x-auto leading-relaxed max-h-48">
          {stringifyData(data)}
        </pre>
      )}
    </div>
  );
}

function CodeBlock({ label, text, result }: { label?: string; text?: string; result?: boolean }) {
  const [open, setOpen] = useState(true);
  const color = result ? "text-[#166534]" : "text-[#1f2937]";
  const bg = result ? "bg-[#F0FDF4]" : "bg-[#F8FAFC]";
  return (
    <div className={`border border-[#2D2D2D]/20 rounded-xl ${bg} overflow-hidden mb-2`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-[10px]">{result ? "▣" : "</>"}</span>
        <span className={`font-mono text-[10px] font-bold uppercase tracking-widest flex-1 ${color}`}>
          {label ?? (result ? "code result" : "code")}
        </span>
        <ChevronDown
          size={12}
          className={`${color} opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <pre className={`px-3 pb-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-56 ${color}`}>
          {text}
        </pre>
      )}
    </div>
  );
}

function StreamingCursor() {
  return (
    <span className="inline-flex gap-0.5 ml-1 align-middle">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block w-1 h-1 bg-[#68587c] rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function AssistantMessage({ msg }: { msg: RichMessage }) {
  const events = msg.events ?? [];
  const hasContent = events.length > 0 || msg.content;

  // Fallback for the initial greeting (content-only message)
  if (!msg.events) {
    return (
      <div className="bg-[#E9D5FF] border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow text-sm leading-relaxed font-body">
        {msg.content}
      </div>
    );
  }

  return (
    <div className="bg-[#E9D5FF] border-2 border-[#2D2D2D] p-3 rounded-2xl hard-shadow min-w-[120px]">
      {!hasContent && msg.isStreaming && (
        <div className="flex items-center gap-2 p-1">
          <StreamingCursor />
          <span className="font-mono text-[10px] text-[#68587c] opacity-60">thinking...</span>
        </div>
      )}

      {events.map((event, i) => {
        if (event.type === "thought") {
          return <ThoughtBlock key={event.id} text={event.text ?? ""} />;
        }
        if (event.type === "tool_call") {
          return <ToolCallBlock key={event.id} name={event.toolName ?? "unknown"} args={event.args} />;
        }
        if (event.type === "tool_response") {
          return <ToolResponseBlock key={event.id} name={event.toolName ?? "unknown"} response={event.response} />;
        }
        if (event.type === "code") {
          return <CodeBlock key={event.id} label={event.label} text={event.text} />;
        }
        if (event.type === "code_result") {
          return <CodeBlock key={event.id} label={event.label} text={event.text} result />;
        }
        if (event.type === "status") {
          return <StatusBlock key={event.id} label={event.label} text={event.text} data={event.data} />;
        }
        if (event.type === "error") {
          return (
            <p key={event.id} className="text-sm font-body text-red-600 leading-relaxed whitespace-pre-wrap">
              {event.label ? `${event.label}: ` : ""}
              {event.text}
            </p>
          );
        }
        if (event.type === "text") {
          return (
            <p key={event.id} className="text-sm font-body leading-relaxed whitespace-pre-wrap">
              {event.text}
              {msg.isStreaming && i === events.length - 1 && <StreamingCursor />}
            </p>
          );
        }
        return null;
      })}

      {msg.isStreaming && events.length > 0 && events[events.length - 1].type !== "text" && (
        <div className="mt-1">
          <StreamingCursor />
        </div>
      )}
    </div>
  );
}

// ── Tap rhythm helpers ────────────────────────────────────────────────────────

interface TapNote {
  startMs: number;
  durationMs: number;
}

interface PendingRhythm {
  capture_ms: number;
  reference_bpm: number;
  timing_confidence: number;
  quantization_hint: "light" | "medium" | "strong";
  note_starts_beats: number[];
  note_durations_beats: number[];
  notes_ms: TapNote[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function analyzeTapNotes(notes: TapNote[]): PendingRhythm | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs);
  const captureMs = Math.max(
    sorted[sorted.length - 1].startMs + sorted[sorted.length - 1].durationMs,
    1
  );
  const onsets = sorted.map((n) => n.startMs);
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1]);
  const medianIoi = intervals.length > 0 ? medianOf(intervals) : 500;
  const referenceBpm = clamp(60000 / Math.max(medianIoi, 120), 50, 220);
  const meanIoi = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : medianIoi;
  const stdIoi = intervals.length > 1
    ? Math.sqrt(intervals.reduce((s, v) => s + (v - meanIoi) ** 2, 0) / intervals.length)
    : 0;
  const cv = meanIoi > 0 ? stdIoi / meanIoi : 1;
  const timingConfidence = clamp(1 - cv * 1.5, 0, 1);
  const quantizationHint: "light" | "medium" | "strong" =
    timingConfidence > 0.8 ? "light" : timingConfidence > 0.6 ? "medium" : "strong";
  return {
    capture_ms: captureMs,
    reference_bpm: Number(referenceBpm.toFixed(2)),
    timing_confidence: Number(timingConfidence.toFixed(2)),
    quantization_hint: quantizationHint,
    note_starts_beats: sorted.map((n) => (n.startMs / 60000) * referenceBpm),
    note_durations_beats: sorted.map((n) => clamp((n.durationMs / 60000) * referenceBpm, 0.0625, 8)),
    notes_ms: sorted,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

const INITIAL_MESSAGES: RichMessage[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hey! I'm Wonder — your AI music copilot. Tell me what you want to make, or hum a melody and I'll build the session in Ableton. What are we making today?",
    timestamp: new Date(),
  },
];

export default function CopilotChat() {
  const [messages, setMessages] = useState<RichMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isTapRecording, setIsTapRecording] = useState(false);
  const [tapNotes, setTapNotes] = useState<TapNote[]>([]);
  const [tapStartedAt, setTapStartedAt] = useState<number | null>(null);
  const [tapNow, setTapNow] = useState(0);
  const activeTapStartRef = useRef<number | null>(null);
  const [pendingRhythm, setPendingRhythm] = useState<PendingRhythm | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // ── SSE streaming send ────────────────────────────────────────────────────

  async function streamChat(payload: Record<string, unknown>) {
    const assistantId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", events: [], isStreaming: true, timestamp: new Date() },
    ]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, sessionId: sessionIdRef.current }),
      });

      // Capture session ID for subsequent turns
      const sid = res.headers.get("x-wonder-session-id");
      if (sid) sessionIdRef.current = sid;

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.remainder;

        for (const frame of parsed.frames) {
          const dataStr = frame.data.trim();
          if (!dataStr || dataStr === "[DONE]") continue;

          const incoming = parseAdkEvent(dataStr);
          if (incoming.length === 0) continue;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, events: mergeEvents(m.events ?? [], incoming) }
                : m
            )
          );
        }
      }

      buffer += decoder.decode();
      const trailingFrame = buffer.trim();
      if (trailingFrame) {
        const parsed = parseSseFrames(`${trailingFrame}\n\n`);
        for (const frame of parsed.frames) {
          const dataStr = frame.data.trim();
          if (!dataStr || dataStr === "[DONE]") continue;
          const incoming = parseAdkEvent(dataStr);
          if (incoming.length === 0) continue;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, events: mergeEvents(m.events ?? [], incoming) }
                : m
            )
          );
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                events: [{
                  id: `${assistantId}-error`,
                  type: "error",
                  text: `Connection error — make sure the Wonder backend is running. (${err})`,
                }],
              }
            : m
        )
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
      setIsLoading(false);
    }
  }

  // ── Text message ──────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: RichMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const rhythmContext = pendingRhythm
      ? {
          capture_ms: pendingRhythm.capture_ms,
          reference_bpm: pendingRhythm.reference_bpm,
          timing_confidence: pendingRhythm.timing_confidence,
          quantization_hint: pendingRhythm.quantization_hint,
          note_starts_beats: pendingRhythm.note_starts_beats,
          note_durations_beats: pendingRhythm.note_durations_beats,
          output_mode: "new_track" as const,
        }
      : undefined;

    const userInput = input.trim();
    setInput("");
    setPendingRhythm(null);

    await streamChat({
      messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content ?? "" })),
      rhythmContext,
      message: userInput,
    });
  };

  // ── Audio message ─────────────────────────────────────────────────────────

  const sendAudioMessage = async (audioBlob: Blob) => {
    const userMsg: RichMessage = {
      id: Date.now().toString(),
      role: "user",
      content: "🎤 [Voice message]",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const reader = new FileReader();
    const base64Audio = await new Promise<string>((resolve) => {
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(audioBlob);
    });

    await streamChat({
      messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content ?? "" })),
      audioData: base64Audio,
      mimeType: "audio/webm",
    });
  };

  // ── Recording ──────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await sendAudioMessage(blob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: Date.now().toString(), role: "assistant", content: "Could not access microphone.", timestamp: new Date() },
      ]);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // ── Tap rhythm ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isTapRecording || tapStartedAt === null) return;
    const timer = window.setInterval(() => setTapNow(performance.now() - tapStartedAt), 33);
    return () => window.clearInterval(timer);
  }, [isTapRecording, tapStartedAt]);

  useEffect(() => {
    if (!isTapRecording || tapStartedAt === null) return;
    const handleDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (e.repeat || activeTapStartRef.current !== null) return;
      activeTapStartRef.current = performance.now() - tapStartedAt;
    };
    const handleUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (activeTapStartRef.current === null) return;
      const end = performance.now() - tapStartedAt;
      setTapNotes((prev) => [...prev, { startMs: activeTapStartRef.current!, durationMs: Math.max(40, end - activeTapStartRef.current!) }]);
      activeTapStartRef.current = null;
    };
    window.addEventListener("keydown", handleDown, { passive: false });
    window.addEventListener("keyup", handleUp, { passive: false });
    return () => { window.removeEventListener("keydown", handleDown); window.removeEventListener("keyup", handleUp); };
  }, [isTapRecording, tapStartedAt]);

  const startTapRecording = () => {
    if (isLoading) return;
    activeTapStartRef.current = null;
    setTapNotes([]);
    setPendingRhythm(null);
    setTapStartedAt(performance.now());
    setTapNow(0);
    setIsTapRecording(true);
  };

  const stopTapRecording = () => {
    if (!isTapRecording || tapStartedAt === null) return;
    let finalNotes = tapNotes;
    if (activeTapStartRef.current !== null) {
      const end = performance.now() - tapStartedAt;
      finalNotes = [...tapNotes, { startMs: activeTapStartRef.current, durationMs: Math.max(40, end - activeTapStartRef.current) }];
      activeTapStartRef.current = null;
    }
    setTapNotes(finalNotes);
    setIsTapRecording(false);
    setTapNow(0);
    const analyzed = analyzeTapNotes(finalNotes);
    if (analyzed) setPendingRhythm(analyzed);
  };

  const timelineNotes: TapNote[] = (() => {
    if (isTapRecording && activeTapStartRef.current !== null)
      return [...tapNotes, { startMs: activeTapStartRef.current, durationMs: Math.max(40, tapNow - activeTapStartRef.current) }];
    if (isTapRecording) return tapNotes;
    return pendingRhythm?.notes_ms ?? [];
  })();

  const timelineDurationMs = Math.max(
    isTapRecording ? tapNow : 0,
    ...timelineNotes.map((n) => n.startMs + n.durationMs),
    1
  );

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="w-[40%] flex flex-col border-r-2 border-[#2D2D2D] bg-white/70 backdrop-blur-sm">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-2 max-w-[90%] ${msg.role === "user" ? "items-end ml-auto" : "items-start"}`}
          >
            <span className="font-label text-[10px] font-bold uppercase tracking-widest opacity-40 px-1">
              {msg.role === "user" ? "You" : "Wonder Copilot"}
            </span>

            {msg.role === "user" ? (
              <div className="border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow text-sm leading-relaxed font-body bg-white">
                {msg.content}
              </div>
            ) : (
              <AssistantMessage msg={msg} />
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-5 flex-shrink-0">
        <div className="bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow flex items-end p-3 gap-3 focus-within:ring-2 focus-within:ring-[#C1E1C1] transition-all">
          <button className="p-2 text-[#2D2D2D]/40 hover:text-[#2D2D2D] transition-colors self-end">
            <Paperclip size={18} />
          </button>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Wonder... (or hum a melody)"
            rows={1}
            className="flex-1 border-none focus:ring-0 bg-transparent resize-none py-2 text-sm font-body leading-relaxed outline-none min-h-[40px] max-h-40"
          />

          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-11 h-11 border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end ${
              isRecording ? "bg-[#fa7150] recording-pulse" : "bg-[#C1E1C1] hard-shadow-sm interactive-push"
            }`}
          >
            {isRecording ? <StopCircle size={18} strokeWidth={2.5} /> : <Mic size={18} strokeWidth={2.5} />}
          </button>

          <button
            onClick={isTapRecording ? stopTapRecording : startTapRecording}
            disabled={isRecording || isLoading}
            className={`w-11 h-11 border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end ${
              isTapRecording ? "bg-[#ffe082] recording-pulse" : "bg-[#f4efe3] hard-shadow-sm interactive-push"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={isTapRecording ? "Stop rhythm capture" : "Capture rhythm with space bar"}
          >
            {isTapRecording ? <StopCircle size={18} strokeWidth={2.5} /> : <Music2 size={18} strokeWidth={2.5} />}
          </button>

          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="w-11 h-11 bg-[#2D2D2D] text-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end hard-shadow-sm interactive-push disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>

        {(isTapRecording || pendingRhythm) && (
          <div className="mt-3 border-2 border-[#2D2D2D] rounded-2xl bg-white p-3 hard-shadow-sm space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-50">
                {isTapRecording ? "Tap capture armed (space bar global)" : "Captured rhythm"}
              </span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-40">
                {(pendingRhythm?.reference_bpm ?? 0).toFixed(2)} BPM ref · {timelineNotes.length} notes
              </span>
            </div>

            <div className="h-20 border-2 border-[#2D2D2D]/20 rounded-xl bg-[#FDFDFB] relative overflow-hidden">
              <div className="absolute inset-0 flex">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="flex-1 border-r border-[#2D2D2D]/10 last:border-r-0" />
                ))}
              </div>
              {timelineNotes.map((note, i) => {
                const left = (note.startMs / timelineDurationMs) * 100;
                const width = Math.max((note.durationMs / timelineDurationMs) * 100, 0.8);
                return (
                  <div
                    key={`${note.startMs}-${note.durationMs}-${i}`}
                    className="absolute top-1/2 -translate-y-1/2 h-6 bg-[#4a664c] border border-[#2D2D2D] rounded"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
            </div>

            {pendingRhythm && !isTapRecording && (
              <div className="flex items-center w-full pr-1">
                <button
                  onClick={() => setPendingRhythm(null)}
                  aria-label="Clear captured rhythm"
                  className="ml-auto h-8 w-8 p-1 border-2 border-[#2D2D2D] rounded-lg bg-white/80 hover:bg-white transition-colors flex items-center justify-center"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-[9px] font-mono font-bold uppercase text-center mt-3 opacity-25 tracking-widest">
          Enter to send · Shift+Enter new line · Tap button captures Space rhythm globally
        </p>
      </div>
    </section>
  );
}
