"use client";

import { Track } from "@/types";
import DevicePill from "./DevicePill";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TrackColumnProps {
  track: Track;
  index: number;
  onUpdate: (id: number, patch: Partial<Track>) => void;
}

export default function TrackColumn({ track, index, onUpdate }: TrackColumnProps) {
  const faderTop = `${Math.round((1 - track.volume) * 70)}%`;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex-1 min-w-[200px] self-stretch bg-white border-2 border-[#2D2D2D] rounded-2xl hard-shadow flex flex-col overflow-hidden"
    >
      {/* Header — drag handle */}
      <div
        {...listeners}
        className="p-4 border-b-2 border-[#2D2D2D] bg-stone-50 flex justify-between items-center cursor-grab active:cursor-grabbing"
      >
        <div>
          <span className="font-mono text-[10px] font-bold text-stone-400 block">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="font-headline font-extrabold text-sm uppercase tracking-tight">
            {track.name}
          </h3>
        </div>
        <div
          className={`w-2 h-2 rounded-full border border-[#2D2D2D] ${
            track.armed
              ? "bg-[#fa7150] animate-pulse"
              : track.solo
              ? "bg-[#C1E1C1]"
              : "bg-[#4a664c]"
          }`}
        />
      </div>

      {/* Controls */}
      <div className="flex-1 p-5 flex flex-col items-center gap-6">
        {/* M S A buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate(track.id, { mute: !track.mute })}
            className={`w-9 h-9 border-2 border-[#2D2D2D] rounded-lg flex items-center justify-center font-mono text-xs font-bold interactive-push ${
              track.mute ? "bg-[#FEF08A]" : "bg-white"
            }`}
          >
            M
          </button>
          <button
            onClick={() => onUpdate(track.id, { solo: !track.solo })}
            className={`w-9 h-9 border-2 border-[#2D2D2D] rounded-lg flex items-center justify-center font-mono text-xs font-bold interactive-push ${
              track.solo ? "bg-[#C1E1C1] hard-shadow-sm" : "bg-white"
            }`}
          >
            S
          </button>
          <button
            onClick={() => onUpdate(track.id, { armed: !track.armed })}
            className={`w-9 h-9 border-2 rounded-lg flex items-center justify-center font-mono text-xs font-bold interactive-push ${
              track.armed
                ? "bg-[#fa7150]/20 border-[#fa7150] border-dashed text-[#aa371c]"
                : "bg-white border-[#2D2D2D]"
            }`}
          >
            A
          </button>
        </div>

        {/* Volume fader */}
        <div className="flex-1 w-full flex justify-center py-4">
          <div className="relative w-2.5 h-full bg-stone-100 border-2 border-[#2D2D2D] rounded-full">
            <div
              className="absolute left-1/2 -translate-x-1/2 w-10 h-5 fader-thumb border-2 border-[#2D2D2D] rounded-md hard-shadow-sm cursor-ns-resize flex flex-col items-center justify-center gap-0.5"
              style={{ top: faderTop }}
            >
              <div className="w-6 h-px bg-[#2D2D2D]/20" />
              <div className="w-6 h-px bg-[#2D2D2D]/20" />
            </div>
            {/* Volume readout */}
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-stone-400 whitespace-nowrap">
              {Math.round(track.volume * 100)}
            </span>
          </div>
        </div>
      </div>

      {/* Device rack */}
      <div className="p-3 bg-stone-50 border-t-2 border-[#2D2D2D] flex flex-wrap gap-1.5 min-h-[44px]">
        {track.devices.length === 0 ? (
          <span className="text-[9px] font-mono text-stone-300 italic">no devices</span>
        ) : (
          track.devices.map((d) => <DevicePill key={d} name={d} />)
        )}
      </div>
    </article>
  );
}
