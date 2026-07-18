---
name: verify
description: >
  Project-specific bootstrap for verifying changes to naponline.github.io — a
  Jekyll static site whose only real runtime surface is a client-side Kaplay
  game (javascripts/game/) served in a browser. Use this whenever verifying a
  change to the game, hero-game.html, or the Playwright test harness itself
  (dev/tests/*.mjs) — it gives you the exact commands to get a live instance
  running, how to drive it like a human would (not just re-run the test
  suite), and this repo's specific "probe the adjacents" checklist so you
  don't have to cold-start.
---

# Verifying naponline.github.io

## Runtime surface

This is a **browser/GUI game**, not a CLI or server. The evidence is what renders on
`http://127.0.0.1:4000/` and how the game responds to real input — not just whether
`node --check` or the Playwright suite exits 0.

## Getting a handle

```bash
dev/serve.sh start   # kills anything stale on :4000, starts a fresh jekyll serve
                      # inside the toolbox container, polls until ready (~30s timeout)
```

Confirms readiness itself; don't add your own sleep/poll loop on top of it.

## Driving it like a human

Don't reinvent this — `dev/tests/helpers.mjs` already has the exact Playwright
patterns for driving a live instance. Reuse them directly rather than writing new
ad hoc automation:

- `launchTestBrowser(injectHook)` — launches headless Chromium (reuses the host's
  `chromium-browser` binary if present). Pass `injectHook: true` only if you need
  `window.__gameDebug` for fast scenario setup (see below); pass `false` for a
  genuine "what would a real visitor see" check.
- `navigateToGame(page, waitForHook)` — navigates, waits for `#platformer-canvas` and
  `#game-start`, captures console errors and `pageerror` events (this is what catches
  a `ReferenceError` from the implicit-global-timing failure class — see
  `.claude/rules/game.md`).
- `startGame(page)` — clicks `#game-start`, waits for `#game-overlay` to hide.
- `pressKey(page, key, durationMs)` — for movement/action input. For genuinely held
  keys (not taps), use `page.keyboard.down()`/`.up()` directly — a plain
  `page.keyboard.press()` is a full down+up, not a hold (this bit the playthrough
  test once; see `dev/tests/playthrough.mjs`'s comments).

**The debug hook, precisely:** `window.__gameDebug` is reachable **only** via:
```js
await page.addInitScript(() => { window.__NAP_TEST_HOOK__ = true; });
// ...then navigate
```
before `page.goto()`. A plain `page.goto()` with no init script must always see
`window.__gameDebug === undefined` — if you're verifying a change to `main.js`'s
`init()`, this is worth re-checking explicitly (see checklist below).

## What's already covered — check before re-deriving

`dev/tests/*.mjs` has 7 suites; know what they already check before assuming
something needs new coverage:

- `smoke.mjs` — page loads, no console/pageerror, start button works, basic input.
- `mechanics.mjs` — movement/jump, all 4 enemy behaviors, combat (bullet/stomp/
  power), collectibles, pole climb, damage/death, pause, HUD sync, turret-despawn
  regression check.
- `achievements.mjs` — all 11 achievement unlock conditions + persistence.
- `scoring.mjs` — exact bonus-formula verification via `winRound()`.
- `ui.mjs` — panel toggles, mute/pause buttons, resize, touch controls.
- `persistence.mjs` — high scores, achievements, preferences in localStorage.
- `playthrough.mjs` — one real, physically-input-driven full round (no debug hook).

These are regression coverage, not a substitute for driving a live instance for
**this specific diff** — a passing suite proves the paths it already knows to check;
it doesn't prove your new code path works. Drive the actual change live, then note
which existing suites already cover the surrounding behavior.

## This repo's "probe the adjacents" checklist

Specific to the failure classes that have actually bitten this repo (see
`CLAUDE.md`/`.claude/rules/game.md` for the full detail on each):

- **Restart the round at least twice in one browser session**, not once. The
  `addLevel()`-double-call bug only manifested on the *second* reset — testing a
  single restart is exactly how it shipped originally.
- **Turret-bullet-despawn class**: if the change touches bullet/particle lifecycle,
  confirm enemy-fired bullets still despawn at level bounds (not camera-offscreen)
  and player-fired bullets still despawn at camera edge.
- **Debug hook inertness**: if `main.js`'s `init()` structure changed at all,
  navigate with a plain `page.goto()` (no init script) and assert
  `window.__gameDebug === undefined`.
- **Grid/pixel sanity**: if a level or entity factory changed, visually confirm (or
  screenshot) that entities render at their intended tile position, not clustered
  near world origin.

## Reporting

Follow the built-in `/verify` skill's PASS/FAIL/BLOCKED/SKIP structure — Steps
(what you did to the running app) + Findings (anything that made you pause, not just
bugs). At least one 🔍 probe step from the checklist above, not just a happy-path
replay.
