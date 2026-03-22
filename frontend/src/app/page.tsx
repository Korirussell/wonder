import { AbletonProvider } from "@/lib/AbletonContext";
import Header from "@/components/Header";
import CopilotChat from "@/components/CopilotChat";
import SessionMirror from "@/components/SessionMirror";

export default function Home() {
  return (
    <AbletonProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          <CopilotChat />
          <SessionMirror />
        </main>
      </div>
    </AbletonProvider>
  );
}
