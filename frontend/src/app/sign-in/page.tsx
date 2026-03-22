"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, Music4 } from "lucide-react";
import { signIn } from "@/lib/auth-client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSpotifySignIn = async () => {
    setError(null);
    setIsPending(true);
    const { data, error: signInError } = await signIn.social({
      provider: "spotify",
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
      disableRedirect: true,
    });
    if (signInError) {
      setError(signInError.message || "Unable to sign in with Spotify.");
      setIsPending(false);
      return;
    }
    if (data?.url) {
      window.location.assign(data.url);
      return;
    }
    setIsPending(false);
  };

  const handleEmailSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);

    const { error: signInError } = await signIn.email({
      email,
      password,
      callbackURL: "/",
      fetchOptions: {
        onSuccess: () => {
          window.location.assign("/");
        },
      },
    });

    if (signInError) {
      setError(signInError.message || "Unable to sign in.");
      setIsPending(false);
      return;
    }

    window.location.assign("/");
  };

  const handleGuestSignIn = async () => {
    setError(null);
    setIsPending(true);

    const { error: signInError } = await signIn.anonymous({
      fetchOptions: {
        onSuccess: () => {
          window.location.assign("/");
        },
      },
    });

    if (signInError) {
      setError(signInError.message || "Unable to continue as guest.");
      setIsPending(false);
      return;
    }

    window.location.assign("/");
  };

  return (
    <main className="min-h-screen overflow-y-auto bg-[#FDFDFB] px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="relative overflow-hidden rounded-[2rem] border-2 border-[#2D2D2D] bg-[#C1E1C1] p-8 hard-shadow lg:p-12">
            <div className="absolute -right-12 top-8 h-40 w-40 rounded-full border-2 border-[#2D2D2D] bg-[#FEF08A]" />
            <div className="absolute bottom-[-52px] left-8 h-32 w-72 rotate-[-8deg] rounded-[2rem] border-2 border-[#2D2D2D] bg-white/60" />
            <div className="relative space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#2D2D2D] bg-white px-4 py-2 hard-shadow-sm">
                <Music4 size={16} />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em]">
                  Cursor For Music
                </span>
              </div>
              <div className="space-y-4">
                <h1 className="max-w-lg font-headline text-5xl font-black italic leading-none tracking-tight text-[#2D2D2D] lg:text-6xl">
                  The AI cloud music workstation.
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-[#2D2D2D]/75">
                  Wonder turns chat into arrangement, sound design, and Ableton actions. Sign in to keep sessions, switch between projects, and build with a copilot that feels like Cursor for music production.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border-2 border-[#2D2D2D] bg-[#FDFDFB] p-6 hard-shadow lg:p-8">
            <div className="mb-6 space-y-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] opacity-50">
                AI Music Workstation
              </p>
              <h2 className="font-headline text-3xl font-extrabold tracking-tight">
                Log in to open Wonder
              </h2>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleSpotifySignIn}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#2D2D2D] bg-[#1DB954] px-4 py-3 font-headline text-sm font-bold text-white hard-shadow interactive-push disabled:opacity-60"
              >
                {isPending ? <Loader2 className="animate-spin" size={16} /> : null}
                Sign in with Spotify
              </button>

              <button
                onClick={() => void handleGuestSignIn()}
                disabled={isPending}
                className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-[#F4EFE3] px-4 py-3 font-headline text-sm font-bold hard-shadow-sm interactive-push disabled:opacity-60"
              >
                Continue as guest
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[#2D2D2D]/20" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] opacity-40">
                  or
                </span>
                <div className="h-px flex-1 bg-[#2D2D2D]/20" />
              </div>

              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-label text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">
                    Email
                  </label>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#C1E1C1]"
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
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#C1E1C1]"
                    placeholder="••••••••"
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
                  className="w-full rounded-2xl border-2 border-[#2D2D2D] bg-[#2D2D2D] px-4 py-3 font-headline text-sm font-bold text-white hard-shadow interactive-push disabled:opacity-60"
                >
                  Continue with email
                </button>
              </form>
            </div>

            <p className="mt-6 text-sm opacity-70">
              Need an account?{" "}
              <Link href="/sign-up" className="font-bold underline underline-offset-4">
                Create one
              </Link>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
