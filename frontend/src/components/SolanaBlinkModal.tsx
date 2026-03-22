"use client";

import { useState } from "react";
import { X, Copy, Check, ExternalLink, Zap } from "lucide-react";

// ─── Waveform bars (decorative) ──────────────────────────────────────────────

const BARS = [
  4,7,12,18,22,15,28,35,42,38,30,45,50,42,35,28,22,18,25,32,
  38,45,40,32,25,20,15,12,8,5,10,16,22,28,34,28,22,16,10,7,
];

function MiniWaveform({ accent = "#9945FF", height = 44 }: { accent?: string; height?: number }) {
  const mid = height / 2;
  return (
    <div
      className="flex items-center gap-[2px] w-full"
      style={{ height }}
      aria-hidden
    >
      {BARS.map((v, i) => {
        const barH = Math.max(2, (v / 50) * height);
        return (
          <div
            key={i}
            className="flex-1 rounded-[1px]"
            style={{
              height: barH,
              background: i % 3 === 0 ? "#14F195" : accent,
              opacity: 0.75 + (v / 50) * 0.25,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Solana Logo ─────────────────────────────────────────────────────────────

function SolanaLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M3.27 11.65H16.8a.5.5 0 0 1 .36.85l-1.96 2.06a.5.5 0 0 1-.36.15H1.31a.5.5 0 0 1-.36-.85l1.96-2.06a.5.5 0 0 1 .36-.15zM3.27 1.29H16.8a.5.5 0 0 1 .36.85L15.2 4.2a.5.5 0 0 1-.36.15H1.31a.5.5 0 0 1-.36-.85l1.96-2.06a.5.5 0 0 1 .36-.15zM15.2 6.47a.5.5 0 0 1 .36.15l1.96 2.06a.5.5 0 0 1-.36.85H3.63a.5.5 0 0 1-.36-.15L1.31 7.32a.5.5 0 0 1 .36-.85H15.2z"
        fill="white"
      />
    </svg>
  );
}

// ─── Step: Setup ─────────────────────────────────────────────────────────────

interface SetupViewProps {
  trackName: string;
  price: string;
  setPrice: (v: string) => void;
  splitTreasury: boolean;
  setSplitTreasury: (v: boolean) => void;
  onGenerate: () => void;
}

function SetupView({ trackName, price, setPrice, splitTreasury, setSplitTreasury, onGenerate }: SetupViewProps) {
  return (
    <div className="p-5 space-y-4">
      {/* Track waveform card */}
      <div className="border-2 border-[#1A1A1A] rounded-xl p-3 bg-[#0F0F14] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/30">Selected Clip</span>
          <span className="font-mono text-[9px] font-bold text-[#14F195]">{trackName}</span>
        </div>
        <MiniWaveform height={44} />
      </div>

      {/* Price input */}
      <div>
        <label className="font-mono text-[8px] uppercase tracking-widest text-[#1A1A1A]/45 block mb-1.5">
          Set Price (SOL)
        </label>
        <div className="flex items-center border-2 border-[#1A1A1A] rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <div className="px-3 py-2.5 bg-[#1A1A1A] flex items-center gap-1.5 border-r-2 border-[#1A1A1A]">
            <div
              className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #9945FF, #14F195)" }}
            >
              <SolanaLogo size={9} />
            </div>
            <span className="font-mono text-[10px] font-bold text-white">SOL</span>
          </div>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="flex-1 px-3 py-2.5 bg-white font-mono text-[14px] font-bold text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#9945FF] tabular-nums"
          />
          <div className="px-3 py-2.5 bg-[#FAFAF6] border-l-2 border-[#1A1A1A]">
            <span className="font-mono text-[9px] text-[#1A1A1A]/35 tabular-nums">
              ≈ ${(parseFloat(price || "0") * 145).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Treasury toggle */}
      <button
        type="button"
        onClick={() => setSplitTreasury(!splitTreasury)}
        className="w-full flex items-center justify-between px-4 py-3 border-2 border-[#1A1A1A] rounded-xl bg-[#FAFAF8] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#F0F0EB] transition-colors group"
      >
        <div className="text-left">
          <p className="font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wide">
            Split 5% to Wonder AI Treasury
          </p>
          <p className="font-mono text-[8px] text-[#1A1A1A]/40 mt-0.5">
            Supports the API that built this loop
          </p>
        </div>
        <div
          className={`w-9 h-5 rounded-full border-2 border-[#1A1A1A] relative transition-colors flex-shrink-0 ${
            splitTreasury ? "bg-[#14F195]" : "bg-[#E0E0DA]"
          }`}
        >
          <div
            className={`absolute top-[1px] w-[13px] h-[13px] rounded-full bg-[#1A1A1A] transition-transform ${
              splitTreasury ? "translate-x-[14px]" : "translate-x-[1px]"
            }`}
          />
        </div>
      </button>

      {/* Royalty breakdown */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "You Receive", value: splitTreasury ? `${(parseFloat(price || "0") * 0.95).toFixed(3)}` : price, color: "#14F195" },
          { label: "Wonder Fee", value: splitTreasury ? `${(parseFloat(price || "0") * 0.05).toFixed(4)}` : "0.0000", color: "#9945FF" },
          { label: "Network Fee", value: "~0.000005", color: "#1A1A1A" },
        ].map(({ label, value, color }) => (
          <div key={label} className="border border-[#1A1A1A]/20 rounded-lg p-2 bg-[#FAFAF8] text-center">
            <p className="font-mono text-[7px] uppercase tracking-widest text-[#1A1A1A]/35 mb-1">{label}</p>
            <p className="font-mono text-[10px] font-bold tabular-nums" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={onGenerate}
        className="w-full py-3 rounded-xl border-2 border-[#1A1A1A] font-mono text-[12px] font-bold uppercase tracking-widest shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] hover:translate-y-px hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-y-[3px] active:shadow-none transition-all flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, #9945FF, #14F195)" }}
      >
        <Zap size={13} strokeWidth={2.5} color="white" />
        <span className="text-white">Generate Blink URL</span>
      </button>
    </div>
  );
}

// ─── Step: Loading ────────────────────────────────────────────────────────────

function LoadingView() {
  return (
    <div className="p-10 flex flex-col items-center justify-center gap-5">
      {/* Animated diamond */}
      <div
        className="w-14 h-14 rounded-2xl border-2 border-[#1A1A1A] flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]"
        style={{ background: "linear-gradient(135deg, #9945FF, #14F195)" }}
      >
        <div className="animate-spin">
          <SolanaLogo size={22} />
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#1A1A1A]">
          Compressing to cNFT
        </p>
        <p className="font-mono text-[9px] text-[#1A1A1A]/40 uppercase tracking-widest">
          Creating Action URL on Solana…
        </p>
      </div>

      {/* Fake progress steps */}
      <div className="w-full space-y-1.5 px-2">
        {["Encoding audio metadata", "Minting compressed NFT", "Registering Blink action"].map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #9945FF, #14F195)",
                animation: `pulse ${0.8 + i * 0.3}s ease-in-out infinite`,
              }}
            />
            <span className="font-mono text-[9px] text-[#1A1A1A]/50 uppercase tracking-wider">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step: Success ────────────────────────────────────────────────────────────

interface SuccessViewProps {
  price: string;
  trackName: string;
  url: string;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

function SuccessView({ price, trackName, url, copied, onCopy, onClose }: SuccessViewProps) {
  return (
    <div className="p-5 space-y-4">
      {/* Success badge */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#14F195]/15 border-2 border-[#14F195] rounded-xl">
        <div className="w-5 h-5 rounded-full bg-[#14F195] border-2 border-[#1A1A1A] flex items-center justify-center flex-shrink-0">
          <Check size={10} strokeWidth={3} className="text-[#1A1A1A]" />
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wide">Blink Created</p>
          <p className="font-mono text-[8px] text-[#1A1A1A]/50">cNFT minted · Action registered on Solana</p>
        </div>
      </div>

      {/* URL copy row */}
      <div>
        <label className="font-mono text-[8px] uppercase tracking-widest text-[#1A1A1A]/45 block mb-1.5">
          Your Blink URL
        </label>
        <div className="flex items-stretch border-2 border-[#1A1A1A] rounded-xl overflow-hidden shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
          <div className="flex-1 px-3 py-2.5 bg-[#FAFAF8] overflow-hidden">
            <p className="font-mono text-[9px] text-[#9945FF] truncate">{url}</p>
          </div>
          <button
            onClick={onCopy}
            className="px-3 bg-[#1A1A1A] border-l-2 border-[#1A1A1A] flex items-center gap-1.5 hover:bg-[#333] transition-colors"
          >
            {copied
              ? <Check size={12} strokeWidth={2.5} color="#14F195" />
              : <Copy size={12} strokeWidth={2} color="white" />
            }
            <span className="font-mono text-[9px] font-bold text-white">{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* ─── Twitter / X Card Preview ─── */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="font-mono text-[8px] uppercase tracking-widest text-[#1A1A1A]/45">Social Preview</span>
          <div className="flex-1 h-px bg-[#1A1A1A]/10" />
          <span className="font-mono text-[7px] text-[#1A1A1A]/25 uppercase">x.com / twitter</span>
        </div>

        {/* Card mock */}
        <div className="border-2 border-[#1A1A1A] rounded-2xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
          {/* Card header bar */}
          <div className="px-4 py-3 bg-[#0F0F14] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center border border-white/20"
                style={{ background: "linear-gradient(135deg, #9945FF, #14F195)" }}
              >
                <SolanaLogo size={11} />
              </div>
              <div>
                <p className="font-mono text-[9px] font-bold text-white leading-none">wonder.app</p>
                <p className="font-mono text-[7px] text-white/30 leading-none mt-0.5">AI-Generated Loop</p>
              </div>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 border border-white/20 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-[#14F195] animate-pulse" />
              <span className="font-mono text-[7px] text-white/50">Live on Solana</span>
            </div>
          </div>

          {/* Waveform section */}
          <div className="px-4 pt-3 pb-2 bg-[#0F0F14]">
            <MiniWaveform height={36} />
            <div className="flex items-center justify-between mt-2">
              <span className="font-mono text-[8px] text-white/30 uppercase tracking-wider">{trackName}</span>
              <span className="font-mono text-[8px] text-white/30">44.1kHz · WAV</span>
            </div>
          </div>

          {/* Price + CTA row */}
          <div className="px-4 py-3 bg-[#FDFDFB] border-t-2 border-[#1A1A1A] flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[7px] uppercase tracking-[0.18em] text-[#1A1A1A]/35 leading-none mb-1">Price</p>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-[20px] font-black text-[#1A1A1A] leading-none tabular-nums">{price}</span>
                <span className="font-mono text-[10px] font-bold text-[#9945FF]">SOL</span>
              </div>
            </div>
            <button
              className="flex-1 max-w-[160px] py-2.5 rounded-xl border-2 border-[#1A1A1A] font-mono text-[10px] font-bold uppercase tracking-wide shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] flex items-center justify-center gap-1.5"
              style={{ background: "linear-gradient(135deg, #9945FF, #14F195)" }}
              onClick={(e) => e.preventDefault()}
            >
              <span className="text-white">Buy &amp; Import to DAW</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex gap-2 pt-1">
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="flex-1 py-2 border-2 border-[#1A1A1A] rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest text-center shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:translate-y-px hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] transition-all flex items-center justify-center gap-1.5 bg-white"
        >
          <ExternalLink size={10} strokeWidth={2.5} />
          Share on X
        </a>
        <button
          onClick={onClose}
          className="flex-1 py-2 bg-[#1A1A1A] border-2 border-[#1A1A1A] rounded-xl font-mono text-[10px] font-bold uppercase tracking-widest text-white shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-[#333] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

export interface SolanaBlinkModalProps {
  trackName?: string;
  onClose: () => void;
}

export default function SolanaBlinkModal({ trackName = "AI Loop — Wonder", onClose }: SolanaBlinkModalProps) {
  const [step, setStep] = useState<"setup" | "loading" | "success">("setup");
  const [price, setPrice] = useState("0.05");
  const [splitTreasury, setSplitTreasury] = useState(true);
  const [copied, setCopied] = useState(false);

  const FAKE_URL = "https://dial.to/?action=solana-action:wonder.app/api/buy/loop-1a2b";

  const handleGenerate = () => {
    setStep("loading");
    setTimeout(() => setStep("success"), 1500);
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(FAKE_URL); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/35 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#FDFDFB] border-2 border-[#1A1A1A] rounded-2xl shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#1A1A1A] bg-[#0F0F14]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg border border-white/20 flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #9945FF, #14F195)" }}
            >
              <SolanaLogo size={14} />
            </div>
            <div>
              <h2 className="font-mono text-[12px] font-bold uppercase tracking-widest text-white">
                Export as Solana Blink
              </h2>
              <p className="font-mono text-[8px] text-white/30 uppercase tracking-widest">
                cNFT · Action URL · Instant Sale
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X size={13} strokeWidth={2.5} color="white" />
          </button>
        </div>

        {/* Body */}
        {step === "setup" && (
          <SetupView
            trackName={trackName}
            price={price}
            setPrice={setPrice}
            splitTreasury={splitTreasury}
            setSplitTreasury={setSplitTreasury}
            onGenerate={handleGenerate}
          />
        )}
        {step === "loading" && <LoadingView />}
        {step === "success" && (
          <SuccessView
            price={price}
            trackName={trackName}
            url={FAKE_URL}
            copied={copied}
            onCopy={handleCopy}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
