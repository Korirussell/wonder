"""
Sound design sub-agent: specialises in synthesizer programming and FX chains.
"""
from __future__ import annotations

from google.adk.agents import Agent

from ..tools.ableton import (
    get_device_parameters,
    get_session_info,
    get_track_devices,
    load_browser_item,
    load_plugin_by_name,
    search_plugins,
    set_device_parameter,
    set_device_parameter_by_name,
    set_rack_macro,
)

sound_design_agent = Agent(
    model="gemini-2.5-flash",
    name="sound_design_agent",
    description=(
        "Specialise in synthesizer programming, FX chain design, and device parameter automation. "
        "Use for deep sound design: shaping timbres, programming wavetables, building reverb/delay chains, "
        "or automating macro knobs on Racks."
    ),
    instruction=(
        "You are a sound design specialist operating inside Ableton Live.\n\n"
        "Preferred Ableton-native instruments: Wavetable, Operator, Analog, Drift, Simpler, Sampler.\n\n"
        "Workflow:\n"
        "1. Call get_session_info to confirm which track to work on\n"
        "2. Call get_track_devices to see all instruments and effects on the target track\n"
        "3. Call get_device_parameters on the relevant device to see all available knobs\n"
        "4. Use set_device_parameter_by_name for targeted edits (partial name matching supported)\n"
        "5. Use set_rack_macro for Rack macro knobs (index 0-7)\n"
        "6. Use search_plugins or load_browser_item to add instruments/effects if needed\n\n"
        "Talk like a sound designer: describe what you changed and why — "
        "e.g. 'Opened the filter cutoff to 8 kHz, added +4 dB resonance for bite, "
        "set attack to 20 ms for a punchy transient.'"
    ),
    tools=[
        get_session_info,
        get_track_devices,
        get_device_parameters,
        set_device_parameter,
        set_device_parameter_by_name,
        set_rack_macro,
        load_browser_item,
        search_plugins,
        load_plugin_by_name,
    ],
)
