import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";

/**
 * Gemini function declarations matching kori-mcp (ableton-mcp-extended).
 * These are passed to the Gemini model so it can call them directly.
 */

export const WONDER_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  // ─── Session ───────────────────────────────────────────────────────────────
  {
    name: "get_session_info",
    description: "Get current Ableton session info: BPM, track count, scene count, time signature. Call this first to understand the current state.",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },
  {
    name: "get_track_info",
    description: "Get detailed information about a specific track in Ableton.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { track_index: { type: SchemaType.NUMBER, description: "Index of the track" } },
      required: ["track_index"],
    },
  },
  {
    name: "set_tempo",
    description: "Set the session BPM / tempo.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { tempo: { type: SchemaType.NUMBER, description: "BPM value e.g. 90" } },
      required: ["tempo"],
    },
  },
  {
    name: "start_playback",
    description: "Start Ableton playback.",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },
  {
    name: "stop_playback",
    description: "Stop Ableton playback.",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },

  // ─── Tracks ────────────────────────────────────────────────────────────────
  {
    name: "create_midi_track",
    description: "Create a new MIDI track. Pass index=-1 to insert at the end, or get session_info first and use track_count as index.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { index: { type: SchemaType.NUMBER, description: "Insert position (-1 = end of list)" } },
      required: ["index"],
    },
  },
  {
    name: "set_track_name",
    description: "Rename an Ableton track.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        name: { type: SchemaType.STRING },
      },
      required: ["track_index", "name"],
    },
  },

  // ─── Clips & MIDI ──────────────────────────────────────────────────────────
  {
    name: "create_clip",
    description: "Create an empty MIDI clip on a track.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER, description: "Scene/slot index, usually 0" },
        length: { type: SchemaType.NUMBER, description: "Clip length in beats (default 4.0)" },
      },
      required: ["track_index", "clip_index", "length"],
    },
  },
  {
    name: "add_notes_to_clip",
    description: "Add MIDI notes to a clip. Each note is an object: {pitch, start_time, duration, velocity, mute}. Pitch: 0-127. Start_time/duration in beats. Velocity: 0-127.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER },
        notes: {
          type: SchemaType.ARRAY,
          description: "Array of note objects",
          items: {
            type: SchemaType.OBJECT,
            properties: {
              pitch: { type: SchemaType.NUMBER },
              start_time: { type: SchemaType.NUMBER },
              duration: { type: SchemaType.NUMBER },
              velocity: { type: SchemaType.NUMBER },
              mute: { type: SchemaType.BOOLEAN },
            },
          },
        },
      },
      required: ["track_index", "clip_index", "notes"],
    },
  },
  {
    name: "set_clip_name",
    description: "Name a clip.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER },
        name: { type: SchemaType.STRING },
      },
      required: ["track_index", "clip_index", "name"],
    },
  },
  {
    name: "fire_clip",
    description: "Launch/play a clip in Session View.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER },
      },
      required: ["track_index", "clip_index"],
    },
  },
  {
    name: "stop_clip",
    description: "Stop a playing clip.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER },
      },
      required: ["track_index", "clip_index"],
    },
  },

  // ─── Browser / Instruments ─────────────────────────────────────────────────
  {
    name: "get_browser_tree",
    description: "Get a hierarchical tree of browser categories from Ableton. Use to discover what's available before loading.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        category_type: { type: SchemaType.STRING, description: "'all' | 'instruments' | 'sounds' | 'drums' | 'audio_effects' | 'midi_effects'" },
      },
      required: [],
    },
  },
  {
    name: "get_browser_items_at_path",
    description: "Get browser items at a specific path. Returns items with name and URI that can be loaded.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { path: { type: SchemaType.STRING, description: "Path like 'instruments/synths' or 'drums/acoustic'" } },
      required: ["path"],
    },
  },
  {
    name: "load_instrument_or_effect",
    description: "Load an instrument or effect onto a track using its URI from get_browser_items_at_path.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        uri: { type: SchemaType.STRING, description: "URI from get_browser_items_at_path" },
      },
      required: ["track_index", "uri"],
    },
  },
  {
    name: "load_drum_kit",
    description: "Load a drum rack and then load a specific drum kit into it.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        rack_uri: { type: SchemaType.STRING, description: "URI of the drum rack to load" },
        kit_path: { type: SchemaType.STRING, description: "Path to the drum kit inside the browser (e.g., 'drums/acoustic/kit1')" },
      },
      required: ["track_index", "rack_uri", "kit_path"],
    },
  },

  // ─── Track / Clip Deletion ─────────────────────────────────────────────────
  {
    name: "delete_track",
    description: "Delete a track by index. Call get_session_info first to verify the track exists.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER, description: "Index of the track to delete" },
      },
      required: ["track_index"],
    },
  },
  {
    name: "delete_clip",
    description: "Delete (clear) a clip from a track's clip slot.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER, description: "Scene/slot index of the clip to delete" },
      },
      required: ["track_index", "clip_index"],
    },
  },

  // ─── ElevenLabs Audio Generation ──────────────────────────────────────────────
  {
    name: "generate_sound_effect",
    description: "Generate a sound effect audio file from a text description using ElevenLabs. The file is saved directly to the Ableton User Library. Use the returned ableton_uri to load it onto a track with load_instrument_or_effect.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        description: { type: SchemaType.STRING, description: "Describe the sound effect (e.g. 'deep cinematic explosion', 'crowd roar', 'rain on glass')" },
        duration_seconds: { type: SchemaType.NUMBER, description: "Duration in seconds (0.5–5.0, default 2.0)" },
      },
      required: ["description"],
    },
  },
  {
    name: "text_to_speech",
    description: "Convert text to spoken audio using ElevenLabs and save to the Ableton User Library. Useful for vocal chops, spoken word, or ad-libs.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        text: { type: SchemaType.STRING, description: "The text to speak" },
        voice_id: { type: SchemaType.STRING, description: "Optional ElevenLabs voice ID. Omit to use the default voice." },
      },
      required: ["text"],
    },
  },

  // ─── Browser Search ────────────────────────────────────────────────────────
  {
    name: "search_browser",
    description: "Search the Ableton browser for instruments, effects, or samples by name. Returns matching items with their URIs. Use this to find a specific preset before calling load_instrument_or_effect.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "Name or partial name to search for (e.g. 'Wavetable', '808', 'reverb')" },
        category: { type: SchemaType.STRING, description: "Optional: narrow search to 'instruments' | 'sounds' | 'drums' | 'audio_effects' | 'midi_effects'. Defaults to all." },
      },
      required: ["query"],
    },
  },
];
