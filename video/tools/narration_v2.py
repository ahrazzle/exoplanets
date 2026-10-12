"""Record the two narration additions of the second cut and speed them up like the rest (1.04x).

beat3b replaces the second sentence of beat 3 and beat5b the last sentence of beat 5; the sentences kept
from the original takes are cut out of them in mix.py. Each new clip is recorded with the surrounding
narration as previous_text/next_text, so it flows with what is kept.
usage: narration_v2.py   (writes audio/vo/allison/beat3b.mp3, beat5b.mp3 and their allison_104 versions)
"""
import json
import pathlib
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el
from narration import BEATS, VO, VOICES

TEMPO = 1.04
B3_KEPT = ("This search was inspired by independent researcher Pavel Rabtsevich, who found two possible planets "
           "around a nearby star in TESS's newest data.")
B5_KEPT = ("How do we know the filter works? It finds known planets without being told where they are. "
           "And we ran it on four hundred thousand stars with their data flipped upside down.")
NEW = {
    "beat3b": ("We took every star like the Sun or smaller, and joined up to eight years of observations. "
               "One dip is too faint to see, but a planet's dips repeat on a schedule. So we stacked each star's "
               "data at thousands of possible rhythms. At the right one, the dips pile up and rise out of the noise."),
    "beat5b": ("That turns a planet's dip into a bump, which the search ignores. But noise wiggles both ways, so it "
               "still makes fake dips. Anything found there is a false alarm, and counting them tells us how many "
               "slip through."),
}
CONTEXT = {
    "beat3b": (" ".join(BEATS[:2] + [B3_KEPT]), " ".join(BEATS[3:])),
    "beat5b": (" ".join(BEATS[:2] + [B3_KEPT, NEW["beat3b"], BEATS[3], B5_KEPT]), " ".join(BEATS[5:])),
}


def record(name):
    out = VO / "allison" / f"{name}.mp3"
    prev, nxt = CONTEXT[name]
    el.tts(NEW[name], VOICES["allison"], out, model_id="eleven_v4", previous_text=prev, next_text=nxt)
    speed_up(out)
    print("ok", name, flush=True)


def speed_up(out):
    """The same 1.04x speed-up as tools/stretch_vo.py, word timings scaled to match."""
    dst = VO / "allison_104" / out.name
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out), "-af", f"atempo={TEMPO}",
                    "-c:a", "libmp3lame", "-b:a", "192k", str(dst)], check=True)
    d = json.loads(out.with_suffix(".json").read_text())
    for key in ("alignment", "normalized_alignment"):
        if d.get(key):
            for field in ("character_start_times_seconds", "character_end_times_seconds"):
                d[key][field] = [x / TEMPO for x in d[key][field]]
    d["tempo"] = TEMPO
    d["source"] = f"audio/vo/allison/{out.name}"
    dst.with_suffix(".json").write_text(json.dumps(d))


if __name__ == "__main__":
    with ThreadPoolExecutor(2) as ex:
        list(ex.map(record, NEW))
