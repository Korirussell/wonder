"use client";

import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import { X, Settings, User, ChevronDown, Cpu, Sparkles, Guitar } from "lucide-react";
import WonderProfileModal from "./WonderProfileModal";
import SolanaBlinkModal from "./SolanaBlinkModal";
import AmpRack from "./AmpRack";
import { useDAWContext } from "@/lib/DAWContext";
import { toneEngine } from "@/lib/toneEngine";

// ─── Audio Engine Settings Modal ─────────────────────────────────────────────

function AudioEngineModal({ onClose }: { onClose: () => void }) {
  const [bufferSize, setBufferSize] = useState("256");
  const [inputDevice, setInputDevice] = useState("Built-in Microphone");
  const [audioStats, setAudioStats] = useState({
    sampleRate: "—",
    latency: "—",
  });

  // Read real values from WebAudio context on open
  useEffect(() => {
    try {
      const ctx = Tone.getContext().rawContext as AudioContext;
      const sampleRate = ctx.sampleRate;
      const latencyMs = ((ctx.baseLatency ?? 0) * 1000).toFixed(1);
      const bufSamples = Math.round((ctx.baseLatency ?? 0) * sampleRate) || 256;
      // Snap buffer size selector to nearest real value
      const snapped = [128, 256, 512, 1024, 2048].reduce((prev, cur) =>
        Math.abs(cur - bufSamples) < Math.abs(prev - bufSamples) ? cur : prev
      );
      requestAnimationFrame(() => {
        setAudioStats({
          sampleRate: `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz`,
          latency: `${latencyMs} ms`,
        });
        setBufferSize(String(snapped));
      });
    } catch {
      // AudioContext not yet started — leave defaults
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#FDFDFB] border-2 border-[#1A1A1A] rounded-2xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#1A1A1A] bg-[#1A1A1A] rounded-t-xl">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#C1E1C1] rounded-md flex items-center justify-center">
              <Cpu size={12} strokeWidth={2} className="text-[#1A1A1A]" />
            </div>
            <div>
              <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-white">
                Audio Engine Setup
              </h2>
              <p className="font-mono text-[8px] text-white/30 uppercase tracking-widest">
                Tone.js · WebAudio API
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors text-white"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Readout grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "BUFFER SIZE",  value: `${bufferSize} samples`  },
              { label: "SAMPLE RATE",  value: audioStats.sampleRate     },
              { label: "LATENCY",      value: audioStats.latency        },
              { label: "BIT DEPTH",    value: "32-bit float"            },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="border-2 border-[#1A1A1A] rounded-xl p-3 bg-[#FAFAF8] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
              >
                <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1A1A1A]/35 mb-1 leading-none">
                  {label}
                </p>
                <p className="font-mono text-[13px] font-bold text-[#1A1A1A] leading-none tabular-nums">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Buffer size select */}
          <div>
            <label className="font-mono text-[8px] uppercase tracking-widest text-[#1A1A1A]/45 block mb-1.5">
              Buffer Size
            </label>
            <select
              value={bufferSize}
              onChange={(e) => setBufferSize(e.target.value)}
              className="w-full bg-white border-2 border-[#1A1A1A] rounded-xl px-3 py-2 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-[#C1E1C1] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
            >
              {["128", "256", "512", "1024", "2048"].map((s) => (
                <option key={s} value={s}>{s} samples</option>
              ))}
            </select>
          </div>

          {/* Input device */}
          <div>
            <label className="font-mono text-[8px] uppercase tracking-widest text-[#1A1A1A]/45 block mb-1.5">
              Input Device
            </label>
            <select
              value={inputDevice}
              onChange={(e) => setInputDevice(e.target.value)}
              className="w-full bg-white border-2 border-[#1A1A1A] rounded-xl px-3 py-2 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-[#C1E1C1] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
            >
              {["Built-in Microphone", "Scarlett 2i2 (USB)", "Apollo Twin MKII", "BlackHole 2ch"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#C1E1C1]/25 border-2 border-[#C1E1C1] rounded-xl">
            <div className="w-2 h-2 rounded-full bg-[#3DBE4E] shadow-[0_0_6px_rgba(61,190,78,0.6)] animate-pulse flex-shrink-0" />
            <span className="font-mono text-[9px] font-bold text-[#1A1A1A]/60 uppercase tracking-widest">
              Audio engine active
            </span>
          </div>
        </div>

        <div className="px-5 py-4 border-t-2 border-[#1A1A1A] flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border-2 border-[#1A1A1A] rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-y-px hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#C1E1C1] border-2 border-[#1A1A1A] rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:translate-y-px hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Brutalist Toast ──────────────────────────────────────────────────────────

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-20 right-5 z-[60] pointer-events-none">
      <div className="border-2 border-[#1A1A1A] bg-[#C1E1C1] rounded-xl px-4 py-2.5 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex items-center gap-2.5 animate-[fadeInUp_0.2s_ease-out]">
        <div className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] animate-pulse" />
        <span className="font-mono text-[11px] font-bold text-[#1A1A1A]">{message}</span>
      </div>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── v2.0 Tooltip ────────────────────────────────────────────────────────────

function V2Tooltip({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2400);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="absolute top-full left-0 mt-2 z-50 pointer-events-none">
      <div className="border-2 border-[#1A1A1A] bg-[#1A1A1A] rounded-xl px-3 py-2 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] whitespace-nowrap">
        <span className="font-mono text-[10px] font-bold text-[#C1E1C1] uppercase tracking-widest">
          Feature coming in v2.0
        </span>
      </div>
    </div>
  );
}

// ─── Dropdown Menu ────────────────────────────────────────────────────────────

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  divider?: boolean;
}

function DropdownMenu({ items }: { items: MenuItem[] }) {
  return (
    <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] bg-[#FDFDFB] border-2 border-[#1A1A1A] rounded-xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] py-1 overflow-hidden">
      {items.map((item, i) => (
        <div key={i}>
          {item.divider && i > 0 && (
            <div className="h-px bg-[#1A1A1A]/10 mx-3 my-1" />
          )}
          <button
            onClick={item.action}
            className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[#F0F0EB] transition-colors group"
          >
            <span className="font-mono text-[11px] font-bold text-[#1A1A1A] group-hover:text-[#1A1A1A]">
              {item.label}
            </span>
            {item.shortcut && (
              <span className="font-mono text-[9px] text-[#1A1A1A]/30 ml-6">
                {item.shortcut}
              </span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

type OpenMenu = "file" | "agent" | null;

export default function Header() {
  const [openMenu, setOpenMenu]       = useState<OpenMenu>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const [blinkOpen, setBlinkOpen]       = useState(false);
  const [ampOpen,   setAmpOpen]         = useState(false);
  const [toast, setToast]               = useState<string | null>(null);
  const [v2Tooltip, setV2Tooltip]       = useState<"mastering" | "stems" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { state } = useDAWContext();
  const session = { bpm: state.transport.bpm, key: "F Minor" };
  const navRef = useRef<HTMLElement>(null);
  const lastTransientRef = useRef(0);
  const rafRef = useRef(0);

  // Transient detection — bounces header + rumbles screen only on loud audio peaks
  useEffect(() => {
    const THRESHOLD = 0.65; // peak amplitude required to trigger (0–1)
    const COOLDOWN_MS = 380; // min ms between triggers

    function tick() {
      rafRef.current = requestAnimationFrame(tick);
      if (!toneEngine.isReady()) return;

      const waveform = toneEngine.getWaveformValues();
      let peak = 0;
      for (let i = 0; i < waveform.length; i++) {
        const v = Math.abs(waveform[i]);
        if (v > peak) peak = v;
      }

      if (peak > THRESHOLD && Date.now() - lastTransientRef.current > COOLDOWN_MS) {
        lastTransientRef.current = Date.now();

        // Header bounce
        const nav = navRef.current;
        if (nav) {
          nav.classList.remove("wonder-transient-bounce");
          void nav.offsetWidth; // force reflow to restart animation
          nav.classList.add("wonder-transient-bounce");
        }

        // Full-screen rumble
        document.documentElement.classList.remove("wonder-screen-rumble");
        void document.documentElement.offsetWidth;
        document.documentElement.classList.add("wonder-screen-rumble");
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      // Clean up any lingering animation classes on unmount
      navRef.current?.classList.remove("wonder-transient-bounce");
      document.documentElement.classList.remove("wonder-screen-rumble");
    };
  }, []);

  const showToast = (msg: string) => { setToast(null); setTimeout(() => setToast(msg), 10); };

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Close dropdown on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpenMenu(null); setSettingsOpen(false); setProfileOpen(false); setBlinkOpen(false); setAmpOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const triggerExport = (dawName: string) => {
    setOpenMenu(null);
    showToast(`Packaging session for ${dawName}…`);
    setTimeout(() => showToast("Export Complete! Check your downloads."), 2000);
  };

  const fileItems: MenuItem[] = [
    {
      label: "Save Session",
      shortcut: "⌘S",
      action: () => { setOpenMenu(null); showToast("Saving session…"); },
    },
    {
      label: "Export Stem Render (.wav)",
      shortcut: "⌘⇧E",
      divider: true,
      action: () => triggerExport("Stem Render"),
    },
    {
      label: "Export to Ableton Live (.als)",
      action: () => triggerExport("Ableton Live"),
    },
    {
      label: "Export to FL Studio (.flp)",
      action: () => triggerExport("FL Studio"),
    },
    {
      label: "Export to Logic Pro (.logicx)",
      action: () => triggerExport("Logic Pro"),
    },
    {
      label: "Export to Pro Tools (.ptx)",
      action: () => triggerExport("Pro Tools"),
    },
    {
      label: "⬡  Export as Solana Blink…",
      divider: true,
      action: () => { setOpenMenu(null); setBlinkOpen(true); },
    },
  ];

  const agentItems: MenuItem[] = [
    {
      label: "AI Mastering",
      action: () => { setOpenMenu(null); setV2Tooltip("mastering"); },
    },
    {
      label: "Stem Separation (Beta)",
      divider: true,
      action: () => { setOpenMenu(null); setV2Tooltip("stems"); },
    },
  ];

  return (
    <>
      <nav
        ref={navRef}
        className="flex-shrink-0 flex items-center px-5 h-[44px] bg-[#FDFDFB] border-b-2 border-[#1A1A1A] z-[60] relative gap-3 origin-top will-change-transform"
      >
        {/* Centered WONDER wordmark */}
        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-none select-none">
          <span className="font-black uppercase tracking-widest text-[#1A1A1A]" style={{ fontFamily: "system-ui, Impact, 'Arial Black', sans-serif", fontSize: 22, letterSpacing: 4 }}>
            WONDER
          </span>
        </div>

        {/* Nav items */}
        <div ref={menuRef} className="flex items-center gap-0.5">

          {/* File */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "file" ? null : "file")}
              className={`flex items-center gap-1 px-3 py-1 text-[12px] rounded-sm transition-colors font-mono font-bold uppercase tracking-wide ${
                openMenu === "file"
                  ? "bg-[#1A1A1A] text-white"
                  : "text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#F0F0EB]"
              }`}
            >
              File
              <ChevronDown
                size={10}
                strokeWidth={2.5}
                className={`transition-transform ${openMenu === "file" ? "rotate-180" : ""}`}
              />
            </button>
            {openMenu === "file" && <DropdownMenu items={fileItems} />}
          </div>

          {/* Agent */}
          <div className="relative">
            <button
              onClick={() => setOpenMenu(openMenu === "agent" ? null : "agent")}
              className={`flex items-center gap-1.5 px-3 py-1 text-[12px] rounded-sm transition-colors font-mono font-bold uppercase tracking-wide ${
                openMenu === "agent"
                  ? "bg-[#1A1A1A] text-white"
                  : "text-[#1A1A1A]/50 hover:text-[#1A1A1A] hover:bg-[#F0F0EB]"
              }`}
            >
              <Sparkles size={10} strokeWidth={2} />
              Agent
              <ChevronDown
                size={10}
                strokeWidth={2.5}
                className={`transition-transform ${openMenu === "agent" ? "rotate-180" : ""}`}
              />
            </button>
            {openMenu === "agent" && (
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[210px] bg-[#FDFDFB] border-2 border-[#1A1A1A] rounded-xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] py-1 overflow-visible">
                {agentItems.map((item, i) => (
                  <div key={i} className="relative">
                    {item.divider && i > 0 && <div className="h-px bg-[#1A1A1A]/10 mx-3 my-1" />}
                    <button
                      onClick={item.action}
                      className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[#F0F0EB] transition-colors group"
                    >
                      <span className="font-mono text-[11px] font-bold text-[#1A1A1A]">{item.label}</span>
                      <span className="font-mono text-[8px] bg-[#E9D5FF] border border-[#1A1A1A] px-1.5 py-0.5 rounded-full text-[#1A1A1A]/60 ml-3">
                        v2
                      </span>
                    </button>
                    {/* Inline v2 tooltip */}
                    {v2Tooltip === (item.label === "AI Mastering" ? "mastering" : "stems") && (
                      <V2Tooltip onClose={() => setV2Tooltip(null)} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* BPM / KEY / TIME readout */}
	        <div className="flex border-2 border-[#1A1A1A] rounded-sm overflow-hidden shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
          <div className="flex flex-col items-center justify-center px-4 py-1 border-r border-[#D8D8D2] bg-[#FAFAF6]">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[2px]">BPM</span>
            <span className="text-[13px] font-bold font-mono text-[#1a1a1a] leading-none tabular-nums">
              {session.bpm.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-1 border-r border-[#D8D8D2] bg-[#FAFAF6]">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[2px]">KEY</span>
            <span className="text-[13px] font-bold font-mono text-[#D32F2F] leading-none">{session.key}</span>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-1 bg-[#FAFAF6]">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[2px]">TIME</span>
            <span className="text-[13px] font-bold font-mono text-[#1a1a1a] leading-none">4 / 4</span>
          </div>
        </div>

        {/* Amp Rack */}
          <button
            onClick={() => setAmpOpen(true)}
            className={`w-[32px] h-[32px] rounded-sm border-2 border-[#1A1A1A] flex items-center justify-center transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] ${
              ampOpen
                ? "bg-[#1A1A1A] text-white"
                : "bg-[#FDFDFB] text-[#1A1A1A]/40 hover:bg-[#F0F0EB] hover:text-[#1A1A1A]"
            }`}
            title="Guitar Amp"
          >
            <Guitar size={14} strokeWidth={1.5} />
          </button>

        {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-[32px] h-[32px] rounded-sm border-2 border-[#1A1A1A] flex items-center justify-center hover:bg-[#F0F0EB] transition-colors text-[#1A1A1A]/40 hover:text-[#1A1A1A] bg-[#FDFDFB] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
            title="Audio engine settings"
          >
          <Settings size={14} strokeWidth={1.5} />
        </button>

        {/* Profile */}
          <button
            onClick={() => setProfileOpen(true)}
            className="w-[32px] h-[32px] rounded-sm bg-[#1A1A1A] flex items-center justify-center hover:bg-[#333] transition-colors border-2 border-[#1A1A1A] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
            title=".wonderprofile"
          >
          <User size={13} strokeWidth={1.5} color="white" />
        </button>
      </nav>

      {/* Modals */}
      {settingsOpen && <AudioEngineModal onClose={() => setSettingsOpen(false)} />}
      {profileOpen  && <WonderProfileModal onClose={() => setProfileOpen(false)} />}
      {blinkOpen    && <SolanaBlinkModal onClose={() => setBlinkOpen(false)} />}
      {ampOpen      && <AmpRack onClose={() => setAmpOpen(false)} />}

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </>
  );
}
