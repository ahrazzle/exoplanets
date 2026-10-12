"""Record the narration beat by beat on eleven_v4.

Each beat is generated with its neighbours as previous_text/next_text so the delivery
flows across beats; the beats are placed on the timeline separately, which leaves the
pauses between them free to be timed to the music and the visuals.
usage: narration.py VOICE [BEAT...]   (writes audio/vo/VOICE/beatN.mp3; BEATs are 1-based beats to redo)
"""
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el

VOICES = {
    "george": "JBFqnCBsd6RMkjVDRZzb",    # British, warm storyteller (premade)
    "alice": "Xb7hH8MSUJpSbSDYk0k2",     # British, clear educator (premade)
    "matilda": "XrExE9yKIg1WjnnlVkGX",   # American, professional (premade)
    "lily": "pFZP5JQG7iQjIQuC4Bku",      # British, velvety (premade)
    "allison": "Se2Vw1WbHmGbBbyWTuu4",   # British, velvety (voice library)
    "annie": "XW70ikSsadUbinwLMZ5w",     # American, grounded narrator (voice library)
    "victoria": "qSeXEcewz7tA0Q0qk9fH",  # American, explainer voice-over (voice library)
}
VO = pathlib.Path(__file__).parent.parent / "audio" / "vo"

# Spoken text; numbers are spelled the way they should be read.
BEATS = [
    "We searched four million stars for planets hiding in NASA's public data.",
    "Exoplanets, planets around other stars, are lost in their stars' glare, so we can almost never see them directly. "
    "But when one passes in front of its star, the star dims, very slightly. Earth would dim the Sun by less than "
    "one part in ten thousand. And only a few planets line up just right for us to see this, so you have to watch "
    "a lot of stars. Since 2018, NASA's TESS satellite has been doing just that.",
    "This search was inspired by independent researcher Pavel Rabtsevich, who found two possible planets "
    "around a nearby star in TESS's newest data. We took every star like the Sun or smaller, joined up to eight "
    "years of observations, and checked each one for dips that repeat on a regular schedule.",
    "That turned up seven and a half million signals, almost all of them noise, or pairs of stars "
    "eclipsing each other. So every signal had to pass seventeen statistical tests, then a pixel-level check: "
    "is the dip really on our star, or on a neighbour?",
    "How do we know the filter works? It finds known planets without being told where they are. "
    "And we ran it on four hundred thousand stars with their data flipped upside down. Planets only ever make "
    "a star dimmer, so anything it finds there is a false alarm, and that tells us how many slip through.",
    "The result: four hundred ninety-two planet candidates. More than half are between the size of Earth and "
    "Neptune: the most common kind of planet in the galaxy, and one our solar system doesn't have.",
    "They're candidates, not confirmed planets. Everything here came from public data, and our code and every "
    "candidate are online. Now it's up to telescopes on the ground to find out which ones are real.",
]


def record(voice, only=()):
    for i, text in enumerate(BEATS, 1):
        out = VO / voice / f"beat{i}.mp3"
        if (only and i not in only) or (not only and out.exists()):
            continue
        el.tts(text, VOICES[voice], out, model_id="eleven_v4",
               previous_text=" ".join(BEATS[:i - 1]) or None,
               next_text=" ".join(BEATS[i:]) or None)
        print("ok", voice, out.name, flush=True)


if __name__ == "__main__":
    voices = sys.argv[1].split(",")  # several voices are recorded in parallel
    only = {int(a) for a in sys.argv[2:]}
    with ThreadPoolExecutor(4) as ex:  # the Creator plan allows 5 concurrent requests
        list(ex.map(lambda v: record(v, only), voices))
