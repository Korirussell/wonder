"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const SCALES: Record<string, number[]> = {
  "Major":            [0, 2, 4, 5, 7, 9, 11],
  "Minor":            [0, 2, 3, 5, 7, 8, 10],
  "Dorian":           [0, 2, 3, 5, 7, 9, 10],
  "Phrygian":         [0, 1, 3, 5, 7, 8, 10],
  "Lydian":           [0, 2, 4, 6, 7, 9, 11],
  "Mixolydian":       [0, 2, 4, 5, 7, 9, 10],
  "Locrian":          [0, 1, 3, 5, 6, 8, 10],
  "Harmonic Minor":   [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor":    [0, 2, 3, 5, 7, 9, 11],
  "Pentatonic Major": [0, 2, 4, 7, 9],
  "Pentatonic Minor": [0, 3, 5, 7, 10],
  "Blues":            [0, 3, 5, 6, 7, 10],
};

const SCALE_NAMES = Object.keys(SCALES);

// Two octaves of white keys: C D E F G A B C D E F G A B
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const NUM_WHITE = 14;
const WHITE_W = 100 / NUM_WHITE; // % of total width per white key
const BLACK_W = WHITE_W * 0.65;

const BLACK_KEY_DEFS = [
  { semitone: 1,  afterWhite: 0 },
  { semitone: 3,  afterWhite: 1 },
  { semitone: 6,  afterWhite: 3 },
  { semitone: 8,  afterWhite: 4 },
  { semitone: 10, afterWhite: 5 },
  { semitone: 1,  afterWhite: 7 },
  { semitone: 3,  afterWhite: 8 },
  { semitone: 6,  afterWhite: 10 },
  { semitone: 8,  afterWhite: 11 },
  { semitone: 10, afterWhite: 12 },
];

function parseKey(key: string): { root: string; scale: string } {
  for (const note of NOTES) {
    if (key.startsWith(note + " ")) {
      const scale = key.slice(note.length + 1);
      if (SCALES[scale]) return { root: note, scale };
    }
  }
  return { root: "C", scale: "Major" };
}

interface ScaleModalProps {
  initialKey: string;
  onConfirm: (key: string) => void;
  onClose: () => void;
}

export default function ScaleModal({ initialKey, onConfirm, onClose }: ScaleModalProps) {
  const parsed = parseKey(initialKey);
  const [root, setRoot] = useState(parsed.root);
  const [scaleIdx, setScaleIdx] = useState(
    Math.max(0, SCALE_NAMES.indexOf(parsed.scale))
  );

  const scaleName = SCALE_NAMES[scaleIdx];
  const intervals = new Set(SCALES[scaleName]);
  const rootSemitone = NOTES.indexOf(root);

  const prevScale = () => setScaleIdx((i) => (i - 1 + SCALE_NAMES.length) % SCALE_NAMES.length);
  const nextScale = () => setScaleIdx((i) => (i + 1) % SCALE_NAMES.length);

  // Is a given absolute semitone (0–27 across 2 octaves) active or root?
  const isActive = (semitone: number) => intervals.has((semitone - rootSemitone + 12 * 10) % 12);
  const isRoot = (semitone: number) => (semitone - rootSemitone + 12 * 10) % 12 === 0;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow p-8 flex flex-col gap-6 w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-headline font-extrabold text-xl uppercase tracking-tight">Set Scale</h2>

        {/* Root note selector */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-400">Root Note</span>
          <div className="flex gap-1.5 flex-wrap">
            {NOTES.map((note) => (
              <button
                key={note}
                onClick={() => setRoot(note)}
                className={`flex-1 min-w-[30px] h-9 border-2 rounded-lg font-mono text-xs font-bold transition-colors interactive-push ${
                  note === root
                    ? "bg-[#4a664c] text-white border-[#4a664c]"
                    : note.includes("#")
                    ? "bg-stone-100 border-[#2D2D2D]/40 text-stone-500 hover:bg-stone-200"
                    : "bg-white border-[#2D2D2D] hover:bg-stone-50"
                }`}
              >
                {note}
              </button>
            ))}
          </div>
        </div>

        {/* Scale type selector */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-400">Scale Type</span>
          <div className="flex items-center gap-3">
            <button
              onClick={prevScale}
              className="w-9 h-9 flex items-center justify-center border-2 border-[#2D2D2D] rounded-xl bg-white interactive-push hover:bg-stone-50 flex-shrink-0"
            >
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <div className="flex-1 text-center">
              <span className="font-headline font-extrabold text-lg uppercase tracking-tight">
                {scaleName}
              </span>
              <span className="block font-mono text-[9px] text-stone-400 mt-0.5">
                {scaleIdx + 1} / {SCALE_NAMES.length}
              </span>
            </div>
            <button
              onClick={nextScale}
              className="w-9 h-9 flex items-center justify-center border-2 border-[#2D2D2D] rounded-xl bg-white interactive-push hover:bg-stone-50 flex-shrink-0"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Mini piano */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-400">
            {root} {scaleName}
          </span>
          <div className="relative h-20 w-full select-none" style={{ userSelect: "none" }}>
            {/* White keys */}
            <div className="absolute inset-0 flex">
              {Array.from({ length: NUM_WHITE }, (_, i) => {
                const semitone = i * 12 / 7 | 0; // approximate — use WHITE_SEMITONES
                const absoluteSemitone = Math.floor(i / 7) * 12 + WHITE_SEMITONES[i % 7];
                const active = isActive(absoluteSemitone);
                const root_ = isRoot(absoluteSemitone);
                return (
                  <div
                    key={i}
                    className={`flex-1 border border-[#2D2D2D]/30 rounded-b-md flex items-end justify-center pb-1 transition-colors ${
                      root_ ? "bg-[#4a664c]" : active ? "bg-[#C1E1C1]" : "bg-white"
                    }`}
                    style={{ borderRight: i < NUM_WHITE - 1 ? "1px solid rgba(45,45,45,0.2)" : undefined }}
                  >
                    {root_ && (
                      <span className="font-mono text-[8px] font-bold text-white">{root}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Black keys */}
            {BLACK_KEY_DEFS.map((bk, i) => {
              const absoluteSemitone = Math.floor(bk.afterWhite / 7) * 12 + bk.semitone;
              const active = isActive(absoluteSemitone);
              const root_ = isRoot(absoluteSemitone);
              const leftPct = (bk.afterWhite + 1) * WHITE_W - BLACK_W / 2;
              return (
                <div
                  key={i}
                  className={`absolute top-0 rounded-b-sm z-10 border border-[#2D2D2D]/60 transition-colors ${
                    root_ ? "bg-[#2D2D2D]" : active ? "bg-[#4a664c]" : "bg-[#2D2D2D]"
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${BLACK_W}%`,
                    height: "60%",
                    opacity: active || root_ ? 1 : 0.85,
                  }}
                />
              );
            })}

            {/* Octave divider */}
            <div
              className="absolute top-0 bottom-0 w-px bg-[#2D2D2D]/30 z-20"
              style={{ left: "50%" }}
            />
          </div>

          {/* Scale degree labels */}
          <div className="flex gap-1 flex-wrap">
            {SCALES[scaleName].map((interval, i) => {
              const note = NOTES[(rootSemitone + interval) % 12];
              return (
                <span
                  key={i}
                  className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border ${
                    interval === 0
                      ? "bg-[#4a664c] text-white border-[#4a664c]"
                      : "bg-stone-100 border-[#2D2D2D]/20 text-stone-600"
                  }`}
                >
                  {note}
                </span>
              );
            })}
          </div>
        </div>

        {/* Confirm / Cancel */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border-2 border-[#2D2D2D] rounded-xl font-mono text-sm font-bold interactive-push bg-white"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(`${root} ${scaleName}`); onClose(); }}
            className="flex-1 py-2.5 bg-[#C1E1C1] border-2 border-[#2D2D2D] rounded-xl font-mono text-sm font-bold interactive-push hard-shadow-sm"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
