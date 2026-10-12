"""Audio-only cut: narration placed on the timeline, the music edited to it and lowered under the voice.

Writes audio/mix/<name>.wav and .m4a (the mix), <name>_music_only.wav, and timeline.json, which
the picture is built to.
usage: mix.py NAME [--voice DIR] [--offset S] [--under LUFS] [--gap-lift DB] [--end-lift DB] [--dip DB]
"""
import argparse
import json
import pathlib
import subprocess

import numpy as np
import pyloudnorm
import soundfile as sf
from scipy import signal

ROOT = pathlib.Path(__file__).parent.parent
SR = 48000

MUSIC = ROOT / "audio" / "music_suno.wav"
# The music edit: stretches of the track (start, end in track seconds) played back to back, each join an
# equal-power crossfade ending on a bar line. The first start is --offset; the last stretch runs to the end.
SEGMENTS = [
    (None, 62.62),     # the intro and the first section, up to bar 20
    (26.96, 71.54),    # a 16-bar loop back to bar 4 (splice_search: as close a match as the jump below), on to bar 24
    (178.17, None),    # bar 72: skips the bright synth passage (158-174 s) and lands on the bass re-entry,
]                      # with the chords the original would play next
PULSE = (0, 18.04)            # (segment, track time) where the pulse enters after the ambient intro
SECTION = (2, 178.17)         # the section start that "four hundred ninety-two" lands 0.73 s after
FINAL_DOWNBEAT = (2, 209.51)  # the last downbeat before the ring-out
TAIL = 4.2                    # seconds after the final downbeat; the music fades over the last 2.5 s
FADE_IN = 1.5                 # seconds; the music rises from silence under the first line
END_SWELL = 2.0               # seconds; the music rises by --end-lift after the last line
FIRST_LINE = 1.0              # when the narration starts

VO_LUFS = -16.5               # narration loudness
MASTER_LUFS = -16.0


def decode(path, channels):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", str(channels),
                          "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, channels).copy()


def voiced_end(y, top_db=40):
    env = np.abs(y[:, 0])
    thresh = env.max() * 10 ** (-top_db / 20)
    return (np.nonzero(env > thresh)[0][-1] + 1) / SR


def word_time(beat_json, phrase):
    d = json.load(open(beat_json))
    return d["alignment"]["character_start_times_seconds"][d["text"].index(phrase)]


def layout(durs, result_at, v_section, v_final):
    """Beat start times: "four hundred ninety-two" lands on the section change, beats 1-6 are evenly
    spaced before it, and the last line ends about 1.8 s before the final downbeat."""
    b6 = v_section + 0.73 - result_at
    gap = (b6 - FIRST_LINE - sum(durs[:5])) / 5
    starts = [FIRST_LINE]
    for k in range(1, 5):
        starts.append(starts[k - 1] + durs[k - 1] + gap)
    gap7 = min(2.5, max(1.2, v_final - 1.8 - durs[6] - (b6 + durs[5])))
    starts += [b6, b6 + durs[5] + gap7]
    if gap < 0.9 or starts[6] + durs[6] > v_final - 0.5:
        print(f"warning: the narration does not fit (gap {gap:.2f} s, last line ends {starts[6] + durs[6]:.2f} s)")
    return [round(s, 3) for s in starts], gap, gap7


def ramp(env, t0, t1, g0, g1):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    env[i0:i1] = np.linspace(g0, g1, max(i1 - i0, 0))


def main(a):
    out_dir = ROOT / "audio" / "mix"
    out_dir.mkdir(parents=True, exist_ok=True)
    meter = pyloudnorm.Meter(SR)

    # Music: segment k starts at video time v0[k] and plays the track from segs[k][0].
    music = decode(MUSIC, 2)
    segs = [(a.offset if s is None else s, len(music) / SR if e is None else e) for s, e in SEGMENTS]
    v0 = np.cumsum([0.0] + [e - s for s, e in segs[:-1]])
    v_pulse, v_section, v_final = (v0[k] + m - segs[k][0] for k, m in (PULSE, SECTION, FINAL_DOWNBEAT))
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
    track *= 10 ** ((a.under - meter.integrated_loudness(track)) / 20)
    track *= np.sin(np.clip(t / FADE_IN, 0, 1) * np.pi / 2)[:, None] ** 2

    # Narration.
    vo_dir = ROOT / "audio" / "vo" / a.voice
    clips = [decode(vo_dir / f"beat{i}.mp3", 1) for i in range(1, 8)]
    durs = [voiced_end(y) for y in clips]
    starts, gap, gap7 = layout(durs, word_time(vo_dir / "beat6.json", "four hundred"), v_section, v_final)
    vo = np.zeros((n, 1), np.float32)
    beats = []
    for i, (start, y, dur) in enumerate(zip(starts, clips, durs), 1):
        s = int(start * SR)
        vo[s:s + len(y)] += y[: n - s]
        beats.append({"beat": i, "start": start, "end": round(start + dur, 3),
                      "alignment": f"audio/vo/{a.voice}/beat{i}.json"})
    vo *= 10 ** ((VO_LUFS - meter.integrated_loudness(vo)) / 20)

    # duck is 1 while the narrator speaks and 0 in pauses, with 0.3 s ramps in and 0.6 s ramps out;
    # pauses shorter than 1.2 s stay lowered. With --gap-lift 0 the music holds one level until the
    # last line, then swells by --end-lift over END_SWELL seconds.
    duck = np.zeros(n)
    for k, b in enumerate(beats):
        prev_end = beats[k - 1]["end"] if k else None
        if prev_end is not None and b["start"] - prev_end < 1.2:
            duck[int(prev_end * SR):int(b["start"] * SR)] = 1
        else:
            ramp(duck, b["start"] - 0.35, b["start"] - 0.05, 0, 1)
        duck[int((b["start"] - 0.05) * SR):int((b["end"] + 0.15) * SR)] = 1
        ramp(duck, b["end"] + 0.15, b["end"] + 0.75, 1, 0)
    gain_db = (1 - duck) * a.gap_lift
    last_end = beats[-1]["end"]
    gain_db[t >= last_end] = 0
    ramp(gain_db, last_end + 0.3, last_end + 0.3 + END_SWELL, 0, a.end_lift)
    gain_db[t >= last_end + 0.3 + END_SWELL] = a.end_lift
    gain = 10 ** (gain_db / 20)
    ramp(gain, length - 2.5, length, gain[int((length - 2.5) * SR)], 0.0)

    # The music dips by --dip in the 1.5-4 kHz speech band throughout, so it can stay loud without
    # covering the words. Zero-phase filtering keeps the two bands summing to the original.
    mid = signal.sosfiltfilt(signal.butter(2, [1500, 4000], "bandpass", fs=SR, output="sos"), track, axis=0)
    track = ((track - mid) + mid * 10 ** (-a.dip / 20)) * gain[:, None]

    mix = track + vo
    master_gain = 10 ** ((MASTER_LUFS - meter.integrated_loudness(mix)) / 20)
    sf.write(out_dir / f"{a.name}_premaster.wav", mix * master_gain, SR, subtype="FLOAT")
    sf.write(out_dir / f"{a.name}_music_only.wav", track * master_gain, SR, subtype="FLOAT")

    # Master: a peak limiter at -1.5 dBFS, then AAC for listening.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out_dir / f"{a.name}_premaster.wav"),
                    "-af", "alimiter=limit=0.84:attack=1:release=60:level=0", "-ar", str(SR),
                    "-c:a", "pcm_s24le", str(out_dir / f"{a.name}.wav")], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out_dir / f"{a.name}.wav"), "-c:a", "aac", "-b:a", "256k",
                    str(out_dir / f"{a.name}.m4a")], check=True)
    (out_dir / f"{a.name}_premaster.wav").unlink()

    json.dump({"length": round(length, 3), "music": {"file": "audio/music_suno.wav",
               "segments": [{"video_start": round(float(v), 3), "track_start": s, "track_end": round(e, 3)}
                            for v, (s, e) in zip(v0, segs)],
               "pulse_enters": round(v_pulse, 3), "section_change": round(v_section, 3),
               "final_downbeat": round(v_final, 3)},
               "voice": a.voice, "mix": {"music_under_lufs": a.under, "gap_lift_db": a.gap_lift,
                                         "end_lift_db": a.end_lift, "speech_band_dip_db": a.dip},
               "beats": beats}, open(ROOT / "timeline.json", "w"), indent=1)
    print(f"{a.name}: {a.voice}, length {length:.1f} s, speech {sum(durs):.1f} s, pauses {gap:.2f} s "
          f"(beats 1-6) and {gap7:.2f} s, music under voice {a.under} LUFS")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("--voice", default="allison_104", help="narration folder under audio/vo")
    ap.add_argument("--offset", type=float, default=9.35, help="seconds of the track's intro to skip")
    ap.add_argument("--under", type=float, default=-26.0, help="music loudness while the narrator speaks (LUFS)")
    ap.add_argument("--gap-lift", type=float, default=0.0, help="music lift between beats (dB)")
    ap.add_argument("--end-lift", type=float, default=7.0, help="music lift after the last line (dB)")
    ap.add_argument("--dip", type=float, default=3.0, help="extra 1.5-4 kHz dip in the music under the voice (dB)")
    main(ap.parse_args())
