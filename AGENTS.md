# AGENTS.md

Architectural context for AI agents (and humans) working on this repo. Read this before making
structural changes.

## Scope and philosophy

This is an intentionally small, dependency-minimal personal site. It should stay buildable with
plain Jekyll + vanilla HTML/CSS/JS. Do not introduce, without strong justification and discussion:

- A Node/npm build step or bundler (Webpack, Vite, esbuild, etc.)
- A frontend framework (React, Vue, Svelte, etc.)
- A CSS framework (Bootstrap, Tailwind, etc.) — the site was deliberately migrated *off*
  Bootstrap/jQuery/Popper (see git history around the recipes page rewrite)
- A parallel local-dev environment alongside `dev/` (no separate Dockerfile+compose or
  devcontainer.json — `toolbox`/`distrobox` via `dev/` is the one blessed path)

**One deliberate exception:** the hero game (`javascripts/game/`) uses **Kaplay**
(`javascripts/vendor/kaplay.mjs`, MIT-licensed, see below) for physics/collision/rendering. This is a
one-off carve-out for the genuine complexity of platformer physics — it does *not* reopen the door to
frameworks/bundlers/CSS libraries anywhere else on the site, including future changes to the game
that aren't about the physics/rendering Kaplay already covers (audio, particle effects, a level
editor, etc. are out of scope unless specifically asked for).

## Layout / include map

- `_layouts/default.html` — shared `<html>` shell: `_includes/head.html`, `_includes/header.html`,
  `{{ content }}`, `_includes/footer.html`.
- `_layouts/home.html` — extends `default`; renders `_includes/hero-game.html` (the side-scroller
  game) then `_includes/portfolio-links.html`.
- `_layouts/recipes.html` — extends `default`; renders `_includes/recipe-grid.html` +
  `_includes/recipe-detail.html`, and loads `javascripts/recipes.js`.
- New pages should get their own `_layouts/*.html` rather than duplicating `<head>`/`<body>`
  boilerplate inline the way `index.html`/`recipes/index.html` used to before this restructuring.

## Data schemas

**`_data/projects.yml`** — portfolio entries, fields: `name`, `link`, `description`, `github`
(optional), `featured` (optional bool — `_includes/portfolio-links.html` styles these as prominent
CTA cards). Only `recipes`, `powerbash`, and `powertmux` currently exist here on purpose — `ip/`,
`ipcalc/`, `ddns/`, `commute/`, `secretsanta/`, and the orphaned `dash/` admin template were removed
as dead/unused pages during the 2026 red-theme overhaul. Don't resurrect them without confirming
they're actually wanted, and if you do, give them proper `_layouts`/`_includes` rather than
standalone HTML.

**`_data/recipes/*.yml`** — fields: `name`, `description`, `equipment` (optional list),
`ingredients` (list), `directions` (list), `pictures` (list of `{url, size, alt}` — `url` may be a
relative path resolved against `/recipes/` or an absolute external URL), `references` (list of
`{name, url}`).

Thumbnail rule (`_includes/recipe-grid.html`): the card image is always `recipe.pictures[0].url`
when `pictures` exists, with a CSS-only lettered placeholder (`.recipe-card__img--placeholder`)
when it doesn't. Previously this was hardcoded to a shared placeholder image regardless of the
recipe's actual photo — don't reintroduce that bug.

## Game code boundary

The hero game is a 2D side-scroller ("DevOps engineer" runs/jumps through a level fighting Bugs,
Latency Spikes, and Failed Pipelines, collecting Commits and a Root Access power-up, to reach a
"Deploy to Production" goal). It lives under `javascripts/game/` as ES modules built on **Kaplay**
(`javascripts/vendor/kaplay.mjs`, npm `kaplay` package, MIT + a no-AI-training-use clause — see
`javascripts/vendor/KAPLAY_LICENSE.txt` for the exact text, pinned at the version that file was
vendored from):

- `level.js` — the level as a hand-authored ASCII map (array of equal-length strings) plus the
  `tiles` symbol legend, consumed via Kaplay's `addLevel()`. `#` solid ground/platform, `@` player
  spawn, `b`/`l`/`p` enemy spawns (bug/latency-spike/failed-pipeline), `c` commit collectible, `k`
  Root Access key, `g` goal terminal.
- `entities.js` — `createPlayer()`/`createEnemy()` factory functions building Kaplay game objects
  (`sprite()`, `pos()`, `area()`, `body()`, plus custom tags/state). `ENEMY_CONFIGS` is the
  per-type data table (sprite frames, color tint, patrol speed, behavior). `PLAYER_ANIMS` defines
  the player's idle/run/jump frame indices into its sliced spritesheet.
- `collectibles.js` — `createCollectible()`/`createGoal()` factories for the commit/Root-Access
  pickups and the goal terminal (non-solid `area()` triggers, no `body()`).
- `state.js` — the `GameState` finite state machine (`READY → PLAYING → POWERED → WIN/LOSE`).
  Engine-agnostic — carried over unchanged from the previous Pac-Man version and drives the HUD/
  overlay DOM elements exactly the same way regardless of what's happening inside the canvas.
- `input.js` — wires the custom-styled HTML touch buttons into Kaplay's virtual button system
  (`pressButton()`/`releaseButton()`) so `isButtonDown()`/`onButtonPress()` in `main.js` see
  keyboard and touch identically. Keyboard bindings themselves are declared via `kaplay({buttons})`
  in `main.js`, not here.
- `main.js` — entry point: initializes Kaplay against the `<canvas>` from `_includes/hero-game.html`,
  loads sprites, builds the level, and wires collision handlers
  (`onCollide("player", "enemy"/"collectible"/"goal", ...)`) to `state.js` and the HUD.
- `assets/*.png` — curated sprites (not full asset packs) from two CC0 itch.io packs: "Generic RUN
  n' GUN" by Vaca Roxa (player + tiles/backgrounds, not all used) and "Coins & Gems & Chests &
  More" by greatdocbrown (the commit coin + Root Access key). CC0 means no attribution is legally
  required, but don't add sprites from anywhere else without checking the license first — a public
  repo commits raw asset files as plain files, which some "free" licenses (e.g. CraftPix's)
  explicitly forbid redistributing. All four enemy sprites (`bug`/`latency-spike`/`failed-pipeline`,
  originally one reused soldier character tinted per type, and `outage`, originally a hand-drawn
  screen/monitor design) were replaced with original AI-generated pixel art — see the git history
  around those changes for the generation pipeline (SDXL via a local ComfyUI, background-removed
  and pixelated with a small Python script — `~/comfy-projects/devops-platformer-enemies/` on the
  machine that generated them — not hand-drawn). `collectible-cash.png` is a hand-drawn flat icon,
  not part of that AI-generated batch. `collectible-redundancy.png` is "Hard Drive" by Pong Man
  (CC0, OpenGameArt, https://opengameart.org/content/hard-drive), used at its native 32x32 —
  unlike the other curated sprites above it isn't from either CC0 itch.io pack, so if it's ever
  swapped again, note the source here too. `player-torso.png`/
  `player-legs.png` are derived crops of the existing `player.png` sheet (see entities.js's
  comments), not new art. Likewise `enemy-<type>-fragment-0..3.png` are mechanical 2x2-grid crops
  of each enemy's existing `-1.png` idle frame (see `dev/generate-enemy-fragments.sh`), used for
  the death "shatter" effect in `entities.js`'s `spawnEnemyFragments()` — not new art either.

**Extending it:** new enemy type → add a config entry to `ENEMY_CONFIGS` in `entities.js` (and a new
tile symbol in `level.js`). Bigger/different level → edit `level.js`'s ASCII map; keep every gap
jumpable given `main.js`'s tuned physics constants (`GRAVITY`, `JUMP_FORCE`, `MOVE_SPEED`).

**Kaplay-specific gotcha worth knowing:** a tile factory's `pos` argument in `level.js`/`main.js` is
**grid (col, row) coordinates, not pixels** — only a factory's own *unmodified* returned component
list gets auto-converted to real pixel position internally. Since our custom factories
(`createPlayer`/`createEnemy`/etc.) build free-standing objects themselves rather than returning
components for Kaplay to position, they must multiply by `TILE_SIZE` themselves (see the comment in
`main.js` above the `tiles` config) — getting this wrong silently clusters every entity near world
origin (0,0) while ground tiles still render correctly, which looks *almost* right at a glance and
is easy to miss without checking actual entity positions.

**The big gotcha — `addLevel()` must only ever be called once per page load.** `buildLevel()` (which
calls `addLevel()`) runs exactly once, directly in `init()`. Calling `destroyAll("*")` +
`addLevel()` again *at any point afterward, from anywhere* — a collision callback, a button click
handler, a deferred `wait()` callback, doesn't matter — silently wedges Kaplay's entire update loop:
no thrown error, the game just stops ticking (HUD frozen, input dead) as of that call. This was
found the hard way: it looked like it only affected the *second* reset in a play session (fresh
Start worked, but a subsequent Continue/Try Again didn't), which is exactly the trap — it's easy to
test "restart once" and ship a bug that only shows up the second time.

Because of this, **nothing after the initial build ever destroys or recreates game objects.**
Instead:
- `resetRound()` (full restart: fresh Start, Try Again, Play Again) and `respawnAfterHit()`
  (mid-round life loss) both work by *repositioning existing objects* — player/enemies back to
  their `spawnX`/`spawnY`, collectibles back to theirs.
- Defeating an enemy or collecting an item never calls `destroy()`. Instead it sets `.defeated` /
  `.collected`, `.hidden = true`, `.paused = true` (stops the object's own per-frame update — see
  `defeatEnemy()` in `main.js`), and moves it to `pos.x = -9999` so it can't visually reappear or
  collide with anything. `resetRound()` reverses all of that (`hidden/paused/defeated = false`,
  position restored) to "revive" everything on a full restart.
- If you need a genuinely new kind of "remove this object" behavior, extend this hide/pause/move
  pattern — don't reach for `destroy()`/`destroyAll()` for anything that might need to come back.

**Smaller gotcha:** `destroy()` (on the rare object that's fine to actually remove permanently,
e.g. a one-off particle effect if that's ever added) doesn't take effect until the next tick, so a
still-overlapping pair can fire the same `onCollide` callback multiple times for what should be one
event — always guard with a flag on the object rather than assuming one hit.

## Theme tokens

`stylesheets/stylesheet.css` defines the whole palette as CSS custom properties on `:root`
(`--bg-void`, `--bg-panel`, `--crimson-deep`, `--red-accent`, `--red-accent-dim`, `--text-primary`,
`--text-muted`, `--focus-ring`, `--goal-green`). That block is the single source of truth for the
red design system — don't hardcode colors elsewhere.

**Contrast caveat:** `--red-accent` (#ff2d3a) on `--bg-void` measures ~3.9:1, which fails WCAG AA
for small text. Use it for large headings, button backgrounds (with light text on top), borders,
and glow accents — use `--focus-ring` (#ff6b74) for small inline link text, which clears 4.5:1.

## Local dev

`dev/Containerfile`, `dev/toolbox-setup.sh`, and `dev/toolbox-enter.sh` are the only supported local
Jekyll environment. See README.md for usage.

**Ruby version is pinned via `.ruby-version` + rbenv, not system Ruby.** The `github-pages` gem's
dependency chain (`commonmarker`, via `jekyll-commonmark-ghpages`) requires Ruby `< 4.0`, but
Fedora's `ruby` package (used by the toolbox base image) tracks the latest 4.x. `dev/Containerfile`
installs `rbenv` + `ruby-build-rbenv` + `ruby-build-ruby` (not the generic `ruby-build` metapackage
— that resolves to an unrelated multi-implementation build tool on Fedora) instead of `ruby`
directly, and `dev/toolbox-setup.sh` compiles the `.ruby-version`-pinned release from source. Don't
"fix" this by pointing the Containerfile back at the system `ruby` package or by bumping
`.ruby-version` to a 4.x release — both break the build the same way this replaced. The Gemfile also
pins `liquid` to `>= 4.0.4` (`~> 4.0`) because `github-pages` otherwise resolves the exact `4.0.3`
release, which calls the removed `String#tainted?` and crashes rendering on any Ruby `>= 3.2`; keep
that pin even if the stated Jekyll/liquid versions look outdated — it matches what GitHub's Pages
build environment actually runs.
