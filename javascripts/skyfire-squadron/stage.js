// The "level" for this game: instead of one authored, fixed-length
// SPAWN_TIMELINE ending in a single boss (the previous design), Skyfire
// Squadron is endless — generateStageTimeline() procedurally builds a fresh
// { durationMs, timeline } for whatever stage number main.js asks for, and
// main.js just keeps asking for the next one as each stage's duration
// elapses (see resetStageState()/advanceStage() in main.js). Same entry
// shape as before — { tMs, type, x } — so main.js's single-pointer
// walk-forward consumer (see stage.js's old header comment) needed no
// changes.
//
// A small seeded PRNG (mulberry32) drives all of this, rather than Kaplay's
// own rand()/Math.random() — tests need a stage's generated layout to be
// reproducible (see dev/tests/skyfire-helpers.mjs's setSeed()), which an
// unseeded RNG can't give them. main.js creates one rng() per game session
// (reseeded on resetRound()) and threads it through every generateStageTimeline()
// call.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand(rng, min, max) {
  return min + rng() * (max - min);
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Enemy archetypes unlock progressively — one newly-available type every 2
// stages until all 8 are in the pool, so early stages stay simple and each
// unlock still feels distinct instead of every enemy showing up on stage 1.
// Keys match entities.js's ENEMY_CONFIGS.
export const ENEMY_UNLOCK_SCHEDULE = [
  { stage: 1, types: ["scout", "interceptor"] },
  { stage: 3, types: ["swarmer"] },
  { stage: 5, types: ["bulwark"] },
  { stage: 7, types: ["lancer"] },
  { stage: 9, types: ["gunship"] },
  { stage: 11, types: ["phantom"] },
  { stage: 13, types: ["dreadnought"] },
];

// Power-ups unlock one at a time too, one per stage, so a run keeps finding
// something new for a while rather than every effect being available at
// once. Keys match entities.js's POWERUP_CONFIGS.
export const POWERUP_UNLOCK_SCHEDULE = [
  { stage: 1, types: ["spread_shot", "rapid_fire"] },
  { stage: 2, types: ["shield_booster"] },
  { stage: 3, types: ["speed_booster"] },
  { stage: 4, types: ["smart_bomb_reload"] },
  { stage: 5, types: ["armor_plating"] },
  { stage: 6, types: ["score_multiplier"] },
  { stage: 7, types: ["invincibility"] },
  { stage: 8, types: ["time_dilation"] },
  { stage: 9, types: ["giga_laser"] },
];

function unlockedPool(schedule, stageNumber) {
  const pool = [];
  for (const entry of schedule) {
    if (entry.stage <= stageNumber) pool.push(...entry.types);
  }
  return pool;
}

export function unlockedEnemyTypes(stageNumber) {
  return unlockedPool(ENEMY_UNLOCK_SCHEDULE, stageNumber);
}

export function unlockedPowerupTypes(stageNumber) {
  return unlockedPool(POWERUP_UNLOCK_SCHEDULE, stageNumber);
}

const BASE_STAGE_DURATION_MS = 42000;
const BASE_SPAWN_COUNT = 10;
const MAX_SPAWN_COUNT = 34;
const MAX_DIFFICULTY_MULTIPLIER = 2.6;

// Speed/health multiplier applied to every enemy spawned this stage (see
// entities.js's createEnemy()) — grows with stage number, capped so endless
// play never becomes literally unwinnable at the tuning level.
export function difficultyMultiplier(stageNumber) {
  return Math.min(1 + (stageNumber - 1) * 0.06, MAX_DIFFICULTY_MULTIPLIER);
}

// One power-up roughly every 9-12s of stage duration.
const POWERUP_INTERVAL_SEC = [9, 12];

export function generateStageTimeline(stageNumber, rng) {
  const durationMs = BASE_STAGE_DURATION_MS;
  const enemyPool = unlockedEnemyTypes(stageNumber);
  const powerupPool = unlockedPowerupTypes(stageNumber);
  const spawnCount = Math.min(MAX_SPAWN_COUNT, Math.round(BASE_SPAWN_COUNT + stageNumber * 1.8));

  const timeline = [];

  // Enemy spawns: divide the stage into `spawnCount` even slots and jitter
  // within each one (rather than pure-random timing) so two spawns can
  // never land unfairly close together regardless of how unlucky the RNG
  // gets.
  const slotMs = durationMs / spawnCount;
  for (let i = 0; i < spawnCount; i++) {
    const tMs = Math.round(i * slotMs + rand(rng, slotMs * 0.15, slotMs * 0.75));
    const type = pick(rng, enemyPool);
    const x = rand(rng, 0.12, 0.88);
    timeline.push({ tMs, type, x });
  }

  // Power-up drops, independent cadence from enemy spawns.
  let tMs = rand(rng, 3000, 6000);
  while (tMs < durationMs - 2000) {
    timeline.push({ tMs: Math.round(tMs), type: "powerup", powerupType: pick(rng, powerupPool), x: rand(rng, 0.15, 0.85) });
    tMs += rand(rng, POWERUP_INTERVAL_SEC[0], POWERUP_INTERVAL_SEC[1]) * 1000;
  }

  timeline.sort((a, b) => a.tMs - b.tMs);
  return { durationMs, timeline };
}
