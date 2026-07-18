/**
 * Shared test utilities for the Kaplay game test suite
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';

const GAME_URL = 'http://127.0.0.1:4000/';
const CHROMIUM_PATH = '/var/home/napalm/bin/chromium-browser';
const TIMEOUT_MS = 10000;

const executablePath = existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined;

// Browser launcher with optional debug hook injection
export async function launchTestBrowser(injectHook = false) {
  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Inject the test hook flag before any scripts run
  if (injectHook) {
    await page.addInitScript(() => {
      window.__NAP_TEST_HOOK__ = true;
    });
  }

  return { browser, context, page };
}

// Navigate and wait for game to be ready
export async function navigateToGame(page, waitForHook = false) {
  const errors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    const text = `${err.name}: ${err.message}`;
    pageErrors.push(text);
  });

  await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

  // Wait for critical elements
  await Promise.all([
    page.waitForSelector('#platformer-canvas', { timeout: TIMEOUT_MS }),
    page.waitForSelector('#game-start', { timeout: TIMEOUT_MS }),
  ]);

  // If using the hook, wait for it to be ready
  if (waitForHook) {
    await page.waitForFunction(
      () => window.__gameDebug !== undefined,
      { timeout: TIMEOUT_MS }
    );
  }

  return { errors, pageErrors };
}

// Clear localStorage for clean test isolation
export async function clearStorage(page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

// Get current game state via the debug hook
export async function getGameState(page) {
  return await page.evaluate(() => window.__gameDebug?.getState?.());
}

// Set game state via the debug hook
export async function setGameState(page, patch) {
  await page.evaluate((p) => window.__gameDebug?.setState?.(p), patch);
}

// Set the combo counter (closure-scoped in main.js, not part of `state`)
export async function setComboCount(page, value) {
  await page.evaluate((v) => window.__gameDebug?.setComboCount?.(v), value);
}

// Get enemy data via the debug hook
export async function getEnemies(page) {
  return await page.evaluate(() => window.__gameDebug?.getEnemies?.());
}

// Teleport player via the debug hook
export async function teleportPlayer(page, x, y) {
  await page.evaluate((args) => {
    window.__gameDebug?.teleportPlayer?.(args[0], args[1]);
  }, [x, y]);
}

// Kill all enemies via the debug hook
export async function killAllEnemies(page, method = 'bullet') {
  await page.evaluate((m) => window.__gameDebug?.killAllEnemies?.(m), method);
}

// Collect all items via the debug hook
export async function collectAllItems(page) {
  await page.evaluate(() => window.__gameDebug?.collectAllItems?.());
}

// Call winRound with specific bonus and label
export async function callWinRound(page, bonus = 0, label = '') {
  await page.evaluate((args) => {
    window.__gameDebug?.winRound?.(args[0], args[1]);
  }, [bonus, label]);
}

// Call defeatEnemy
export async function callDefeatEnemy(page, enemyIndex, scoreValue, method) {
  await page.evaluate((args) => {
    const enemies = window.__gameDebug?.getEnemies?.();
    if (enemies && enemies[args[0]]) {
      const enemyPos = enemies[args[0]].pos;
      const allEnemies = document.querySelectorAll('[class*="enemy"]');
      // Use the indexed enemy from the game
      const enemy = allEnemies[args[0]]?.__kaplayObj || enemies[args[0]];
      window.__gameDebug?.defeatEnemy?.(enemy, args[1], args[2]);
    }
  }, [enemyIndex, scoreValue, method]);
}

// Announce unlocks (achievements)
export async function announceUnlocks(page, ids) {
  await page.evaluate((idList) => {
    window.__gameDebug?.announceUnlocks?.(idList);
  }, ids);
}

// Read localStorage value
export async function getStorageValue(page, key) {
  return await page.evaluate((k) => localStorage.getItem(k), key);
}

// Simulate keyboard input
export async function pressKey(page, key, durationMs = 1000) {
  await page.keyboard.press(key);
  if (durationMs > 0) {
    await page.waitForTimeout(durationMs);
  }
}

// Click element
export async function clickElement(page, selector) {
  await page.click(selector);
}

// Wait for selector to be visible
export async function waitForVisible(page, selector, timeoutMs = TIMEOUT_MS) {
  await page.waitForSelector(selector, { state: 'visible', timeout: timeoutMs });
}

// Wait for selector to be hidden
export async function waitForHidden(page, selector, timeoutMs = TIMEOUT_MS) {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && el.hidden;
    },
    sel,
    { timeout: timeoutMs }
  );
}

// Get text content of element
export async function getElementText(page, selector) {
  return await page.textContent(selector);
}

// Check if element is visible
export async function isElementVisible(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el && !el.hidden;
  }, selector);
}

// Start the game (click start button)
export async function startGame(page) {
  await clickElement(page, '#game-start');
  // Wait for overlay to hide (game started)
  await page.waitForFunction(
    () => {
      const overlay = document.getElementById('game-overlay');
      return overlay && overlay.hidden;
    },
    { timeout: TIMEOUT_MS }
  );
}

// Report test result with consistent formatting
export function reportTest(name, passed, message = '') {
  const icon = passed ? '✓' : '✗';
  const suffix = message ? ` — ${message}` : '';
  console.log(`${icon} ${name}${suffix}`);
  return passed;
}
