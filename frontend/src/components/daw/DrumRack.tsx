"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DrumPattern } from "@/types";
import { toneEngine, type DrumSlot } from "@/lib/toneEngine";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DrumRackProps {
  pattern: DrumPattern;
  bpm: number;
  onPatternChange: (patch: Partial<DrumPattern>) => void;
}

const ROW_NAMES: DrumSlot[] = ["kick", "snare", "hihat", "openHat"];
const ROW_LABELS: Record<DrumSlot, string> = {
  kick: "Kick",
  snare: "Snare",
  hihat: "HH",
  openHat: "OH",
};
const ROW_COLORS: Record<DrumSlot, string> = {
  kick:    "#FCA5A5",
  snare:   "#FEF08A",
  hihat:   "#BAE6FD",
  openHat: "#C1E1C1",
};

// ─── Sample Pad ────────────────────────────────────────────────────────────────

function SamplePad({
  slot,
  color,
  sampleName,
  onLoad,
}: {
  slot: DrumSlot;
  color: string;
  sampleName: string | null;
  onLoad: (slot: DrumSlot, file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [flashing, setFlashing] = useState(false);

  const trigger = async () => {
    await toneEngine.init();
    toneEngine.triggerDrumPad(slot);
    setFlashing(true);
    setTimeout(() => setFlashing(false), 80);
  };

  return (
    <div className="relative flex-shrink-0 w-20 h-8 group">
      {/* Pad button */}
      <button
        onClick={trigger}
        title={sampleName ? `Trigger: ${sampleName}` : "No sample loaded — click folder to load"}
        className="w-full h-full border-2 border-white/20 font-mono text-[8px] font-bold uppercase tracking-widest leading-tight px-1 text-center transition-all overflow-hidden"
        style={{
          backgroundColor: flashing
            ? color
            : sampleName
            ? `${color}40`
            : "rgba(255,255,255,0.04)",
          borderColor: sampleName ? `${color}80` : "rgba(255,255,255,0.12)",
          color: sampleName ? color : "rgba(255,255,255,0.2)",
        }}
      >
        <span className="block truncate leading-tight">
          {sampleName ?? "empty"}
        </span>
      </button>

      {/* Load button — always visible on hover, small folder icon top-right */}
      <button
        onClick={() => fileRef.current?.click()}
        title="Load sample"
        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/40 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white/60 hover:text-white"
      >
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M1 3.5C1 2.95 1.45 2.5 2 2.5H5L6.5 4H10C10.55 4 11 4.45 11 5V9.5C11 10.05 10.55 10.5 10 10.5H2C1.45 10.5 1 10.05 1 9.5V3.5Z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
        </svg>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoad(slot, file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function DrumRack({ pattern, bpm, onPatternChange }: DrumRackProps) {
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const bpmRef = useRef(bpm);

  // Track loaded sample names so pads update when AI loads samples
  const [sampleNames, setSampleNames] = useState<Record<DrumSlot, string | null>>(
    () => toneEngine.getAllSampleNames()
  );

  const refreshNames = useCallback(() => {
    setSampleNames(toneEngine.getAllSampleNames());
  }, []);

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

  // Load a user-dropped file into the correct slot
  const handleSampleLoad = useCallback(async (slot: DrumSlot, file: File) => {
    await toneEngine.init();
    const url = URL.createObjectURL(file);
    await toneEngine.loadDrumSample(slot, url, file.name.replace(/\.[^/.]+$/, ""));
    refreshNames();
  }, [refreshNames]);

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

    stepRef.current = 0;
    const stepMs = (60 / bpmRef.current / 4) * 1000;
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
    if (playing) stopPlaying();
    else await startPlaying();
  }, [playing, startPlaying, stopPlaying]);

  useEffect(() => () => {
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
  }, []);

  const toggleStep = (row: DrumSlot, step: number) => {
    const current = [...(pattern[row] ?? Array(16).fill(false))];
    current[step] = !current[step];
    onPatternChange({ [row]: current });
  };

  const clearPattern = () => {
    const empty = Array(16).fill(false);
    onPatternChange({ kick: [...empty], snare: [...empty], hihat: [...empty], openHat: [...empty] });
  };

  // Expose refreshNames globally so CopilotChat can call it after AI loads a sample
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__drumRackRefresh = refreshNames;
    return () => { delete (window as unknown as Record<string, unknown>).__drumRackRefresh; };
  }, [refreshNames]);

  return (
    <div className="bg-[#1A1A1A] border-b-2 border-[#2D2D2D] px-5 py-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <span className="font-headline text-[11px] font-extrabold uppercase tracking-widest text-white/50">
          Drum Rack
        </span>
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
        <span className="font-mono text-[9px] text-white/25 ml-auto uppercase tracking-widest">
          16 Steps · {bpm} BPM
        </span>
      </div>

      {/* Pad legend */}
      <div className="flex items-center gap-2 pl-[2.5rem]">
        <span className="font-mono text-[8px] uppercase tracking-widest text-white/20 w-20 shrink-0">
          Pad (click)
        </span>
        <span className="font-mono text-[8px] uppercase tracking-widest text-white/20 ml-2">
          Step sequencer ↓
        </span>
      </div>

      {/* Step grid */}
      <div className="flex flex-col gap-1.5">
        {ROW_NAMES.map((row) => (
          <div key={row} className="flex items-center gap-2">
            {/* Row label */}
            <span className="font-mono text-[9px] font-bold uppercase w-8 shrink-0 text-right text-white/40">
              {ROW_LABELS[row]}
            </span>

            {/* Sample pad */}
            <SamplePad
              slot={row}
              color={ROW_COLORS[row]}
              sampleName={sampleNames[row]}
              onLoad={handleSampleLoad}
            />

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
