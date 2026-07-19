#!/usr/bin/env bash
# One-time asset generation: slices each destructible ship sprite (the three
# enemy types plus the boss) into a 2x2 grid of fragment sprites used by the
# death "shatter" effect (see entities.js's spawnShipFragments()). Mechanical
# crops of existing art, not new art — same convention as the platformer's
# dev/generate-enemy-fragments.sh. Source sprites have odd pixel dimensions,
# so -crop 50%x50% (rather than fixed pixel sizes) is used to split each into
# four near-equal tiles; the 1px width/height variance between tiles is
# masked at runtime by explicit sprite() width/height on each fragment (see
# spawnShipFragments()). Re-run only if the source ship sprites change;
# outputs are committed as static assets.
set -euo pipefail

ASSETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../javascripts/skyfire-squadron/assets" && pwd)"
cd "${ASSETS_DIR}"

for base in enemy-drone enemy-fighter enemy-gunship boss; do
    magick "${base}.png" -crop 50%x50% +repage +adjoin "${base}-fragment-%d.png"
    echo "Generated fragments for ${base}"
done
