"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";

// ─── Types ────────────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = 16;
const ROUND_FONT = "'Hiragino Maru Gothic ProN', 'Arial Rounded MT Bold', ui-rounded, system-ui, sans-serif";

interface DrumRow {
  id: string;
  label: string;
  emoji: string;
  accent: string;
  sfxDescription: string;         // sent to ElevenLabs
  steps: boolean[];               // 16 booleans
  loadState: LoadState;
  audioBuffer: AudioBuffer | null;
  player: Tone.Player | null;
}

// Possible random SFX descriptions per row role
const SFX_POOL: Record<string, string[]> = {
  kick: [
    "deep booming kick drum hit",
    "punchy 808 bass kick thud",
    "heavy stomping kick drum",
    "big low-end thump drum hit",
  ],
  snare: [
    "crispy snare drum crack",
    "snappy rimshot percussion hit",
    "tight clap snap sound",
    "sharp poppy snare crack",
  ],
  hihat: [
    "bright closed hi-hat tick",
    "crispy metallic hi-hat click",
    "sharp cymbal tick percussion",
    "fast shaker hi-hat rattle",
  ],
  special: [
    "fun cartoon boing sound effect",
    "playful zap whoosh sound",
    "silly bubble pop effect",
    "cute sparkle twinkle sound",
    "happy ding bell chime",
    "bouncy spring boing effect",
  ],
};

const INITIAL_PATTERNS: Record<string, boolean[]> = {
  kick:    [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  snare:   [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  hihat:   [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  special: [false, false, false, true, false, false, false, false, false, false, false, true, false, false, false, false],
};

const ACCENTS = ["#F472B6", "#FACC15", "#60A5FA", "#34D399"];

const ROWS_DEF: { id: string; label: string; emoji: string }[] = [
  { id: "kick",    label: "KICK",    emoji: "🦁" },
  { id: "snare",   label: "SNARE",   emoji: "🐼" },
  { id: "hihat",   label: "HI-HAT",  emoji: "🐥" },
  { id: "special", label: "SPECIAL", emoji: "🐸" },
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }

function makeRow(def: { id: string; label: string; emoji: string }, idx: number): DrumRow {
  return {
    ...def,
    accent: ACCENTS[idx % ACCENTS.length]!,
    sfxDescription: pick(SFX_POOL[def.id] ?? SFX_POOL.special!),
    steps: [...(INITIAL_PATTERNS[def.id] ?? Array(STEPS).fill(false))],
    loadState: "idle",
    audioBuffer: null,
    player: null,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function KidsModeStage({ onPrompt }: { onPrompt: (prompt: string, title?: string) => Promise<void> | void }) {
  const [rows, setRows] = useState<DrumRow[]>(() => ROWS_DEF.map(makeRow));
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(90);
  const [currentStep, setCurrentStep] = useState(-1);

  const sequenceRef = useRef<Tone.Sequence | null>(null);
  const playersRef  = useRef<Map<string, Tone.Player>>(new Map());
  const rowsRef     = useRef<DrumRow[]>(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // ── Fetch a single SFX from ElevenLabs ──────────────────────────────────────
  const loadSfx = useCallback(async (rowId: string, description?: string) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, loadState: "loading" } : r));

    const row = rowsRef.current.find(r => r.id === rowId)!;
    const desc = description ?? row.sfxDescription;

    try {
      const res = await fetch("/api/sfx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, duration_seconds: 1.0 }),
      });
      if (!res.ok) throw new Error(`sfx ${res.status}`);

      const arrayBuf = await res.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded  = await audioCtx.decodeAudioData(arrayBuf);
      await audioCtx.close();

      // Build / replace Tone.Player
      const existing = playersRef.current.get(rowId);
      if (existing) { existing.dispose(); }

      const player = new Tone.Player().toDestination();
      player.buffer = new Tone.ToneAudioBuffer(decoded);
      playersRef.current.set(rowId, player);

      setRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, loadState: "ready", audioBuffer: decoded, player, sfxDescription: desc } : r
      ));
    } catch {
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, loadState: "error" } : r));
    }
  }, []);

  // Load all rows on mount
  useEffect(() => {
    rows.forEach(r => { void loadSfx(r.id); });
    return () => {
      sequenceRef.current?.dispose();
      playersRef.current.forEach(p => p.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sequencer ────────────────────────────────────────────────────────────────
  const startSequencer = useCallback(async () => {
    await Tone.start();
    Tone.getTransport().bpm.value = bpm;

    sequenceRef.current?.dispose();

    let step = 0;
    const seq = new Tone.Sequence(
      (time) => {
        const currentRows = rowsRef.current;
        currentRows.forEach(row => {
          if (row.steps[step]) {
            const player = playersRef.current.get(row.id);
            if (player?.loaded) player.start(time);
          }
        });
        const s = step;
        Tone.getDraw().schedule(() => setCurrentStep(s), time);
        step = (step + 1) % STEPS;
      },
      Array.from({ length: STEPS }, (_, i) => i),
      "16n"
    );
    seq.start(0);
    sequenceRef.current = seq;
    Tone.getTransport().start();
    setIsPlaying(true);
  }, [bpm]);

  const stopSequencer = useCallback(() => {
    sequenceRef.current?.stop();
    Tone.getTransport().stop();
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  // Sync BPM live
  useEffect(() => {
    if (isPlaying) Tone.getTransport().bpm.value = bpm;
  }, [bpm, isPlaying]);

  const toggleStep = (rowId: string, stepIdx: number) => {
    setRows(prev => prev.map(r =>
      r.id === rowId
        ? { ...r, steps: r.steps.map((v, i) => i === stepIdx ? !v : v) }
        : r
    ));
  };

  const clearRow = (rowId: string) => {
    setRows(prev => prev.map(r =>
      r.id === rowId ? { ...r, steps: Array(STEPS).fill(false) } : r
    ));
  };

  const rerollRow = (rowId: string) => {
    const pool = SFX_POOL[rowId] ?? SFX_POOL.special!;
    const desc = pick(pool);
    void loadSfx(rowId, desc);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto bg-[#FFFBEB] px-4 py-4">
      <div className="mx-auto w-full max-w-5xl flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {(["K","I","D","S"] as const).map((l, i) => (
              <span key={l} className="text-[40px] font-black leading-none"
                style={{ color: ["#60A5FA","#FACC15","#F43F5E","#FB923C"][i], fontFamily: ROUND_FONT, textShadow: "3px 3px 0 rgba(26,26,26,0.14)" }}>
                {l}
              </span>
            ))}
            <span className="ml-2 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-[#1A1A1A]/40">
              DRUM MACHINE
            </span>
          </div>

          {/* BPM + Play */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border-2 border-[#1A1A1A] rounded-xl px-3 py-1.5 bg-white shadow-[3px_3px_0_rgba(26,26,26,0.10)]">
              <button onClick={() => setBpm(b => Math.max(60, b - 5))}
                className="w-7 h-7 rounded-lg border-2 border-[#1A1A1A] bg-[#F0F0EB] font-black text-[16px] flex items-center justify-center hover:bg-[#E0E0DB] active:translate-y-px">
                −
              </button>
              <span className="font-mono font-black text-[18px] w-9 text-center tabular-nums">{bpm}</span>
              <button onClick={() => setBpm(b => Math.min(200, b + 5))}
                className="w-7 h-7 rounded-lg border-2 border-[#1A1A1A] bg-[#F0F0EB] font-black text-[16px] flex items-center justify-center hover:bg-[#E0E0DB] active:translate-y-px">
                +
              </button>
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#1A1A1A]/40 ml-1">BPM</span>
            </div>

            <button
              onClick={isPlaying ? stopSequencer : startSequencer}
              className="flex items-center gap-2 px-6 py-2.5 rounded-2xl border-2 border-[#1A1A1A] font-black text-[15px] uppercase tracking-wide shadow-[4px_4px_0_rgba(26,26,26,0.18)] transition-all active:translate-y-px active:shadow-[2px_2px_0_rgba(26,26,26,0.18)]"
              style={{
                fontFamily: ROUND_FONT,
                backgroundColor: isPlaying ? "#FCA5A5" : "#C1E1C1",
              }}
            >
              {isPlaying ? "⏹ STOP" : "▶ PLAY"}
            </button>
          </div>
        </div>

        {/* Step indicator ruler */}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "80px repeat(16, 1fr)" }}>
          <div />
          {Array.from({ length: STEPS }, (_, i) => (
            <div key={i} className="flex items-center justify-center">
              <span className={`font-mono text-[9px] font-bold transition-colors ${currentStep === i ? "text-[#1A1A1A]" : "text-[#1A1A1A]/20"}`}>
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Drum rows */}
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-[22px] border-2 border-[#1A1A1A] p-3 shadow-[4px_4px_0_rgba(26,26,26,0.10)]"
              style={{ backgroundColor: row.accent + "22" }}
            >
              <div className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "80px repeat(16, 1fr)" }}>
                {/* Row label */}
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[22px]">{row.emoji}</span>
                  <span className="font-mono text-[8px] font-black uppercase tracking-widest text-[#1A1A1A]/60">{row.label}</span>
                  {row.loadState === "loading" && (
                    <span className="font-mono text-[7px] text-[#1A1A1A]/30 animate-pulse">loading…</span>
                  )}
                  {row.loadState === "error" && (
                    <button onClick={() => rerollRow(row.id)}
                      className="font-mono text-[7px] text-red-400 underline">retry</button>
                  )}
                </div>

                {/* Steps */}
                {row.steps.map((on, si) => {
                  const isCurrentStep = currentStep === si;
                  const isBeat = si % 4 === 0;
                  return (
                    <button
                      key={si}
                      onClick={() => toggleStep(row.id, si)}
                      className="aspect-square rounded-lg border-2 border-[#1A1A1A] transition-all active:scale-95"
                      style={{
                        backgroundColor: on
                          ? row.accent
                          : isCurrentStep
                          ? "rgba(26,26,26,0.08)"
                          : isBeat
                          ? "rgba(26,26,26,0.06)"
                          : "white",
                        boxShadow: on
                          ? `3px 3px 0 rgba(26,26,26,0.18)${isCurrentStep ? `, 0 0 0 3px ${row.accent}` : ""}`
                          : isCurrentStep
                          ? "inset 0 0 0 2px rgba(26,26,26,0.15)"
                          : "none",
                        transform: isCurrentStep && on ? "scale(1.12)" : undefined,
                      }}
                    />
                  );
                })}
              </div>

              {/* Row controls */}
              <div className="mt-2 flex items-center gap-2 pl-[88px]">
                <button
                  onClick={() => rerollRow(row.id)}
                  disabled={row.loadState === "loading"}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#1A1A1A]/20 bg-white font-mono text-[8px] font-bold uppercase tracking-widest text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:border-[#1A1A1A]/40 disabled:opacity-30 transition-colors"
                  title="Generate a new random sound for this row"
                >
                  {row.loadState === "loading" ? "…" : "🎲 new sound"}
                </button>
                <button
                  onClick={() => clearRow(row.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#1A1A1A]/20 bg-white font-mono text-[8px] font-bold uppercase tracking-widest text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:border-[#1A1A1A]/40 transition-colors"
                  title="Clear all steps for this row"
                >
                  clear
                </button>
                {row.loadState === "ready" && (
                  <span className="font-mono text-[7px] text-[#1A1A1A]/30 truncate max-w-[180px]" title={row.sfxDescription}>
                    ✓ {row.sfxDescription}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Tip */}
        <p className="text-center font-mono text-[9px] uppercase tracking-[0.22em] text-[#1A1A1A]/25 pb-2">
          Tap the squares to turn sounds on · 🎲 new sound regenerates from AI · ▶ to jam
        </p>
      </div>
    </div>
  );
}
