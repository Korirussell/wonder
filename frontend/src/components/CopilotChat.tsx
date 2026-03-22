"use client";

import { useState, useRef, useEffect } from "react";
import { AlertCircle, Paperclip, Mic, Send, StopCircle, Music2, X, ThumbsUp, ThumbsDown } from "lucide-react";
import type { ChatApiError, ChatApiResponse, ChatMessage, MessageFeedback } from "@/types";
import { DEFAULT_CHAT_GREETING, useChat } from "@/lib/ChatContext";
import { useAuth } from "@/lib/AuthContext";

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

  const meanIoi = intervals.length > 0
    ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    : medianIoi;
  const stdIoi = intervals.length > 1
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

function buildNetworkError(message: string): ChatApiError {
  return {
    code: "network",
    title: "Network error",
    message,
    provider: "backend",
    canRetry: true,
  };
}

export default function CopilotChat() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [chatError, setChatError] = useState<ChatApiError | null>(null);
  const [toastError, setToastError] = useState<ChatApiError | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const { user } = useAuth();
  const {
    activeChatId,
    activeMessages,
    appendMessage,
    createChat,
    getMessages,
    setLoading,
    updateChatPreview,
    setMessageFeedback,
  } = useChat();
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
  }, [activeMessages, isLoading]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  useEffect(() => {
    if (retryAfterSec === null || retryAfterSec <= 0) return;
    const timer = window.setTimeout(() => {
      setRetryAfterSec((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSec]);

  useEffect(() => {
    if (!toastError || toastError.retryAfterSec) return;
    const timer = window.setTimeout(() => {
      setToastError(null);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [toastError]);

  const presentError = (error: ChatApiError) => {
    setChatError(error);
    setToastError(error);
    setRetryAfterSec(error.retryAfterSec ?? null);
  };

  const clearErrors = () => {
    setChatError(null);
    setToastError(null);
    setRetryAfterSec(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading || (retryAfterSec ?? 0) > 0) return;
    const chatId = activeChatId ?? await createChat();
    const currentMessages = getMessages(chatId);
    clearErrors();

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    appendMessage(chatId, userMsg);
    updateChatPreview(chatId, userMsg.content);
    setInput("");
    setIsLoading(true);
    setLoading(chatId, true);

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
          messages: [...currentMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          session_id: chatId,
          user_id: user?.id,
          rhythmContext,
        }),
      });

      const data = await res.json() as ChatApiResponse;

      if (!res.ok || !data.ok) {
        presentError(data.ok ? buildNetworkError("Wonder returned an unexpected error.") : data.error);
        return;
      }

      appendMessage(chatId, {
        id: Date.now().toString(),
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
      });
      updateChatPreview(chatId, data.content);
      setPendingRhythm(null);
    } catch {
      presentError(buildNetworkError("Unable to reach Wonder. Check the backend connection and try again."));
    } finally {
      setIsLoading(false);
      setLoading(chatId, false);
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
    if (analyzed) {
      setPendingRhythm(analyzed);
    }
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
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
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
      presentError({
        code: "failed_precondition",
        title: "Microphone unavailable",
        message: "Wonder could not access your microphone. Check browser permissions and try again.",
        provider: "backend",
        canRetry: true,
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioMessage = async (audioBlob: Blob) => {
    if ((retryAfterSec ?? 0) > 0) return;
    const chatId = activeChatId ?? await createChat();
    const currentMessages = getMessages(chatId);
    clearErrors();
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: "🎤 [Voice message]",
      timestamp: new Date(),
    };

    appendMessage(chatId, userMsg);
    updateChatPreview(chatId, userMsg.content);
    setIsLoading(true);
    setLoading(chatId, true);

    try {
      // Convert audio blob to base64
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
          messages: [...currentMessages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          session_id: chatId,
          user_id: user?.id,
          audioData: base64Audio,
          mimeType: "audio/webm",
        }),
      });

      const data = await res.json() as ChatApiResponse;

      if (!res.ok || !data.ok) {
        presentError(data.ok ? buildNetworkError("Wonder returned an unexpected error.") : data.error);
        return;
      }

      appendMessage(chatId, {
        id: Date.now().toString(),
        role: "assistant",
        content: data.content,
        timestamp: new Date(),
      });
      updateChatPreview(chatId, data.content);
    } catch {
      presentError(buildNetworkError("Unable to reach Wonder. Check the backend connection and try again."));
    } finally {
      setIsLoading(false);
      setLoading(chatId, false);
    }
  };

  const handleFeedback = (msg: ChatMessage, vote: MessageFeedback) => {
    if (!activeChatId) return;
    setMessageFeedback(activeChatId, msg.id, vote);
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user?.id,
        session_id: activeChatId,
        message_id: msg.id,
        turn_index: msg.turnIndex ?? -1,
        feedback: vote,
      }),
    }).catch(() => {});
  };

  return (
    <section className="relative w-[40%] flex flex-col border-r-2 border-[#2D2D2D] bg-white/70 backdrop-blur-sm">
      {toastError ? (
        <div className="absolute right-5 top-5 z-20 max-w-sm rounded-2xl border-2 border-[#2D2D2D] bg-[#FEF08A] p-4 hard-shadow">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-headline text-sm font-bold">{toastError.title}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-75">{toastError.message}</p>
            </div>
            <button
              onClick={() => setToastError(null)}
              className="rounded-lg border-2 border-[#2D2D2D] bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {(activeMessages.length > 0 ? activeMessages : [DEFAULT_CHAT_GREETING]).map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-2 max-w-[90%] ${
              msg.role === "user" ? "items-end ml-auto" : "items-start"
            }`}
          >
            {/* Label */}
            <span className="font-label text-[10px] font-bold uppercase tracking-widest opacity-40 px-1">
              {msg.role === "user" ? "You" : "Wonder Copilot"}
            </span>

            {/* Bubble */}
            <div
              className={`border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow text-sm leading-relaxed font-body ${
                msg.role === "assistant"
                  ? "bg-[#E9D5FF]"
                  : "bg-white"
              }`}
            >
              {msg.content}
            </div>

            {/* Thumbs feedback — assistant messages only, not the greeting */}
            {msg.role === "assistant" && !msg.isGreeting && (
              <div className="flex items-center gap-1.5 px-1">
                <button
                  onClick={() => handleFeedback(msg, "thumbs_up")}
                  title="Helpful"
                  className={`flex items-center rounded-lg border-2 border-[#2D2D2D] px-2 py-1 transition-colors hard-shadow-sm ${
                    msg.feedback === "thumbs_up"
                      ? "bg-[#C1E1C1]"
                      : "bg-white/60 hover:bg-[#C1E1C1]/50"
                  }`}
                >
                  <ThumbsUp size={11} strokeWidth={2.5} />
                </button>
                <button
                  onClick={() => handleFeedback(msg, "thumbs_down")}
                  title="Not helpful"
                  className={`flex items-center rounded-lg border-2 border-[#2D2D2D] px-2 py-1 transition-colors hard-shadow-sm ${
                    msg.feedback === "thumbs_down"
                      ? "bg-[#FFD8CC]"
                      : "bg-white/60 hover:bg-[#FFD8CC]/50"
                  }`}
                >
                  <ThumbsDown size={11} strokeWidth={2.5} />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex flex-col gap-2 max-w-[90%] items-start">
            <span className="font-label text-[10px] font-bold uppercase tracking-widest opacity-40 px-1">
              Wonder Copilot
            </span>
            <div className="bg-[#E9D5FF] border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-[#68587c] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-[#68587c] opacity-70">thinking...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="px-6 py-5 flex-shrink-0">
        {chatError ? (
          <div className="mb-4 rounded-2xl border-2 border-[#2D2D2D] bg-[#FFF1D6] p-4 hard-shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-headline text-sm font-bold">{chatError.title}</p>
                <p className="mt-1 text-sm leading-relaxed opacity-80">{chatError.message}</p>
                {retryAfterSec && retryAfterSec > 0 ? (
                  <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] opacity-55">
                    Retry available in {retryAfterSec}s
                  </p>
                ) : null}
              </div>
              <button
                onClick={() => setChatError(null)}
                className="rounded-lg border-2 border-[#2D2D2D] bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest"
              >
                Dismiss
              </button>
            </div>
            {chatError.rawMessage ? (
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-[10px] font-bold uppercase tracking-[0.18em] opacity-45">
                  Technical details
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-[#2D2D2D]/20 bg-white/60 p-3 text-[11px] leading-relaxed opacity-75">
                  {chatError.rawMessage}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}

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

          {/* Mic button */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-11 h-11 border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end ${
              isRecording
                ? "bg-[#fa7150] recording-pulse"
                : "bg-[#C1E1C1] hard-shadow-sm interactive-push"
            }`}
          >
            {isRecording ? (
              <StopCircle size={18} strokeWidth={2.5} />
            ) : (
              <Mic size={18} strokeWidth={2.5} />
            )}
          </button>

          {/* Tap rhythm button */}
          <button
            onClick={isTapRecording ? stopTapRecording : startTapRecording}
            disabled={isRecording || isLoading || (retryAfterSec ?? 0) > 0}
            className={`w-11 h-11 border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end ${
              isTapRecording
                ? "bg-[#ffe082] recording-pulse"
                : "bg-[#f4efe3] hard-shadow-sm interactive-push"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
            title={isTapRecording ? "Stop rhythm capture" : "Capture rhythm with space bar"}
          >
            {isTapRecording ? <StopCircle size={18} strokeWidth={2.5} /> : <Music2 size={18} strokeWidth={2.5} />}
          </button>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading || (retryAfterSec ?? 0) > 0}
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
