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

export async function forceHit(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.forceHit?.());
}

export async function triggerBomb(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.triggerBomb?.());
}

export async function raiseWeaponLevel(page) {
  await page.evaluate(() => window.__skyfireGameDebug?.raiseWeaponLevel?.());
}

export async function applyPowerUp(page, type) {
  await page.evaluate((t) => window.__skyfireGameDebug?.applyPowerUp?.(t), type);
}

// Seeds the stage-generation RNG — call *after* startGame() (which reseeds
// it from Date.now() via resetRound()), then advanceToStage() for a
// reproducible stage layout. See stage.js's mulberry32()/generateStageTimeline().
export async function setSeed(page, seed) {
  await page.evaluate((s) => window.__skyfireGameDebug?.setSeed?.(s), seed);
}

// Endless-mode replacement for the old single-boss skipToBoss() hook — jumps
// straight to stage n's freshly-generated timeline.
export async function advanceToStage(page, n) {
  await page.evaluate((num) => window.__skyfireGameDebug?.advanceToStage?.(num), n);
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

// The debug hook (window.__skyfireGameDebug) exists as soon as init() runs,
// but Kaplay's own onUpdate() loop only starts *ticking* once the sizeable
// sprite set this game now loads has decoded/uploaded — a real, measured
// ~700ms on this dev setup, not a bug (see the "why" in the session this was
// added). Tests that assert something only the update loop produces
// (movement clamping, bullet firing, the stage HUD text, all gated on
// elapsedMs actually advancing) should call this right after startGame()
// instead of guessing a fixed wait.
export async function waitForGameLoopReady(page) {
  await page.waitForFunction(
    () => (window.__skyfireGameDebug?.getState?.()?.elapsedMs ?? 0) > 0,
    { timeout: TIMEOUT_MS }
  );
}
