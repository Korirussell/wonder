# The New Way: Wonder Frontend + MCP Architecture

**Last Updated:** March 21, 2026

---

## Architecture Overview

### **The Stack**

```
User Input (Wonder Frontend)
    ↓
Next.js API Route (/api/chat)
    ↓
Google Gemini 2.5 Flash (with function calling)
    ↓
Wonder Tool Declarations (wonderTools.ts)
    ↓
Ableton Command Translator (route.ts)
    ↓
TCP Socket (localhost:9877)
    ↓
AbletonMCP Remote Script (Python, running inside Ableton)
    ↓
Ableton Live 12 (Live Object Model)
```

### **Key Components**

1. **Frontend (`frontend/src/`)**
   - Next.js 16.2.1 with Turbopack
   - React 19.2.4
   - Google Generative AI SDK
   - Real-time session state tracking

2. **Chat API (`/api/chat/route.ts`)**
   - Gemini function calling orchestration
   - Agentic loop (MAX_TOOL_ROUNDS = 20)
   - Session state management
   - Music theory validation

3. **Tool Declarations (`wonderTools.ts`)**
   - Gemini-compatible function schemas
   - Maps to Ableton Remote Script commands
   - Includes: session control, tracks, clips, MIDI, browser, devices

4. **Ableton Bridge (`lib/ableton.ts`)**
   - TCP socket communication
   - Command/response JSON protocol
   - 5-second timeout per command

5. **Remote Script (`kori-mcp/AbletonMCP_Remote_Script/`)**
   - Python script running inside Ableton Live
   - Listens on `localhost:9877`
   - Executes commands via Live Object Model (LOM)

---

## Current Issues & Root Causes

### **1. Instruments Not Loading on Tracks**

**Symptom:** Tracks are created but remain empty (no instruments loaded)

**Root Cause:**
- Gemini calls `create_midi_track` but doesn't follow up with `load_instrument_or_effect`
- The system prompt doesn't emphasize that MIDI tracks need instruments
- No validation enforcing "instrument must be loaded before MIDI notes"

**Example Failure:**
```
User: "make a trap beat"
Gemini: 
  1. create_midi_track ✓
  2. create_clip ✓
  3. add_notes_to_clip ✗ (no sound - no instrument loaded)
```

**Fix Required:**
- Update system prompt: "ALWAYS load an instrument via load_instrument_or_effect BEFORE adding MIDI notes"
- Add validation: reject `add_notes_to_clip` if track has no devices
- Consider a composite `create_midi_track_with_instrument` tool

---

### **2. MIDI Not Being Placed in Clips**

**Symptom:** Clips are created but contain no MIDI notes

**Root Causes:**
- Gemini stops calling tools before completing the task (hits MAX_TOOL_ROUNDS)
- Gemini thinks it's "done" after loading instruments, doesn't generate MIDI
- No explicit instruction to "always add notes after creating a clip"

**Example Failure:**
```
User: "make a hans zimmer styled track"
Gemini:
  1. get_session_info ✓
  2. create_midi_track ✓
  3. set_track_name ✓
  4. load_instrument_or_effect ✓
  5. [STOPS - no create_clip, no add_notes_to_clip]
```

**Fix Required:**
- System prompt: "After loading an instrument, ALWAYS create a clip and add MIDI notes"
- Increase MAX_TOOL_ROUNDS to 30 for complex multi-track sessions
- Add a `create_clip_with_notes` composite tool to reduce round trips

---

### **3. Cannot Delete Tracks**

**Symptom:** User asks to delete tracks, Wonder ignores the request

**Root Cause:**
- **No `delete_track` tool exists in wonderTools.ts**
- The Remote Script doesn't implement track deletion
- Gemini has no way to delete tracks even if it wanted to

**Fix Required:**
- Add `delete_track` tool declaration:
  ```typescript
  {
    name: "delete_track",
    description: "Delete a track by index. Use get_session_info first to verify track exists.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { 
        track_index: { type: SchemaType.NUMBER, description: "Index of track to delete" } 
      },
      required: ["track_index"],
    },
  }
  ```
- Implement in Remote Script:
  ```python
  def _delete_track(self, track_index):
      if 0 <= track_index < len(self.song().tracks):
          self.song().delete_track(track_index)
          return {"deleted": True, "track_index": track_index}
      return {"error": "Track index out of range"}
  ```

---

### **4. Empty Responses After Multiple Prompts**

**Symptom:** Wonder returns blank responses after 2-3 successful interactions

**Root Causes:**
- `response.response.text()` throws an error in multi-turn conversations
- Gemini API occasionally returns malformed responses
- No error handling for empty text extraction

**Fix Applied:** ✅
- Comprehensive try-catch around text extraction
- Fallback to extract text from response parts
- Graceful error messages instead of empty responses

---

### **5. Prompting Challenges**

**Issue:** Gemini doesn't always follow the workflow correctly

**Examples:**
- Creates tracks but doesn't name them descriptively
- Loads wrong instruments (e.g., Wavetable instead of user-specified `.adg` file)
- Doesn't respect user's style requests (e.g., "Metro Boomin trap beat" → generic beat)
- Forgets to fire clips after creating them

**Root Causes:**
- System prompt is too generic
- No examples of complete workflows
- No reinforcement of critical steps

**Fix Required:**
- Add workflow examples to system prompt:
  ```
  ## Example: Making a trap beat
  1. get_session_info → know current state
  2. set_tempo 140 → trap tempo
  3. create_midi_track → drums
  4. set_track_name "808 Drums"
  5. load_drum_kit → load 808 kit
  6. create_clip → 4 bars
  7. add_notes_to_clip → trap hi-hat pattern
  8. fire_clip → play it
  ```
- Add style-specific knowledge (trap = 140 BPM, dark minor scales, 808s, etc.)

---

### **6. Browser Item Loading Issues**

**Symptom:** Gemini can't find `.adg` files or specific instruments

**Root Causes:**
- `get_browser_items_at_path` returns complex nested structures
- Gemini doesn't know how to navigate the browser tree
- URIs are inconsistent (`query:Synths#Wavetable` vs `uri://device/...`)

**Example Failure:**
```
User: "load synthbeauty.adg"
Gemini: 
  1. get_browser_items_at_path "instruments" ✓
  2. load_instrument_or_effect uri="query:Synths#Wavetable" ✗ (wrong instrument)
```

**Fix Required:**
- Add `search_browser` tool that takes a string query
- Pre-index common `.adg` files and their URIs
- System prompt: "To find a specific file, use search_browser with the filename"

---

## Proposed Improvements

### **Immediate (This Week)**

1. **Add Missing Tools**
   - `delete_track(track_index)`
   - `delete_clip(track_index, clip_index)`
   - `search_browser(query)` - fuzzy search for instruments/effects

2. **Fix System Prompt**
   - Add explicit workflow examples
   - Emphasize: "ALWAYS load instrument BEFORE adding MIDI"
   - Add: "ALWAYS fire_clip or start_playback after creating music"

3. **Increase Tool Rounds**
   - Change `MAX_TOOL_ROUNDS` from 20 to 30
   - Log when limit is hit to identify complex tasks

4. **Add Validation Rules**
   - Reject `add_notes_to_clip` if track has no devices
   - Reject `fire_clip` if clip has no notes
   - Warn if tempo is outside reasonable range (60-200 BPM)

---

### **Short-Term (Next 2 Weeks)**

1. **Composite Tools** (reduce round trips)
   - `create_track_with_instrument(name, instrument_uri)`
   - `create_clip_with_notes(track_index, notes, length)`
   - `create_drum_track_with_pattern(style, tempo)`

2. **Style Knowledge Base**
   - Add `wonder-styles.md` with genre-specific rules:
     - Trap: 140 BPM, minor scales, 808s, hi-hat rolls
     - Lo-fi: 80-90 BPM, jazz chords, vinyl crackle, swing
     - Hans Zimmer: orchestral, epic strings, brass, slow build

3. **Session State Validation**
   - Track session state in-memory (tracks, clips, devices)
   - Validate tool calls against current state
   - Prevent out-of-bounds errors

4. **Better Error Messages**
   - When tool fails, explain WHY and HOW to fix
   - Example: "Failed to add notes - no instrument loaded. Call load_instrument_or_effect first."

---

### **Medium-Term (Next Month)**

1. **Multi-Step Planning**
   - Before executing, Gemini generates a plan
   - User approves plan
   - Gemini executes plan step-by-step
   - Reduces trial-and-error, increases success rate

2. **Undo/Redo Support**
   - Track all commands in a history stack
   - `undo_last_action()` tool
   - `redo_last_action()` tool

3. **Audio Analysis Integration**
   - Analyze user's existing tracks
   - Suggest complementary instruments/patterns
   - Match tempo/key automatically

4. **Template System**
   - Pre-built session templates (trap, lo-fi, house, etc.)
   - `load_template(genre)` tool
   - User can customize templates

---

### **Long-Term (Next Quarter)**

1. **Custom MCP Server**
   - Replace direct Gemini API calls with MCP protocol
   - Allows switching between LLMs (Claude, GPT-4, etc.)
   - Better tool orchestration and state management

2. **Visual Feedback**
   - Show tool execution progress in UI
   - Highlight tracks/clips being modified
   - Real-time waveform preview

3. **Collaborative Sessions**
   - Multiple users can prompt Wonder simultaneously
   - Version control for Ableton sessions
   - Conflict resolution

4. **Plugin Parameter Control**
   - Full VST parameter mapping
   - "Make the 808 punchier" → adjusts attack/decay/pitch
   - "Add reverb to vocals" → loads reverb, sets wet/dry

---

## Testing Checklist

Before deploying fixes, test these scenarios:

- [ ] Create a track with a specific instrument (e.g., "make a track with Serum")
- [ ] Create a multi-track session (drums, bass, chords, melody)
- [ ] Delete a track
- [ ] Load a custom `.adg` file
- [ ] Generate MIDI notes in a specific style (trap, lo-fi, etc.)
- [ ] Fire clips after creation
- [ ] Handle 10+ consecutive prompts without empty responses
- [ ] Recover gracefully from tool errors

---

## Performance Metrics

**Current Performance:**
- Average response time: 15-45 seconds
- Tool rounds per request: 5-10
- Success rate (task completion): ~60%
- Empty response rate: ~15%

**Target Performance:**
- Average response time: <10 seconds
- Tool rounds per request: 3-7
- Success rate: >90%
- Empty response rate: <1%

---

## Known Limitations

1. **Cannot load VST3 plugins dynamically** (Ableton LOM limitation)
2. **Cannot place audio clips on Arrangement timeline** (Ableton LOM limitation)
3. **Cannot load `.adg` files by absolute path** (must use browser URI)
4. **Free tier Gemini quota: 20 requests/day** (upgrade to paid for unlimited)
5. **No real-time audio playback in frontend** (must check Ableton directly)

---

## Next Steps

1. Implement `delete_track` tool ✅
2. Update system prompt with workflow examples ✅
3. Add validation for instrument loading ⏳
4. Increase MAX_TOOL_ROUNDS to 30 ⏳
5. Test with complex multi-track sessions ⏳
6. Document all tool declarations with examples ⏳

---

## Resources

- **Ableton Live Object Model (LOM) Docs:** https://docs.cycling74.com/max8/vignettes/live_object_model
- **Google Gemini Function Calling:** https://ai.google.dev/gemini-api/docs/function-calling
- **Model Context Protocol (MCP):** https://modelcontextprotocol.io
- **Wonder GitHub:** (add repo link)

---

**Contributors:** Kori, Cascade AI  
**Status:** Active Development  
**Version:** 1.0 (March 2026)
