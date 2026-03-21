import { SchemaType, type FunctionDeclaration } from "@google/generative-ai";

/**
 * Gemini function declarations for all Ableton MCP tools Wonder needs.
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
    name: "set_tempo",
    description: "Set the session BPM / tempo.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { tempo: { type: SchemaType.NUMBER, description: "BPM value e.g. 90" } },
      required: ["tempo"],
    },
  },
  {
    name: "set_swing_amount",
    description: "Set swing/groove amount on the session.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { amount: { type: SchemaType.NUMBER, description: "Swing 0.0 to 1.0" } },
      required: ["amount"],
    },
  },
  {
    name: "set_metronome",
    description: "Toggle the metronome on or off.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { enabled: { type: SchemaType.BOOLEAN } },
      required: ["enabled"],
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
  {
    name: "undo",
    description: "Undo the last action in Ableton.",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },

  // ─── Tracks ────────────────────────────────────────────────────────────────
  {
    name: "create_midi_track",
    description: "Create a new MIDI track. Always get session_info first to get track_count, then pass that as index.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { index: { type: SchemaType.NUMBER, description: "Insert position — use current track_count from get_session_info" } },
      required: ["index"],
    },
  },
  {
    name: "create_audio_track",
    description: "Create a new audio track.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { index: { type: SchemaType.NUMBER, description: "Insert position — use current track_count" } },
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
  {
    name: "set_track_volume",
    description: "Set a track's fader volume.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        volume: { type: SchemaType.NUMBER, description: "0.0 to 1.0" },
      },
      required: ["track_index", "volume"],
    },
  },
  {
    name: "set_track_mute",
    description: "Mute or unmute a track.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        mute: { type: SchemaType.BOOLEAN },
      },
      required: ["track_index", "mute"],
    },
  },
  {
    name: "freeze_track",
    description: "Freeze a track (render to audio in-place).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { track_index: { type: SchemaType.NUMBER } },
      required: ["track_index"],
    },
  },
  {
    name: "flatten_track",
    description: "Flatten a frozen track to audio.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { track_index: { type: SchemaType.NUMBER } },
      required: ["track_index"],
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
        length: { type: SchemaType.NUMBER, description: "Clip length in bars e.g. 4" },
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
    name: "get_clip_notes",
    description: "Read back the MIDI notes in a clip.",
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

  // ─── Pattern generators ────────────────────────────────────────────────────
  {
    name: "generate_drum_pattern",
    description: "Generate a humanized drum pattern on a MIDI track. Style options: basic, house, hiphop, lofi, trap, jazz, afrobeats, dnb.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER },
        style: { type: SchemaType.STRING, description: "lofi | trap | house | hiphop | jazz | afrobeats | dnb | basic" },
        length: { type: SchemaType.NUMBER, description: "Bars, e.g. 4" },
      },
      required: ["track_index", "clip_index", "style", "length"],
    },
  },
  {
    name: "generate_bassline",
    description: "Generate a humanized bassline on a MIDI track based on a root note and scale.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        clip_index: { type: SchemaType.NUMBER },
        root: { type: SchemaType.NUMBER, description: "Root MIDI note e.g. 36 = C2" },
        scale: { type: SchemaType.STRING, description: "minor | major | pentatonic_minor | blues | dorian | mixolydian" },
        length: { type: SchemaType.NUMBER, description: "Bars" },
      },
      required: ["track_index", "clip_index", "root", "scale", "length"],
    },
  },

  // ─── Browser / Instruments ─────────────────────────────────────────────────
  {
    name: "get_browser_items_at_path",
    description: "Browse Ableton's built-in library. Use paths like 'drums', 'instruments', 'audio_effects', 'midi_effects'. Returns items with name and uri.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { path: { type: SchemaType.STRING, description: "e.g. 'drums' or 'audio_effects'" } },
      required: ["path"],
    },
  },
  {
    name: "load_browser_item",
    description: "Load an instrument or effect onto a track using its browser URI from get_browser_items_at_path.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        item_uri: { type: SchemaType.STRING, description: "URI from get_browser_items_at_path" },
      },
      required: ["track_index", "item_uri"],
    },
  },

  // ─── Device parameters ─────────────────────────────────────────────────────
  {
    name: "get_device_parameters",
    description: "Get all parameters for a device/plugin on a track.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        device_index: { type: SchemaType.NUMBER, description: "Usually 0 for the first device" },
      },
      required: ["track_index", "device_index"],
    },
  },
  {
    name: "set_device_parameter",
    description: "Set a parameter value on a device.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        device_index: { type: SchemaType.NUMBER },
        parameter_index: { type: SchemaType.NUMBER },
        value: { type: SchemaType.NUMBER },
      },
      required: ["track_index", "device_index", "parameter_index", "value"],
    },
  },
  {
    name: "set_rack_macro",
    description: "Set a macro knob value on an Ableton Rack device.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        device_index: { type: SchemaType.NUMBER },
        macro_index: { type: SchemaType.NUMBER, description: "0-7" },
        value: { type: SchemaType.NUMBER, description: "0.0 to 1.0" },
      },
      required: ["track_index", "device_index", "macro_index", "value"],
    },
  },

  // ─── Scenes ────────────────────────────────────────────────────────────────
  {
    name: "create_scene",
    description: "Create a new scene (row) in Session View.",
    parameters: { type: SchemaType.OBJECT, properties: {}, required: [] },
  },
  {
    name: "fire_scene",
    description: "Launch all clips in a scene.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { scene_index: { type: SchemaType.NUMBER } },
      required: ["scene_index"],
    },
  },

  // ─── Wonder composite ──────────────────────────────────────────────────────
  {
    name: "create_wonder_session",
    description: "Build a complete Wonder session in one command — sets BPM, swing, creates multiple tracks with clips and patterns. Use this when the user asks to 'make a beat', 'create a session', 'build a track' etc.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        bpm: { type: SchemaType.NUMBER, description: "Tempo e.g. 90" },
        swing: { type: SchemaType.NUMBER, description: "Swing 0.0–1.0, e.g. 0.15" },
        key_root: { type: SchemaType.NUMBER, description: "Root note 0–11 (0=C, 2=D, 4=E, 5=F, 7=G, 9=A, 11=B)" },
        scale: { type: SchemaType.STRING, description: "minor | major | pentatonic_minor | blues | dorian" },
        tracks: {
          type: SchemaType.ARRAY,
          description: 'Array of track specs. Each: { type: "midi"|"audio", name: string, pattern?: string, bassline?: boolean, clip_length?: number, notes?: array }',
          items: { type: SchemaType.OBJECT, properties: {} },
        },
      },
      required: ["bpm", "tracks"],
    },
  },
  {
    name: "load_sample_by_path",
    description: "Load a .wav or .aif file onto a Simpler or Drum Rack pad. The file is copied to the Ableton User Library automatically.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER },
        file_path: { type: SchemaType.STRING, description: "Absolute path to .wav/.aif" },
        device_index: { type: SchemaType.NUMBER, description: "Usually 0" },
        pad_index: { type: SchemaType.NUMBER, description: "MIDI note of Drum Rack pad, or omit for Simpler" },
      },
      required: ["track_index", "file_path"],
    },
  },

  // ─── VST3 / AU Plugin Support ──────────────────────────────────────────────
  {
    name: "search_plugins",
    description: "Search for VST3, AU, or Max plugins by name in the Ableton browser. Use this to discover available plugins before loading.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "Plugin name to search for (partial match). Empty returns all." },
        plugin_type: { type: SchemaType.STRING, description: "Filter: 'all' | 'vst3' | 'au' | 'vst' | 'max'. Default: 'all'" },
      },
      required: [],
    },
  },
  {
    name: "load_plugin_by_name",
    description: "Load a VST3 or AU plugin onto a track by name. Searches the browser and loads the best match. Use search_plugins first if unsure of the exact name.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER, description: "Zero-based track index" },
        plugin_name: { type: SchemaType.STRING, description: "Plugin name e.g. 'Serum', 'Massive X', 'OTT', 'Valhalla Room'" },
        plugin_type: { type: SchemaType.STRING, description: "Filter: 'all' | 'vst3' | 'au' | 'vst'. Default: 'all'" },
      },
      required: ["track_index", "plugin_name"],
    },
  },
  {
    name: "get_track_devices",
    description: "Get all devices (instruments, effects, VSTs) on a track with their parameter names, values, and ranges. Use this before set_device_parameter_by_name to find the right parameter name.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER, description: "Zero-based track index" },
      },
      required: ["track_index"],
    },
  },
  {
    name: "set_device_parameter_by_name",
    description: "Set a VST/AU/native device parameter by name. Partial name match is supported. Use get_track_devices first to see available parameters and their ranges.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        track_index: { type: SchemaType.NUMBER, description: "Zero-based track index" },
        device_index: { type: SchemaType.NUMBER, description: "Zero-based device index on the track" },
        param_name: { type: SchemaType.STRING, description: "Parameter name e.g. 'Filter Cutoff', 'Decay', 'Macro 1', 'OSC A Level'" },
        value: { type: SchemaType.NUMBER, description: "New value. Will be clamped to parameter min/max." },
      },
      required: ["track_index", "device_index", "param_name", "value"],
    },
  },

  // ─── Audio-to-MIDI Transcription ───────────────────────────────────────────
  {
    name: "transcribe_audio",
    description: "Transcribe hummed or whistled audio to MIDI notes using AI pitch detection. Use this when the user records audio via the mic button. Returns notes that can be added to a clip.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        audio_data: { type: SchemaType.STRING, description: "Base64-encoded audio data (WebM or WAV)" },
        input_format: { type: SchemaType.STRING, description: "Audio format: 'webm' or 'wav' (default: webm)" },
        tempo_bpm: { type: SchemaType.NUMBER, description: "Tempo for beat conversion (default: 120)" },
      },
      required: ["audio_data"],
    },
  },
  {
    name: "load_midi_notes",
    description: "Load MIDI notes from a saved transcription file by midi_id. Use this when you have a midi_id from a user's hummed melody and need to get the actual notes to add to a clip.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        midi_id: { type: SchemaType.STRING, description: "The midi_id from a previous transcription (e.g., 'melody_abc12345')" },
      },
      required: ["midi_id"],
    },
  },
];
