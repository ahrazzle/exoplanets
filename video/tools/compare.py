"""Comparison clips for reviewing a change, each half under a label bar.

  stack: the current cut on top and the change below, in step, with the bottom's sound (a picture change)
  seq:   the current cut, then the change, one after the other, each with its own sound (a narration change)
  sound: a stretch of a video with another soundtrack in place of its own (a music change)
  sounds: the same stretch several times, each with a different soundtrack (music levels, say)

usage: compare.py stack OUT TOP_VIDEO TOP_T0 BOTTOM_VIDEO BOTTOM_T0 DUR TOP_LABEL BOTTOM_LABEL
       compare.py seq OUT A_VIDEO A_T0 A_DUR B_VIDEO B_T0 B_DUR A_LABEL B_LABEL
       compare.py sound OUT VIDEO AUDIO T0 DUR LABEL
       compare.py sounds OUT VIDEO T0 DUR LABEL AUDIO [LABEL AUDIO ...]
(times in seconds; run with the main repository's Python environment, for matplotlib)
"""
import pathlib
import subprocess
import sys
import tempfile
from fractions import Fraction

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties

FONT = FontProperties(fname="/System/Library/Fonts/Supplemental/Arial.ttf")
BAR = 60
TMP = pathlib.Path(tempfile.mkdtemp())


def bar(name, text, colour):
    path = TMP / f"{name}.png"
    fig = plt.figure(figsize=(19.2, BAR / 100), dpi=100, facecolor="#05080F")
    fig.text(0.0125, 0.5, text, color=colour, fontproperties=FONT, fontsize=21, va="center")
    fig.savefig(path, dpi=100, facecolor="#05080F")
    plt.close(fig)
    return path


def clip(video, t0, dur):
    """Input arguments for a stretch of a video, and a filter that brings it to 30 fps."""
    fps = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=r_frame_rate",
                          "-of", "csv=p=0", video], capture_output=True, text=True, check=True).stdout.strip()
    step = round(Fraction(fps) / 30)
    keep = f"select='not(mod(n,{step}))',setpts=N/30/TB," if step > 1 else ""
    return ["-ss", f"{t0:.4f}", "-t", f"{dur:.4f}", "-i", video], keep


def encode(args, graph, maps, out):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", graph, *maps, "-r", "30",
                    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)], check=True)


def labelled(video, t0, dur, label, colour, out, audio=None):
    """A stretch of a video under a label bar, with its sound, or the same stretch of another soundtrack."""
    a, keep = clip(video, t0, dur)
    b = ["-loop", "1", "-t", f"{dur:.4f}", "-i", str(bar(out.stem, label, colour))]
    s = ["-ss", f"{t0:.4f}", "-t", f"{dur:.4f}", "-i", audio] if audio else []
    encode(a + b + s, f"[0:v]{keep}setsar=1,format=yuv420p[v];[1:v]setsar=1,format=yuv420p[b];[b][v]vstack=inputs=2:shortest=1[o]",
           ["-map", "[o]", "-map", "2:a" if audio else "0:a"], out)


mode, out = sys.argv[1], pathlib.Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
if mode == "stack":
    top, t_top, bot, t_bot, dur, l_top, l_bot = sys.argv[3:10]
    dur = float(dur)
    a, keep_a = clip(top, float(t_top), dur)
    b, keep_b = clip(bot, float(t_bot), dur)
    bars = ["-loop", "1", "-t", f"{dur:.4f}", "-i", str(bar("top", l_top, "#E8EEF6")),
            "-loop", "1", "-t", f"{dur:.4f}", "-i", str(bar("bot", l_bot, "#5CE1E6"))]
    graph = (f"[0:v]{keep_a}setsar=1,format=yuv420p[v0];[1:v]{keep_b}setsar=1,format=yuv420p[v1];"
             "[2:v]setsar=1,format=yuv420p[b0];[3:v]setsar=1,format=yuv420p[b1];[b0][v0][b1][v1]vstack=inputs=4:shortest=1[o]")
    encode(a + b + bars, graph, ["-map", "[o]", "-map", "1:a"], out)
elif mode == "sound":
    video, audio, t0, dur, label = sys.argv[3:8]
    labelled(video, float(t0), float(dur), label, "#5CE1E6", out, audio)
elif mode == "sounds":
    video, t0, dur = sys.argv[3], float(sys.argv[4]), float(sys.argv[5])
    rest = sys.argv[6:]
    parts = []
    for k in range(0, len(rest), 2):
        part = TMP / f"part{k // 2}.mp4"
        labelled(video, t0, dur, rest[k], "#5CE1E6", part, rest[k + 1])
        parts.append(part)
    (TMP / "list.txt").write_text("".join(f"file '{p}'\n" for p in parts))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(TMP / "list.txt"), "-c", "copy",
                    "-movflags", "+faststart", str(out)], check=True)
elif mode == "seq":
    va, ta, da, vb, tb, db, la, lb = sys.argv[3:11]
    pa, pb = TMP / "before.mp4", TMP / "after.mp4"
    labelled(va, float(ta), float(da), la, "#E8EEF6", pa)
    labelled(vb, float(tb), float(db), lb, "#5CE1E6", pb)
    (TMP / "list.txt").write_text(f"file '{pa}'\nfile '{pb}'\n")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(TMP / "list.txt"), "-c", "copy",
                    "-movflags", "+faststart", str(out)], check=True)
print(out)
