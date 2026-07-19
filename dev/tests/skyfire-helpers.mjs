/**
 * Test utilities for Skyfire Squadron — mirrors the shape of helpers.mjs's
 * wrappers but scoped to this game's own page/DOM ids/debug hook. Kept as a
 * separate module (rather than added to helpers.mjs) so the platformer's
 * existing test suite is never at risk from a change here — only
 * launchTestBrowser() and reportTest() are reused from there, since both are
 * already fully generic (launchTestBrowser only injects the shared
 * window.__NAP_TEST_HOOK__ flag; reportTest is pure console formatting).
 */

export { launchTestBrowser, reportTest } from './helpers.mjs';

const GAME_URL = 'http://127.0.0.1:4000/games/skyfire-squadron/';
const TIMEOUT_MS = 10000;

// Navigate and wait for the game to be ready
export async function navigateToGame(page, waitForHook = false) {
  const errors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(`${err.name}: ${err.message}`);
  });

  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

  await Promise.all([
    page.waitForSelector('#skyfire-canvas', { timeout: TIMEOUT_MS }),
    page.waitForSelector('#skyfire-start', { timeout: TIMEOUT_MS }),
  ]);

  if (waitForHook) {
    await page.waitForFunction(
      () => window.__skyfireGameDebug !== undefined,
      { timeout: TIMEOUT_MS }
    );
  }

  return { errors, pageErrors };
}

export async function clearStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function getGameState(page) {
  return await page.evaluate(() => window.__skyfireGameDebug?.getState?.());
}

export async function setGameState(page, patch) {
  await page.evaluate((p) => window.__skyfireGameDebug?.setState?.(p), patch);
}

export async function getEnemies(page) {
  return await page.evaluate(() => window.__skyfireGameDebug?.getEnemies?.());
}

export async function teleportPlayer(page, x, y) {
  await page.evaluate((args) => {
    window.__skyfireGameDebug?.teleportPlayer?.(args[0], args[1]);
  }, [x, y]);
}

export async function killAllEnemies(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.killAllEnemies?.());
}

export async function skipToBoss(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.skipToBoss?.());
}

export async function forceHit(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.forceHit?.());
}

export async function triggerBomb(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.triggerBomb?.());
}

export async function raiseWeaponLevel(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.raiseWeaponLevel?.());
}

export async function callWinRound(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.winRound?.());
}

export async function callDefeatBoss(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.defeatBoss?.());
}

export async function countTag(page, tag) {
  return await page.evaluate((t) => window.__skyfireGameDebug?.countTag?.(t), tag);
}

export async function getPlayerPos(page) {
  return await page.evaluate(() => window.__skyfireGameDebug?.getPlayerPos?.());
}

export async function callResetRound(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.resetRound?.());
}

export async function getStorageValue(page, key) {
  return await page.evaluate((k) => localStorage.getItem(k), key);
}

export async function pressKey(page, key, durationMs = 0) {
  await page.keyboard.press(key);
  if (durationMs > 0) {
    await page.waitForTimeout(durationMs);
  }
}

export async function clickElement(page, selector) {
  await page.click(selector);
}

export async function getElementText(page, selector) {
  return await page.textContent(selector);
}

export async function isElementVisible(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el && !el.hidden;
  }, selector);
}

export async function startGame(page) {
  await clickElement(page, '#skyfire-start');
  await page.waitForFunction(
    () => {
      const overlay = document.getElementById('skyfire-overlay');
      return overlay && overlay.hidden;
    },
    { timeout: TIMEOUT_MS }
  );
}
