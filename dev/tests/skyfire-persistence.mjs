#!/usr/bin/env node
/**
 * Persistence test suite for Skyfire Squadron — high score list
 * sort/truncate correctness, survival across a reload, and (critically)
 * storage isolation from the platformer: both games are Kaplay instances
 * living on the same origin, so the only thing preventing their saved data
 * from colliding is using distinct localStorage keys throughout
 * (javascripts/skyfire-squadron/{highscores,audio}.js vs
 * javascripts/game/{highscores,audio}.js) — this suite proves that
 * end-to-end by writing to both games' storage in the same browser context
 * and confirming neither leaks into the other.
 */

import {
  launchTestBrowser,
  navigateToGame as navigateToSkyfire,
  clearStorage,
  startGame as startSkyfire,
  setGameState,
  forceHit as forceHitSkyfire,
  getStorageValue,
  reportTest,
} from './skyfire-helpers.mjs';

import {
  navigateToGame as navigateToPlatformer,
  startGame as startPlatformer,
  killAllEnemies as killAllPlatformerEnemies,
  callWinRound,
  getStorageValue as getPlatformerStorageValue,
} from './helpers.mjs';

const SKYFIRE_SCORE_KEY = 'skyfire-squadron.highscores.v1';
const SKYFIRE_MUTE_KEY = 'skyfire-squadron.muted.v1';
const PLATFORMER_SCORE_KEY = 'devops-platformer.highscores.v1';

let passCount = 0;
let failCount = 0;

function record(name, passed, message = '') {
  reportTest(name, passed, message);
  if (passed) passCount++;
  else failCount++;
}

// Endless mode has no "win" checkpoint to route through (see state.js — only
// READY/PLAYING/LOSE exist now) — a round ends by dying, so driving lives to
// 0 via 3 forced hits is the whole setup, and the final score is exactly
// whatever setGameState() put there (no stage-clear/win bonus math to
// replicate here anymore, unlike the old boss-defeat pipeline this test used
// to route through).
async function testHighScoreSortAndTruncate() {
  const { browser, page } = await launchTestBrowser(true);
  try {
    await navigateToSkyfire(page, true);
    await clearStorage(page);

    const baseScores = [100, 500, 50, 900, 300, 700, 10];
    for (const base of baseScores) {
      await startSkyfire(page);
      await setGameState(page, { score: base });
      await forceHitSkyfire(page);
      await forceHitSkyfire(page);
      await forceHitSkyfire(page);
    }

    const raw = await getStorageValue(page, SKYFIRE_SCORE_KEY);
    const list = JSON.parse(raw ?? '[]');
    record('high score list truncates to top 5', list.length === 5, `length=${list.length}`);

    const scores = list.map((e) => e.score);
    const expectedTop5 = [...baseScores].sort((a, b) => b - a).slice(0, 5);
    record('high score list holds the top 5 scores, sorted descending', JSON.stringify(scores) === JSON.stringify(expectedTop5), `${JSON.stringify(scores)} vs expected ${JSON.stringify(expectedTop5)}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const rawAfterReload = await getStorageValue(page, SKYFIRE_SCORE_KEY);
    record('high score list survives a reload', rawAfterReload === raw, 'unchanged after reload');
  } catch (err) {
    record('high score sort/truncate', false, err.message);
  } finally {
    await browser.close();
  }
}

async function testMutePreferencePersistsAcrossReload() {
  const { browser, page } = await launchTestBrowser(true);
  try {
    await navigateToSkyfire(page, true);
    await clearStorage(page);
    await page.click('#skyfire-mute');
    const muted = await getStorageValue(page, SKYFIRE_MUTE_KEY);

    await page.reload({ waitUntil: 'domcontentloaded' });
    const mutedAfterReload = await getStorageValue(page, SKYFIRE_MUTE_KEY);
    record('mute preference persists across a reload', mutedAfterReload === muted && muted !== null, `${muted} -> ${mutedAfterReload}`);
  } catch (err) {
    record('mute preference persistence', false, err.message);
  } finally {
    await browser.close();
  }
}

// The real isolation proof: drive both games to write high scores in the
// *same* browser context (same origin, shared localStorage), then confirm
// each game's storage key holds only its own data.
async function testStorageIsolationFromPlatformer() {
  const { browser, page } = await launchTestBrowser(true);
  try {
    await navigateToPlatformer(page, true);
    await page.evaluate(() => localStorage.clear());
    await startPlatformer(page);
    await killAllPlatformerEnemies(page);
    await callWinRound(page, 0, '');
    const platformerScoreAfterPlatformerWin = await getPlatformerStorageValue(page, PLATFORMER_SCORE_KEY);
    record('platformer win writes its own high-score key', typeof platformerScoreAfterPlatformerWin === 'string' && platformerScoreAfterPlatformerWin.length > 0, platformerScoreAfterPlatformerWin);

    await navigateToSkyfire(page, true);
    await startSkyfire(page);
    await setGameState(page, { score: 4242 });
    await forceHitSkyfire(page);
    await forceHitSkyfire(page);
    await forceHitSkyfire(page);

    const skyfireScore = await getStorageValue(page, SKYFIRE_SCORE_KEY);
    const platformerScoreAfterSkyfireWin = await getPlatformerStorageValue(page, PLATFORMER_SCORE_KEY);

    record('skyfire game-over writes its own distinct high-score key', typeof skyfireScore === 'string' && skyfireScore.includes('4242'), skyfireScore);
    record("skyfire's game-over does not touch the platformer's high-score key", platformerScoreAfterSkyfireWin === platformerScoreAfterPlatformerWin, `${platformerScoreAfterPlatformerWin} -> ${platformerScoreAfterSkyfireWin}`);

    await navigateToPlatformer(page, true);
    const platformerScoreFinal = await getPlatformerStorageValue(page, PLATFORMER_SCORE_KEY);
    record("platformer's own high-score key is unaffected after both games ran in the same session", platformerScoreFinal === platformerScoreAfterPlatformerWin, `${platformerScoreAfterPlatformerWin} -> ${platformerScoreFinal}`);
  } catch (err) {
    record('storage isolation from platformer', false, err.message);
  } finally {
    await browser.close();
  }
}

async function runAllTests() {
  console.log('🎮 Skyfire Squadron persistence test suite\n');

  await testHighScoreSortAndTruncate();
  await testMutePreferencePersistsAcrossReload();
  await testStorageIsolationFromPlatformer();

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
