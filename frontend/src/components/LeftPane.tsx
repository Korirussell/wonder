"use client";

import { startTransition, useEffect, useRef, useState } from "react";
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

interface CloudSample {
  id: string;
  name: string;
  url: string;
  tags: string[];
}

type BrowseMode = "local" | "cloud";

const TRACK_COLORS = ["#C1E1C1", "#FEF08A", "#BAE6FD", "#FBCFE8", "#E9D5FF"];

const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".ogg", ".flac", ".aac", ".m4a", ".aif", ".aiff"]);

function isAudioFile(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

async function createArrangementBlock(
  blob: Blob,
  bpm: number,
  fallbackMeasures = 4,
): Promise<number> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();
    const secondsPerMeasure = (4 * 60) / bpm;
    return Math.max(1, Math.ceil(audioBuffer.duration / secondsPerMeasure));
  } catch {
    return fallbackMeasures;
  }
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
  name,
  audioUrl,
  tags,
  onInfo,
}: {
  name: string;
  audioUrl: string;
  tags?: string[];
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

function CloudSampleSkeletonRow() {
  return (
    <div className="animate-pulse border-2 border-[#1A1A1A] bg-[#ECECE6] px-3 py-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="h-3 w-32 bg-[#D2D2CA] border border-[#1A1A1A]" />
      <div className="mt-2 flex gap-2">
        <div className="h-5 w-14 bg-[#DCDCD4] border border-[#1A1A1A]" />
        <div className="h-5 w-16 bg-[#DCDCD4] border border-[#1A1A1A]" />
      </div>
    </div>
  );
}

function CloudSampleRow({
  sample,
  loading,
  onLoad,
}: {
  sample: CloudSample;
  loading: boolean;
  onLoad: () => void;
}) {
  const disabled = loading || !sample.url;

  return (
    <div className="border-2 border-[#1A1A1A] bg-[#FDFDFB] px-3 py-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A] truncate">
            {sample.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sample.tags.map((tag) => (
              <span
                key={`${sample.id}-${tag}`}
                className="border-2 border-[#1A1A1A] bg-[#F3F2ED] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#1A1A1A]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={onLoad}
          disabled={disabled}
          className="flex-shrink-0 border-2 border-[#1A1A1A] bg-[#C1E1C1] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[#1A1A1A] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:bg-[#E6E5DF] disabled:shadow-none"
        >
          {loading ? "Loading" : sample.url ? "Load" : "Missing URL"}
        </button>
      </div>
    </div>
  );
}

// ─── Folder accordion ──────────────────────────────────────────────────────────

function FolderAccordion({
  label,
  count,
  icon: Icon,
  accent,
  open,
  onToggle,
  children,
}: {
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
  const { state, dispatch } = useDAWContext();
  const aiSamples = state.sampleLibrary;
  const [browseMode, setBrowseMode] = useState<BrowseMode>("local");
  const [cloudSamples, setCloudSamples] = useState<CloudSample[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [hasFetchedCloud, setHasFetchedCloud] = useState(false);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [cloudToastVisible, setCloudToastVisible] = useState(false);

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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

  useEffect(() => {
    if (browseMode !== "cloud" || hasFetchedCloud) return;

    const controller = new AbortController();

    const fetchCloudSamples = async () => {
      setCloudLoading(true);
      setCloudError(null);

      try {
        const resp = await fetch("/api/cloud-samples", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`Cloud fetch failed (${resp.status})`);
        }

        const rawData = (await resp.json()) as Array<Partial<CloudSample>>;
        const data = rawData.map((sample, index) => ({
          id: sample.id ?? `cloud-${index}`,
          name: sample.name ?? "Untitled Sample",
          url: sample.url ?? "",
          tags: Array.isArray(sample.tags) ? sample.tags : [],
        }));
        startTransition(() => {
          setCloudSamples(data);
          setHasFetchedCloud(true);
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setCloudError(error instanceof Error ? error.message : "Unable to fetch cloud samples");
      } finally {
        if (!controller.signal.aborted) {
          setCloudLoading(false);
        }
      }
    };

    void fetchCloudSamples();

    return () => controller.abort();
  }, [browseMode, hasFetchedCloud]);

  const handleLoadCloudSample = async (sample: CloudSample) => {
    setLoadingSampleId(sample.id);
    setCloudToastVisible(true);

    try {
      const response = await fetch(sample.url);
      if (!response.ok) {
        throw new Error(`Sample download failed (${response.status})`);
      }

      const blob = await response.blob();
      const trackId = crypto.randomUUID();
      const color = TRACK_COLORS[state.tracks.length % TRACK_COLORS.length];
      const durationMeasures = await createArrangementBlock(blob, state.transport.bpm);

      dispatch({
        type: "ADD_TRACK",
        payload: {
          id: trackId,
          name: sample.name,
          color,
          muted: false,
          volume: 80,
        },
      });
      dispatch({ type: "LOAD_AUDIO", payload: { trackId, blob } });
      dispatch({
        type: "ADD_BLOCK",
        payload: {
          id: crypto.randomUUID(),
          trackId,
          name: sample.name,
          startMeasure: 1,
          durationMeasures,
          color,
        },
      });

      await toneSafeLoaded();
    } catch (error) {
      console.error("Cloud sample load failed:", error);
    } finally {
      setLoadingSampleId(null);
      setCloudToastVisible(false);
    }
  };

  return (
    <>
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b-2 border-[#1A1A1A] bg-[#F3F2ED] px-3 py-3">
          <button
            onClick={() => setBrowseMode("local")}
            className={`border-2 border-[#1A1A1A] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] transition-transform hover:-translate-y-0.5 ${
              browseMode === "local" ? "bg-white text-[#1A1A1A]" : "bg-[#ECEBE5] text-[#1A1A1A]/55 shadow-none"
            }`}
          >
            Local
          </button>
          <button
            onClick={() => setBrowseMode("cloud")}
            className={`border-2 border-[#1A1A1A] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] transition-transform hover:-translate-y-0.5 ${
              browseMode === "cloud" ? "bg-[#C1E1C1] text-[#1A1A1A]" : "bg-white text-[#1A1A1A]/55 shadow-none"
            }`}
          >
            Cloud
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3 custom-scrollbar">
          {browseMode === "local" ? (
            <>
              <FolderAccordion
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
                    name={entry.name}
                    audioUrl={entry.audioUrl}
                    tags={entry.tags}
                    onInfo={() => setInspectedSample(entry)}
                  />
                ))}
              </FolderAccordion>

              {localFolders.map((folder) => (
                <FolderAccordion
                  key={folder.id}
                  label={folder.name}
                  count={folder.samples.length}
                  icon={FolderOpen}
                  open={openFolders.has(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                >
                  {folder.samples.map((s) => (
                    <SampleRow
                      key={s.id}
                      name={s.name}
                      audioUrl={s.audioUrl}
                      onInfo={() => setInspectedSample(localToEntry(s))}
                    />
                  ))}
                </FolderAccordion>
              ))}

              <button
                onClick={handleAddFolder}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-[#1A1A1A]/30 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider text-[#1A1A1A] transition-all hover:border-[#1A1A1A] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                style={{ background: "#C1E1C1" }}
              >
                <FolderPlus size={13} strokeWidth={2.5} />
                Add Local Folder
              </button>
            </>
          ) : (
            <>
              <div className="border-2 border-[#1A1A1A] bg-[#F7F6F1] px-3 py-2 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]">
                  Atlas Cloud Library
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#1A1A1A]/55">
                  Load curated samples directly into the arrangement
                </p>
              </div>

              {cloudLoading ? (
                <>
                  <CloudSampleSkeletonRow />
                  <CloudSampleSkeletonRow />
                  <CloudSampleSkeletonRow />
                </>
              ) : null}

              {!cloudLoading && cloudError ? (
                <div className="border-2 border-[#1A1A1A] bg-[#FEF3C7] px-3 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1A1A] shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                  {cloudError}
                </div>
              ) : null}

              {!cloudLoading && !cloudError && cloudSamples.length === 0 ? (
                <div className="border-2 border-[#1A1A1A] bg-white px-3 py-6 text-center shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]/50">
                    No cloud samples found
                  </p>
                </div>
              ) : null}

              {!cloudLoading && !cloudError
                ? cloudSamples.map((sample) => (
                    <CloudSampleRow
                      key={sample.id}
                      sample={sample}
                      loading={loadingSampleId === sample.id}
                      onLoad={() => void handleLoadCloudSample(sample)}
                    />
                  ))
                : null}
            </>
          )}

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

        {cloudToastVisible && (
          <div className="pointer-events-none absolute bottom-3 right-3 border-2 border-[#1A1A1A] bg-[#FDFDFB] px-3 py-2 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#1A1A1A]">
              Downloading from Cloud...
            </p>
          </div>
        )}
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

async function toneSafeLoaded() {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  await Tone.loaded();
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
