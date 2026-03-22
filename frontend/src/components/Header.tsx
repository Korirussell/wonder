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
      <nav className="flex-shrink-0 flex items-center px-5 h-12 bg-white border-b border-[#DEDEDE] z-10 relative gap-4">
        {/* Logo */}
        <span className="text-[18px] font-black text-[#2D2D2D] italic font-headline tracking-tighter mr-2 select-none">
          Wonder
        </span>

        {/* Nav items */}
        <div className="flex items-center gap-0.5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`px-3 py-1 text-[13px] rounded transition-colors ${
                activeNav === item
                  ? "text-[#3da84a] font-semibold"
                  : "text-[#2D2D2D]/50 hover:text-[#2D2D2D] font-medium"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* BPM / KEY / TIME display */}
        <div className="flex border border-[#D8D8D8] rounded overflow-hidden">
          <div className="flex flex-col items-center justify-center px-5 py-1 border-r border-[#D8D8D8]">
            <span className="text-[8.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[3px]">
              BPM
            </span>
            <span className="text-[14px] font-bold font-mono text-[#2D2D2D] leading-none">
              {session.bpm.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-5 py-1 border-r border-[#D8D8D8]">
            <span className="text-[8.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[3px]">
              KEY
            </span>
            <span className="text-[14px] font-bold font-mono text-[#E03030] leading-none">
              {session.key || "F Minor"}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-5 py-1">
            <span className="text-[8.5px] font-mono font-bold uppercase tracking-[0.18em] text-[#aaa] leading-none mb-[3px]">
              TIME
            </span>
            <span className="text-[14px] font-bold font-mono text-[#2D2D2D] leading-none">
              4 / 4
            </span>
          </div>
        </div>

        {/* Settings + profile */}
        <button
          onClick={() => setProfileOpen(true)}
          className="w-[34px] h-[34px] rounded-full border border-[#D8D8D8] flex items-center justify-center hover:bg-gray-50 transition-colors text-[#2D2D2D]/50 hover:text-[#2D2D2D]"
        >
          <Settings size={15} strokeWidth={1.5} />
        </button>
        <button className="w-[34px] h-[34px] rounded-full bg-[#2D2D2D] flex items-center justify-center">
          <User size={14} strokeWidth={1.5} color="white" />
        </button>
      </nav>

      {profileOpen && <WonderProfileModal onClose={() => setProfileOpen(false)} />}
    </>
  );
}
