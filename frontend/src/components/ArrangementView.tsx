"use client";

import { useRef, useState, useCallback } from "react";
import { Play, Square } from "lucide-react";
import { SessionState } from "@/types";
import ArrangementTrackRow, { BAR_PX, LABEL_WIDTH, ROW_HEIGHT, BEATS_PER_BAR } from "./ArrangementTrackRow";

const TOTAL_BARS = 32;

interface Props {
  session: SessionState;
  onCommand: (cmd: string, params?: Record<string, unknown>) => Promise<unknown> | void;
}

export default function ArrangementView({ session, onCommand }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clipPositions, setClipPositions] = useState<Record<string, number>>({});
  // snapBarPx: left offset of the snap guide shown while dragging
  const [snapBarPx, setSnapBarPx] = useState<number | null>(null);

  const totalWidth = TOTAL_BARS * BAR_PX;
  const playheadDurationSec = (TOTAL_BARS * BEATS_PER_BAR * 60) / session.bpm;

  const handlePlayStop = async () => {
    if (session.isPlaying) {
      await onCommand("stop_playback");
    } else {
      await Promise.all(
        session.tracks.map((track, i) => {
          const slot0 = track.clips.find((c) => c.index === 0);
          if (slot0) return onCommand("fire_clip", { track_index: i, clip_index: 0 });
          return Promise.resolve();
        })
      );
      await onCommand("start_playback");
    }
  };

  const handleClipMove = useCallback(
    (trackIndex: number, clipIndex: number, newLeft: number) => {
      const key = `${trackIndex}-${clipIndex}`;
      setClipPositions((prev) => ({ ...prev, [key]: newLeft }));
    },
    []
  );

  const handleSnapChange = useCallback((barLeft: number | null) => {
    setSnapBarPx(barLeft);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#FAFAF8]">
      {/* Transport row */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b-2 border-[#2D2D2D]/10 flex-shrink-0 bg-white/60">
        <button
          onClick={handlePlayStop}
          className="w-8 h-8 bg-white border-2 border-[#2D2D2D] rounded-lg flex items-center justify-center hard-shadow-sm interactive-push"
        >
          {session.isPlaying ? (
            <Square size={14} strokeWidth={2.5} />
          ) : (
            <Play size={14} strokeWidth={2.5} fill="#2D2D2D" />
          )}
        </button>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full border border-[#2D2D2D] ${session.isPlaying ? "bg-[#4a664c] animate-pulse" : "bg-stone-300"}`}
          />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest opacity-50">
            {session.isPlaying ? "Playing" : "Stopped"}
          </span>
        </div>
        <span className="font-mono text-[10px] opacity-25 ml-auto">
          {TOTAL_BARS} bars · drag clips · click to fire · mute = color dot
        </span>
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative">
        <div style={{ width: LABEL_WIDTH + totalWidth }}>
          {/* Ruler */}
          <div className="flex flex-shrink-0 sticky top-0 z-20 bg-[#F5F5F2] border-b-2 border-[#2D2D2D]">
            <div
              className="flex-shrink-0 border-r-2 border-[#2D2D2D] bg-stone-100 flex items-end pb-1 px-3"
              style={{ width: LABEL_WIDTH, height: 28 }}
            >
              <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-stone-400">
                {session.tracks.length} tracks
              </span>
            </div>
            <div className="flex" style={{ width: totalWidth }}>
              {Array.from({ length: TOTAL_BARS }).map((_, bar) => (
                <div
                  key={bar}
                  className={`flex-shrink-0 flex items-center ${bar % 4 === 0 ? "border-l-2 border-[#2D2D2D]/30" : "border-l border-[#2D2D2D]/10"}`}
                  style={{ width: BAR_PX, height: 28 }}
                >
                  {bar % 4 === 0 && (
                    <span className="font-mono text-[9px] font-bold text-stone-500 pl-2">
                      {bar + 1}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Track rows + playhead container */}
          <div className="relative">
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[#fa7150] z-10 pointer-events-none"
              style={{
                left: LABEL_WIDTH,
                animationName: session.isPlaying ? "playhead-advance" : "none",
                animationDuration: `${playheadDurationSec}s`,
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
                transform: session.isPlaying ? undefined : "translateX(0px)",
              }}
            />

            {/* Drag snap guide */}
            {snapBarPx !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-[#2D2D2D]/40 z-20 pointer-events-none"
                style={{ left: LABEL_WIDTH + snapBarPx }}
              />
            )}

            {/* Track rows */}
            {session.tracks.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-2 opacity-40"
                style={{ height: ROW_HEIGHT * 4 }}
              >
                <div className="w-8 h-8 border-2 border-dashed border-[#2D2D2D] rounded-lg flex items-center justify-center">
                  <Play size={14} strokeWidth={2} />
                </div>
                <p className="font-mono text-xs text-stone-400">
                  No tracks — ask Wonder to build something
                </p>
              </div>
            ) : (
              session.tracks.map((track, i) => (
                <ArrangementTrackRow
                  key={track.id}
                  track={track}
                  trackIndex={i}
                  totalBars={TOTAL_BARS}
                  onCommand={onCommand}
                  clipPositions={clipPositions}
                  onClipMove={handleClipMove}
                  snapBarPx={snapBarPx}
                  onSnapChange={handleSnapChange}
                />
              ))
            )}

            {/* Bottom ruler repeat for long sessions */}
            {session.tracks.length > 4 && (
              <div className="flex border-t-2 border-[#2D2D2D]/10">
                <div className="flex-shrink-0 bg-stone-100 border-r-2 border-[#2D2D2D]" style={{ width: LABEL_WIDTH, height: 20 }} />
                <div className="flex" style={{ width: totalWidth }}>
                  {Array.from({ length: TOTAL_BARS }).map((_, bar) => (
                    <div
                      key={bar}
                      className={`flex-shrink-0 flex items-center ${bar % 4 === 0 ? "border-l-2 border-[#2D2D2D]/20" : "border-l border-[#2D2D2D]/8"}`}
                      style={{ width: BAR_PX, height: 20 }}
                    >
                      {bar % 8 === 0 && (
                        <span className="font-mono text-[8px] text-stone-400 pl-2">{bar + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Playhead keyframe */}
      <style>{`
        @keyframes playhead-advance {
          from { transform: translateX(0px); }
          to   { transform: translateX(${totalWidth}px); }
        }
      `}</style>
    </div>
  );
}
