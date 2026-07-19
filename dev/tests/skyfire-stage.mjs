#!/usr/bin/env node
/**
 * Pure-Node unit tests for javascripts/skyfire-squadron/stage.js's
 * procedural stage generator — no browser needed, since mulberry32()/
 * generateStageTimeline()/unlockedEnemyTypes()/unlockedPowerupTypes()/
 * difficultyMultiplier() are plain functions with no Kaplay-global
 * dependency (unlike main.js/entities.js, which reference sprite()/add()/
 * etc. at call time and need a live Kaplay instance).
 *
 * This is where exact determinism/shape checks live — dev/tests/
 * skyfire-mechanics.mjs's testStageProgression() covers the same generator
 * through the live game (via the advanceToStage() debug hook), but real
 * wall-clock waitForTimeout()s there make byte-for-byte determinism checks
 * flaky to assert; here, calling the generator directly has none of that.
 */

import {
  mulberry32,
  generateStageTimeline,
  unlockedEnemyTypes,
  unlockedPowerupTypes,
  difficultyMultiplier,
  ENEMY_UNLOCK_SCHEDULE,
} from '../../javascripts/skyfire-squadron/stage.js';
import { reportTest } from './helpers.mjs';

let passCount = 0;
let failCount = 0;

function record(name, passed, message = '') {
  reportTest(name, passed, message);
  if (passed) passCount++;
  else failCount++;
}

function testMulberry32Determinism() {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  record('same seed produces an identical value sequence', JSON.stringify(seqA) === JSON.stringify(seqB), `${JSON.stringify(seqA)} vs ${JSON.stringify(seqB)}`);

  const c = mulberry32(54321);
  const seqC = Array.from({ length: 10 }, () => c());
  record('a different seed produces a different sequence', JSON.stringify(seqA) !== JSON.stringify(seqC), '');

  record('every value stays within [0, 1)', seqA.every((v) => v >= 0 && v < 1), JSON.stringify(seqA));
}

function testEnemyUnlockSchedule() {
  record('stage 1 unlocks exactly Scout + Interceptor', JSON.stringify(unlockedEnemyTypes(1).sort()) === JSON.stringify(['interceptor', 'scout']), JSON.stringify(unlockedEnemyTypes(1)));
  record('stage 2 unlocks nothing new over stage 1', unlockedEnemyTypes(2).length === unlockedEnemyTypes(1).length, `${unlockedEnemyTypes(1).length} vs ${unlockedEnemyTypes(2).length}`);
  record('the pool only grows as stage number increases', unlockedEnemyTypes(13).length > unlockedEnemyTypes(9).length && unlockedEnemyTypes(9).length > unlockedEnemyTypes(5).length, `${unlockedEnemyTypes(5).length}, ${unlockedEnemyTypes(9).length}, ${unlockedEnemyTypes(13).length}`);

  const allTypes = ENEMY_UNLOCK_SCHEDULE.flatMap((entry) => entry.types);
  record('all 8 archetypes are unlocked by the schedule\'s final stage', unlockedEnemyTypes(9999).length === allTypes.length && new Set(unlockedEnemyTypes(9999)).size === 8, JSON.stringify(unlockedEnemyTypes(9999)));
}

function testPowerupUnlockSchedule() {
  record('stage 1 unlocks at least spread_shot and rapid_fire', ['spread_shot', 'rapid_fire'].every((t) => unlockedPowerupTypes(1).includes(t)), JSON.stringify(unlockedPowerupTypes(1)));
  record('the power-up pool only grows as stage number increases', unlockedPowerupTypes(9).length > unlockedPowerupTypes(4).length && unlockedPowerupTypes(4).length > unlockedPowerupTypes(1).length, `${unlockedPowerupTypes(1).length}, ${unlockedPowerupTypes(4).length}, ${unlockedPowerupTypes(9).length}`);
}

function testDifficultyMultiplier() {
  const m1 = difficultyMultiplier(1);
  const m10 = difficultyMultiplier(10);
  const m50 = difficultyMultiplier(50);
  const m500 = difficultyMultiplier(500);
  record('difficulty multiplier starts at 1x on stage 1', m1 === 1, `${m1}`);
  record('difficulty multiplier increases with stage number', m10 > m1 && m50 > m10, `${m1}, ${m10}, ${m50}`);
  record('difficulty multiplier is capped (endless play stays theoretically survivable)', m500 === m50 || m500 < m50 * 1.5, `stage50=${m50} stage500=${m500}`);
}

function testGenerateStageTimelineDeterminism() {
  const rngA = mulberry32(999);
  const rngB = mulberry32(999);
  const resultA = generateStageTimeline(6, rngA);
  const resultB = generateStageTimeline(6, rngB);
  record('same seed + same stage number reproduces an identical timeline', JSON.stringify(resultA) === JSON.stringify(resultB), '');

  const rngC = mulberry32(111);
  const resultC = generateStageTimeline(6, rngC);
  record('a different seed produces a different timeline', JSON.stringify(resultA) !== JSON.stringify(resultC), '');
}

function testGenerateStageTimelineShape() {
  const rng = mulberry32(42);
  const { durationMs, timeline } = generateStageTimeline(4, rng);
  record('durationMs is a positive number', typeof durationMs === 'number' && durationMs > 0, `${durationMs}`);
  record('timeline is non-empty', timeline.length > 0, `${timeline.length} entries`);
  record('timeline is sorted by tMs ascending', timeline.every((e, i) => i === 0 || e.tMs >= timeline[i - 1].tMs), '');
  record('every entry falls within [0, durationMs]', timeline.every((e) => e.tMs >= 0 && e.tMs <= durationMs), '');

  const allowed = unlockedEnemyTypes(4);
  const enemyEntries = timeline.filter((e) => e.type !== 'powerup');
  record('every enemy entry is from stage 4\'s unlocked pool', enemyEntries.every((e) => allowed.includes(e.type)), JSON.stringify(enemyEntries.map((e) => e.type)));

  const powerupEntries = timeline.filter((e) => e.type === 'powerup');
  const allowedPowerups = unlockedPowerupTypes(4);
  record('every power-up entry carries a powerupType from the unlocked pool', powerupEntries.every((e) => allowedPowerups.includes(e.powerupType)), JSON.stringify(powerupEntries.map((e) => e.powerupType)));

  record('every entry\'s x is within [0, 1]', timeline.every((e) => e.x >= 0 && e.x <= 1), '');
}

function runAllTests() {
  console.log('🎮 Skyfire Squadron stage generator unit tests\n');

  testMulberry32Determinism();
  testEnemyUnlockSchedule();
  testPowerupUnlockSchedule();
  testDifficultyMultiplier();
  testGenerateStageTimelineDeterminism();
  testGenerateStageTimelineShape();

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests();
