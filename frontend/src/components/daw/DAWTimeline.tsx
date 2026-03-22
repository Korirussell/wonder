"use client";

import { useEffect, useRef, useState } from "react";
import type { DAWTransport, DAWTrack, DAWBlock } from "@/types";
import { Waveform } from "@/components/Waveform";

const TRACK_ROW_HEIGHT = 72; // px per track row
const HEADER_HEIGHT = 40; // px for the time-ruler header

interface DAWTimelineProps {
  transport: DAWTransport;
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  selectedBlockId: string | null;
  onSeek: (measure: number) => void;
  onUpdateBlock: (id: string, patch: Partial<DAWBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onSelectBlock: (id: string | null) => void;
}

// ─── Time Ruler ───────────────────────────────────────────────────────────────

function TimeRuler({ totalMeasures }: { totalMeasures: number }) {
  const START = 1;
  const span = Math.max(1, totalMeasures - START);
  const markers: React.ReactNode[] = [];

  for (let j = 0; j <= span; j += 4) {
    const measure = START + j;
    const isMajor = measure % 16 === 0;
    markers.push(
      <div
        key={measure}
        className="absolute top-0 bottom-0 flex flex-col items-start pointer-events-none"
        style={{ left: `${(j / span) * 100}%` }}
      >
        <div
          className={`w-px ${isMajor ? "h-full bg-[#2D2D2D]/40" : "h-3 bg-[#2D2D2D]/20"}`}
        />
        <span
          className={`font-mono text-[9px] mt-0.5 ml-0.5 ${
            isMajor ? "text-[#2D2D2D] font-bold opacity-70" : "text-[#2D2D2D] opacity-40"
          }`}
        >
          {measure}
        </span>
      </div>
    );
  }
  return <>{markers}</>;
}

// ─── DAWTimeline ──────────────────────────────────────────────────────────────

export function DAWTimeline({
  transport,
  tracks,
  blocks,
  selectedBlockId,
  onSeek,
  onUpdateBlock,
  onDeleteBlock,
  onSelectBlock,
}: DAWTimelineProps) {
  const { currentMeasure, totalMeasures } = transport;
  const START = 1;
  const span = Math.max(1, totalMeasures - START);

  const timelineRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Selection rect for visual shift+click selection
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const playheadPct = ((currentMeasure - START) / span) * 100;

  // ─── Delete selected block on keydown ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedBlockId) {
        onDeleteBlock(selectedBlockId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBlockId, onDeleteBlock]);

  // ─── Ruler click → seek ────────────────────────────────────────────────────
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const raw = START + (x / rect.width) * span;
    const snapped = Math.max(START, Math.min(Math.round(raw * 4) / 4, totalMeasures));
    onSeek(snapped);
  };

  // ─── Timeline click → seek / deselect ─────────────────────────────────────
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore if clicking on a block (blocks stop propagation)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const raw = START + (x / rect.width) * span;
    const snapped = Math.max(START, Math.min(Math.round(raw * 4) / 4, totalMeasures));
    onSeek(snapped);
    onSelectBlock(null);
  };

  // ─── Selection (shift+drag) ────────────────────────────────────────────────
  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.shiftKey || (e.target as HTMLElement).draggable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });
    setIsSelecting(true);
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelecting || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setSelectionEnd({ x, y });
  };

  const handleSelectionMouseUp = () => {
    setIsSelecting(false);
  };

  // ─── Block drag-and-drop ───────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData("text/plain");
    const rect = e.currentTarget.getBoundingClientRect();
    let x = e.clientX - rect.left;

    if (dragOffsetRef.current) {
      x -= dragOffsetRef.current.x;
    }

    const raw = START + (x / rect.width) * span;
    const snapped = Math.max(START, Math.min(Math.round(raw * 4) / 4, totalMeasures));

    onUpdateBlock(blockId, { startMeasure: snapped });
    dragOffsetRef.current = null;
  };

  // ─── Compute track index for a block ──────────────────────────────────────
  const trackIndex = (block: DAWBlock) =>
    tracks.findIndex((t) => t.id === block.trackId);

  const gridHeight = Math.max(tracks.length, 4) * TRACK_ROW_HEIGHT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#FDFDFB]">
      {/* Time ruler */}
      <div
        className="relative shrink-0 bg-[#EFEFEC] border-b-2 border-[#2D2D2D]/20 cursor-pointer select-none"
        style={{ height: HEADER_HEIGHT }}
        onClick={handleRulerClick}
      >
        <TimeRuler totalMeasures={totalMeasures} />
        {/* Playhead marker in ruler */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-[#D32F2F] z-10 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        >
          <div className="absolute -top-0 -left-[5px] w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#D32F2F]" />
        </div>
      </div>

      {/* Scrollable track area */}
      <div className="flex-1 overflow-auto">
        <div
          ref={timelineRef}
          className="relative cursor-crosshair"
          style={{ height: gridHeight, minWidth: "100%" }}
          onClick={handleTimelineClick}
          onMouseDown={handleSelectionMouseDown}
          onMouseMove={handleSelectionMouseMove}
          onMouseUp={handleSelectionMouseUp}
          onMouseLeave={handleSelectionMouseUp}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleDrop}
        >
          {/* ── Vertical grid lines ─────────────────────────────────────────── */}
          {Array.from({ length: span + 1 }, (_, j) => {
            const measure = START + j;
            const isMajor = measure % 16 === 0;
            const isMinor = measure % 4 === 0;
            return (
              <div
                key={`vgrid-${j}`}
                className={`absolute top-0 bottom-0 pointer-events-none ${
                  isMajor
                    ? "border-l-2 border-[#2D2D2D]/20"
                    : isMinor
                    ? "border-l border-[#2D2D2D]/15"
                    : "border-l border-[#2D2D2D]/8"
                }`}
                style={{ left: `${(j / span) * 100}%` }}
              />
            );
          })}

          {/* ── Horizontal track row separators ────────────────────────────── */}
          {Array.from({ length: Math.max(tracks.length, 4) }, (_, i) => (
            <div
              key={`hgrid-${i}`}
              className="absolute left-0 right-0 border-t border-[#2D2D2D]/10 pointer-events-none"
              style={{ top: i * TRACK_ROW_HEIGHT }}
            />
          ))}

          {/* ── Playhead line ───────────────────────────────────────────────── */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#D32F2F] z-50 pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          />

          {/* ── Selection rectangle ─────────────────────────────────────────── */}
          {selectionStart && selectionEnd && (
            <div
              className="absolute bg-[#2D2D2D]/10 border border-[#2D2D2D]/30 z-20 pointer-events-none"
              style={{
                left: Math.min(selectionStart.x, selectionEnd.x),
                top: Math.min(selectionStart.y, selectionEnd.y),
                width: Math.abs(selectionEnd.x - selectionStart.x),
                height: Math.abs(selectionEnd.y - selectionStart.y),
              }}
            />
          )}

          {/* ── Blocks ──────────────────────────────────────────────────────── */}
          {blocks.map((block) => {
            const tIdx = trackIndex(block);
            if (tIdx === -1) return null;
            const track = tracks[tIdx];

            const leftPct = ((block.startMeasure - START) / span) * 100;
            const widthPct = (block.durationMeasures / span) * 100;
            const topPx = tIdx * TRACK_ROW_HEIGHT + 4;
            const heightPx = TRACK_ROW_HEIGHT - 8;
            const blockColor = block.color ?? track.color;
            const isSelected = selectedBlockId === block.id;

            return (
              <div
                key={block.id}
                className={`absolute rounded-xl overflow-hidden cursor-move z-10 transition-shadow border-2 ${
                  isSelected
                    ? "border-[#2D2D2D] shadow-[2px_2px_0px_0px_rgba(0,0,0,0.15)]"
                    : "border-[#2D2D2D]/30 hover:border-[#2D2D2D]/60"
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: topPx,
                  height: heightPx,
                  backgroundColor: blockColor,
                  minWidth: 8,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBlock(block.id);
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", block.id);
                  e.dataTransfer.effectAllowed = "move";
                  const blockRect = e.currentTarget.getBoundingClientRect();
                  dragOffsetRef.current = {
                    x: e.clientX - blockRect.left,
                    y: e.clientY - blockRect.top,
                  };
                }}
                onDragEnd={(e) => e.preventDefault()}
              >
                <div className="p-1 h-full flex flex-col justify-center overflow-hidden">
                  {track.audioBlob ? (
                    <Waveform
                      audioBlob={track.audioBlob}
                      width={Math.max(40, Math.floor((block.durationMeasures / totalMeasures) * 800))}
                      height={Math.max(20, heightPx - 16)}
                      color="rgba(255,255,255,0.8)"
                      className="w-full"
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-white/80 truncate px-1 font-bold drop-shadow-sm">
                      {block.name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
