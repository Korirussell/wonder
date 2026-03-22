#!/usr/bin/env python3
"""
chop_harmonic_hp_only.py

Opinionated chopping pipeline per user's request:
 - Use librosa HPSS only.
 - Operate only on the harmonic component (vocals + harmonic instruments).
 - Create longer harmonic chops by default (configurable via --default_len).
 - Save harmonic chops into outdir/harmonic/
 - Produce chops_metadata.json and chops_metadata_trimmed.json (compact LLM-ready)
 - Interactive playback helper available.

Usage:
  python chop_harmonic_hp_only.py --input sample.mp3 --outdir ./chops --default_len 1.8 --n_clusters 6

"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

try:
    import librosa
    import soundfile as sf
except Exception as e:
    raise RuntimeError("This script requires librosa and soundfile. Install them first.\n" + str(e))

try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
except Exception:
    KMeans = None

try:
    import simpleaudio as sa
except Exception:
    sa = None

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def detect_onsets(y, sr, hop_length=512, **onset_kwargs):
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    onset_frames = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr,
                                              hop_length=hop_length, **onset_kwargs)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length)
    return onset_times


def make_chops_from_onsets(onset_times, sr, min_duration=0.2, default_len=1.8):
    chops = []
    n = len(onset_times)
    for i, t in enumerate(onset_times):
        start = float(t)
        if i < n - 1:
            end = float(onset_times[i + 1])
            if end - start < min_duration:
                end = start + default_len
        else:
            end = start + default_len
        if end <= start:
            end = start + min_duration
        chops.append((start, end))
    return chops


def extract_features(y_slice, sr, n_mfcc=13):
    feats = {}
    if y_slice.size == 0:
        feats['rms'] = 0.0
        feats['centroid'] = 0.0
        feats['zcr'] = 0.0
        feats['chroma_mean'] = [0.0]*12
        feats['mfcc_mean'] = [0.0]*n_mfcc
        feats['dominant_pc'] = None
        feats['dominant_note'] = None
        return feats

    feats['rms'] = float(np.mean(librosa.feature.rms(y=y_slice)[0]))
    feats['centroid'] = float(np.mean(librosa.feature.spectral_centroid(y=y_slice, sr=sr)[0]))
    feats['zcr'] = float(np.mean(librosa.feature.zero_crossing_rate(y_slice)[0]))

    chroma = librosa.feature.chroma_stft(y=y_slice, sr=sr)
    feats['chroma_mean'] = [float(x) for x in np.mean(chroma, axis=1)]
    dom = int(np.argmax(feats['chroma_mean'])) if np.array(feats['chroma_mean']).size>0 else None
    feats['dominant_pc'] = dom
    feats['dominant_note'] = NOTE_NAMES[dom] if dom is not None else None

    mfcc = librosa.feature.mfcc(y=y_slice, sr=sr, n_mfcc=n_mfcc)
    feats['mfcc_mean'] = [float(x) for x in np.mean(mfcc, axis=1)]
    return feats


def save_slice(y, sr, start, end, outpath):
    s = int(round(start*sr)); e = int(round(end*sr))
    seg = y[s:e]
    if seg.size==0:
        seg = np.zeros(int(0.01*sr), dtype=np.float32)
    sf.write(str(outpath), seg, sr)
    return str(outpath)


def try_playback(path):
    try:
        from IPython.display import Audio, display
        display(Audio(filename=str(path)))
        return True
    except Exception:
        pass
    if sa is not None:
        try:
            import wave
            with wave.open(str(path),'rb') as wf:
                data = wf.readframes(wf.getnframes())
                play = sa.play_buffer(data, num_channels=wf.getnchannels(), bytes_per_sample=wf.getsampwidth(), sample_rate=wf.getframerate())
                play.wait_done()
                return True
        except Exception:
            pass
    print(f"Saved: {path}")
    return False


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--input','-i',required=True)
    p.add_argument('--outdir','-o',default='./chops')
    p.add_argument('--sr',type=int,default=44100)
    p.add_argument('--hop_length',type=int,default=512)
    p.add_argument('--default_len',type=float,default=1.8)
    p.add_argument('--min_duration',type=float,default=0.2)
    p.add_argument('--n_clusters',type=int,default=6)
    p.add_argument('--backtrack',action='store_true')
    p.add_argument('--pre_max',type=int,default=7)
    p.add_argument('--post_max',type=int,default=7)
    p.add_argument('--pre_avg',type=int,default=7)
    p.add_argument('--post_avg',type=int,default=7)
    p.add_argument('--delta',type=float,default=0.25)
    p.add_argument('--wait',type=int,default=0)

    args = p.parse_args()
    infile = Path(args.input)
    outdir = Path(args.outdir)
    outdir.mkdir(parents=True,exist_ok=True)

    print('Loading audio...')
    y, sr = librosa.load(str(infile), sr=(None if args.sr==0 else args.sr))
    if args.sr==0:
        sr = sr or 44100
    print(f'Duration: {y.shape[0]/sr:.2f}s, sr={sr}')

    print('Applying HPSS... (harmonic -> chops)')
    y_harm, _ = librosa.effects.hpss(y)

    onset_kwargs = dict(backtrack=args.backtrack, pre_max=args.pre_max, post_max=args.post_max,
                        pre_avg=args.pre_avg, post_avg=args.post_avg, delta=args.delta, wait=args.wait)
    onset_times = detect_onsets(y_harm, sr, hop_length=args.hop_length, **onset_kwargs)
    print(f'Detected {len(onset_times)} onsets (harmonic).')

    chops_sec = make_chops_from_onsets(onset_times, sr, min_duration=args.min_duration, default_len=args.default_len)
    if len(chops_sec)==0:
        chops_sec=[(0.0, y_harm.shape[0]/sr)]

    harmonic_dir = outdir/'harmonic'
    harmonic_dir.mkdir(parents=True,exist_ok=True)

    metadata = []
    feature_matrix = []

    for i,(s,e) in enumerate(chops_sec):
        dur = e-s
        cid = f'harmonic_Chop_{i:03d}'
        fname = harmonic_dir/f'{cid}.wav'
        save_slice(y_harm, sr, s, e, fname)
        y_slice = y_harm[int(round(s*sr)):int(round(e*sr))]
        feats = extract_features(y_slice, sr)
        vec = [feats['rms'], feats['centroid'], feats['zcr']] + feats['mfcc_mean'][:4]
        feature_matrix.append(vec)
        rec = {
            'id': cid,
            'filename': str(fname),
            'stem': 'harmonic',
            'start': float(s),
            'end': float(e),
            'duration': float(dur),
            'rms': feats['rms'],
            'centroid': feats['centroid'],
            'zcr': feats['zcr'],
            'dominant_pc': feats['dominant_pc'],
            'dominant_note': feats['dominant_note'],
            'chroma_mean': feats['chroma_mean'],
            'mfcc_mean': feats['mfcc_mean']
        }
        metadata.append(rec)

    X = np.array(feature_matrix) if feature_matrix else np.zeros((0,7))
    if KMeans is not None and X.shape[0]>0:
        k = min(args.n_clusters, X.shape[0])
        scaler = StandardScaler(); Xs = scaler.fit_transform(X)
        kmeans = KMeans(n_clusters=k, random_state=0).fit(Xs); labels = kmeans.labels_
    else:
        labels = [0]*len(metadata)

    for rec,lab in zip(metadata,labels):
        rec['cluster_label'] = int(lab)
        rec['descriptor'] = f"Harmonic | RMS={rec['rms']:.4f} | Dur={rec['duration']:.2f} | Cluster={lab}"

    json_out = outdir/'chops_metadata.json'
    with open(json_out,'w') as f:
        json.dump({r['id']:r for r in metadata}, f, indent=2)

    csv_out = outdir/'chops_metadata_trimmed.csv'
    pd.DataFrame(metadata).to_csv(csv_out,index=False)

    print(f'Wrote {len(metadata)} harmonic chops to {outdir}')
    print('Interactive preview: enter index or id, or blank to exit')
    try:
        while True:
            ans = input('> ').strip()
            if ans=='':
                break
            if ans=='list':
                for i,r in enumerate(metadata): print(i, r['id'], r['descriptor'])
                continue
            idx = None
            if ans.isdigit():
                idx = int(ans)
            else:
                ids = [r['id'] for r in metadata]
                if ans in ids: idx = ids.index(ans)
            if idx is None or idx<0 or idx>=len(metadata):
                print('Unknown')
                continue
            try_playback(metadata[idx]['filename'])
    except (KeyboardInterrupt, EOFError):
        print('\nDone')

if __name__=='__main__':
    main()
