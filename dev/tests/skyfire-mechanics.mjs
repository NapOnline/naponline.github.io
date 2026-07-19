#!/usr/bin/env node
/**
 * Mechanics test suite for Skyfire Squadron — movement bounds, weapon-level
 * bullet spread, per-enemy-type kill scoring, hit/lives/invincibility,
 * bombs, boss phases/defeat, and restarting at least twice (this repo's own
 * documented lesson: a reset bug can show up only on the *second* restart,
 * see .claude/rules/game.md).
 */

import {
  launchTestBrowser,
  navigateToGame,
  clearStorage,
  startGame,
  getGameState,
  getEnemies,
  getPlayerPos,
  teleportPlayer,
  killAllEnemies,
  skipToBoss,
  forceHit,
  triggerBomb,
  raiseWeaponLevel,
  callDefeatBoss,
  countTag,
  reportTest,
} from './skyfire-helpers.mjs';

let passCount = 0;
let failCount = 0;

function record(name, passed, message = '') {
  reportTest(name, passed, message);
  if (passed) passCount++;
  else failCount++;
}

async function withGame(fn) {
  const { browser, page } = await launchTestBrowser(true);
  try {
    await navigateToGame(page, true);
    await clearStorage(page);
    await startGame(page);
    await fn(page);
  } catch (err) {
    record(fn.name || 'test', false, err.message);
  } finally {
    await browser.close();
  }
}

async function testInitialState() {
  await withGame(async (page) => {
    const state = await getGameState(page);
    record(
      'starts with 3 lives / 3 bombs / weapon I / score 0',
      state?.lives === 3 && state?.bombs === 3 && state?.weaponLevel === 1 && state?.score === 0,
      JSON.stringify(state),
    );
  });
}

async function testMovementBoundsClamp() {
  await withGame(async (page) => {
    // No movement keys held — updatePlayerMovement() reclamps position every
    // frame regardless of input (see main.js), so an out-of-bounds teleport
    // should snap back within the viewport on the very next tick.
    await teleportPlayer(page, -5000, -5000);
    await page.waitForTimeout(200);
    const posA = await getPlayerPos(page);
    record('player clamped back on-screen after out-of-bounds teleport (top-left)', posA && posA.x >= 0 && posA.x <= 360 && posA.y >= 0 && posA.y <= 560, JSON.stringify(posA));

    await teleportPlayer(page, 9000, 9000);
    await page.waitForTimeout(200);
    const posB = await getPlayerPos(page);
    record('player clamped back on-screen after out-of-bounds teleport (bottom-right)', posB && posB.x >= 0 && posB.x <= 360 && posB.y >= 0 && posB.y <= 560, JSON.stringify(posB));
  });
}

async function testWeaponLevelSpread() {
  await withGame(async (page) => {
    // Level 1: single bullet per shot.
    // A plain keyboard.press() is a full down+up with no gap — Kaplay's
    // onUpdate loop can sample isButtonDown() between frames and miss it
    // entirely (this repo's own documented lesson, see the `verify` skill /
    // dev/tests/playthrough.mjs). Hold it briefly instead.
    await page.keyboard.down('Space');
    await page.waitForTimeout(50);
    await page.keyboard.up('Space');
    const countLevel1 = await countTag(page, 'bullet-player');
    record('weapon level I fires 1 bullet', countLevel1 === 1, `count=${countLevel1}`);

    await raiseWeaponLevel(page);
    let state = await getGameState(page);
    record('raiseWeaponLevel advances to II', state?.weaponLevel === 2, JSON.stringify(state));

    await page.waitForTimeout(250); // clear shoot cooldown
    // A plain keyboard.press() is a full down+up with no gap — Kaplay's
    // onUpdate loop can sample isButtonDown() between frames and miss it
    // entirely (this repo's own documented lesson, see the `verify` skill /
    // dev/tests/playthrough.mjs). Hold it briefly instead.
    await page.keyboard.down('Space');
    await page.waitForTimeout(50);
    await page.keyboard.up('Space');
    const countLevel2 = await countTag(page, 'bullet-player');
    record('weapon level II fires a 3-way spread', countLevel2 === countLevel1 + 3, `count=${countLevel2}`);

    await raiseWeaponLevel(page);
    await raiseWeaponLevel(page); // capped at III
    state = await getGameState(page);
    record('raiseWeaponLevel caps at III', state?.weaponLevel === 3, JSON.stringify(state));

    await page.waitForTimeout(250);
    // A plain keyboard.press() is a full down+up with no gap — Kaplay's
    // onUpdate loop can sample isButtonDown() between frames and miss it
    // entirely (this repo's own documented lesson, see the `verify` skill /
    // dev/tests/playthrough.mjs). Hold it briefly instead.
    await page.keyboard.down('Space');
    await page.waitForTimeout(50);
    await page.keyboard.up('Space');
    const countLevel3 = await countTag(page, 'bullet-player');
    record('weapon level III fires a 5-way spread', countLevel3 === countLevel2 + 5, `count=${countLevel3}`);
  });
}

async function testEnemyKillScoring() {
  await withGame(async (page) => {
    // First drone wave spawns at tMs=1000 (stage.js).
    await page.waitForTimeout(1300);
    const enemiesBefore = await getEnemies(page);
    record('drone wave spawned', enemiesBefore.some((e) => e.enemyType === 'drone'), `count=${enemiesBefore.length}`);

    const before = await getGameState(page);
    await killAllEnemies(page);
    const after = await getGameState(page);
    record('killing enemies increases score', after.score > before.score, `${before.score} -> ${after.score}`);

    const enemiesAfter = await getEnemies(page);
    record('killed enemies are marked defeated', enemiesAfter.every((e) => e.defeated), JSON.stringify(enemiesAfter.map((e) => e.defeated)));
  });
}

async function testHitLivesAndInvincibility() {
  await withGame(async (page) => {
    const before = await getGameState(page);
    await forceHit(page);
    const afterFirstHit = await getGameState(page);
    record('hit costs exactly one life', afterFirstHit.lives === before.lives - 1, `${before.lives} -> ${afterFirstHit.lives}`);
    record('hit triggers invincibility', afterFirstHit.isHitInvincible === true, JSON.stringify(afterFirstHit));

    // forceHit() bypasses invincibility for test purposes (see main.js's
    // debug hook), so a second immediate call still lands.
    await forceHit(page);
    const afterSecondHit = await getGameState(page);
    record('a second forced hit still costs a life (invincibility bypass works for setup)', afterSecondHit.lives === afterFirstHit.lives - 1, `${afterFirstHit.lives} -> ${afterSecondHit.lives}`);
  });
}

async function testBomb() {
  await withGame(async (page) => {
    const before = await getGameState(page);
    await triggerBomb(page);
    const after = await getGameState(page);
    record('bomb consumes one charge', after.bombs === before.bombs - 1, `${before.bombs} -> ${after.bombs}`);

    // Exhaust remaining bombs, then confirm a bomb at 0 charges is a no-op.
    await triggerBomb(page);
    await triggerBomb(page);
    const exhausted = await getGameState(page);
    record('bombs floor at 0', exhausted.bombs === 0, JSON.stringify(exhausted));
    await triggerBomb(page);
    const stillZero = await getGameState(page);
    record('triggering a bomb at 0 charges is a no-op', stillZero.bombs === 0, JSON.stringify(stillZero));
  });
}

async function testGameOverOnZeroLives() {
  await withGame(async (page) => {
    await forceHit(page);
    await forceHit(page);
    await forceHit(page);
    const state = await getGameState(page);
    record('0 lives ends the round (LOSE)', state?.state === 'LOSE' && state?.isOver === true, JSON.stringify(state));
  });
}

async function testRestartAtLeastTwice() {
  await withGame(async (page) => {
    for (let i = 1; i <= 2; i++) {
      await forceHit(page);
      await forceHit(page);
      await forceHit(page);
      const over = await getGameState(page);
      if (over.state !== 'LOSE') {
        record(`restart #${i} setup (round ended)`, false, JSON.stringify(over));
        continue;
      }
      await startGame(page);
      const fresh = await getGameState(page);
      record(`restart #${i} produces a clean state`, fresh?.isPlaying === true && fresh?.lives === 3 && fresh?.bombs === 3 && fresh?.weaponLevel === 1 && fresh?.score === 0, JSON.stringify(fresh));
    }
  });
}

async function testBossPhasesAndDefeat() {
  await withGame(async (page) => {
    await skipToBoss(page);
    await page.waitForTimeout(400);
    const spawned = await getGameState(page);
    record('boss spawns once the stage timeline elapses', spawned?.bossActive === true && spawned?.bossHealth === 60, JSON.stringify(spawned));

    await callDefeatBoss(page);
    const won = await getGameState(page);
    record('defeating the boss wins the round and clears bossActive', won?.state === 'WIN' && won?.bossActive === false, JSON.stringify(won));
  });
}

async function runAllTests() {
  console.log('🎮 Skyfire Squadron mechanics test suite\n');

  await testInitialState();
  await testMovementBoundsClamp();
  await testWeaponLevelSpread();
  await testEnemyKillScoring();
  await testHitLivesAndInvincibility();
  await testBomb();
  await testGameOverOnZeroLives();
  await testRestartAtLeastTwice();
  await testBossPhasesAndDefeat();

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
