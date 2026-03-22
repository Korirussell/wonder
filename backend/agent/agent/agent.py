"""
Wonder root agent — Google ADK assembly.

Exports ``root_agent`` for use by the ADK runner and ``adk web`` CLI.
"""
from __future__ import annotations

from google.adk.agents import Agent
from google.adk.tools.agent_tool import AgentTool

# System prompt
try:
    from .wonder_prompt import get_enhanced_prompt
    _instruction = get_enhanced_prompt()
except ImportError:
    _instruction = "You are Wonder, an elite AI music producer operating inside Ableton Live."

# Ableton tools (all 46)
try:
    from .tools.ableton import ABLETON_TOOLS
except ImportError:
    ABLETON_TOOLS = []

# Audio / MIDI tools
try:
    from .tools.audio import load_midi_notes, transcribe_audio
    _audio_tools = [transcribe_audio, load_midi_notes]
except ImportError:
    _audio_tools = []

# Sound generation tools
try:
    from .tools.soundgen import generate_sound, split_and_generate_sound
    _soundgen_tools = [generate_sound, split_and_generate_sound]
except ImportError:
    _soundgen_tools = []

# Snowflake user preferences (also an ADK tool the agent can call)
try:
    from .analytics.preferences import get_user_preferences
    _analytics_tools = [get_user_preferences]
except ImportError:
    _analytics_tools = []

# Sample library tools (MongoDB-backed)
try:
    from .tools.samples import list_user_samples, save_sample
    _sample_tools = [list_user_samples, save_sample]
except ImportError:
    _sample_tools = []

# Sub-agents
try:
    from .agents import composition_agent, sound_design_agent, stem_separator_agent
    _sub_agent_tools = [
        AgentTool(composition_agent),
        AgentTool(stem_separator_agent),
        AgentTool(sound_design_agent),
    ]
except ImportError:
    _sub_agent_tools = []

root_agent = Agent(
    model="gemini-2.5-flash",
    name="wonder_agent",
    description="Elite AI music producer operating inside Ableton Live via MCP.",
    instruction=_instruction,
    tools=[
        *ABLETON_TOOLS,
        *_audio_tools,
        *_soundgen_tools,
        *_analytics_tools,
        *_sample_tools,
        *_sub_agent_tools,
    ],
)
