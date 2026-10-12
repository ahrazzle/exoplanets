"""Frames of a rendered film at given times, tiled into one image for review.

usage: contact_sheet.py VIDEO OUT.png COLS T1 T2 ...   (times in seconds; each frame is scaled to 960 px wide)
"""
import subprocess
import sys

import numpy as np

video, out, cols, times = sys.argv[1], sys.argv[2], int(sys.argv[3]), [float(x) for x in sys.argv[4:]]
frames = []
for t in times:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", video, "-frames:v", "1", "-vf", "scale=960:540",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    frames.append(np.frombuffer(raw, np.uint8).reshape(540, 960, 3))
while len(frames) % cols:
    frames.append(np.zeros_like(frames[0]))
rows = [np.hstack(frames[i:i + cols]) for i in range(0, len(frames), cols)]
sheet = np.ascontiguousarray(np.vstack(rows))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{sheet.shape[1]}x{sheet.shape[0]}",
                "-i", "-", out], input=sheet.tobytes(), check=True)
print(out)
