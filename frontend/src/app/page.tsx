import Header from "@/components/Header";
import CopilotChat from "@/components/CopilotChat";
import SessionMirror from "@/components/SessionMirror";

export default function Home() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header />
      <main className="flex flex-1 overflow-hidden">
        <CopilotChat />
        <SessionMirror />
      </main>
      {/* Status footer */}
      <footer className="flex-shrink-0 bg-[#FDFDFB] border-t-2 border-[#2D2D2D] px-8 py-2 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-[#C1E1C1] border border-[#2D2D2D] rounded-full" />
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">
            Wonder Core v1.0 // Gemini-2.5-Flash
          </span>
        </div>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-30">
          Ableton Live 12 // localhost:9877
        </span>
      </footer>
    </div>
  );
}
