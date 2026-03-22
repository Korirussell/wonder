"""
Composition sub-agent: builds complete multi-track Ableton arrangements.

A SequentialAgent pipeline:
  session_analyzer → arrangement_planner → track_builder → mix_engineer
"""
from __future__ import annotations

from google.adk.agents import Agent, SequentialAgent

from ..tools.ableton import (
    ABLETON_TOOLS,
    get_session_info,
    set_tempo,
    set_track_mute,
    set_track_name,
    set_track_volume,
)

_ANALYZER = Agent(
    model="gemini-2.5-flash",
    name="session_analyzer",
    description="Analyses the current Ableton session state.",
    instruction=(
        "Call get_session_info to understand the current session. "
        "Report: BPM, key, existing track names, track count. "
        "Do NOT create anything yet — only observe and summarise."
    ),
    tools=[get_session_info],
)

_PLANNER = Agent(
    model="gemini-2.5-flash",
    name="arrangement_planner",
    description="Plans the full arrangement before any tools are called.",
    instruction=(
        "Based on the session analysis, devise a detailed arrangement plan as structured text:\n"
        "- Song structure (intro/build/drop/breakdown/outro bar counts)\n"
        "- Track list with names, types (MIDI/audio), and instruments\n"
        "- MIDI patterns for each track (describe rhythms and melodies)\n"
        "- Key, scale, tempo, and swing\n"
        "Do NOT call any tools yet. Output only the plan."
    ),
)

_BUILDER = Agent(
    model="gemini-2.5-flash",
    name="track_builder",
    description="Executes the arrangement plan: creates tracks, clips, and MIDI.",
    instruction=(
        "Execute the arrangement plan step by step:\n"
        "1. Create each track (create_midi_track / create_audio_track)\n"
        "2. Load instruments (load_browser_item or load_plugin_by_name)\n"
        "3. Create clips and add MIDI notes (create_clip, add_notes_to_clip)\n"
        "4. Use generate_drum_pattern and generate_bassline for rhythmic tracks\n"
        "Build incrementally — complete one track fully before moving to the next. "
        "Validate note pitches are 0-127 before every add_notes_to_clip call."
    ),
    tools=ABLETON_TOOLS,
)

_MIX_ENGINEER = Agent(
    model="gemini-2.5-flash",
    name="mix_engineer",
    description="Sets levels, panning, and names for a balanced mix.",
    instruction=(
        "Polish the session:\n"
        "1. Name all tracks descriptively (Kick, Sub Bass, Lead Synth, Pad – Lush, …)\n"
        "2. Set track volumes for a balanced mix (kick ~0.9, sub ~0.8, synths ~0.7, pads ~0.6)\n"
        "3. Mute any placeholder or empty tracks\n"
        "4. Call get_session_info at the end and summarise what was built."
    ),
    tools=[get_session_info, set_track_name, set_track_volume, set_track_mute, set_tempo],
)

composition_agent = SequentialAgent(
    name="composition_agent",
    description=(
        "Build a complete multi-track Ableton arrangement from a high-level brief. "
        "Use for 'make me a full track' or any complex composition request. "
        "Runs session analysis → planning → track building → mix polish."
    ),
    sub_agents=[_ANALYZER, _PLANNER, _BUILDER, _MIX_ENGINEER],
)
