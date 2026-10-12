"""Record the two narration changes of the sixth cut and speed them up like the rest (1.04x).

Two sentences of beat3c are replaced, each by a one-sentence clip spliced in where it was: the first now says
whose method the search builds on, and the last says the dips "stand out from" the noise, since a dip does not
rise. Each is recorded with the whole narration around it as previous_text/next_text, so it flows with what is
kept. Several takes of each are written (NAME_t1, NAME_t2, ...), to choose from.
usage: narration_v4.py [TAKES [CLIP...]]   (writes audio/vo/allison/CLIP_tN.mp3 and the allison_104 versions)
"""
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el
from narration import BEATS, VO, VOICES
from narration_v2 import speed_up
from narration_v3 import B3_KEPT, B5_KEPT, B6_KEPT, NEW as V3

B3C = [s.strip() + "." for s in V3["beat3c"].split(".") if s.strip()]
NEW = {
    "beat3e": "Building on his method, we took every star like the Sun or smaller, and joined up to eight years of observations.",
    "beat3f": "When the guess is right, the dips line up and stand out from the noise.",
}
# the last sentence also recorded with the one before it, so it is spoken as the end of its paragraph; the mix
# uses only its second sentence
NEW["beat3g"] = B3C[-2] + " " + NEW["beat3f"]
# beat3c as it now reads, and the whole narration in order, for context
B3_NOW = " ".join([NEW["beat3e"]] + B3C[1:-1] + [NEW["beat3f"]])
ORDER = [BEATS[0], BEATS[1], B3_KEPT, B3_NOW, V3["beat4c"], B5_KEPT, V3["beat5c"], V3["beat6c"], B6_KEPT, BEATS[6]]
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
