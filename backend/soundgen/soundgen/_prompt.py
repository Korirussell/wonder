from __future__ import annotations

from ._types import SoundParams


_REVERB_PHRASES = {
    "none": "with no reverb",
    "small room": "in a small room",
    "hall": "in a concert hall",
    "cave": "in a cave",
    "plate": "with plate reverb",
    "spring": "with spring reverb",
}


def build_prompt(params: SoundParams) -> str:
    """
    Convert SoundParams to a natural language prompt string.

    Two paths:
    - NL passthrough: only `description` set → returned verbatim.
    - Composed sentence: structured fields exist → assembled into grammatical clauses,
      with `description` appended if also present.
    """
    structured_fields = (
        params.category,
        params.pitch,
        params.pitch_hz,
        params.timbre,
        params.texture,
        params.intensity_label,
        params.attack,
        params.decay,
        params.reverb,
        params.stereo_width,
    )
    has_structured = any(
        (f is not None and f != []) for f in structured_fields
    )

    if not has_structured:
        # Pure NL passthrough
        return params.description or ""

    # --- Composed path ---
    parts: list[str] = []

    # Opener: category or generic
    opener = f"A {params.category} sound" if params.category else "A sound"
    parts.append(opener)

    # Pitch
    if params.pitch_hz is not None:
        parts.append(f"with a {params.pitch_hz:.0f} Hz fundamental")
    elif params.pitch is not None:
        parts.append(f"with a {params.pitch} pitch")

    # Timbre
    if params.timbre:
        timbre_str = ", ".join(params.timbre)
        parts.append(f"with a {timbre_str} timbre")

    # Texture
    if params.texture is not None:
        parts.append(f"that is {params.texture}")

    # Intensity
    if params.intensity_label is not None:
        parts.append(params.intensity_label)

    # Attack
    if params.attack is not None:
        parts.append(f"with a {params.attack} attack")

    # Decay
    if params.decay is not None:
        parts.append(f"and {params.decay}")

    # Reverb
    if params.reverb is not None and params.reverb != "none":
        parts.append(_REVERB_PHRASES.get(params.reverb, f"with {params.reverb} reverb"))

    # Stereo width
    if params.stereo_width is not None and params.stereo_width != "mono":
        parts.append(f"in {params.stereo_width} stereo")

    sentence = ", ".join(parts[:2]) if len(parts) > 1 else parts[0]
    if len(parts) > 2:
        sentence = parts[0] + " " + ", ".join(parts[1:])

    # Append freeform description
    if params.description:
        sentence = f"{sentence} — {params.description}"

    return sentence
