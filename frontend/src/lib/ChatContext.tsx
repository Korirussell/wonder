"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Chat, ChatMessage } from "@/types";
import { useAuth } from "@/lib/AuthContext";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://localhost:8001";

export const DEFAULT_CHAT_GREETING: ChatMessage = {
  id: "wonder-greeting",
  role: "assistant",
  content:
    "Hey! I'm Wonder — your AI music copilot. Tell me what you want to make, or hum a melody and I'll build the session in Ableton. What are we making today?",
  timestamp: new Date(0),
  isGreeting: true,
};

interface PersistedState {
  activeChatId: string | null;
  chats: Array<Omit<Chat, "createdAt"> & { createdAt: string }>;
  messages: Record<string, Array<Omit<ChatMessage, "timestamp"> & { timestamp: string }>>;
}

interface ChatContextValue {
  chats: Chat[];
  activeChatId: string | null;
  activeMessages: ChatMessage[];
  loadingChats: Set<string>;
  createChat: () => Promise<string>;
  switchChat: (chatId: string) => Promise<void>;
  appendMessage: (chatId: string, message: ChatMessage) => void;
  replaceMessages: (chatId: string, messages: ChatMessage[]) => void;
  getMessages: (chatId: string) => ChatMessage[];
  setLoading: (chatId: string, loading: boolean) => void;
  updateChatPreview: (chatId: string, text: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function getStorageKey(userId: string) {
  return `wonder:chats:${userId}`;
}

function getChatTitle(messages: ChatMessage[], fallback: string) {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content.trim());
  if (!firstUserMessage) return fallback;
  return firstUserMessage.content.trim().slice(0, 42) || fallback;
}

function deserializeState(raw: string | null): PersistedState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function toChatMessages(
  input: Array<Omit<ChatMessage, "timestamp"> & { timestamp: string }> | undefined
): ChatMessage[] {
  return (input ?? []).map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
  }));
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isAnonymous = Boolean(user?.isAnonymous);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [loadingChatIds, setLoadingChatIds] = useState<string[]>([]);
  const messagesRef = useRef<Record<string, ChatMessage[]>>({});

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!userId) {
      startTransition(() => {
        setChats([]);
        setMessages({});
        setActiveChatId(null);
        setLoadingChatIds([]);
      });
      return;
    }

    const persisted = deserializeState(localStorage.getItem(getStorageKey(userId)));
    if (!persisted) {
      startTransition(() => {
        setChats([]);
        setMessages({});
        setActiveChatId(null);
      });
      return;
    }

    startTransition(() => {
      setChats(
        persisted.chats.map((chat) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
        }))
      );
      setMessages(
        Object.fromEntries(
          Object.entries(persisted.messages).map(([chatId, chatMessages]) => [
            chatId,
            toChatMessages(chatMessages),
          ])
        )
      );
      setActiveChatId(persisted.activeChatId);
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const payload: PersistedState = {
      activeChatId,
      chats: chats.map((chat) => ({
        ...chat,
        createdAt: chat.createdAt.toISOString(),
      })),
      messages: Object.fromEntries(
        Object.entries(messages).map(([chatId, chatMessages]) => [
          chatId,
          chatMessages.map((message) => ({
            ...message,
            timestamp: message.timestamp.toISOString(),
          })),
        ])
      ),
    };
    localStorage.setItem(getStorageKey(userId), JSON.stringify(payload));
  }, [activeChatId, chats, messages, userId]);

  const replaceMessages = useCallback((chatId: string, nextMessages: ChatMessage[]) => {
    setMessages((prev) => ({ ...prev, [chatId]: nextMessages }));
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title: getChatTitle(nextMessages, chat.title),
              lastMessagePreview: nextMessages[nextMessages.length - 1]?.content ?? chat.lastMessagePreview,
            }
          : chat
      )
    );
  }, []);

  const appendMessage = useCallback((chatId: string, message: ChatMessage) => {
    setMessages((prev) => {
      const nextMessages = [...(prev[chatId] ?? []), message];
      return {
        ...prev,
        [chatId]: nextMessages,
      };
    });

    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        const nextMessages = [...(messagesRef.current[chatId] ?? []), message];
        return {
          ...chat,
          title: getChatTitle(nextMessages, chat.title),
          lastMessagePreview: message.content,
        };
      })
    );
  }, []);

  const updateChatPreview = useCallback((chatId: string, text: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              lastMessagePreview: text,
            }
          : chat
      )
    );
  }, []);

  const setLoading = useCallback((chatId: string, loading: boolean) => {
    setLoadingChatIds((prev) => {
      if (loading) {
        return prev.includes(chatId) ? prev : [...prev, chatId];
      }
      return prev.filter((id) => id !== chatId);
    });
  }, []);

  const getMessages = useCallback((chatId: string) => {
    return messagesRef.current[chatId] ?? [];
  }, []);

  const createChat = useCallback(async () => {
    if (isAnonymous && chats.length > 0) {
      setActiveChatId(chats[0].id);
      return chats[0].id;
    }

    const chatId = crypto.randomUUID();
    const nextChat: Chat = {
      id: chatId,
      title: "New chat",
      createdAt: new Date(),
      lastMessagePreview: DEFAULT_CHAT_GREETING.content,
    };

    setChats((prev) => [nextChat, ...prev]);
    setMessages((prev) => ({
      ...prev,
      [chatId]: [DEFAULT_CHAT_GREETING],
    }));
    setActiveChatId(chatId);

    if (userId) {
      fetch(`${BACKEND_URL}/session/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          session_id: chatId,
          client: "frontend",
          turns: [],
        }),
      }).catch(() => {});
    }

    return chatId;
  }, [chats, isAnonymous, userId]);

  const switchChat = useCallback(async (chatId: string) => {
    setActiveChatId(chatId);

    if (messagesRef.current[chatId]?.length) {
      return;
    }

    setMessages((prev) => ({
      ...prev,
      [chatId]: [DEFAULT_CHAT_GREETING],
    }));

    if (!userId) return;

    try {
      const response = await fetch(`${BACKEND_URL}/session/${chatId}`);
      if (!response.ok) return;
      const data = await response.json();
      const turns = Array.isArray(data?.turns) ? data.turns : [];
      const nextMessages: ChatMessage[] = [
        DEFAULT_CHAT_GREETING,
        ...turns
          .filter((turn: { role?: string; content?: string }) => turn?.role && turn?.content)
          .map((turn: { role: "user" | "assistant"; content: string }, index: number) => ({
            id: `${chatId}-${index}`,
            role: turn.role,
            content: turn.content,
            timestamp: new Date(),
          })),
      ];
      replaceMessages(chatId, nextMessages);
    } catch {
      // Keep the local cache when the backend route is unavailable.
    }
  }, [replaceMessages, userId]);

  const activeMessages = useMemo(() => {
    if (!activeChatId) return [DEFAULT_CHAT_GREETING];
    return messages[activeChatId] ?? [DEFAULT_CHAT_GREETING];
  }, [activeChatId, messages]);

  const value = useMemo<ChatContextValue>(() => ({
    chats,
    activeChatId,
    activeMessages,
    loadingChats: new Set(loadingChatIds),
    createChat,
    switchChat,
    appendMessage,
    replaceMessages,
    getMessages,
    setLoading,
    updateChatPreview,
  }), [
    activeChatId,
    activeMessages,
    appendMessage,
    chats,
    createChat,
    getMessages,
    loadingChatIds,
    replaceMessages,
    setLoading,
    switchChat,
    updateChatPreview,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return value;
}
