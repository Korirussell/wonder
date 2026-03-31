"use client";

import { useEffect, useRef } from "react";
import { Track, Clip } from "@/types";

export const BAR_PX = 80;
export const BEATS_PER_BAR = 4;
export const ROW_HEIGHT = 72;
export const LABEL_WIDTH = 200;

// Determine clip type by name (audio has file extension, MIDI doesn't)
function isAudioClip(clipName: string): boolean {
  return /\.(wav|aif|aiff|mp3|flac|ogg|m4a)$/i.test(clipName);
}

// Audio clip = sage green, MIDI clip = chartreuse/lime
const AUDIO_CLIP = { bg: "#B8D4B4", border: "#6a9f6a", text: "#1e3820" };
const MIDI_CLIP  = { bg: "#D4E860", border: "#8a9e20", text: "#2a3008" };

interface Props {
  track: Track;
  trackIndex: number;
  totalBars: number;
  onCommand: (cmd: string, params: Record<string, unknown>) => Promise<unknown> | void;
  clipPositions: Record<string, number>;
  onClipMove: (trackIndex: number, clipIndex: number, newLeft: number) => void;
  snapBarPx: number | null;
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
    dragRef.current = {
      clipIndex: clip.index,
      startMouseX: e.clientX,
      startLeft: currentLeft,
      moved: false,
    };
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

  // Determine if this track is MIDI or audio based on its clips
  const trackIsAudio = track.clips.some((c) => isAudioClip(c.name));

  // Track number label (1-indexed, zero-padded)
  const trackNum = String(trackIndex + 1).padStart(2, "0");

  return (
    <div className="flex flex-shrink-0 group" style={{ height: ROW_HEIGHT }}>
      {/* Label panel */}
      <div
        className="flex-shrink-0 flex flex-col justify-center px-3 border-r border-b border-[#E0E0E0] bg-[#FAFAFA] group-hover:bg-[#F3F3F1] transition-colors"
        style={{ width: LABEL_WIDTH }}
      >
        {/* Top row: number + name + M/S/A */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-bold text-[#2D2D2D]/40 flex-shrink-0 select-none">
            {trackNum}
          </span>
          <span
            className="font-mono text-[11px] font-bold uppercase tracking-tight truncate flex-1 select-none"
            style={{ opacity: track.mute ? 0.35 : 1 }}
          >
            {track.name}
          </span>
          {/* M / S / A buttons */}
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => onCommand("set_track_mute", { track_index: trackIndex, mute: !track.mute })}
              title="Mute"
              className={`w-5 h-5 rounded text-[9px] font-bold font-mono flex items-center justify-center border transition-colors select-none ${
                track.mute
                  ? "bg-[#4a7ccc] border-[#3060b0] text-white"
                  : "bg-[#E8E8E8] border-[#D0D0D0] text-[#555] hover:bg-[#D8D8D8]"
              }`}
            >
              M
            </button>
            <button
              onClick={() => onCommand("set_track_solo", { track_index: trackIndex, solo: !track.solo })}
              title="Solo"
              className={`w-5 h-5 rounded text-[9px] font-bold font-mono flex items-center justify-center border transition-colors select-none ${
                track.solo
                  ? "bg-[#e0c040] border-[#c0a020] text-[#2D2D2D]"
                  : "bg-[#E8E8E8] border-[#D0D0D0] text-[#555] hover:bg-[#D8D8D8]"
              }`}
            >
              S
            </button>
            <button
              onClick={() => onCommand("set_track_arm", { track_index: trackIndex, armed: !track.armed })}
              title="Arm for recording"
              className={`w-5 h-5 rounded text-[9px] font-bold font-mono flex items-center justify-center border transition-colors select-none ${
                track.armed
                  ? "bg-[#e06830] border-[#c04810] text-white"
                  : "bg-[#E8E8E8] border-[#D0D0D0] text-[#555] hover:bg-[#D8D8D8]"
              }`}
            >
              A
            </button>
          </div>
        </div>

        {/* Bottom row: IN/OUT routing */}
        <div className="flex items-center gap-2 mt-[3px]">
          <span className="font-mono text-[8.5px] text-[#2D2D2D]/35 tracking-wide select-none">
            IN: {trackIsAudio ? "ALL INS" : "MIDI"}&nbsp;&nbsp;OUT: MASTER
          </span>
        </div>
      </div>

      {/* Clip lane */}
      <div
        className="relative border-b border-[#E8E8E8] bg-[#F8F8F6]"
        style={{ width: totalBars * BAR_PX, opacity: track.mute ? 0.4 : 1 }}
      >
        {/* Bar grid */}
        {Array.from({ length: totalBars }).map((_, bar) => (
          <div
            key={bar}
            className="absolute top-0 bottom-0"
            style={{
              left: bar * BAR_PX,
              borderLeft: bar % 4 === 0
                ? "1px solid rgba(45,45,45,0.12)"
                : "1px solid rgba(45,45,45,0.05)",
            }}
          />
        ))}

        {/* Clips */}
        {track.clips.map((clip) => {
          const barsFromStart = (clip.index * clip.length) / BEATS_PER_BAR;
          const clipWidthBars = clip.length / BEATS_PER_BAR;
          const baseLeft = barsFromStart * BAR_PX;
          const key = `${trackIndex}-${clip.index}`;
          const left = clipPositions[key] ?? baseLeft + 1;
          const width = Math.max(clipWidthBars * BAR_PX - 2, 20);
          const color = isAudioClip(clip.name) ? AUDIO_CLIP : MIDI_CLIP;
          const isMidi = !isAudioClip(clip.name);

          return (
            <div
              key={clip.index}
              onMouseDown={(e) => handleClipMouseDown(e, clip, baseLeft + 1)}
              onClick={() => handleClipClick(clip)}
              title={clip.isPlaying ? `Stop "${clip.name}"` : `Fire "${clip.name}"`}
              className="absolute top-[6px] bottom-[6px] rounded-md flex items-center px-2 overflow-hidden cursor-grab active:cursor-grabbing select-none"
              style={{
                left,
                width,
                backgroundColor: color.bg,
                border: `1px solid ${color.border}`,
                boxShadow: clip.isPlaying
                  ? `0 0 0 2px ${color.border}`
                  : undefined,
              }}
            >
              {/* MIDI clip: horizontal lines pattern */}
              {isMidi && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0"
                      style={{
                        top: `${18 + i * 14}%`,
                        height: "2px",
                        backgroundColor: color.border,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Audio clip: waveform bars */}
              {!isMidi && (
                <div className="absolute inset-y-2 left-2 right-16 flex items-center gap-[2px] overflow-hidden pointer-events-none opacity-30">
                  {Array.from({ length: Math.floor(width / 4) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-[2px] rounded-full flex-shrink-0"
                      style={{
                        height: `${25 + ((i * 11 + trackIndex * 7) % 60)}%`,
                        backgroundColor: color.border,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Clip name */}
              <span
                className="relative font-mono text-[9.5px] font-bold truncate z-10 flex items-center gap-1"
                style={{ color: color.text }}
              >
                {clip.name === "MIDNIGHT SYNTH LEAD" && (
                  <span className="opacity-70">✦</span>
                )}
                {clip.isPlaying ? "▶ " : ""}
                {clip.name}
              </span>
            </div>
          );
        })}

        {track.clips.length === 0 && (
          <div className="absolute inset-0 flex items-center pl-4">
            <span className="font-mono text-[9px] text-[#2D2D2D]/20">empty</span>
          </div>
        )}
      </div>
    </div>
  );
}
