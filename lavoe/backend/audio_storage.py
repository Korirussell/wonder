import os
import uuid
import json
import tempfile
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

class AudioStorage:
    """
    Audio storage system that manages audio files with unique IDs and metadata.
    Designed to minimize context usage for AI agents by providing lightweight track references.
    """
    
    def __init__(self, storage_dir: str = None, max_age_hours: int = 24, max_file_size_mb: int = 100):
        """
        Initialize audio storage system.
        
        Args:
            storage_dir: Directory to store audio files (defaults to temp directory)
            max_age_hours: Maximum age of stored files before cleanup (default 24 hours)
            max_file_size_mb: Maximum file size in MB (default 100MB)
        """
        if storage_dir is None:
            storage_dir = os.path.join(tempfile.gettempdir(), "lavoe_audio_storage")
        
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(exist_ok=True, parents=True)
        self.metadata_file = self.storage_dir / "metadata.json"
        self.max_age_hours = max_age_hours
        self.max_file_size_bytes = max_file_size_mb * 1024 * 1024
        self._lock = threading.RLock()  # Thread-safe operations
        
        logger.info(f"AudioStorage initialized at {self.storage_dir}")
    
    def _load_track_metadata(self, track_id: str) -> Optional[Dict[str, Any]]:
        """Load metadata for a specific track from individual file."""
        metadata_path = self.storage_dir / f"{track_id}.json"
        if metadata_path.exists():
            try:
                with open(metadata_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load metadata for {track_id}: {e}")
        return None
    
    def _save_track_metadata(self, track_id: str, metadata: Dict[str, Any]):
        """Save metadata for a specific track to individual file."""
        metadata_path = self.storage_dir / f"{track_id}.json"
        try:
            with self._lock:
                with open(metadata_path, 'w') as f:
                    json.dump(metadata, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to save metadata for {track_id}: {e}")
            raise
    
    def _validate_audio_data(self, audio_bytes: bytes, filename: str = None) -> None:
        """Validate audio data before storage."""
        if not audio_bytes:
            raise ValueError("Empty audio data")
        
        if len(audio_bytes) > self.max_file_size_bytes:
            raise ValueError(f"File too large: {len(audio_bytes)} bytes (max: {self.max_file_size_bytes})")
        
        # Basic file type validation
        if filename:
            allowed_extensions = {'.wav', '.mp3', '.flac', '.ogg', '.m4a'}
            ext = Path(filename).suffix.lower()
            if ext and ext not in allowed_extensions:
                raise ValueError(f"Unsupported file type: {ext}")
    
    def store_audio(self, audio_bytes: bytes, filename: str = None, 
                   metadata: Dict[str, Any] = None) -> str:
        """
        Store audio data and return a unique track ID.
        
        Args:
            audio_bytes: Raw audio data
            filename: Original filename (optional)
            metadata: Additional metadata to store
            
        Returns:
            Unique track ID
        """
        # Validate input
        self._validate_audio_data(audio_bytes, filename)
        
        track_id = str(uuid.uuid4())
        
        # Determine file extension
        if filename and '.' in filename:
            ext = '.' + filename.split('.')[-1].lower()
        else:
            ext = '.wav'  # Default extension
        
        audio_path = self.storage_dir / f"{track_id}{ext}"
        
        try:
            with self._lock:
                # Store audio file
                with open(audio_path, 'wb') as f:
                    f.write(audio_bytes)
                
                # Store metadata
                track_metadata = {
                    'track_id': track_id,
                    'filename': filename or f"audio{ext}",
                    'file_path': str(audio_path),
                    'file_size': len(audio_bytes),
                    'created_at': datetime.now().isoformat(),
                    'extension': ext,
                    'metadata': metadata or {}
                }
                
                self._save_track_metadata(track_id, track_metadata)
                
            logger.info(f"Stored audio track {track_id} ({len(audio_bytes)} bytes)")
            return track_id
            
        except Exception as e:
            # Cleanup on failure
            if audio_path.exists():
                try:
                    audio_path.unlink()
                except:
                    pass
            raise e
    
    def get_audio_bytes(self, track_id: str) -> Optional[bytes]:
        """
        Retrieve audio data by track ID.
        
        Args:
            track_id: Unique track identifier
            
        Returns:
            Audio data as bytes, or None if not found
        """
        metadata = self._load_track_metadata(track_id)
        if not metadata:
            return None
        
        file_path = Path(metadata['file_path'])
        if not file_path.exists():
            logger.warning(f"Audio file not found for track {track_id}")
            return None
        
        try:
            with open(file_path, 'rb') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read audio file for track {track_id}: {e}")
            return None
    
    def get_track_metadata(self, track_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata for a track.
        
        Args:
            track_id: Unique track identifier
            
        Returns:
            Track metadata or None if not found
        """
        return self._load_track_metadata(track_id)
    
    def get_track_summary(self, track_id: str) -> Optional[Dict[str, Any]]:
        """
        Get lightweight summary of track (for AI agent context).
        
        Args:
            track_id: Unique track identifier
            
        Returns:
            Lightweight track summary or None if not found
        """
        metadata = self._load_track_metadata(track_id)
        if not metadata:
            return None
        
        # Return only essential information to minimize context usage
        return {
            'track_id': track_id,
            'filename': metadata['filename'],
            'file_size': metadata['file_size'],
            'created_at': metadata['created_at'],
            'duration_seconds': metadata.get('metadata', {}).get('duration_seconds'),
            'sample_rate': metadata.get('metadata', {}).get('sample_rate'),
            'processing_type': metadata.get('metadata', {}).get('processing_type'),
            'channels': metadata.get('metadata', {}).get('channels')
        }
    
    def list_tracks(self, limit: int = 100) -> List[Dict[str, Any]]:
        """
        List all stored tracks with lightweight summaries, sorted by date modified (newest first).
        
        Args:
            limit: Maximum number of tracks to return
            
        Returns:
            List of track summaries sorted by created_at in descending order
        """
        summaries = []
        # Get all JSON metadata files
        json_files = list(self.storage_dir.glob("*.json"))
        
        for json_file in json_files:
            track_id = json_file.stem
            summary = self.get_track_summary(track_id)
            if summary:
                summaries.append(summary)
        
        # Sort by created_at in descending order (newest first)
        summaries.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        
        # Apply limit after sorting
        return summaries[:limit]
    
    def delete_track(self, track_id: str) -> bool:
        """
        Delete a track and its associated files.
        
        Args:
            track_id: Unique track identifier
            
        Returns:
            True if deleted successfully, False otherwise
        """
        metadata = self._load_track_metadata(track_id)
        if not metadata:
            return False
        
        try:
            with self._lock:
                # Delete audio file
                file_path = Path(metadata['file_path'])
                if file_path.exists():
                    file_path.unlink()
                
                # Delete metadata file
                metadata_path = self.storage_dir / f"{track_id}.json"
                if metadata_path.exists():
                    metadata_path.unlink()
                
            logger.info(f"Deleted track {track_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete track {track_id}: {e}")
            return False
    
    def cleanup_old_tracks(self) -> int:
        """
        Clean up tracks older than max_age_hours.
        
        Returns:
            Number of tracks cleaned up
        """
        cutoff_time = datetime.now() - timedelta(hours=self.max_age_hours)
        tracks_to_delete = []
        
        # Get all JSON metadata files
        json_files = list(self.storage_dir.glob("*.json"))
        
        for json_file in json_files:
            track_id = json_file.stem
            try:
                metadata = self._load_track_metadata(track_id)
                if metadata:
                    created_at = datetime.fromisoformat(metadata['created_at'])
                    if created_at < cutoff_time:
                        tracks_to_delete.append(track_id)
                else:
                    tracks_to_delete.append(track_id)  # Delete orphaned metadata
            except Exception as e:
                logger.warning(f"Invalid metadata for track {track_id}: {e}")
                tracks_to_delete.append(track_id)  # Delete invalid entries
        
        deleted_count = 0
        for track_id in tracks_to_delete:
            if self.delete_track(track_id):
                deleted_count += 1
        
        if deleted_count > 0:
            logger.info(f"Cleaned up {deleted_count} old tracks")
        
        return deleted_count
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics.
        
        Returns:
            Dictionary with storage statistics
        """
        json_files = list(self.storage_dir.glob("*.json"))
        total_tracks = len(json_files)
        total_size = 0
        
        for json_file in json_files:
            track_id = json_file.stem
            metadata = self._load_track_metadata(track_id)
            if metadata:
                total_size += metadata.get('file_size', 0)
        
        return {
            'total_tracks': total_tracks,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'storage_dir': str(self.storage_dir),
            'max_age_hours': self.max_age_hours,
            'max_file_size_mb': round(self.max_file_size_bytes / (1024 * 1024), 2)
        }

# Global storage instance
_storage_instance = None

def get_audio_storage() -> AudioStorage:
    """Get the global audio storage instance."""
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = AudioStorage()
    return _storage_instance
