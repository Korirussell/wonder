"use client";

import { useRef, useState, useCallback } from "react";
import {
  Play,
  Square,
  Circle,
  SkipBack,
  RefreshCw,
  Grid3x3,
  Wand2,
} from "lucide-react";
import { SessionState } from "@/types";
import ArrangementTrackRow, {
  BAR_PX,
  LABEL_WIDTH,
  ROW_HEIGHT,
  BEATS_PER_BAR,
} from "./ArrangementTrackRow";

const TOTAL_BARS = 32;

interface Props {
  session: SessionState;
  onCommand: (cmd: string, params?: Record<string, unknown>) => Promise<unknown> | void;
}

export default function ArrangementView({ session, onCommand }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clipPositions, setClipPositions] = useState<Record<string, number>>({});
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
    <div className="flex flex-col h-full overflow-hidden bg-[#F5F5F2] relative">
      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar relative"
      >
        <div style={{ width: LABEL_WIDTH + totalWidth }}>
          {/* Ruler */}
          <div className="flex flex-shrink-0 sticky top-0 z-20 bg-[#EFEFEC] border-b border-[#D8D8D8]">
            {/* Label corner */}
            <div
              className="flex-shrink-0 border-r border-[#D8D8D8] bg-[#F0F0ED] flex items-end pb-1 px-3"
              style={{ width: LABEL_WIDTH, height: 26 }}
            >
              <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-[#aaa]">
                {session.tracks.length} tracks
              </span>
            </div>

            {/* Bar numbers */}
            <div className="flex" style={{ width: totalWidth }}>
              {Array.from({ length: TOTAL_BARS }).map((_, bar) => (
                <div
                  key={bar}
                  className="flex-shrink-0 flex items-center"
                  style={{
                    width: BAR_PX,
                    height: 26,
                    borderLeft:
                      bar % 4 === 0
                        ? "1px solid rgba(45,45,45,0.18)"
                        : "1px solid rgba(45,45,45,0.06)",
                  }}
                >
                  {bar % 4 === 0 && (
                    <span className="font-mono text-[9px] font-bold text-[#999] pl-2">
                      {bar + 1}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Track rows + playhead */}
          <div className="relative">
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-[#D32F2F] z-10 pointer-events-none"
              style={{
                left: LABEL_WIDTH,
                animationName: session.isPlaying ? "playhead-advance" : "none",
                animationDuration: `${playheadDurationSec}s`,
                animationTimingFunction: "linear",
                animationFillMode: "forwards",
              }}
            />

            {/* Snap guide */}
            {snapBarPx !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-[#2D2D2D]/30 z-20 pointer-events-none"
                style={{ left: LABEL_WIDTH + snapBarPx }}
              />
            )}

            {/* Empty state */}
            {session.tracks.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center gap-3 opacity-30"
                style={{ height: ROW_HEIGHT * 4 }}
              >
                <div className="w-10 h-10 border-2 border-dashed border-[#2D2D2D] rounded-xl flex items-center justify-center">
                  <Play size={16} strokeWidth={2} />
                </div>
                <p className="font-mono text-xs text-[#2D2D2D]">
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
          </div>
        </div>
      </div>

      {/* Floating transport pill */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-3 bg-[#1A1A1A] rounded-full px-5 py-3 shadow-2xl">
          {/* Rewind */}
          <button
            className="text-white/60 hover:text-white transition-colors"
            onClick={() => onCommand("stop_playback")}
            title="Return to start"
          >
            <SkipBack size={16} strokeWidth={1.5} />
          </button>

          {/* Play */}
          <button
            onClick={handlePlayStop}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              session.isPlaying
                ? "bg-[#4CAF50] hover:bg-[#3d9940]"
                : "bg-[#4CAF50] hover:bg-[#3d9940]"
            }`}
            title={session.isPlaying ? "Stop" : "Play"}
          >
            {session.isPlaying ? (
              <Square size={14} strokeWidth={2.5} fill="white" color="white" />
            ) : (
              <Play size={14} strokeWidth={2.5} fill="white" color="white" />
            )}
          </button>

          {/* Stop */}
          <button
            onClick={() => onCommand("stop_playback")}
            className="text-white/60 hover:text-white transition-colors"
            title="Stop"
          >
            <Square size={14} strokeWidth={1.5} />
          </button>

          {/* Record */}
          <button
            className="w-6 h-6 rounded-full bg-[#E06030] flex items-center justify-center hover:bg-[#c04820] transition-colors"
            title="Record"
          >
            <Circle size={8} fill="white" strokeWidth={0} />
          </button>

          {/* Divider */}
          <div className="w-px h-5 bg-white/15" />

          {/* Position / Length */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[7.5px] font-mono font-bold uppercase tracking-widest text-white/35 leading-none mb-0.5">
                POSITION
              </span>
              <span className="text-[12px] font-mono font-bold text-white leading-none tracking-wide">
                {session.isPlaying ? "01.01.001" : "01.01.001"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[7.5px] font-mono font-bold uppercase tracking-widest text-white/35 leading-none mb-0.5">
                LENGTH
              </span>
              <span className="text-[12px] font-mono font-bold text-white leading-none tracking-wide">
                00:00:00
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-5 bg-white/15" />

          {/* Loop / Grid / Wand */}
          <div className="flex items-center gap-2.5">
            <button className="text-white/40 hover:text-white transition-colors" title="Loop">
              <RefreshCw size={14} strokeWidth={1.5} />
            </button>
            <button className="text-white/40 hover:text-white transition-colors" title="Grid">
              <Grid3x3 size={14} strokeWidth={1.5} />
            </button>
            <button className="text-white/80 hover:text-white transition-colors" title="AI Wand">
              <Wand2 size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Mixer view hint */}
      <div className="absolute bottom-4 right-5 z-20 pointer-events-none">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#2D2D2D]/25">
          MIXER VIEW (F3)
        </span>
      </div>

      <style>{`
        @keyframes playhead-advance {
          from { transform: translateX(0px); }
          to   { transform: translateX(${totalWidth}px); }
        }
      `}</style>
    </div>
  );
}
