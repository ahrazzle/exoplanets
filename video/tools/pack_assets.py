"""Pack the binaries the film needs, which are kept out of git, for the GitHub release (tools/fetch_assets.sh
unpacks them): the sky, the final mix, and the narration clips and music the mix is built from. The music is
written without its metadata, and the archive records no owner, so neither carries anything about who made it.

Writes out/video-assets.tar.gz.
usage: pack_assets.py
"""
import io
import pathlib
import re
import subprocess
import tarfile
import tempfile

ROOT = pathlib.Path(__file__).parent.parent

# the clips tools/mix2.py places, by name
clips = sorted(set(re.findall(r'^\s+\("(beat[0-9a-z]+)", ', (ROOT / "tools" / "mix2.py").read_text(), re.M)))
mix = sorted((ROOT / "audio" / "mix").glob("cut_allison_v*.m4a"), key=lambda p: int(re.search(r"v(\d+)", p.stem)[1]))[-1]
files = ["public/data/sky.bin", "public/audio/mix.m4a", f"audio/mix/{mix.name}", "audio/music_suno_analysis.json"]
files += [f"audio/vo/allison_104/{c}.{ext}" for c in clips for ext in ("mp3", "json")]


def add(tar, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    info.mode = 0o644
    info.mtime = 0
    tar.addfile(info, io.BytesIO(data))


out = ROOT / "out" / "video-assets.tar.gz"
out.parent.mkdir(exist_ok=True)
with tarfile.open(out, "w:gz") as tar:
    for f in files:
        add(tar, f, (ROOT / f).read_bytes())
    with tempfile.TemporaryDirectory() as tmp:
        clean = pathlib.Path(tmp) / "music_suno.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "audio" / "music_suno.wav"), "-map_metadata", "-1",
                        "-fflags", "+bitexact", "-c", "copy", str(clean)], check=True)
        add(tar, "audio/music_suno.wav", clean.read_bytes())
print(f"{out}: {len(files) + 1} files, {out.stat().st_size / 1e6:.1f} MB, mix {mix.name}, clips {', '.join(clips)}")
