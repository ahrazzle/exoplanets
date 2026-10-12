"""Render stills of the film at given times (one bundle, several stills in parallel) and tile them.

usage: [COMP=Lab] stills.py OUT.png COLS T1 T2 ...   (times in seconds; stills go to out/stills/, the sheet to OUT.png)
"""
import pathlib
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

ROOT = pathlib.Path(__file__).parent.parent
FPS = 30
out, cols, times = sys.argv[1], int(sys.argv[2]), [float(x) for x in sys.argv[3:]]
bundle = pathlib.Path("/tmp/exo_bundle")
subprocess.run(["npx", "remotion", "bundle", "src/index.ts", "--out-dir", str(bundle)], cwd=ROOT, check=True,
               env={**__import__("os").environ, "REMOTION_FPS": str(FPS)}, capture_output=True)
(ROOT / "out" / "stills").mkdir(parents=True, exist_ok=True)


def still(t):
    png = ROOT / "out" / "stills" / f"t{t:07.2f}.png"
    subprocess.run(["npx", "remotion", "still", str(bundle), __import__("os").environ.get("COMP", "Film"), str(png), f"--frame={round(t * FPS)}", "--gl=angle"],
                   cwd=ROOT, check=True, capture_output=True, env={**__import__("os").environ, "REMOTION_FPS": str(FPS)})
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(png), "-vf", "scale=960:540", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(540, 960, 3)


with ThreadPoolExecutor(3) as ex:
    frames = list(ex.map(still, times))
while len(frames) % cols:
    frames.append(np.zeros_like(frames[0]))
sheet = np.ascontiguousarray(np.vstack([np.hstack(frames[i:i + cols]) for i in range(0, len(frames), cols)]))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{sheet.shape[1]}x{sheet.shape[0]}",
                "-i", "-", out], input=sheet.tobytes(), check=True)
print(out)
