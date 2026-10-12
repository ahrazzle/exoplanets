"""Compare new takes of a sentence with the sentence they replace: transcription, speaking rate, loudness and
pitch, so the take that will splice in least noticeably can be chosen.

usage: compare_takes.py OLD_CLIP:SENTENCE NEW_CLIP[:SENTENCE] ...   (clips in audio/vo/allison_104; a clip
without a sentence index is used whole)
"""
import json
import pathlib
import sys

import numpy as np
import pyloudnorm

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from mix import ROOT, SR, decode
from mix2 import VOICE, pause_between, sentences
from stt_check import norm, transcribe

meter = pyloudnorm.Meter(SR)


def pitch(y):
    """Median voiced pitch (Hz), by autocorrelation over 40 ms frames."""
    n = int(0.04 * SR)
    out = []
    for i in range(0, len(y) - n, n // 2):
        f = y[i:i + n] - y[i:i + n].mean()
        if np.sqrt((f ** 2).mean()) < 0.02:
            continue
        ac = np.correlate(f, f, "full")[n - 1:]
        lo, hi = int(SR / 320), int(SR / 120)
        k = lo + np.argmax(ac[lo:hi])
        if ac[k] > 0.4 * ac[0]:
            out.append(SR / k)
    return float(np.median(out)) if out else float("nan")


def sentence(spec):
    """The audio and text of CLIP[:SENTENCE], cut in the pauses as mix2.py cuts it."""
    clip, _, idx = spec.partition(":")
    y = decode(ROOT / "audio" / "vo" / VOICE / f"{clip}.mp3", 1)[:, 0]
    d = json.load(open(ROOT / "audio" / "vo" / VOICE / f"{clip}.json"))
    if not idx:
        return y, d["text"]
    i = int(idx)
    a = d["alignment"]
    st, en = a["character_start_times_seconds"], a["character_end_times_seconds"]
    sen = sentences(d["text"])
    c0 = 0.0 if i == 0 else pause_between(y, en[sen[i - 1][1]], st[sen[i][0]], clip)
    c1 = len(y) / SR if i == len(sen) - 1 else pause_between(y, en[sen[i][1]], st[sen[i + 1][0]], clip)
    return y[int(c0 * SR):int(c1 * SR)], d["text"][sen[i][0]:sen[i][1] + 1]


for spec in sys.argv[1:]:
    y, text = sentence(spec)
    voiced = np.nonzero(np.abs(y) > np.abs(y).max() * 0.01)[0]
    y = y[voiced[0]:voiced[-1] + 1]
    dur = len(y) / SR
    heard = transcribe(y)
    ok = "ok" if norm(heard) == norm(text) else f"HEARD: {heard}"
    print(f"{spec:16s} {dur:5.2f} s  {len(norm(text)) / dur:4.2f} words/s  {meter.integrated_loudness(y):6.1f} LUFS  "
          f"pitch {pitch(y):5.1f} Hz  {ok}")
