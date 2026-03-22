/**
 * Wonder Profile Loader
 * Loads .wonderprofile.json and injects it into every LLM system prompt.
 * This is the "identity system" — the AI knows your style before you say a word.
 */

import { readFileSync } from "fs";
import path from "path";

export interface WonderProfile {
  producer: {
    name: string;
    alias: string;
    daw: string;
    interface: string;
  };
  genres: string[];
  influences: string[];
  aesthetic: {
    vibe: string;
    adjectives: string[];
    avoids: string[];
  };
  plugins: {
    effects: Array<{ name: string; use: string }>;
    instruments: Array<{ name: string; use: string }>;
  };
  drums: {
    preferred_kits: string[];
    kick_character: string;
    snare_character: string;
    hat_character: string;
  };
  production_style: {
    bpm_range: [number, number];
    default_bpm: number;
    swing: number;
    preferred_keys: string[];
    time_signatures: string[];
    humanization: string;
  };
  sample_packs: string[];
  sauce_racks: Record<string, string[]>;
}

let cachedProfile: WonderProfile | null = null;
let cachedProfileString: string | null = null;

/**
 * Load the .wonderprofile.json from the public directory (server-side)
 */
export function loadWonderProfile(): WonderProfile | null {
  if (cachedProfile) return cachedProfile;

  try {
    const profilePath = path.join(process.cwd(), "public", "wonderprofile.json");
    const raw = readFileSync(profilePath, "utf-8");
    cachedProfile = JSON.parse(raw) as WonderProfile;
    return cachedProfile;
  } catch (error) {
    console.error("[Wonder] Failed to load wonderprofile.json:", error);
    return null;
  }
}

/**
 * Get the profile as a formatted string for system prompt injection
 */
export function getProfilePromptBlock(): string {
  if (cachedProfileString) return cachedProfileString;

  const profile = loadWonderProfile();
  if (!profile) return "";

  cachedProfileString = `
## PRODUCER IDENTITY (.wonderprofile)
You are producing for **${profile.producer.name}** (${profile.producer.alias}).
DAW: ${profile.producer.daw} | Interface: ${profile.producer.interface}

**Genres:** ${profile.genres.join(", ")}
**Influences:** ${profile.influences.join(", ")}
**Aesthetic:** ${profile.aesthetic.vibe}
**Sound adjectives:** ${profile.aesthetic.adjectives.join(", ")}
**AVOID:** ${profile.aesthetic.avoids.join(", ")}

**Plugins available:**
Effects: ${profile.plugins.effects.map((p) => `${p.name} (${p.use})`).join(", ")}
Instruments: ${profile.plugins.instruments.map((p) => `${p.name} (${p.use})`).join(", ")}

**Drum preferences:**
- Kits: ${profile.drums.preferred_kits.join(", ")}
- Kick: ${profile.drums.kick_character}
- Snare: ${profile.drums.snare_character}
- Hats: ${profile.drums.hat_character}

**Production style:**
- BPM range: ${profile.production_style.bpm_range[0]}–${profile.production_style.bpm_range[1]} (default ${profile.production_style.default_bpm})
- Swing: ${profile.production_style.swing}
- Preferred keys: ${profile.production_style.preferred_keys.join(", ")}
- Humanization: ${profile.production_style.humanization}

**Sauce Racks (effect chains to load):**
${Object.entries(profile.sauce_racks)
  .map(([name, chain]) => `- ${name}: ${chain.join(" → ")}`)
  .join("\n")}

**CRITICAL:** Always produce in this style. Use these plugins. Match this aesthetic. This producer does NOT want generic output.
`;

  return cachedProfileString;
}
