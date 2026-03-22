"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { DAWTransport, DAWTrack, DAWBlock, DAWLoopState, DAWRecordingState, DAWGridSize } from "@/types";
import { Waveform } from "@/components/Waveform";
import { gridSizeToMeasureStep } from "@/lib/mixUtils";

const TRACK_ROW_HEIGHT = 72;   // must match DAWTrackList
const HEADER_HEIGHT    = 40;
const LOOP_LANE_HEIGHT = 32;
export const PIXELS_PER_SECOND = 50; // global time-to-pixel constant

function secPerMeasure(bpm: number) {
  return (4 * 60) / bpm; // 4/4 time
}

function measureToSeconds(measure: number, bpm: number) {
  return (measure - 1) * secPerMeasure(bpm);
}

function measureToX(measure: number, bpm: number) {
  return measureToSeconds(measure, bpm) * PIXELS_PER_SECOND;
}

function xToMeasure(x: number, bpm: number) {
  return x / (secPerMeasure(bpm) * PIXELS_PER_SECOND) + 1;
}

function xToSeconds(x: number) {
  return x / PIXELS_PER_SECOND;
}

function snapMeasure(raw: number, totalMeasures: number, stepMeasures: number) {
  return Math.max(1, Math.min(Math.round(raw / stepMeasures) * stepMeasures, totalMeasures));
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

type ActiveTool = "pointer" | "razor";

interface DAWTimelineProps {
  transport: DAWTransport;
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  recording: DAWRecordingState;
  loop: DAWLoopState;
  gridSize: DAWGridSize;
  selectedBlockId: string | null;
  onSeek: (measure: number) => void;
  onUpdateBlock: (id: string, patch: Partial<DAWBlock>) => void;
  onDeleteBlock: (id: string) => void;
  onAddBlock: (block: DAWBlock) => void;
  onSelectBlock: (id: string | null) => void;
  onLoopChange: (patch: Partial<DAWLoopState>) => void;
  onGridSizeChange: (gridSize: DAWGridSize) => void;
}

export function DAWTimeline({
  transport,
  tracks,
  blocks,
  recording,
  loop,
  gridSize,
  selectedBlockId,
  onSeek,
  onUpdateBlock,
  onDeleteBlock,
  onAddBlock,
  onSelectBlock,
  onLoopChange,
  onGridSizeChange,
}: DAWTimelineProps) {
  const { bpm, currentMeasure, totalMeasures } = transport;
  const stepMeasures = gridSizeToMeasureStep(gridSize);
  const stepSeconds = stepMeasures * secPerMeasure(bpm);
  const gridStepPx = stepSeconds * PIXELS_PER_SECOND;

  const [activeTool, setActiveTool] = useState<ActiveTool>("pointer");

  const totalWidth = totalMeasures * secPerMeasure(bpm) * PIXELS_PER_SECOND;
  const playheadX  = measureToX(currentMeasure, bpm);

  const rulerScrollRef      = useRef<HTMLDivElement>(null);
  const contentScrollRef    = useRef<HTMLDivElement>(null);
  const timelineRef         = useRef<HTMLDivElement>(null);
  const rulerPlayheadRef    = useRef<HTMLDivElement>(null);
  const contentPlayheadRef  = useRef<HTMLDivElement>(null);
  const userScrollingRef    = useRef<boolean>(false);
  const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostClipRef = useRef<HTMLDivElement>(null);

  // Block drag — ref-based for zero-lag DOM updates during drag
  const blockDragRef = useRef<{
    blockId: string;
    type: "move" | "resize";
    startClientX: number;
    startScrollLeft: number;
    origValue: number; // startMeasure (move) | durationMeasures (resize)
    el: HTMLDivElement;
    hasMoved: boolean;
  } | null>(null);
  const didBlockDragRef = useRef(false);
  const bpmRef = useRef(bpm);
  const totalMeasuresRef = useRef(totalMeasures);

  const loopDragRef = useRef<{
    mode: "move" | "start" | "end";
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  // Keep ruler and content scroll in sync
  const syncScroll = (source: "ruler" | "content") => {
    const ruler   = rulerScrollRef.current;
    const content = contentScrollRef.current;
    if (!ruler || !content) return;
    if (source === "content") ruler.scrollLeft   = content.scrollLeft;
    else                      content.scrollLeft = ruler.scrollLeft;
  };

  // Auto-scroll to keep playhead visible during playback
  useEffect(() => {
    if (!transport.isPlaying) return;
    const content = contentScrollRef.current;
    if (!content || userScrollingRef.current) return;

    const viewWidth   = content.clientWidth;
    const scrollLeft  = content.scrollLeft;
    const leadPx      = viewWidth * 0.25; // keep playhead 25% from left edge

    if (playheadX < scrollLeft + leadPx || playheadX > scrollLeft + viewWidth - 40) {
      const targetScroll = Math.max(0, playheadX - leadPx);
      content.scrollLeft = targetScroll;
      if (rulerScrollRef.current) rulerScrollRef.current.scrollLeft = targetScroll;
    }
  }, [playheadX, transport.isPlaying]);

  // Detect manual scrolling — suppress auto-scroll for 2s after user touches scrollbar
  const handleContentScroll = () => {
    syncScroll("content");
    if (transport.isPlaying) {
      userScrollingRef.current = true;
      if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
      userScrollTimerRef.current = setTimeout(() => {
        userScrollingRef.current = false;
      }, 2000);
    }
  };

  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd,   setSelectionEnd]   = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Keep stable refs for drag callbacks
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { totalMeasuresRef.current = totalMeasures; }, [totalMeasures]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedBlockId) {
        onDeleteBlock(selectedBlockId);
        return;
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && selectedBlockId) {
        const block = blocks.find((b) => b.id === selectedBlockId);
        if (!block) return;
        const step = e.shiftKey ? 1 : stepMeasures;
        const delta = e.key === "ArrowLeft" ? -step : step;
        onUpdateBlock(selectedBlockId, { startMeasure: snapMeasure(block.startMeasure + delta, totalMeasures, stepMeasures) });
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedBlockId, blocks, onDeleteBlock, onUpdateBlock, stepMeasures, totalMeasures]);

  // ─── rAF playhead — reads Tone.Transport.seconds at 60fps, zero React lag ───
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const xPos = Tone.getTransport().seconds * PIXELS_PER_SECOND;
      if (rulerPlayheadRef.current)
        rulerPlayheadRef.current.style.transform = `translateX(${xPos}px)`;
      if (contentPlayheadRef.current)
        contentPlayheadRef.current.style.transform = `translateX(${xPos}px)`;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (!recording.isRecording || recording.recordStartTime === null) {
      if (ghostClipRef.current) {
        ghostClipRef.current.style.width = "8px";
      }
      return;
    }

    const recordStartTime = recording.recordStartTime;
    let rafId = 0;
    const tick = () => {
      const elapsed = Math.max(0, Tone.getTransport().seconds - recordStartTime);
      if (ghostClipRef.current) {
        ghostClipRef.current.style.width = `${Math.max(8, elapsed * PIXELS_PER_SECOND)}px`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [recording.isRecording, recording.recordStartTime]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = loopDragRef.current;
      if (!drag) return;

      const deltaSec = xToSeconds(event.clientX - drag.startX);
      // Snap to 4-measure grid
      const gridSec = stepSeconds;
      const snap = (s: number) => Math.round(s / gridSec) * gridSec;

      if (drag.mode === "move") {
        const duration = drag.initialEnd - drag.initialStart;
        const nextStart = snap(Math.max(0, drag.initialStart + deltaSec));
        onLoopChange({ loopStart: nextStart, loopEnd: nextStart + duration });
        return;
      }

      if (drag.mode === "start") {
        const nextStart = snap(Math.max(0, Math.min(drag.initialStart + deltaSec, drag.initialEnd - gridSec)));
        onLoopChange({ loopStart: nextStart });
        return;
      }

      const nextEnd = snap(Math.max(drag.initialStart + gridSec, drag.initialEnd + deltaSec));
      onLoopChange({ loopEnd: nextEnd });
    };

    const handleMouseUp = () => {
      loopDragRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [bpm, onLoopChange, stepSeconds]);

  // ─── Block mouse drag ────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = blockDragRef.current;
      if (!drag) return;
      const scrollLeft = contentScrollRef.current?.scrollLeft ?? 0;
      const dx = (e.clientX - drag.startClientX) + (scrollLeft - drag.startScrollLeft);
      if (Math.abs(dx) > 3) drag.hasMoved = true;
      const spm = secPerMeasure(bpmRef.current);
      const dMeasures = dx / (spm * PIXELS_PER_SECOND);
      if (drag.type === "move") {
        const newStart = Math.max(1, snapMeasure(drag.origValue + dMeasures, totalMeasuresRef.current, stepMeasures));
        drag.el.style.left = `${measureToX(newStart, bpmRef.current)}px`;
      } else {
        const newDur = Math.max(stepMeasures, Math.round((drag.origValue + dMeasures) / stepMeasures) * stepMeasures);
        drag.el.style.width = `${Math.max(8, newDur * spm * PIXELS_PER_SECOND)}px`;
      }
    };
    const onUp = (e: MouseEvent) => {
      const drag = blockDragRef.current;
      if (!drag) return;
      if (drag.hasMoved) {
        didBlockDragRef.current = true;
        const scrollLeft = contentScrollRef.current?.scrollLeft ?? 0;
        const dx = (e.clientX - drag.startClientX) + (scrollLeft - drag.startScrollLeft);
        const spm = secPerMeasure(bpmRef.current);
        const dMeasures = dx / (spm * PIXELS_PER_SECOND);
        if (drag.type === "move") {
          const newStart = Math.max(1, snapMeasure(drag.origValue + dMeasures, totalMeasuresRef.current, stepMeasures));
          onUpdateBlock(drag.blockId, { startMeasure: newStart });
        } else {
          const newDur = Math.max(stepMeasures, Math.round((drag.origValue + dMeasures) / stepMeasures) * stepMeasures);
          onUpdateBlock(drag.blockId, { durationMeasures: newDur });
        }
      }
      blockDragRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onUpdateBlock, stepMeasures]);

  // ─── Ruler click → seek ──────────────────────────────────────────────────────
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    onSeek(snapMeasure(xToMeasure(x, bpm), totalMeasures, stepMeasures));
  };

  // ─── Timeline click → seek / deselect ───────────────────────────────────────
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (didBlockDragRef.current) { didBlockDragRef.current = false; return; }
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    onSeek(snapMeasure(xToMeasure(x, bpm), totalMeasures, stepMeasures));
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

  // ─── Razor / pointer block click ─────────────────────────────────────────────
  const handleBlockClick = (e: React.MouseEvent<HTMLDivElement>, block: DAWBlock) => {
    e.stopPropagation();
    if (didBlockDragRef.current) { didBlockDragRef.current = false; return; }

    if (activeTool === "razor") {
      const clickX    = e.nativeEvent.offsetX;
      const splitSec  = clickX / PIXELS_PER_SECOND;
      const spm       = secPerMeasure(bpm);
      const splitMeasures = Math.round((splitSec / spm) / stepMeasures) * stepMeasures;

      if (splitMeasures < stepMeasures || splitMeasures > block.durationMeasures - stepMeasures) return;

      const existingOffset = block.bufferOffsetSec ?? 0;

      const blockA: DAWBlock = {
        ...block,
        id: crypto.randomUUID(),
        durationMeasures: splitMeasures,
        bufferOffsetSec: existingOffset,
      };

      const blockB: DAWBlock = {
        ...block,
        id: crypto.randomUUID(),
        startMeasure: block.startMeasure + splitMeasures,
        durationMeasures: block.durationMeasures - splitMeasures,
        bufferOffsetSec: existingOffset + splitMeasures * spm,
      };

      onDeleteBlock(block.id);
      onAddBlock(blockA);
      onAddBlock(blockB);
      return;
    }

    onSelectBlock(block.id);
  };

  // ─── Block drag start ────────────────────────────────────────────────────────
  const handleBlockMouseDown = (e: React.MouseEvent<HTMLDivElement>, block: DAWBlock) => {
    if (e.button !== 0 || activeTool !== "pointer") return;
    e.stopPropagation();
    blockDragRef.current = {
      blockId: block.id,
      type: "move",
      startClientX: e.clientX,
      startScrollLeft: contentScrollRef.current?.scrollLeft ?? 0,
      origValue: block.startMeasure,
      el: e.currentTarget,
      hasMoved: false,
    };
  };

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>, block: DAWBlock) => {
    if (e.button !== 0 || activeTool !== "pointer") return;
    e.stopPropagation();
    blockDragRef.current = {
      blockId: block.id,
      type: "resize",
      startClientX: e.clientX,
      startScrollLeft: contentScrollRef.current?.scrollLeft ?? 0,
      origValue: block.durationMeasures,
      el: e.currentTarget.parentElement as HTMLDivElement,
      hasMoved: false,
    };
  };

  const trackIndex = (block: DAWBlock) => tracks.findIndex((t) => t.id === block.trackId);
  const gridHeight = Math.max(tracks.length, 4) * TRACK_ROW_HEIGHT;
  const recordingTrackIndex = recording.armedTrackId
    ? tracks.findIndex((track) => track.id === recording.armedTrackId)
    : -1;
  const ghostStartTime = recording.recordStartTime ?? 0;
  const loopLeftPx = loop.loopStart * PIXELS_PER_SECOND;
  const loopWidthPx = Math.max(24, (loop.loopEnd - loop.loopStart) * PIXELS_PER_SECOND);

  const toolBtn = (tool: ActiveTool, label: string) => (
    <button
      onClick={() => setActiveTool(tool)}
      className={`px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest border-2 border-[#1A1A1A] transition-all select-none ${
        activeTool === tool
          ? "bg-[#1A1A1A] text-white translate-x-[1px] translate-y-[1px]"
          : "bg-[#F0F0EB] text-[#1A1A1A] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] hover:translate-x-[1px] hover:translate-y-[1px]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden daw-grid-bg no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* ── Tool Bar ───────────────────────────────────────────────────────────── */}
      <div className="h-8 border-b-2 border-[#1A1A1A] bg-[#F0F0EB] flex items-center gap-2 px-3 shrink-0">
        {toolBtn("pointer", "↖ Pointer")}
        {toolBtn("razor",   "✂ Razor")}
        {activeTool === "razor" && (
                    <span className="font-mono text-[8px] text-[#1A1A1A]/35 tracking-widest ml-1 select-none">
            click a clip to slice
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]/45">
            Grid Size
          </label>
          <select
            value={gridSize}
            onChange={(event) => onGridSizeChange(Number(event.target.value) as DAWGridSize)}
            className="border-2 border-[#1A1A1A] bg-[#FDFDFB] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A] focus:outline-none"
          >
            <option value={8}>8 Beats</option>
            <option value={16}>16 Beats</option>
            <option value={32}>32 Beats</option>
            <option value={64}>64 Beats</option>
          </select>
        </div>
        {activeTool === "pointer" && selectedBlockId && (
          <span className="font-mono text-[8px] text-[#1A1A1A]/30 tracking-widest select-none">
            ←→ nudge · shift+←→ bars · ⌫ delete
          </span>
        )}
      </div>

      {/* ── Time ruler (scrolls with content) ─────────────────────────────────── */}
      <div
        ref={rulerScrollRef}
        className="overflow-x-auto overflow-y-hidden shrink-0 no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ height: HEADER_HEIGHT + LOOP_LANE_HEIGHT }}
        onScroll={() => syncScroll("ruler")}
      >
        <div style={{ width: totalWidth }} className="relative">
          <div
            className="relative bg-[#F0F0EB] border-b border-[#D4D4CE] cursor-pointer select-none"
            style={{ height: HEADER_HEIGHT }}
            onClick={handleRulerClick}
          >
            <TimeRuler totalMeasures={totalMeasures} bpm={bpm} />
          </div>
          {/* Playhead spans ruler + loop lane — sits above loop region */}
          <div
            ref={rulerPlayheadRef}
            className="absolute top-0 w-px bg-[#D32F2F] z-20 pointer-events-none"
            style={{ left: 0, height: HEADER_HEIGHT + LOOP_LANE_HEIGHT, willChange: "transform" }}
          >
            <div className="absolute top-0 -left-[5px] w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#D32F2F]" />
          </div>
          <div className="relative border-b-2 border-[#1A1A1A] bg-[#F7F6F1]" style={{ height: LOOP_LANE_HEIGHT }}>
            <div
              className={`absolute inset-y-0 cursor-grab active:cursor-grabbing ${
                loop.loopEnabled
                  ? "bg-[#A8D5A2]/45 border-x-2 border-[#7DBF7D]"
                  : "bg-[#E0E0DC]/50 border-x border-[#2D2D2D]/20"
              }`}
              style={{ left: `${loopLeftPx}px`, width: `${loopWidthPx}px` }}
              onMouseDown={(event) => {
                event.preventDefault();
                loopDragRef.current = {
                  mode: "move",
                  startX: event.clientX,
                  initialStart: loop.loopStart,
                  initialEnd: loop.loopEnd,
                };
              }}
            >
              {/* Left resize handle */}
              <div
                className={`absolute left-0 inset-y-0 w-2 cursor-ew-resize ${loop.loopEnabled ? "bg-[#7DBF7D]" : "bg-[#2D2D2D]/15"}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  loopDragRef.current = {
                    mode: "start",
                    startX: event.clientX,
                    initialStart: loop.loopStart,
                    initialEnd: loop.loopEnd,
                  };
                }}
              />
              <div className="flex h-full items-center justify-center px-4 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]/50 select-none pointer-events-none">
                {loop.loopEnabled ? "loop" : ""}
              </div>
              {/* Right resize handle */}
              <div
                className={`absolute right-0 inset-y-0 w-2 cursor-ew-resize ${loop.loopEnabled ? "bg-[#7DBF7D]" : "bg-[#2D2D2D]/15"}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  loopDragRef.current = {
                    mode: "end",
                    startX: event.clientX,
                    initialStart: loop.loopStart,
                    initialEnd: loop.loopEnd,
                  };
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable track area ──────────────────────────────────────────────── */}
      <div
        ref={contentScrollRef}
        className="flex-1 overflow-auto no-scrollbar [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={handleContentScroll}
      >
        <div
          ref={timelineRef}
          className="relative cursor-crosshair"
          style={{
            width: totalWidth,
            height: gridHeight,
            backgroundImage: `linear-gradient(to right, rgba(26,26,26,0.08) 1px, transparent 1px)`,
            backgroundSize: `${Math.max(gridStepPx, 8)}px 100%`,
          }}
          onClick={handleTimelineClick}
          onMouseDown={handleSelectionMouseDown}
          onMouseMove={handleSelectionMouseMove}
          onMouseUp={handleSelectionMouseUp}
          onMouseLeave={handleSelectionMouseUp}
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
          {Array.from({ length: Math.ceil(totalMeasures / stepMeasures) + 1 }, (_, j) => {
            const measure = 1 + j * stepMeasures;
            const isMajor = Math.abs((measure - 1) % 1) < 0.0001;
            return (
              <div
                key={`vgrid-${j}`}
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{
                  left: measureToX(measure, bpm),
                  borderLeft: isMajor ? "1px solid rgba(45,45,45,0.15)" : "1px solid rgba(45,45,45,0.06)",
                }}
              />
            );
          })}

          {/* Playhead line — positioned by rAF via ref, never re-renders */}
          <div
            ref={contentPlayheadRef}
            className="absolute top-0 bottom-0 w-px bg-[#D32F2F] z-50 pointer-events-none"
            style={{ left: 0, willChange: "transform" }}
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

            // Width is purely measure-based so it stays consistent with playback and BPM changes
            const leftPx   = measureToX(block.startMeasure, bpm);
            const widthPx  = block.durationMeasures * secPerMeasure(bpm) * PIXELS_PER_SECOND;
            const topPx    = tIdx * TRACK_ROW_HEIGHT + 5;
            const heightPx = TRACK_ROW_HEIGHT - 10;

            return (
              <div
                key={block.id}
                className={`absolute rounded-md overflow-hidden z-10 select-none ${
                  activeTool === "razor" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
                } ${isSelected && activeTool === "pointer" ? "ring-1 ring-[#2D2D2D]/50" : ""}`}
                style={{
                  left:   `${leftPx}px`,
                  width:  `${Math.max(8, widthPx)}px`,
                  top:    topPx,
                  height: heightPx,
                  backgroundColor: blockColor,
                  border: activeTool === "razor"
                    ? "1.5px dashed rgba(45,45,45,0.55)"
                    : `1.5px solid rgba(45,45,45,${isSelected ? 0.6 : 0.35})`,
                  boxShadow: isSelected && activeTool === "pointer"
                    ? "0 2px 8px rgba(0,0,0,0.15)"
                    : "0 1px 3px rgba(0,0,0,0.08)",
                }}
                onMouseDown={(e) => handleBlockMouseDown(e, block)}
                onClick={(e) => handleBlockClick(e, block)}
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
                {/* Right-edge resize handle */}
                {activeTool === "pointer" && (
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-black/15 transition-colors"
                    onMouseDown={(e) => handleResizeMouseDown(e, block)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            );
          })}

          {recording.isRecording && recording.recordStartTime !== null && recordingTrackIndex >= 0 && (
            <div
              ref={ghostClipRef}
              className="absolute z-30 overflow-hidden border-2 border-[#1A1A1A] bg-[#C1E1C1] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] recording-ghost-clip"
              style={{
                left: `${ghostStartTime * PIXELS_PER_SECOND}px`,
                width: "8px",
                top: recordingTrackIndex * TRACK_ROW_HEIGHT + 5,
                height: TRACK_ROW_HEIGHT - 10,
              }}
            >
              <div className="flex h-full items-start justify-between px-2 py-1">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]">
                  Capturing
                </span>
                <span className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-[#1A1A1A]/60">
                  Rec
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
