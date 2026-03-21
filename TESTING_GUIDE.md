# Wonder Testing Guide

## Quick Start

### 1. Start All Services

```bash
# Terminal 1: Ableton MCP Server (already running)
cd /Users/kori/codecage/wonder/ableton-mcp
python3 MCP_Server/server.py

# Terminal 2: Frontend
cd /Users/kori/codecage/wonder/frontend
npm run dev

# Open browser
open http://localhost:3000
```

### 2. Test Voice Input

1. Click the green mic button
2. Say: "Make a 90bpm lofi beat in D minor"
3. Click stop (red button)
4. Watch Wonder create the session!

### 3. Test Text Input

Try these prompts:
- "Make some hard Hans Zimmer shit" (epic orchestral)
- "Create a trap beat at 140bpm"
- "Build a house track with a fat bassline"
- "Make a jazzy chord progression in C major"

### 4. What to Look For

**✅ Good Signs:**
- Instruments load before MIDI clips created
- Melodies stay in the specified key
- BPM matches the genre (lofi: 80-95, trap: 130-150)
- Console shows validation passing
- Session state updates after each tool call

**❌ Issues to Watch:**
- "Validation failed" errors (means it's working - blocking bad MIDI)
- Connection errors (check Ableton is open with AbletonMCP active)
- Empty responses (check console for errors)

## Console Logs to Monitor

```
[Wonder] Successfully loaded wonder.md knowledge base
[Wonder] → create_midi_track {"index": 0}
[Wonder] ✓ create_midi_track: {"index": 0}
[Wonder] 📊 Session state updated: {"bpm":90,"key":"D","scale":"minor"...}
[Wonder] ⚠ Warnings for add_notes_to_clip: ["Note 5: Pitch 63 is not in D minor scale"]
```

## Common Issues & Fixes

### "Cannot read properties of undefined (reading 'parts')"
**Fixed!** This was caused by malformed response structure. Now handled gracefully.

### "Validation failed: Track 0 has no instrument loaded"
**This is correct behavior!** Wonder is blocking MIDI creation without an instrument. Gemini should retry with instrument loading.

### "GEMINI_API_KEY not set"
Check `frontend/.env.local` exists with your API key.

### "Connection error — make sure the Wonder backend is running"
1. Check Ableton is open
2. Check AbletonMCP is selected in Preferences → Link/Tempo/MIDI
3. Check port 9877 is not in use: `lsof -i :9877`

## Testing Checklist

### Basic Functionality
- [ ] Frontend loads at localhost:3000
- [ ] Chat interface appears
- [ ] Can type messages
- [ ] Mic button works (green → red when recording)
- [ ] Messages appear in chat

### Voice Input
- [ ] Mic permission requested
- [ ] Recording starts (red pulse animation)
- [ ] Recording stops on click
- [ ] Audio sent to Gemini
- [ ] Gemini responds with music creation

### Music Quality (Wonder.md System)
- [ ] Instruments always loaded before MIDI
- [ ] Notes stay in specified key/scale
- [ ] BPM matches genre conventions
- [ ] Validation warnings appear in console
- [ ] Session state updates logged

### Validation System
- [ ] Blocks MIDI without instrument
- [ ] Warns on out-of-scale notes
- [ ] Checks voice leading
- [ ] Validates velocity ranges
- [ ] Updates state after each tool

## Example Test Session

```
User: "Make a lofi beat in D minor at 90bpm"

Expected Console Output:
[Wonder] Successfully loaded wonder.md knowledge base
[Wonder] → set_tempo {"tempo": 90}
[Wonder] ✓ set_tempo
[Wonder] 📊 Session state updated: {"bpm":90...}
[Wonder] → create_midi_track {"index": 0}
[Wonder] ✓ create_midi_track
[Wonder] → load_browser_item {"track_index": 0, "item_uri": "Drum Rack"}
[Wonder] ✓ load_browser_item
[Wonder] 📊 Session state updated: {...instrument_loaded: true...}
[Wonder] → create_clip {"track_index": 0, "clip_index": 0, "length": 4}
[Wonder] ✓ create_clip
[Wonder] → add_notes_to_clip {"track_index": 0, "clip_index": 0, "notes": [...]}
[Wonder] ✓ add_notes_to_clip
[Wonder] 📊 Session state updated: {...notes_count: 32...}

Expected Result:
✅ Drum track created with Drum Rack loaded
✅ 4-bar lofi drum pattern with swing
✅ All notes in D minor scale
✅ Velocities 60-95 (lofi range)
```

## Performance Benchmarks

- **Voice input latency:** ~2-3 seconds (Gemini audio processing)
- **Session creation time:** ~5-10 seconds (depends on complexity)
- **Validation overhead:** <100ms per tool call
- **State update time:** <50ms per tool call

## Debugging Tips

### Enable Verbose Logging
Check browser console (F12) for detailed logs:
- `[Wonder]` prefix = Our logs
- Validation errors/warnings
- Session state updates
- Tool call results

### Check Ableton Connection
```bash
# Test TCP connection
nc -zv localhost 9877

# Check what's using port 9877
lsof -i :9877
```

### Verify Wonder.md Loaded
Look for console log:
```
[Wonder] Successfully loaded wonder.md knowledge base
```

If you see:
```
[Wonder] Failed to load wonder.md - using base prompt only
```

Check that `wonder.md` exists in project root.

## Success Criteria

✅ Voice input works flawlessly  
✅ Instruments always loaded before MIDI  
✅ Melodies follow music theory rules  
✅ Session maintains harmonic cohesion  
✅ Validation catches errors before Ableton  
✅ State tracked throughout conversation  
✅ Genre conventions followed (BPM, swing, patterns)  

## Next Steps

1. Test with various genres (lofi, trap, house, jazz)
2. Test voice input with melody humming
3. Test complex multi-track sessions
4. Verify validation catches all edge cases
5. Record demo video showing the system working

---

**Happy testing! 🎵**
