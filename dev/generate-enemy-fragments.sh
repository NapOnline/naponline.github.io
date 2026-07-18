#!/usr/bin/env bash
# One-time asset generation: slices each enemy's canonical idle frame
# (enemy-<type>-1.png) into a 2x2 grid of fragment sprites used by the
# enemy death "shatter" effect (see entities.js's spawnEnemyFragments()).
# Mechanical crops of existing art, not new art — same convention as
# player-torso.png/player-legs.png (see AGENTS.md). Re-run only if the
# source enemy sprites change; outputs are committed as static assets.
set -euo pipefail

ASSETS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../javascripts/game/assets" && pwd)"
cd "${ASSETS_DIR}"

declare -A DIMS=(
    [bug]="16x22"
    [latency-spike]="17x22"
    [failed-pipeline]="29x22"
    [outage]="17x20"
    [ddos-bot]="18x22"
    [stack-overflow]="16x24"
)

for type in "${!DIMS[@]}"; do
    magick "enemy-${type}-1.png" -crop "${DIMS[$type]}" +repage +adjoin "enemy-${type}-fragment-%d.png"
    echo "Generated fragments for ${type}: ${DIMS[$type]}"
done
