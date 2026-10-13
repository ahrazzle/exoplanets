#!/usr/bin/env bash
# Assemble the GitHub Pages artifact: the static site plus the data and images it reads.
# Used by .github/workflows/pages.yml and for local testing:
#   site/build.sh [output-dir]      (default: _site in the repository root)
#   python3 -m http.server -d _site 8000
# The multi-MB .csv.gz files are deliberately not copied; the site links to them on GitHub.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
case "$OUT" in
  ""|"/"|"$ROOT"|"$HOME") echo "refusing to use '$OUT' as the output directory" >&2; exit 1 ;;
esac

rm -rf "$OUT"
mkdir -p "$OUT/data" "$OUT/figures"

# Static pages, styles and scripts (everything in site/ except this script).
for f in "$ROOT"/site/*; do
  [ "$(basename "$f")" = "build.sh" ] && continue
  cp -R "$f" "$OUT/"
done

# Data the pages read at runtime (the CSV files themselves are the source of truth).
cp "$ROOT/results_public/candidates_allsky.csv"        "$OUT/data/"
cp "$ROOT/results_public/tiers_earlier_candidates.csv" "$OUT/data/"
cp "$ROOT/candidates/ephemerides.csv"                  "$OUT/data/"
cp "$ROOT/candidates/predictions.csv"                  "$OUT/data/"

# Images shown on the pages.
cp "$ROOT/figures/allsky.png" "$OUT/figures/"

# Index of candidate folders, so the table can link to each folder on GitHub when it exists.
list_dirs() {
  find "$1" -mindepth 1 -maxdepth 1 -type d -name 'TIC*' -exec basename {} \; | LC_ALL=C sort |
    awk 'BEGIN { printf "[" } { printf "%s\"%s\"", (NR > 1 ? "," : ""), $0 } END { printf "]" }'
}
printf '{"earlier":%s,"allsky":%s}\n' "$(list_dirs "$ROOT/candidates")" "$(list_dirs "$ROOT/candidates/allsky")" > "$OUT/data/folders.json"

# Build stamp shown in the page footer.
COMMIT="${GITHUB_SHA:-$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)}"
printf '{"commit":"%s","built":"%s"}\n' "$COMMIT" "$(date -u +%Y-%m-%d)" > "$OUT/data/build.json"

touch "$OUT/.nojekyll"
echo "Site assembled in $OUT"
