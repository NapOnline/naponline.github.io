---
paths:
  - "javascripts/game/**"
  - "javascripts/skyfire-squadron/**"
---

# Kaplay game code — extended context

Only loaded when you're actually touching this code. Full narrative lives in
`AGENTS.md`; the always-loaded top-severity rules live in the repo-root `CLAUDE.md`.
This file is the middle layer: richer detail on the same rules, plus extension
patterns.

## The `addLevel()`-once discipline, in full

`buildLevel()` (which calls `addLevel()`) runs exactly once, directly in `init()`.
Because a second `addLevel()` call silently wedges Kaplay's update loop from
*anywhere*, nothing after the initial build ever destroys or recreates game objects:

- `resetRound()` (full restart: fresh Start, Try Again, Play Again) and
  `respawnAfterHit()` (mid-round life loss) both work by **repositioning existing
  objects** — player/enemies back to their `spawnX`/`spawnY`, collectibles back to
  theirs.
- Defeating an enemy or collecting an item never calls `destroy()`. Instead:
  `.defeated`/`.collected = true`, `.hidden = true`, `.paused = true` (stops the
  object's own per-frame `onUpdate`), and `.pos.x = -9999` so it can't visually
  reappear or collide with anything. `resetRound()` reverses all of that to "revive"
  everything on a full restart.
- If you need a genuinely new "remove this object" behavior, extend this
  hide/pause/move-offstage pattern — don't reach for `destroy()`/`destroyAll()` for
  anything that might need to come back.
- Bullets and one-shot particle effects (tagged `"fx"`) are the exception: they never
  go through `addLevel()`, so `destroy()` on them is fine and expected.

This was found the hard way originally — it looked like it only affected the
*second* reset in a play session (fresh Start worked, a subsequent Try Again didn't),
which is exactly the trap: testing "restart once" ships a bug that only shows up the
second time. Any manual or automated verification of a game-loop change must restart
the round **at least twice**, not once.

## Extending the game

- New enemy type → add a config entry to `ENEMY_CONFIGS` in `entities.js` (sprite
  frames, tint, speed, hitbox, health, behavior) and a new tile symbol in `level.js`.
- Bigger/different level → edit `level.js`'s ASCII map. Keep every gap jumpable given
  `main.js`'s tuned physics constants (`GRAVITY`, `JUMP_FORCE`, `MOVE_SPEED` — max
  same-height jump distance is ~2.8 tiles at the current tuning; the existing map
  never exceeds a 2-tile gap).
- A tile factory's `pos` argument in `level.js`/`main.js` is grid (col, row), not
  pixels — only a factory's own *unmodified* returned component list gets
  auto-converted internally. Custom factories build free-standing objects themselves,
  so they multiply by `TILE_SIZE` by hand (see the comment above the `tiles` config
  in `main.js`).

## Verifying Kaplay API behavior — don't guess

The vendored bundle (`javascripts/vendor/kaplay.mjs`) is minified esbuild output
(single line, ~188KB) — not practical to read directly for "how does this API
actually behave." Its embedded version string is `3001.0.19`. Before asserting any
Kaplay API behaves a particular way:

1. Check this repo's own documented gotchas first (`CLAUDE.md`, this file,
   `AGENTS.md`).
2. WebFetch `kaplayjs.com` or `github.com/kaplayjs/kaplay` docs/source, and confirm
   what you find is consistent with the pinned `3001.0.19` — kaplayjs.com serves
   latest-version docs, which can describe different behavior than what's vendored
   here.
3. Fall back to empirically reading the actual call sites in `entities.js`/`main.js`
   to see how the API is used in practice in this codebase.

Never assert a Kaplay behavior from memory or from a different version's docs
without this check.

## Debug hook safety

`window.__gameDebug` in `main.js` is gated behind `window.__NAP_TEST_HOOK__ ===
true`, set only by the Playwright test harness (`dev/tests/helpers.mjs`'s
`launchTestBrowser(true)`, via `page.addInitScript()` before `page.goto()`). Any
change to `main.js`'s `init()` structure should re-verify this gate is still the
*only* way to reach `window.__gameDebug` — a plain `page.goto()` with no init script
must always see `window.__gameDebug === undefined`.
