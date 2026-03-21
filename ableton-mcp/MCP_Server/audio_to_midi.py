# audio_to_midi.py
"""
Audio-to-MIDI transcription module for Wonder.
Uses Spotify's basic-pitch for pitch detection and note extraction.
Saves MIDI files to persistent storage for later use.
"""

import base64
import tempfile
import os
import logging
import uuid
from typing import Dict, Any, List
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("AudioToMidi")

# Persistent MIDI storage directory (relative to this file)
MIDI_STORAGE_DIR = Path(__file__).parent / "midi_storage"

# Lazy imports to avoid loading heavy ML models at startup
_basic_pitch_loaded = False
_pydub_loaded = False
_midiutil_loaded = False


def _ensure_midi_storage():
    """Ensure the MIDI storage directory exists"""
    MIDI_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return MIDI_STORAGE_DIR


def _ensure_basic_pitch():
    """Lazy load basic-pitch to avoid slow startup"""
    global _basic_pitch_loaded
    if not _basic_pitch_loaded:
        try:
            import basic_pitch

            _basic_pitch_loaded = True
        except ImportError as e:
            raise ImportError(
                "basic-pitch is not installed. Install it with: pip install basic-pitch"
            ) from e


def _ensure_pydub():
    """Lazy load pydub"""
    global _pydub_loaded
    if not _pydub_loaded:
        try:
            from pydub import AudioSegment

            _pydub_loaded = True
        except ImportError as e:
            raise ImportError(
                "pydub is not installed. Install it with: pip install pydub"
            ) from e


def _ensure_midiutil():
    """Lazy load midiutil"""
    global _midiutil_loaded
    if not _midiutil_loaded:
        try:
            from midiutil import MIDIFile

            _midiutil_loaded = True
        except ImportError as e:
            raise ImportError(
                "midiutil is not installed. Install it with: pip install midiutil"
            ) from e


@dataclass
class TranscribedNote:
    """A single transcribed MIDI note"""

    pitch: int  # MIDI pitch 0-127
    start_time: float  # Start time in beats (assuming 120 BPM for now)
    duration: float  # Duration in beats
    velocity: int  # MIDI velocity 0-127

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pitch": self.pitch,
            "start_time": round(self.start_time, 4),
            "duration": round(self.duration, 4),
            "velocity": self.velocity,
            "mute": False,
        }


def _clamp_midi_pitch(pitch: float) -> int:
    """Clamp a pitch value to the valid MIDI note range."""
    return max(0, min(127, int(round(pitch))))


def _merge_adjacent_same_pitch(
    notes: List[TranscribedNote], max_gap_beats: float = 0.08
) -> List[TranscribedNote]:
    """Merge adjacent notes of the same pitch separated by very small gaps."""
    if not notes:
        return notes

    sorted_notes = sorted(notes, key=lambda n: n.start_time)
    merged: List[TranscribedNote] = [
        TranscribedNote(
            pitch=sorted_notes[0].pitch,
            start_time=sorted_notes[0].start_time,
            duration=sorted_notes[0].duration,
            velocity=sorted_notes[0].velocity,
        )
    ]

    for note in sorted_notes[1:]:
        prev = merged[-1]
        prev_end = prev.start_time + prev.duration
        gap = note.start_time - prev_end

        if note.pitch == prev.pitch and gap <= max_gap_beats:
            new_end = max(prev_end, note.start_time + note.duration)
            prev.duration = new_end - prev.start_time
            prev.velocity = int(round((prev.velocity + note.velocity) / 2.0))
        else:
            merged.append(
                TranscribedNote(
                    pitch=note.pitch,
                    start_time=note.start_time,
                    duration=note.duration,
                    velocity=note.velocity,
                )
            )

    return merged


def apply_pitch_correction(
    notes: List[TranscribedNote],
    strength: float = 0.7,
    min_duration_for_hold: float = 0.3,
) -> List[TranscribedNote]:
    """
    Stabilize pitch for rough singing/whistling.

    This is not hard Auto-Tune; it applies light temporal smoothing so quick
    pitch jitters don't create noisy MIDI note streams.
    """
    if not notes:
        return notes

    strength = max(0.0, min(1.0, strength))
    corrected: List[TranscribedNote] = sorted(notes, key=lambda n: n.start_time)

    # Pass 1: hold pitch through short jitter notes near the previous pitch.
    for i in range(1, len(corrected)):
        prev = corrected[i - 1]
        cur = corrected[i]

        if cur.duration <= min_duration_for_hold and abs(cur.pitch - prev.pitch) <= 2:
            blended = (1.0 - strength) * cur.pitch + strength * prev.pitch
            cur.pitch = _clamp_midi_pitch(blended)

    # Pass 2: damp isolated zig-zag notes (A-B-A style) that are usually wobble.
    for i in range(1, len(corrected) - 1):
        prev = corrected[i - 1]
        cur = corrected[i]
        nxt = corrected[i + 1]

        if (
            cur.duration <= 0.35
            and prev.pitch == nxt.pitch
            and abs(cur.pitch - prev.pitch) <= 3
        ):
            blended = (1.0 - strength) * cur.pitch + strength * prev.pitch
            cur.pitch = _clamp_midi_pitch(blended)

    # Pass 3: merge fragments after correction.
    corrected = _merge_adjacent_same_pitch(corrected)

    return corrected


def convert_webm_to_wav(webm_data: bytes, output_path: str) -> str:
    """
    Convert WebM audio bytes to WAV format.

    Args:
        webm_data: Raw WebM audio bytes
        output_path: Path to save the WAV file

    Returns:
        Path to the converted WAV file
    """
    _ensure_pydub()
    from pydub import AudioSegment
    import time
    import gc

    # Create a unique temp file path (don't use context manager to avoid Windows locking issues)
    tmp_webm_path = os.path.join(
        tempfile.gettempdir(),
        f"wonder_audio_{os.getpid()}_{int(time.time() * 1000)}.webm",
    )

    try:
        # Write WebM data to temp file
        with open(tmp_webm_path, "wb") as f:
            f.write(webm_data)

        # Load WebM and convert to WAV
        # pydub uses ffmpeg under the hood
        audio = AudioSegment.from_file(tmp_webm_path, format="webm")

        # Convert to mono 22050Hz (basic-pitch's expected format)
        audio = audio.set_channels(1)
        audio = audio.set_frame_rate(22050)

        # Export as WAV
        audio.export(output_path, format="wav")
        logger.info(f"Converted WebM to WAV: {output_path} ({len(audio)}ms)")

        # Explicitly delete the audio object to release file handles
        del audio
        gc.collect()

        return output_path
    finally:
        # Clean up temp WebM file with retry for Windows
        if os.path.exists(tmp_webm_path):
            for attempt in range(3):
                try:
                    os.unlink(tmp_webm_path)
                    break
                except PermissionError:
                    # On Windows, file might still be locked briefly
                    time.sleep(0.1)
                    gc.collect()
                except Exception as e:
                    logger.warning(f"Could not delete temp file {tmp_webm_path}: {e}")
                    break


def transcribe_audio_to_notes(
    wav_path: str,
    tempo_bpm: float = 120.0,
    min_note_length: float = 0.05,  # Minimum note length in seconds
    onset_threshold: float = 0.5,
    frame_threshold: float = 0.3,
) -> List[TranscribedNote]:
    """
    Transcribe a WAV audio file to MIDI notes using basic-pitch.

    Args:
        wav_path: Path to the WAV file
        tempo_bpm: Tempo to use for converting seconds to beats
        min_note_length: Minimum note duration in seconds
        onset_threshold: Confidence threshold for note onsets (0-1)
        frame_threshold: Confidence threshold for note frames (0-1)

    Returns:
        List of TranscribedNote objects
    """
    _ensure_basic_pitch()
    from basic_pitch.inference import predict

    logger.info(f"Transcribing audio: {wav_path}")

    # Run basic-pitch inference
    model_output, midi_data, note_events = predict(
        wav_path,
        onset_threshold=onset_threshold,
        frame_threshold=frame_threshold,
        minimum_note_length=min_note_length,
    )

    # Convert note_events to our format
    # note_events is a list of (start_time_sec, end_time_sec, pitch, velocity, [confidence])
    notes: List[TranscribedNote] = []

    beats_per_second = tempo_bpm / 60.0

    for event in note_events:
        start_sec = event[0]
        end_sec = event[1]
        pitch = int(event[2])
        # basic-pitch returns amplitude, convert to velocity (0-127)
        amplitude = event[3] if len(event) > 3 else 0.8
        velocity = min(127, max(1, int(amplitude * 127)))

        # Convert time from seconds to beats
        start_beats = start_sec * beats_per_second
        duration_beats = (end_sec - start_sec) * beats_per_second

        # Skip very short notes
        if duration_beats < 0.0625:  # Less than 1/16th note at any tempo
            continue

        notes.append(
            TranscribedNote(
                pitch=pitch,
                start_time=start_beats,
                duration=duration_beats,
                velocity=velocity,
            )
        )

    logger.info(f"Transcribed {len(notes)} notes from audio")
    return notes


def save_notes_to_midi(
    notes: List[TranscribedNote],
    tempo_bpm: float = 120.0,
    midi_id: str = None,
) -> Dict[str, Any]:
    """
    Save transcribed notes to a MIDI file.

    Args:
        notes: List of TranscribedNote objects
        tempo_bpm: Tempo in BPM
        midi_id: Optional ID for the MIDI file (generated if not provided)

    Returns:
        Dict with midi_id and midi_path
    """
    _ensure_midiutil()
    from midiutil import MIDIFile

    # Generate unique ID if not provided
    if midi_id is None:
        midi_id = f"melody_{uuid.uuid4().hex[:8]}"

    # Ensure storage directory exists
    storage_dir = _ensure_midi_storage()
    midi_path = storage_dir / f"{midi_id}.mid"

    # Create MIDI file (1 track)
    midi = MIDIFile(1)
    track = 0
    channel = 0
    time = 0  # Start at the beginning

    midi.addTempo(track, time, tempo_bpm)
    midi.addTrackName(track, time, "Hummed Melody")

    # Add all notes
    for note in notes:
        midi.addNote(
            track=track,
            channel=channel,
            pitch=note.pitch,
            time=note.start_time,
            duration=note.duration,
            volume=note.velocity,
        )

    # Write to file
    with open(midi_path, "wb") as f:
        midi.writeFile(f)

    logger.info(f"Saved MIDI file: {midi_path} ({len(notes)} notes)")

    return {
        "midi_id": midi_id,
        "midi_path": str(midi_path),
    }


def get_midi_file_path(midi_id: str) -> str:
    """Get the path to a saved MIDI file by ID"""
    storage_dir = _ensure_midi_storage()
    midi_path = storage_dir / f"{midi_id}.mid"
    if midi_path.exists():
        return str(midi_path)
    return None


def get_notes_summary(notes: List[TranscribedNote]) -> Dict[str, Any]:
    """
    Get a compact summary of notes for Gemini (instead of full JSON).

    Returns dict with:
        - note_count: int
        - pitch_range: [min, max] as note names
        - duration_beats: total duration
        - first_notes: first 3 note names for context
    """
    if not notes:
        return {"note_count": 0}

    note_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    def pitch_to_name(pitch: int) -> str:
        return f"{note_names[pitch % 12]}{pitch // 12 - 1}"

    pitches = [n.pitch for n in notes]
    max_end = max(n.start_time + n.duration for n in notes)

    return {
        "note_count": len(notes),
        "pitch_range": [pitch_to_name(min(pitches)), pitch_to_name(max(pitches))],
        "duration_beats": round(max_end, 2),
        "first_notes": [pitch_to_name(n.pitch) for n in notes[:3]],
    }


def transcribe_audio_base64(
    audio_base64: str,
    input_format: str = "webm",
    tempo_bpm: float = 120.0,
    onset_threshold: float = 0.5,
    frame_threshold: float = 0.3,
    pitch_correction_strength: float = 0.7,
) -> Dict[str, Any]:
    """
    Main entry point: transcribe base64-encoded audio to MIDI notes and save to file.

    Args:
        audio_base64: Base64-encoded audio data
        input_format: Input audio format ("webm" or "wav")
        tempo_bpm: Tempo for beat conversion
        onset_threshold: Confidence threshold for note onsets
        frame_threshold: Confidence threshold for note frames

    Returns:
        Dict with:
            - success: bool
            - midi_id: Unique ID for the saved MIDI file
            - midi_path: Path to the saved MIDI file
            - note_count: Number of notes detected
            - notes_summary: Compact summary for LLM context
            - suggested_clip_length: Suggested clip length in beats
            - notes: Full notes array (for compatibility)
            - error: Error message (if failed)
    """
    try:
        # Decode base64 audio
        try:
            audio_bytes = base64.b64decode(audio_base64)
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to decode base64 audio: {str(e)}",
                "notes": [],
                "note_count": 0,
            }

        logger.info(f"Received {len(audio_bytes)} bytes of {input_format} audio")

        # Create temp directory for processing
        with tempfile.TemporaryDirectory() as tmp_dir:
            wav_path = os.path.join(tmp_dir, "audio.wav")

            # Convert to WAV if needed
            if input_format.lower() == "webm":
                convert_webm_to_wav(audio_bytes, wav_path)
            elif input_format.lower() == "wav":
                with open(wav_path, "wb") as f:
                    f.write(audio_bytes)
            else:
                return {
                    "success": False,
                    "error": f"Unsupported audio format: {input_format}. Use 'webm' or 'wav'.",
                    "notes": [],
                    "note_count": 0,
                }

            # Transcribe
            notes = transcribe_audio_to_notes(
                wav_path,
                tempo_bpm=tempo_bpm,
                onset_threshold=onset_threshold,
                frame_threshold=frame_threshold,
            )

            # Stabilize pitch to reduce singer wobble/jitter
            notes = apply_pitch_correction(
                notes,
                strength=pitch_correction_strength,
            )

            if not notes:
                return {
                    "success": False,
                    "error": "No notes detected. Try humming or whistling louder and clearer.",
                    "notes": [],
                    "note_count": 0,
                }

            # Save to MIDI file
            midi_info = save_notes_to_midi(notes, tempo_bpm)

            # Calculate suggested clip length (round up to nearest bar)
            max_end_time = max(n.start_time + n.duration for n in notes)
            suggested_length = max(4.0, ((int(max_end_time) // 4) + 1) * 4)

            # Get compact summary for LLM
            notes_summary = get_notes_summary(notes)

            return {
                "success": True,
                "midi_id": midi_info["midi_id"],
                "midi_path": midi_info["midi_path"],
                "note_count": len(notes),
                "notes_summary": notes_summary,
                "suggested_clip_length": suggested_length,
                "tempo_bpm": tempo_bpm,
                "pitch_correction_strength": pitch_correction_strength,
                "notes": [n.to_dict() for n in notes],  # Keep for compatibility
            }

    except ImportError as e:
        return {"success": False, "error": str(e), "notes": [], "note_count": 0}
    except Exception as e:
        logger.error(f"Transcription failed: {str(e)}", exc_info=True)
        return {
            "success": False,
            "error": f"Transcription failed: {str(e)}",
            "notes": [],
            "note_count": 0,
        }


# For testing
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python audio_to_midi.py <audio_file.wav>")
        sys.exit(1)

    logging.basicConfig(level=logging.INFO)

    wav_file = sys.argv[1]
    with open(wav_file, "rb") as f:
        audio_data = f.read()

    audio_b64 = base64.b64encode(audio_data).decode("utf-8")
    result = transcribe_audio_base64(audio_b64, input_format="wav")

    import json

    print(json.dumps(result, indent=2))
