"""Measure how much text labels move from frame to frame in a rendered clip.

For each box, takes the pixels brighter than a threshold in every frame and reports the spread of their
centroid (max - min, in pixels). A static label should move by well under a pixel.
usage: label_jitter.py VIDEO [--frames A:B] x0,y0,x1,y1[,threshold] [...]
"""
import subprocess
import sys

import numpy as np

path = sys.argv[1]
args = sys.argv[2:]
first, last = 0, None
if args and args[0] == "--frames":
    a, b = args[1].split(":")
    first, last = int(a), int(b)
    args = args[2:]
boxes = []
for arg in args:
    v = [int(x) for x in arg.split(",")]
    boxes.append((v[:4], v[4] if len(v) > 4 else 200))

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                     capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, 1080, 1920)[first:last]
for (x0, y0, x1, y1), thr in boxes:
    cx, cy, n = [], [], []
    for f in frames:
        crop = f[y0:y1, x0:x1].astype(float)
        m = crop > thr
        if m.sum() < 20:
            continue
        ys, xs = np.nonzero(m)
        w = crop[m]
        cx.append((xs * w).sum() / w.sum())
        cy.append((ys * w).sum() / w.sum())
        n.append(m.sum())
    if not cx:
        print(f"box {x0},{y0},{x1},{y1}: no text found")
        continue
    cx, cy = np.array(cx), np.array(cy)
    print(f"box {x0},{y0},{x1},{y1}: {len(cx)} frames, centroid spread x {np.ptp(cx):.2f} px, y {np.ptp(cy):.2f} px, "
          f"frame-to-frame max {np.abs(np.diff(cx)).max():.2f}/{np.abs(np.diff(cy)).max():.2f} px")
