"use client";

import { useEffect, useRef, useState } from "react";
import type { DAWTransport, DAWTrack, DAWBlock } from "@/types";
import { Waveform } from "@/components/Waveform";

const TRACK_ROW_HEIGHT = 72;   // must match DAWTrackList
const HEADER_HEIGHT    = 40;
export const PIXELS_PER_SECOND = 50; // global time-to-pixel constant

function secPerMeasure(bpm: number) {
  return (4 * 60) / bpm; // 4/4 time
}

function measureToX(measure: number, bpm: number) {
  return (measure - 1) * secPerMeasure(bpm) * PIXELS_PER_SECOND;
}

function xToMeasure(x: number, bpm: number) {
  return x / (secPerMeasure(bpm) * PIXELS_PER_SECOND) + 1;
}

function snapMeasure(raw: number, totalMeasures: number) {
  return Math.max(1, Math.min(Math.round(raw * 4) / 4, totalMeasures));
}

// ─── Time Ruler ───────────────────────────────────────────────────────────────

function TimeRuler({ totalMeasures, bpm }: { totalMeasures: number; bpm: number }) {
  const spm = secPerMeasure(bpm);
  const markers: React.ReactNode[] = [];

  for (let m = 1; m <= totalMeasures; m++) {
    const x = measureToX(m, bpm);
    const isMajor = (m - 1) % 4 === 0;
    markers.push(
      <div
        key={m}
        className="absolute top-0 bottom-0 flex flex-col items-start pointer-events-none"
        style={{ left: x }}
      >
        <div className={`w-px ${isMajor ? "h-6 bg-[#2D2D2D]/25" : "h-2.5 bg-[#2D2D2D]/12"}`} />
        {isMajor && (
          <span className="font-mono text-[9px] mt-0.5 ml-1 font-bold text-[#2D2D2D]/40 select-none">
            {m}
          </span>
        )}
      </div>,
    );
  }

  // Also mark every second for fine resolution
  const totalSec = totalMeasures * spm;
  for (let s = 0; s <= totalSec; s += 1) {
    const x = s * PIXELS_PER_SECOND;
    markers.push(
      <div
        key={`s-${s}`}
        className="absolute top-0 w-px h-1 bg-[#2D2D2D]/08 pointer-events-none"
        style={{ left: x, bottom: 0 }}
      />,
    );
  }

  return <>{markers}</>;
}

// ─── DAWTimeline ──────────────────────────────────────────────────────────────

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
  const { bpm, currentMeasure, totalMeasures } = transport;

  const totalWidth = totalMeasures * secPerMeasure(bpm) * PIXELS_PER_SECOND;
  const playheadX  = measureToX(currentMeasure, bpm);

  const rulerScrollRef   = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const timelineRef      = useRef<HTMLDivElement>(null);
  const dragOffsetRef    = useRef<number>(0);

  // Keep ruler and content scroll in sync
  const syncScroll = (source: "ruler" | "content") => {
    const ruler   = rulerScrollRef.current;
    const content = contentScrollRef.current;
    if (!ruler || !content) return;
    if (source === "content") ruler.scrollLeft   = content.scrollLeft;
    else                      content.scrollLeft = ruler.scrollLeft;
  };

  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd,   setSelectionEnd]   = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // ─── Delete key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedBlockId) {
        onDeleteBlock(selectedBlockId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBlockId, onDeleteBlock]);

  // ─── Ruler click → seek ──────────────────────────────────────────────────────
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    onSeek(snapMeasure(xToMeasure(x, bpm), totalMeasures));
  };

  // ─── Timeline click → seek / deselect ───────────────────────────────────────
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    onSeek(snapMeasure(xToMeasure(x, bpm), totalMeasures));
    onSelectBlock(null);
  };

  // ─── Shift-drag selection ────────────────────────────────────────────────────
  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !e.shiftKey || (e.target as HTMLElement).draggable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setSelectionStart(pt);
    setSelectionEnd(pt);
    setIsSelecting(true);
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isSelecting || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    setSelectionEnd({
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top,  rect.height)),
    });
  };

  const handleSelectionMouseUp = () => setIsSelecting(false);

  // ─── Block drag-and-drop ─────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const blockId = e.dataTransfer.getData("text/plain");
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left - dragOffsetRef.current;
    onUpdateBlock(blockId, { startMeasure: snapMeasure(xToMeasure(Math.max(0, x), bpm), totalMeasures) });
  };

  const trackIndex = (block: DAWBlock) => tracks.findIndex((t) => t.id === block.trackId);
  const gridHeight = Math.max(tracks.length, 4) * TRACK_ROW_HEIGHT;

  return (
    <div className="flex-1 flex flex-col overflow-hidden daw-grid-bg">
      {/* ── Time ruler (scrolls with content) ─────────────────────────────────── */}
      <div
        ref={rulerScrollRef}
        className="overflow-x-auto overflow-y-hidden custom-scrollbar shrink-0"
        style={{ height: HEADER_HEIGHT }}
        onScroll={() => syncScroll("ruler")}
      >
        <div
          className="relative bg-[#F0F0EB] border-b border-[#D4D4CE] cursor-pointer select-none"
          style={{ width: totalWidth, height: HEADER_HEIGHT }}
          onClick={handleRulerClick}
        >
          <TimeRuler totalMeasures={totalMeasures} bpm={bpm} />
          {/* Playhead tick in ruler */}
          <div
            className="absolute top-0 bottom-0 w-px bg-[#D32F2F] z-10 pointer-events-none"
            style={{ left: playheadX }}
          >
            <div className="absolute -top-0 -left-[5px] w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#D32F2F]" />
          </div>
        </div>
      </div>

      {/* ── Scrollable track area ──────────────────────────────────────────────── */}
      <div
        ref={contentScrollRef}
        className="flex-1 overflow-auto custom-scrollbar"
        onScroll={() => syncScroll("content")}
      >
        <div
          ref={timelineRef}
          className="relative cursor-crosshair"
          style={{
            width: totalWidth,
            height: gridHeight,
            backgroundImage: "radial-gradient(circle, #D1D5DB 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          onClick={handleTimelineClick}
          onMouseDown={handleSelectionMouseDown}
          onMouseMove={handleSelectionMouseMove}
          onMouseUp={handleSelectionMouseUp}
          onMouseLeave={handleSelectionMouseUp}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={handleDrop}
        >
          {/* Track row bands */}
          {Array.from({ length: Math.max(tracks.length, 4) }, (_, i) => (
            <div
              key={`hband-${i}`}
              className="absolute left-0 right-0 border-b border-[#E8E8E3] pointer-events-none"
              style={{ top: i * TRACK_ROW_HEIGHT, height: TRACK_ROW_HEIGHT, backgroundColor: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.008)" }}
            />
          ))}

          {/* Vertical measure grid lines */}
          {Array.from({ length: totalMeasures + 1 }, (_, j) => {
            const m = j + 1;
            const isMajor = j % 4 === 0;
            return (
              <div
                key={`vgrid-${j}`}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: measureToX(m, bpm),
                  borderLeft: isMajor ? "1px solid rgba(45,45,45,0.15)" : "1px solid rgba(45,45,45,0.06)",
                }}
              />
            );
          })}

          {/* Playhead line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-[#D32F2F] z-50 pointer-events-none"
            style={{ left: playheadX }}
          />

          {/* Selection rectangle */}
          {selectionStart && selectionEnd && (
            <div
              className="absolute bg-[#7DBF7D]/10 border border-[#7DBF7D]/40 z-20 pointer-events-none"
              style={{
                left:   Math.min(selectionStart.x, selectionEnd.x),
                top:    Math.min(selectionStart.y, selectionEnd.y),
                width:  Math.abs(selectionEnd.x - selectionStart.x),
                height: Math.abs(selectionEnd.y - selectionStart.y),
              }}
            />
          )}

          {/* Blocks */}
          {blocks.map((block) => {
            const tIdx = trackIndex(block);
            if (tIdx === -1) return null;
            const track      = tracks[tIdx];
            const blockColor = block.color ?? track.color;
            const isSelected = selectedBlockId === block.id;

            const leftPx   = measureToX(block.startMeasure, bpm);
            const widthPx  = block.durationMeasures * secPerMeasure(bpm) * PIXELS_PER_SECOND;
            const topPx    = tIdx * TRACK_ROW_HEIGHT + 5;
            const heightPx = TRACK_ROW_HEIGHT - 10;

            return (
              <div
                key={block.id}
                className={`absolute rounded-md overflow-hidden cursor-move z-10 transition-shadow ${isSelected ? "ring-1 ring-[#2D2D2D]/50" : ""}`}
                style={{
                  left:   leftPx,
                  width:  Math.max(8, widthPx),
                  top:    topPx,
                  height: heightPx,
                  backgroundColor: blockColor,
                  border: `1.5px solid rgba(45,45,45,${isSelected ? 0.6 : 0.35})`,
                  boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.08)",
                }}
                onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", block.id);
                  e.dataTransfer.effectAllowed = "move";
                  dragOffsetRef.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
                }}
                onDragEnd={(e) => e.preventDefault()}
              >
                <div className="px-2 py-1.5 h-full flex flex-col justify-between overflow-hidden">
                  <span className="font-mono text-[10px] font-bold text-[#1a1a1a]/80 truncate leading-none select-none">
                    {block.name?.toUpperCase() ?? ""}
                  </span>
                  {track.audioBlob ? (
                    <Waveform
                      audioBlob={track.audioBlob}
                      width={Math.max(40, Math.floor(widthPx))}
                      height={Math.max(18, heightPx - 26)}
                      color="rgba(0,0,0,0.35)"
                      className="w-full"
                    />
                  ) : (
                    <div className="flex flex-col gap-[2.5px] py-0.5">
                      {[0.7, 0.5, 0.85, 0.6, 0.4].map((w, i) => (
                        <div key={i} className="rounded-full" style={{ height: 2, width: `${w * 100}%`, backgroundColor: "rgba(0,0,0,0.3)" }} />
                      ))}
                    </div>
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
