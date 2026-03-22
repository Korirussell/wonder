"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { MessageSquare, Library, PanelLeftClose, PanelLeftOpen, Play, Square, Clock } from "lucide-react";
import CopilotChat from "@/components/CopilotChat";
import { useDAWContext } from "@/lib/DAWContext";
import type { SampleLibraryEntry } from "@/types";

// ─── Browse Tab ───────────────────────────────────────────────────────────────

function PreviewButton({ entry }: { entry: SampleLibraryEntry }) {
  const playerRef = useRef<Tone.Player | null>(null);
  const [playing, setPlaying] = useState(false);

  const handlePreview = async () => {
    if (playing) {
      playerRef.current?.stop();
      return;
    }
    await Tone.start();
    const player = new Tone.Player({
      url: entry.audioUrl,
      autostart: false,
      loop: false,
      onload: () => {
        player.start();
        setPlaying(true);
      },
    }).toDestination();
    player.onstop = () => {
      player.dispose();
      playerRef.current = null;
      setPlaying(false);
    };
    playerRef.current = player;
  };

  // Cleanup on unmount
  useEffect(() => () => { playerRef.current?.dispose(); }, []);

  return (
    <button
      onClick={handlePreview}
      className={`w-7 h-7 flex-shrink-0 rounded-lg border flex items-center justify-center transition-colors ${
        playing
          ? "bg-[#2D2D2D] border-[#2D2D2D] text-white"
          : "bg-white border-[#D8D8D8] text-[#2D2D2D]/50 hover:border-[#2D2D2D] hover:text-[#2D2D2D]"
      }`}
      title={playing ? "Stop" : "Preview"}
    >
      {playing ? <Square size={9} strokeWidth={2.5} /> : <Play size={9} strokeWidth={2.5} />}
    </button>
  );
}

function BrowseTab() {
  const { state } = useDAWContext();
  const library = state.sampleLibrary;

  if (library.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-[#F5F5F2] border border-[#E0E0E0] flex items-center justify-center">
          <Library size={18} className="text-[#2D2D2D]/30" />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#2D2D2D]/30 leading-relaxed">
          No samples yet.<br />Ask Wonder to generate one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 custom-scrollbar">
      <p className="font-mono text-[9px] uppercase tracking-widest text-[#2D2D2D]/35 px-1 mb-2">
        {library.length} sample{library.length !== 1 ? "s" : ""}
      </p>
      {library.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center gap-2.5 px-3 py-2.5 border border-[#E0E0E0] rounded-xl bg-white hover:bg-[#FAFAF8] transition-colors group shadow-[2px_2px_0px_0px_rgba(0,0,0,0.04)]"
        >
          <PreviewButton entry={entry} />

          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-mono font-bold text-[#2D2D2D] truncate leading-tight">
              {entry.name}
            </p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[8px] font-mono uppercase tracking-wide bg-[#F0F0EE] text-[#2D2D2D]/50 px-1.5 py-0.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-1 text-[#2D2D2D]/25 group-hover:text-[#2D2D2D]/40">
            <Clock size={9} />
            <span className="font-mono text-[8px]">
              {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Left Pane ────────────────────────────────────────────────────────────────

type Tab = "chat" | "browse";

export default function LeftPane() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const { state } = useDAWContext();
  const libraryCount = state.sampleLibrary.length;

  // ── Collapsed: narrow icon rail ───────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 flex flex-col border-r border-[#DEDEDE] bg-white z-10">
        {/* Expand button */}
        <button
          onClick={() => setCollapsed(false)}
          className="w-10 h-10 flex items-center justify-center text-[#2D2D2D]/40 hover:text-[#2D2D2D] hover:bg-[#F5F5F2] transition-colors border-b border-[#EBEBEB]"
          title="Expand panel"
        >
          <PanelLeftOpen size={15} />
        </button>

        {/* Tab icons — clicking expands + switches tab */}
        <button
          onClick={() => { setCollapsed(false); setActiveTab("chat"); }}
          className={`w-10 h-10 flex items-center justify-center transition-colors border-b border-[#EBEBEB] ${
            activeTab === "chat" ? "bg-[#C1E1C1] text-[#2D2D2D]" : "text-[#2D2D2D]/40 hover:bg-[#F5F5F2]"
          }`}
          title="Copilot Chat"
        >
          <MessageSquare size={14} />
        </button>

        <button
          onClick={() => { setCollapsed(false); setActiveTab("browse"); }}
          className={`relative w-10 h-10 flex items-center justify-center transition-colors ${
            activeTab === "browse" ? "bg-[#C1E1C1] text-[#2D2D2D]" : "text-[#2D2D2D]/40 hover:bg-[#F5F5F2]"
          }`}
          title="Browse Samples"
        >
          <Library size={14} />
          {libraryCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-[#2D2D2D] text-white rounded-full text-[7px] font-mono font-bold flex items-center justify-center">
              {libraryCount > 9 ? "9+" : libraryCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // ── Expanded ──────────────────────────────────────────────────────────────
  return (
    <div className="w-[300px] flex-shrink-0 flex flex-col border-r border-[#DEDEDE] bg-white overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-stretch border-b border-[#EBEBEB] flex-shrink-0">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors border-r border-[#EBEBEB] ${
            activeTab === "chat"
              ? "bg-[#C1E1C1] text-[#2D2D2D]"
              : "bg-white text-[#2D2D2D]/40 hover:text-[#2D2D2D] hover:bg-[#F5F5F2]"
          }`}
        >
          <MessageSquare size={11} />
          Chat
        </button>

        <button
          onClick={() => setActiveTab("browse")}
          className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-colors ${
            activeTab === "browse"
              ? "bg-[#C1E1C1] text-[#2D2D2D]"
              : "bg-white text-[#2D2D2D]/40 hover:text-[#2D2D2D] hover:bg-[#F5F5F2]"
          }`}
        >
          <Library size={11} />
          Browse
          {libraryCount > 0 && (
            <span className="ml-0.5 bg-[#2D2D2D] text-white rounded-full text-[7px] font-mono font-bold px-1.5 py-0.5 leading-none">
              {libraryCount}
            </span>
          )}
        </button>

        {/* Collapse button — pushed to the right */}
        <button
          onClick={() => setCollapsed(true)}
          className="ml-auto px-3 text-[#2D2D2D]/30 hover:text-[#2D2D2D] hover:bg-[#F5F5F2] transition-colors border-l border-[#EBEBEB]"
          title="Collapse panel"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === "chat" ? <CopilotChat /> : <BrowseTab />}
      </div>
    </div>
  );
}
