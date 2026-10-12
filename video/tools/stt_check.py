"""Transcribe every phrase mix2.py cuts out of the narration (ElevenLabs speech-to-text) and compare it with
the text the phrase should hold, so a cut that clips a word, or keeps part of the next sentence, shows up.
usage: stt_check.py
"""
import io
import json
import pathlib
import re
import sys
import urllib.request
import uuid

import soundfile as sf

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import el
from mix import SR
from mix2 import AFTER, BEFORE, phrases


def transcribe(audio):
    buf = io.BytesIO()
    sf.write(buf, audio, SR, format="WAV", subtype="PCM_16")
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\nscribe_v1\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"p.wav\"\r\n"
            f"Content-Type: audio/wav\r\n\r\n").encode() + buf.getvalue() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(el.API + "/v1/speech-to-text", data=body,
                                 headers={"xi-api-key": el.api_key(), "Content-Type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["text"]


def norm(s):
    s = s.lower().replace("neighbor", "neighbour").replace("-", " ")
    return re.sub(r"[^a-z0-9' ]", "", s).split()


if __name__ == "__main__":
    bad = 0
    for p in phrases(BEFORE + AFTER):
        heard = transcribe(p["audio"])
        ok = norm(heard) == norm(p["text"])
        bad += not ok
        print(("ok   " if ok else "DIFF ") + p["clip"], repr(heard) if not ok else "")
        if not ok:
            print("     expected", repr(p["text"]))
    print(f"{bad} phrases differ")
