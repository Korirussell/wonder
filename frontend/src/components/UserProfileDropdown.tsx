"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, LogOut, Settings } from "lucide-react";
import WonderProfileModal from "./WonderProfileModal";
import AuthRequiredPopover from "./AuthRequiredPopover";
import { authClient, signIn, signOut, updateUser } from "@/lib/auth-client";
import { useAuth } from "@/lib/AuthContext";

function getDisplayLabel(user: ReturnType<typeof useAuth>["user"]) {
  if (!user) return "anonymous";
  if (user.isAnonymous) return "guest";
  if (user.username) return `@${user.username}`;
  if (user.name) return user.name;
  return "anonymous";
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "W";
}

export default function UserProfileDropdown() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [username, setUsername] = useState("");
  const [accounts, setAccounts] = useState<Array<{ providerId?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!user || !open) return;

    authClient.listAccounts().then((result) => {
      setAccounts(Array.isArray(result.data) ? result.data : []);
    }).catch(() => {
      setAccounts([]);
    });
  }, [open, user]);

  const hasSpotifyLinked = accounts.some((account) => account.providerId === "spotify");
  const isAnonymous = Boolean(user?.isAnonymous);
  const displayLabel = getDisplayLabel(user);

  const handleSetUsername = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const nextUsername = username.trim();
    if (!nextUsername) return;

    const { error: updateError } = await updateUser({ username: nextUsername });
    if (updateError) {
      setError(updateError.message || "Unable to update username.");
      return;
    }

    setUsername("");
    router.refresh();
  };

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-3 rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-1 hard-shadow-sm interactive-push"
        >
          {user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={displayLabel}
              className="h-9 w-9 rounded-full border-2 border-[#2D2D2D] object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#2D2D2D] bg-[#FEF08A] font-mono text-xs font-bold uppercase">
              {getInitials(user?.name || user?.email || "Wonder")}
            </span>
          )}
          <div className="hidden text-left md:block">
            <p className="font-headline text-sm font-bold leading-none">{displayLabel}</p>
            <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] opacity-40">
              authenticated
            </p>
          </div>
        </button>

        {open ? (
          <div className="absolute right-0 top-[calc(100%+10px)] z-[80] w-[320px] rounded-[1.5rem] border-2 border-[#2D2D2D] bg-[#FDFDFB] p-4 hard-shadow">
            <div className="rounded-2xl border-2 border-[#2D2D2D] bg-white p-4">
              <div className="flex items-center gap-3">
                {user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={displayLabel}
                    className="size-12 min-w-12 rounded-full border-2 border-[#2D2D2D] object-cover"
                  />
                ) : (
                  <span className="flex size-12 min-w-12 items-center justify-center rounded-full border-2 border-[#2D2D2D] bg-[#C1E1C1] font-mono text-sm font-bold uppercase">
                    {getInitials(user?.name || user?.email || "Wonder")}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-headline text-base font-bold">{displayLabel}</p>
                  <p className="truncate text-sm opacity-60">{user?.email}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {!hasSpotifyLinked && !isAnonymous ? (
                <button
                  onClick={() =>
                    void signIn.social({
                      provider: "spotify",
                      callbackURL: "/",
                      errorCallbackURL: "/",
                      disableRedirect: true,
                      fetchOptions: {
                        onSuccess: (context) => {
                          const url = (context.data as { url?: string } | null)?.url;
                          if (url) {
                            window.location.assign(url);
                          }
                        },
                      },
                    })
                  }
                  className="flex w-full items-center justify-between rounded-2xl border-2 border-[#2D2D2D] bg-[#1DB954] px-4 py-3 text-left font-headline text-sm font-bold text-white hard-shadow-sm interactive-push"
                >
                  <span>Connect Spotify</span>
                  <Link2 size={15} />
                </button>
              ) : null}

              {!user?.username && !isAnonymous ? (
                <form
                  onSubmit={handleSetUsername}
                  className="rounded-2xl border-2 border-[#2D2D2D] bg-[#F4EFE3] p-3"
                >
                  <label className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.2em] opacity-45">
                    Set username
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="yourhandle"
                      className="min-w-0 flex-1 rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#FEF08A]"
                    />
                    <button
                      type="submit"
                      className="rounded-xl border-2 border-[#2D2D2D] bg-[#FEF08A] px-3 py-2 font-headline text-sm font-bold hard-shadow-sm interactive-push"
                    >
                      Save
                    </button>
                  </div>
                  {error ? <p className="mt-2 text-xs text-[#8B3A2E]">{error}</p> : null}
                </form>
              ) : null}

              {isAnonymous ? (
                <>
                  <AuthRequiredPopover
                    disabled
                    message="Connect Spotify after signing in with a permanent account."
                  >
                    <button className="flex w-full items-center justify-between rounded-2xl border-2 border-[#2D2D2D] bg-[#1DB954] px-4 py-3 text-left font-headline text-sm font-bold text-white hard-shadow-sm">
                      <span>Connect Spotify</span>
                      <Link2 size={15} />
                    </button>
                  </AuthRequiredPopover>

                  <AuthRequiredPopover
                    disabled
                    message="Guest sessions cannot set a username. Sign in to claim one."
                  >
                    <div className="rounded-2xl border-2 border-[#2D2D2D] bg-[#F4EFE3] p-3">
                      <label className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.2em] opacity-45">
                        Set username
                      </label>
                      <div className="flex gap-2">
                        <input
                          value=""
                          readOnly
                          placeholder="yourhandle"
                          className="min-w-0 flex-1 rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-2 text-sm outline-none"
                        />
                        <button
                          type="button"
                          className="rounded-xl border-2 border-[#2D2D2D] bg-[#FEF08A] px-3 py-2 font-headline text-sm font-bold hard-shadow-sm"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </AuthRequiredPopover>

                  <AuthRequiredPopover
                    disabled
                    message="Guest sessions do not keep account preferences. Sign in to save them."
                  >
                    <button className="flex w-full items-center justify-between rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-left hard-shadow-sm">
                      <div>
                        <p className="font-headline text-sm font-bold">App preferences</p>
                        <p className="text-xs opacity-55">Genres, plugins, artists, default key</p>
                      </div>
                      <Settings size={15} />
                    </button>
                  </AuthRequiredPopover>
                </>
              ) : (
                <button
                  onClick={() => {
                    setOpen(false);
                    setShowProfileModal(true);
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border-2 border-[#2D2D2D] bg-white px-4 py-3 text-left hard-shadow-sm interactive-push"
                >
                  <div>
                    <p className="font-headline text-sm font-bold">App preferences</p>
                    <p className="text-xs opacity-55">Genres, plugins, artists, default key</p>
                  </div>
                  <Settings size={15} />
                </button>
              )}

              <button
                onClick={() =>
                  void signOut({
                    fetchOptions: {
                      onSuccess: () => {
                        window.location.assign("/sign-in");
                      },
                    },
                  })
                }
                className="flex w-full items-center justify-between rounded-2xl border-2 border-[#2D2D2D] bg-[#FFD8CC] px-4 py-3 text-left font-headline text-sm font-bold hard-shadow-sm interactive-push"
              >
                <span>Sign out</span>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showProfileModal ? <WonderProfileModal onClose={() => setShowProfileModal(false)} /> : null}
    </>
  );
}
