import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMongoDb } from "@/lib/mongo";

interface SessionUser {
  id?: string;
}

interface AuthSessionResult {
  user?: SessionUser | null;
  session?: { userId?: string } | null;
}

export interface LibrarySample {
  id: string;
  fileName: string;
  source: string;
  filePath: string | null;
  uri: string | null;
  tags: string[];
  category: string | null;
  description: string | null;
  updatedAt: string | null;
}

export interface HistorySession {
  id: string;
  sessionId: string;
  updatedAt: string | null;
  createdAt: string | null;
  turnCount: number;
  preview: string;
}

async function getCurrentUserId() {
  const session = (await auth.api.getSession({
    headers: await headers(),
  })) as AuthSessionResult | null;

  return session?.user?.id ?? session?.session?.userId ?? null;
}

export async function getSamplesForCurrentUser(limit = 100): Promise<LibrarySample[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const db = await getMongoDb();
  const rows = await db
    .collection("samples")
    .find({ user_id: userId })
    .sort({ updated_at: -1 })
    .limit(limit)
    .toArray();

  return rows.map((row) => {
    const vibe = typeof row.vibe === "object" && row.vibe !== null ? row.vibe as Record<string, unknown> : {};
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : null;
    const tags = Array.isArray(vibe.tags) ? vibe.tags.filter((tag): tag is string => typeof tag === "string") : [];

    return {
      id: String(row._id),
      fileName: typeof row.file_name === "string" && row.file_name.trim() ? row.file_name : "Untitled sample",
      source: typeof row.source === "string" ? row.source : "other",
      filePath: typeof row.file_path === "string" ? row.file_path : null,
      uri: typeof row.uri === "string" ? row.uri : null,
      tags,
      category: typeof vibe.category === "string" ? vibe.category : null,
      description: typeof vibe.description === "string" ? vibe.description : null,
      updatedAt,
    };
  });
}

export async function getHistoryForCurrentUser(limit = 100): Promise<HistorySession[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const db = await getMongoDb();
  const rows = await db
    .collection("sessions")
    .find({ user_id: userId })
    .sort({ updated_at: -1 })
    .limit(limit)
    .toArray();

  return rows.map((row) => {
    const turns = Array.isArray(row.turns) ? row.turns : [];
    const lastTurn = turns.at(-1);
    const preview = typeof lastTurn?.content === "string" && lastTurn.content.trim()
      ? lastTurn.content.trim()
      : "No messages yet.";

    return {
      id: String(row._id),
      sessionId: typeof row.session_id === "string" ? row.session_id : "unknown-session",
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
      turnCount: turns.length,
      preview,
    };
  });
}
