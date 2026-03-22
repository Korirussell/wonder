"use client";

/**
 * AmpRack — Guitar Amp Simulation Panel
 *
 * Signal chain: UserMedia (guitar/mic input)
 *   → Gain (preamp)  → Distortion (overdrive)
 *   → EQ3 (bass/mid/treble)  → Filter (cab hi-cut)
 *   → Reverb (spring)  → Volume (master)  → toneEngine master
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Power } from "lucide-react";
import { toneEngine } from "@/lib/toneEngine";

// ─── Amp model presets ────────────────────────────────────────────────────────

interface AmpPreset {
  label: string;
  gain: number;       // 0.5–8
  drive: number;      // 0–1
  bass: number;       // dB
  mid: number;
  treble: number;
  presence: number;   // cab freq Hz
  reverb: number;     // 0–1
}

const PRESETS: AmpPreset[] = [
  { label: "Clean",  gain: 1.5, drive: 0,    bass: 2,   mid: 0,  treble: 1,  presence: 6000, reverb: 0.1 },
  { label: "Crunch", gain: 3,   drive: 0.35, bass: 3,   mid: -2, treble: 3,  presence: 5000, reverb: 0.15 },
  { label: "Lead",   gain: 6,   drive: 0.65, bass: 4,   mid: -4, treble: 4,  presence: 4500, reverb: 0.2 },
  { label: "Jazz",   gain: 1,   drive: 0,    bass: 3,   mid: 3,  treble: -2, presence: 3800, reverb: 0.25 },
];

// ─── Rotary Knob ─────────────────────────────────────────────────────────────

interface KnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  unit?: string;
  color?: string;
  onChange: (v: number) => void;
}

function Knob({ value, min, max, label, unit, color = "#C1E1C1", onChange }: KnobProps) {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const pct   = (value - min) / (max - min);
  const angle = -135 + pct * 270;
  const rad   = (angle * Math.PI) / 180;
  const cx = 24, cy = 24, r = 15;
  const dotX  = cx + r * Math.sin(rad);
  const dotY  = cy - r * Math.cos(rad);

  // Arc path from -135° to current angle
  const startRad = (-135 * Math.PI) / 180;
  const ax0 = cx + r * Math.sin(startRad);
  const ay0 = cy - r * Math.cos(startRad);
  const largeArc = pct > 0.5 ? 1 : 0;
  const arcPath  = `M ${ax0} ${ay0} A ${r} ${r} 0 ${largeArc} 1 ${dotX} ${dotY}`;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta   = dragRef.current.startY - ev.clientY; // up = +
      const range   = max - min;
      const newVal  = Math.max(min, Math.min(max, dragRef.current.startVal + (delta / 120) * range));
      onChange(Math.round(newVal * 1000) / 1000);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [value, min, max, onChange]);

  const displayVal = unit === "Hz"
    ? `${(value / 1000).toFixed(1)}k`
    : Math.round(value * 10) / 10;

  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-ns-resize select-none group"
      onMouseDown={handleMouseDown}
      title={`${label}: ${displayVal}${unit ?? ""}`}
    >
      <svg width="52" height="52" viewBox="0 0 48 48">
        {/* Track ring */}
        <circle cx="24" cy="24" r="15" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.5" />
        {/* Filled arc */}
        <path d={arcPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
        {/* Knob body */}
        <circle cx="24" cy="24" r="11" fill="#2C2C2C" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        <circle cx="24" cy="24" r="10" fill="url(#ampKnobGrad)" />
        {/* Indicator dot */}
        <circle cx={dotX} cy={dotY} r="2" fill={color} />
        <defs>
          <radialGradient id="ampKnobGrad" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#4A4A4A" />
            <stop offset="100%" stopColor="#1E1E1E" />
          </radialGradient>
        </defs>
      </svg>
      <span className="font-mono text-[7.5px] uppercase tracking-widest text-white/35 group-hover:text-white/60 transition-colors text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ─── Live Waveform Canvas ─────────────────────────────────────────────────────

function AmpWaveform({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W, H);

      // Background grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth   = 1;
      for (let x = 0; x < W; x += W / 8) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();

      if (!active) {
        // Idle flat line
        ctx.strokeStyle = "rgba(153, 69, 255, 0.3)";
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, H / 2);
        ctx.lineTo(W, H / 2);
        ctx.stroke();
        return;
      }

      const data = toneEngine.getAmpWaveform();
      const step = W / data.length;

      // Glow pass
      ctx.shadowBlur   = 8;
      ctx.shadowColor  = "#9945FF";
      ctx.strokeStyle  = "rgba(153, 69, 255, 0.5)";
      ctx.lineWidth    = 3;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = H / 2 + data[i] * (H / 2) * 0.9;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Sharp line pass
      ctx.shadowBlur  = 0;
      ctx.strokeStyle = "#14F195";
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = H / 2 + data[i] * (H / 2) * 0.9;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={440}
      height={60}
      className="w-full rounded-lg"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

// ─── VU Meter ─────────────────────────────────────────────────────────────────

function VUMeter({ active }: { active: boolean }) {
  const [level, setLevel] = useState(-Infinity);

  useEffect(() => {
    if (!active) { setLevel(-Infinity); return; }
    const id = setInterval(() => { setLevel(toneEngine.getAmpMeterValue()); }, 80);
    return () => clearInterval(id);
  }, [active]);

  const pct = Math.max(0, Math.min(1, (level + 60) / 60)); // -60dB…0dB → 0…1
  const bars = 16;

  return (
    <div className="flex items-end gap-[2px] h-5">
      {Array.from({ length: bars }, (_, i) => {
        const threshold = i / bars;
        const lit = pct >= threshold;
        const color = i >= 13 ? "#FF4444" : i >= 10 ? "#FFB800" : "#14F195";
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px] transition-all duration-75"
            style={{ height: "100%", background: lit ? color : "rgba(255,255,255,0.06)" }}
          />
        );
      })}
    </div>
  );
}

// ─── AmpRack Panel ────────────────────────────────────────────────────────────

interface AmpRackProps { onClose: () => void; }

export default function AmpRack({ onClose }: AmpRackProps) {
  const [active,   setActive]   = useState(false);
  const [preset,   setPreset]   = useState(0);
  const [error,    setError]    = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Knob state — initialised from PRESETS[0]
  const [gain,     setGain]     = useState(PRESETS[0].gain);
  const [drive,    setDrive]    = useState(PRESETS[0].drive);
  const [bass,     setBass]     = useState(PRESETS[0].bass);
  const [mid,      setMid]      = useState(PRESETS[0].mid);
  const [treble,   setTreble]   = useState(PRESETS[0].treble);
  const [presence, setPresence] = useState(PRESETS[0].presence);
  const [reverb,   setReverb]   = useState(PRESETS[0].reverb);
  const [master,   setMaster]   = useState(-6);

  // Push knob changes to engine
  useEffect(() => { toneEngine.setAmpGain(gain); },     [gain]);
  useEffect(() => { toneEngine.setAmpDistortion(drive); }, [drive]);
  useEffect(() => { toneEngine.setAmpEQ(bass, mid, treble); }, [bass, mid, treble]);
  useEffect(() => { toneEngine.setAmpPresence(presence); }, [presence]);
  useEffect(() => { toneEngine.setAmpReverb(reverb); },   [reverb]);
  useEffect(() => { toneEngine.setAmpMasterVolume(master); }, [master]);

  const applyPreset = (idx: number) => {
    const p = PRESETS[idx];
    setPreset(idx);
    setGain(p.gain); setDrive(p.drive);
    setBass(p.bass); setMid(p.mid); setTreble(p.treble);
    setPresence(p.presence); setReverb(p.reverb);
  };

  const togglePower = async () => {
    setError(null);
    if (active) {
      toneEngine.stopAmp();
      setActive(false);
    } else {
      setStarting(true);
      try {
        await toneEngine.startAmp();
        setActive(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Mic access denied");
      } finally {
        setStarting(false);
      }
    }
  };

  // Close disposes amp
  const handleClose = () => {
    if (active) toneEngine.stopAmp();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      {/* Amp head chassis */}
      <div
        className="w-full max-w-lg mx-4 rounded-2xl border-2 border-[#1A1A1A] overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #1C1C1C 0%, #141414 100%)",
          boxShadow: "6px 6px 0px 0px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Faceplate header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Power LED + button */}
            <button
              onClick={togglePower}
              disabled={starting}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors disabled:opacity-50"
              style={{ background: active ? "rgba(20, 241, 149, 0.08)" : "rgba(255,255,255,0.04)" }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full border border-black/30 flex-shrink-0"
                style={{
                  background: active ? "#14F195" : "#333",
                  boxShadow: active ? "0 0 8px #14F195, 0 0 16px rgba(20,241,149,0.4)" : "none",
                }}
              />
              <Power size={11} strokeWidth={2} color={active ? "#14F195" : "rgba(255,255,255,0.3)"} />
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest"
                style={{ color: active ? "#14F195" : "rgba(255,255,255,0.3)" }}>
                {starting ? "Starting…" : active ? "On" : "Off"}
              </span>
            </button>

            {/* Brand plate */}
            <div>
              <span className="font-mono text-[14px] font-black uppercase tracking-[0.2em] text-white/90">
                Wonder
              </span>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] ml-2"
                style={{ color: "#9945FF" }}>
                AMP
              </span>
              <p className="font-mono text-[7px] uppercase tracking-[0.2em] text-white/20 mt-0.5">
                Valve Simulation · Studio Edition
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X size={13} strokeWidth={2} color="rgba(255,255,255,0.4)" />
          </button>
        </div>

        {/* Oscilloscope / waveform */}
        <div className="mx-5 mt-4 rounded-lg border border-white/[0.06] overflow-hidden"
          style={{ background: "#0A0A0A" }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.05]">
            <span className="font-mono text-[7px] uppercase tracking-widest text-white/25">Signal</span>
            <VUMeter active={active} />
          </div>
          <div className="p-2">
            <AmpWaveform active={active} />
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10">
            <p className="font-mono text-[9px] text-red-400">{error} — check browser mic permissions</p>
          </div>
        )}

        {/* Amp model selector */}
        <div className="px-5 mt-4 flex gap-1.5">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => applyPreset(i)}
              className="flex-1 py-1.5 rounded-md border font-mono text-[9px] font-bold uppercase tracking-widest transition-all"
              style={{
                borderColor: preset === i ? "#9945FF" : "rgba(255,255,255,0.08)",
                color:       preset === i ? "#9945FF" : "rgba(255,255,255,0.3)",
                background:  preset === i ? "rgba(153,69,255,0.12)" : "transparent",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Knob section */}
        <div className="px-5 pt-5 pb-2">
          {/* Divider label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="font-mono text-[7px] uppercase tracking-[0.2em] text-white/20">Tone Stack</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Top row: Gain, Drive, Bass, Mid, Treble */}
          <div className="flex justify-between items-start px-2 mb-5">
            <Knob value={gain}   min={0.5} max={8}    label="Gain"   color="#9945FF" onChange={setGain} />
            <Knob value={drive}  min={0}   max={1}    label="Drive"  color="#FF6B35" onChange={setDrive} />
            <div className="w-px self-stretch mx-1" style={{ background: "rgba(255,255,255,0.05)" }} />
            <Knob value={bass}   min={-12} max={12}   label="Bass"   unit="dB" onChange={setBass} />
            <Knob value={mid}    min={-12} max={12}   label="Mid"    unit="dB" onChange={setMid} />
            <Knob value={treble} min={-12} max={12}   label="Treble" unit="dB" onChange={setTreble} />
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="font-mono text-[7px] uppercase tracking-[0.2em] text-white/20">Output</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Bottom row: Presence, Reverb, Master */}
          <div className="flex justify-center gap-10 items-start px-2 mb-2">
            <Knob value={presence} min={2000} max={9000} label="Presence" unit="Hz" color="#14F195" onChange={setPresence} />
            <Knob value={reverb}   min={0}    max={1}    label="Spring"              color="#14F195" onChange={setReverb} />
            <Knob value={master}   min={-30}  max={0}    label="Master"  unit="dB"  color="#FFB800" onChange={setMaster} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
          <p className="font-mono text-[7px] text-white/15 uppercase tracking-widest">
            Plug guitar into your audio interface · select it as mic input
          </p>
          <div className="flex gap-1">
            {["●", "●", "●"].map((d, i) => (
              <span key={i} className="text-[6px]"
                style={{ color: active ? (i === 0 ? "#14F195" : i === 1 ? "#9945FF" : "#FF6B35") : "rgba(255,255,255,0.1)" }}>
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
