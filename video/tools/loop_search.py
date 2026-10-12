"""Find bar-aligned loop points inside a stretch of the music: play up to B, then continue from A (A < B),
with both points inside [LO, HI], so the repeat uses no music from outside the stretch.

Scored like splice_search.py: the distance between the 8 beats around A and around B (chroma, timbre, level).
usage: loop_search.py WAV ANALYSIS_JSON LO HI BARS [BARS ...]
"""
import json
import sys

import librosa
import numpy as np

wav, analysis = sys.argv[1], sys.argv[2]
lo, hi = float(sys.argv[3]), float(sys.argv[4])
bars = [int(b) for b in sys.argv[5:]]
beats = np.array(json.load(open(analysis))["beats"])

y, sr = librosa.load(wav, sr=22050, mono=True)
hop = 512
frames = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
chroma = librosa.util.sync(librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop), frames)
mfcc = librosa.util.sync(librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13), frames)
rms = librosa.util.sync(librosa.feature.rms(y=y, hop_length=hop), frames)
feat = np.vstack([librosa.util.normalize(chroma, axis=0),
                  (mfcc - mfcc.mean(1, keepdims=True)) / mfcc.std(1, keepdims=True) / 4,
                  20 * np.log10(rms + 1e-9) / 6])

W = 8
first = int(np.argmin(np.abs(beats - beats[0])))
for nb in bars:
    rows = []
    for i in range(W, len(beats) - W):
        j = i + 4 * nb
        if j >= len(beats) - W or (i - first) % 4:
            continue
        a, b = beats[i], beats[j]
        if lo <= a and b <= hi:
            d = np.linalg.norm(feat[:, i - W:i + W] - feat[:, j - W:j + W], axis=0).mean()
            rows.append((d, a, b))
    rows.sort()
    print(f"== {nb} bars")
    for d, a, b in rows[:6]:
        print(f"distance {d:.3f}  play to {b:7.2f}, continue from {a:7.2f}")
