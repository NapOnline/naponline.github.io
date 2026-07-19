// The "level" for this game: a time-indexed enemy spawn schedule, playing
// the same role level.js's hand-authored ASCII tile map plays for the
// platformer — except this genre's natural fit is a continuous timeline of
// spawns rather than a static grid (see main.js's top-of-file comment on why
// this game deliberately never calls addLevel()).
//
// Each entry is { tMs, type, x } — tMs is elapsed stage time in ms, type is
// an ENEMY_CONFIGS key (or "powerup"), x is a 0-1 fraction of the viewport
// width the spawn is centered on. main.js consumes this by walking a single
// pointer forward through the (already time-sorted) array as elapsedMs
// advances — never re-scanning from the start — so it stays cheap
// regardless of stage length.
//
// Built with small helpers rather than one giant hand-typed literal, same
// spirit as level.js's "generated with a small script to guarantee
// alignment" note — a wave of N evenly-spaced drones is much easier to get
// right (and to retune) as `droneWave(t, count)` than as N separate lines.
function droneWave(tMs, count, spreadStart = 0.15, spreadEnd = 0.85) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0.5 : spreadStart + ((spreadEnd - spreadStart) * i) / (count - 1);
    entries.push({ tMs: tMs + i * 220, type: "drone", x });
  }
  return entries;
}

function fighterPair(tMs) {
  return [
    { tMs, type: "fighter", x: 0.25 },
    { tMs: tMs + 300, type: "fighter", x: 0.75 },
  ];
}

export const STAGE_DURATION_MS = 60000;

export const SPAWN_TIMELINE = [
  ...droneWave(1000, 4),
  { tMs: 4000, type: "powerup", x: 0.5 },
  ...droneWave(6000, 5),
  ...fighterPair(10000),
  ...droneWave(13000, 3, 0.2, 0.5),
  { tMs: 15000, type: "gunship", x: 0.5 },
  ...fighterPair(18500),
  ...droneWave(21000, 5),
  { tMs: 24000, type: "powerup", x: 0.3 },
  { tMs: 26000, type: "gunship", x: 0.25 },
  { tMs: 26500, type: "gunship", x: 0.75 },
  ...fighterPair(30000),
  ...droneWave(33000, 6),
  ...fighterPair(36500),
  { tMs: 39000, type: "gunship", x: 0.5 },
  { tMs: 41000, type: "powerup", x: 0.7 },
  ...droneWave(43000, 5, 0.1, 0.9),
  ...fighterPair(46500),
  { tMs: 49000, type: "gunship", x: 0.35 },
  { tMs: 49500, type: "gunship", x: 0.65 },
  ...droneWave(52000, 6, 0.1, 0.9),
  ...fighterPair(55000),
  { tMs: 57000, type: "powerup", x: 0.5 },
].sort((a, b) => a.tMs - b.tMs);

// Boss health and its two attack phases — phase 2 kicks in once health
// drops to hpThreshold or below (fractions of BOSS_CONFIG.hp). Faster/aimed
// fire in phase 2 mirrors the platformer's outage-turret telegraph
// convention (a brief warning tint before each volley — see main.js).
export const BOSS_CONFIG = {
  hp: 60,
  scoreValue: 1000,
  phases: [
    {
      hpThreshold: 1, // full health down to 50%
      shootIntervalSec: 1.8,
      telegraphSec: 0.4,
      pattern: "spread",
      bulletSpeed: 160,
    },
    {
      hpThreshold: 0.5, // 50% health down to 0
      shootIntervalSec: 1.0,
      telegraphSec: 0.25,
      pattern: "aimed",
      bulletSpeed: 220,
    },
  ],
};
