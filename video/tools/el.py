"""Small ElevenLabs client: text-to-speech with timestamps, and music.

The key comes from $ELEVENLABS_API_KEY, or from the export line in ~/.zshrc.
"""
import base64
import json
import os
import pathlib
import re
import urllib.error
import urllib.request

API = "https://api.elevenlabs.io"


def api_key():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        return key
    zshrc = pathlib.Path.home() / ".zshrc"
    m = re.search(r"^export ELEVENLABS_API_KEY=(\S+)$", zshrc.read_text(), re.M)
    return m.group(1)


def post(path, body, timeout=600):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"xi-api-key": api_key(), "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {path}: {e.read().decode()[:500]}") from None


def tts(text, voice_id, out_mp3, model_id="eleven_v4", voice_settings=None, **extra):
    """Write the speech to out_mp3 and its character timings to out_mp3 + .json."""
    body = {"text": text, "model_id": model_id, **extra}
    if voice_settings:
        body["voice_settings"] = voice_settings
    data, _ = post(f"/v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_192", body)
    d = json.loads(data)
    out = pathlib.Path(out_mp3)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(base64.b64decode(d["audio_base64"]))
    out.with_suffix(".json").write_text(json.dumps(
        {"text": text, "voice_id": voice_id, "model_id": model_id,
         "alignment": d.get("alignment"), "normalized_alignment": d.get("normalized_alignment")}))
    return out


def music(out_mp3, model_id="music_v2_5", **body):
    """Write a generated track to out_mp3; pass prompt= or composition_plan=."""
    data, headers = post("/v1/music?output_format=mp3_48000_192", {"model_id": model_id, **body})
    out = pathlib.Path(out_mp3)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(data)
    song_id = headers.get("song-id") or headers.get("Song-Id")
    out.with_suffix(".json").write_text(json.dumps({"model_id": model_id, "song_id": song_id, **body}, indent=1))
    return out
