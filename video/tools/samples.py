"""Voice samples and music drafts for choosing a narrator and a music style."""
import concurrent.futures as cf
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el

OUT = pathlib.Path(__file__).parent.parent / "audio" / "samples"
TEXT = ("We searched four million stars for planets hiding in NASA's public data. "
        "Here's how, and what we found. When a planet passes in front of its star, "
        "the star dims, often by less than one percent, for a few hours.")
VOICES = {
    "george": "JBFqnCBsd6RMkjVDRZzb", "daniel": "onwK4e9ZLuTAKqWW03F9",
    "alice": "Xb7hH8MSUJpSbSDYk0k2", "brian": "nPczCjzI2devNBz1zQrb",
    "matilda": "XrExE9yKIg1WjnnlVkGX", "grant": "VC6vCXhVaI8BZefRtXZV",
    "oxley": "gOkFV1JMCt0G0n9xmBwV",
}
MUSIC = {
    "A_strings": "Contemporary post-classical minimalism for a science documentary. Chamber string orchestra. "
        "A bright, fast, pulsing solo violin ostinato in a major key with birdsong-like trills over sustained "
        "cello and viola. Repetitive minimalist patterns that add layers one by one, building momentum. Hopeful, "
        "luminous, a sense of wonder. Sparse opening, a full swell at about 70 seconds, then resolves to a quiet "
        "sustained chord at the end. Instrumental, mid-range kept clear for a narrator.",
    "B_electronic": "Ambient cinematic electronica for a space-science explainer. Soft analog synth arpeggio "
        "pulsing in a steady sixteenth-note pattern, warm evolving pads, glassy bell tones, subtle sub-bass, light "
        "processed strings. Curious and hopeful, slowly building, a bright lift at about 70 seconds, gentle fade at "
        "the end. Instrumental, no drum kit, sparse enough to sit under narration.",
    "C_piano": "Gentle felt piano and string quartet. A simple repeating piano motif in a major key, soft legato "
        "strings joining gradually, intimate and warm, a quiet sense of discovery. Builds to a warm full chord "
        "around 70 seconds, then a soft ending. Instrumental, minimal, leaves space for a narrator.",
}

if __name__ == "__main__":
    # The Creator plan allows 5 concurrent TTS and 2 concurrent music requests.
    jobs = {}
    with cf.ThreadPoolExecutor(2) as ex:
        for name, vid in VOICES.items():
            if not (OUT / f"voice_{name}.mp3").exists():
                jobs[ex.submit(el.tts, TEXT, vid, OUT / f"voice_{name}.mp3")] = name
        for name, prompt in MUSIC.items():
            if not (OUT / f"music_{name}.mp3").exists():
                jobs[ex.submit(el.music, OUT / f"music_{name}.mp3", prompt=prompt,
                               music_length_ms=90000, force_instrumental=True)] = name
        for f in cf.as_completed(jobs):
            try:
                print("ok  ", jobs[f], f.result().name, flush=True)
            except Exception as e:
                print("FAIL", jobs[f], e, flush=True)
