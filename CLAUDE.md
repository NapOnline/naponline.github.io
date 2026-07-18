# CLAUDE.md

Auto-loaded project memory for Claude Code. This file is intentionally short — full
narrative architecture, history, and context live in `AGENTS.md`; read it directly
before any structural change. `AGENTS.md` is *not* auto-loaded the way this file is,
so don't assume its content is already in context.

<!-- keep in sync with AGENTS.md -->

## Scope and philosophy

- No Node/npm build step, no frontend framework, no CSS framework anywhere on the
  site. Kaplay (`javascripts/vendor/kaplay.mjs`) is a one-off carve-out for the game's
  physics/collision/rendering — it does not reopen the door to frameworks/bundlers
  elsewhere, including other future changes to the game itself.
- No parallel local-dev environment alongside `dev/` (toolbox/podman via `dev/` is the
  one blessed path).

## Game code (`javascripts/game/`) — top-severity rules

- `addLevel()` must be called exactly once per page load. Never call `destroyAll()` +
  `addLevel()` again from anywhere (collision callback, button handler, deferred
  `wait()`) — it silently wedges Kaplay's entire update loop with no thrown error.
  See `.claude/rules/game.md` for the full reset/respawn pattern this requires.
- Custom factories (`createPlayer`, `createEnemy`, etc. in `entities.js`) must
  multiply grid `pos` (col, row) by `TILE_SIZE` themselves — only a tile factory's own
  *unmodified* returned component list gets auto-converted to pixels by `addLevel()`.
  Getting this wrong silently clusters entities near world origin while ground tiles
  still render correctly.
- Kaplay's globals (`sprite()`, `dt()`, `add()`, `rgb()`, `lerp()`, etc.) only exist
  after `kaplay({ global: true })` runs in `main.js`. A module that references them at
  load time (not inside a callback that runs later) throws a `ReferenceError` at
  runtime — invisible to `node --check` or a static read. This exact bug shipped once
  and had to be reverted; it's the primary reason `dev/test.sh`'s browser-level
  Playwright suite exists.
- `destroy()` doesn't take effect until the next tick — a still-overlapping pair can
  fire the same `onCollide` callback more than once for what should be a single event.
  Guard with a flag on the object; never assume one hit only fires once.
- `window.__gameDebug` (the test-only debug hook in `main.js`) must stay gated behind
  `window.__NAP_TEST_HOOK__ === true`. That flag is only ever set by the Playwright
  test harness via `page.addInitScript()` before page load — never weaken or remove
  this gate without deliberate intent, and never make the hook reachable by any other
  means.

## Theme tokens

All colors come from the CSS custom properties on `:root` in
`stylesheets/stylesheet.css` — never hardcode a color elsewhere. `--red-accent`
(#ff2d3a) fails WCAG AA for small text on `--bg-void`; use `--focus-ring` (#ff6b74)
for small inline text instead.

## Local dev / Ruby pinning

Ruby is pinned via `.ruby-version` + rbenv, compiled inside the toolbox container —
never point the build at system Ruby or bump `.ruby-version` to a 4.x release (the
`github-pages`/`commonmarker` dependency chain requires Ruby < 4.0). Keep the
`liquid >= 4.0.4` Gemfile pin — dropping it resolves to a `liquid` release that
crashes on Ruby >= 3.2.

## Pre-commit testing — mechanically enforced

`dev/test.sh` must pass before any commit touching `javascripts/`, `dev/`,
`_layouts/`, `_includes/`, `_config.yml`, `Gemfile`, or `.ruby-version`. This is not
just a convention: a `PreToolUse` hook (`.claude/hooks/check-test-freshness.sh`)
mechanically blocks `git commit` on those paths unless a fresh passing `dev/test.sh`
marker exists for the current diff. If you hit the block, run `dev/test.sh` (~1–3
min) and retry — don't bypass it (`touch .claude/skip-test-gate`) unless you have a
specific, deliberate reason.

## Adversarial review for game-code changes

For any change under `javascripts/game/`, proactively reach for the
`kaplay-bug-hunter` subagent before running `dev/test.sh` — it targets this repo's
proven Kaplay failure classes specifically (see above) and is cheap to skip for
non-game changes.
