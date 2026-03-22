"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, CheckCircle2 } from "lucide-react";

interface ListeningAnalysisProps {
  /** Whether analysis is active */
  active: boolean;
  /** Target BPM to "detect" after the fake analysis completes */
  targetBPM: number;
  /** Target key to "detect" */
  targetKey?: string;
  /** Duration of the fake analysis in ms (default 3000) */
  analysisDurationMs?: number;
  /** Called when fake analysis completes with "detected" values */
  onComplete: (result: { bpm: number; key: string; confidence: number }) => void;
  /** Called to cancel */
  onCancel?: () => void;
}

type Phase = "listening" | "analyzing" | "done";

export default function ListeningAnalysis({
  active,
  targetBPM,
  targetKey = "A minor",
  analysisDurationMs = 3000,
  onComplete,
  onCancel,
}: ListeningAnalysisProps) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [progress, setProgress] = useState(0);
  const [waveData, setWaveData] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => Math.random() * 0.3)
  );

  const complete = useCallback(() => {
    setPhase("done");
    onComplete({
      bpm: targetBPM,
      key: targetKey,
      confidence: 0.94,
    });
  }, [targetBPM, targetKey, onComplete]);

  // Fake waveform animation
  useEffect(() => {
    if (!active || phase === "done") return;

    const interval = setInterval(() => {
      setWaveData(
        Array.from({ length: 32 }, () =>
          phase === "listening"
            ? 0.1 + Math.random() * 0.7
            : 0.05 + Math.random() * 0.3
        )
      );
    }, 80);

    return () => clearInterval(interval);
  }, [active, phase]);

  // Progress timer
  useEffect(() => {
    if (!active) {
      setPhase("listening");
      setProgress(0);
      return;
    }

    const startTime = Date.now();
    const halfDuration = analysisDurationMs / 2;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(elapsed / analysisDurationMs, 1);
      setProgress(pct);

      if (elapsed >= halfDuration && phase === "listening") {
        setPhase("analyzing");
      }

      if (pct >= 1) {
        clearInterval(timer);
        complete();
      }
    }, 50);

    return () => clearInterval(timer);
  }, [active, analysisDurationMs, phase, complete]);

  if (!active && phase !== "done") return null;

  return (
    <div className="mx-4 mb-2 border border-[#E0E0E0] rounded-xl bg-white overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0F0F0]">
        <div className="flex items-center gap-2">
          {phase === "done" ? (
            <CheckCircle2 size={14} className="text-[#3da84a]" />
          ) : (
            <Activity
              size={14}
              className={
                phase === "listening"
                  ? "text-[#E5A030] animate-pulse"
                  : "text-[#4a664c]"
              }
            />
          )}
          <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#2D2D2D]/50">
            {phase === "listening"
              ? "Listening..."
              : phase === "analyzing"
              ? "Analyzing audio..."
              : "Analysis complete"}
          </span>
        </div>
        {phase !== "done" && onCancel && (
          <button
            onClick={onCancel}
            className="font-mono text-[9px] text-[#2D2D2D]/30 hover:text-[#2D2D2D]/60 uppercase tracking-wide"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Fake waveform visualization */}
      <div className="px-3 py-2">
        <div className="flex items-end gap-[2px] h-8">
          {waveData.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all duration-75"
              style={{
                height: `${v * 100}%`,
                backgroundColor:
                  phase === "done"
                    ? "#3da84a"
                    : phase === "listening"
                    ? "#E5A030"
                    : "#4a664c",
                opacity: phase === "done" ? 0.4 : 0.6 + v * 0.4,
              }}
            />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      {phase !== "done" && (
        <div className="px-3 pb-2">
          <div className="h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#2D2D2D] rounded-full transition-all duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {phase === "done" && (
        <div className="px-3 pb-2.5 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-[#2D2D2D]/40 uppercase">BPM</span>
            <span className="font-mono text-[13px] font-bold text-[#2D2D2D]">
              {targetBPM}
            </span>
          </div>
          <span className="text-[#2D2D2D]/15">·</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-[#2D2D2D]/40 uppercase">Key</span>
            <span className="font-mono text-[13px] font-bold text-[#E03030]/70">
              {targetKey}
            </span>
          </div>
          <span className="text-[#2D2D2D]/15">·</span>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] text-[#2D2D2D]/40 uppercase">Conf</span>
            <span className="font-mono text-[11px] text-[#3da84a]">94%</span>
          </div>
        </div>
      )}
    </div>
  );
}
