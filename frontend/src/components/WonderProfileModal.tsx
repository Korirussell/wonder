"use client";

import { useState } from "react";
import { X, Music2, CheckCircle2 } from "lucide-react";

const GENRES = ["Lo-Fi", "Hip Hop", "House", "Trap", "Jazz", "Afrobeats", "DnB", "Ambient", "R&B", "Soul"];
const PLUGINS = ["RC-20", "OTT", "SketchCassette", "Digitalis", "Vulf Compressor", "Serum", "Vital", "Autotune", "Fabfilter Pro-Q", "Drum Buss"];
const ARTISTS = ["J Dilla", "Flying Lotus", "Kaytranada", "Four Tet", "Sade", "Nujabes", "Tyler the Creator", "Mac Miller"];

const SPOTIFY_MOCK_ARTISTS = ["J Dilla", "Nujabes", "Kaytranada"];
const SPOTIFY_MOCK_TRACKS = [
  "Fall In Love - J Dilla",
  "Aruarian Dance - Nujabes",
  "10% - Kaytranada",
];

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem("wonderprofile");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed[key] as T) ?? fallback;
  } catch {
    return fallback;
  }
}

interface Props {
  onClose: () => void;
}

type SpotifyStatus = "idle" | "connecting" | "connected";

export default function WonderProfileModal({ onClose }: Props) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => loadFromStorage("genres", ["Lo-Fi", "Hip Hop"]));
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>(() => loadFromStorage("plugins", ["RC-20", "OTT", "SketchCassette"]));
  const [selectedArtists, setSelectedArtists] = useState<string[]>(() => loadFromStorage("artists", ["J Dilla", "Nujabes"]));
  const [bpm, setBpm] = useState<string>(() => loadFromStorage("bpmRange", "80-95"));
  const [defaultKey, setDefaultKey] = useState<string>(() => loadFromStorage("defaultKey", "A Minor"));

  const [spotifyStatus, setSpotifyStatus] = useState<SpotifyStatus>(() =>
    loadFromStorage("spotify_artists", []).length > 0 ? "connected" : "idle"
  );
  const [spotifyArtists, setSpotifyArtists] = useState<string[]>(() =>
    loadFromStorage("spotify_artists", [])
  );
  const [spotifyTracks, setSpotifyTracks] = useState<string[]>(() =>
    loadFromStorage("spotify_tracks", [])
  );

  const toggle = (arr: string[], item: string, set: (v: string[]) => void) => {
    set(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const handleConnectSpotify = () => {
    if (spotifyStatus !== "idle") return;
    setSpotifyStatus("connecting");

    setTimeout(() => {
      setSpotifyArtists(SPOTIFY_MOCK_ARTISTS);
      setSpotifyTracks(SPOTIFY_MOCK_TRACKS);
      setSpotifyStatus("connected");
    }, 2500);
  };

  const handleSave = () => {
    localStorage.setItem("wonderprofile", JSON.stringify({
      genres: selectedGenres,
      plugins: selectedPlugins,
      artists: selectedArtists,
      bpmRange: bpm,
      defaultKey,
      spotify_artists: spotifyArtists,
      spotify_tracks: spotifyTracks,
    }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/40 backdrop-blur-sm">
      <div className="bg-[#FDFDFB] border-2 border-[#2D2D2D] rounded-2xl hard-shadow w-full max-w-xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b-2 border-[#2D2D2D] bg-[#C1E1C1]">
          <div>
            <h2 className="font-headline font-extrabold text-lg tracking-tight">My .wonderprofile</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-60 mt-0.5">
              injected into every AI prompt
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 bg-white border-2 border-[#2D2D2D] rounded-xl flex items-center justify-center hard-shadow-sm interactive-push"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] custom-scrollbar">

          {/* ── Spotify Connect ──────────────────────────────────────── */}
          <div className="border-2 border-[#1A1A1A] rounded-xl shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] overflow-hidden">
            <div className="px-4 py-3 bg-[#1DB954]/10 border-b-2 border-[#1A1A1A] flex items-center gap-2">
              <Music2 size={14} strokeWidth={2.5} className="text-[#1DB954]" />
              <span className="font-label text-xs font-bold uppercase tracking-widest">
                Sound Taste · Spotify
              </span>
              {spotifyStatus === "connected" && (
                <CheckCircle2 size={14} className="text-[#1DB954] ml-auto" strokeWidth={2.5} />
              )}
            </div>

            <div className="p-4 space-y-3">
              {spotifyStatus !== "connected" && (
                <button
                  onClick={handleConnectSpotify}
                  disabled={spotifyStatus === "connecting"}
                  className={`w-full py-3 px-4 rounded-xl border-2 border-[#1A1A1A] font-headline font-extrabold text-sm text-white shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all duration-300 flex items-center justify-center gap-2 ${
                    spotifyStatus === "connecting"
                      ? "bg-[#1DB954]/70 cursor-not-allowed animate-pulse"
                      : "bg-[#1DB954] hover:bg-[#1ed760] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                  }`}
                >
                  {spotifyStatus === "connecting" ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Authenticating &amp; Analyzing Taste...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                      Connect to Spotify
                    </>
                  )}
                </button>
              )}

              {/* Connected state — imported data */}
              <div className={`space-y-3 transition-all duration-300 ${spotifyStatus === "connected" ? "opacity-100" : "opacity-0 h-0 overflow-hidden"}`}>
                {/* Success banner */}
                <div className="bg-[#1DB954]/10 border-2 border-[#1DB954] rounded-xl px-3 py-2.5">
                  <p className="font-mono text-[11px] text-[#1A1A1A] leading-relaxed">
                    <span className="font-bold text-[#1DB954]">Sound taste synced!</span> Your AI Copilot will now bias towards warm, analog hip-hop and house.
                  </p>
                </div>

                {/* Top Artists */}
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">
                    Top Artists
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {spotifyArtists.map((artist) => (
                      <span
                        key={artist}
                        className="px-2.5 py-1 bg-[#FEF08A] border-2 border-[#1A1A1A] rounded-lg text-[11px] font-bold font-label shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                      >
                        {artist}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Top Tracks */}
                <div>
                  <p className="font-label text-[10px] font-bold uppercase tracking-widest opacity-50 mb-2">
                    Top Tracks
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {spotifyTracks.map((track) => (
                      <span
                        key={track}
                        className="px-2.5 py-1 bg-[#FEF08A]/60 border-2 border-[#1A1A1A] rounded-lg text-[11px] font-mono shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                      >
                        {track}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Genres */}
          <div>
            <label className="font-label text-xs font-bold uppercase tracking-widest block mb-3 opacity-60">
              Genres
            </label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => toggle(selectedGenres, g, setSelectedGenres)}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-bold font-label transition-all interactive-push ${
                    selectedGenres.includes(g)
                      ? "bg-[#C1E1C1] border-[#2D2D2D] hard-shadow-sm"
                      : "bg-white border-[#2D2D2D] opacity-50 hover:opacity-100"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Plugins */}
          <div>
            <label className="font-label text-xs font-bold uppercase tracking-widest block mb-3 opacity-60">
              Plugins you own
            </label>
            <div className="flex flex-wrap gap-2">
              {PLUGINS.map((p) => (
                <button
                  key={p}
                  onClick={() => toggle(selectedPlugins, p, setSelectedPlugins)}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-bold font-label transition-all interactive-push ${
                    selectedPlugins.includes(p)
                      ? "bg-[#E9D5FF] border-[#2D2D2D] hard-shadow-sm"
                      : "bg-white border-[#2D2D2D] opacity-50 hover:opacity-100"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Artists */}
          <div>
            <label className="font-label text-xs font-bold uppercase tracking-widest block mb-3 opacity-60">
              Reference artists
            </label>
            <div className="flex flex-wrap gap-2">
              {ARTISTS.map((a) => (
                <button
                  key={a}
                  onClick={() => toggle(selectedArtists, a, setSelectedArtists)}
                  className={`px-3 py-1.5 rounded-full border-2 text-xs font-bold font-label transition-all interactive-push ${
                    selectedArtists.includes(a)
                      ? "bg-[#FEF08A] border-[#2D2D2D] hard-shadow-sm"
                      : "bg-white border-[#2D2D2D] opacity-50 hover:opacity-100"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* BPM + Key */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="font-label text-xs font-bold uppercase tracking-widest block mb-2 opacity-60">
                BPM Range
              </label>
              <input
                value={bpm}
                onChange={(e) => setBpm(e.target.value)}
                className="w-full bg-white border-2 border-[#2D2D2D] rounded-xl px-4 py-2.5 font-mono text-sm hard-shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C1E1C1]"
                placeholder="e.g. 80-95"
              />
            </div>
            <div className="flex-1">
              <label className="font-label text-xs font-bold uppercase tracking-widest block mb-2 opacity-60">
                Default Key
              </label>
              <input
                value={defaultKey}
                onChange={(e) => setDefaultKey(e.target.value)}
                className="w-full bg-white border-2 border-[#2D2D2D] rounded-xl px-4 py-2.5 font-mono text-sm hard-shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C1E1C1]"
                placeholder="e.g. A Minor"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t-2 border-[#2D2D2D] bg-stone-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white border-2 border-[#2D2D2D] rounded-xl text-sm font-bold font-headline hard-shadow-sm interactive-push"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-[#C1E1C1] border-2 border-[#2D2D2D] rounded-xl text-sm font-bold font-headline hard-shadow interactive-push"
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
