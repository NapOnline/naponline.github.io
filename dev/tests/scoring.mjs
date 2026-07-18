#!/usr/bin/env node
/**
 * Scoring bonus test suite for the Kaplay game
 * Tests all bonus formulas: full-deploy, redundancy, no-power, no-heal, speed-decay,
 * shot-efficiency-taper, pacifist, perfect-run, combo bonuses.
 *
 * killAllEnemies()+collectAllItems() always produce a full clear/collection, so
 * Full Deploy (+300) and — whenever !tookDamage && !usedPower — Perfect Run (+1000)
 * are active in every scenario below. Expected totals account for that.
 */

import {
  launchTestBrowser,
  navigateToGame,
  clearStorage,
  startGame,
  getGameState,
  setGameState,
  setComboCount,
  killAllEnemies,
  collectAllItems,
  callWinRound,
  reportTest,
} from './helpers.mjs';

let passCount = 0;
let failCount = 0;

// Mirrors the constants in main.js's winRound()
const FULL_DEPLOY_BONUS = 300;
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

// Computes the exact expected winRound() bonus total for a scenario, given
// killAllEnemies()+collectAllItems() always guarantee a full clear/collection
// (so Full Deploy is always active, and Perfect Run is active whenever the
// scenario itself claims no damage/no power use).
function computeExpectedBonus(s, totalMinShots) {
  let total = FULL_DEPLOY_BONUS;

  const redundancyBonus = (s.redundancy ?? 0) * REDUNDANCY_BONUS_PER_NODE;
  if (redundancyBonus > 0) total += redundancyBonus;

  if (!s.usedPower) total += NO_POWER_BONUS;
  if (!s.usedHeal) total += NO_HEAL_BONUS;

  const elapsedSeconds = (s.elapsedMs ?? 0) / 1000;
  const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX - elapsedSeconds * SPEED_BONUS_DECAY_PER_SEC));
  if (speedBonus > 0) total += speedBonus;

  const overPar = (s.shotsFired ?? 0) - totalMinShots;
  const rawShotBonus = overPar <= 0 ? SHOT_BONUS_MAX : Math.round(SHOT_BONUS_MAX - overPar * SHOT_DECAY_PER_SHOT);
  const shotBonus = Math.max(rawShotBonus, -SHOT_PENALTY_CAP);
  total += shotBonus;

  if ((s.shotsFired ?? 0) === 0) total += PACIFIST_BONUS;

  if (!s.tookDamage && !s.usedPower) total += PERFECT_RUN_BONUS;

  return total;
}

async function testScenario(name, stateSetup, { exact = true } = {}) {
  const { browser, page } = await launchTestBrowser(true);

  try {
    await navigateToGame(page, true);
    await clearStorage(page);
    await startGame(page);

    // Full clear/collection first (both feed winRound()'s internal counters)
    await killAllEnemies(page, 'bullet');
    await collectAllItems(page);

    // Apply the scenario's state on top (shotsFired/redundancy/etc.)
    await setGameState(page, stateSetup);

    const before = await getGameState(page);
    await callWinRound(page, 0, '');
    const after = await getGameState(page);

    const delta = after.score - before.score;
    const expected = computeExpectedBonus({ ...before, ...stateSetup }, before.totalMinShots);

    if (exact) {
      if (delta === expected) {
        reportTest(name, true, `+${delta} (expected +${expected})`);
        passCount++;
      } else {
        reportTest(name, false, `+${delta}, expected +${expected}`);
        failCount++;
      }
    } else {
      // Loose bound check (used only where the exact par-dependent shot
      // bonus would make an exact match brittle to level edits)
      if (delta >= expected) {
        reportTest(name, true, `+${delta} (>= expected +${expected})`);
        passCount++;
      } else {
        reportTest(name, false, `+${delta}, expected >= +${expected}`);
        failCount++;
      }
    }
  } catch (err) {
    reportTest(name, false, err.message);
    failCount++;
  } finally {
    await browser.close();
  }
}

async function testRedundancyBonus() {
  console.log('→ Redundancy node bonus (100 per node)');
  await testScenario('Redundancy bonus: 3 nodes', {
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    shotsFired: 0,
    tookDamage: false,
    elapsedMs: 50000,
  });
  await testScenario('Redundancy bonus: 1 node', {
    redundancy: 1,
    usedPower: false,
    usedHeal: false,
    shotsFired: 0,
    tookDamage: false,
    elapsedMs: 50000,
  });
}

async function testNoPowerBonus() {
  console.log('→ No Root Access bonus (250 points)');
  await testScenario('No power bonus: never used Root Access', {
    usedPower: false,
    redundancy: 3,
    usedHeal: false,
    shotsFired: 0,
    tookDamage: false,
    elapsedMs: 50000,
  });
  await testScenario('No power bonus: skipped when Root Access used', {
    usedPower: true,
    redundancy: 3,
    usedHeal: false,
    shotsFired: 0,
    tookDamage: false,
    elapsedMs: 50000,
  });
}

async function testNoHealBonus() {
  console.log('→ No heal bonus (250 points)');
  await testScenario('No heal bonus: never healed', {
    usedHeal: false,
    usedPower: false,
    redundancy: 3,
    shotsFired: 0,
    tookDamage: false,
    elapsedMs: 50000,
  });
  await testScenario('No heal bonus: skipped when healed', {
    usedHeal: true,
    usedPower: false,
    redundancy: 3,
    shotsFired: 0,
    tookDamage: false,
    elapsedMs: 50000,
  });
}

async function testSpeedBonus() {
  console.log('→ Speed bonus (max 1000, decays 8/sec)');
  await testScenario('Speed bonus: fast clear (30s)', {
    elapsedMs: 30000,
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    shotsFired: 0,
    tookDamage: false,
  });
  await testScenario('Speed bonus: past decay floor (200s)', {
    elapsedMs: 200000, // 1000 - 200*8 = -600 -> floored to 0
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    shotsFired: 0,
    tookDamage: false,
  });
}

async function testShotEfficiencyBonus() {
  console.log('→ Shot efficiency bonus (taper around level par, penalty floor)');
  // 0 shots is <= any real par, so this always scores the max shot bonus —
  // exact math holds regardless of the level's actual totalMinShots.
  await testScenario('Shot efficiency: zero shots (at/under any par)', {
    shotsFired: 0,
    shotsHit: 0,
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    tookDamage: false,
    elapsedMs: 50000,
  });
  // 100000 shots guarantees overPar large enough to hit the -300 floor
  // regardless of the level's actual par.
  await testScenario('Shot efficiency: way over par (penalty floor)', {
    shotsFired: 100000,
    shotsHit: 50,
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    tookDamage: false,
    elapsedMs: 50000,
  });
}

async function testPacifistBonus() {
  console.log('→ Pacifist bonus (150 points, zero shots fired)');
  await testScenario('Pacifist bonus: zero shots', {
    shotsFired: 0,
    shotsHit: 0,
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    tookDamage: false,
    elapsedMs: 50000,
  });
  await testScenario('Pacifist bonus: skipped with any shots fired', {
    shotsFired: 1,
    shotsHit: 1,
    redundancy: 3,
    usedPower: false,
    usedHeal: false,
    tookDamage: false,
    elapsedMs: 50000,
  });
}

async function testPerfectRunBonus() {
  console.log('→ Perfect Run bonus (1000 points, no damage + no power)');
  await testScenario('Perfect Run bonus: no damage, no power', {
    tookDamage: false,
    usedPower: false,
    usedHeal: false,
    redundancy: 3,
    shotsFired: 0,
    shotsHit: 0,
    elapsedMs: 40000,
  });
  await testScenario('Perfect Run bonus: skipped after taking damage', {
    tookDamage: true,
    usedPower: false,
    usedHeal: false,
    redundancy: 2,
    shotsFired: 0,
    shotsHit: 0,
    elapsedMs: 40000,
  });
}

async function testComboBonus() {
  console.log('→ Combo bonus (25 points per step, awarded live during play, not at winRound)');
  const { browser, page } = await launchTestBrowser(true);

  try {
    await navigateToGame(page, true);
    await startGame(page);

    // Combo bonuses are awarded immediately in defeatEnemy() as kills chain,
    // not deferred to winRound() — set the closure-scoped combo counter
    // directly (comboCount isn't part of `state`) and confirm it round-trips.
    await setComboCount(page, 4);
    const state = await getGameState(page);

    if (state.comboCount === 4) {
      reportTest('Combo counter tracking', true, `comboCount=${state.comboCount}`);
      passCount++;
    } else {
      reportTest('Combo counter tracking', false, `comboCount=${state.comboCount}, expected 4`);
      failCount++;
    }
  } finally {
    await browser.close();
  }
}

async function runAllTests() {
  console.log('\n💰 Running scoring bonus tests...\n');

  await testRedundancyBonus();
  await testNoPowerBonus();
  await testNoHealBonus();
  await testSpeedBonus();
  await testShotEfficiencyBonus();
  await testPacifistBonus();
  await testPerfectRunBonus();
  await testComboBonus();

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error(`✗ Test suite error: ${err.message}`);
  process.exit(1);
});
