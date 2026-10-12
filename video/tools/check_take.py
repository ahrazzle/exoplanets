"""Check narration takes: length, speaking rate, and every pause in the audio longer than 0.25 s, each
with the words the alignment puts around it, so a pause in the middle of a sentence, or an alignment that
is off, shows up.
usage: check_take.py CLIP...   (clips in audio/vo/allison_104)
"""
import json
import pathlib
import subprocess
import sys

import numpy as np

ROOT = pathlib.Path(__file__).parent.parent
SR = 48000

for clip in sys.argv[1:]:
    base = ROOT / "audio" / "vo" / "allison_104" / clip
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(base.with_suffix(".mp3")), "-ac", "1", "-ar", str(SR),
                          "-f", "f32le", "-"], capture_output=True, check=True).stdout
    y = np.frombuffer(raw, np.float32)
    d = json.loads(base.with_suffix(".json").read_text())
    text, a = d["text"], d["alignment"]
    st, en = a["character_start_times_seconds"], a["character_end_times_seconds"]
    hop = SR // 100
    rms = np.sqrt(np.convolve(y ** 2, np.ones(hop) / hop, mode="same")[::hop])
    db = 20 * np.log10(rms / rms.max() + 1e-9)
    quiet = db < -42
    words = len(text.split())
    print(f"{clip}: {len(y) / SR:.2f} s, {words} words, {words / (len(y) / SR):.2f} words/s")
    runs, k = [], 0
    while k < len(quiet):
        if quiet[k]:
            j = k
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - k) / 100 >= 0.25:
                runs.append((k / 100, j / 100))
            k = j
        else:
            k += 1
    for t0, t1 in runs:
        mid = (t0 + t1) / 2
        # the character the alignment says is being spoken at the middle of the pause
        i = int(np.searchsorted(st, mid))
        ctx = text[max(0, i - 30):i] + " | " + text[i:i + 30]
        print(f"   pause {t0:6.2f}-{t1:6.2f} ({t1 - t0:.2f} s)  alignment there: {ctx!r}")
