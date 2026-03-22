"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DrumPattern } from "@/types";
import { toneEngine } from "@/lib/toneEngine";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DrumRackProps {
  pattern: DrumPattern;
  bpm: number;
  onPatternChange: (patch: Partial<DrumPattern>) => void;
}

const ROW_NAMES: Array<keyof DrumPattern> = ["kick", "snare", "hihat", "openHat"];
const ROW_LABELS: Record<keyof DrumPattern, string> = {
  kick: "Kick",
  snare: "Snare",
  hihat: "HH",
  openHat: "OH",
};
const ROW_COLORS: Record<keyof DrumPattern, string> = {
  kick:    "#FCA5A5",
  snare:   "#FEF08A",
  hihat:   "#BAE6FD",
  openHat: "#C1E1C1",
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function DrumRack({ pattern, bpm, onPatternChange }: DrumRackProps) {
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const bpmRef = useRef(bpm);

  // Keep bpm ref current
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // Sync drum pattern to toneEngine whenever it changes
  useEffect(() => {
    toneEngine.setDrumPattern(pattern);
  }, [pattern]);

  // Sync BPM to toneEngine
  useEffect(() => {
    if (toneEngine.isReady()) {
      toneEngine.setBPM(bpm);
    }
  }, [bpm]);

  const startPlaying = useCallback(async () => {
    await toneEngine.init();
    toneEngine.setBPM(bpmRef.current);
    toneEngine.setDrumPattern({
      kick: pattern.kick,
      snare: pattern.snare,
      hihat: pattern.hihat,
      openHat: pattern.openHat,
    });
    await toneEngine.play();
    setPlaying(true);

    // Visual step indicator (UI only — audio handled by toneEngine)
    stepRef.current = 0;
    const stepMs = (60 / bpmRef.current / 4) * 1000; // 16th note
    stepIntervalRef.current = setInterval(() => {
      setCurrentStep(stepRef.current % 16);
      stepRef.current++;
    }, stepMs);
  }, [pattern]);

  const stopPlaying = useCallback(() => {
    toneEngine.stop();
    setPlaying(false);
    setCurrentStep(-1);
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    stepRef.current = 0;
  }, []);

  const togglePlay = useCallback(async () => {
    if (playing) {
      stopPlaying();
    } else {
      await startPlaying();
    }
  }, [playing, startPlaying, stopPlaying]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
  }, []);

  const toggleStep = (row: keyof DrumPattern, step: number) => {
    const current = [...(pattern[row] ?? Array(16).fill(false))];
    current[step] = !current[step];
    onPatternChange({ [row]: current });
  };

  const clearPattern = () => {
    const empty = Array(16).fill(false);
    onPatternChange({ kick: [...empty], snare: [...empty], hihat: [...empty], openHat: [...empty] });
  };

  return (
    <div className="bg-[#1A1A1A] border-b-2 border-[#2D2D2D] px-5 py-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="font-headline text-[11px] font-extrabold uppercase tracking-widest text-white/50">Drum Rack</span>
        <button
          onClick={togglePlay}
          className={`border-2 rounded-lg px-4 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
            playing
              ? "bg-[#FCA5A5] border-[#FCA5A5] text-[#2D2D2D]"
              : "bg-transparent border-white/20 text-white/70 hover:text-white hover:border-white/40"
          }`}
        >
          {playing ? "Stop" : "Play"}
        </button>
        <button
          onClick={clearPattern}
          className="border border-white/15 rounded-lg px-3 py-1 font-mono text-[10px] font-bold text-white/40 hover:text-white/80 hover:border-white/30 transition-colors uppercase tracking-widest"
        >
          Clear
        </button>
        <span className="font-mono text-[9px] text-white/25 ml-auto uppercase tracking-widest">16 Steps · {bpm} BPM</span>
      </div>

      {/* Step grid */}
      <div className="flex flex-col gap-1.5">
        {ROW_NAMES.map((row) => (
          <div key={row} className="flex items-center gap-2">
            {/* Row label */}
            <span className="font-mono text-[9px] font-bold uppercase w-8 shrink-0 text-right text-white/40">
              {ROW_LABELS[row]}
            </span>

            {/* Steps */}
            <div className="flex gap-[3px] flex-1">
              {Array.from({ length: 16 }).map((_, step) => {
                const active = pattern[row]?.[step] ?? false;
                const isCurrent = step === currentStep && playing;
                const groupStart = step % 4 === 0;
                return (
                  <button
                    key={step}
                    onClick={() => toggleStep(row, step)}
                    className={`h-8 flex-1 rounded-lg transition-all border-2 ${groupStart ? "ml-2" : ""} ${
                      active
                        ? "border-white/30 shadow-[1px_1px_0px_0px_rgba(255,255,255,0.1)]"
                        : "border-white/8 hover:border-white/20"
                    } ${isCurrent ? "ring-1 ring-white/50" : ""}`}
                    style={{
                      backgroundColor: active
                        ? ROW_COLORS[row]
                        : isCurrent
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.03)",
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
