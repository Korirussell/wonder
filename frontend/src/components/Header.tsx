"use client";

import { useState } from "react";
import { Settings, User } from "lucide-react";
import WonderProfileModal from "./WonderProfileModal";
import { useDAWContext } from "@/lib/DAWContext";

const NAV_ITEMS = ["File", "Edit", "Track", "View", "Settings"];

export default function Header() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Track");
  const { state } = useDAWContext();
  const session = { bpm: state.transport.bpm, key: "F Minor" };

  return (
    <>
      <nav className="flex-shrink-0 flex items-center px-5 h-[44px] bg-[#FDFDFB] border-b border-[#D8D8D2] z-10 relative gap-4">
        {/* Logo */}
        <span className="text-[17px] font-black text-[#2D2D2D] italic font-headline tracking-tighter mr-3 select-none">
          Wonder
        </span>

        {/* Nav items */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`px-3 py-1 text-[12.5px] rounded transition-colors font-sans ${activeNav === item
                  ? "text-[#3da84a] font-semibold"
                  : "text-[#2D2D2D]/50 hover:text-[#2D2D2D] font-medium"
                }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* BPM / KEY / TIME display — matches the mockup's top-right readout */}
        <div className="flex border border-[#D8D8D2] rounded overflow-hidden">
          <div className="flex flex-col items-center justify-center px-4 py-1 border-r border-[#D8D8D2] bg-[#FAFAF6]">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[2px]">
              BPM
            </span>
            <span className="text-[13px] font-bold font-mono text-[#1a1a1a] leading-none tabular-nums">
              {session.bpm.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-1 border-r border-[#D8D8D2] bg-[#FAFAF6]">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[2px]">
              KEY
            </span>
            <span className="text-[13px] font-bold font-mono text-[#D32F2F] leading-none">
              {session.key || "F Minor"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-4 py-1 bg-[#FAFAF6]">
            <span className="text-[7.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[2px]">
              TIME
            </span>
            <span className="text-[13px] font-bold font-mono text-[#1a1a1a] leading-none">
              4 / 4
            </span>
          </div>
        </div>

        {/* Settings + profile */}
        <button
          className="w-[32px] h-[32px] rounded-full border border-[#D8D8D2] flex items-center justify-center hover:bg-[#F0F0EB] transition-colors text-[#2D2D2D]/40 hover:text-[#2D2D2D]"
        >
          <Settings size={14} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => setProfileOpen(true)}
          className="w-[32px] h-[32px] rounded-full bg-[#2D2D2D] flex items-center justify-center hover:bg-[#1a1a1a] transition-colors"
          title="Profile"
        >
          <User size={13} strokeWidth={1.5} color="white" />
        </button>
      </nav>

      {profileOpen && <WonderProfileModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}
