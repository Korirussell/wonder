"use client";

import { useState, useRef, useEffect } from "react";
import { Paperclip, Mic, Send, StopCircle } from "lucide-react";
import { ChatMessage, ToolLogEntry, ChatResponse } from "@/types";

const STARTER_CHIPS = [
  "Make a lofi beat",
  "90bpm trap drop",
  "Jazz chord progression",
  "Ambient texture",
];

const THINKING_STATES = [
  "🔌 Checking Ableton...",
  "🎵 Planning session...",
  "🎛️ Building tracks...",
  "🥁 Programming patterns...",
  "✨ Finishing up...",
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hey! I'm Wonder — your AI music copilot. Tell me what you want to make, or hum a melody and I'll build the session in Ableton. What are we making today?",
    timestamp: new Date(),
  },
];

// ── Activity Feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ entries }: { entries: ToolLogEntry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-[#2D2D2D]/10 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-40 hover:opacity-70 transition-opacity flex items-center gap-1.5"
      >
        <span>{open ? "▲" : "▶"}</span>
        <span>{entries.length} {entries.length === 1 ? "action" : "actions"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {entries.map((e, i) => (
            <li key={i} className="flex items-center gap-2 text-xs font-mono">
              <span className="text-base leading-none">{e.icon}</span>
              <span className={e.success ? "opacity-60" : "text-[#fa7150] font-bold"}>
                {e.message}
              </span>
              {e.success && <span className="opacity-30">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Markdown Renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text: string) {
  return text.split("\n").map((line, i) => {
    // Bold: **text**
    const withBold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Inline code: `text`
    const withCode = withBold.replace(
      /`([^`]+)`/g,
      '<code class="bg-[#2D2D2D]/10 px-1 py-0.5 rounded font-mono text-[11px]">$1</code>'
    );

    if (line.startsWith("- ") || line.startsWith("• ")) {
      return (
        <li
          key={i}
          className="ml-4 list-disc"
          dangerouslySetInnerHTML={{ __html: withCode.replace(/^[-•]\s/, "") }}
        />
      );
    }
    if (!line.trim()) return <br key={i} />;
    return <p key={i} dangerouslySetInnerHTML={{ __html: withCode }} />;
  });
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Cycle thinking states while loading
  useEffect(() => {
    if (!isLoading) {
      setThinkingIndex(0);
      return;
    }
    const id = setInterval(() => {
      setThinkingIndex((i) => (i + 1) % THINKING_STATES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [isLoading]);

  const getProfile = () => {
    try {
      return JSON.parse(localStorage.getItem("wonderprofile") ?? "null");
    } catch {
      return null;
    }
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = (overrideContent ?? input).trim();
    if (!content || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await res.json() as { content: string };

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
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
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Could not access microphone. Please check your browser permissions.",
          timestamp: new Date(),
        },
      ]);
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
      content: "🎤 Voice message",
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
          profile: getProfile(),
        }),
      });

      const data = await res.json() as ChatResponse;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
          toolLog: data.toolLog,
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

  // Only show suggestions for the last assistant message
  const lastAssistantIdx = [...messages].reverse().findIndex((m) => m.role === "assistant");
  const lastAssistantId = lastAssistantIdx >= 0
    ? messages[messages.length - 1 - lastAssistantIdx].id
    : null;

  return (
    <section className="w-[40%] flex flex-col border-r-2 border-[#2D2D2D] bg-white/70 backdrop-blur-sm">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((msg, msgIdx) => (
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
                msg.role === "assistant" ? "bg-[#E9D5FF]" : "bg-white"
              }`}
            >
              <div className="space-y-1">
                {renderMarkdown(msg.content)}
              </div>

              {/* Activity Feed */}
              {msg.toolLog && msg.toolLog.length > 0 && (
                <ActivityFeed entries={msg.toolLog} />
              )}
            </div>

            {/* Suggestion chips — only for last assistant message */}
            {msg.role === "assistant" && msg.id === lastAssistantId && !isLoading && (
              <>
                {/* AI-generated follow-up chips */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setInput(s);
                          textareaRef.current?.focus();
                        }}
                        className="px-3 py-1.5 bg-white border-2 border-[#2D2D2D] rounded-full text-xs font-bold font-label hard-shadow-sm interactive-push hover:bg-[#C1E1C1] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {/* Starter chips — only on the initial greeting */}
                {msgIdx === 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {STARTER_CHIPS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setInput(s);
                          textareaRef.current?.focus();
                        }}
                        className="px-3 py-1.5 bg-white border-2 border-[#2D2D2D] rounded-full text-xs font-bold font-label hard-shadow-sm interactive-push hover:bg-[#C1E1C1] transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex flex-col gap-2 max-w-[90%] items-start">
            <span className="font-label text-[10px] font-bold uppercase tracking-widest opacity-40 px-1">
              Wonder Copilot
            </span>
            <div className="bg-[#E9D5FF] border-2 border-[#2D2D2D] p-4 rounded-2xl hard-shadow flex items-center gap-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-[#68587c] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-xs font-mono text-[#68587c] transition-all duration-500">
                {THINKING_STATES[thinkingIndex]}
              </span>
            </div>
          </div>
        )}

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

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="w-11 h-11 bg-[#2D2D2D] text-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center flex-shrink-0 self-end hard-shadow-sm interactive-push disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send size={16} strokeWidth={2.5} />
          </button>
        </div>

        <p className="text-[9px] font-mono font-bold uppercase text-center mt-3 opacity-25 tracking-widest">
          Enter to send · Shift+Enter for new line · Gemini-powered
        </p>
      </div>
    </section>
  );
}
