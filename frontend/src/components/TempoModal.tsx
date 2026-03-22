"use client";
import { useState, useRef, useCallback } from "react";

interface TempoModalProps {
  initialBpm: number;
  onConfirm: (bpm: number) => void;
  onClose: () => void;
}

export default function TempoModal({ initialBpm, onConfirm, onClose }: TempoModalProps) {
  const [bpm, setBpm] = useState(initialBpm);
  const tapTimesRef = useRef<number[]>([]);
  const tapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback(() => {
    const now = Date.now();
    // Clear taps if more than 3 seconds since last tap
    if (tapTimesRef.current.length > 0 && now - tapTimesRef.current[tapTimesRef.current.length - 1] > 3000) {
      tapTimesRef.current = [];
    }
    tapTimesRef.current.push(now);

    // Need at least 2 taps to compute BPM
    if (tapTimesRef.current.length >= 2) {
      const intervals = tapTimesRef.current.slice(1).map((t, i) => t - tapTimesRef.current[i]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const computedBpm = Math.round(60000 / avgInterval);
      setBpm(Math.min(300, Math.max(20, computedBpm)));
    }

    // Reset after 3s of no taps
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);
    tapResetTimerRef.current = setTimeout(() => {
      tapTimesRef.current = [];
    }, 3000);
  }, []);

  // Clamp BPM on change
  const changeBpm = (val: number) => setBpm(Math.min(300, Math.max(20, Math.round(val))));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow p-8 flex flex-col gap-6 w-80"
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <h2 className="font-headline font-extrabold text-xl uppercase tracking-tight">Set Tempo</h2>

        {/* BPM display + input */}
        <div className="flex items-center gap-3">
          <button onClick={() => changeBpm(bpm - 1)} className="w-10 h-10 border-2 border-[#2D2D2D] rounded-xl font-mono font-bold text-lg interactive-push bg-white">−</button>
          <input
            type="number"
            value={bpm}
            min={20} max={300}
            onChange={e => changeBpm(Number(e.target.value))}
            className="flex-1 text-center font-mono text-3xl font-bold border-2 border-[#2D2D2D] rounded-xl py-2 outline-none focus:border-[#4a664c]"
          />
          <button onClick={() => changeBpm(bpm + 1)} className="w-10 h-10 border-2 border-[#2D2D2D] rounded-xl font-mono font-bold text-lg interactive-push bg-white">+</button>
        </div>
        <span className="text-center font-mono text-xs text-stone-400 -mt-4">BPM</span>

        {/* Tap tempo */}
        <button
          onClick={handleTap}
          className="w-full py-5 bg-[#4a664c] text-white border-2 border-[#2D2D2D] rounded-xl font-headline font-extrabold text-lg uppercase tracking-widest hard-shadow interactive-push"
        >
          TAP
        </button>
        <p className="text-center font-mono text-[10px] text-stone-400 -mt-4">tap to set tempo</p>

        {/* Confirm / Cancel */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-[#2D2D2D] rounded-xl font-mono text-sm font-bold interactive-push bg-white">Cancel</button>
          <button
            onClick={() => { onConfirm(bpm); onClose(); }}
            className="flex-1 py-2.5 bg-[#C1E1C1] border-2 border-[#2D2D2D] rounded-xl font-mono text-sm font-bold interactive-push hard-shadow-sm"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
