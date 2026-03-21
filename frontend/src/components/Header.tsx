"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import WonderProfileModal from "./WonderProfileModal";

export default function Header() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/ableton-state");
        const data = await res.json();
        setConnected(data.connected ?? false);
      } catch {
        setConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <nav className="flex-shrink-0 flex justify-between items-center px-6 h-14 bg-[#FDFDFB] border-b-2 border-[#2D2D2D] hard-shadow z-10 relative">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <span className="text-2xl font-black text-[#2D2D2D] italic font-headline tracking-tighter">
            Wonder
          </span>
          <div className="hidden md:flex gap-6">
            <a
              href="#"
              className="font-headline font-bold text-sm text-[#2D2D2D] border-b-2 border-[#C1E1C1] pb-0.5"
            >
              Studio
            </a>
            <a
              href="#"
              className="font-headline font-bold text-sm text-[#2D2D2D]/50 hover:text-[#2D2D2D] transition-colors"
            >
              Library
            </a>
            <a
              href="#"
              className="font-headline font-bold text-sm text-[#2D2D2D]/50 hover:text-[#2D2D2D] transition-colors"
            >
              History
            </a>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Status dot */}
          <div className="flex items-center gap-2 bg-white border-2 border-[#2D2D2D] px-3 py-1.5 rounded-xl hard-shadow-sm">
            <div className={`w-1.5 h-1.5 border border-[#2D2D2D] rounded-full ${connected ? "bg-[#C1E1C1]" : "bg-[#fa7150] animate-pulse"}`} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest">
              {connected ? "Ableton Live" : "Not Connected"}
            </span>
          </div>

          <button
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 bg-white border-2 border-[#2D2D2D] px-4 py-2 rounded-xl hard-shadow-sm interactive-push"
          >
            <Settings size={14} strokeWidth={2.5} />
            <span className="font-headline font-bold text-sm">.wonderprofile</span>
          </button>
        </div>
      </nav>

      {profileOpen && <WonderProfileModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}
