"""Duration, speaking pace and short-term loudness over time for audio files.

usage: measure.py FILE... [--words N]   (--words gives words per minute for speech)
"""
import argparse
import re
import subprocess


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout)


def loudness(path, step=10):
    """Integrated loudness, and short-term loudness at the end of every `step` seconds."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    short = {}
    for t, s in re.findall(r"t:\s*([\d.]+).*?S:\s*(-?[\d.]+|-inf)", err):
        short[int(float(t) // step)] = s
    integrated = re.search(r"I:\s*(-?[\d.]+) LUFS", err.split("Summary:")[-1]).group(1)
    return float(integrated), [short[k] for k in sorted(short)]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--words", type=int)
    a = ap.parse_args()
    for f in a.files:
        d = duration(f)
        line = f"{f.split('/')[-1]:28s} {d:6.1f} s"
        if a.words:
            line += f"  {a.words * 60 / d:4.0f} wpm"
        i, s = loudness(f)
        line += f"  {i:6.1f} LUFS  by 10 s: {' '.join(x.split('.')[0] for x in s)}"
        print(line)
