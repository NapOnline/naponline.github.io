#!/usr/bin/env node
/**
 * UI test suite for Skyfire Squadron — pause/resume, mute toggle +
 * persistence, touch controls presence, canvas resize, overlay
 * visibility/messaging, and the stage HUD readout.
 */

import {
  launchTestBrowser,
  navigateToGame,
  clearStorage,
  startGame,
  waitForGameLoopReady,
  forceHit,
  advanceToStage,
  isElementVisible,
  getElementText,
  getStorageValue,
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
    await waitForGameLoopReady(page);
    await fn(page);
  } catch (err) {
    record(fn.name || 'test', false, err.message);
  } finally {
    await browser.close();
  }
}

async function testPauseResume() {
  await withGame(async (page) => {
    await page.click('#skyfire-pause-btn');
    const pausedVisible = await isElementVisible(page, '#skyfire-pause-overlay');
    record('pause overlay shows on pause click', pausedVisible, `visible=${pausedVisible}`);
    const pressed = await page.getAttribute('#skyfire-pause-btn', 'aria-pressed');
    record('pause button reflects aria-pressed=true', pressed === 'true', `aria-pressed=${pressed}`);

    await page.click('#skyfire-resume');
    const resumedHidden = !(await isElementVisible(page, '#skyfire-pause-overlay'));
    record('resume hides the pause overlay', resumedHidden, `hidden=${resumedHidden}`);

    // Escape key toggles pause too (main.js's keydown listener).
    await page.keyboard.press('Escape');
    const pausedByKey = await isElementVisible(page, '#skyfire-pause-overlay');
    record('Escape key pauses', pausedByKey, `visible=${pausedByKey}`);
    await page.keyboard.press('Escape');
    const resumedByKey = !(await isElementVisible(page, '#skyfire-pause-overlay'));
    record('Escape key resumes', resumedByKey, `hidden=${resumedByKey}`);
  });
}

async function testMuteToggleAndPersistence() {
  await withGame(async (page) => {
    const before = await getStorageValue(page, 'skyfire-squadron.muted.v1');
    await page.click('#skyfire-mute');
    const after = await getStorageValue(page, 'skyfire-squadron.muted.v1');
    record('mute button toggles persisted preference', before !== after, `${before} -> ${after}`);

    const ariaAfter = await page.getAttribute('#skyfire-mute', 'aria-pressed');
    record('mute button aria-pressed reflects state', ariaAfter === 'true' || ariaAfter === 'false', `aria-pressed=${ariaAfter}`);
  });
}

async function testTouchControlsPresent() {
  await withGame(async (page) => {
    const actions = await page.locator('#skyfire-touch-controls [data-action]').evaluateAll((els) => els.map((e) => e.dataset.action));
    const expected = ['up', 'left', 'right', 'down', 'fire', 'bomb'];
    const hasAll = expected.every((a) => actions.includes(a));
    record('all 6 touch control buttons present (dpad + fire/bomb)', hasAll, `found=${JSON.stringify(actions)}`);
  });
}

async function testCanvasResize() {
  await withGame(async (page) => {
    const before = await page.evaluate(() => document.querySelector('#skyfire .game-canvas-frame').getBoundingClientRect().height);
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.querySelector('#skyfire .game-canvas-frame').getBoundingClientRect().height);
    record('canvas frame height recomputes on resize', Math.round(before) !== Math.round(after), `${before} -> ${after}`);
  });
}

async function testGameOverOverlayMessaging() {
  await withGame(async (page) => {
    await forceHit(page);
    await forceHit(page);
    await forceHit(page);
    const visible = await isElementVisible(page, '#skyfire-overlay');
    const message = await getElementText(page, '#skyfire-message');
    const buttonLabel = await getElementText(page, '#skyfire-start');
    record('game-over overlay visible with correct message/button', visible && /game over/i.test(message ?? '') && /try again/i.test(buttonLabel ?? ''), `${message} / ${buttonLabel}`);
  });
}

async function testStageHudReadout() {
  await withGame(async (page) => {
    const initialText = await getElementText(page, '#skyfire-stage');
    record('stage HUD reads 1 at round start', initialText === '1', `text=${initialText}`);

    await advanceToStage(page, 7);
    await page.waitForTimeout(100);
    const afterText = await getElementText(page, '#skyfire-stage');
    record('stage HUD updates as the run advances', afterText === '7', `text=${afterText}`);
  });
}

async function runAllTests() {
  console.log('🎮 Skyfire Squadron UI test suite\n');

  await testPauseResume();
  await testMuteToggleAndPersistence();
  await testTouchControlsPresent();
  await testCanvasResize();
  await testGameOverOverlayMessaging();
  await testStageHudReadout();

  console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);
  process.exit(failCount > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
