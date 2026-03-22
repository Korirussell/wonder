import { AbletonProvider } from "@/lib/AbletonContext";
import Header from "@/components/Header";
import CopilotChat from "@/components/CopilotChat";
import SessionMirror from "@/components/SessionMirror";
import ChatSidebar from "@/components/ChatSidebar";
import AppFooter from "@/components/AppFooter";

export default function Home() {
  return (
    <AbletonProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <main className="flex flex-1 overflow-hidden">
          <ChatSidebar />
          <CopilotChat />
          <SessionMirror />
        </main>
        <AppFooter leftLabel="Wonder Core v1.0 // Gemini-2.5-Flash" />
      </div>
    </AbletonProvider>
  );
}
