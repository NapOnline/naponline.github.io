import kaplay from "../vendor/kaplay.mjs";
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  createPlayerShip,
  updatePlayerPose,
  ENEMY_CONFIGS,
  ENEMY_HIT_FLASH_MS,
  createEnemy,
  createBullet,
  createPowerUp,
  POWERUP_TYPES,
  spawnPowerUpSparkle,
  spawnFireBurst,
  spawnKillEffect,
} from "./entities.js";
import { mulberry32, generateStageTimeline, difficultyMultiplier } from "./stage.js";
import { GameState, STATES, MAX_LIVES, MAX_BOMBS } from "./state.js";
import { setupTouchControls } from "./input.js";
import { loadHighScores, submitHighScore, getTopScore } from "./highscores.js";
import * as audio from "./audio.js";

// This game deliberately never calls addLevel() (see CLAUDE.md/.claude/rules/
// game.md's addLevel()-once discipline, written for the platformer's static
// tile-based level). A vertical shmup's natural spawning model is a
// continuous time-scheduled stream of enemies (see stage.js's
// generateStageTimeline()), not an authored grid — so every entity here
// (player, enemies, bullets, powerups) is a plain runtime object managed
// with ordinary add()/destroy() calls. Zero addLevel() calls trivially
// satisfies "at most once"; this is a deliberate genre-driven choice, not an
// oversight, and it's also why resetRound() below can freely destroy()/
// recreate everything on a restart instead of needing the platformer's
// hide/pause/reposition dance.
//
// Endless structure: there is no boss and no WIN state (see state.js) — a
// run is a sequence of procedurally-generated stages of fixed duration each,
// getting harder forever via stage.js's difficultyMultiplier() and its
// enemy/power-up unlock schedules, until the player dies (LOSE). See
// startStage()/maybeAdvanceStage() below.

const VIEW_W = 360;
const VIEW_H = 560;

const PLAYER_SPEED = 220;
const PLAYER_SPEED_BOOST_MULT = 1.55;
const PLAYER_MIN_X = 12;
const PLAYER_MAX_X = VIEW_W - 12 - PLAYER_WIDTH;
const PLAYER_MIN_Y = Math.round(VIEW_H * 0.32);
const PLAYER_MAX_Y = VIEW_H - 20 - PLAYER_HEIGHT;

const SHOOT_COOLDOWN_MS = 200;
const RAPID_FIRE_COOLDOWN_MS = 90;
const PLAYER_BULLET_SPEED = 480;
// Per-weaponLevel (1-3) horizontal velocity fan for the player's shots —
// index 0 is a single straight shot, index 1 a 3-way spread, index 2 a
// wider 5-way spread.
const WEAPON_SPREADS = [[0], [-90, 0, 90], [-170, -85, 0, 85, 170]];
const WEAPON_LABELS = ["I", "II", "III"];

const HIT_INVINCIBLE_MS = 1600;
const BOMB_ENEMY_DAMAGE = 3;

// Power-up buff durations (ms) — see entities.js's POWERUP_TYPES and
// applyPowerUp() below.
const POWERUP_DURATIONS_MS = {
  rapid_fire: 8000,
  invincibility: 6000,
  speed_booster: 8000,
  score_multiplier: 10000,
  time_dilation: 6000,
  giga_laser: 7000,
};
const SLOW_MO_ENEMY_SCALE = 0.45;

const STAGE_BANNER_LIFE_MS = 1600;

// Three-layer parallax (nebula, the original dot-starfield, a sparser
// brighter near layer), slowest to fastest, furthest back to closest — see
// CREDITS.md for the source of each new texture.
const BG_NEBULA_SPEED = 8;
const BG_STARFIELD_SPEED = 28;
const BG_STARS_BRIGHT_SPEED = 60;

// Sparse decorative asteroids/planets drifting through the background —
// purely cosmetic (no area()/collision, see spawnBgAsteroid()/spawnBgPlanet()
// below), randomized interval per spawn so they never fall into a
// noticeable rhythm. Planets are rarer, bigger, and slower than asteroids.
const BG_ASTEROID_INTERVAL_SEC = [15, 25];
const BG_PLANET_INTERVAL_SEC = [30, 45];
const BG_ASTEROID_SPRITES = ["bg-asteroid-1", "bg-asteroid-2"];
const BG_PLANET_SPRITES = ["bg-planet-1", "bg-planet-2"];

const ASSET_BASE = new URL("./assets/", import.meta.url).href;

// Every ship (player + one per ENEMY_CONFIGS archetype) shares this named
// frame set — see dev/generate-skyfire-sheet-assets.py's SHIP_NAMES. Only
// the frames actually used in-game are loaded (not e.g. the side-view rows
// or the full 7-frame firing sequence).
const SHIP_FRAMES = [
  "idle",
  "thrust_1",
  "thrust_2",
  "thrust_3",
  "damaged_1",
  "damaged_2",
  "damaged_3",
  "explode_1",
  "explode_2",
  "explode_3",
  "explode_4",
  "explode_5",
  "explode_6",
  "explode_7",
];

// One assigned bullet sprite per firing enemy archetype (Scout never fires),
// plus the player's default + Giga-Laser power-up bullet — see entities.js's
// ENEMY_CONFIGS.bulletSprite for the sprite-key side of this mapping.
const BULLET_SPRITE_SOURCES = {
  "player-bullet-standard": "bullets/bullets1/standard_1.png",
  "player-bullet-giga": "bullets/bullets1/energy_lance_1.png",
  "enemy-bullet-interceptor": "bullets/bullets4/ap_round_e4.png",
  "enemy-bullet-swarmer": "bullets/bullets2/burst_1.png",
  "enemy-bullet-bulwark": "bullets/bullets3/cluster_1.png",
  "enemy-bullet-lancer": "bullets/bullets2/quasar_plasma_1.png",
  "enemy-bullet-gunship": "bullets/bullets4/incendiary_e5.png",
  "enemy-bullet-phantom": "bullets/bullets2/beam_pulse_1.png",
  "enemy-bullet-dreadnought": "bullets/bullets3/incendiary_1.png",
};

// Responsive canvas sizing — same technique as javascripts/game/main.js's
// layoutCanvas(): the frame's pixel height is computed explicitly from its
// own measured width on every resize/orientation change rather than relying
// on CSS aspect-ratio alone (see that file's comment for why). Scoped to
// #skyfire specifically so this never risks matching the platformer's
// identically-named .game-wrap/.game-canvas-frame elements if both were
// ever present on the same page.
function layoutCanvas() {
  const wrap = document.querySelector("#skyfire .game-wrap");
  const frame = document.querySelector("#skyfire .game-canvas-frame");
  if (!wrap || !frame) return;
  const w = wrap.clientWidth;
  if (w <= 0) return;
  const h = Math.round((w * VIEW_H) / VIEW_W);
  frame.style.height = `${h}px`;
}

function init() {
  const canvas = document.getElementById("skyfire-canvas");
  if (!canvas) return;

  layoutCanvas();
  window.addEventListener("resize", layoutCanvas);
  window.addEventListener("orientationchange", () => setTimeout(layoutCanvas, 60));

  const scoreEl = document.getElementById("skyfire-score");
  const bestEl = document.getElementById("skyfire-best");
  const livesEl = document.getElementById("skyfire-lives");
  const bombsEl = document.getElementById("skyfire-bombs");
  const weaponEl = document.getElementById("skyfire-weapon");
  const stageEl = document.getElementById("skyfire-stage");
  const overlayEl = document.getElementById("skyfire-overlay");
  const messageEl = document.getElementById("skyfire-message");
  const statsEl = document.getElementById("skyfire-stats");
  const highscoresEl = document.getElementById("skyfire-highscores");
  const startBtn = document.getElementById("skyfire-start");
  const muteBtn = document.getElementById("skyfire-mute");
  const touchControls = document.getElementById("skyfire-touch-controls");
  const pauseBtn = document.getElementById("skyfire-pause-btn");
  const pauseOverlayEl = document.getElementById("skyfire-pause-overlay");
  const resumeBtn = document.getElementById("skyfire-resume");

  kaplay({
    canvas,
    width: VIEW_W,
    height: VIEW_H,
    background: [8, 6, 16],
    // Kaplay defaults every texture to nearest-neighbor filtering (good for
    // blocky pixel art, the old placeholder sprites this game used to ship
    // with) — but the sliced ship/bullet/powerup art
    // (dev/generate-skyfire-sheet-assets.py) is painterly, hand-illustrated
    // art at 200-400px source rendered down to 30-65px in-game, and nearest-
    // neighbor minification at that ratio just discards most of the detail
    // (aliasing/noise) instead of blending it — hence "linear" here.
    // `crisp` (image-rendering: pixelated on the canvas element, a *separate*
    // browser-CSS upscale from the internal WebGL texture filtering above) is
    // dropped for the same reason: this art was never meant to look blocky.
    texFilter: "linear",
    global: true,
    stretch: true,
    buttons: {
      up: { keyboard: ["up", "w"] },
      down: { keyboard: ["down", "s"] },
      left: { keyboard: ["left", "a"] },
      right: { keyboard: ["right", "d"] },
      fire: { keyboard: ["space"] },
      bomb: { keyboard: ["b"] },
    },
  });

  const shipIds = ["player", ...new Set(Object.values(ENEMY_CONFIGS).map((c) => c.shipId))];
  shipIds.forEach((shipId) => {
    SHIP_FRAMES.forEach((frame) => {
      loadSprite(`${shipId}-${frame}`, `${ASSET_BASE}ships/${shipId}/${frame}.png`);
    });
  });
  Object.entries(BULLET_SPRITE_SOURCES).forEach(([key, path]) => {
    loadSprite(key, `${ASSET_BASE}${path}`);
  });
  POWERUP_TYPES.forEach((type) => loadSprite(`powerup-${type}`, `${ASSET_BASE}powerups/${type}.png`));
  loadSprite("bg-starfield", `${ASSET_BASE}bg-starfield.png`);
  loadSprite("bg-nebula", `${ASSET_BASE}bg-nebula.png`);
  loadSprite("bg-stars-bright", `${ASSET_BASE}bg-stars-bright.png`);
  BG_ASTEROID_SPRITES.forEach((name) => loadSprite(name, `${ASSET_BASE}${name}.png`));
  BG_PLANET_SPRITES.forEach((name) => loadSprite(name, `${ASSET_BASE}${name}.png`));
  loadSprite("smoke-puff", `${ASSET_BASE}smoke-puff.png`);

  setupTouchControls(touchControls);

  const state = new GameState();
  let player;
  const playerSpawn = { x: VIEW_W / 2, y: VIEW_H - 80 };
  let shootCooldownMs = 0;
  let bgLayers = [];
  let asteroidTimerSec = rand(BG_ASTEROID_INTERVAL_SEC[0], BG_ASTEROID_INTERVAL_SEC[1]);
  let planetTimerSec = rand(BG_PLANET_INTERVAL_SEC[0], BG_PLANET_INTERVAL_SEC[1]);

  // Seeded RNG driving stage.js's procedural generation — reseeded on every
  // resetRound() so a fresh run doesn't inherit the previous run's sequence.
  // Overridable via the debug hook's setSeed() so tests can request a
  // reproducible stage layout (see dev/tests/skyfire-helpers.mjs).
  let rngSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
  let rng = mulberry32(rngSeed);
  let stageTimeline = [];
  let stageDurationMs = 0;
  let stageElapsedMs = 0;
  let spawnPointer = 0;

  function getTimeScale() {
    return state.isSlowMo ? SLOW_MO_ENEMY_SCALE : 1;
  }

  // One layer's worth of the tiled-sprite vertical wrap components — a
  // fixed camera (unlike the platformer's horizontally-scrolling one) means
  // a simple two-copy wrap is enough per layer: each pair starts one VIEW_H
  // apart and snaps back up by 2*VIEW_H once it scrolls fully past the
  // bottom, so the seam is never visible (see scrollLayerPair()).
  function layerComponents(spriteName, y, opts) {
    const comps = [sprite(spriteName, { width: VIEW_W, height: VIEW_H, tiled: true }), pos(0, y), z(opts.z), "background"];
    if (opts.tint) comps.push(color(opts.tint[0], opts.tint[1], opts.tint[2]));
    if (opts.opacity !== undefined) comps.push(opacity(opts.opacity));
    return comps;
  }

  function createScrollLayer(spriteName, speed, opts = {}) {
    return { a: add(layerComponents(spriteName, 0, opts)), b: add(layerComponents(spriteName, -VIEW_H, opts)), speed };
  }

  function buildScene() {
    // Three-layer parallax, furthest/slowest to closest/fastest — see the
    // BG_*_SPEED constants above and CREDITS.md for each texture's source.
    bgLayers = [
      createScrollLayer("bg-nebula", BG_NEBULA_SPEED, { z: -102, opacity: 0.55 }),
      createScrollLayer("bg-starfield", BG_STARFIELD_SPEED, { z: -101, tint: [120, 120, 150] }),
      createScrollLayer("bg-stars-bright", BG_STARS_BRIGHT_SPEED, { z: -100 }),
    ];

    player = createPlayerShip(playerSpawn.x - PLAYER_WIDTH / 2, playerSpawn.y - PLAYER_HEIGHT / 2);

    // Generates stage 1's timeline up front, the same "ready before Start is
    // even clickable" treatment as the player ship above — startGame()'s
    // `if (state.isOver || !player)` guard around resetRound() only re-fires
    // on a *restart* (once state.isOver or a missing player is true), so
    // without this, the very first-ever "Start Game" click would never
    // generate stage 1's timeline at all: stageDurationMs would still be its
    // initial 0, and maybeAdvanceStage()'s `stageElapsedMs >= stageDurationMs`
    // check (0 >= 0) would fire on the first onUpdate tick and silently skip
    // straight to stage 2.
    startStage(1);
  }

  function scrollLayerPair(a, b, speed, deltaTime) {
    a.pos.y += speed * deltaTime;
    b.pos.y += speed * deltaTime;
    if (a.pos.y >= VIEW_H) a.pos.y -= VIEW_H * 2;
    if (b.pos.y >= VIEW_H) b.pos.y -= VIEW_H * 2;
  }

  // Sparse, purely decorative drift — no area()/collision, tagged
  // "bg-decor" and z-ordered between the star layers and gameplay entities
  // (z(-90), see cleanupBgDecor() for despawn). Asteroids get a slow
  // constant spin via rotateBy(), same technique the platformer's
  // spawnEnemyFragments() already uses for tumbling debris; planets stay
  // static-looking (a barely-there rotation would be imperceptible at this
  // scale and isn't worth the extra motion).
  function spawnBgAsteroid() {
    const spriteName = BG_ASTEROID_SPRITES[Math.floor(Math.random() * BG_ASTEROID_SPRITES.length)];
    const size = rand(20, 36);
    const asteroid = add([
      sprite(spriteName, { width: size, height: size }),
      pos(rand(20, VIEW_W - 20), -size),
      anchor("center"),
      rotate(rand(0, 360)),
      opacity(0.85),
      z(-90),
      "bg-decor",
      { velX: rand(-8, 8), velY: rand(14, 26), rotSpeed: rand(-40, 40) },
    ]);
    asteroid.onUpdate(() => {
      asteroid.pos.x += asteroid.velX * dt();
      asteroid.pos.y += asteroid.velY * dt();
      asteroid.rotateBy(asteroid.rotSpeed * dt());
    });
  }

  function spawnBgPlanet() {
    const spriteName = BG_PLANET_SPRITES[Math.floor(Math.random() * BG_PLANET_SPRITES.length)];
    const size = rand(70, 110);
    const planet = add([
      sprite(spriteName, { width: size, height: size }),
      pos(rand(10, VIEW_W - 10), -size),
      anchor("center"),
      opacity(0.9),
      z(-91),
      "bg-decor",
      { velX: rand(-3, 3), velY: rand(6, 12) },
    ]);
    planet.onUpdate(() => {
      planet.pos.x += planet.velX * dt();
      planet.pos.y += planet.velY * dt();
    });
  }

  function cleanupBgDecor() {
    get("bg-decor").forEach((decor) => {
      if (decor.pos.y > VIEW_H + 90) destroy(decor);
    });
  }

  // A brief on-canvas "STAGE N" banner between stages — same one-shot
  // manual-fade add() idiom as every other fx object in entities.js (no
  // tween()), just living in main.js since it needs no game-object state
  // beyond the stage number.
  function showStageBanner(stageNumber) {
    const banner = add([
      pos(VIEW_W / 2, VIEW_H / 2 - 70),
      anchor("center"),
      text(`STAGE ${stageNumber}`, { size: 26 }),
      color(255, 225, 140),
      opacity(1),
      z(50),
      "fx",
      { lifeMs: STAGE_BANNER_LIFE_MS },
    ]);
    banner.onUpdate(() => {
      banner.lifeMs -= dt() * 1000;
      banner.opacity = Math.max(0, Math.min(1, banner.lifeMs / STAGE_BANNER_LIFE_MS));
      if (banner.lifeMs <= 0) destroy(banner);
    });
  }

  // Generates stage `stageNumber`'s procedural timeline and makes it the
  // active one — called for stage 1 on every resetRound() and again every
  // time maybeAdvanceStage() below decides the current stage is done.
  function startStage(stageNumber, { announce = false } = {}) {
    state.stage = stageNumber;
    const generated = generateStageTimeline(stageNumber, rng);
    stageDurationMs = generated.durationMs;
    stageTimeline = generated.timeline;
    stageElapsedMs = 0;
    spawnPointer = 0;
    if (announce) showStageBanner(stageNumber);
  }

  function spawnFromEntry(entry) {
    if (entry.type === "powerup") {
      // createPowerUp() is anchor("center")-based (see entities.js), unlike
      // every other spawn call here — entry.x's normalized position maps
      // directly to the pickup's center with no half-width offset needed.
      createPowerUp(entry.x * VIEW_W, -30, entry.powerupType);
      return;
    }
    const config = ENEMY_CONFIGS[entry.type];
    const mult = difficultyMultiplier(state.stage);
    createEnemy(entry.type, entry.x * (VIEW_W - config.width), -config.height, mult, mult, getTimeScale);
  }

  function processSpawns() {
    while (spawnPointer < stageTimeline.length && stageTimeline[spawnPointer].tMs <= stageElapsedMs) {
      spawnFromEntry(stageTimeline[spawnPointer]);
      spawnPointer += 1;
    }
  }

  // Endless progression: once this stage's duration has elapsed and every
  // entry in its timeline has been spawned (not necessarily defeated —
  // stragglers just carry over into the next stage's screen), generate and
  // switch to the next one. No terminal "win" — see state.js's STATES.
  function maybeAdvanceStage() {
    if (stageElapsedMs >= stageDurationMs && spawnPointer >= stageTimeline.length) {
      startStage(state.stage + 1, { announce: true });
    }
  }

  // Enemies set a one-frame `wantsFire` flag on themselves (see
  // entities.js) when it's time to shoot — read and cleared here, since
  // only main.js has the live player position createBullet() needs.
  function processEnemyFire() {
    get("enemy").forEach((enemy) => {
      if (!enemy.wantsFire || enemy.defeated) return;
      const fireType = enemy.wantsFire;
      enemy.wantsFire = null;
      const config = ENEMY_CONFIGS[enemy.enemyType];
      const cx = enemy.pos.x + config.width / 2;
      const cy = enemy.pos.y + config.height;
      const bulletOpts = { sprite: config.bulletSprite, height: config.bulletHeight ?? 24 };
      if (fireType === "aimed") {
        if (!player) return;
        const dx = player.pos.x + PLAYER_WIDTH / 2 - cx;
        const dy = player.pos.y + PLAYER_HEIGHT / 2 - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        createBullet("enemy", cx, cy, (dx / dist) * config.bulletSpeed, (dy / dist) * config.bulletSpeed, bulletOpts);
      } else if (fireType === "spread") {
        (config.spreadVelX ?? [-100, 0, 100]).forEach((velX) => {
          createBullet("enemy", cx, cy, velX, config.bulletSpeed, bulletOpts);
        });
      }
    });
  }

  // Manual viewport-bounds cleanup rather than Kaplay's offscreen()
  // component — see entities.js's comment on createBullet() for why.
  // Enemy bullets (not player's) get their velocity scaled by
  // getTimeScale() here, the same Time Dilation hook createEnemy() uses —
  // slowing incoming fire without touching the player's own shots.
  function cleanupOffscreen() {
    get("enemy").forEach((enemy) => {
      if (enemy.pos.y > VIEW_H + 60) destroy(enemy);
    });
    get("bullet").forEach((bullet) => {
      const scale = bullet.is("bullet-enemy") ? getTimeScale() : 1;
      bullet.pos.x += bullet.velX * scale * dt();
      bullet.pos.y += bullet.velY * scale * dt();
      if (bullet.pos.x < -40 || bullet.pos.x > VIEW_W + 40 || bullet.pos.y < -40 || bullet.pos.y > VIEW_H + 40) {
        destroy(bullet);
      }
    });
    get("powerup").forEach((powerup) => {
      if (powerup.pos.y > VIEW_H + 40) destroy(powerup);
    });
  }

  function updatePlayerMovement(deltaTime) {
    let dx = 0;
    let dy = 0;
    if (isButtonDown("left")) dx -= 1;
    if (isButtonDown("right")) dx += 1;
    if (isButtonDown("up")) dy -= 1;
    if (isButtonDown("down")) dy += 1;
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    const speed = PLAYER_SPEED * (state.isSpeedBoosted ? PLAYER_SPEED_BOOST_MULT : 1);
    player.pos.x = Math.min(PLAYER_MAX_X, Math.max(PLAYER_MIN_X, player.pos.x + dx * speed * deltaTime));
    player.pos.y = Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, player.pos.y + dy * speed * deltaTime));
  }

  // Giga-Laser (see applyPowerUp()) swaps the player's shot for a single
  // fast piercing beam using the sliced energy-lance bullet art instead of
  // the normal weapon-level spread — createBullet()'s opts.piercing keeps it
  // from being destroyed on its first hit (see the "bullet-player"/"enemy"
  // collision handler below).
  function firePlayerBullet() {
    const muzzleX = player.pos.x + PLAYER_WIDTH / 2;
    const muzzleY = player.pos.y;
    if (state.isGigaLaser) {
      createBullet("player", muzzleX, muzzleY, 0, -PLAYER_BULLET_SPEED * 1.3, {
        sprite: "player-bullet-giga",
        height: 42,
        piercing: true,
      });
    } else {
      WEAPON_SPREADS[state.weaponLevel - 1].forEach((velX) => {
        createBullet("player", muzzleX, muzzleY, velX, -PLAYER_BULLET_SPEED);
      });
    }
    audio.playShoot();
  }

  function defeatEnemy(enemy) {
    if (enemy.defeated) return;
    enemy.defeated = true;
    const config = ENEMY_CONFIGS[enemy.enemyType];
    const cx = enemy.pos.x + config.width / 2;
    const cy = enemy.pos.y + config.height / 2;
    state.addScore(config.score);
    audio.playEnemyExplosion();
    spawnKillEffect(config.shipId, cx, cy, config, config.width > 50 ? 1.25 : 0.9);
    destroy(enemy);
  }

  function triggerBomb() {
    if (!state.isPlaying || state.bombs <= 0) return;
    state.bombs -= 1;
    audio.playBomb();
    get("bullet-enemy").forEach((bullet) => destroy(bullet));
    get("enemy").forEach((enemy) => {
      if (enemy.defeated) return;
      enemy.health -= BOMB_ENEMY_DAMAGE;
      if (enemy.health <= 0) {
        defeatEnemy(enemy);
      } else {
        enemy.hitFlashMs = ENEMY_HIT_FLASH_MS;
      }
    });
  }

  // Shield Booster absorbs exactly one hit (no life lost) before the normal
  // hit-invincibility/life-loss path runs; power-up Invincibility is a
  // separate, sustained "untouchable" window (state.isPowerInvincible) that
  // bypasses this function entirely, kept distinct from the brief post-hit
  // grace blink (state.isHitInvincible) so the two never visually collide.
  function handlePlayerHit() {
    if (!state.isPlaying || state.isHitInvincible || state.isPowerInvincible) return;
    if (state.shieldCharges > 0) {
      state.shieldCharges = 0;
      audio.playPlayerHit();
      spawnFireBurst(player.pos.x + PLAYER_WIDTH / 2, player.pos.y + PLAYER_HEIGHT / 2, 0.5);
      state.triggerHitInvincibility(HIT_INVINCIBLE_MS);
      return;
    }
    audio.playPlayerHit();
    spawnFireBurst(player.pos.x + PLAYER_WIDTH / 2, player.pos.y + PLAYER_HEIGHT / 2, 0.7);
    const lost = state.loseLife();
    if (lost) {
      finishGameOver();
    } else {
      state.triggerHitInvincibility(HIT_INVINCIBLE_MS);
    }
  }

  // Real effects for 10 of the 35 sliced power-up icons this pass — see
  // entities.js's POWERUP_TYPES and stage.js's POWERUP_UNLOCK_SCHEDULE.
  function applyPowerUp(type) {
    switch (type) {
      case "spread_shot":
        state.raiseWeaponLevel();
        break;
      case "rapid_fire":
        state.triggerRapidFire(POWERUP_DURATIONS_MS.rapid_fire);
        break;
      case "shield_booster":
        state.addShield();
        break;
      case "armor_plating":
        state.addLife();
        break;
      case "invincibility":
        state.triggerInvincibility(POWERUP_DURATIONS_MS.invincibility);
        break;
      case "speed_booster":
        state.triggerSpeedBoost(POWERUP_DURATIONS_MS.speed_booster);
        break;
      case "score_multiplier":
        state.triggerScoreMultiplier(POWERUP_DURATIONS_MS.score_multiplier);
        break;
      case "smart_bomb_reload":
        state.addBomb();
        break;
      case "time_dilation":
        state.triggerSlowMo(POWERUP_DURATIONS_MS.time_dilation);
        break;
      case "giga_laser":
        state.triggerGigaLaser(POWERUP_DURATIONS_MS.giga_laser);
        break;
      default:
        break;
    }
  }

  function renderHighScores() {
    if (!highscoresEl) return;
    const list = loadHighScores();
    if (list.length === 0) {
      highscoresEl.hidden = true;
      highscoresEl.innerHTML = "";
      return;
    }
    highscoresEl.hidden = false;
    highscoresEl.innerHTML = list.map((entry) => `<li>${Number(entry.score) || 0} <span class="skyfire-highscore-stage">(stage ${entry.stage ?? 1})</span></li>`).join("");
  }

  function showOverlay(message, buttonLabel, statsText) {
    overlayEl.hidden = false;
    messageEl.textContent = message;
    startBtn.textContent = buttonLabel;
    if (statsText) {
      statsEl.hidden = false;
      statsEl.textContent = statsText;
    } else {
      statsEl.hidden = true;
      statsEl.textContent = "";
    }
    renderHighScores();
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function finishGameOver() {
    audio.playGameOver();
    const { rank } = submitHighScore(state.score, state.stage);
    if (bestEl) bestEl.textContent = getTopScore();
    showOverlay(rank ? `Game Over — new high score (#${rank})` : "Game Over", "Try Again", `Score: ${state.score} — reached stage ${state.stage}`);
  }

  function resetRound() {
    get("enemy").forEach((enemy) => destroy(enemy));
    get("bullet").forEach((bullet) => destroy(bullet));
    get("powerup").forEach((powerup) => destroy(powerup));
    get("fx").forEach((fx) => destroy(fx));
    rngSeed = (Date.now() ^ 0x9e3779b9) >>> 0;
    rng = mulberry32(rngSeed);
    startStage(1);
    shootCooldownMs = 0;
    if (player) {
      player.pos.x = playerSpawn.x - PLAYER_WIDTH / 2;
      player.pos.y = playerSpawn.y - PLAYER_HEIGHT / 2;
      player.opacity = 1;
    }
  }

  function startGame() {
    audio.initAudio();
    setPaused(false);
    if (state.isOver || !player) {
      state.score = 0;
      state.lives = MAX_LIVES;
      state.bombs = MAX_BOMBS;
      state.weaponLevel = 1;
      state.hitTimer = 0;
      state.shieldCharges = 0;
      state.powerInvincibleMs = 0;
      state.speedBoostMs = 0;
      state.scoreMultiplierMs = 0;
      state.rapidFireMs = 0;
      state.slowMoMs = 0;
      state.gigaLaserMs = 0;
      state.state = STATES.READY;
      resetRound();
    }
    state.start();
    hideOverlay();
    canvas.focus();
  }

  startBtn.addEventListener("click", startGame);

  document.addEventListener("keydown", (e) => {
    if (overlayEl.hidden) return;
    if (e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
      e.preventDefault();
      startGame();
    }
  });

  function syncMuteBtn() {
    if (!muteBtn) return;
    const muted = audio.isMuted();
    muteBtn.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    muteBtn.setAttribute("aria-pressed", String(muted));
  }

  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      audio.toggleMuted();
      syncMuteBtn();
    });
    syncMuteBtn();
  }

  // Pause freezes the whole game loop via Kaplay's own debug.paused switch
  // — same technique and reasoning as javascripts/game/main.js's setPaused().
  function setPaused(value) {
    if (value && !state.isPlaying) return;
    debug.paused = value;
    if (pauseOverlayEl) pauseOverlayEl.hidden = !value;
    if (pauseBtn) pauseBtn.setAttribute("aria-pressed", String(value));
  }

  if (pauseBtn) pauseBtn.addEventListener("click", () => setPaused(!debug.paused));
  if (resumeBtn) resumeBtn.addEventListener("click", () => setPaused(false));

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Escape" && e.code !== "KeyP") return;
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
    if (!overlayEl.hidden) return;
    if (!state.isPlaying && !debug.paused) return;
    e.preventDefault();
    setPaused(!debug.paused);
  });

  onButtonPress("bomb", triggerBomb);

  onCollide("bullet-player", "enemy", (bullet, enemy) => {
    if (!bullet.piercing) destroy(bullet);
    if (!state.isPlaying || enemy.defeated) return;
    enemy.health -= 1;
    if (enemy.health <= 0) {
      defeatEnemy(enemy);
    } else {
      enemy.hitFlashMs = ENEMY_HIT_FLASH_MS;
    }
  });

  onCollide("bullet-enemy", "player", (bullet) => {
    destroy(bullet);
    handlePlayerHit();
  });

  onCollide("player", "enemy", (playerObj, enemy) => {
    if (enemy.defeated) return;
    handlePlayerHit();
  });

  onCollide("player", "powerup", (playerObj, powerup) => {
    if (!state.isPlaying) return;
    spawnPowerUpSparkle(powerup.pos.x, powerup.pos.y);
    applyPowerUp(powerup.powerupType);
    destroy(powerup);
    state.addScore(30);
    audio.playPowerUp();
  });

  onUpdate(() => {
    scoreEl.textContent = state.score;
    livesEl.textContent = state.lives;
    bombsEl.textContent = state.bombs;
    weaponEl.textContent = WEAPON_LABELS[state.weaponLevel - 1];
    if (stageEl) stageEl.textContent = state.stage;

    bgLayers.forEach((layer) => scrollLayerPair(layer.a, layer.b, layer.speed, dt()));

    asteroidTimerSec -= dt();
    if (asteroidTimerSec <= 0) {
      spawnBgAsteroid();
      asteroidTimerSec = rand(BG_ASTEROID_INTERVAL_SEC[0], BG_ASTEROID_INTERVAL_SEC[1]);
    }
    planetTimerSec -= dt();
    if (planetTimerSec <= 0) {
      spawnBgPlanet();
      planetTimerSec = rand(BG_PLANET_INTERVAL_SEC[0], BG_PLANET_INTERVAL_SEC[1]);
    }
    cleanupBgDecor();

    if (!state.isPlaying || !player) return;

    state.tick(dt() * 1000);
    stageElapsedMs += dt() * 1000;
    if (shootCooldownMs > 0) shootCooldownMs -= dt() * 1000;

    player.opacity = state.isHitInvincible || state.isPowerInvincible ? (Math.floor((state.hitTimer || 400) / 90) % 2 === 0 ? 1 : 0.35) : 1;
    updatePlayerPose(player, dt(), Math.max(0.34, state.lives / MAX_LIVES));

    updatePlayerMovement(dt());
    const cooldown = state.isRapidFire ? RAPID_FIRE_COOLDOWN_MS : SHOOT_COOLDOWN_MS;
    if (isButtonDown("fire") && shootCooldownMs <= 0) {
      shootCooldownMs = cooldown;
      firePlayerBullet();
    }

    processSpawns();
    processEnemyFire();
    cleanupOffscreen();
    maybeAdvanceStage();
  });

  buildScene();
  if (bestEl) bestEl.textContent = getTopScore();
  if (messageEl) messageEl.textContent = "Dodge the bullet storm, power up, and survive as many stages as you can.";

  // ============================================================================
  // Dev-only debug hook for testing (completely inert without __NAP_TEST_HOOK__)
  // ============================================================================
  // Same gating mechanism as javascripts/game/main.js's window.__gameDebug —
  // a different global name (window.__skyfireGameDebug) so the two games'
  // hooks never collide if ever loaded together in a test session.
  if (window.__NAP_TEST_HOOK__ === true) {
    window.__skyfireGameDebug = {
      getState: () => ({
        score: state.score,
        lives: state.lives,
        bombs: state.bombs,
        weaponLevel: state.weaponLevel,
        stage: state.stage,
        state: state.state,
        isHitInvincible: state.isHitInvincible,
        isPowerInvincible: state.isPowerInvincible,
        isSpeedBoosted: state.isSpeedBoosted,
        isRapidFire: state.isRapidFire,
        isSlowMo: state.isSlowMo,
        isGigaLaser: state.isGigaLaser,
        isScoreMultiplied: state.isScoreMultiplied,
        shieldCharges: state.shieldCharges,
        isPlaying: state.isPlaying,
        isOver: state.isOver,
        elapsedMs: state.elapsedMs,
        stageElapsedMs,
        stageDurationMs,
      }),
      setState: (patch) => {
        Object.assign(state, patch);
      },
      teleportPlayer: (x, y) => {
        if (player) {
          player.pos.x = x;
          player.pos.y = y;
        }
      },
      getEnemies: () =>
        get("enemy").map((enemy) => ({
          enemyType: enemy.enemyType,
          pos: { x: enemy.pos.x, y: enemy.pos.y },
          health: enemy.health,
          defeated: enemy.defeated,
        })),
      killAllEnemies: () => {
        get("enemy").forEach((enemy) => {
          if (!enemy.defeated) defeatEnemy(enemy);
        });
      },
      forceHit: () => {
        state.hitTimer = 0;
        state.powerInvincibleMs = 0;
        state.shieldCharges = 0;
        handlePlayerHit();
      },
      triggerBomb,
      raiseWeaponLevel: () => state.raiseWeaponLevel(),
      applyPowerUp,
      // Seeds the stage-generation RNG (used *before* startGame()/resetRound()
      // reseeds it — call this, then start the game, for a reproducible
      // stage layout) — see stage.js's mulberry32()/generateStageTimeline().
      setSeed: (seed) => {
        rngSeed = seed >>> 0;
        rng = mulberry32(rngSeed);
      },
      // Jumps straight to stage n's freshly-generated timeline without
      // playing through the intervening stages — the endless-mode
      // replacement for the old single-boss skipToBoss() hook.
      advanceToStage: (n) => {
        startStage(n);
      },
      // Generic tag counter — used by tests to verify e.g. how many
      // "bullet-player" objects a single shot at a given weapon level
      // produces, without needing a dedicated getter per tag.
      countTag: (tag) => get(tag).length,
      getPlayerPos: () => (player ? { x: player.pos.x, y: player.pos.y } : null),
      resetRound,
      startGame,
    };
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
