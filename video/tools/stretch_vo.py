"""Speed up (or slow down) a recorded narration without changing its pitch, keeping the word timings.

usage: stretch_vo.py SRC_VOICE DST_VOICE TEMPO   (e.g. allison allison_104 1.04)
"""
import json
import pathlib
import subprocess
import sys

VO = pathlib.Path(__file__).parent.parent / "audio" / "vo"
src, dst, tempo = VO / sys.argv[1], VO / sys.argv[2], float(sys.argv[3])
dst.mkdir(parents=True, exist_ok=True)
for mp3 in sorted(src.glob("beat*.mp3")):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af", f"atempo={tempo}",
                    "-c:a", "libmp3lame", "-b:a", "192k", str(dst / mp3.name)], check=True)
    d = json.loads(mp3.with_suffix(".json").read_text())
    for key in ("alignment", "normalized_alignment"):
        if d.get(key):
            for field in ("character_start_times_seconds", "character_end_times_seconds"):
                d[key][field] = [x / tempo for x in d[key][field]]
    d["tempo"] = tempo
    d["source"] = f"audio/vo/{src.name}/{mp3.name}"
    (dst / mp3.with_suffix(".json").name).write_text(json.dumps(d))
print(f"{src.name} -> {dst.name} at {tempo}x")
