"""Measure frame-to-frame movement of the labels that were reported as shifting, in a rendered film.

Each check is a time window and a box around a label that should be still in that window; the report
is the spread of the label's brightness-weighted centroid (see label_jitter.py).
usage: label_audit.py VIDEO|- CUT   (- lists the checks; CUT: v2 for the first cut, v3 for the second, v4 for the third, v5 for the fourth, v6 for the fifth, v7 for the sixth)
"""
import json
import pathlib
import subprocess
import sys

import numpy as np

CHECKS = {
    # first cut (v1, v2), 133 s: name, start s, duration s, box x0, y0, x1, y1, threshold
    "v2": [
        ("1:02 counter '7,459,491' and 'signals'", 62.0, 2.0, (90, 70, 560, 176), 150),
        ("1:05 'noise' card", 64.3, 1.3, (450, 690, 790, 890), 150),
        ("1:05 'two stars eclipsing' card", 64.3, 1.3, (1090, 690, 1510, 890), 150),
        ("1:09 'pre-filters'", 67.2, 2.0, (470, 250, 660, 300), 150),
        ("1:09 '17 statistical tests'", 67.2, 2.0, (840, 240, 1200, 300), 150),
        ("1:13 'our star' / 'the dip is here'", 73.0, 2.0, (560, 300, 1400, 900), 200),
        ("1:16 counter '438'", 75.2, 1.6, (90, 70, 400, 176), 150),
        ("1:41 '301 of 492 between Earth and Neptune'", 104.6, 2.4, (540, 170, 1120, 230), 150),
        ("1:41 planet names", 104.6, 2.4, (180, 830, 1500, 880), 150),
        ("1:59 credits", 119.0, 2.0, (300, 330, 1620, 600), 150),
        ("0:05 'sky not yet observed'", 5.25, 0.6, (900, 230, 1360, 300), 235),
        ("0:35 'sky not yet observed'", 35.4, 1.2, (1180, 240, 1720, 320), 235),
    ],
    # second cut (v3), 171 s
    "v3": [
        ("0:45 Rabtsevich credit", 44.5, 2.0, (100, 60, 600, 240), 150),
        ("0:46 orbit legend", 45.5, 2.0, (1360, 420, 1760, 560), 150),
        ("1:02 'a planet crosses every 3.18 days'", 62.0, 1.6, (560, 210, 1360, 310), 150),
        ("1:12 'cut every 3.18 days: the dips line up'", 72.0, 2.0, (560, 90, 1360, 140), 150),
        ("1:24 counter '7,459,491' and 'signals'", 83.0, 2.0, (90, 70, 560, 176), 150),
        ("1:30 '17 statistical tests' and test names", 90.0, 1.2, (440, 90, 1880, 400), 150),
        ("1:37 counter '438'", 97.5, 2.0, (90, 70, 400, 176), 150),
        ("1:47 known-planet cards", 106.5, 1.4, (140, 60, 1780, 320), 150),
        ("1:58 'the search only looks for dips'", 118.5, 1.5, (250, 220, 1100, 300), 150),
        ("2:09 false-alarm chart", 129.5, 2.5, (400, 260, 1780, 840), 150),
        ("2:22 '301 of 492 between Earth and Neptune'", 142.5, 2.5, (540, 170, 1120, 230), 150),
        ("2:37 credits", 157.0, 3.0, (300, 330, 1620, 600), 150),
    ],
    # third cut (v4), 209 s
    "v4": [
        ("0:44 Rabtsevich credit", 44.0, 2.0, (100, 60, 600, 240), 150),
        ("0:45 orbit legend", 44.5, 2.0, (1360, 420, 1760, 560), 150),
        ("1:02 'a planet crosses every 3.18 days'", 62.0, 1.6, (560, 210, 1360, 310), 150),
        ("1:08 'a planet crosses every ? days'", 68.5, 1.4, (560, 210, 1360, 310), 150),
        ("1:20 'the right guess, 3.18 days'", 80.0, 2.0, (480, 90, 1440, 140), 150),
        ("1:32 counter '7,459,491' and 'repeating dips'", 92.0, 2.0, (90, 70, 560, 176), 150),
        ("1:49 '17 statistical tests' and test names", 109.0, 2.5, (440, 90, 1880, 410), 150),
        ("1:58 counter '438'", 118.3, 2.0, (90, 70, 400, 176), 150),
        ("2:06 known-planet cards", 126.0, 1.5, (140, 60, 1780, 320), 150),
        ("2:13 'needed: the same noise, but no planets'", 133.5, 1.5, (250, 200, 1200, 260), 150),
        ("2:28 'the search only looks for dips'", 148.0, 1.5, (250, 220, 1100, 300), 150),
        ("2:47 false-alarm chart", 166.9, 1.5, (400, 200, 1780, 840), 150),
        ("3:00 '301 of 492 between Earth and Neptune'", 180.0, 2.5, (540, 170, 1120, 230), 150),
        ("3:16 credits", 195.7, 2.3, (300, 330, 1620, 600), 150),
    ],
    # fourth cut (v5), 227 s
    "v5": [
        ("0:44 Rabtsevich credit", 44.0, 2.0, (100, 60, 600, 240), 150),
        ("0:45 orbit legend", 44.5, 2.0, (1360, 420, 1760, 560), 150),
        ("1:03 'a planet crosses every 3.18 days'", 62.6, 1.6, (560, 210, 1360, 310), 150),
        ("1:10 'a planet crosses every ? days'", 69.5, 1.3, (560, 210, 1360, 310), 150),
        ("1:21 'the right guess, 3.18 days'", 81.2, 2.0, (480, 90, 1440, 140), 150),
        ("1:33 counter '7,459,491' and 'repeating dips'", 93.0, 2.0, (90, 70, 560, 176), 150),
        ("1:51 '17 statistical tests' and test names", 111.0, 2.5, (440, 90, 1880, 410), 150),
        ("2:01 counter '438'", 120.6, 2.0, (90, 70, 400, 176), 150),
        ("2:10 known-planet cards", 130.0, 1.4, (140, 60, 1780, 320), 150),
        ("2:17 'needed: the same noise, but no planets'", 137.0, 2.0, (250, 200, 1200, 260), 150),
        ("2:31 'the search only looks for dips'", 150.8, 1.5, (250, 220, 1100, 300), 150),
        ("2:52 false-alarm chart", 172.0, 1.5, (400, 200, 1780, 840), 150),
        ("3:03 filter and '51 probably real'", 183.4, 2.0, (130, 280, 1720, 900), 150),
        ("3:17 '343 of 546 between Earth and Neptune'", 197.0, 2.5, (540, 170, 1120, 230), 150),
        ("3:34 credits", 213.6, 2.4, (300, 330, 1620, 600), 150),
    ],
}
# fifth cut (v6), 227 s: v5 with the 3D orbit field and the 3D Rabtsevich shot, whose legend and star label moved
CHECKS["v6"] = [c for c in CHECKS["v5"] if not c[0].startswith("0:45")] + [
    ("0:45 orbit legend (3D)", 44.5, 2.0, (1420, 410, 1910, 560), 150),
    ("0:47 TIC 4206066 label (3D)", 46.7, 2.0, (480, 724, 1160, 880), 150),
]
# (the field's "only a few" label has bright stars and orbits drifting behind it, which move any centroid; check it
# by eye with crops instead)


def remap(checks, old, new):
    """The same checks after a remix: each window moves with the narration phrase it falls in or after (matched by
    text between the old and new timelines); windows after a phrase that is gone are dropped."""
    old_ph = json.load(open(ROOT / old))["phrases"]
    new_start = {p["text"]: p["start"] for p in json.load(open(ROOT / new))["phrases"]}
    out = []
    for name, t0, dur, box, thr in checks:
        before = [p for p in old_ph if p["start"] <= t0]
        if not before:
            out.append((name, t0, dur, box, thr))
        elif before[-1]["text"] in new_start:
            out.append((name, round(new_start[before[-1]["text"]] + t0 - before[-1]["start"], 2), dur, box, thr))
    return out


# sixth cut (v7): two new narration lines, the public-data line cut and the whole track under it, so the
# windows move with the narration
ROOT = pathlib.Path(__file__).parent.parent
CHECKS["v7"] = remap(CHECKS["v6"], "audio/mix/timeline_v9.json", "timeline.json") + [
    ("1:22 'the right guess, 3.18 days'", 82.2, 2.0, (480, 90, 1440, 140), 150),
    ("3:40 end card", 220.3, 1.5, (300, 440, 1620, 760), 150),
]

path, cut = sys.argv[1], sys.argv[2]
if path == "-":   # list the checks only
    for name, t0, dur, box, thr in CHECKS[cut]:
        print(f"{t0:7.2f} s  {name}")
    sys.exit()
for name, t0, dur, (x0, y0, x1, y1), thr in CHECKS[cut]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t0), "-t", str(dur), "-i", path, "-vf",
                          f"crop={x1 - x0}:{y1 - y0}:{x0}:{y0}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, y1 - y0, x1 - x0).astype(float)
    cx, cy = [], []
    for f in frames:
        m = f > thr
        if m.sum() < 20:
            continue
        ys, xs = np.nonzero(m)
        w = f[m]
        cx.append((xs * w).sum() / w.sum())
        cy.append((ys * w).sum() / w.sum())
    if len(cx) < 2:
        print(f"{name}: no text found")
        continue
    cx, cy = np.array(cx), np.array(cy)
    step = max(np.abs(np.diff(cx)).max(), np.abs(np.diff(cy)).max())
    print(f"{name}: {len(cx)} frames, largest frame-to-frame move {step:.2f} px, spread {np.ptp(cx):.2f} x {np.ptp(cy):.2f} px")
