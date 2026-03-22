"use client";

import { useEffect, useRef } from "react";
import { Track, Clip } from "@/types";

const TRACK_COLORS = [
  { bg: "#C1E1C1", border: "#4a664c", text: "#2D2D2D", muted: "#a0bfa0" },
  { bg: "#E9D5FF", border: "#7c3aed", text: "#2D2D2D", muted: "#c5a8e8" },
  { bg: "#FEF08A", border: "#a16207", text: "#2D2D2D", muted: "#dfd07a" },
  { bg: "#FECACA", border: "#dc2626", text: "#2D2D2D", muted: "#e0a8a8" },
  { bg: "#BAE6FD", border: "#0284c7", text: "#2D2D2D", muted: "#96c8e0" },
  { bg: "#FED7AA", border: "#ea580c", text: "#2D2D2D", muted: "#e0bb90" },
  { bg: "#D1FAE5", border: "#059669", text: "#2D2D2D", muted: "#a8d8c0" },
  { bg: "#F5D0FE", border: "#a21caf", text: "#2D2D2D", muted: "#d8a8e8" },
];

const BAR_PX = 80;
const BEATS_PER_BAR = 4;
const ROW_HEIGHT = 64;
const LABEL_WIDTH = 180;

interface Props {
  track: Track;
  trackIndex: number;
  totalBars: number;
  onCommand: (cmd: string, params: Record<string, unknown>) => Promise<unknown> | void;
  clipPositions: Record<string, number>;
  onClipMove: (trackIndex: number, clipIndex: number, newLeft: number) => void;
  snapBarPx: number | null; // highlighted snap bar position
  onSnapChange: (barLeft: number | null) => void;
}

export default function ArrangementTrackRow({
  track,
  trackIndex,
  totalBars,
  onCommand,
  clipPositions,
  onClipMove,
  onSnapChange,
}: Props) {
  const color = TRACK_COLORS[trackIndex % TRACK_COLORS.length];

  const dragRef = useRef<{
    clipIndex: number;
    startMouseX: number;
    startLeft: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { clipIndex, startMouseX, startLeft } = dragRef.current;
      const delta = e.clientX - startMouseX;
      if (Math.abs(delta) > 3) dragRef.current.moved = true;
      const newLeft = Math.max(0, startLeft + delta);
      onClipMove(trackIndex, clipIndex, newLeft);
      // Report snap line for visual guide
      const snappedBar = Math.round(newLeft / BAR_PX);
      onSnapChange(snappedBar * BAR_PX);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { clipIndex, startMouseX, startLeft } = dragRef.current;
      const delta = e.clientX - startMouseX;
      const rawLeft = Math.max(0, startLeft + delta);
      const snappedLeft = Math.round(rawLeft / BAR_PX) * BAR_PX;
      onClipMove(trackIndex, clipIndex, snappedLeft);
      onSnapChange(null);
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [trackIndex, onClipMove, onSnapChange]);

  const handleClipMouseDown = (e: React.MouseEvent, clip: Clip, baseLeft: number) => {
    e.preventDefault();
    e.stopPropagation();
    const key = `${trackIndex}-${clip.index}`;
    const currentLeft = clipPositions[key] ?? baseLeft;
    dragRef.current = { clipIndex: clip.index, startMouseX: e.clientX, startLeft: currentLeft, moved: false };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const handleClipClick = (clip: Clip) => {
    if (dragRef.current?.moved) return;
    if (clip.isPlaying) {
      onCommand("stop_clip", { track_index: trackIndex, clip_index: clip.index });
    } else {
      onCommand("fire_clip", { track_index: trackIndex, clip_index: clip.index });
    }
  };

  const handleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCommand("set_track_mute", { track_index: trackIndex, mute: !track.mute });
  };

  return (
    <div
      className="flex flex-shrink-0 group"
      style={{ height: ROW_HEIGHT }}
    >
      {/* Label */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 border-r-2 border-b border-[#2D2D2D] bg-stone-50 group-hover:bg-stone-100 transition-colors"
        style={{ width: LABEL_WIDTH }}
      >
        {/* Color swatch + mute toggle */}
        <button
          onClick={handleMute}
          title={track.mute ? "Unmute" : "Mute"}
          className="w-3 h-3 rounded-full border border-[#2D2D2D] flex-shrink-0 transition-opacity hover:scale-125"
          style={{ backgroundColor: track.mute ? "#ccc" : color.bg }}
        />
        <div className="flex flex-col min-w-0 flex-1">
          <span
            className="font-headline font-extrabold text-[11px] uppercase tracking-tight truncate leading-tight"
            style={{ opacity: track.mute ? 0.4 : 1 }}
          >
            {track.name}
          </span>
          {track.devices.length > 0 && (
            <span className="font-mono text-[9px] text-stone-400 truncate">
              {track.devices.slice(0, 2).join(" · ")}
            </span>
          )}
        </div>
        {/* Clip count badge */}
        {track.clips.length > 0 && (
          <span className="font-mono text-[9px] font-bold text-stone-400 flex-shrink-0">
            {track.clips.length}
          </span>
        )}
      </div>

      {/* Clip lane */}
      <div
        className="relative border-b border-[#2D2D2D]/15 bg-[#FDFDFB]"
        style={{ width: totalBars * BAR_PX, opacity: track.mute ? 0.45 : 1 }}
      >
        {/* Bar grid lines */}
        {Array.from({ length: totalBars }).map((_, bar) => (
          <div
            key={bar}
            className={`absolute top-0 bottom-0 ${bar % 4 === 0 ? "border-l border-[#2D2D2D]/20" : "border-l border-[#2D2D2D]/6"}`}
            style={{ left: bar * BAR_PX }}
          />
        ))}

        {/* Clip blocks */}
        {track.clips.map((clip) => {
          const barsFromStart = (clip.index * clip.length) / BEATS_PER_BAR;
          const clipWidthBars = clip.length / BEATS_PER_BAR;
          const baseLeft = barsFromStart * BAR_PX;
          const key = `${trackIndex}-${clip.index}`;
          const left = clipPositions[key] ?? baseLeft + 2;
          const width = Math.max(clipWidthBars * BAR_PX - 4, 20);

          return (
            <div
              key={clip.index}
              onMouseDown={(e) => handleClipMouseDown(e, clip, baseLeft + 2)}
              onClick={() => handleClipClick(clip)}
              title={clip.isPlaying ? `Stop "${clip.name}"` : `Fire "${clip.name}"`}
              className="absolute top-2 bottom-2 rounded-lg border-2 border-[#2D2D2D] flex items-center px-2 overflow-hidden cursor-grab active:cursor-grabbing select-none transition-[box-shadow,filter]"
              style={{
                left,
                width,
                backgroundColor: color.bg,
                boxShadow: clip.isPlaying
                  ? `0 0 0 2px ${color.border}, 2px 2px 0 0 #2D2D2D`
                  : "2px 2px 0 0 #2D2D2D",
                filter: clip.isPlaying ? "brightness(1.05)" : undefined,
              }}
            >
              {clip.isPlaying && (
                <span
                  className="absolute inset-0 rounded-lg animate-ping opacity-20"
                  style={{ backgroundColor: color.border }}
                />
              )}
              {/* Waveform decoration lines */}
              <div className="absolute inset-y-2 left-2 right-8 flex items-center gap-[2px] overflow-hidden pointer-events-none opacity-25">
                {Array.from({ length: Math.floor(width / 5) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[2px] rounded-full flex-shrink-0"
                    style={{
                      height: `${30 + ((i * 7 + trackIndex * 3) % 55)}%`,
                      backgroundColor: color.border,
                    }}
                  />
                ))}
              </div>
              <span className="relative font-mono text-[10px] font-bold truncate z-10" style={{ color: color.text }}>
                {clip.isPlaying ? "▶ " : ""}{clip.name}
              </span>
            </div>
          );
        })}

        {/* Empty lane hint */}
        {track.clips.length === 0 && (
          <div className="absolute inset-0 flex items-center pl-4">
            <span className="font-mono text-[9px] text-stone-300">empty</span>
          </div>
        )}
      </div>
    </div>
  );
}

export { BAR_PX, LABEL_WIDTH, ROW_HEIGHT, BEATS_PER_BAR };
