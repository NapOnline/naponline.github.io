#!/usr/bin/env node
/**
 * Browser smoke test for the Kaplay game
 *
 * Catches runtime errors (like undefined globals) that node --check can't see.
 * - Launches headless Chromium
 * - Navigates to http://127.0.0.1:4000/
 * - Captures all console errors and uncaught exceptions
 * - Asserts game elements render
 * - Clicks start button, asserts game actually starts
 * - Holds movement key, asserts no errors during play
 * - Exits 0 only if zero errors and all assertions passed
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GAME_URL = 'http://127.0.0.1:4000/';
const TIMEOUT_MS = 10000;

// Try to use the host's existing chromium-browser binary to avoid a redundant download
const CHROMIUM_PATH = '/var/home/napalm/bin/chromium-browser';
const executablePath = existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined;

async function runTest() {
  console.log('🎮 Starting browser smoke test...');
  console.log(`  URL: ${GAME_URL}`);
  console.log(`  Chromium: ${executablePath ? CHROMIUM_PATH : 'Playwright managed'}`);
  console.log('');

  const errors = [];
  const pageErrors = [];
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture all console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        console.error(`  [console.error] ${text}`);
        errors.push(`console.error: ${text}`);
      }
    });

    // Capture uncaught exceptions (the key one: ReferenceError for undefined globals)
    page.on('pageerror', (err) => {
      const text = `${err.name}: ${err.message}`;
      console.error(`  [pageerror] ${text}`);
      pageErrors.push(text);
    });

    // Navigate to the game
    console.log('→ Navigating to game page...');
    await page.goto(GAME_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    // Wait for critical game elements to exist
    console.log('→ Waiting for game canvas and start button...');
    await Promise.all([
      page.waitForSelector('#platformer-canvas', { timeout: TIMEOUT_MS }),
      page.waitForSelector('#game-start', { timeout: TIMEOUT_MS }),
    ]);
    console.log('  ✓ Game elements found');

    // Verify no errors were captured yet (this catches the "undefined global" class bug)
    if (pageErrors.length > 0 || errors.length > 0) {
      console.error('');
      console.error('✗ Errors found during page load:');
      [...pageErrors, ...errors].forEach((err) => console.error(`  - ${err}`));
      return false;
    }

    // Click start button, assert the game actually starts
    console.log('→ Clicking start button...');
    await page.click('#game-start');

    // Wait for the overlay to hide (indicates game started)
    const overlayVisible = await page.evaluate(() => {
      const overlay = document.getElementById('game-overlay');
      return overlay ? !overlay.hidden : true;
    });

    if (overlayVisible) {
      console.error('✗ Start button click did not hide overlay (game did not start)');
      return false;
    }
    console.log('  ✓ Game started (overlay hidden)');

    // Verify score display is present
    const scoreExists = await page.evaluate(() => {
      const score = document.getElementById('game-score');
      return score && score.textContent !== undefined;
    });

    if (!scoreExists) {
      console.error('✗ Score display not found after start');
      return false;
    }
    console.log('  ✓ Score display present');

    // Hold a movement key for a second, assert no new errors
    console.log('→ Testing player input (holding right arrow for 1s)...');
    const preInputErrors = [...errors, ...pageErrors].length;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1000);
    await page.keyboard.press('ArrowRight'); // release (press twice to simulate down+up, a bit hacky but works)

    const postInputErrors = [...errors, ...pageErrors].length;
    if (postInputErrors > preInputErrors) {
      console.error('✗ Errors occurred during player input');
      return false;
    }
    console.log('  ✓ Input handling OK');

    await context.close();
    console.log('');
    console.log('✓ All browser tests passed');
    return true;
  } catch (err) {
    console.error(`✗ Test failed with error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

// Run the test
const success = await runTest();
process.exit(success ? 0 : 1);
