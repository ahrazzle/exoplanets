"""Second and third cuts of the audio: the narration placed phrase by phrase, with pauses where the visuals
need time, and the music edit extended to fit. Same levels and processing as mix.py (the approved v6 mix).

Phrases are cut from the narration clips at sentence boundaries, in the middle of the pause the audio has
there; the clips' character timings can be off by more than half a second, so the pause is found in the
audio rather than taken from the timings. "four hundred ninety-two" lands 0.73 s after the bass re-entry,
and the last line ends before the final downbeat. Writes audio/mix/NAME.wav, NAME.m4a, NAME_music_only.wav
and timeline.json. The second cut (v7) used the phrases and segments in audio/mix/timeline_v7.json.
usage: mix2.py NAME [ARRANGEMENT [MUSIC_DB]]   (one of ARRANGEMENTS, default full; MUSIC_DB raises the music
under the voice by that many dB, default 0)
"""
import json
import pathlib
import re
import subprocess
import sys

import numpy as np
import pyloudnorm
import soundfile as sf
from scipy import signal

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from mix import (END_SWELL, FADE_IN, FIRST_LINE, MASTER_LUFS, MUSIC, ROOT, SR, TAIL, VO_LUFS, decode, ramp)

VOICE = "allison_104"
UNDER, END_LIFT, DIP = -22.0, 7.0, 3.0      # the music 4 dB up on v6-v7, as the user chose for v8
# Arrangements of the track: stretches (start, end in track seconds) played back to back, each join an
# equal-power crossfade ending on a bar line (loop points from tools/loop_search.py, with their distances).
# Landmarks in the track: the pulse enters at 18.04, the bass comes back in at 178.17 (bar 1 of the final
# section, which "five hundred forty-three" lands on), and the final chord is at 209.51 (bar 15).
ARRANGEMENTS = {
    # the sixth cut's: the first 72 s of the track looped over and over, the next 106 s skipped, and bars 5 and 6
    # of the final section each played twice (heard as a stutter)
    "loops": [(9.35, 62.62), (26.96, 62.62), (26.96, 69.33), (51.48, 67.08), (49.25, 71.54), (53.71, 71.54),
              (178.17, 189.29), (187.06, 191.52), (189.29, None)],
    # the whole track in order, but for one 8-bar repeat early on (0.97), so the bass comes back in under "543";
    # it starts where the bass re-entry then falls at 187.02 s, as in the sixth cut
    "full": [(8.98, 67.08), (49.25, None)],
}
ARRANGEMENT = sys.argv[2] if len(sys.argv) > 2 else "full"
MUSIC_DB = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
SEGMENTS = ARRANGEMENTS[ARRANGEMENT]
PULSE, SECTION, FINAL_DOWNBEAT = 18.04, 178.17, 209.51

# (clip, first sentence, last sentence, pause after in seconds before fitting). Pauses marked fixed are kept
# as they are; the others are scaled together so the phrases fit the music.
BEFORE = [
    ("beat1", 0, 0, 1.5, True),
    ("beat2", 0, -1, 1.5, True),
    ("beat3", 0, 0, 1.6, False),     # Rabtsevich: his star and its two possible planets
    ("beat3e", 0, 0, 1.0, False),    # building on his method: joining the sectors (sixth cut)
    ("beat3c", 1, 1, 0.8, False),    # one dip, zoomed
    ("beat3c", 2, 2, 1.0, False),    # the crossings at regular intervals
    ("beat3c", 3, 4, 1.4, False),    # the guesses: cut and stack
    ("beat3g", 1, 1, 2.0, False),    # the dips line up and stand out from the noise (sixth cut)
    ("beat4c", 0, 0, 0.6, False),    # 7.5 million repeating dips
    ("beat4c", 1, 2, 1.0, False),    # noise and eclipsing stars
    ("beat4c", 3, 3, 1.8, False),    # the 17 tests
    ("beat4c", 4, 5, 1.8, False),    # the pixel check
    ("beat5", 0, 0, 0.8, False),     # how do we know the filter works? (a pause, so what follows is the answer)
    ("beat5", 1, 1, 1.2, False),     # known planets
    ("beat5c", 0, 1, 0.8, False),    # how often does noise fool it?
    ("beat5c", 2, 2, 0.8, False),    # the flip
    ("beat5c", 3, 3, 0.6, False),    # dips become bumps
    ("beat5c", 4, 4, 0.8, False),    # noise's fake dips
    ("beat5c", 5, 5, 0.8, False),    # a real false alarm
    ("beat5c", 6, 6, 0.8, False),    # the measured rates
    ("beat5c", 7, 7, 1.0, False),    # weak dips left out
    ("beat5c", 8, 8, 0.8, False),    # a filter trained on the fake dips
    ("beat5d", 1, 1, 1.4, False),    # 50 of the weakest dips (ninth cut: 546 candidates, main repo a00d883)
]
AFTER = [
    ("beat6d", 0, 0, 1.5, False),    # 546 candidates light up (ninth cut)
    ("beat6", 2, 2, 0.6, False),
    ("beat6", 3, 3, 2.2, False),
    ("beat7", 0, 0, 1.4, False),     # the question marks
    ("beat7", 2, 2, 0.0, False),     # telescopes on the ground (the line about public data, between, is cut)
]
RESULT_PHRASE = "five hundred"
LAST_LINE_BEFORE_DOWNBEAT = 1.8


def sentences(text):
    """(first char, last char) of each sentence; a colon ends a sentence, as in the captions."""
    out = []
    for m in re.finditer(r"[^.?!:]+[.?!:]", text):
        i = m.start()
        while text[i] == " ":
            i += 1
        out.append((i, m.end() - 1))
    return out


def pause_between(y, t_end, t_next, clip):
    """The middle of the pause between two sentences, which the timings put between t_end and t_next: of the
    silences (42 dB under the clip's loudest 10 ms) at least 0.15 s long within 0.9 s of there, the longest,
    less half its distance from the timings' boundary."""
    hop = SR // 100
    rms = np.sqrt(np.convolve(y.astype(float) ** 2, np.ones(hop) / hop, mode="same")[::hop])
    quiet = 20 * np.log10(rms / rms.max() + 1e-9) < -42
    mid = (t_end + t_next) / 2
    k0, k1 = max(0, int((min(t_end, t_next) - 0.9) * 100)), min(len(quiet), int((max(t_end, t_next) + 0.9) * 100))
    best, k = None, k0
    while k < k1:
        if not quiet[k]:
            k += 1
            continue
        j = k
        while j < len(quiet) and quiet[j]:
            j += 1
        a, b = k / 100, j / 100
        if b - a >= 0.15:
            score = (b - a) - 0.5 * abs((a + b) / 2 - mid)
            if best is None or score > best[0]:
                best = (score, a, b)
        k = j
    if best is None:
        raise SystemExit(f"{clip}: no pause near {mid:.2f} s")
    if abs((best[1] + best[2]) / 2 - mid) > 0.3:
        print(f"note: {clip} pause at {best[1]:.2f}-{best[2]:.2f} s, timings say {mid:.2f} s")
    return (best[1] + best[2]) / 2


def phrases(spec):
    """Cut each phrase out of its clip in the pauses between sentences."""
    out = []
    cache = {}
    for clip, s0, s1, pause, fixed in spec:
        if clip not in cache:
            y = decode(ROOT / "audio" / "vo" / VOICE / f"{clip}.mp3", 1)[:, 0]
            d = json.load(open(ROOT / "audio" / "vo" / VOICE / f"{clip}.json"))
            cache[clip] = (y, d)
        y, d = cache[clip]
        a = d["alignment"]
        st, en = a["character_start_times_seconds"], a["character_end_times_seconds"]
        sen = sentences(d["text"])
        s1 = len(sen) - 1 if s1 < 0 else s1

        c0 = 0.0 if s0 == 0 else pause_between(y, en[sen[s0 - 1][1]], st[sen[s0][0]], clip)
        c1 = len(y) / SR if s1 == len(sen) - 1 else pause_between(y, en[sen[s1][1]], st[sen[s1 + 1][0]], clip)
        seg = y[int(c0 * SR):int(c1 * SR)].copy()
        # trim trailing silence so pauses are measured from the end of the voice
        env = np.abs(seg)
        loud = np.nonzero(env > env.max() * 10 ** (-40 / 20))[0]
        voiced = (loud[-1] + 1) / SR if len(loud) else len(seg) / SR
        fade = int(0.008 * SR)
        if s0 > 0:
            seg[:fade] *= np.linspace(0, 1, fade)
        if s1 < len(sen) - 1:
            seg[-fade:] *= np.linspace(1, 0, fade)
        text = d["text"][sen[s0][0]:sen[s1][1] + 1]
        out.append({"clip": clip, "audio": seg, "clip_start": c0, "voiced": voiced, "pause": pause, "fixed": fixed,
                    "text": text, "alignment": f"audio/vo/{VOICE}/{clip}.json",
                    "result_at": (st[d["text"].index(RESULT_PHRASE)] - c0) if RESULT_PHRASE in text else None})
    return out


def fit(ph, t0, t_end):
    """Start times so that the phrases fill [t0, t_end]: the last pause ends at t_end."""
    speech = sum(p["voiced"] for p in ph)
    fixed = sum(p["pause"] for p in ph if p["fixed"])
    flex = sum(p["pause"] for p in ph if not p["fixed"])
    k = (t_end - t0 - speech - fixed) / flex
    if k < 0.6:
        print(f"warning: pauses squeezed to {k:.2f} of plan")
    t = t0
    for p in ph:
        p["start"] = round(t, 3)
        p["pause_fitted"] = p["pause"] * (1 if p["fixed"] else k)
        t += p["voiced"] + p["pause_fitted"]
    return k


def main(name):
    out_dir = ROOT / "audio" / "mix"
    meter = pyloudnorm.Meter(SR)
    music = decode(MUSIC, 2)
    segs = [(s, len(music) / SR if e is None else e) for s, e in SEGMENTS]
    v0 = np.cumsum([0.0] + [e - s for s, e in segs[:-1]])
    def at(track_t, last=False):
        """Where a moment of the track falls in the video (its first time, or its last)."""
        hits = [v0[k] + track_t - s for k, (s, e) in enumerate(segs) if s <= track_t < e]
        return hits[-1] if last else hits[0]
    v_pulse, v_section, v_final = at(PULSE), at(SECTION), at(FINAL_DOWNBEAT, last=True)
    length = v_final + TAIL
    n = int(length * SR)
    t = np.arange(n) / SR
    xf = 0.25
    track = np.zeros((n, 2), np.float32)
    for k, (start, _) in enumerate(segs):
        w = np.ones(n)
        if k > 0:
            w *= np.sin(np.clip((t - (v0[k] - xf)) / xf, 0, 1) * np.pi / 2)
        if k < len(segs) - 1:
            w *= np.cos(np.clip((t - (v0[k + 1] - xf)) / xf, 0, 1) * np.pi / 2)
        live = w > 0
        idx = np.clip(((t[live] - v0[k] + start) * SR).astype(int), 0, len(music) - 1)
        track[live] += music[idx] * w[live, None]
    track *= 10 ** ((UNDER + MUSIC_DB - meter.integrated_loudness(track)) / 20)
    track *= np.sin(np.clip(t / FADE_IN, 0, 1) * np.pi / 2)[:, None] ** 2

    before, after = phrases(BEFORE), phrases(AFTER)
    b6 = v_section + 0.73 - after[0]["result_at"]
    k1 = fit(before, FIRST_LINE, b6)
    after_speech = sum(p["voiced"] for p in after)
    k2 = fit(after, b6, v_final - LAST_LINE_BEFORE_DOWNBEAT)
    vo = np.zeros((n, 1), np.float32)
    for p in before + after:
        s = int(p["start"] * SR)
        a = p["audio"][: n - s]
        vo[s:s + len(a), 0] += a
    vo *= 10 ** ((VO_LUFS - meter.integrated_loudness(vo)) / 20)

    last_end = after[-1]["start"] + after[-1]["voiced"]
    gain_db = np.zeros(n)
    ramp(gain_db, last_end + 0.3, last_end + 0.3 + END_SWELL, 0, END_LIFT)
    gain_db[t >= last_end + 0.3 + END_SWELL] = END_LIFT
    gain = 10 ** (gain_db / 20)
    ramp(gain, length - 2.5, length, gain[int((length - 2.5) * SR)], 0.0)
    mid = signal.sosfiltfilt(signal.butter(2, [1500, 4000], "bandpass", fs=SR, output="sos"), track, axis=0)
    track = ((track - mid) + mid * 10 ** (-DIP / 20)) * gain[:, None]

    mix = track + vo
    master_gain = 10 ** ((MASTER_LUFS - meter.integrated_loudness(mix)) / 20)
    sf.write(out_dir / f"{name}_premaster.wav", mix * master_gain, SR, subtype="FLOAT")
    sf.write(out_dir / f"{name}_music_only.wav", track * master_gain, SR, subtype="FLOAT")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out_dir / f"{name}_premaster.wav"),
                    "-af", "alimiter=limit=0.84:attack=1:release=60:level=0", "-ar", str(SR),
                    "-c:a", "pcm_s24le", str(out_dir / f"{name}.wav")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out_dir / f"{name}.wav"), "-c:a", "aac", "-b:a", "256k",
                    str(out_dir / f"{name}.m4a")], check=True)
    (out_dir / f"{name}_premaster.wav").unlink()

    json.dump({"length": round(length, 3), "music": {"file": "audio/music_suno.wav",
               "segments": [{"video_start": round(float(v), 3), "track_start": s, "track_end": round(e, 3)}
                            for v, (s, e) in zip(v0, segs)],
               "pulse_enters": round(v_pulse, 3), "section_change": round(v_section, 3),
               "final_downbeat": round(v_final, 3)},
               "voice": VOICE, "mix": {"music_under_lufs": UNDER + MUSIC_DB, "end_lift_db": END_LIFT, "speech_band_dip_db": DIP},
               "phrases": [{"clip": p["clip"], "alignment": p["alignment"], "clip_start": round(p["clip_start"], 3),
                            "start": p["start"], "end": round(p["start"] + p["voiced"], 3), "text": p["text"]}
                           for p in before + after]},
              open(ROOT / "timeline.json", "w"), indent=1)
    print(f"{name}: length {length:.1f} s, section change {v_section:.2f} s, final downbeat {v_final:.2f} s; "
          f"pauses scaled x{k1:.2f} before the result and x{k2:.2f} after; speech after {after_speech:.1f} s")
    for p in before + after:
        print(f"  {p['start']:7.2f}-{p['start'] + p['voiced']:7.2f} (+{p['pause_fitted']:.2f})  {p['text'][:70]}")


if __name__ == "__main__":
    main(sys.argv[1])
