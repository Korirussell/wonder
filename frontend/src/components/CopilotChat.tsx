"use client";

import { useState, useRef, useEffect } from "react";
import { Paperclip, Mic, Send, StopCircle } from "lucide-react";
import { ChatMessage } from "@/types";

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hey! I'm Wonder — your AI music copilot. Tell me what you want to make, or hum a melody and I'll build the session in Ableton. What are we making today?",
    timestamp: new Date(),
  },
];

export default function CopilotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
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

      const data = await res.json();

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

  return (
    <section className="w-[40%] flex flex-col border-r-2 border-[#2D2D2D] bg-white/70 backdrop-blur-sm">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {messages.map((msg) => (
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
            onClick={() => setIsRecording((r) => !r)}
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
            onClick={sendMessage}
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
