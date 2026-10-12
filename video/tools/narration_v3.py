"""Record the narration rewrites of the third cut and speed them up like the rest (1.04x).

The third cut keeps the first sentence of beat 3, the first two of beat 5 and the last two of beat 6 from
the original takes, and replaces the rest of beats 3 to 6 with four new clips: the stacking search (beat3c),
the signals and the tests (beat4c), the flip (beat5c) and the result (beat6c). Each clip is recorded with
the narration around it as previous_text/next_text, so it flows with what is kept.
usage: narration_v3.py [CLIP...]   (writes audio/vo/allison/CLIP.mp3 and the allison_104 versions)
"""
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el
from narration import BEATS, VO, VOICES
from narration_v2 import TEMPO, speed_up

NEW = {
    "beat3c": ("We took every star like the Sun or smaller, and joined up to eight years of observations. "
               "One dip is too faint to see. But a planet's orbit always takes the same time, so its dips repeat at "
               "regular intervals. We don't know how long the orbit takes, so we try thousands of guesses. For each "
               "guess, we cut the data into pieces that long and stack them. When the guess is right, the dips line "
               "up and rise out of the noise."),
    "beat4c": ("Across four million stars, the search found seven and a half million of these repeating dips. "
               "Almost none are planets. Most are noise, or pairs of stars eclipsing each other. So every one had to "
               "pass seventeen statistical tests, each looking for a different warning sign, like a dip with the "
               "wrong shape. Then a pixel-level check: is the dip really on the star we expected, or on a neighbour?"),
    # fourth cut: 800,000 flipped stars, the false-alarm classifier (tier L1) and 543 candidates
    # (main repo 2cf0b11); the third cut's takes are in audio/vo/_old/v4
    "beat5c": ("But how often does noise fool it? To measure that, we need data with the same noise, but no "
               "planets. So we took eight hundred thousand stars and flipped their data upside down. That turns a "
               "planet's dip into a bump, which the search ignores. But noise wiggles both ways, so it still makes "
               "fake dips. Anything the search finds there is a false alarm. Counting them tells us how many of our "
               "candidates are likely false alarms, too. Almost half the weak dips were false alarms, so we left "
               "them out. We also used the fake dips to train a filter that recognizes false alarms. Even among the "
               "weakest dips, it found fifty-one that are probably real."),
    "beat6c": "In the end, five hundred forty-three planet candidates survived all these filters.",
}
B3_KEPT = ("This search was inspired by independent researcher Pavel Rabtsevich, who found two possible planets "
           "around a nearby star in TESS's newest data.")
B5_KEPT = "How do we know the filter works? It finds known planets without being told where they are."
B6_KEPT = ("More than half are between the size of Earth and Neptune: the most common kind of planet in the "
           "galaxy, and one our solar system doesn't have.")
# the whole third-cut narration in order, for context
ORDER = [BEATS[0], BEATS[1], B3_KEPT, NEW["beat3c"], NEW["beat4c"], B5_KEPT, NEW["beat5c"], NEW["beat6c"], B6_KEPT,
         BEATS[6]]


def record(name):
    i = ORDER.index(NEW[name])
    out = VO / "allison" / f"{name}.mp3"
    el.tts(NEW[name], VOICES["allison"], out, model_id="eleven_v4",
           previous_text=" ".join(ORDER[:i]), next_text=" ".join(ORDER[i + 1:]))
    speed_up(out)
    print("ok", name, flush=True)


if __name__ == "__main__":
    names = sys.argv[1:] or list(NEW)
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(record, names))
