"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useRouter } from "next/navigation";

interface UserStats {
  session_count: number;
  messages_sent: number;
  liked: number;
  disliked: number;
  sounds_saved: number;
}

const EMPTY: UserStats = { session_count: 0, messages_sent: 0, liked: 0, disliked: 0, sounds_saved: 0 };

export default function AnalyticsPage() {
  const { user, isPending } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    fetch(`/api/analytics?user_id=${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then((data) => setStats(data as UserStats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, isPending, router]);

  const feedbackTotal = stats.liked + stats.disliked;
  const feedbackRatio = feedbackTotal > 0 ? Math.round((stats.liked / feedbackTotal) * 100) : null;

  const cards = [
    { label: "Sessions", value: stats.session_count, accent: "bg-[#F4EFE3]" },
    { label: "Messages Sent", value: stats.messages_sent, accent: "bg-white" },
    { label: "Sounds Saved", value: stats.sounds_saved, accent: "bg-[#C1E1C1]" },
    { label: "Responses Liked", value: stats.liked, accent: "bg-[#C1E1C1]" },
    { label: "Responses Disliked", value: stats.disliked, accent: "bg-[#FFD8CC]" },
    {
      label: "Helpful Rate",
      value: feedbackRatio !== null ? `${feedbackRatio}%` : "—",
      accent: "bg-[#E9D5FF]",
      raw: true,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[#FDFDFB]">
      {/* Header */}
      <nav className="flex h-14 shrink-0 items-center border-b-2 border-[#2D2D2D] bg-[#FDFDFB] px-6">
        <a
          href="/"
          className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#2D2D2D]/40 hover:text-[#2D2D2D] transition-colors"
        >
          ← Studio
        </a>
        <span className="mx-3 text-[#2D2D2D]/20">/</span>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Analytics</span>
      </nav>

      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-headline text-3xl font-extrabold text-[#2D2D2D]">Your Wonder Stats</h1>
        {user && (
          <p className="mt-1 font-mono text-xs text-[#2D2D2D]/40">{user.email}</p>
        )}

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border-2 border-[#2D2D2D] p-6 hard-shadow ${card.accent}`}
            >
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#2D2D2D]/40">
                {card.label}
              </p>
              <p className="mt-3 font-headline text-4xl font-extrabold text-[#2D2D2D]">
                {"raw" in card
                  ? card.value
                  : loading
                  ? "—"
                  : (card.value as number).toLocaleString()}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-10 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#2D2D2D]/20">
          Powered by MongoDB · Synced to Snowflake
        </p>
      </div>
    </div>
  );
}
