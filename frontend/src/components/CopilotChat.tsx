"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { Paperclip, Mic, StopCircle, Music2, X, Send, Bot, Search } from "lucide-react";
import { useDAWContext } from "@/lib/DAWContext";
import { searchSamples } from "@/lib/sampleSearch";
import ListeningAnalysis from "@/components/ListeningAnalysis";
import type { AudioAttachment } from "@/types";

const DAW_TRACK_COLORS = ["#C1E1C1","#E9D5FF","#FEF08A","#FCA5A5","#BAE6FD","#DDD6FE","#BBF7D0","#FED7AA"];

// ─── Tap helpers ──────────────────────────────────────────────────────────────

interface TapNote { startMs: number; durationMs: number; }

function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m-1]+s[m])/2 : s[m];
}
function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function analyzeTaps(notes: TapNote[]) {
  if (!notes.length) return null;
  const sorted = [...notes].sort((a,b) => a.startMs-b.startMs);
  const onsets = sorted.map(n => n.startMs);
  const iois = onsets.slice(1).map((t,i) => t-onsets[i]);
  const medIoi = iois.length ? median(iois) : 500;
  const bpm = clamp(60000/Math.max(medIoi,120), 50, 220);
  const mean = iois.length ? iois.reduce((s,v)=>s+v,0)/iois.length : medIoi;
  const std = iois.length>1 ? Math.sqrt(iois.reduce((s,v)=>s+(v-mean)**2,0)/iois.length) : 0;
  const cv = mean>0 ? std/mean : 1;
  const conf = clamp(1-cv*1.5, 0, 1);
  return {
    reference_bpm: Number(bpm.toFixed(2)),
    timing_confidence: Number(conf.toFixed(2)),
    quantization_hint: conf>0.8?"light":conf>0.6?"medium":"strong" as "light"|"medium"|"strong",
    note_starts_beats: sorted.map(n=>(n.startMs/60000)*bpm),
    note_durations_beats: sorted.map(n=>clamp((n.durationMs/60000)*bpm,0.0625,8)),
    notes_ms: sorted,
    capture_ms: Math.max(sorted[sorted.length-1].startMs+sorted[sorted.length-1].durationMs, 1),
  };
}
// ─── Component ────────────────────────────────────────────────────────────────

export default function CopilotChat() {
  const { state: dawState, dispatch: dawDispatch } = useDAWContext();
  const dawStateRef = useRef(dawState);
  useEffect(() => { dawStateRef.current = dawState; });

  const [pendingAudio, setPendingAudio] = useState<AudioAttachment | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Tap rhythm
  const [isTapRecording, setIsTapRecording] = useState(false);
  const [tapNotes, setTapNotes] = useState<TapNote[]>([]);
  const [tapStartedAt, setTapStartedAt] = useState<number | null>(null);
  const [tapNow, setTapNow] = useState(0);
  const activeTapRef = useRef<number | null>(null);
  const [pendingRhythm, setPendingRhythm] = useState<ReturnType<typeof analyzeTaps>>(null);

  // ── useChat (Vercel AI SDK streaming) ────────────────────────────────────

  const [input, setInput] = useState("");

  const { messages, setMessages, sendMessage: chatSendMessage, status, addToolResult } = useChat({
    sendAutomaticallyWhen: ({ messages: msgs }) => {
      // Re-send automatically when the last assistant message has tool invocations with outputs
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return false;
      return last.parts.some(p => isToolUIPart(p) && "state" in p && p.state === "output-available");
    },
    onToolCall: async ({ toolCall }) => {
      const args = toolCall.input as Record<string, unknown>;
      const s = dawStateRef.current;
      let result = "done";

      switch (toolCall.toolName) {
        case "setBPM":
          dawDispatch({ type: "SET_TRANSPORT", payload: { bpm: args.bpm as number } });
          result = `BPM set to ${args.bpm}`;
          break;

        case "setDrumPattern":
          dawDispatch({ type: "SET_DRUM_PATTERN", payload: {
            kick:    args.kick    as boolean[],
            snare:   args.snare   as boolean[],
            hihat:   args.hihat   as boolean[],
            openHat: (args.openHat as boolean[]) ?? Array(16).fill(false),
          }});
          result = "Drum pattern applied";
          break;

        case "createTrack": {
          const color = (args.color as string) ?? DAW_TRACK_COLORS[s.tracks.length % DAW_TRACK_COLORS.length];
          const id = crypto.randomUUID();
          dawDispatch({ type: "ADD_TRACK", payload: { id, name: args.name as string, color, muted: false, volume: 80 } });
          result = `Track created: ${args.name} (id: ${id})`;
          break;
        }

        case "addBlock":
          dawDispatch({ type: "ADD_BLOCK", payload: { id: crypto.randomUUID(), trackId: args.trackId as string, name: args.name as string, startMeasure: args.startMeasure as number, durationMeasures: args.durationMeasures as number } });
          result = "Block added";
          break;

        case "moveBlock":
          dawDispatch({ type: "UPDATE_BLOCK", payload: { id: args.blockId as string, startMeasure: args.newStartMeasure as number } });
          result = "Block moved";
          break;

        case "deleteBlock":
          dawDispatch({ type: "DELETE_BLOCK", payload: args.blockId as string });
          result = "Block deleted";
          break;

        case "deleteTrack":
          dawDispatch({ type: "DELETE_TRACK", payload: args.trackId as string });
          result = "Track deleted";
          break;

        case "setVolume":
          dawDispatch({ type: "UPDATE_TRACK", payload: { id: args.trackId as string, volume: args.volume as number } });
          result = `Volume set to ${args.volume}`;
          break;

        case "setMute":
          dawDispatch({ type: "UPDATE_TRACK", payload: { id: args.trackId as string, muted: args.muted as boolean } });
          result = `Track ${args.muted ? "muted" : "unmuted"}`;
          break;

        case "generateAndPlaceAudio": {
          try {
            const resp = await fetch("/api/sfx", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: args.description as string,
                duration: (args.durationSeconds as number) ?? 2,
              }),
            });
            if (!resp.ok) { result = "Failed to generate audio — check ElevenLabs API key"; break; }
            const audioBlob = await resp.blob();
            const trackId = crypto.randomUUID();
            const color = (args.color as string) ?? DAW_TRACK_COLORS[s.tracks.length % DAW_TRACK_COLORS.length];
            dawDispatch({ type: "ADD_TRACK", payload: { id: trackId, name: args.trackName as string, color, muted: false, volume: 80 } });
            dawDispatch({ type: "LOAD_AUDIO", payload: { trackId, blob: audioBlob } });
            dawDispatch({ type: "ADD_BLOCK", payload: { id: crypto.randomUUID(), trackId, name: args.trackName as string, startMeasure: (args.startMeasure as number) ?? 1, durationMeasures: (args.durationMeasures as number) ?? 4 } });
            result = `Audio generated and placed on track "${args.trackName}"`;
          } catch {
            result = "Audio generation failed";
          }
          break;
        }

        case "searchSamples": {
          try {
            const results = await searchSamples(args.query as string);
            if (results.length === 0) { result = "No samples found matching that query."; break; }
            const summary = results.slice(0, 5).map(s => `- ${s.name} (${s.instrument}, ${s.tags.join(", ")}${s.bpm ? `, ${s.bpm}bpm` : ""})`).join("\n");
            result = `Found ${results.length} sample(s):\n${summary}`;
          } catch {
            result = "Sample search failed";
          }
          break;
        }
      }

      // Report tool result back to the chat
      addToolResult({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output: result });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMessage = async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if (!text || isLoading) return;

    const rhythmSuffix = pendingRhythm
      ? `\n\n[Captured rhythm: ${pendingRhythm.note_starts_beats.length} notes, ${pendingRhythm.reference_bpm} BPM ref, ${pendingRhythm.quantization_hint} quantize]`
      : "";

    setInput("");
    setPendingAudio(null);
    setPendingRhythm(null);

    await chatSendMessage({ text: text + rhythmSuffix });
  };

  // ── Audio recording ────────────────────────────────────────────────────────

  const handleAudioFile = (file: File) => {
    setIsAnalyzing(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      setPendingAudio({ filename: file.name, base64, mimeType: file.type || "audio/wav", size: file.size });
    };
    reader.readAsDataURL(file);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      audioChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          setPendingAudio({ filename: "voice.webm", base64, mimeType: "audio/webm", size: blob.size });
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      setIsRecording(true);
    } catch { /* denied */ }
  };

  const stopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false); };

  // ── Tap rhythm ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isTapRecording || tapStartedAt === null) return;
    const t = setInterval(() => setTapNow(performance.now()-tapStartedAt), 33);
    return () => clearInterval(t);
  }, [isTapRecording, tapStartedAt]);

  useEffect(() => {
    if (!isTapRecording || tapStartedAt === null) return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return; e.preventDefault();
      if (e.repeat || activeTapRef.current !== null) return;
      activeTapRef.current = performance.now()-tapStartedAt;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return; e.preventDefault();
      if (activeTapRef.current === null) return;
      const end = performance.now()-tapStartedAt;
      setTapNotes(prev => [...prev, { startMs: activeTapRef.current!, durationMs: Math.max(40, end-activeTapRef.current!) }]);
      activeTapRef.current = null;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up, { passive: false });
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [isTapRecording, tapStartedAt]);

  const startTap = () => { activeTapRef.current=null; setTapNotes([]); setPendingRhythm(null); setTapStartedAt(performance.now()); setTapNow(0); setIsTapRecording(true); };
  const stopTap = () => {
    if (!isTapRecording || tapStartedAt===null) return;
    let notes = tapNotes;
    if (activeTapRef.current!==null) {
      notes = [...tapNotes, { startMs: activeTapRef.current, durationMs: Math.max(40,(performance.now()-tapStartedAt)-activeTapRef.current) }];
      activeTapRef.current = null;
    }
    setTapNotes(notes); setIsTapRecording(false); setTapNow(0); setPendingRhythm(analyzeTaps(notes));
  };

  const timelineNotes = isTapRecording && activeTapRef.current!==null
    ? [...tapNotes, { startMs: activeTapRef.current, durationMs: Math.max(40, tapNow-activeTapRef.current) }]
    : isTapRecording ? tapNotes : pendingRhythm?.notes_ms ?? [];
  const timelineDurMs = Math.max(isTapRecording ? tapNow : 0, ...timelineNotes.map(n=>n.startMs+n.durationMs), 1);

  // Filter to user/assistant messages for display
  const displayMessages = messages.filter(m => m.role === "user" || m.role === "assistant");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="h-full w-full flex flex-col border-r border-[#DEDEDE] bg-white">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[#EBEBEB] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#2D2D2D] flex items-center justify-center flex-shrink-0">
          <Bot size={14} color="white" strokeWidth={1.5} />
        </div>
        <span className="text-[13px] font-bold text-[#2D2D2D] font-headline flex-1">Wonder AI</span>
        <span className="text-[10px] font-bold font-mono bg-[#FFE566] text-[#2D2D2D] px-2 py-0.5 rounded-full uppercase tracking-wide">DAW</span>
        {displayMessages.length > 0 && (
          <button onClick={() => setMessages([])} className="text-[10px] font-mono text-[#2D2D2D]/30 hover:text-[#2D2D2D]/70 transition-colors">Clear</button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 custom-scrollbar">
        {displayMessages.length === 0 && (
          <div className="text-center pt-8">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#2D2D2D]/25 mb-3">Try saying</p>
            {["make a trap beat at 140 BPM", "lo-fi hip hop beat 85 BPM", "find me a warm vinyl kick"].map(s => (
              <button key={s} onClick={() => sendMessage(s)} className="block w-full text-left px-3 py-2 mb-1.5 border border-[#E0E0E0] rounded-xl text-[11px] font-body text-[#2D2D2D]/60 hover:bg-[#F5F5F2] hover:text-[#2D2D2D] transition-colors">
                {s.startsWith("find") ? <><Search size={10} className="inline mr-1.5 opacity-40" />{s}</> : s}
              </button>
            ))}
          </div>
        )}

        {displayMessages.map(msg => (
          <div key={msg.id} className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">
              {msg.role === "user" ? "YOU" : "WONDER AI"}
            </span>
            <div className={`border border-[#E0E0E0] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed text-[#2D2D2D] font-body whitespace-pre-wrap ${
              msg.role === "assistant" ? "bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.06)]" : "bg-[#F7F7F5]"
            }`}>
              {msg.parts.filter(p => p.type === "text").map(p => p.text).join("")}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">WONDER AI · JUST NOW</span>
            <div className="bg-white border border-[#E0E0E0] rounded-xl px-3.5 py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.06)] flex items-center gap-2">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#2D2D2D]/40 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Listening Analysis */}
      <ListeningAnalysis
        active={isAnalyzing}
        targetBPM={dawState.transport.bpm}
        onComplete={(result) => {
          setIsAnalyzing(false);
          dawDispatch({ type: "SET_TRANSPORT", payload: { bpm: result.bpm } });
        }}
        onCancel={() => setIsAnalyzing(false)}
      />

      {/* Tap rhythm panel */}
      {(isTapRecording || pendingRhythm) && (
        <div className="mx-4 mb-2 border border-[#E0E0E0] rounded-xl bg-white p-3 space-y-2 shadow-sm flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#2D2D2D]/50">
              {isTapRecording ? "Tap capture armed" : "Captured rhythm"}
            </span>
            <span className="font-mono text-[9px] text-[#2D2D2D]/40">
              {(pendingRhythm?.reference_bpm ?? 0).toFixed(1)} bpm · {timelineNotes.length} notes
            </span>
          </div>
          <div className="h-10 border border-[#E0E0E0] rounded-lg bg-[#FAFAF8] relative overflow-hidden">
            {timelineNotes.map((note, i) => (
              <div key={`${note.startMs}-${i}`} className="absolute top-1/2 -translate-y-1/2 h-4 bg-[#2D2D2D] rounded"
                style={{ left: `${(note.startMs/timelineDurMs)*100}%`, width: `${Math.max((note.durationMs/timelineDurMs)*100,0.8)}%` }} />
            ))}
          </div>
          {pendingRhythm && !isTapRecording && (
            <button onClick={() => setPendingRhythm(null)} className="ml-auto flex items-center justify-center w-6 h-6 rounded border border-[#E0E0E0] hover:bg-gray-50">
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
            <button onClick={() => setPendingAudio(null)} className="text-[#2D2D2D]/60 hover:text-[#2D2D2D]"><X size={12} /></button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-white border border-[#D8D8D8] rounded-xl px-3 py-2.5 focus-within:border-[#2D2D2D] transition-colors">
          <button onClick={() => audioInputRef.current?.click()} className="text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60 transition-colors pb-0.5 flex-shrink-0" title="Attach audio">
            <Paperclip size={15} />
          </button>
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); e.target.value=""; }} />

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask Wonder to build something..."
            rows={1}
            className="flex-1 border-none focus:ring-0 bg-transparent resize-none text-[13px] font-body leading-relaxed outline-none min-h-[22px] max-h-32 text-[#2D2D2D] placeholder:text-[#2D2D2D]/35"
            onInput={e => { const el=e.currentTarget; el.style.height="auto"; el.style.height=`${Math.min(el.scrollHeight,120)}px`; }}
          />

          <button onClick={isRecording ? stopRecording : startRecording} className={`flex-shrink-0 pb-0.5 transition-colors ${isRecording ? "text-[#E53030]" : "text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60"}`}>
            {isRecording ? <StopCircle size={15} /> : <Mic size={15} />}
          </button>

          <button onClick={isTapRecording ? stopTap : startTap} disabled={isRecording || isLoading} className={`flex-shrink-0 pb-0.5 transition-colors disabled:opacity-30 ${isTapRecording ? "text-[#E5A030]" : "text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60"}`}>
            <Music2 size={15} />
          </button>

          <button onClick={() => sendMessage()} disabled={!input.trim() || isLoading} className="w-7 h-7 bg-[#2D2D2D] rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-30 hover:bg-[#444] transition-opacity">
            <Send size={12} color="white" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </section>
  );
}
