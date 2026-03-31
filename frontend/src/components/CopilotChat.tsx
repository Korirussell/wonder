"use client";

import { useState, useRef, useEffect } from "react";
import { Paperclip, Mic, StopCircle, Music2, X, Send, Bot } from "lucide-react";
import { ChatMessage, AudioAttachment } from "@/types";

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "user",
    content: "Generate a lead melody in F Minor",
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: "2",
    role: "assistant",
    content:
      "Added a 4-bar MIDI clip to Track 3. Applying 'Midnight Synth' preset. Would you like me to add a variation for the B-section?",
    timestamp: new Date(),
    suggestions: ["YES, ADD VARIATION", "NO, KEEP IT"],
  },
];

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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function analyzeTapNotes(notes: TapNote[]): PendingRhythm | null {
  if (notes.length === 0) return null;

  const sortedNotes = [...notes].sort((a, b) => a.startMs - b.startMs);
  const captureMs = Math.max(
    sortedNotes[sortedNotes.length - 1].startMs + sortedNotes[sortedNotes.length - 1].durationMs,
    1
  );

  const onsets = sortedNotes.map((n) => n.startMs);
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    intervals.push(onsets[i] - onsets[i - 1]);
  }

  const medianIoi = intervals.length > 0 ? median(intervals) : 500;
  const referenceBpm = clamp(60000 / Math.max(medianIoi, 120), 50, 220);

  const meanIoi =
    intervals.length > 0
      ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
      : medianIoi;
  const stdIoi =
    intervals.length > 1
      ? Math.sqrt(
          intervals.reduce((sum, value) => sum + (value - meanIoi) ** 2, 0) / intervals.length
        )
      : 0;
  const cv = meanIoi > 0 ? stdIoi / meanIoi : 1;
  const timingConfidence = clamp(1 - cv * 1.5, 0, 1);

  const quantizationHint: "light" | "medium" | "strong" =
    timingConfidence > 0.8 ? "light" : timingConfidence > 0.6 ? "medium" : "strong";

  const noteStartsBeats = sortedNotes.map((n) => (n.startMs / 60000) * referenceBpm);
  const noteDurationsBeats = sortedNotes.map((n) =>
    clamp((n.durationMs / 60000) * referenceBpm, 0.0625, 8)
  );

  return {
    capture_ms: captureMs,
    reference_bpm: Number(referenceBpm.toFixed(2)),
    timing_confidence: Number(timingConfidence.toFixed(2)),
    quantization_hint: quantizationHint,
    note_starts_beats: noteStartsBeats,
    note_durations_beats: noteDurationsBeats,
    notes_ms: sortedNotes,
  };
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  if (diffSec < 30) return "JUST NOW";
  if (diffMin < 60) return `${diffMin}M AGO`;
  return `${Math.floor(diffMin / 60)}H AGO`;
}

export default function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [pendingAudio, setPendingAudio] = useState<AudioAttachment | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
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
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleAudioFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPendingAudio({
        filename: file.name,
        base64,
        mimeType: file.type || "audio/wav",
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const sendMessage = async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if (!text || isLoading) return;

    const content = pendingAudio ? `${text}\n\n📎 ${pendingAudio.filename}` : text;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
      audioAttachment: pendingAudio ?? undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!overrideText) setInput("");
    const capturedAudio = pendingAudio;
    setPendingAudio(null);
    setIsLoading(true);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          rhythmContext,
          audioData: capturedAudio?.base64,
          mimeType: capturedAudio?.mimeType,
        }),
      });

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
          suggestions: data.suggestions,
        },
      ]);
      setPendingRhythm(null);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Connection error — make sure the Wonder backend is running.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isTapRecording || tapStartedAt === null) return;
    const timer = window.setInterval(() => {
      setTapNow(performance.now() - tapStartedAt);
    }, 33);
    return () => window.clearInterval(timer);
  }, [isTapRecording, tapStartedAt]);

  useEffect(() => {
    if (!isTapRecording || tapStartedAt === null) return;

    const handleSpaceDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (event.repeat || activeTapStartRef.current !== null) return;
      activeTapStartRef.current = performance.now() - tapStartedAt;
    };

    const handleSpaceUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      if (activeTapStartRef.current === null) return;
      const end = performance.now() - tapStartedAt;
      const start = activeTapStartRef.current;
      const duration = Math.max(40, end - start);
      setTapNotes((prev) => [...prev, { startMs: start, durationMs: duration }]);
      activeTapStartRef.current = null;
    };

    window.addEventListener("keydown", handleSpaceDown, { passive: false });
    window.addEventListener("keyup", handleSpaceUp, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
    };
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
    let finalizedNotes = tapNotes;
    if (activeTapStartRef.current !== null) {
      const end = performance.now() - tapStartedAt;
      const start = activeTapStartRef.current;
      const duration = Math.max(40, end - start);
      finalizedNotes = [...tapNotes, { startMs: start, durationMs: duration }];
      activeTapStartRef.current = null;
    }
    setTapNotes(finalizedNotes);
    setIsTapRecording(false);
    setTapNow(0);
    const analyzed = analyzeTapNotes(finalizedNotes);
    if (analyzed) setPendingRhythm(analyzed);
  };

  const timelineNotes: TapNote[] = (() => {
    if (isTapRecording && activeTapStartRef.current !== null) {
      return [
        ...tapNotes,
        {
          startMs: activeTapStartRef.current,
          durationMs: Math.max(40, tapNow - activeTapStartRef.current),
        },
      ];
    }
    if (isTapRecording) return tapNotes;
    return pendingRhythm?.notes_ms ?? [];
  })();

  const timelineDurationMs = Math.max(
    isTapRecording ? tapNow : 0,
    ...timelineNotes.map((n) => n.startMs + n.durationMs),
    1
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await sendAudioMessage(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioMessage = async (audioBlob: Blob) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: "🎤 [Voice message]",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const reader = new FileReader();
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          audioData: base64Audio,
          mimeType: "audio/webm",
        }),
      });

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
          suggestions: data.suggestions,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Connection error — make sure the Wonder backend is running.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="w-[300px] flex-shrink-0 flex flex-col border-r border-[#DEDEDE] bg-white">
      {/* Panel header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#EBEBEB]">
        <div className="w-7 h-7 rounded-lg bg-[#2D2D2D] flex items-center justify-center flex-shrink-0">
          <Bot size={14} color="white" strokeWidth={1.5} />
        </div>
        <span className="text-[13px] font-bold text-[#2D2D2D] font-headline flex-1">
          Wonder AI Copilot
        </span>
        <span className="text-[10px] font-bold font-mono bg-[#FFE566] text-[#2D2D2D] px-2 py-0.5 rounded-full uppercase tracking-wide">
          Pro
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 custom-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-1.5">
            {/* Timestamp label */}
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">
              {msg.role === "user" ? "USER" : "WONDER AI"} •{" "}
              {formatRelativeTime(msg.timestamp)}
            </span>

            {/* Bubble */}
            <div
              className={`border border-[#E0E0E0] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-[#2D2D2D] font-body ${
                msg.role === "assistant"
                  ? "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]"
                  : "bg-[#F7F7F5]"
              }`}
            >
              {msg.content}
            </div>

            {/* Action buttons (suggestions) */}
            {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && (
              <div className="flex gap-2 flex-wrap pt-0.5">
                {msg.suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(suggestion)}
                    disabled={isLoading}
                    className={`px-3 py-1.5 text-[11px] font-bold font-mono uppercase tracking-wide rounded-lg border transition-colors disabled:opacity-40 ${
                      i === 0
                        ? "bg-[#2D2D2D] text-white border-[#2D2D2D] hover:bg-[#444]"
                        : "bg-white text-[#2D2D2D] border-[#2D2D2D] hover:bg-[#F5F5F5]"
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">
              WONDER AI • JUST NOW
            </span>
            <div className="bg-white border border-[#E0E0E0] rounded-xl px-3.5 py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)] flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-[#2D2D2D]/40 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Tap rhythm panel (shown when active) */}
      {(isTapRecording || pendingRhythm) && (
        <div className="mx-4 mb-2 border border-[#E0E0E0] rounded-xl bg-white p-3 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#2D2D2D]/50">
              {isTapRecording ? "Tap capture armed" : "Captured rhythm"}
            </span>
            <span className="font-mono text-[9px] text-[#2D2D2D]/40">
              {(pendingRhythm?.reference_bpm ?? 0).toFixed(1)} bpm · {timelineNotes.length} notes
            </span>
          </div>
          <div className="h-12 border border-[#E0E0E0] rounded-lg bg-[#FAFAF8] relative overflow-hidden">
            {timelineNotes.map((note, i) => {
              const left = (note.startMs / timelineDurationMs) * 100;
              const width = Math.max((note.durationMs / timelineDurationMs) * 100, 0.8);
              return (
                <div
                  key={`${note.startMs}-${i}`}
                  className="absolute top-1/2 -translate-y-1/2 h-5 bg-[#2D2D2D] rounded"
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              );
            })}
          </div>
          {pendingRhythm && !isTapRecording && (
            <button
              onClick={() => setPendingRhythm(null)}
              className="ml-auto flex items-center justify-center w-6 h-6 rounded border border-[#E0E0E0] hover:bg-gray-50"
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="px-4 pb-4 flex-shrink-0">
        {pendingAudio && (
          <div className="mb-2 flex items-center gap-2 bg-[#FEF08A] border border-[#E0E0E0] rounded-lg px-3 py-1.5 text-[11px] font-mono">
            <span className="flex-1 truncate">📎 {pendingAudio.filename}</span>
            <button onClick={() => setPendingAudio(null)} className="text-[#2D2D2D]/60 hover:text-[#2D2D2D]">
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-white border border-[#D8D8D8] rounded-xl px-3 py-2.5 focus-within:border-[#2D2D2D] transition-colors">
          {/* Attachment button */}
          <button
            onClick={() => audioInputRef.current?.click()}
            className="text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60 transition-colors pb-0.5 flex-shrink-0"
            title="Attach audio"
          >
            <Paperclip size={15} />
          </button>
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAudioFile(file);
              e.target.value = "";
            }}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Wonder AI to arrange, mix, or generate..."
            rows={1}
            className="flex-1 border-none focus:ring-0 bg-transparent resize-none text-[13px] font-body leading-relaxed outline-none min-h-[22px] max-h-32 text-[#2D2D2D] placeholder:text-[#2D2D2D]/35"
          />

          {/* Mic */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex-shrink-0 pb-0.5 transition-colors ${
              isRecording ? "text-[#E53030] recording-pulse" : "text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60"
            }`}
            title={isRecording ? "Stop recording" : "Record audio"}
          >
            {isRecording ? <StopCircle size={15} /> : <Mic size={15} />}
          </button>

          {/* Tap rhythm */}
          <button
            onClick={isTapRecording ? stopTapRecording : startTapRecording}
            disabled={isRecording || isLoading}
            className={`flex-shrink-0 pb-0.5 transition-colors disabled:opacity-30 ${
              isTapRecording ? "text-[#E5A030]" : "text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60"
            }`}
            title={isTapRecording ? "Stop rhythm capture" : "Capture rhythm"}
          >
            <Music2 size={15} />
          </button>

          {/* Send */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="w-7 h-7 bg-[#2D2D2D] rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-opacity hover:bg-[#444]"
          >
            <Send size={12} color="white" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </section>
  );
}
