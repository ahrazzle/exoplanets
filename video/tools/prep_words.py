"""Word timings and caption chunks for the picture, from the narration alignment and timeline.json.

Writes src/data/words.json (every spoken word with absolute start/end seconds) and src/data/captions.json
(caption chunks: display text, start, end). The timeline places phrases cut from narration clips; each
character's time is its time in the clip, shifted to where its phrase was placed. Numbers are shown as
numerals.
usage: prep_words.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).parent.parent
timeline = json.load(open(ROOT / "timeline.json"))

# (spoken text, display text or None for the same), in order, per narration clip
CHUNKS = {
    "beat1": [("We searched four million stars", "We searched 4 million stars"),
              ("for planets hiding in NASA's public data.", None)],
    "beat2": [("Exoplanets, planets around other stars,", None),
              ("are lost in their stars' glare,", None),
              ("so we can almost never see them directly.", None),
              ("But when one passes in front of its star,", None),
              ("the star dims, very slightly.", None),
              ("Earth would dim the Sun", None),
              ("by less than one part in ten thousand.", "by less than 1 part in 10,000."),
              ("And only a few planets line up just right", None),
              ("for us to see this,", None),
              ("so you have to watch a lot of stars.", None),
              ("Since 2018, NASA's TESS satellite", None),
              ("has been doing just that.", None)],
    "beat3": [("This search was inspired by", None),
              ("independent researcher Pavel Rabtsevich,", None),
              ("who found two possible planets", None),
              ("around a nearby star in TESS's newest data.", None)],
    "beat3e": [("Building on his method,", None),
               ("we took every star like the Sun or smaller,", None),
               ("and joined up to eight years of observations.", "and joined up to 8 years of observations.")],
    "beat3c": [("One dip is too faint to see.", None),
               ("But a planet's orbit always takes the same time,", None),
               ("so its dips repeat at regular intervals.", None),
               ("We don't know how long the orbit takes,", None),
               ("so we try thousands of guesses.", None),
               ("For each guess, we cut the data", None),
               ("into pieces that long and stack them.", None)],
    "beat3g": [("When the guess is right,", None),
               ("the dips line up and stand out from the noise.", None)],
    "beat4c": [("Across four million stars,", "Across 4 million stars,"),
               ("the search found seven and a half million", "the search found 7.5 million"),
               ("of these repeating dips.", None),
               ("Almost none are planets.", None),
               ("Most are noise,", None),
               ("or pairs of stars eclipsing each other.", None),
               ("So every one had to pass", None),
               ("seventeen statistical tests,", "17 statistical tests,"),
               ("each looking for a different warning sign,", None),
               ("like a dip with the wrong shape.", None),
               ("Then a pixel-level check:", None),
               ("is the dip really on the star we expected,", None),
               ("or on a neighbour?", None)],
    "beat5": [("How do we know the filter works?", None),
              ("It finds known planets", None),
              ("without being told where they are.", None)],
    "beat5c": [("But how often does noise fool it?", None),
               ("To measure that, we need data", None),
               ("with the same noise, but no planets.", None),
               ("So we took eight hundred thousand stars", "So we took 800,000 stars"),
               ("and flipped their data upside down.", None),
               ("That turns a planet's dip into a bump,", None),
               ("which the search ignores.", None),
               ("But noise wiggles both ways,", None),
               ("so it still makes fake dips.", None),
               ("Anything the search finds there", None),
               ("is a false alarm.", None),
               ("Counting them tells us how many", None),
               ("of our candidates are likely false alarms, too.", None),
               ("Almost half the weak dips were false alarms,", None),
               ("so we left them out.", None),
               ("We also used the fake dips to train a filter", None),
               ("that recognizes false alarms.", None)],
    # ninth cut (546 candidates): beat5c's last sentence and beat6c recorded again with the new numbers
    "beat5d": [("Even among the weakest dips,", None),
               ("it found fifty that are probably real.", "it found 50 that are probably real.")],
    "beat6d": [("In the end, five hundred forty-six planet candidates", "In the end, 546 planet candidates"),
               ("survived all these filters.", None)],
    "beat6": [("More than half are between", None),
              ("the size of Earth and Neptune:", None),
              ("the most common kind of planet in the galaxy,", None),
              ("and one our solar system doesn't have.", None)],
    "beat7": [("They're candidates, not confirmed planets.", None),
              ("Now it's up to telescopes on the ground", None),
              ("to find out which ones are real.", None)],
}

clips = {}
placed = {}          # clip -> list of (first char, last char, shift seconds)
for p in timeline["phrases"]:
    d = clips.setdefault(p["clip"], json.load(open(ROOT / p["alignment"])))
    i = d["text"].index(p["text"])
    placed.setdefault(p["clip"], []).append((i, i + len(p["text"]) - 1, p["start"] - p["clip_start"]))


def abs_time(clip, char, field):
    a = clips[clip]["alignment"]
    for i0, i1, shift in placed[clip]:
        if i0 <= char <= i1:
            return round(a[field][char] + shift, 3)
    raise KeyError(f"{clip} char {char} is not in any placed phrase")


words, captions = [], []
for p in timeline["phrases"]:
    text = clips[p["clip"]]["text"]
    i0 = text.index(p["text"])
    for m in re.finditer(r"\S+", p["text"]):
        a, b = i0 + m.start(), i0 + m.end() - 1
        words.append({"w": m.group(), "s": abs_time(p["clip"], a, "character_start_times_seconds"),
                      "e": abs_time(p["clip"], b, "character_end_times_seconds"), "clip": p["clip"]})
covered = {}
for clip, chunks in CHUNKS.items():
    text = clips[clip]["text"]
    pos = 0
    for spoken, shown in chunks:
        i = text.index(spoken, pos)
        j = i + len(spoken) - 1
        pos = j + 1
        captions.append({"text": shown or spoken, "s": abs_time(clip, i, "character_start_times_seconds"),
                         "e": abs_time(clip, j, "character_end_times_seconds"), "clip": clip})
        covered.setdefault(clip, []).append((i, j))
# every placed phrase must be fully captioned
for clip, spans in placed.items():
    for i0, i1, _ in spans:
        chars = {c for c in range(i0, i1 + 1) if clips[clip]["text"][c] != " "}
        cov = {c for a, b in covered.get(clip, []) for c in range(a, b + 1)}
        assert chars <= cov, f"{clip}: uncaptioned text {clips[clip]['text'][i0:i1 + 1]!r}"

words.sort(key=lambda w: w["s"])
captions.sort(key=lambda c: c["s"])
(ROOT / "src" / "data").mkdir(parents=True, exist_ok=True)
json.dump(words, open(ROOT / "src" / "data" / "words.json", "w"))
json.dump(captions, open(ROOT / "src" / "data" / "captions.json", "w"), indent=0)
json.dump(timeline, open(ROOT / "src" / "data" / "timeline.json", "w"), indent=1)
for c in captions:
    print(f"{c['s']:7.2f} {c['e']:7.2f}  {c['text']}")
