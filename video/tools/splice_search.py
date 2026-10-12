"""Find bar-aligned splice points in the music where a jump forward is least audible.

A splice from beat i to beat j (j - i a multiple of 4 beats) is scored by how similar the
music is in the 8 beats before and after each point (chroma, timbre and level).
usage: splice_search.py WAV ANALYSIS_JSON T_I_MIN T_I_MAX JUMP_MIN JUMP_MAX
"""
import json
import sys

import librosa
import numpy as np

wav, analysis = sys.argv[1], sys.argv[2]
ti_min, ti_max, jump_min, jump_max = map(float, sys.argv[3:7])
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
rows = []
for i in range(W, len(beats) - W):
    if not ti_min <= beats[i] <= ti_max:
        continue
    for j in range(i + 4, len(beats) - W, 4):
        jump = beats[j] - beats[i]
        if jump_min <= jump <= jump_max:
            d = np.linalg.norm(feat[:, i - W:i + W] - feat[:, j - W:j + W], axis=0).mean()
            rows.append((d, beats[i], beats[j], jump))
rows.sort()
for d, a, b, jump in rows[:12]:
    print(f"distance {d:.3f}  splice {a:7.2f} -> {b:7.2f}  (jump {jump:6.2f} s = {jump / 2.2285:5.2f} bars)")
