"""
Async Python wrappers for all Ableton Live TCP tools.

Each function opens a short-lived asyncio TCP connection to Ableton's MCP
server at ABLETON_HOST:ABLETON_PORT, sends a newline-delimited JSON command,
and returns the parsed JSON response as a plain dict.  On connection or
timeout errors the function returns {"error": "..."} rather than raising so
the ADK agent can gracefully handle unavailability.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any

from ..logging_config import get_logger

ABLETON_HOST: str = os.getenv("ABLETON_HOST", "localhost")
ABLETON_PORT: int = int(os.getenv("ABLETON_PORT", "9877"))
_TIMEOUT: float = 10.0

logger = get_logger("wonder.ableton")


async def send_ableton_command(command_type: str, params: dict[str, Any]) -> dict[str, Any]:
    """Open a TCP connection to Ableton, send a JSON command, return the response.

    Args:
        command_type: The MCP command name (e.g. ``"get_session_info"``).
        params: Keyword parameters for the command.

    Returns:
        Parsed JSON dict from Ableton, or ``{"error": "..."}`` on failure.
    """
    t0 = time.perf_counter()
    logger.debug("ableton → %s  %s", command_type, params)

    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(ABLETON_HOST, ABLETON_PORT),
            timeout=_TIMEOUT,
        )
    except OSError:
        logger.warning("ableton not connected (%s:%s)", ABLETON_HOST, ABLETON_PORT)
        return {"error": "Ableton not connected"}

    try:
        payload = json.dumps({"type": command_type, "params": params}) + "\n"
        writer.write(payload.encode())
        await writer.drain()

        raw = await asyncio.wait_for(reader.readline(), timeout=_TIMEOUT)
        data: dict[str, Any] = json.loads(raw.decode())

        if data.get("status") == "error":
            msg = data.get("message", "Unknown Ableton error")
            logger.warning("ableton ✗ %s — %s", command_type, msg)
            return {"error": msg}

        result = data.get("result") or {}
        ms = (time.perf_counter() - t0) * 1000
        logger.debug("ableton ← %s  (%.0fms)", command_type, ms)
        return result

    except asyncio.TimeoutError:
        logger.warning("ableton timeout  %s", command_type)
        return {"error": "Ableton response timeout"}
    except (json.JSONDecodeError, OSError) as exc:
        logger.error("ableton error  %s: %s", command_type, exc)
        return {"error": str(exc)}
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass


async def get_session_info() -> dict[str, Any]:
    """Get current Ableton session info: BPM, track count, scene count, time signature.

    Call this first to understand the current state.
    """
    return await send_ableton_command("get_session_info", {})


async def set_tempo(tempo: float) -> dict[str, Any]:
    """Set the session BPM / tempo.

    Args:
        tempo: BPM value e.g. 90.
    """
    return await send_ableton_command("set_tempo", {"tempo": tempo})


async def set_swing_amount(amount: float) -> dict[str, Any]:
    """Set swing/groove amount on the session.

    Args:
        amount: Swing amount from 0.0 to 1.0.
    """
    return await send_ableton_command("set_swing_amount", {"amount": amount})


async def set_metronome(enabled: bool) -> dict[str, Any]:
    """Toggle the metronome on or off.

    Args:
        enabled: ``True`` to enable the metronome, ``False`` to disable it.
    """
    return await send_ableton_command("set_metronome", {"enabled": enabled})


async def start_playback() -> dict[str, Any]:
    """Start Ableton playback."""
    return await send_ableton_command("start_playback", {})


async def stop_playback() -> dict[str, Any]:
    """Stop Ableton playback."""
    return await send_ableton_command("stop_playback", {})


async def undo() -> dict[str, Any]:
    """Undo the last action in Ableton."""
    return await send_ableton_command("undo", {})


async def create_midi_track(index: int) -> dict[str, Any]:
    """Create a new MIDI track.

    Always get session_info first to get track_count, then pass that as index.

    Args:
        index: Insert position — use current track_count from get_session_info.
    """
    return await send_ableton_command("create_midi_track", {"index": index})


async def create_audio_track(index: int) -> dict[str, Any]:
    """Create a new audio track.

    Args:
        index: Insert position — use current track_count.
    """
    return await send_ableton_command("create_audio_track", {"index": index})


async def set_track_name(track_index: int, name: str) -> dict[str, Any]:
    """Rename an Ableton track.

    Args:
        track_index: Zero-based track index.
        name: New name for the track.
    """
    return await send_ableton_command("set_track_name", {"track_index": track_index, "name": name})


async def set_track_volume(track_index: int, volume: float) -> dict[str, Any]:
    """Set a track's fader volume.

    Args:
        track_index: Zero-based track index.
        volume: Volume level from 0.0 to 1.0.
    """
    return await send_ableton_command("set_track_volume", {"track_index": track_index, "volume": volume})


async def set_track_mute(track_index: int, mute: bool) -> dict[str, Any]:
    """Mute or unmute a track.

    Args:
        track_index: Zero-based track index.
        mute: ``True`` to mute, ``False`` to unmute.
    """
    return await send_ableton_command("set_track_mute", {"track_index": track_index, "mute": mute})


async def freeze_track(track_index: int) -> dict[str, Any]:
    """Freeze a track (render to audio in-place).

    Args:
        track_index: Zero-based track index.
    """
    return await send_ableton_command("freeze_track", {"track_index": track_index})


async def flatten_track(track_index: int) -> dict[str, Any]:
    """Flatten a frozen track to audio.

    Args:
        track_index: Zero-based track index.
    """
    return await send_ableton_command("flatten_track", {"track_index": track_index})


async def create_clip(track_index: int, clip_index: int, length: float) -> dict[str, Any]:
    """Create an empty MIDI clip on a track.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index, usually 0.
        length: Clip length in bars e.g. 4.
    """
    return await send_ableton_command(
        "create_clip",
        {"track_index": track_index, "clip_index": clip_index, "length": length},
    )


async def add_notes_to_clip(track_index: int, clip_index: int, notes: list[dict[str, Any]]) -> dict[str, Any]:
    """Add MIDI notes to a clip.

    Each note is a dict with keys: ``pitch``, ``start_time``, ``duration``,
    ``velocity``, ``mute``.  Pitch: 0–127.  start_time/duration in beats.
    Velocity: 0–127.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
        notes: Array of note objects.
    """
    return await send_ableton_command(
        "add_notes_to_clip",
        {"track_index": track_index, "clip_index": clip_index, "notes": notes},
    )


async def get_clip_notes(track_index: int, clip_index: int) -> dict[str, Any]:
    """Read back the MIDI notes in a clip.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
    """
    return await send_ableton_command(
        "get_clip_notes",
        {"track_index": track_index, "clip_index": clip_index},
    )


async def fire_clip(track_index: int, clip_index: int) -> dict[str, Any]:
    """Launch/play a clip in Session View.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
    """
    return await send_ableton_command(
        "fire_clip",
        {"track_index": track_index, "clip_index": clip_index},
    )


async def stop_clip(track_index: int, clip_index: int) -> dict[str, Any]:
    """Stop a playing clip.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
    """
    return await send_ableton_command(
        "stop_clip",
        {"track_index": track_index, "clip_index": clip_index},
    )


async def set_clip_name(track_index: int, clip_index: int, name: str) -> dict[str, Any]:
    """Name a clip.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
        name: New name for the clip.
    """
    return await send_ableton_command(
        "set_clip_name",
        {"track_index": track_index, "clip_index": clip_index, "name": name},
    )


async def get_browser_items_at_path(path: str) -> dict[str, Any]:
    """Browse Ableton's built-in library.

    Use paths like ``'drums'``, ``'instruments'``, ``'audio_effects'``,
    ``'midi_effects'``. Returns items with name and uri.

    Args:
        path: Browser path e.g. ``'drums'`` or ``'audio_effects'``.
    """
    return await send_ableton_command("get_browser_items_at_path", {"path": path})


async def load_browser_item(track_index: int, uri: str) -> dict[str, Any]:
    """Load an instrument or effect onto a track using its browser URI.

    Use the URI from get_browser_items_at_path.

    Args:
        track_index: Zero-based track index.
        uri: URI from get_browser_items_at_path (passed as ``item_uri``).
    """
    return await send_ableton_command("load_browser_item", {"track_index": track_index, "item_uri": uri})


async def search_plugins(query: str) -> dict[str, Any]:
    """Search for VST3, AU, or Max plugins by name in the Ableton browser.

    Use this to discover available plugins before loading.

    Args:
        query: Plugin name to search for (partial match). Empty returns all.
    """
    return await send_ableton_command("search_plugins", {"query": query})


async def load_plugin_by_name(track_index: int, name: str) -> dict[str, Any]:
    """Load a VST3 or AU plugin onto a track by name.

    Searches the browser and loads the best match. Use search_plugins first
    if unsure of the exact name.

    Args:
        track_index: Zero-based track index.
        name: Plugin name e.g. ``'Serum'``, ``'Massive X'``, ``'OTT'``.
    """
    return await send_ableton_command("load_plugin_by_name", {"track_index": track_index, "plugin_name": name})


async def get_track_devices(track_index: int) -> dict[str, Any]:
    """Get all devices (instruments, effects, VSTs) on a track.

    Returns parameter names, values, and ranges. Use this before
    set_device_parameter_by_name to find the right parameter name.

    Args:
        track_index: Zero-based track index.
    """
    return await send_ableton_command("get_track_devices", {"track_index": track_index})


async def load_sample_by_path(track_index: int, path: str) -> dict[str, Any]:
    """Load a .wav or .aif file onto a Simpler or Drum Rack pad.

    The file is copied to the Ableton User Library automatically.

    Args:
        track_index: Zero-based track index.
        path: Absolute path to .wav/.aif file.
    """
    return await send_ableton_command("load_sample_by_path", {"track_index": track_index, "file_path": path})


async def get_device_parameters(track_index: int, device_index: int) -> dict[str, Any]:
    """Get all parameters for a device/plugin on a track.

    Args:
        track_index: Zero-based track index.
        device_index: Usually 0 for the first device.
    """
    return await send_ableton_command(
        "get_device_parameters",
        {"track_index": track_index, "device_index": device_index},
    )


async def set_device_parameter(
    track_index: int,
    device_index: int,
    parameter_index: int,
    value: float,
) -> dict[str, Any]:
    """Set a parameter value on a device by index.

    Args:
        track_index: Zero-based track index.
        device_index: Zero-based device index on the track.
        parameter_index: Zero-based parameter index on the device.
        value: New parameter value.
    """
    return await send_ableton_command(
        "set_device_parameter",
        {
            "track_index": track_index,
            "device_index": device_index,
            "parameter_index": parameter_index,
            "value": value,
        },
    )


async def set_device_parameter_by_name(
    track_index: int,
    device_index: int,
    name: str,
    value: float,
) -> dict[str, Any]:
    """Set a VST/AU/native device parameter by name.

    Partial name match is supported. Use get_track_devices first to see
    available parameters and their ranges.

    Args:
        track_index: Zero-based track index.
        device_index: Zero-based device index on the track.
        name: Parameter name e.g. ``'Filter Cutoff'``, ``'Decay'``, ``'Macro 1'``.
        value: New value (will be clamped to parameter min/max).
    """
    return await send_ableton_command(
        "set_device_parameter_by_name",
        {
            "track_index": track_index,
            "device_index": device_index,
            "param_name": name,
            "value": value,
        },
    )


async def set_rack_macro(
    track_index: int,
    device_index: int,
    macro_index: int,
    value: float,
) -> dict[str, Any]:
    """Set a macro knob value on an Ableton Rack device.

    Args:
        track_index: Zero-based track index.
        device_index: Zero-based device index on the track.
        macro_index: Macro index 0–7.
        value: Macro value from 0.0 to 1.0.
    """
    return await send_ableton_command(
        "set_rack_macro",
        {
            "track_index": track_index,
            "device_index": device_index,
            "macro_index": macro_index,
            "value": value,
        },
    )


async def create_scene(index: int) -> dict[str, Any]:
    """Create a new scene (row) in Session View.

    Args:
        index: Insert position for the new scene.
    """
    return await send_ableton_command("create_scene", {"index": index})


async def fire_scene(index: int) -> dict[str, Any]:
    """Launch all clips in a scene.

    Args:
        index: Zero-based scene index.
    """
    return await send_ableton_command("fire_scene", {"scene_index": index})


async def generate_drum_pattern(
    track_index: int,
    clip_index: int,
    style: str,
) -> dict[str, Any]:
    """Generate a humanized drum pattern on a MIDI track.

    Style options: ``basic``, ``house``, ``hiphop``, ``lofi``, ``trap``,
    ``jazz``, ``afrobeats``, ``dnb``.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
        style: Drum style — ``'lofi'``, ``'trap'``, ``'house'``, etc.
    """
    return await send_ableton_command(
        "generate_drum_pattern",
        {"track_index": track_index, "clip_index": clip_index, "style": style},
    )


async def generate_bassline(
    track_index: int,
    clip_index: int,
    root_note: str,
    scale: str,
) -> dict[str, Any]:
    """Generate a humanized bassline on a MIDI track.

    Based on a root note and scale.

    Args:
        track_index: Zero-based track index.
        clip_index: Scene/slot index.
        root_note: Root MIDI note as string e.g. ``'C2'`` or integer string ``'36'``.
        scale: Scale name — ``'minor'``, ``'major'``, ``'pentatonic_minor'``,
               ``'blues'``, ``'dorian'``, ``'mixolydian'``.
    """
    return await send_ableton_command(
        "generate_bassline",
        {
            "track_index": track_index,
            "clip_index": clip_index,
            "root": root_note,
            "scale": scale,
        },
    )


async def create_wonder_session(
    bpm: float,
    swing: float,
    key: str,
    scale: str,
    tracks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build a complete Wonder session in one command.

    Sets BPM, swing, creates multiple tracks with clips and patterns. Use
    this when the user asks to ``'make a beat'``, ``'create a session'``,
    ``'build a track'`` etc.

    Args:
        bpm: Tempo e.g. 90.
        swing: Swing amount 0.0–1.0 e.g. 0.15.
        key: Root note key as string e.g. ``'C'``, ``'F#'``.
        scale: Scale name — ``'minor'``, ``'major'``, ``'pentatonic_minor'``,
               ``'blues'``, ``'dorian'``.
        tracks: Array of track specs. Each: ``{ type: "midi"|"audio", name: str,
                pattern?: str, bassline?: bool, clip_length?: int, notes?: list }``.
    """
    return await send_ableton_command(
        "create_wonder_session",
        {
            "bpm": bpm,
            "swing": swing,
            "key_root": key,
            "scale": scale,
            "tracks": tracks,
        },
    )


ABLETON_TOOLS: list = [
    get_session_info,
    set_tempo,
    set_swing_amount,
    set_metronome,
    start_playback,
    stop_playback,
    undo,
    create_midi_track,
    create_audio_track,
    set_track_name,
    set_track_volume,
    set_track_mute,
    freeze_track,
    flatten_track,
    create_clip,
    add_notes_to_clip,
    get_clip_notes,
    fire_clip,
    stop_clip,
    set_clip_name,
    get_browser_items_at_path,
    load_browser_item,
    search_plugins,
    load_plugin_by_name,
    get_track_devices,
    load_sample_by_path,
    get_device_parameters,
    set_device_parameter,
    set_device_parameter_by_name,
    set_rack_macro,
    create_scene,
    fire_scene,
    generate_drum_pattern,
    generate_bassline,
    create_wonder_session,
]
