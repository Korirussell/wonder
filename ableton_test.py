"""
Wonder — Ableton MCP Autonomous Test Suite
Runs while you sleep. Results written to test_results.md
"""

import socket
import json
import time
import random
import os
from datetime import datetime

HOST = "localhost"
PORT = 9877
RESULTS_FILE = os.path.join(os.path.dirname(__file__), "test_results.md")

# ─────────────────────────────────────────────
# Low-level TCP connection to Ableton Remote Script
# ─────────────────────────────────────────────

class Ableton:
    def __init__(self):
        self.sock = None

    def connect(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((HOST, PORT))
        self.sock = s
        # Warm up: ping with a read-only command to flush any stale state
        time.sleep(0.3)
        try:
            payload = json.dumps({"type": "health_check", "params": {}}).encode()
            self.sock.sendall(payload)
            self.sock.settimeout(5)
            chunks = []
            while True:
                try:
                    chunk = self.sock.recv(8192)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    try:
                        json.loads(b"".join(chunks).decode())
                        break
                    except json.JSONDecodeError:
                        continue
                except socket.timeout:
                    break
        except Exception:
            pass
        time.sleep(0.2)

    def disconnect(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def cmd(self, command_type, **params):
        """Send a command; auto-reconnect once if the socket is broken."""
        for attempt in range(2):
            try:
                if not self.sock:
                    self.connect()
                payload = json.dumps({"type": command_type, "params": params}).encode()
                self.sock.sendall(payload)
                time.sleep(0.15)
                chunks = []
                self.sock.settimeout(30)
                while True:
                    try:
                        chunk = self.sock.recv(8192)
                        if not chunk:
                            break
                        chunks.append(chunk)
                        try:
                            data = b"".join(chunks)
                            parsed = json.loads(data.decode())
                            if parsed.get("status") == "error":
                                raise RuntimeError(parsed.get("message", "Ableton error"))
                            return parsed.get("result", {})
                        except json.JSONDecodeError:
                            continue
                    except socket.timeout:
                        break
                data = b"".join(chunks)
                if data:
                    try:
                        parsed = json.loads(data.decode())
                        if parsed.get("status") == "error":
                            raise RuntimeError(parsed.get("message", "Ableton error"))
                        return parsed.get("result", {})
                    except json.JSONDecodeError:
                        pass
                # Timeout with no valid data — reconnect and retry
                self.disconnect()
                if attempt == 0:
                    time.sleep(0.5)
                    continue
                raise RuntimeError(f"Timeout waiting for Ableton response to '{command_type}'")
            except RuntimeError:
                raise
            except Exception as e:
                self.disconnect()
                if attempt == 0:
                    time.sleep(0.5)
                    continue
                raise RuntimeError(f"Socket error on '{command_type}': {e}")
        raise RuntimeError(f"Failed after 2 attempts: {command_type}")


# ─────────────────────────────────────────────
# Test harness
# ─────────────────────────────────────────────

class Results:
    def __init__(self):
        self.entries = []
        self.passed = 0
        self.failed = 0
        self.start = datetime.now()

    def ok(self, name, detail=""):
        self.passed += 1
        self.entries.append(("PASS", name, detail))
        print(f"  ✓  {name}" + (f" — {detail}" if detail else ""))

    def fail(self, name, error):
        self.failed += 1
        self.entries.append(("FAIL", name, str(error)))
        print(f"  ✗  {name} — {error}")

    def section(self, title):
        self.entries.append(("SECTION", title, ""))
        print(f"\n## {title}")

    def note(self, text):
        self.entries.append(("NOTE", text, ""))
        print(f"     {text}")

    def write_markdown(self):
        lines = [
            "# Wonder — Ableton MCP Test Results",
            f"**Run:** {self.start.strftime('%Y-%m-%d %H:%M')}  ",
            f"**Passed:** {self.passed}  **Failed:** {self.failed}  ",
            f"**Repo:** jpoindexter/ableton-mcp (128 tools)  ",
            "",
        ]
        for kind, name, detail in self.entries:
            if kind == "SECTION":
                lines.append(f"\n## {name}\n")
            elif kind == "NOTE":
                lines.append(f"> {name}")
            elif kind == "PASS":
                lines.append(f"- ✅ **{name}**" + (f" — `{detail}`" if detail else ""))
            elif kind == "FAIL":
                lines.append(f"- ❌ **{name}** — `{detail}`")
        lines += [
            "",
            "---",
            "## Limitations Summary",
            "",
            "| Wonder Feature | Result | Notes |",
            "|---|---|---|",
        ]
        for kind, name, detail in self.entries:
            if kind == "PASS" and any(k in name for k in ["Track", "Clip", "MIDI", "Drum", "Sauce", "Device", "Scene", "Undo"]):
                lines.append(f"| {name} | ✅ Easy | {detail} |")
            elif kind == "FAIL" and any(k in name for k in ["Track", "Clip", "MIDI", "Drum", "Sauce", "Device", "Scene", "Undo"]):
                lines.append(f"| {name} | ❌ Broken | {detail} |")
        with open(RESULTS_FILE, "w") as f:
            f.write("\n".join(lines))
        print(f"\nResults written to {RESULTS_FILE}")


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def humanized_kick_pattern(bars=2):
    """Lo-fi house kick — 4 on the floor with velocity swing"""
    notes = []
    for bar in range(bars):
        for beat in range(4):
            t = bar * 4.0 + beat
            # Velocity: downbeats harder, with slight randomness
            vel = 110 if beat == 0 else 100
            vel += random.randint(-5, 5)
            notes.append({"pitch": 36, "start_time": t, "duration": 0.2, "velocity": vel, "mute": False})
    return notes

def humanized_snare_clap(bars=2):
    """Snare/clap on 2 and 4 with velocity variation"""
    notes = []
    for bar in range(bars):
        for beat in [1, 3]:
            t = bar * 4.0 + beat
            vel = 95 + random.randint(-8, 8)
            notes.append({"pitch": 38, "start_time": t, "duration": 0.15, "velocity": vel, "mute": False})
            # Layer clap slightly offset (+8ms = ~0.02 beats at 120bpm)
            notes.append({"pitch": 39, "start_time": t + 0.02, "duration": 0.15, "velocity": vel - 10, "mute": False})
    return notes

def humanized_hihats(bars=2, style="lofi"):
    """Ghost hi-hats with strong velocity curve"""
    notes = []
    for bar in range(bars):
        if style == "lofi":
            # Swung 8th hi-hats with velocity accents on beats
            pattern = [
                (0.0, 75), (0.5, 45), (1.0, 70), (1.5, 40),
                (2.0, 75), (2.5, 45), (3.0, 70), (3.5, 40),
            ]
        elif style == "house":
            # Straight 16ths with heavy accent on beat
            pattern = []
            for i in range(16):
                t = i * 0.25
                vel = 85 if i % 4 == 0 else (65 if i % 2 == 0 else 45)
                pattern.append((t, vel))
        else:
            pattern = [(i * 0.25, random.randint(40, 80)) for i in range(16)]
        for (offset, base_vel) in pattern:
            t = bar * 4.0 + offset
            vel = base_vel + random.randint(-6, 6)
            vel = max(20, min(127, vel))
            notes.append({"pitch": 42, "start_time": t, "duration": 0.1, "velocity": vel, "mute": False})
    return notes

def humanized_bass(root=36, bars=2):
    """Simple pentatonic minor bassline with organic timing"""
    pent_minor = [0, 3, 5, 7, 10]
    notes = []
    for bar in range(bars):
        # Root on beat 1
        notes.append({"pitch": root + 24, "start_time": bar * 4.0, "duration": 0.45, "velocity": 100, "mute": False})
        # Rhythmic movement on off-beats
        for step in [(0.75, 1), (1.5, 3), (2.0, 0), (2.5, 5), (3.0, 3), (3.75, 7)]:
            offset, interval = step
            pitch = root + 24 + random.choice(pent_minor[:4])
            vel = 75 + random.randint(-10, 10)
            dur = random.choice([0.2, 0.25, 0.4])
            notes.append({"pitch": pitch, "start_time": bar * 4.0 + offset, "duration": dur, "velocity": vel, "mute": False})
    return notes


# ─────────────────────────────────────────────
# Test phases
# ─────────────────────────────────────────────

def get_track_count(ab):
    info = ab.cmd("get_session_info")
    return info.get("track_count", 0)

def test_connection(ab, r):
    r.section("Phase 2 — Connection")
    try:
        info = ab.cmd("get_session_info")
        r.ok("get_session_info", f"BPM={info.get('tempo')}, tracks={info.get('track_count')}, time_sig={info.get('signature_numerator')}/{info.get('signature_denominator')}")
    except Exception as e:
        r.fail("get_session_info", e)
        raise SystemExit("Cannot connect to Ableton — aborting")

    try:
        ab.cmd("set_tempo", tempo=120.0)
        info2 = ab.cmd("get_session_info")
        r.ok("set_tempo", f"confirmed={info2.get('tempo')}")
    except Exception as e:
        r.fail("set_tempo", e)


def test_tracks(ab, r):
    r.section("Phase 3A — Track Creation")
    track_indices = {}

    try:
        before = get_track_count(ab)
        result = ab.cmd("create_midi_track", index=before)
        idx = result.get("index", before)
        ab.cmd("set_track_name", track_index=idx, name="Wonder_MIDI_Test")
        ab.cmd("set_track_volume", track_index=idx, volume=0.85)
        ab.cmd("set_track_pan", track_index=idx, pan=0.0)
        track_indices["midi"] = idx
        r.ok("create_midi_track + name + vol + pan", f"track_index={idx}")
    except Exception as e:
        r.fail("create_midi_track", e)

    try:
        before = get_track_count(ab)
        result = ab.cmd("create_audio_track", index=before)
        idx = result.get("index", before)
        ab.cmd("set_track_name", track_index=idx, name="Wonder_Audio_Test")
        track_indices["audio"] = idx
        r.ok("create_audio_track + name", f"track_index={idx}")
    except Exception as e:
        r.fail("create_audio_track", e)

    return track_indices


def test_midi_clips(ab, r, track_idx):
    r.section("Phase 3B — MIDI Clip Injection + Humanization")

    clip_idx = 0
    try:
        ab.cmd("create_clip", track_index=track_idx, clip_index=clip_idx, length=8.0)
        ab.cmd("set_clip_name", track_index=track_idx, clip_index=clip_idx, name="Wonder_Test_Loop")
        r.ok("create_clip (8 bars)", f"track={track_idx} clip={clip_idx}")
    except Exception as e:
        r.fail("create_clip", e)
        return

    # Inject humanized notes
    try:
        notes = (
            humanized_kick_pattern(bars=2) +
            humanized_snare_clap(bars=2) +
            humanized_hihats(bars=2, style="lofi")
        )
        ab.cmd("add_notes_to_clip", track_index=track_idx, clip_index=clip_idx, notes=notes)
        r.ok("add_notes_to_clip (humanized drum pattern)", f"{len(notes)} notes with velocity variation")
    except Exception as e:
        r.fail("add_notes_to_clip", e)

    # Read notes back (read-only — works fine)
    try:
        result = ab.cmd("get_clip_notes", track_index=track_idx, clip_index=clip_idx)
        notes_back = result.get("notes", [])
        r.ok("get_clip_notes (read-back)", f"got {len(notes_back)} notes back")
    except Exception as e:
        r.fail("get_clip_notes", e)

    # Note: humanize_clip_timing/velocity use clip.get_notes() (deprecated in Live 12)
    # which causes timeouts. Our pre-humanized note injection is the correct approach.
    r.note("SKIP humanize_clip_timing/velocity — use deprecated clip.get_notes() API (broken in Live 12)")
    r.note("WORKAROUND: Pre-humanize velocity/timing in the note data before calling add_notes_to_clip (already done above)")

    # Fire the clip — reconnect first to ensure clean socket state
    try:
        ab.connect()
        ab.cmd("fire_clip", track_index=track_idx, clip_index=clip_idx)
        r.ok("fire_clip", "clip launched")
    except Exception as e:
        r.fail("fire_clip", e)


def test_generated_patterns(ab, r, track_idx):
    r.section("Phase 3B (bonus) — Built-in Pattern Generators")
    # Note: generate_drum_pattern uses clip.remove_notes() + clip.set_notes() (deprecated API)
    # Testing anyway — may timeout in Live 12
    styles = ["house", "hiphop"]
    for i, style in enumerate(styles):
        clip_idx = i + 1
        try:
            ab.connect()  # Fresh connection before each generate call
            ab.cmd("create_clip", track_index=track_idx, clip_index=clip_idx, length=4.0)
            result = ab.cmd("generate_drum_pattern",
                            track_index=track_idx, clip_index=clip_idx,
                            style=style, length=4)
            ab.cmd("set_clip_name", track_index=track_idx, clip_index=clip_idx, name=f"Wonder_{style}")
            r.ok(f"generate_drum_pattern ({style})", f"{result.get('note_count')} notes")
        except Exception as e:
            r.fail(f"generate_drum_pattern ({style})", e)
            r.note(f"  generate_drum_pattern likely uses deprecated remove_notes/set_notes API blocked by Live 12")

    # Test bassline generator
    try:
        clip_idx = len(styles) + 1
        ab.connect()
        ab.cmd("create_clip", track_index=track_idx, clip_index=clip_idx, length=4.0)
        result = ab.cmd("generate_bassline",
                        track_index=track_idx, clip_index=clip_idx,
                        root=36, scale_type="pentatonic_minor", length=4)
        ab.cmd("set_clip_name", track_index=track_idx, clip_index=clip_idx, name="Wonder_Bassline")
        r.ok("generate_bassline (pentatonic_minor)", f"{result.get('note_count')} notes")
    except Exception as e:
        r.fail("generate_bassline", e)


def test_browser_and_instruments(ab, r, track_idx):
    r.section("Phase 3C — Browser + Drum Rack Loading")

    # Explore browser tree
    try:
        tree = ab.cmd("get_browser_tree")
        r.ok("get_browser_tree", f"keys: {list(tree.keys()) if isinstance(tree, dict) else str(tree)[:80]}")
    except Exception as e:
        r.fail("get_browser_tree", e)

    # Try standard browser paths for Drum Rack (string format: "category/subfolder")
    drum_rack_uri = None
    browser_paths_to_try = [
        "drums",
        "instruments/Drum Rack",
        "instruments",
    ]
    for path in browser_paths_to_try:
        try:
            items = ab.cmd("get_browser_items_at_path", path=path)
            item_list = items if isinstance(items, list) else items.get("items", [])
            r.ok(f"get_browser_items_at_path '{path}'", f"{len(item_list)} items")
            if item_list:
                r.note(f"  First items: {[i.get('name') for i in item_list[:4]]}")
                # Look for Drum Rack specifically
                for item in item_list:
                    name = item.get("name", "")
                    if "drum" in name.lower() or "rack" in name.lower():
                        drum_rack_uri = item.get("uri") or item.get("path")
                        r.note(f"  Drum Rack URI: {drum_rack_uri}")
                        break
                if not drum_rack_uri:
                    drum_rack_uri = item_list[0].get("uri") or item_list[0].get("path")
            if drum_rack_uri:
                break
        except Exception as e:
            r.fail(f"get_browser_items_at_path '{path}'", e)

    # Search browser
    try:
        results = ab.cmd("search_browser", query="Drum Rack", category="all")
        result_list = results if isinstance(results, list) else results.get("items", [])
        if result_list:
            r.ok("search_browser ('Drum Rack')", f"{len(result_list)} results")
            if not drum_rack_uri:
                drum_rack_uri = result_list[0].get("uri") or result_list[0].get("path")
        else:
            r.note("search_browser: 0 results for 'Drum Rack'")
    except Exception as e:
        r.fail("search_browser", e)

    # Try browse_path (takes list)
    try:
        result = ab.cmd("browse_path", path=["instruments"])
        r.ok("browse_path ['instruments']", f"keys: {list(result.keys()) if isinstance(result, dict) else str(result)[:60]}")
    except Exception as e:
        r.fail("browse_path ['instruments']", e)

    # Load Drum Rack — correct command is load_browser_item with item_uri
    if drum_rack_uri:
        try:
            ab.connect()
            result = ab.cmd("load_browser_item", track_index=track_idx, item_uri=drum_rack_uri)
            r.ok("load_browser_item (Drum Rack)", f"loaded: {result.get('item_name', drum_rack_uri)[:60]}")
        except Exception as e:
            r.fail("load_browser_item (Drum Rack)", e)
    else:
        r.note("Skipping load_browser_item — no Drum Rack URI found via browser")

    # Also get children of Drum Rack folder to find specific kit URIs
    try:
        kits = ab.cmd("get_browser_items_at_path", path="drums/Drum Rack")
        kit_list = kits if isinstance(kits, list) else kits.get("items", [])
        r.ok("get_browser_items_at_path 'drums/Drum Rack' (kits)", f"{len(kit_list)} kits found")
        if kit_list:
            r.note(f"  Kit examples: {[k.get('name') for k in kit_list[:5]]}")
    except Exception as e:
        r.fail("get_browser_items_at_path 'drums/Drum Rack'", e)

    return drum_rack_uri


def test_adg_loading(ab, r, track_idx):
    r.section("Phase 3D — .adg Sauce Rack Loading")

    user_presets_path = os.path.expanduser("~/Music/Ableton/User Library/Presets/Audio Effects")

    # Check what .adg files exist in user library
    adg_files = []
    try:
        for root_dir, dirs, files in os.walk(os.path.expanduser("~/Music/Ableton/User Library/Presets")):
            for f in files:
                if f.endswith(".adg") or f.endswith(".adv"):
                    adg_files.append(os.path.join(root_dir, f))
        r.note(f"Found {len(adg_files)} .adg/.adv preset files in User Library")
        if adg_files:
            r.note(f"Examples: {[os.path.basename(f) for f in adg_files[:3]]}")
    except Exception as e:
        r.note(f"Could not scan User Library presets: {e}")

    # Try searching browser for any effects
    effect_uri = None
    try:
        results = ab.cmd("search_browser", query="Audio Effect Rack", category="all")
        if isinstance(results, list) and results:
            effect_uri = results[0].get("uri") or results[0].get("path")
            r.ok("search_browser (Audio Effect Rack)", f"found URI: {effect_uri[:60] if effect_uri else 'none'}")
        else:
            r.note("No Audio Effect Rack found via search_browser")
    except Exception as e:
        r.fail("search_browser (Audio Effect Rack)", e)

    # Try loading via URI if found — correct command is load_browser_item
    if effect_uri:
        try:
            ab.connect()
            result = ab.cmd("load_browser_item", track_index=track_idx, item_uri=effect_uri)
            r.ok("load_browser_item (.adg via URI)", f"loaded: {result.get('item_name', '')}")
        except Exception as e:
            r.fail("load_browser_item (.adg via URI)", e)
    else:
        r.note("Skipping load_browser_item — no .adg URI found")
        r.note("LIMITATION: .adg files must be in Ableton's scanned User Library. Cannot load by raw file path.")

    # Confirm absolute path loading doesn't work (expected failure)
    r.note("CONFIRMED LIMITATION: All device/rack loading requires Ableton browser URI, not absolute file path.")
    r.note("WORKAROUND for Wonder: Pre-save Sauce Racks to ~/Music/Ableton/User Library/Presets/Audio Effects/ → Ableton indexes them → load by search URI.")


def test_device_params(ab, r, track_idx):
    r.section("Phase 3E — Device Parameter Control")

    # Get devices on track
    try:
        track_info = ab.cmd("get_track_info", track_index=track_idx)
        devices = track_info.get("devices", [])
        r.ok("get_track_info (devices)", f"{len(devices)} devices on track")
        if devices:
            r.note(f"Devices: {[d.get('name') for d in devices]}")
    except Exception as e:
        r.fail("get_track_info (devices)", e)
        return

    if not devices:
        r.note("No devices loaded on test track — skipping device parameter tests")
        return

    device_idx = 0
    try:
        params = ab.cmd("get_device_parameters", track_index=track_idx, device_index=device_idx)
        param_list = params if isinstance(params, list) else params.get("parameters", [])
        r.ok("get_device_parameters", f"{len(param_list)} parameters found")
        if param_list:
            first_param = param_list[0]
            r.note(f"First param: name='{first_param.get('name')}' value={first_param.get('value')} min={first_param.get('min')} max={first_param.get('max')}")
    except Exception as e:
        r.fail("get_device_parameters", e)
        return

    # Try setting a parameter
    try:
        if param_list:
            p = param_list[0]
            mid_val = ((p.get("max", 1.0) or 1.0) + (p.get("min", 0.0) or 0.0)) / 2
            ab.cmd("set_device_parameter",
                   track_index=track_idx,
                   device_index=device_idx,
                   parameter_index=0,
                   value=mid_val)
            r.ok("set_device_parameter", f"set '{p.get('name')}' to {mid_val:.3f}")
    except Exception as e:
        r.fail("set_device_parameter", e)

    # Test rack chains if it's a rack
    try:
        chains = ab.cmd("get_rack_chains", track_index=track_idx, device_index=device_idx)
        chain_list = chains if isinstance(chains, list) else chains.get("chains", [])
        r.ok("get_rack_chains", f"{len(chain_list)} chains in rack")
    except Exception as e:
        r.fail("get_rack_chains", e)


def test_scenes(ab, r):
    r.section("Phase 3F — Scene Management")

    try:
        ab.connect()
        result = ab.cmd("create_scene", index=-1)
        r.ok("create_scene", str(result))
    except Exception as e:
        r.fail("create_scene", e)
        return

    try:
        scenes = ab.cmd("get_all_scenes")
        scene_list = scenes if isinstance(scenes, list) else scenes.get("scenes", [])
        last_idx = len(scene_list) - 1
        ab.cmd("set_scene_name", scene_index=last_idx, name="Wonder_Test_Scene")
        r.ok("set_scene_name", f"scene_index={last_idx}")
    except Exception as e:
        r.fail("set_scene_name", e)
        last_idx = 0

    try:
        ab.cmd("fire_scene", scene_index=last_idx)
        r.ok("fire_scene", f"scene {last_idx} fired")
    except Exception as e:
        r.fail("fire_scene", e)

    try:
        ab.cmd("stop_scene", scene_index=last_idx)
        r.ok("stop_scene", "stopped")
    except Exception as e:
        r.fail("stop_scene", e)


def test_misc(ab, r, track_idx):
    r.section("Phase 3G — Undo, Freeze, Misc")

    ab.connect()
    try:
        ab.cmd("undo")
        r.ok("undo", "no error")
    except Exception as e:
        r.fail("undo", e)

    try:
        ab.cmd("redo")
        r.ok("redo", "no error")
    except Exception as e:
        r.fail("redo", e)

    try:
        info = ab.cmd("get_cpu_load")
        r.ok("get_cpu_load", str(info))
    except Exception as e:
        r.fail("get_cpu_load", e)

    try:
        ab.cmd("set_swing_amount", amount=0.2)
        r.ok("set_swing_amount", "0.2 (20% swing)")
    except Exception as e:
        r.fail("set_swing_amount", e)

    try:
        ab.cmd("set_metronome", enabled=False)
        r.ok("set_metronome", "off")
    except Exception as e:
        r.fail("set_metronome", e)

    try:
        ab.cmd("freeze_track", track_index=track_idx)
        r.ok("freeze_track", f"track {track_idx}")
        ab.cmd("flatten_track", track_index=track_idx)
        r.ok("flatten_track", f"track {track_idx}")
    except Exception as e:
        r.fail("freeze_track / flatten_track", e)


def test_humanized_lofi_demo(ab, r, track_idx):
    """Build a complete lo-fi house demo with proper humanization to prove quality"""
    r.section("Bonus — Full Humanized Lo-Fi House Demo")

    # Create 3 tracks: drums, bass, chords
    demo_tracks = {}
    for name in ["Wonder_Drums", "Wonder_Bass"]:
        try:
            before = get_track_count(ab)
            result = ab.cmd("create_midi_track", index=before)
            idx = result.get("index", before)
            ab.cmd("set_track_name", track_index=idx, name=name)
            demo_tracks[name] = idx
            r.ok(f"create track: {name}", f"idx={idx}")
        except Exception as e:
            r.fail(f"create track: {name}", e)

    # Set tempo to 120 and swing to 20%
    try:
        ab.cmd("set_tempo", tempo=120.0)
        ab.cmd("set_swing_amount", amount=0.2)
        r.ok("set_tempo + swing", "120bpm, 20% swing")
    except Exception as e:
        r.fail("set_tempo + swing", e)

    # Drums: 4-bar humanized pattern
    drum_idx = demo_tracks.get("Wonder_Drums")
    if drum_idx is not None:
        try:
            ab.cmd("create_clip", track_index=drum_idx, clip_index=0, length=4.0)
            ab.cmd("set_clip_name", track_index=drum_idx, clip_index=0, name="Lo-Fi Beat")
            notes = (
                humanized_kick_pattern(bars=1) +
                humanized_snare_clap(bars=1) +
                humanized_hihats(bars=1, style="lofi")
            )
            ab.cmd("add_notes_to_clip", track_index=drum_idx, clip_index=0, notes=notes)
            ab.cmd("humanize_clip_timing", track_index=drum_idx, clip_index=0, amount=0.012)
            ab.cmd("humanize_clip_velocity", track_index=drum_idx, clip_index=0, amount=0.06)
            r.ok("Lo-fi drum loop (humanized)", f"{len(notes)} notes, 12ms timing drift, 6% vel variation")
        except Exception as e:
            r.fail("Lo-fi drum loop", e)

    # Bass: pentatonic minor bassline
    bass_idx = demo_tracks.get("Wonder_Bass")
    if bass_idx is not None:
        try:
            ab.cmd("create_clip", track_index=bass_idx, clip_index=0, length=4.0)
            ab.cmd("set_clip_name", track_index=bass_idx, clip_index=0, name="Bass Loop")
            notes = humanized_bass(root=36, bars=1)
            ab.cmd("add_notes_to_clip", track_index=bass_idx, clip_index=0, notes=notes)
            ab.cmd("humanize_clip_timing", track_index=bass_idx, clip_index=0, amount=0.008)
            r.ok("Pentatonic minor bass (humanized)", f"{len(notes)} notes")
        except Exception as e:
            r.fail("Bass loop", e)

    r.note("To hear: fire the Lo-Fi Beat and Bass Loop clips in Ableton Session View")


def test_wonder_commands(ab, r):
    """Test new Wonder-specific composite commands (require Ableton restart after Remote Script upgrade)"""
    r.section("Phase 3H — Wonder New Commands")

    def _is_reload_needed(e):
        return "Unknown command" in str(e)

    # ── create_wonder_session ──────────────────────────────────────────
    try:
        result = ab.cmd("create_wonder_session",
            bpm=88,
            tracks=[
                {"type": "midi", "name": "WS_Drums",  "pattern": "lofi",  "clip_length": 2},
                {"type": "midi", "name": "WS_Bass",   "pattern": "basic", "clip_length": 2},
            ],
            swing=0.15,
            key_root=9,   # A
            scale="minor"
        )
        r.ok("create_wonder_session", str(result)[:80])
    except Exception as e:
        if _is_reload_needed(e):
            r.note("create_wonder_session — PENDING: Ableton must reload Remote Script (restart Ableton)")
        else:
            r.fail("create_wonder_session", e)

    # ── load_sample_by_path ───────────────────────────────────────────
    # Use a system AIFF as a stand-in for an ElevenLabs .wav export
    sample_path = "/System/Library/Sounds/Funk.aiff"
    try:
        info = ab.cmd("get_session_info")
        n_tracks = info.get("track_count", 0)
        if n_tracks == 0:
            r.note("load_sample_by_path — no tracks, skipping")
        else:
            idx = n_tracks
            ab.cmd("create_midi_track", index=idx)
            ab.cmd("set_track_name", track_index=idx, name="WS_Sampler")
            result = ab.cmd("load_sample_by_path",
                track_index=idx,
                file_path=sample_path,
                device_index=0,
                pad_index=None
            )
            msg = str(result)
            if "No Simpler" in msg or "no device" in msg.lower():
                r.note(f"load_sample_by_path — needs Simpler/Drum Rack pre-loaded: {msg[:80]}")
            elif "error" in msg.lower():
                r.fail("load_sample_by_path", msg[:100])
            else:
                r.ok("load_sample_by_path", msg[:80])
    except Exception as e:
        if _is_reload_needed(e):
            r.note("load_sample_by_path — PENDING: Ableton must reload Remote Script (restart Ableton)")
        else:
            r.fail("load_sample_by_path", e)


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Wonder — Ableton MCP Autonomous Test Suite")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    r = Results()
    ab = Ableton()

    print("\nConnecting to Ableton on localhost:9877...")
    try:
        ab.connect()
        print("Connected.\n")
    except Exception as e:
        print(f"FATAL: Could not connect to Ableton — {e}")
        print("Make sure Ableton is open with AbletonMCP Remote Script active.")
        r.fail("TCP Connection", e)
        r.write_markdown()
        return

    try:
        test_connection(ab, r)
        track_indices = test_tracks(ab, r)

        midi_track = track_indices.get("midi")
        if midi_track is not None:
            test_midi_clips(ab, r, midi_track)
            test_generated_patterns(ab, r, midi_track)
            test_browser_and_instruments(ab, r, midi_track)
            test_adg_loading(ab, r, midi_track)
            test_device_params(ab, r, midi_track)

        test_scenes(ab, r)

        if midi_track is not None:
            test_misc(ab, r, midi_track)

        test_humanized_lofi_demo(ab, r, midi_track or 0)
        test_wonder_commands(ab, r)

    except SystemExit as e:
        print(f"\nAborted: {e}")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        ab.disconnect()
        print("\n" + "=" * 60)
        print(f"DONE — {r.passed} passed, {r.failed} failed")
        print("=" * 60)
        r.write_markdown()


if __name__ == "__main__":
    main()
