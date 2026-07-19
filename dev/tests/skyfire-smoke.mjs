#!/usr/bin/env node
/**
 * Browser smoke test for Skyfire Squadron (javascripts/skyfire-squadron/).
 *
 * Mirrors dev/tests/smoke.mjs's job for the platformer — catch runtime
 * errors node --check can't see (implicit-global-timing ReferenceErrors,
 * etc.) — plus confirm the debug-hook gate. Deeper mechanics/UI/persistence
 * coverage lives in the sibling skyfire-*.mjs files, same split the
 * platformer itself uses (smoke vs mechanics vs ui vs persistence).
 */

import {
  launchTestBrowser,
  navigateToGame,
  clearStorage,
  startGame,
  getGameState,
  reportTest,
} from './skyfire-helpers.mjs';

let passCount = 0;
let failCount = 0;

function record(name, passed, message = '') {
  reportTest(name, passed, message);
  if (passed) passCount++;
  else failCount++;
}

async function testDebugHookAbsentByDefault() {
  const { browser, page } = await launchTestBrowser(false);
  try {
    await navigateToGame(page, false);
    const hookType = await page.evaluate(() => typeof window.__skyfireGameDebug);
    record('debug hook absent without test flag', hookType === 'undefined', `typeof = ${hookType}`);
  } catch (err) {
    record('debug hook absent without test flag', false, err.message);
  } finally {
    await browser.close();
  }
}

async function testLoadStartAndInput() {
  const { browser, page } = await launchTestBrowser(true);
  try {
    const { errors, pageErrors } = await navigateToGame(page, true);
    record('no console/page errors on load', errors.length === 0 && pageErrors.length === 0, [...errors, ...pageErrors].join('; '));

    const hookType = await page.evaluate(() => typeof window.__skyfireGameDebug);
    record('debug hook present with test flag', hookType === 'object', `typeof = ${hookType}`);

    await clearStorage(page);
    await startGame(page);
    const state = await getGameState(page);
    record('game starts (isPlaying)', state?.isPlaying === true, JSON.stringify(state));

    const scoreExists = await page.evaluate(() => {
      const el = document.getElementById('skyfire-score');
      return el && el.textContent !== undefined;
    });
    record('score display present', scoreExists, `present=${scoreExists}`);

    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('Space');
    await page.waitForTimeout(300);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('Space');
    const postInputErrors = errors.length + pageErrors.length;
    record('no errors during movement/fire input', postInputErrors === 0, [...errors, ...pageErrors].join('; '));
  } catch (err) {
    record('load, start, and input', false, err.message);
  } finally {
    await browser.close();
  }
}

async function runAllTests() {
  console.log('🎮 Skyfire Squadron smoke test\n');

  await testDebugHookAbsentByDefault();
  await testLoadStartAndInput();

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
