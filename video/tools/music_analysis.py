"""Tempo, beat grid, loudness arc and section boundaries of the music track.

usage: music_analysis.py WAV OUT_JSON
"""
import json
import sys

import librosa
import numpy as np

path, out = sys.argv[1], sys.argv[2]
y, sr = librosa.load(path, sr=22050, mono=True)
dur = len(y) / sr

tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
tempo = float(np.atleast_1d(tempo)[0])

hop = 512
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
t_rms = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
db = 20 * np.log10(rms + 1e-9)
per_sec = [float(db[(t_rms >= s) & (t_rms < s + 1)].mean()) for s in range(int(dur))]

# Section boundaries from beat-synchronous timbre and harmony.
beat_frames = librosa.time_to_frames(beats, sr=sr, hop_length=hop)
feat = np.vstack([librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13),
                  librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)])
sync = librosa.util.sync(feat, beat_frames)
bounds = librosa.segment.agglomerative(librosa.util.normalize(sync, axis=1), 10)
bound_times = sorted({float(t) for t in librosa.frames_to_time(beat_frames[np.clip(bounds, 0, len(beat_frames) - 1)],
                                                                sr=sr, hop_length=hop)})

json.dump({"duration": dur, "tempo": tempo, "beats": [round(float(b), 3) for b in beats],
           "rms_db_per_sec": [round(x, 1) for x in per_sec], "sections": [round(t, 2) for t in bound_times]},
          open(out, "w"))
print(f"duration {dur:.1f} s, tempo {tempo:.1f} BPM, {len(beats)} beats, first beats {np.round(beats[:4], 2)}")
print("sections at", [round(t, 1) for t in bound_times])
print("RMS dB per 5 s:", " ".join(f"{np.mean(per_sec[i:i + 5]):.0f}" for i in range(0, int(dur), 5)))
