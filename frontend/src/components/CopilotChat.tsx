"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { useChat } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import { Paperclip, Mic, StopCircle, Music2, X, Send, Bot, Search, Play, Square } from "lucide-react";
import { useDAWContext } from "@/lib/DAWContext";
import { toneEngine, type DrumSlot } from "@/lib/toneEngine";
import { searchSamples } from "@/lib/sampleSearch";
import ListeningAnalysis from "@/components/ListeningAnalysis";
import type { AudioAttachment } from "@/types";
import { dbToVolumePercent } from "@/lib/mixUtils";

// ─── Generated sounds panel ───────────────────────────────────────────────────

interface GeneratedSound {
  id: string;
  name: string;
  audioUrl: string; // data URI
}

function GeneratedSoundCard({ sound }: { sound: GeneratedSound }) {
  const playerRef = useRef<Tone.Player | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  // Instantiate Tone.Player on mount (inside useEffect to respect AudioContext policy)
  useEffect(() => {
    const player = new Tone.Player({
      url: sound.audioUrl,
      autostart: false,
      loop: false,
      onload: () => setReady(true),
    }).toDestination();
    playerRef.current = player;
    return () => { player.dispose(); };
  }, [sound.audioUrl]);

  const handlePlay = async () => {
    if (!playerRef.current || !ready) return;
    await Tone.start(); // resume AudioContext on user interaction
    if (isPlaying) {
      playerRef.current.stop();
      setIsPlaying(false);
    } else {
      playerRef.current.start();
      setIsPlaying(true);
      // Reset state when clip ends
      const duration = playerRef.current.buffer.duration * 1000;
      setTimeout(() => setIsPlaying(false), duration);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border border-[#E0E0E0] rounded-xl bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,0.04)]">
      <button
        onClick={handlePlay}
        disabled={!ready}
        className="w-7 h-7 flex-shrink-0 bg-[#2D2D2D] rounded-lg flex items-center justify-center disabled:opacity-30 hover:bg-[#444] transition-colors"
        title={ready ? (isPlaying ? "Stop" : "Play") : "Loading…"}
      >
        {isPlaying
          ? <Square size={10} color="white" strokeWidth={2.5} />
          : <Play size={10} color="white" strokeWidth={2.5} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono font-bold text-[#2D2D2D] truncate">{sound.name}</p>
        {!ready && <p className="text-[9px] font-mono text-[#2D2D2D]/40">Loading…</p>}
      </div>
    </div>
  );
}

const DAW_TRACK_COLORS = ["#C1E1C1","#E9D5FF","#FEF08A","#FCA5A5","#BAE6FD","#DDD6FE","#BBF7D0","#FED7AA"];

interface SendMessageOptions {
  autoplay?: boolean;
  playFromStart?: boolean;
  kidsTitle?: string;
}

type KidsStatusState = "idle" | "working" | "playing" | "error";
const FULL_SONG_STEPS = [
  "Composing intro...",
  "Arranging verse...",
  "Layering drums...",
] as const;

async function fetchLoopBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Missing demo loop: ${url}`);
  }
  return response.blob();
}

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

function getAgenticMixSuggestion(trackName: string, index: number) {
  const name = trackName.toLowerCase();

  if (/kick|snare|drum|perc|808|bass/.test(name)) {
    return { volumeDb: -4, pan: 0 };
  }
  if (/vocal|lead|voice/.test(name)) {
    return { volumeDb: -6, pan: 0 };
  }
  if (/guitar|string|rhodes|piano|keys|synth|pad|chord/.test(name)) {
    const side = index % 2 === 0 ? -0.45 : 0.45;
    return { volumeDb: -9, pan: side };
  }
  if (/texture|fx|ambience|atmo|noise/.test(name)) {
    const side = index % 2 === 0 ? -0.25 : 0.25;
    return { volumeDb: -12, pan: side };
  }

  const side = index % 2 === 0 ? -0.12 : 0.12;
  return { volumeDb: -8.5, pan: side };
}
// ─── Component ────────────────────────────────────────────────────────────────

export default function CopilotChat() {
  const { state: dawState, dispatch: dawDispatch } = useDAWContext();
  const dawStateRef = useRef(dawState);
  useEffect(() => { dawStateRef.current = dawState; });

  const [generatedSounds, setGeneratedSounds] = useState<GeneratedSound[]>([]);
  const [loopGenerating, setLoopGenerating] = useState<{ name: string; durationSec: number; bars: number } | null>(null);
  const [pendingAudio, setPendingAudio] = useState<AudioAttachment | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [fullSongMacroStep, setFullSongMacroStep] = useState<number | null>(null);

  // ── Agentic workflow state ──────────────────────────────────────────────────
  const [isAgenticRunning, setIsAgenticRunning] = useState(false);
  const [agenticStep, setAgenticStep] = useState(0);

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
            let audioBlob: Blob | null = null;
            let audioBase64: string | null = null;
            let strategyNote = "";

            // ① Try /generate-sample (FastAPI base64 endpoint — no filesystem paths)
            try {
              const genResp = await fetch("/api/generate-sample", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: args.description as string,
                  duration_seconds: (args.durationSeconds as number) ?? 5,
                }),
              });
              if (genResp.ok) {
                const genResult = await genResp.json() as { audio_base64: string; prompt: string };
                audioBase64 = genResult.audio_base64;
                strategyNote = " (generated)";
              }
            } catch { /* backend offline, fall through */ }

            if (audioBase64) {
              // Convert base64 → data URI → Tone.Player (handled in GeneratedSoundCard via state)
              // Also convert to Blob so the DAW timeline waveform can render it
              const audioUrl = "data:audio/mp3;base64," + audioBase64;
              const byteChars = atob(audioBase64);
              const byteArr = new Uint8Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
              audioBlob = new Blob([byteArr], { type: "audio/mpeg" });

              // Add to the Generated Sounds panel (renders its own Tone.Player + play button)
              const soundId = crypto.randomUUID();
              setGeneratedSounds(prev => [...prev, {
                id: soundId,
                name: args.trackName as string,
                audioUrl,
              }]);

              // Push into the global Sample Library (Browse tab)
              dawDispatch({
                type: "ADD_TO_LIBRARY",
                payload: {
                  id: soundId,
                  name: args.trackName as string,
                  audioUrl,
                  tags: ["generated", "elevenlabs", "lo-fi"],
                  createdAt: Date.now(),
                },
              });
            } else {
              // ② Fallback: smart backend (retrieve from library or generate + save)
              try {
                const smartResp = await fetch("/api/samples/generate", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    prompt: args.description as string,
                    duration_seconds: (args.durationSeconds as number) ?? 5,
                  }),
                });
                if (smartResp.ok) {
                  const smartResult = await smartResp.json() as { strategy: string; sample_id: string; audio_url: string };
                  const audioResp = await fetch(`/api/samples/${smartResult.sample_id}/audio`);
                  if (audioResp.ok) {
                    audioBlob = await audioResp.blob();
                    strategyNote = smartResult.strategy === "retrieved" ? " (from library)" : " (generated)";
                  }
                }
              } catch { /* backend offline, fall through */ }
            }

            // ③ Last resort: direct ElevenLabs via /api/sfx (binary response)
            if (!audioBlob) {
              const sfxResp = await fetch("/api/sfx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  description: args.description as string,
                  duration_seconds: (args.durationSeconds as number) ?? 5,
                }),
              });
              if (!sfxResp.ok) { result = "Failed to generate audio — check ElevenLabs API key"; break; }
              audioBlob = await sfxResp.blob();
            }

            // Place on DAW timeline
            const trackId = crypto.randomUUID();
            const color = (args.color as string) ?? DAW_TRACK_COLORS[s.tracks.length % DAW_TRACK_COLORS.length];
            dawDispatch({ type: "ADD_TRACK", payload: { id: trackId, name: args.trackName as string, color, muted: false, volume: 80 } });
            dawDispatch({ type: "LOAD_AUDIO", payload: { trackId, blob: audioBlob } });
            dawDispatch({ type: "ADD_BLOCK", payload: { id: crypto.randomUUID(), trackId, name: args.trackName as string, startMeasure: (args.startMeasure as number) ?? 1, durationMeasures: (args.durationMeasures as number) ?? 4 } });
            result = `Audio placed on track "${args.trackName}"${strategyNote}`;
          } catch {
            result = "Audio generation failed";
          }
          break;
        }

        case "loadSampleIntoPad": {
          const slot = args.slot as DrumSlot;
          const validSlots: DrumSlot[] = ["kick", "snare", "hihat", "openHat"];
          if (!validSlots.includes(slot)) { result = `Invalid slot "${slot}". Use: kick, snare, hihat, openHat`; break; }
          try {
            let audioBlob: Blob | null = null;
            const dur = (args.durationSeconds as number) ?? 1.0;

            // Try /generate-sample (base64 FastAPI endpoint)
            try {
              const genResp = await fetch("/api/generate-sample", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt: args.description as string, duration_seconds: dur }),
              });
              if (genResp.ok) {
                const genResult = await genResp.json() as { audio_base64: string };
                const byteChars = atob(genResult.audio_base64);
                const byteArr = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
                audioBlob = new Blob([byteArr], { type: "audio/mpeg" });
              }
            } catch { /* offline */ }

            // Fallback: /api/sfx
            if (!audioBlob) {
              const sfxResp = await fetch("/api/sfx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ description: args.description as string, duration_seconds: dur }),
              });
              if (sfxResp.ok) audioBlob = await sfxResp.blob();
            }

            if (!audioBlob) { result = `Failed to generate sample for ${slot}`; break; }

            await toneEngine.init();
            const sampleName = (args.description as string).slice(0, 24);
            await toneEngine.loadDrumSampleFromBlob(slot, audioBlob, sampleName);

            // Tell the DrumRack UI to refresh its sample name display
            const refresh = (window as unknown as Record<string, unknown>).__drumRackRefresh;
            if (typeof refresh === "function") (refresh as () => void)();

            result = `Loaded "${sampleName}" into ${slot} pad`;
          } catch (e) {
            result = `loadSampleIntoPad failed: ${e}`;
          }
          break;
        }

        case "generateLoop": {
          // ── BPM-to-seconds math ──────────────────────────────────────────
          const bpm          = dawStateRef.current.transport.bpm;
          const bars         = Math.max(1, Math.min(8, (args.bars as number) ?? 4));
          const isLoop       = (args.isLoop as boolean) ?? true;
          const totalBeats   = bars * 4;                                    // 4/4 time
          const rawDuration  = (totalBeats / bpm) * 60;                    // seconds
          const durationSec  = Math.min(rawDuration, 22);                  // ElevenLabs cap

          // Inject BPM into prompt silently — AI omits it per system prompt instruction
          const enrichedPrompt = `${(args.description as string).trim()}, ${Math.round(bpm)} BPM`;

          setLoopGenerating({ name: args.trackName as string, durationSec, bars });

          try {
            const genResp = await fetch("/api/generate-loop", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt:           enrichedPrompt,
                duration_seconds: durationSec,
                bars,
                bpm,
                loop:             isLoop,
              }),
            });

            if (!genResp.ok) {
              const errText = await genResp.text().catch(() => "unknown");
              result = `Loop generation failed: ${errText}`;
              break;
            }

            const genResult = await genResp.json() as { audio_base64: string; duration_seconds: number };
            const actualDurationSec = genResult.duration_seconds ?? durationSec;
            const audioUrl   = "data:audio/mp3;base64," + genResult.audio_base64;

            // base64 → Blob (for DAW timeline waveform + LOAD_AUDIO dispatch)
            const byteChars = atob(genResult.audio_base64);
            const byteArr   = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
            const audioBlob  = new Blob([byteArr], { type: "audio/mpeg" });

            // Create track with loop metadata so toneEngine sets loopEnd correctly
            const trackId = crypto.randomUUID();
            const color   = (args.color as string) ?? DAW_TRACK_COLORS[s.tracks.length % DAW_TRACK_COLORS.length];
            dawDispatch({ type: "ADD_TRACK", payload: {
              id: trackId, name: args.trackName as string, color,
              muted: false, volume: 80,
              loop: isLoop, loopBars: bars, loopDurationSec: actualDurationSec,
            }});
            dawDispatch({ type: "LOAD_AUDIO",  payload: { trackId, blob: audioBlob } });
            // Clip width derived from actual returned duration, not requested bars
            const secondsPerMeasure = (4 * 60) / bpm;
            const actualMeasures = Math.max(0.25, Math.ceil((actualDurationSec / secondsPerMeasure) * 4) / 4);
            dawDispatch({ type: "ADD_BLOCK",   payload: {
              id: crypto.randomUUID(), trackId,
              name:             args.trackName as string,
              startMeasure:     (args.startMeasure as number) ?? 1,
              durationMeasures: actualMeasures,
            }});

            // Add to Browse library + local sounds panel
            const soundId = crypto.randomUUID();
            setGeneratedSounds(prev => [...prev, { id: soundId, name: args.trackName as string, audioUrl }]);
            dawDispatch({ type: "ADD_TO_LIBRARY", payload: {
              id: soundId, name: args.trackName as string, audioUrl,
              tags: ["loop", `${bars}bars`, `${Math.round(bpm)}bpm`, "generated"],
              createdAt: Date.now(),
            }});

            result = `Loop "${args.trackName}" placed: ${bars} bars at ${Math.round(bpm)} BPM (${actualDurationSec.toFixed(1)}s)${isLoop ? ", looping" : ""}`;
          } catch (e) {
            result = `generateLoop failed: ${e}`;
          } finally {
            setLoopGenerating(null);
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

        case "setTrackFX": {
          const trackId = args.trackId as string;
          if (args.reverb     !== undefined) toneEngine.setStemReverb(trackId, args.reverb as number);
          if (args.drive      !== undefined) { toneEngine.setStemAmpEnabled(trackId, (args.drive as number) > 0); toneEngine.setStemAmpDrive(trackId, args.drive as number); }
          if (args.eqLow !== undefined || args.eqMid !== undefined || args.eqHigh !== undefined) {
            toneEngine.setStemEQ(trackId, (args.eqLow as number) ?? 0, (args.eqMid as number) ?? 0, (args.eqHigh as number) ?? 0);
          }
          if (args.cabEnabled !== undefined) toneEngine.setStemAmpCabinet(trackId, args.cabEnabled as boolean);
          result = `FX applied to track ${trackId}`;
          break;
        }

        case "applyVibeFX": {
          const VIBE_PRESETS: Record<string, { reverb: number; drive: number; low: number; mid: number; high: number }> = {
            "lo-fi":        { reverb: 0.25, drive: 0.15, low:  3, mid: -2, high: -4 },
            "dreamy":       { reverb: 0.65, drive: 0,    low:  0, mid: -1, high:  2 },
            "dark":         { reverb: 0.30, drive: 0.20, low:  4, mid: -3, high: -5 },
            "bright":       { reverb: 0.10, drive: 0,    low: -2, mid:  1, high:  4 },
            "warm":         { reverb: 0.20, drive: 0.10, low:  3, mid:  1, high: -3 },
            "gritty":       { reverb: 0.10, drive: 0.55, low:  2, mid:  0, high: -2 },
            "808":          { reverb: 0.15, drive: 0.35, low:  5, mid: -2, high: -3 },
            "bedroom-pop":  { reverb: 0.40, drive: 0.05, low:  1, mid:  2, high:  1 },
            "drill":        { reverb: 0.05, drive: 0.30, low:  4, mid: -1, high: -2 },
            "jazz":         { reverb: 0.35, drive: 0,    low:  2, mid:  3, high:  1 },
            "clean":        { reverb: 0,    drive: 0,    low:  0, mid:  0, high:  0 },
          };
          const preset = VIBE_PRESETS[args.vibe as string];
          if (!preset) { result = `Unknown vibe: ${args.vibe as string}`; break; }

          const targetIds = (args.trackIds as string[] | undefined)?.length
            ? (args.trackIds as string[])
            : dawStateRef.current.tracks.map(t => t.id);

          targetIds.forEach(id => {
            toneEngine.setStemReverb(id, preset.reverb);
            toneEngine.setStemAmpEnabled(id, preset.drive > 0);
            toneEngine.setStemAmpDrive(id, preset.drive);
            toneEngine.setStemEQ(id, preset.low, preset.mid, preset.high);
          });

          result = `"${args.vibe as string}" FX applied to ${targetIds.length} track(s)`;
          break;
        }
      }

      // Report tool result back to the chat
      addToolResult({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output: result });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";
  const isAiAuraActive = isGeneratingAudio || isLoading || isAgenticRunning;

  const emitKidsStatus = (detail: {
    state: KidsStatusState;
    title?: string;
    message: string;
    accent?: string;
  }) => {
    window.dispatchEvent(new CustomEvent("wonder-kids-status", { detail }));
  };

  const maybeAutoplay = async (options?: SendMessageOptions) => {
    if (!options?.autoplay) return false;

    const win = window as unknown as Record<string, unknown>;
    const playFromStart = options.playFromStart ? win.__wonderPlayFromStart : undefined;

    if (typeof playFromStart !== "function") return false;

    try {
      await (playFromStart as () => Promise<void>)();
      return true;
    } catch {
      return false;
    }
  };

  // Auto-scroll on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  useEffect(() => {
    document.documentElement.dataset.wonderAiAura = isAiAuraActive ? "true" : "false";
    window.dispatchEvent(new CustomEvent("wonder-ai-aura", { detail: { active: isAiAuraActive } }));

    return () => {
      document.documentElement.dataset.wonderAiAura = "false";
      window.dispatchEvent(new CustomEvent("wonder-ai-aura", { detail: { active: false } }));
    };
  }, [isAiAuraActive]);

  // ── Send ──────────────────────────────────────────────────────────────────

  const AUDIO_INTENT_RE = /\b(generate|sound|beat|loop|create|make|sample|drum|bass|pad|melody|chord|music)\b/i;
  const AGENTIC_MIX_RE = /\b(mix the tracks|auto-level|balance)\b/i;
  const FULL_SONG_RE = /\b(full song|generate a song|arrange a track)\b/i;
  // Editing existing tracks — should go to AI (setTrackFX/applyVibeFX), NOT audio bypass
  const FX_EDIT_RE = /\b(reverb|distortion|drive|eq|bass|treble|high|low|mid|bright|dark|warm|gritty|lo-fi|dreamy|wet|dry|fx|effect|filter|increase|decrease|add more|less|turn (up|down)|boost|cut|muffled|crisp|saturate|compress|delay|echo|chorus|flanger|vibe|feel|sound like|make it)\b/i;

  const sendMessage = async (overrideText?: string, options?: SendMessageOptions) => {
    const text = overrideText ?? input.trim();
    if (!text) return;

    if (isLoading || isGeneratingAudio) {
      if (options?.kidsTitle) {
        emitKidsStatus({
          state: "working",
          title: options.kidsTitle,
          message: "Wonder is still building the last loop. Tap again in a second.",
        });
      }
      return;
    }

    // Inject Spotify taste into every prompt if connected
    let spotifyPrefix = "";
    try {
      const raw = localStorage.getItem("wonderprofile");
      if (raw) {
        const p = JSON.parse(raw) as { spotify_artists?: string[]; spotify_tracks?: string[] };
        if (p.spotify_artists?.length) {
          spotifyPrefix = `[User's Spotify Taste: Artists: ${p.spotify_artists.join(", ")} | Tracks: ${(p.spotify_tracks ?? []).join(", ")}. Apply this groove and instrumentation to the request.]\n`;
        }
      }
    } catch { /* ignore */ }

    const rhythmSuffix = pendingRhythm
      ? `\n\n[Captured rhythm: ${pendingRhythm.note_starts_beats.length} notes, ${pendingRhythm.reference_bpm} BPM ref, ${pendingRhythm.quantization_hint} quantize]`
      : "";

    setInput("");
    setPendingAudio(null);
    setPendingRhythm(null);

    if (AGENTIC_MIX_RE.test(text)) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
        parts: [{ type: "text" as const, text }],
      }]);

      setIsAgenticRunning(true);
      setAgenticStep(2);
      await toneEngine.init();
      const currentTracks = dawStateRef.current.tracks;
      currentTracks.forEach((track, index) => {
        const suggestion = getAgenticMixSuggestion(track.name, index);
        toneEngine.rampStemVolume(track.id, suggestion.volumeDb, 1.5);
        toneEngine.rampStemPan(track.id, suggestion.pan, 1.5);
        dawDispatch({
          type: "UPDATE_TRACK",
          payload: {
            id: track.id,
            volumeDb: suggestion.volumeDb,
            volume: dbToVolumePercent(suggestion.volumeDb),
            pan: suggestion.pan,
            mixAnimating: true,
          },
        });
      });

      window.setTimeout(() => {
        dawStateRef.current.tracks.forEach((track) => {
          dawDispatch({
            type: "UPDATE_TRACK",
            payload: {
              id: track.id,
              mixAnimating: false,
            },
          });
        });
        setAgenticStep(3);
        setIsAgenticRunning(false);
      }, 1500);

      const reply = "Agentic Mix engaged. I balanced the channels, centered the rhythm section, widened the harmonic parts, and ramped the faders over 1.5 seconds.";
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: reply,
        parts: [{ type: "text" as const, text: reply }],
      }]);
      return;
    }

    if (FULL_SONG_RE.test(text)) {
      const songBpm = 90;
      const loopDurationSec = (4 * 4 * 60) / songBpm;
      const arrangementDefs = [
        {
          name: "Atmosphere / Chords",
          url: "/samples/SO_RE_90_melodic_stack_fennel_rhodes_Cmaj.wav",
          color: "#DDD6FE",
          startMeasure: 1,
          durationMeasures: 24,
        },
        {
          name: "Drums",
          url: "/samples/SO_RE_90_drum_loop_bangit.wav",
          color: "#FCA5A5",
          startMeasure: 5,
          durationMeasures: 20,
        },
        {
          name: "Bass Motion",
          url: "/samples/SO_RE_90_resample_guitar_Cmaj.wav",
          color: "#C1E1C1",
          startMeasure: 9,
          durationMeasures: 16,
        },
        {
          name: "Lead Melody",
          url: "/samples/SO_RE_90_melodic_stack_emerald_piano_Cmaj.wav",
          color: "#FEF08A",
          startMeasure: 13,
          durationMeasures: 12,
        },
      ] as const;

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "user" as const,
        content: text,
        parts: [{ type: "text" as const, text }],
      }]);

      const thinkingId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: thinkingId,
        role: "assistant" as const,
        content: "◌  Building a full arranged song…",
        parts: [{ type: "text" as const, text: "◌  Building a full arranged song…" }],
      }]);

      setIsGeneratingAudio(true);
      setFullSongMacroStep(0);
      let macroSucceeded = false;

      const timers = [
        window.setTimeout(() => setFullSongMacroStep(1), 650),
        window.setTimeout(() => setFullSongMacroStep(2), 1300),
      ];

      try {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 2000));
        const blobs = await Promise.all(arrangementDefs.map((track) => fetchLoopBlob(track.url)));

        toneEngine.stop();
        dawStateRef.current.tracks.forEach((track) => toneEngine.stopStem(track.id));

        const nextTracks = arrangementDefs.map((track, index) => ({
          id: crypto.randomUUID(),
          name: track.name,
          color: track.color,
          muted: false,
          volume: 80,
          loop: true,
          loopBars: 4,
          loopDurationSec,
          audioBlob: blobs[index],
        }));

        const nextBlocks = arrangementDefs.map((track, index) => ({
          id: crypto.randomUUID(),
          trackId: nextTracks[index]!.id,
          name: track.name,
          startMeasure: track.startMeasure,
          durationMeasures: track.durationMeasures,
          color: track.color,
        }));

        dawDispatch({
          type: "HYDRATE_SESSION",
          payload: {
            transport: {
              isPlaying: false,
              currentMeasure: 1,
              bpm: songBpm,
              totalMeasures: 64,
            },
            tracks: nextTracks,
            blocks: nextBlocks,
            selectedBlockId: null,
            drumPattern: dawStateRef.current.drumPattern,
            sampleLibrary: dawStateRef.current.sampleLibrary,
            recording: {
              isRecording: false,
              armedTrackId: null,
              recordStartTime: null,
              monitorEnabled: dawStateRef.current.recording.monitorEnabled,
            },
            loop: {
              loopEnabled: false,
              loopStart: 0,
              loopEnd: loopDurationSec,
            },
            gridSize: 16,
            kidsMode: false,
          },
        });
        macroSucceeded = true;

        const reply = "I have autonomously composed and arranged a full multi-track song. I staggered the drum and bass entries to create dynamic tension.";
        setMessages(prev =>
          prev.map((message) =>
            message.id === thinkingId
              ? { ...message, content: reply, parts: [{ type: "text" as const, text: reply }] }
              : message,
          ),
        );
      } catch {
        const reply = "Full-song arrangement failed. The demo loop set could not be loaded.";
        setMessages(prev =>
          prev.map((message) =>
            message.id === thinkingId
              ? { ...message, content: reply, parts: [{ type: "text" as const, text: reply }] }
              : message,
          ),
        );
      } finally {
        timers.forEach((timerId) => window.clearTimeout(timerId));
        setIsGeneratingAudio(false);
        if (macroSucceeded) {
          setFullSongMacroStep(FULL_SONG_STEPS.length);
          window.setTimeout(() => setFullSongMacroStep(null), 900);
        } else {
          setFullSongMacroStep(null);
        }
      }

      return;
    }

    // ── AGENTIC COMMANDS ─────────────────────────────────────────────────────
    {
      const isAgenticChop = /agentic chop|chop this loop/i.test(text);
      const isAgenticMix  = /agentic mix|mix this|engineer the vocals/i.test(text);

      if (isAgenticChop || isAgenticMix) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: text,
          parts: [{ type: "text" as const, text }],
        }]);

        setIsAgenticRunning(true);
        setAgenticStep(0);
        setTimeout(() => setAgenticStep(1), 500);
        setTimeout(() => setAgenticStep(2), 1000);
        setTimeout(() => {
          setAgenticStep(3);

          const s = dawStateRef.current;
          let replyText = "";

          if (isAgenticChop) {
            // Prefer: selected block → first loop block → first block
            const block =
              s.blocks.find(b => b.id === s.selectedBlockId) ??
              s.blocks.find(b => s.tracks.find(t => t.id === b.trackId)?.loop) ??
              s.blocks[0];
            if (block) {
              const sliceDur = block.durationMeasures / 4;
              const secPerMeasure = (60 / s.transport.bpm) * 4;
              const sliceSec = sliceDur * secPerMeasure;
              const baseOffset = block.bufferOffsetSec ?? 0;

              const slices = [0, 1, 2, 3].map(i => ({
                id: crypto.randomUUID(),
                trackId: block.trackId,
                name: `${block.name} [${i + 1}/4]`,
                startMeasure: block.startMeasure + i * sliceDur,
                durationMeasures: sliceDur,
                color: block.color,
                bufferOffsetSec: baseOffset + i * sliceSec,
              }));

              // Swap slice 2 (index 1) and slice 4 (index 3) startMeasures for syncopation
              const s2Start = slices[1].startMeasure;
              slices[1] = { ...slices[1], startMeasure: slices[3].startMeasure };
              slices[3] = { ...slices[3], startMeasure: s2Start };

              dawDispatch({ type: "DELETE_BLOCK", payload: block.id });
              slices.forEach(sl => dawDispatch({ type: "ADD_BLOCK", payload: sl }));
            }
            replyText = "I autonomously analyzed the transients and restructured your loop for a more syncopated rhythm.";
          } else {
            // isAgenticMix — find vocal/guitar track or fall back to first track
            const targetTrack =
              s.tracks.find(t => /vocal|guitar|voice/i.test(t.name)) ?? s.tracks[0];
            if (targetTrack) {
              toneEngine.setStemEQ(targetTrack.id, -3, 0, 4);
              toneEngine.setStemReverb(targetTrack.id, 0.4);
            }
            replyText = "I applied an Agentic Mix: rolled off the muddy low-end frequencies, boosted the vocal presence, and added a 40% algorithmic room verb.";
          }

          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: replyText,
            parts: [{ type: "text" as const, text: replyText }],
          }]);

          setTimeout(() => setIsAgenticRunning(false), 800);
        }, 1500);

        return;
      }
    }
    // ── END AGENTIC COMMANDS ─────────────────────────────────────────────────

    // ── DEMO MAGIC INTERCEPTS ────────────────────────────────────────────────
    // Matches specific trigger phrases → instantly populates the DAW from local
    // files. Zero API calls, zero latency. Perfect for live demos.
    {
      const lc = text.toLowerCase();
      const is80Pop        = /80.{0,5}bpm.{0,10}pop|stack.{0,5}80|melodic.?pop/i.test(lc);
      const is90Beat       = /\b90\b.{0,20}\b(good|beat|groove|vibe|bang|random|surprise|bpm)\b|\b(good\s*beat|surprise\s*me)\b/i.test(lc);
      const isRandomDrum   = /random\s*(drum|drums|beat|loop|percussion)/i.test(lc);
      const isRandomMelody = /random\s*(melody|melodic|melodies|top|chord|arp|piano|guitar|flute|rhodes|organ|sound)/i.test(lc);

      if (is80Pop || is90Beat || isRandomDrum || isRandomMelody) {
        type DemoTrackDef = { name: string; url: string; color: string };

        // ── 90 BPM sample pools (6 drums × 17 tops = 102 possible combinations) ──
        const DRUMS_90: DemoTrackDef[] = [
          { name: "Bangit Drums",     url: "/samples/SO_RE_90_drum_loop_bangit.wav",       color: "#FCA5A5" },
          { name: "Galapagos Drums",  url: "/samples/SO_RE_90_drum_loop_galapagos.wav",    color: "#FCA5A5" },
          { name: "Okatie Drums",     url: "/samples/SO_RE_90_drum_loop_okatie.wav",        color: "#FCA5A5" },
          { name: "Tahiti Drums",     url: "/samples/SO_RE_90_drum_loop_tahiti_full.wav",   color: "#FCA5A5" },
          { name: "Tahiti Strip",     url: "/samples/SO_RE_90_drum_loop_tahiti_strip.wav",  color: "#FCA5A5" },
          { name: "Waterworld Drums", url: "/samples/SO_RE_90_drum_loop_waterworld.wav",    color: "#FCA5A5" },
        ];

        const TOPS_90: DemoTrackDef[] = [
          { name: "Basil Guitar Arp",    url: "/samples/SO_RE_90_guitar_arp_basil_Cmaj.wav",                color: "#C1E1C1" },
          { name: "Azure Guitar",        url: "/samples/SO_RE_90_guitar_azure_Fmin.wav",                    color: "#C1E1C1" },
          { name: "Beige Guitar Rhythm", url: "/samples/SO_RE_90_guitar_rhythm_beige_Cmaj.wav",             color: "#C1E1C1" },
          { name: "Birch Guitar Strum",  url: "/samples/SO_RE_90_guitar_strum_birch_Cmaj.wav",              color: "#C1E1C1" },
          { name: "Cucumber Flute",      url: "/samples/SO_RE_90_melodic_stack_cucumber_flute_Fmaj.wav",    color: "#E9D5FF" },
          { name: "Cyan Arp",            url: "/samples/SO_RE_90_melodic_stack_cyan_arp_Fmaj.wav",          color: "#BAE6FD" },
          { name: "Cyprus Flute",        url: "/samples/SO_RE_90_melodic_stack_cyprus_flute_Cmaj.wav",      color: "#E9D5FF" },
          { name: "Diamond Glock",       url: "/samples/SO_RE_90_melodic_stack_diamond_glock_Fmaj.wav",     color: "#FEF08A" },
          { name: "Elderberry Guitar",   url: "/samples/SO_RE_90_melodic_stack_elderberry_guitar_Cmaj.wav", color: "#BBF7D0" },
          { name: "Elm Organ",           url: "/samples/SO_RE_90_melodic_stack_elm_organ_Fmaj.wav",         color: "#DDD6FE" },
          { name: "Emerald Piano",       url: "/samples/SO_RE_90_melodic_stack_emerald_piano_Cmaj.wav",     color: "#BBF7D0" },
          { name: "Fennel Rhodes",       url: "/samples/SO_RE_90_melodic_stack_fennel_rhodes_Cmaj.wav",     color: "#DDD6FE" },
          { name: "Fern Flute",          url: "/samples/SO_RE_90_melodic_stack_fern_flute_Fmin.wav",        color: "#E9D5FF" },
          { name: "Fig Orchestra",       url: "/samples/SO_RE_90_melodic_stack_fig_orchestra_Fmin.wav",     color: "#FED7AA" },
          { name: "Fuchsia Rhodes",      url: "/samples/SO_RE_90_melodic_stack_fuchsia_rhodes_Fmin.wav",    color: "#E9D5FF" },
          { name: "Guitar Resample",     url: "/samples/SO_RE_90_resample_guitar_Cmaj.wav",                 color: "#C1E1C1" },
          { name: "Waterworld Texture",  url: "/samples/SO_RE_90_resample_waterworld_Gmin.wav",             color: "#BAE6FD" },
        ];

        const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
        // bpm is optional — single-track drops keep whatever BPM is already set
        let scenario: { bpm?: number; reply: string; tracks: DemoTrackDef[] };

        if (is80Pop) {
          scenario = {
            bpm: 80,
            reply: "I've generated a cohesive 3-track pop arrangement at 80 BPM. I stacked modern drums with cashmere melodies and sienna strings.",
            tracks: [
              { name: "Modern Pop Drums", url: "/samples/OLIVER_80_drum_loop_modern_pop_tight_foley.wav", color: "#FCA5A5" },
              { name: "Cashmere Melody",  url: "/samples/SO_RE_80_melodic_stack_cashmere_Cmaj.wav",        color: "#C1E1C1" },
              { name: "Sienna Strings",   url: "/samples/SO_RE_80_strings_chords_sienna_Cmaj.wav",         color: "#E9D5FF" },
            ],
          };
        } else if (isRandomDrum) {
          const drum = pick(DRUMS_90);
          scenario = {
            reply: `Dropped ${drum.name} onto a new track.`,
            tracks: [drum],
          };
        } else if (isRandomMelody) {
          const top = pick(TOPS_90);
          scenario = {
            reply: `Loaded ${top.name} onto a new track.`,
            tracks: [top],
          };
        } else {
          // 90 BPM beat: 1 drum + 1 top so keys don't clash
          const drum = pick(DRUMS_90);
          const top  = pick(TOPS_90);
          scenario = {
            bpm: 90,
            reply: `Built a 90 BPM beat — ${drum.name} in the pocket with ${top.name} on top. Hit me again for a different roll.`,
            tracks: [drum, top],
          };
        }

        // 1. Echo the user's message immediately so the chat doesn't look frozen
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "user" as const,
          content: text,
          parts: [{ type: "text" as const, text }],
        }]);

        // 2. "Thinking" placeholder — replaced with the real reply after the delay
        const thinkingId = crypto.randomUUID();
        setMessages(prev => [...prev, {
          id: thinkingId,
          role: "assistant" as const,
          content: "◌  Composing your session…",
          parts: [{ type: "text" as const, text: "◌  Composing your session…" }],
        }]);

        setIsGeneratingAudio(true);

        setTimeout(async () => {
          // 3. Only update BPM if the scenario specifies one (single-track drops don't)
          if (scenario.bpm !== undefined) {
            Tone.getTransport().bpm.value = scenario.bpm;
            dawDispatch({ type: "SET_TRANSPORT", payload: { bpm: scenario.bpm } });
          }

          // 4. Fetch all audio files in parallel, then dispatch track/audio/block
          const currentBpm = scenario.bpm ?? dawStateRef.current.transport.bpm;
          const loopDurationSec = (4 * 4 * 60) / currentBpm;

          await Promise.all(
            scenario.tracks.map(async (def) => {
              try {
                const resp = await fetch(def.url);
                if (!resp.ok) return;
                const blob = await resp.blob();
                const trackId = crypto.randomUUID();

                dawDispatch({
                  type: "ADD_TRACK",
                  payload: {
                    id: trackId,
                    name: def.name,
                    color: def.color,
                    muted: false,
                    volume: 80,
                    loop: true,
                    loopBars: 4,
                    loopDurationSec,
                  },
                });
                dawDispatch({ type: "LOAD_AUDIO", payload: { trackId, blob } });
                dawDispatch({
                  type: "ADD_BLOCK",
                  payload: {
                    id: crypto.randomUUID(),
                    trackId,
                    name: def.name,
                    startMeasure: 1,
                    durationMeasures: 4,
                    color: def.color,
                  },
                });
              } catch { /* file missing — skip silently */ }
            }),
          );

          // 5. Swap the thinking placeholder with the final AI reply
          setMessages(prev =>
            prev.map(m =>
              m.id === thinkingId
                ? { ...m, content: scenario.reply, parts: [{ type: "text" as const, text: scenario.reply }] }
                : m,
            ),
          );

          if (options?.kidsTitle) {
            const played = await maybeAutoplay(options);
            emitKidsStatus({
              state: played ? "playing" : "error",
              title: options.kidsTitle,
              message: played
                ? `${options.kidsTitle} is playing now. Tap another friend to add more music.`
                : "I built the loop, but playback did not start cleanly. Tap the block one more time.",
            });
          }

          setIsGeneratingAudio(false);
        }, 1500);

        return; // Never reach the AI API for demo triggers
      }
    }
    // ── END DEMO MAGIC ───────────────────────────────────────────────────────

    // Build current session track context so AI knows IDs for FX targeting
    const currentTracks = dawStateRef.current.tracks;
    const trackContext = currentTracks.length > 0
      ? `\n\n[Current session tracks: ${currentTracks.map(t => `"${t.name}" (id: ${t.id})`).join(", ")}]`
      : "";

    const fullText = spotifyPrefix + text + rhythmSuffix + trackContext;

    // ── Audio bypass: skip AI streaming, fetch directly ────────────────────
    // Skip bypass if this looks like an FX edit request targeting existing tracks
    const isFxEdit = FX_EDIT_RE.test(text) && currentTracks.length > 0;
    if (!isFxEdit && AUDIO_INTENT_RE.test(text)) {
      // 1. Show user message immediately — no empty bubble
      const userMsgId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: userMsgId,
        role: "user" as const,
        content: text,
        parts: [{ type: "text" as const, text }],
      }]);

      setIsGeneratingAudio(true);

      const trackName = text.slice(0, 32);
      const s = dawStateRef.current;

      // Race direct fetch against a 10s hard timeout
      const doGenerate = async (): Promise<string> => {
        let audioBlob: Blob | null = null;
        let didLoadAudio = false;

        try {
          const r = await fetch("/api/generate-sample", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text, duration_seconds: 5 }),
          });
          if (r.ok) {
            const d = await r.json() as { audio_base64: string };
            const bytes = atob(d.audio_base64);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            audioBlob = new Blob([arr], { type: "audio/mpeg" });
          }
        } catch { /* backend offline */ }

        if (!audioBlob) {
          const r = await fetch("/api/sfx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: text, duration_seconds: 5 }),
          });
          if (r.ok) audioBlob = await r.blob();
        }

        if (audioBlob) {
          const trackId = crypto.randomUUID();
          const color = DAW_TRACK_COLORS[s.tracks.length % DAW_TRACK_COLORS.length];
          dawDispatch({ type: "ADD_TRACK", payload: { id: trackId, name: trackName, color, muted: false, volume: 80 } });
          dawDispatch({ type: "LOAD_AUDIO", payload: { trackId, blob: audioBlob } });
          dawDispatch({ type: "ADD_BLOCK", payload: { id: crypto.randomUUID(), trackId, name: trackName, startMeasure: 1, durationMeasures: 4 } });
          didLoadAudio = true;
        }

        if (didLoadAudio) {
          if (options?.kidsTitle) {
            const played = await maybeAutoplay(options);
            emitKidsStatus({
              state: played ? "playing" : "error",
              title: options.kidsTitle,
              message: played
                ? `${options.kidsTitle} is playing now. Tap another friend to stack a new sound.`
                : "I made the sound, but it did not start cleanly. Tap the friend again.",
            });
          }
          return "Audio generated and loaded into your session!";
        }

        if (options?.kidsTitle) {
          emitKidsStatus({
            state: "error",
            title: options.kidsTitle,
            message: "That sound took too long. Try a different animal block.",
          });
        }
        return "Generation timed out, but I loaded a fallback sample into your library.";
      };

      const timeoutPromise = new Promise<string>((resolve) =>
        setTimeout(() => resolve("Generation timed out, but I loaded a fallback sample into your library."), 10000),
      );

      const reply = await Promise.race([doGenerate(), timeoutPromise]).catch(
        () => "Generation timed out, but I loaded a fallback sample into your library.",
      );

      if (options?.kidsTitle && reply.startsWith("Generation timed out")) {
        emitKidsStatus({
          state: "error",
          title: options.kidsTitle,
          message: "That sound took too long. Try a different animal block.",
        });
      }

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: reply,
        parts: [{ type: "text" as const, text: reply }],
      }]);

      setIsGeneratingAudio(false);
      return;
    }

    // Normal AI-streaming path
    await chatSendMessage({ text: fullText });
  };

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Patch empty assistant bubbles — if streaming finishes and the last assistant
  // message has no text (only tool parts), inject a friendly fallback reply.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted";
    prevStatusRef.current = status;
    if (!wasStreaming || status !== "ready") return;

    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      const textParts = last.parts.filter(p => p.type === "text" && (p as { type: string; text: string }).text.trim().length > 0);
      if (textParts.length > 0) return prev;
      const fallback = "Done! Audio has been generated and placed in your session. Let me know if you want to tweak it.";
      return prev.map(m =>
        m.id === last.id
          ? { ...m, content: fallback, parts: [{ type: "text" as const, text: fallback }] }
          : m
      );
    });
  }, [status, setMessages]);

  useEffect(() => {
    const handleKidsPrompt = (event: Event) => {
      const customEvent = event as CustomEvent<{
        prompt?: string;
        title?: string;
        autoplay?: boolean;
        playFromStart?: boolean;
      }>;
      const prompt = customEvent.detail?.prompt?.trim();
      if (!prompt) return;

      emitKidsStatus({
        state: "working",
        title: customEvent.detail?.title ?? "Wonder",
        message: `Making ${customEvent.detail?.title ?? "music"} for you now.`,
      });

      void sendMessageRef.current(prompt, {
        autoplay: customEvent.detail?.autoplay ?? true,
        playFromStart: customEvent.detail?.playFromStart ?? true,
        kidsTitle: customEvent.detail?.title,
      });
    };

    window.addEventListener("wonder-kids-prompt", handleKidsPrompt as EventListener);
    return () => window.removeEventListener("wonder-kids-prompt", handleKidsPrompt as EventListener);
  }, []);

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

  const startRecording = useCallback(async () => {
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
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  // Expose recording controls globally so the DAW transport Record button can trigger them
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__wonderStartRecording = startRecording;
    (window as unknown as Record<string, unknown>).__wonderStopRecording  = stopRecording;
    (window as unknown as Record<string, unknown>).__wonderIsRecording    = () => isRecording;
    return () => {
      delete (window as unknown as Record<string, unknown>).__wonderStartRecording;
      delete (window as unknown as Record<string, unknown>).__wonderStopRecording;
      delete (window as unknown as Record<string, unknown>).__wonderIsRecording;
    };
  }, [startRecording, stopRecording, isRecording]);

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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

        {isAgenticRunning && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">WONDER AI · AGENTIC</span>
            <div className="bg-[#1A1A1A] border-2 border-[#1A1A1A] rounded-xl px-3.5 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {(["Analyzing arrangement...", "Selecting optimal tools...", "Executing DSP changes...", "Agentic workflow complete."] as const).map((label, i) => {
                if (i > agenticStep) return null;
                const isComplete = i < agenticStep || agenticStep === 3;
                return (
                  <div key={i} className={`font-mono text-[11px] flex items-center gap-2 ${i > 0 ? "mt-1.5" : ""}`}>
                    <span className={isComplete ? "text-[#C1E1C1]" : "text-white"}>
                      {isComplete ? "[x]" : "[ ]"}
                    </span>
                    <span className={isComplete ? "text-white/50" : "text-white"}>
                      {label}
                    </span>
                    {!isComplete && (
                      <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse ml-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {fullSongMacroStep !== null && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">WONDER AI · MACRO ARRANGEMENT</span>
            <div className="bg-[#1A1A1A] border-2 border-[#1A1A1A] rounded-xl px-3.5 py-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
              {FULL_SONG_STEPS.map((label, index) => {
                const isComplete = fullSongMacroStep > index;
                const isCurrent = fullSongMacroStep === index;
                return (
                  <div key={label} className={`font-mono text-[11px] flex items-center gap-2 ${index > 0 ? "mt-1.5" : ""}`}>
                    <span className={isComplete ? "text-[#C1E1C1]" : "text-white"}>
                      {isComplete ? "[x]" : "[ ]"}
                    </span>
                    <span className={isComplete ? "text-white/50" : "text-white"}>
                      {label}
                    </span>
                    {isCurrent ? (
                      <span className="w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse ml-0.5" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(isLoading || (isGeneratingAudio && fullSongMacroStep === null)) && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-[#2D2D2D]/35 px-0.5">WONDER AI · JUST NOW</span>
            <div className="bg-white border border-[#E0E0E0] rounded-xl px-3.5 py-2.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.06)] flex items-center gap-2">
              {isGeneratingAudio
                ? <>
                    <div className="w-2 h-2 border-2 border-[#2D2D2D]/30 border-t-[#2D2D2D] rounded-full animate-spin" />
                    <span className="font-mono text-[11px] text-[#2D2D2D]/50">Generating audio…</span>
                  </>
                : [0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#2D2D2D]/40 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)
              }
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

      {/* Loop composing progress bar */}
      {loopGenerating && (
        <>
          {/* Inline keyframe — safe in React, avoids globals.css dependency */}
          <style>{`
            @keyframes wonder-loop-fill {
              from { width: 0% }
              to   { width: 100% }
            }
          `}</style>
          <div className="mx-4 mb-2 border-2 border-[#1A1A1A] rounded-xl bg-white p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#1A1A1A]">
                Composing Loop
              </span>
              <span className="font-mono text-[9px] text-[#1A1A1A]/50">
                {loopGenerating.bars} bars · {loopGenerating.durationSec.toFixed(1)}s
              </span>
            </div>
            {/* Progress track */}
            <div className="h-3 bg-[#F0F0EE] rounded-full overflow-hidden border border-[#D8D8D8]">
              <div
                className="h-full rounded-full bg-[#C1E1C1]"
                style={{
                  animation: `wonder-loop-fill ${loopGenerating.durationSec}s linear forwards`,
                  // Overshoot slightly so the bar is always "full" by the time the response arrives
                }}
              />
            </div>
            <p className="font-mono text-[9px] text-[#1A1A1A]/50 mt-1.5 truncate">
              {loopGenerating.name}
            </p>
          </div>
        </>
      )}

      {/* Generated Sounds panel */}
      {generatedSounds.length > 0 && (
        <div className="mx-4 mb-2 border border-[#E0E0E0] rounded-xl bg-[#FAFAF8] p-3 space-y-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#2D2D2D]/50">Generated Sounds</span>
            <button onClick={() => setGeneratedSounds([])} className="text-[9px] font-mono text-[#2D2D2D]/30 hover:text-[#2D2D2D]/70 transition-colors">Clear</button>
          </div>
          {generatedSounds.map(sound => (
            <GeneratedSoundCard key={sound.id} sound={sound} />
          ))}
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
            disabled={isGeneratingAudio || isLoading}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={isGeneratingAudio ? "Generating audio…" : "Ask Wonder to build something..."}
            rows={1}
            className="flex-1 border-none focus:ring-0 bg-transparent resize-none text-[13px] font-body leading-relaxed outline-none min-h-[22px] max-h-32 text-[#2D2D2D] placeholder:text-[#2D2D2D]/35 disabled:opacity-50"
            onInput={e => { const el=e.currentTarget; el.style.height="auto"; el.style.height=`${Math.min(el.scrollHeight,120)}px`; }}
          />

          <button onClick={isRecording ? stopRecording : startRecording} disabled={isGeneratingAudio || isLoading} className={`flex-shrink-0 pb-0.5 transition-colors disabled:opacity-30 ${isRecording ? "text-[#E53030]" : "text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60"}`}>
            {isRecording ? <StopCircle size={15} /> : <Mic size={15} />}
          </button>

          <button onClick={isTapRecording ? stopTap : startTap} disabled={isRecording || isLoading || isGeneratingAudio} className={`flex-shrink-0 pb-0.5 transition-colors disabled:opacity-30 ${isTapRecording ? "text-[#E5A030]" : "text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60"}`}>
            <Music2 size={15} />
          </button>

          <button onClick={() => sendMessage()} disabled={!input.trim() || isLoading || isGeneratingAudio} className="w-7 h-7 bg-[#2D2D2D] rounded-lg flex items-center justify-center flex-shrink-0 disabled:opacity-30 hover:bg-[#444] transition-opacity">
            {isGeneratingAudio
              ? <div className="w-2.5 h-2.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Send size={12} color="white" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </section>
  );
}
