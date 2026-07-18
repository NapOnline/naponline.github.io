// Pure bonus computation logic — separated from DOM/audio side effects so it's
// testable and reusable independently of the game loop.

const REDUNDANCY_BONUS_PER_NODE = 100;
const NO_POWER_BONUS = 250;
const NO_HEAL_BONUS = 250;
const SPEED_BONUS_MAX = 1000;
const SPEED_BONUS_DECAY_PER_SEC = 8;
const SHOT_BONUS_MAX = 500;
const SHOT_DECAY_PER_SHOT = 15;
const SHOT_PENALTY_CAP = 300;
const PACIFIST_BONUS = 150;
const PERFECT_RUN_BONUS = 1000;

// Compute all end-of-run bonuses given the game state snapshot.
// Returns { total, lines, isPerfect } where lines is an array of
// { text, isPenalty } objects to render in the bonus breakdown.
export function computeEndOfRunBonuses({
  totalCollectibles,
  collectedCount,
  totalCash,
  collectedCash,
  totalMinShots,
  totalEnemies,
  defeatedEnemyCount,
  bulletKillCount,
  state,
  elapsedMs,
}) {
  let total = 0;
  const lines = [];

  const redundancyBonus = state.redundancy * REDUNDANCY_BONUS_PER_NODE;
  if (redundancyBonus > 0) {
    total += redundancyBonus;
    const nodeWord = state.redundancy === 1 ? "node" : "nodes";
    lines.push({
      text: `Redundancy bonus +${redundancyBonus}! (${state.redundancy} ${nodeWord} left)`,
      isPenalty: false,
    });
  }

  if (!state.usedPower) {
    total += NO_POWER_BONUS;
    lines.push({ text: `No Root Access needed +${NO_POWER_BONUS}!`, isPenalty: false });
  }

  if (!state.usedHeal) {
    total += NO_HEAL_BONUS;
    lines.push({ text: `Self-healing-free +${NO_HEAL_BONUS}!`, isPenalty: false });
  }

  const elapsedSeconds = elapsedMs / 1000;
  const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX - elapsedSeconds * SPEED_BONUS_DECAY_PER_SEC));
  if (speedBonus > 0) {
    total += speedBonus;
    lines.push({ text: `Speed bonus +${speedBonus}!`, isPenalty: false });
  }

  const overPar = state.shotsFired - totalMinShots;
  const rawShotBonus = overPar <= 0 ? SHOT_BONUS_MAX : Math.round(SHOT_BONUS_MAX - overPar * SHOT_DECAY_PER_SHOT);
  const shotBonus = Math.max(rawShotBonus, -SHOT_PENALTY_CAP);
  if (shotBonus !== 0) {
    total += shotBonus;
    const text =
      shotBonus > 0
        ? `Sharpshooter bonus +${shotBonus}! (${state.shotsFired} shots, par ${totalMinShots})`
        : `Trigger-happy penalty ${shotBonus}! (${state.shotsFired} shots, par ${totalMinShots})`;
    lines.push({ text, isPenalty: shotBonus < 0 });
  }

  if (state.shotsFired === 0) {
    total += PACIFIST_BONUS;
    lines.push({ text: `Pacifist bonus +${PACIFIST_BONUS}! Not a single shot fired.`, isPenalty: false });
  }

  const isPerfect =
    defeatedEnemyCount >= totalEnemies &&
    collectedCash >= totalCash &&
    !state.tookDamage &&
    !state.usedPower;
  if (isPerfect) {
    total += PERFECT_RUN_BONUS;
    lines.push({ text: `Perfect Run bonus +${PERFECT_RUN_BONUS}!`, isPenalty: false });
  }

  if (totalCollectibles > 0 && collectedCount >= totalCollectibles) {
    total += 300;
    lines.push({ text: "Full Deploy bonus +300!", isPenalty: false });
  }

  return { total, lines, isPerfect };
}
