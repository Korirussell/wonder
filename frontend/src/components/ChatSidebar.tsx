"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MessageSquarePlus } from "lucide-react";
import { useChat } from "@/lib/ChatContext";
import { useAuth } from "@/lib/AuthContext";
import AuthRequiredPopover from "./AuthRequiredPopover";

function formatTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function ChatSidebar() {
  const { chats, activeChatId, createChat, switchChat, loadingChats } = useChat();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const isGuestLimited = Boolean(user?.isAnonymous) && chats.length >= 1;

  const orderedChats = useMemo(
    () => [...chats].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [chats]
  );

  return (
    <aside className={`${collapsed ? "w-[88px]" : "w-[300px]"} shrink-0 border-r-2 border-[#2D2D2D] bg-[#F4EFE3] transition-[width] duration-200`}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b-2 border-[#2D2D2D] px-4 py-4">
          {!collapsed ? (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] opacity-45">
                Sessions
              </p>
              <h2 className="font-headline text-lg font-extrabold">Chat Deck</h2>
            </div>
          ) : null}

          <button
            onClick={() => setCollapsed((prev) => !prev)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#2D2D2D] bg-white hard-shadow-sm interactive-push ${collapsed ? "mx-auto" : ""}`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="border-b-2 border-[#2D2D2D] p-4">
          <AuthRequiredPopover
            disabled={isGuestLimited}
            message="Guest mode supports one active chat. Sign in to create multiple saved chats and switch between them."
            align={collapsed ? "left" : "right"}
          >
            <button
              onClick={() => void createChat()}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#2D2D2D] bg-[#C1E1C1] px-4 py-3 font-headline text-sm font-bold hard-shadow interactive-push ${collapsed ? "px-0" : ""}`}
            >
              <MessageSquarePlus size={16} />
              {!collapsed ? "New Chat" : null}
            </button>
          </AuthRequiredPopover>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar">
          {orderedChats.length === 0 && !collapsed ? (
            <div className="rounded-2xl border-2 border-dashed border-[#2D2D2D]/40 bg-white/60 p-4 text-sm opacity-65">
              Start a chat to mint the first session.
            </div>
          ) : null}

          {orderedChats.map((chat) => {
            const isActive = chat.id === activeChatId;
            const isLoading = loadingChats.has(chat.id);

            return (
              <button
                key={chat.id}
                onClick={() => void switchChat(chat.id)}
                className={`w-full rounded-2xl border-2 border-[#2D2D2D] p-3 text-left transition-colors ${
                  isActive ? "bg-white hard-shadow-sm" : "bg-[#FDFDFB]/70 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-headline text-sm font-bold">
                      {collapsed ? chat.title.slice(0, 1) : chat.title}
                    </p>
                    {!collapsed ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed opacity-60">
                        {chat.lastMessagePreview}
                      </p>
                    ) : null}
                  </div>

                  {!collapsed ? (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] opacity-35">
                        {formatTimestamp(chat.createdAt)}
                      </span>
                      {isLoading ? (
                        <span className="h-2.5 w-2.5 rounded-full border border-[#2D2D2D] bg-[#fa7150]" />
                      ) : null}
                    </div>
                  ) : isLoading ? (
                    <span className="h-2.5 w-2.5 rounded-full border border-[#2D2D2D] bg-[#fa7150]" />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
