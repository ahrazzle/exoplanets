"""Compare stills of the film (out/stills/tNNNN.NN.png, from stills.py) with the same moments of a rendered video,
to check that a code change left the picture alone. Prints PSNR per frame; an unchanged frame differs only by
the video's compression (40 dB or more).

usage: compare_frames.py VIDEO T1 T2 ...
"""
import pathlib
import subprocess
import sys

import numpy as np

ROOT = pathlib.Path(__file__).parent.parent
video, times = sys.argv[1], [float(x) for x in sys.argv[2:]]


def frame(src, *args):
    raw = subprocess.run(["ffmpeg", "-v", "error", *args, "-i", src, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3).astype(float)


for t in times:
    a = frame(video, "-ss", f"{t:.4f}")
    b = frame(str(ROOT / "out" / "stills" / f"t{t:07.2f}.png"))
    mse = ((a - b) ** 2).mean()
    print(f"{t:7.2f} s: PSNR {10 * np.log10(255 ** 2 / max(mse, 1e-9)):.1f} dB, max difference {np.abs(a - b).max():.0f}")
