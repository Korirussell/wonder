"use client";

import { useState } from "react";
import { X } from "lucide-react";

const GENRES = ["Lo-Fi", "Hip Hop", "House", "Trap", "Jazz", "Afrobeats", "DnB", "Ambient", "R&B", "Soul"];
const PLUGINS = ["RC-20", "OTT", "SketchCassette", "Digitalis", "Vulf Compressor", "Serum", "Vital", "Autotune", "Fabfilter Pro-Q", "Drum Buss"];
const ARTISTS = ["J Dilla", "Flying Lotus", "Kaytranada", "Four Tet", "Sade", "Nujabes", "Tyler the Creator", "Mac Miller"];

interface Props {
  onClose: () => void;
}

export default function WonderProfileModal({ onClose }: Props) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["Lo-Fi", "Hip Hop"]);
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>(["RC-20", "OTT", "SketchCassette"]);
  const [selectedArtists, setSelectedArtists] = useState<string[]>(["J Dilla", "Nujabes"]);
  const [bpm, setBpm] = useState("80-95");
  const [defaultKey, setDefaultKey] = useState("A Minor");

  const toggle = (arr: string[], item: string, set: (v: string[]) => void) => {
    set(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
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
            onClick={onClose}
            className="px-5 py-2.5 bg-[#C1E1C1] border-2 border-[#2D2D2D] rounded-xl text-sm font-bold font-headline hard-shadow interactive-push"
          >
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
