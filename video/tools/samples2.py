"""Round 2: George on three voice models, and bolder music drafts timed to the script's beats."""
import concurrent.futures as cf
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el
from samples import TEXT, VOICES

OUT = pathlib.Path(__file__).parent.parent / "audio" / "samples" / "round2"

# Beat lengths from SCRIPT.md (90 s); the final track is regenerated to the recorded narration.
BEATS = [
    ("Hook", 6000, "{a bold opening hit, the pulse starts at once, full energy from the first second}"),
    ("Transit", 14000, "{pull back a little, curious and light, the ostinato keeps running}"),
    ("Search", 12000, "{momentum builds, new layers enter one by one, forward motion}"),
    ("Funnel", 18000, "{driving and intense, rising tension, accelerating toward a peak}"),
    ("Test", 18000, "{suspense, low pulsing strings, darker harmony, building again at the end}"),
    ("Results", 12000, "{the climax, full ensemble, triumphant major key, a huge swell of awe}"),
    ("Outro", 10000, "{resolve onto a sustained major chord that rings out}"),
]

STYLES = {
    "D_driving_strings": ["post-classical minimalism", "full string orchestra", "fast sixteenth-note violin ostinato",
                          "driving cellos and basses", "132 BPM", "E major", "powerful dynamic build",
                          "luminous and urgent", "instrumental"],
    "E_cinematic_hybrid": ["epic cinematic score", "space documentary", "orchestra with pulsing synth arpeggios",
                           "big taiko and timpani hits at the climax", "soaring strings and brass", "120 BPM",
                           "sense of awe and discovery", "wide stereo, high production value", "instrumental"],
    "F_modern_science": ["energetic modern score for a science channel", "bright synth plucks and orchestral strings",
                         "punchy driving beat", "uplifting and curious", "128 BPM", "big uplifting drop at the climax",
                         "polished, high production value", "instrumental"],
}


def plan(styles):
    chunks = []
    for i, (name, ms, direction) in enumerate(BEATS):
        chunk = {"text": f"[{name}]\n{direction}", "duration_ms": ms,
                 "positive_styles": styles if i == 0 else styles[:3]}
        if i == 0:
            chunk["negative_styles"] = ["vocals", "singing", "choir", "lo-fi"]
        chunks.append(chunk)
    return {"chunks": chunks}


jobs = {}
with cf.ThreadPoolExecutor(2) as music_pool, cf.ThreadPoolExecutor(3) as tts_pool:
    for model in ("eleven_v3", "eleven_multilingual_v2"):
        out = OUT / f"voice_george_{model}.mp3"
        if not out.exists():
            jobs[tts_pool.submit(el.tts, TEXT, VOICES["george"], out, model_id=model)] = model
    for name, styles in STYLES.items():
        out = OUT / f"music_{name}.mp3"
        if not out.exists():
            jobs[music_pool.submit(el.music, out, composition_plan=plan(styles))] = name
    for f in cf.as_completed(jobs):
        try:
            print("ok  ", jobs[f], f.result().name, flush=True)
        except Exception as e:
            print("FAIL", jobs[f], e, flush=True)
