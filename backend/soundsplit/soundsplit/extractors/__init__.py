from .tempo import detect_tempo, detect_time_signature
from .key import detect_key, key_to_midi_root
from .stems import separate_stems
from .midi import transcribe_midi, transcribe_stems_midi
from .detect_input import detect_input_type
from .monophonic import transcribe_hum
from .beatbox import transcribe_beatbox

__all__ = [
    "detect_tempo",
    "detect_time_signature",
    "detect_key",
    "key_to_midi_root",
    "separate_stems",
    "transcribe_midi",
    "transcribe_stems_midi",
    "detect_input_type",
    "transcribe_hum",
    "transcribe_beatbox",
]
