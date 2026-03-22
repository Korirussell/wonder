import { DAWProvider } from "@/lib/DAWContext";
import AiAura from "@/components/AiAura";
import Header from "@/components/Header";
import LeftPane from "@/components/LeftPane";
import DAWView from "@/components/daw/DAWView";

export default function Home() {
  return (
    <DAWProvider>
      <div className="wonder-shell h-screen flex flex-col overflow-hidden bg-[#FDFDFB]">
        <AiAura />
        <Header />
        <main className="flex flex-1 overflow-hidden">
          <LeftPane />
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            <DAWView />
          </div>
        </main>
      </div>
    </DAWProvider>
  );
}
