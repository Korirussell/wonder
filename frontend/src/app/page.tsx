import { DAWProvider } from "@/lib/DAWContext";
import Header from "@/components/Header";
import CopilotChat from "@/components/CopilotChat";
import DAWView from "@/components/daw/DAWView";

export default function Home() {
  return (
    <DAWProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          <div className="w-[40%] max-w-130 min-w-85 shrink-0">
            <CopilotChat />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <DAWView />
          </div>
        </main>
      </div>
    </DAWProvider>
  );
}
