import { AbletonProvider } from "@/lib/AbletonContext";
import Header from "@/components/Header";
import { getSamplesForCurrentUser } from "@/lib/libraryData";
import AppFooter from "@/components/AppFooter";

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function LibraryPage() {
  const samples = await getSamplesForCurrentUser();

  return (
    <AbletonProvider>
      <div className="h-screen flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
          <section className="mx-auto w-full max-w-6xl">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] opacity-45">Library</p>
                <h1 className="font-headline text-3xl font-extrabold">Samples</h1>
              </div>
              <div className="rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] hard-shadow-sm">
                {samples.length} item{samples.length === 1 ? "" : "s"}
              </div>
            </div>

            {samples.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-[#2D2D2D]/50 bg-[#FDFDFB]/80 p-8 text-center">
                <p className="font-headline text-xl font-bold">No samples yet</p>
                <p className="mt-2 text-sm opacity-60">
                  Generated and indexed sounds will appear here under the Samples category.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {samples.map((sample) => (
                  <article
                    key={sample.id}
                    className="rounded-3xl border-2 border-[#2D2D2D] bg-white p-5 hard-shadow-sm"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h2 className="line-clamp-2 font-headline text-base font-bold">{sample.fileName}</h2>
                      <span className="rounded-lg border-2 border-[#2D2D2D] bg-[#C1E1C1] px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em]">
                        {sample.source}
                      </span>
                    </div>

                    {sample.description ? (
                      <p className="mb-3 line-clamp-2 text-sm opacity-70">{sample.description}</p>
                    ) : null}

                    <div className="mb-3 flex flex-wrap gap-2">
                      {sample.category ? (
                        <span className="rounded-lg border-2 border-[#2D2D2D] bg-[#FEF08A] px-2 py-1 text-xs font-semibold">
                          {sample.category}
                        </span>
                      ) : null}
                      {sample.tags.slice(0, 4).map((tag) => (
                        <span
                          key={`${sample.id}-${tag}`}
                          className="rounded-lg border-2 border-[#2D2D2D] bg-[#F4EFE3] px-2 py-1 text-xs font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] opacity-55">
                      <p>Updated {formatDate(sample.updatedAt)}</p>
                      {sample.uri ? <p className="truncate">URI {sample.uri}</p> : null}
                      {sample.filePath ? <p className="truncate">{sample.filePath}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
        <AppFooter leftLabel="Library // Samples" />
      </div>
    </AbletonProvider>
  );
}
