"use client";

import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import {
  MessageSquare,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Square,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Sparkles,
  Info,
} from "lucide-react";
import CopilotChat from "@/components/CopilotChat";
import SampleAnalysisModal from "@/components/SampleAnalysisModal";
import { useDAWContext } from "@/lib/DAWContext";
import type { SampleLibraryEntry } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalSample {
  id: string;
  name: string;
  audioUrl: string;
  createdAt: number;
}

interface LocalFolder {
  id: string;
  name: string;
  samples: LocalSample[];
}

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a", ".aif", ".aiff"]);

function isAudioFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

// ─── Preview button ────────────────────────────────────────────────────────────

function PreviewButton({ audioUrl, name }: { audioUrl: string; name: string }) {
  const playerRef = useRef<Tone.Player | null>(null);
  const [playing, setPlaying] = useState(false);

  const handlePreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) {
      playerRef.current?.stop();
      return;
    }
    await Tone.start();
    const player = new Tone.Player({
      url: audioUrl,
      autostart: false,
      loop: false,
      onload: () => { player.start(); setPlaying(true); },
    }).toDestination();
    player.onstop = () => { player.dispose(); playerRef.current = null; setPlaying(false); };
    playerRef.current = player;
  };

  useEffect(() => () => { playerRef.current?.dispose(); }, []);

  return (
    <button
      onClick={handlePreview}
      title={playing ? `Stop ${name}` : `Preview ${name}`}
      className={`w-6 h-6 flex-shrink-0 rounded-lg border-2 flex items-center justify-center transition-colors ${
        playing
          ? "bg-[#1A1A1A] border-[#1A1A1A] text-white"
          : "bg-white border-[#D8D8D8] text-[#1A1A1A]/40 hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
      }`}
    >
      {playing ? <Square size={8} strokeWidth={3} /> : <Play size={8} strokeWidth={3} />}
    </button>
  );
}

// ─── Single sample row ─────────────────────────────────────────────────────────

function SampleRow({
  id,
  name,
  audioUrl,
  tags,
  createdAt,
  onInfo,
}: {
  id: string;
  name: string;
  audioUrl: string;
  tags?: string[];
  createdAt?: number;
  onInfo: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-[#E5E5E0] bg-white hover:bg-[#FAFAF8] transition-colors group shadow-[1px_1px_0px_0px_rgba(26,26,26,0.06)]">
      <PreviewButton audioUrl={audioUrl} name={name} />

      <p className="flex-1 text-[11px] font-mono font-bold text-[#1A1A1A] truncate min-w-0 leading-tight">
        {name}
      </p>

      {tags && tags.length > 0 && (
        <span className="hidden group-hover:flex text-[8px] font-mono uppercase tracking-wide bg-[#F0F0EE] text-[#1A1A1A]/50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          {tags[0]}
        </span>
      )}

      <button
        onClick={(e) => { e.stopPropagation(); onInfo(); }}
        title="Agentic Analysis"
        className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-lg border border-[#E5E5E0] text-[#1A1A1A]/30 hover:border-[#1A1A1A] hover:text-[#1A1A1A] hover:bg-[#FEF08A] transition-colors"
      >
        <Info size={10} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ─── Folder accordion ──────────────────────────────────────────────────────────

function FolderAccordion({
  id,
  label,
  count,
  icon: Icon,
  accent,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  count: number;
  icon: React.ElementType;
  accent?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-2 border-[#1A1A1A] rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors hover:brightness-95"
        style={{ background: accent ?? "#F5F5F2" }}
      >
        <ChevronRight
          size={12}
          strokeWidth={2.5}
          className={`flex-shrink-0 text-[#1A1A1A] transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        <Icon size={12} strokeWidth={2.5} className="flex-shrink-0 text-[#1A1A1A]" />
        <span className="flex-1 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A] truncate">
          {label}
        </span>
        <span className="font-mono text-[9px] text-[#1A1A1A]/50 flex-shrink-0 border border-[#1A1A1A]/20 rounded-full px-1.5 py-0.5 leading-none">
          {count}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-[#1A1A1A] bg-[#FDFDFB] px-2 py-2 flex flex-col gap-1.5">
          {count === 0 ? (
            <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/30 text-center py-3">
              Empty folder
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── Browse Tab ────────────────────────────────────────────────────────────────

function BrowseTab() {
  const { state } = useDAWContext();
  const aiSamples = state.sampleLibrary;

  // Local folder state — lives entirely in the browser, no backend
  const [localFolders, setLocalFolders] = useState<LocalFolder[]>([]);

  // Which folders are open
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(["ai-generated"]));

  // Currently inspected sample (for the analysis modal)
  const [inspectedSample, setInspectedSample] = useState<SampleLibraryEntry | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleFolder = (id: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Local folder → File picker ─────────────────────────────────────────────
  const handleAddFolder = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const audioFiles = files.filter((f) => isAudioFile(f.name));
    if (audioFiles.length === 0) return;

    // Derive folder name from the shared path prefix
    const firstPath = (audioFiles[0] as File & { webkitRelativePath: string }).webkitRelativePath;
    const folderName = firstPath.split("/")[0] || "Local Folder";

    const samples: LocalSample[] = audioFiles.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      audioUrl: URL.createObjectURL(f),
      createdAt: Date.now(),
    }));

    const newFolder: LocalFolder = {
      id: crypto.randomUUID(),
      name: folderName,
      samples,
    };

    setLocalFolders((prev) => [...prev, newFolder]);
    setOpenFolders((prev) => new Set([...prev, newFolder.id]));

    // Reset input so the same folder can be added again if desired
    e.target.value = "";
  };

  // ── Convert local sample to SampleLibraryEntry for the modal ──────────────
  const localToEntry = (s: LocalSample): SampleLibraryEntry => ({
    id: s.id,
    name: s.name,
    audioUrl: s.audioUrl,
    tags: ["local"],
    createdAt: s.createdAt,
  });

  return (
    <>
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 custom-scrollbar">

        {/* ── AI Generated folder ─────────────────────────────────────────── */}
        <FolderAccordion
          id="ai-generated"
          label="AI Generated"
          count={aiSamples.length}
          icon={Sparkles}
          accent="#C1E1C1"
          open={openFolders.has("ai-generated")}
          onToggle={() => toggleFolder("ai-generated")}
        >
          {aiSamples.map((entry) => (
            <SampleRow
              key={entry.id}
              id={entry.id}
              name={entry.name}
              audioUrl={entry.audioUrl}
              tags={entry.tags}
              createdAt={entry.createdAt}
              onInfo={() => setInspectedSample(entry)}
            />
          ))}
        </FolderAccordion>

        {/* ── Local folders ────────────────────────────────────────────────── */}
        {localFolders.map((folder) => (
          <FolderAccordion
            key={folder.id}
            id={folder.id}
            label={folder.name}
            count={folder.samples.length}
            icon={FolderOpen}
            open={openFolders.has(folder.id)}
            onToggle={() => toggleFolder(folder.id)}
          >
            {folder.samples.map((s) => (
              <SampleRow
                key={s.id}
                id={s.id}
                name={s.name}
                audioUrl={s.audioUrl}
                onInfo={() => setInspectedSample(localToEntry(s))}
              />
            ))}
          </FolderAccordion>
        ))}

        {/* ── Add Local Folder button ──────────────────────────────────────── */}
        <button
          onClick={handleAddFolder}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-[#1A1A1A]/30 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A] transition-all hover:border-[#1A1A1A] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
          style={{ background: "#C1E1C1" }}
        >
          <FolderPlus size={13} strokeWidth={2.5} />
          Add Local Folder
        </button>

        {/* ── Hidden directory file input ──────────────────────────────────── */}
        <input
          ref={fileInputRef}
          type="file"
          // @ts-expect-error — non-standard but widely supported
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          accept=".wav,.mp3,.ogg,.flac,.aac,.m4a,.aif,.aiff"
          onChange={handleFileChange}
        />
      </div>

      {/* ── Analysis modal (portal) ──────────────────────────────────────────── */}
      {inspectedSample && (
        <SampleAnalysisModal
          sample={inspectedSample}
          onClose={() => setInspectedSample(null)}
        />
      )}
    </>
  );
}

// ─── Left Pane ────────────────────────────────────────────────────────────────

type Tab = "chat" | "browse";

export default function LeftPane() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const { state } = useDAWContext();
  const libraryCount = state.sampleLibrary.length;

  // ── Collapsed: narrow icon rail ─────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 flex flex-col border-r border-[#DEDEDE] bg-white z-10">
        <button
          onClick={() => setCollapsed(false)}
          className="w-10 h-10 flex items-center justify-center text-[#2D2D2D]/40 hover:text-[#2D2D2D] hover:bg-[#F5F5F2] transition-colors border-b border-[#EBEBEB]"
          title="Expand panel"
        >
          <PanelLeftOpen size={15} />
        </button>

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

  // ── Expanded ─────────────────────────────────────────────────────────────────
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
