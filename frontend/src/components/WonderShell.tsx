"use client";

import AiAura from "@/components/AiAura";
import Header from "@/components/Header";
import LeftPane from "@/components/LeftPane";
import DAWView from "@/components/daw/DAWView";
import { useDAWContext } from "@/lib/DAWContext";

export default function WonderShell() {
  const { state } = useDAWContext();

  return (
    <div className="wonder-shell h-screen flex flex-col overflow-hidden bg-[#FDFDFB]">
      <AiAura />
      <Header />
      <main className="flex flex-1 overflow-hidden">
        <div className={state.kidsMode ? "hidden" : "contents"}>
          <LeftPane />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <DAWView />
        </div>
      </main>
    </div>
  );
}
