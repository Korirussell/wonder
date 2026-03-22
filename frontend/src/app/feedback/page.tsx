"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

type ReportType = "bug" | "feature" | "other";

const TYPE_OPTIONS: { value: ReportType; label: string; description: string }[] = [
  { value: "bug", label: "Bug Report", description: "Something isn't working as expected" },
  { value: "feature", label: "Feature Request", description: "I'd love to see something added" },
  { value: "other", label: "Other Feedback", description: "General thoughts or questions" },
];

export default function FeedbackPage() {
  const { user } = useAuth();
  const [type, setType] = useState<ReportType>("bug");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;

    setStatus("submitting");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id ?? "anonymous",
          type,
          subject: subject.trim(),
          body: body.trim(),
          url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      if (!res.ok) throw new Error("Server error");
      setStatus("success");
      setSubject("");
      setBody("");
    } catch {
      setStatus("error");
    }
  };

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
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">Feedback</span>
      </nav>

      <div className="mx-auto max-w-lg px-6 py-12 my-auto pt-6">
        <h1 className="font-headline text-3xl font-extrabold text-[#2D2D2D]">Send Feedback</h1>
        <p className="mt-2 text-sm text-[#2D2D2D]/50 py-2">
          Report a bug, request a feature, or share anything on your mind.
        </p>

        {status === "success" ? (
          <div className="mt-10 rounded-2xl border-2 border-[#2D2D2D] bg-[#C1E1C1] p-8 hard-shadow text-center">
            <p className="font-headline text-xl font-extrabold">Thanks for the feedback!</p>
            <p className="mt-2 text-sm text-[#2D2D2D]/60">We read every report and will follow up if needed.</p>
            <button
              onClick={() => setStatus("idle")}
              className="mt-6 rounded-xl border-2 border-[#2D2D2D] bg-white px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-widest hard-shadow-sm hover:bg-[#F4EFE3] transition-colors"
            >
              Send Another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {/* Type selector */}
            <div className="grid grid-cols-3 gap-3">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`rounded-2xl border-2 border-[#2D2D2D] p-4 text-left transition-colors hard-shadow-sm ${
                    type === opt.value ? "bg-[#E9D5FF]" : "bg-white hover:bg-[#F4EFE3]"
                  }`}
                >
                  <p className="font-headline text-xs font-bold">{opt.label}</p>
                  <p className="mt-1 font-mono text-[9px] text-[#2D2D2D]/50 leading-relaxed">{opt.description}</p>
                </button>
              ))}
            </div>

            {/* Subject */}
            <div>
              <label className="block font-mono text-[10px] font-bold uppercase tracking-widest text-[#2D2D2D]/50 mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of the issue or request"
                maxLength={200}
                required
                className="w-full rounded-xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm font-body placeholder:text-[#2D2D2D]/30 focus:outline-none focus:ring-2 focus:ring-[#C1E1C1]"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block font-mono text-[10px] font-bold uppercase tracking-widest text-[#2D2D2D]/50 mb-2">
                Details
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe what happened, what you expected, or what you'd like to see..."
                rows={6}
                required
                className="w-full rounded-xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm font-body placeholder:text-[#2D2D2D]/30 focus:outline-none focus:ring-2 focus:ring-[#C1E1C1] resize-none"
              />
            </div>

            {status === "error" && (
              <p className="rounded-xl border-2 border-[#2D2D2D] bg-[#FFD8CC] px-4 py-3 text-sm font-body">
                Something went wrong. Please try again.
              </p>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || !subject.trim() || !body.trim()}
              className="w-full rounded-xl border-2 border-[#2D2D2D] bg-[#2D2D2D] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-white hard-shadow transition-opacity disabled:opacity-40"
            >
              {status === "submitting" ? "Sending…" : "Submit Feedback"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
