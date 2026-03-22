import librosa
import numpy as np
from pedalboard import Reverb


def get_harmonic_components(y):
    """Get the harmonic components of a given audio data."""

    y_harmonic, _ = librosa.effects.hpss(y)

    return y_harmonic

def get_percussive_components(y):
    """Get the percussive components of a given audio data."""

    _, y_percussive = librosa.effects.hpss(y)

    return y_percussive


def add_reverb(y, sample_rate=44100, room_size=0.5, damping=0.5, wet_level=0.3, dry_level=0.7):
    """
    Add reverb effect to audio data.
    
    Args:
        y: Audio data as numpy array
        sample_rate: Sample rate of the audio
        room_size: Size of the reverb room (0.0 to 1.0)
        damping: High frequency damping (0.0 to 1.0)
        wet_level: Reverb effect level (0.0 to 1.0)
        dry_level: Original signal level (0.0 to 1.0)
    
    Returns:
        Audio data with reverb effect applied
    """
    # Ensure audio is in the right format for pedalboard
    if len(y.shape) == 1:
        # Convert mono to stereo for better reverb effect
        y_stereo = np.array([y, y])
    else:
        y_stereo = y.T if y.shape[0] > y.shape[1] else y
    
    # Create reverb effect
    reverb = Reverb(
        room_size=room_size,
        damping=damping,
        wet_level=wet_level,
        dry_level=dry_level
    )
    
    # Apply reverb effect
    y_reverb = reverb(y_stereo, sample_rate)
    
    # Convert back to original format if needed
    if len(y.shape) == 1:
        # Convert back to mono by averaging channels
        y_reverb = np.mean(y_reverb, axis=0)
    else:
        y_reverb = y_reverb.T if y.shape[0] > y.shape[1] else y_reverb
    
    return y_reverb


def adjust_pitch(y, sr, semitones):
    """
    Adjust the pitch of audio data by a specified number of semitones.
    
    Args:
        y: Audio data as numpy array
        sr: Sample rate of the audio
        semitones: Number of semitones to shift (positive for higher pitch, negative for lower)
    
    Returns:
        Audio data with pitch adjusted
    """
    # Use librosa's pitch_shift function
    y_shifted = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)
    
    return y_shifted


def adjust_speed(y, speed_factor):
    """
    Adjust the speed of audio data by a specified factor.
    
    Args:
        y: Audio data as numpy array
        speed_factor: Speed multiplication factor (1.0 = normal, 2.0 = 2x faster, 0.5 = 2x slower)
    
    Returns:
        Audio data with speed adjusted
    """
    if speed_factor <= 0:
        raise ValueError("Speed factor must be positive")
    
    # Use librosa's time_stretch function
    # rate > 1.0 makes audio faster, rate < 1.0 makes audio slower
    # speed_factor directly corresponds to the rate parameter
    y_stretched = librosa.effects.time_stretch(y, rate=speed_factor)
    
    return y_stretched
