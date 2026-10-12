#!/bin/sh
# Download the binaries the film needs, which are kept out of git, from the GitHub release, and unpack them in
# video/: the sky (public/data/sky.bin), the final mix (public/audio/mix.m4a and audio/mix/), and what the mix is
# built from (the narration clips in audio/vo/allison_104/ and the music in audio/).
# usage: tools/fetch_assets.sh [TAG]   (default explainer-v9)
set -e
cd "$(dirname "$0")/.."
TAG=${1:-explainer-v9}
curl -fL --progress-bar -o /tmp/video-assets.tar.gz \
  "https://github.com/eumemic/exoplanets/releases/download/$TAG/video-assets.tar.gz"
tar -xzf /tmp/video-assets.tar.gz
rm /tmp/video-assets.tar.gz
echo "unpacked the $TAG assets into $(pwd)"
