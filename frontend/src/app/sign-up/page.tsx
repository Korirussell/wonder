"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { signUp } from "@/lib/auth-client";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      callbackURL: "/",
      fetchOptions: {
        onSuccess: () => {
          window.location.assign("/");
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message || "Unable to create account.");
      setIsPending(false);
      return;
    }

    window.location.assign("/");
  };

  return (
    <main className="min-h-screen overflow-y-auto bg-[#FDFDFB] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border-2 border-[#2D2D2D] bg-[#FDFDFB] p-6 hard-shadow lg:p-8">
            <div className="mb-6 space-y-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] opacity-50">
                Cursor For Music
              </p>
              <h1 className="font-headline text-3xl font-extrabold tracking-tight">
                Create your AI studio account
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-label text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
                  Name
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FEF08A]"
                  placeholder="Studio name"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-label text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
                  Email
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FEF08A]"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-label text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#FEF08A]"
                  placeholder="At least 8 characters"
                  required
                />
              </div>

              {error ? (
                <p className="rounded-xl border-2 border-[#2D2D2D] bg-[#FFD8CC] px-3 py-2 text-sm">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#2D2D2D] bg-[#FEF08A] px-4 py-3 font-headline text-sm font-bold hard-shadow interactive-push disabled:opacity-60"
              >
                {isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                Create account
              </button>
            </form>

            <p className="mt-6 text-sm opacity-70">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-bold underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </section>

          <section className="relative overflow-hidden rounded-[2rem] border-2 border-[#2D2D2D] bg-[#FEF08A] p-8 hard-shadow lg:p-12">
            <div className="absolute right-6 top-6 h-20 w-20 rounded-2xl border-2 border-[#2D2D2D] bg-white/70" />
            <div className="absolute bottom-8 left-[-36px] h-24 w-56 rotate-[10deg] rounded-[1.75rem] border-2 border-[#2D2D2D] bg-[#C1E1C1]" />
            <div className="relative max-w-lg space-y-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] opacity-55">
                The AI Cloud Music Workstation
              </p>
              <h2 className="font-headline text-5xl font-black italic leading-none tracking-tight lg:text-6xl">
                Prompt. Build. Arrange.
              </h2>
              <p className="text-base leading-relaxed opacity-80">
                Wonder is built for modern producers: one workspace for musical intent, AI generation, session history, and live DAW control. Make an account to save chats, preferences, and your evolving creative context.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
