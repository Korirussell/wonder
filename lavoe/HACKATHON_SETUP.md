# Lavoe Audio Processor - Hackathon Setup

## Quick Start (5 minutes)

### 1. Backend Setup
```bash
cd backend
pip install -e .
python server.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Environment Variables
Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## What You Get

✅ **Clean, Modular Components**
- `AudioUpload` - Drag & drop audio upload
- `AudioPlayer` - Audio playback with controls
- `AiChat` - Chat interface for AI commands
- `AudioProcessor` - Main orchestrator component

✅ **FastAPI Backend with 3 Endpoints**
- `/extract-harmonics` - HPSS harmonic extraction
- `/process-reverb` - Reverb effects with pedalboard
- `/chop-audio` - Intelligent audio chopping with clustering

✅ **AI-Powered Interface**
- Natural language processing requests
- "extract harmonics", "add reverb", "chop into segments"
- Real-time audio processing and playback

## Demo Flow

1. **Upload Audio**: Drag & drop any audio file
2. **Chat with AI**: "extract the harmonic components"
3. **Get Results**: Processed audio with playback controls
4. **Try More**: "add heavy reverb" or "chop into short segments"

## Architecture

```
Frontend (Next.js + TypeScript)
├── AudioUpload → AudioProcessor → AiChat
├── AudioPlayer (for results)
└── Custom hooks for API calls

Backend (FastAPI + Python)
├── Base64 audio processing
├── librosa for audio analysis
├── pedalboard for effects
└── sklearn for clustering
```

## No Docker, No Complexity
- Direct FastAPI endpoints (no Apify actors)
- Simple npm/pip setup
- Ready to demo in minutes
- Easy to extend and modify

## Next Steps for Hackathon
1. Add more AI processing commands
2. Integrate with beat maker component
3. Add real-time audio effects
4. Deploy to Vercel + Railway/Render
