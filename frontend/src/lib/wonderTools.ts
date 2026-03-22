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
    name: "load_instrument_by_name",
    description: "Load a built-in Ableton instrument onto a track by name. PREFERRED over get_browser_items_at_path. Works with: 'Wavetable', 'Operator', 'Analog', 'Drift', 'Simpler', 'Drum Rack', 'Electric', 'Tension', 'Meld'. Use this instead of browsing.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER, description: "Track index to load instrument onto" },
        name: { type: SchemaType.STRING, description: "Instrument name e.g. 'Wavetable', 'Operator', 'Drum Rack'" },
      },
      required: ["track_index", "name"],
    },
  },
  {
    name: "get_browser_items_at_path",
    description: "Get browser items at a specific path. Slow — prefer load_instrument_by_name for loading instruments.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { path: { type: SchemaType.STRING } },
      required: ["path"],
    },
  },
  {
    name: "load_instrument_or_effect",
    description: "Load an instrument or effect onto a track using its URI. Prefer load_instrument_by_name instead.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        uri: { type: SchemaType.STRING },
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

  // ─── Audio Processing ───────────────────────────────────────────────────────
  {
    name: "extract_harmonics",
    description: "Extract harmonic components from an audio file using HPSS (Harmonic-Percussive Source Separation). Isolates melodic/harmonic content from percussion. Use this when the user wants to separate harmony from drums, or wants the melodic part of a sample.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        audio_data: { type: SchemaType.STRING, description: "Base64 encoded audio data" },
        filename: { type: SchemaType.STRING, description: "Original filename for reference" },
      },
      required: ["audio_data"],
    },
  },
  {
    name: "process_reverb",
    description: "Apply reverb effect to audio. Adds spatial depth and ambience. Use this when the user wants to add space, room, or ambience to a sound.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        audio_data: { type: SchemaType.STRING, description: "Base64 encoded audio data" },
        filename: { type: SchemaType.STRING, description: "Original filename" },
        room_size: { type: SchemaType.NUMBER, description: "Room size 0.0-1.0, default 0.5" },
        damping: { type: SchemaType.NUMBER, description: "High-freq damping 0.0-1.0, default 0.5" },
        wet_level: { type: SchemaType.NUMBER, description: "Reverb level 0.0-1.0, default 0.3" },
        dry_level: { type: SchemaType.NUMBER, description: "Dry signal level 0.0-1.0, default 0.7" },
      },
      required: ["audio_data"],
    },
  },
  {
    name: "chop_audio",
    description: "Intelligently chop audio into segments using onset detection and k-means clustering. Creates multiple audio segments based on musical onsets. Use this to create sample chops from a longer audio file.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        audio_data: { type: SchemaType.STRING, description: "Base64 encoded audio data" },
        filename: { type: SchemaType.STRING, description: "Original filename" },
        default_length: { type: SchemaType.NUMBER, description: "Default chop length in seconds, default 1.8" },
        min_duration: { type: SchemaType.NUMBER, description: "Minimum chop duration in seconds, default 0.2" },
        n_clusters: { type: SchemaType.NUMBER, description: "Number of k-means clusters for grouping similar chops, default 6" },
      },
      required: ["audio_data"],
    },
  },
  {
    name: "adjust_pitch",
    description: "Shift the pitch of audio by a number of semitones. Positive = higher pitch, negative = lower pitch.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        audio_data: { type: SchemaType.STRING, description: "Base64 encoded audio data" },
        filename: { type: SchemaType.STRING, description: "Original filename" },
        semitones: { type: SchemaType.NUMBER, description: "Semitones to shift. Positive = up, negative = down" },
      },
      required: ["audio_data", "semitones"],
    },
  },
  {
    name: "adjust_speed",
    description: "Change the playback speed of audio without changing pitch. 1.0 = normal, 2.0 = double speed, 0.5 = half speed.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        audio_data: { type: SchemaType.STRING, description: "Base64 encoded audio data" },
        filename: { type: SchemaType.STRING, description: "Original filename" },
        speed_factor: { type: SchemaType.NUMBER, description: "Speed multiplier. 1.0 = normal, 2.0 = 2x faster, 0.5 = 2x slower" },
      },
      required: ["audio_data", "speed_factor"],
    },
  },
];
