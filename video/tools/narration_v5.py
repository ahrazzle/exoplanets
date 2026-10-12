"""Record the count update of the ninth cut (main repo a00d883: 546 candidates, 50 of them from the weakest dips)
and speed it up like the rest (1.04x).

The last sentence of beat5c now says "fifty"; it is recorded together with the sentence before it, so it is spoken
as the end of its paragraph (beat5d; the mix uses only its second sentence). beat6c is recorded again with the new
total (beat6d). Each is recorded with the whole narration around it as previous_text/next_text, so it flows with
what is kept. Several takes of each are written (NAME_t1, NAME_t2, ...), to choose from.
usage: narration_v5.py [TAKES [CLIP...]]   (writes audio/vo/allison/CLIP_tN.mp3 and the allison_104 versions)
"""
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el
from narration import BEATS, VO, VOICES
from narration_v2 import speed_up
from narration_v3 import B3_KEPT, B5_KEPT, B6_KEPT, NEW as V3
from narration_v4 import B3_NOW

B5C = [s.strip() + "." for s in V3["beat5c"].split(".") if s.strip()]
LAST = B5C[-1].replace("fifty-one", "fifty")
NEW = {
    "beat5d": B5C[-2] + " " + LAST,
    "beat6d": "In the end, five hundred forty-six planet candidates survived all these filters.",
}
B5_NOW = " ".join(B5C[:-1] + [LAST])
ORDER = [BEATS[0], BEATS[1], B3_KEPT, B3_NOW, V3["beat4c"], B5_KEPT, B5_NOW, NEW["beat6d"], B6_KEPT, BEATS[6]]
FULL = " ".join(ORDER)


def record(job):
    name, take = job
    i = FULL.index(NEW[name])
    out = VO / "allison" / f"{name}_t{take}.mp3"
    el.tts(NEW[name], VOICES["allison"], out, model_id="eleven_v4",
           previous_text=FULL[:i].strip(), next_text=FULL[i + len(NEW[name]):].strip())
    speed_up(out)
    print("ok", out.name, flush=True)


if __name__ == "__main__":
    takes = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    names = sys.argv[2:] or list(NEW)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(record, [(n, k) for n in names for k in range(1, takes + 1)]))
