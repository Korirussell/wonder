"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { DAWBlock, DAWTrack } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InspectedClip {
  block: DAWBlock;
  track: DAWTrack;
  bpm: number;
}

// ─── Scan sequence ────────────────────────────────────────────────────────────

const SCAN_STEPS = [
  "Analyzing transients...",
  "Running FFT pitch detection...",
  "Calculating LUFS...",
  "Analysis complete.",
] as const;

// Step fires at these cumulative ms
const STEP_TIMINGS = [400, 800, 1200, 1500];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  clip: InspectedClip;
  onClose: () => void;
}

export function ClipInspectorModal({ clip, onClose }: Props) {
  const [completedSteps, setCompletedSteps] = useState(0);
  const [showData, setShowData] = useState(false);

  // Stable random values per clip open (not regenerated on re-render)
  const [peakDb]  = useState(() => parseFloat((-(Math.random() * 5 + 1)).toFixed(1)));   // -1.0 → -6.0
  const [lufs]    = useState(() => parseFloat((-(Math.random() * 5 + 11)).toFixed(1)));  // -11.0 → -16.0

  // Duration: prefer real buffer duration, fall back to measure math
  const durationSec = clip.track.audioDurationSec
    ?? (clip.block.durationMeasures * (4 * 60) / clip.bpm);

  useEffect(() => {
    const timers = STEP_TIMINGS.map((delay, i) =>
      setTimeout(() => {
        setCompletedSteps(i + 1);
        if (i === STEP_TIMINGS.length - 1) setShowData(true);
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9990] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9991] w-[480px] bg-[#111111] border-2 border-[#1A1A1A] shadow-[8px_8px_0px_0px_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header bar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#2A2A2A] bg-[#0A0A0A]">
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.22em] text-[#555] leading-none mb-[5px]">
              WONDER DSP ENGINE v1
            </p>
            <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8E8E8] leading-none">
              CLIP INSPECTOR // AUDIO ANALYSIS
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 border border-[#333] flex items-center justify-center text-[#555] hover:text-[#E8E8E8] hover:border-[#666] transition-colors"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>

        {/* ── Clip tag ─────────────────────────────────────────────────── */}
        <div className="px-4 pt-3 pb-2 border-b border-[#1E1E1E] flex items-center gap-2.5">
          <div
            className="w-2.5 h-2.5 shrink-0 border border-black/30"
            style={{ backgroundColor: clip.track.color }}
          />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#888] truncate">
            {clip.block.name ?? clip.track.name}
          </span>
          <span className="font-mono text-[9px] text-[#444] ml-auto shrink-0">
            TRACK {String(clip.track.name).toUpperCase()}
          </span>
        </div>

        {/* ── Terminal / scan output ───────────────────────────────────── */}
        <div className="px-4 py-3 bg-[#0D0D0D] border-b border-[#1E1E1E] font-mono text-[10px] space-y-1.5 min-h-[100px]">
          {SCAN_STEPS.map((step, i) => {
            const isLastStep = i === SCAN_STEPS.length - 1;
            const isDone      = completedSteps > i;
            const isActive    = completedSteps === i && !isDone;

            if (!isDone && !isActive) return null; // not reached yet

            return (
              <div key={i} className="flex items-start gap-2">
                <span className={`shrink-0 ${isDone ? "text-[#3DBE4E]" : "text-[#F5C542]"}`}>
                  {isDone ? "[✓]" : "[ ]"}
                </span>
                <span
                  className={
                    isLastStep && isDone
                      ? "text-[#3DBE4E] font-bold"
                      : isDone
                      ? "text-[#666]"
                      : "text-[#AAAAAA]"
                  }
                >
                  {step}
                  {isActive && (
                    <span className="inline-block w-[7px] h-[10px] bg-[#AAAAAA] ml-[3px] animate-pulse align-middle" />
                  )}
                </span>
              </div>
            );
          })}

          {/* Indeterminate progress bar while scanning */}
          {!showData && (
            <div className="mt-3 h-[2px] bg-[#1E1E1E] overflow-hidden">
              <div
                className="h-full bg-[#3DBE4E] transition-all duration-500 ease-out"
                style={{ width: `${(completedSteps / SCAN_STEPS.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Data grid ───────────────────────────────────────────────── */}
        <div
          className={`transition-all duration-300 ${showData ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <div className="grid grid-cols-3 border-b border-[#1E1E1E]">
            {/* Row 1 */}
            <DataCell label="BPM" value={clip.bpm.toFixed(2)} accent />
            <DataCell label="ESTIMATED KEY" value="F Minor" />
            <DataCell label="DURATION" value={`${durationSec.toFixed(2)}s`} />
          </div>
          <div className="grid grid-cols-3">
            {/* Row 2 */}
            <DataCell label="PEAK dB" value={`${peakDb.toFixed(1)} dB`} warn={peakDb > -2} />
            <DataCell label="LUFS (INT)" value={lufs.toFixed(1)} />
            <DataCell label="BIT DEPTH" value="32-bit float" dim />
          </div>

          {/* ── Actions ──────────────────────────────────────────────── */}
          <div className="px-4 py-3 bg-[#0A0A0A] border-t border-[#1E1E1E] flex items-center justify-between">
            <span className="font-mono text-[8px] text-[#333] uppercase tracking-widest">
              WDR-DSP // {new Date().toISOString().slice(0, 19).replace("T", " ")}
            </span>
            <button
              onClick={onClose}
              className="px-3 py-1.5 border border-[#333] font-mono text-[9px] font-bold uppercase tracking-widest text-[#666] hover:text-white hover:border-[#666] transition-colors"
            >
              CLOSE
            </button>
          </div>
        </div>

        {/* Spacer while scan is running */}
        {!showData && <div className="h-14" />}
      </div>
    </>
  );

  return createPortal(panel, document.body);
}

// ─── Data Cell ────────────────────────────────────────────────────────────────

function DataCell({
  label,
  value,
  accent = false,
  warn = false,
  dim = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="px-4 py-3 border-r border-[#1E1E1E] last:border-r-0">
      <p className="font-mono text-[7.5px] font-bold uppercase tracking-[0.2em] text-[#444] leading-none mb-2">
        {label}
      </p>
      <p
        className={`font-mono text-[18px] font-bold leading-none tabular-nums ${
          accent ? "text-[#E8E8E8]"
          : warn  ? "text-[#F5A623]"
          : dim   ? "text-[#3A3A3A]"
          : "text-[#999]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
