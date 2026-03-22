import { AbletonProvider } from "@/lib/AbletonContext";
import Header from "@/components/Header";
import { getHistoryForCurrentUser } from "@/lib/libraryData";
import AppFooter from "@/components/AppFooter";

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function HistoryPage() {
  const sessions = await getHistoryForCurrentUser();

  return (
    <AbletonProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <section className="mx-auto w-full max-w-5xl">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] opacity-45">History</p>
                <h1 className="font-headline text-3xl font-extrabold">Past Sessions</h1>
              </div>
              <div className="rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] hard-shadow-sm">
                {sessions.length} session{sessions.length === 1 ? "" : "s"}
              </div>
            </div>

            {sessions.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-[#2D2D2D]/50 bg-[#FDFDFB]/80 p-8 text-center">
                <p className="font-headline text-xl font-bold">No sessions yet</p>
                <p className="mt-2 text-sm opacity-60">
                  Chat sessions created in Studio will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => (
                  <article
                    key={session.id}
                    className="rounded-3xl border-2 border-[#2D2D2D] bg-white p-5 hard-shadow-sm"
                  >
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-headline text-lg font-bold">Session {session.sessionId.slice(0, 8)}</h2>
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] opacity-50">
                          {session.turnCount} turn{session.turnCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="text-right font-mono text-[10px] font-bold uppercase tracking-[0.14em] opacity-55">
                        <p>Updated {formatDate(session.updatedAt)}</p>
                        <p>Created {formatDate(session.createdAt)}</p>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-sm opacity-70">{session.preview}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
        <AppFooter leftLabel="History // Sessions" />
      </div>
    </AbletonProvider>
  );
}
