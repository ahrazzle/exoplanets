"""Find flicker: regions that change between consecutive frames and then change back (A-B-A).

Smooth motion moves steadily, so frame n-1 differs from n+1 more than from n. A frame that jumps and
returns (a label drawn in the wrong place for one frame) differs from both neighbours while they match
each other. Frames are decoded at quarter resolution and split into 32x32-pixel tiles; a tile flickers
when both neighbour differences exceed THRESH and the n-1 to n+1 difference is under RATIO of the smaller.
usage: flicker_audit.py VIDEO [THRESH] [RATIO]
"""
import subprocess
from fractions import Fraction
import sys

import numpy as np

path = sys.argv[1]
thresh = float(sys.argv[2]) if len(sys.argv) > 2 else 1.5
ratio = float(sys.argv[3]) if len(sys.argv) > 3 else 0.35
w, h, tile = 480, 270, 32
fps = float(Fraction(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                                     "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip()))
proc = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={w}:{h}:flags=area", "-f", "rawvideo",
                         "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE)
ny, nx = h // tile, w // tile


def tiles(f):
    return f[: ny * tile, : nx * tile].reshape(ny, tile, nx, tile).astype(np.float32)


def tdiff(a, b):
    return np.abs(a - b).mean(axis=(1, 3))


prev2 = prev1 = None
hits = []
n = 0
while True:
    buf = proc.stdout.read(w * h)
    if len(buf) < w * h:
        break
    cur = tiles(np.frombuffer(buf, np.uint8).reshape(h, w))
    if prev2 is not None:
        d01, d12, d02 = tdiff(prev2, prev1), tdiff(prev1, cur), tdiff(prev2, cur)
        m = (d01 > thresh) & (d12 > thresh) & (d02 < ratio * np.minimum(d01, d12))
        for iy, ix in zip(*np.nonzero(m)):
            hits.append((n - 1, ix, iy, d01[iy, ix], d12[iy, ix], d02[iy, ix]))
    prev2, prev1 = prev1, cur
    n += 1

print(f"{n} frames at {fps:g} fps; {len(hits)} flickering tiles")
# group hits into runs by time
runs = []
for fr, ix, iy, a, b, c in sorted(hits):
    t = fr / fps
    if runs and t - runs[-1][1] < 0.5:
        runs[-1][1] = t
        runs[-1][2].add((ix, iy))
        runs[-1][3] += 1
    else:
        runs.append([t, t, {(ix, iy)}, 1])
for t0, t1, cells, count in runs:
    xs = sorted({c[0] * tile * 4 for c in cells})
    ys = sorted({c[1] * tile * 4 for c in cells})
    print(f"  {t0:7.2f}-{t1:7.2f} s  {count:4d} hits in {len(cells)} tiles, x {xs[0]}-{xs[-1] + 128}, y {ys[0]}-{ys[-1] + 128} (1080p px)")
