import kaplay from "../vendor/kaplay.mjs";
import {
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  createPlayerShip,
  ENEMY_CONFIGS,
  ENEMY_HIT_FLASH_MS,
  createEnemy,
  BOSS_WIDTH,
  BOSS_HEIGHT,
  createBoss,
  createBullet,
  createPowerUp,
  spawnPowerUpSparkle,
  spawnFireBurst,
  spawnFireSmokeBurst,
  spawnKillEffect,
} from "./entities.js";
import { STAGE_DURATION_MS, SPAWN_TIMELINE, BOSS_CONFIG } from "./stage.js";
import { GameState, STATES, MAX_LIVES, MAX_BOMBS } from "./state.js";
import { setupTouchControls } from "./input.js";
import { loadHighScores, submitHighScore, getTopScore } from "./highscores.js";
import * as audio from "./audio.js";

// This game deliberately never calls addLevel() (see CLAUDE.md/.claude/rules/
// game.md's addLevel()-once discipline, written for the platformer's static
// tile-based level). A vertical shmup's natural spawning model is a
// continuous time-scheduled stream of enemies (see stage.js's SPAWN_TIMELINE),
// not an authored grid — so every entity here (player, enemies, boss,
// bullets, powerups) is a plain runtime object managed with ordinary add()/
// destroy() calls. Zero addLevel() calls trivially satisfies "at most once";
// this is a deliberate genre-driven choice, not an oversight, and it's also
// why resetRound() below can freely destroy()/recreate everything on a
// restart instead of needing the platformer's hide/pause/reposition dance.

const VIEW_W = 360;
const VIEW_H = 560;

const PLAYER_SPEED = 220;
const PLAYER_MIN_X = 12;
const PLAYER_MAX_X = VIEW_W - 12 - PLAYER_WIDTH;
const PLAYER_MIN_Y = Math.round(VIEW_H * 0.32);
const PLAYER_MAX_Y = VIEW_H - 20 - PLAYER_HEIGHT;

const SHOOT_COOLDOWN_MS = 200;
const PLAYER_BULLET_SPEED = 480;
// Per-weaponLevel (1-3) horizontal velocity fan for the player's shots —
// index 0 is a single straight shot, index 1 a 3-way spread, index 2 a
// wider 5-way spread.
const WEAPON_SPREADS = [[0], [-90, 0, 90], [-170, -85, 0, 85, 170]];
const WEAPON_LABELS = ["I", "II", "III"];

const HIT_INVINCIBLE_MS = 1600;
const NO_DEATH_BONUS = 500;
const STAGE_CLEAR_BONUS = 500;
const BOMB_ENEMY_DAMAGE = 3;
const BOMB_BOSS_DAMAGE = 8;

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
  const bossHealthEl = document.getElementById("skyfire-boss-health");
  const bossHealthFillEl = document.getElementById("skyfire-boss-health-fill");
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
    crisp: true,
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

  loadSprite("player-ship", `${ASSET_BASE}player-ship.png`);
  Object.values(ENEMY_CONFIGS).forEach((config) => {
    loadSprite(config.sprite, `${ASSET_BASE}${config.sprite}.png`);
    for (let i = 0; i < 4; i++) {
      loadSprite(`${config.sprite}-fragment-${i}`, `${ASSET_BASE}${config.sprite}-fragment-${i}.png`);
    }
  });
  loadSprite("boss", `${ASSET_BASE}boss.png`);
  for (let i = 0; i < 4; i++) {
    loadSprite(`boss-fragment-${i}`, `${ASSET_BASE}boss-fragment-${i}.png`);
  }
  loadSprite("bullet-player", `${ASSET_BASE}bullet-player.png`);
  loadSprite("bullet-enemy", `${ASSET_BASE}bullet-enemy.png`);
  loadSprite("powerup-weapon", `${ASSET_BASE}powerup-weapon.png`);
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
  let spawnPointer = 0;
  let boss = null;
  let bossSpawned = false;
  let bgLayers = [];
  let asteroidTimerSec = rand(BG_ASTEROID_INTERVAL_SEC[0], BG_ASTEROID_INTERVAL_SEC[1]);
  let planetTimerSec = rand(BG_PLANET_INTERVAL_SEC[0], BG_PLANET_INTERVAL_SEC[1]);

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

  function updateBossHealthBar() {
    if (!boss || !bossHealthFillEl) return;
    const pct = Math.max(0, (boss.health / boss.maxHealth) * 100);
    bossHealthFillEl.style.width = `${pct}%`;
  }

  function spawnFromEntry(entry) {
    if (entry.type === "powerup") {
      // createPowerUp() is anchor("center")-based (see entities.js), unlike
      // every other spawn call here — entry.x's normalized position maps
      // directly to the pickup's center with no half-width offset needed.
      createPowerUp(entry.x * VIEW_W, -30);
      return;
    }
    const config = ENEMY_CONFIGS[entry.type];
    createEnemy(entry.type, entry.x * (VIEW_W - config.width), -config.height);
  }

  function spawnBoss() {
    boss = createBoss(VIEW_W / 2 - BOSS_WIDTH / 2, -BOSS_HEIGHT - 20, BOSS_CONFIG);
    if (bossHealthEl) bossHealthEl.hidden = false;
    updateBossHealthBar();
  }

  function processSpawns() {
    while (spawnPointer < SPAWN_TIMELINE.length && SPAWN_TIMELINE[spawnPointer].tMs <= state.elapsedMs) {
      spawnFromEntry(SPAWN_TIMELINE[spawnPointer]);
      spawnPointer += 1;
    }
    if (!bossSpawned && !boss && state.elapsedMs >= STAGE_DURATION_MS) {
      bossSpawned = true;
      spawnBoss();
    }
  }

  // Enemies/boss set a one-frame `wantsFire` flag on themselves (see
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
      if (fireType === "aimed") {
        if (!player) return;
        const dx = player.pos.x + PLAYER_WIDTH / 2 - cx;
        const dy = player.pos.y + PLAYER_HEIGHT / 2 - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        createBullet("enemy", cx - 3, cy, (dx / dist) * config.bulletSpeed, (dy / dist) * config.bulletSpeed);
      } else if (fireType === "spread") {
        [-100, 0, 100].forEach((velX) => {
          createBullet("enemy", cx - 3, cy, velX, config.bulletSpeed);
        });
      }
    });
  }

  function processBossFire() {
    if (!boss || !boss.wantsFire || boss.defeated) return;
    const { pattern, bulletSpeed } = boss.wantsFire;
    boss.wantsFire = null;
    const cx = boss.pos.x + BOSS_WIDTH / 2;
    const cy = boss.pos.y + BOSS_HEIGHT - 16;
    if (pattern === "aimed" && player) {
      [-24, 24].forEach((offsetX) => {
        const dx = player.pos.x + PLAYER_WIDTH / 2 - (cx + offsetX);
        const dy = player.pos.y + PLAYER_HEIGHT / 2 - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        createBullet("enemy", cx + offsetX - 3, cy, (dx / dist) * bulletSpeed, (dy / dist) * bulletSpeed);
      });
    } else {
      [-140, -70, 0, 70, 140].forEach((velX) => {
        createBullet("enemy", cx - 3, cy, velX, bulletSpeed);
      });
    }
  }

  // Manual viewport-bounds cleanup rather than Kaplay's offscreen()
  // component — see entities.js's comment on createBullet() for why.
  function cleanupOffscreen() {
    get("enemy").forEach((enemy) => {
      if (enemy.pos.y > VIEW_H + 60) destroy(enemy);
    });
    get("bullet").forEach((bullet) => {
      bullet.pos.x += bullet.velX * dt();
      bullet.pos.y += bullet.velY * dt();
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
    player.pos.x = Math.min(PLAYER_MAX_X, Math.max(PLAYER_MIN_X, player.pos.x + dx * PLAYER_SPEED * deltaTime));
    player.pos.y = Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, player.pos.y + dy * PLAYER_SPEED * deltaTime));
  }

  function firePlayerBullet() {
    const muzzleX = player.pos.x + PLAYER_WIDTH / 2;
    const muzzleY = player.pos.y;
    WEAPON_SPREADS[state.weaponLevel - 1].forEach((velX) => {
      createBullet("player", muzzleX - 3, muzzleY, velX, -PLAYER_BULLET_SPEED);
    });
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
    spawnKillEffect(`enemy-${enemy.enemyType}`, cx, cy, config, config.width > 48 ? 1.2 : 0.85);
    destroy(enemy);
  }

  // Staggered multi-burst finale (a few small offset bursts, then one large
  // final blast) rather than a single bigger explosion — wait() is the same
  // sequencing primitive the platformer already uses for its own win
  // flourish (see javascripts/game/main.js). state/score/high-score
  // bookkeeping in winRound() below still runs immediately here (so
  // debug-hook-driven tests observe WIN state and persisted scores right
  // away, see dev/tests/skyfire-*.mjs) — only the win overlay's DOM reveal
  // is deferred by the finale's duration via winRound()'s revealDelaySec,
  // so the overlay doesn't cover the burst sequence while it's still playing.
  const BOSS_FINALE_BURST_OFFSETS = [
    [-30, -20],
    [25, 15],
    [-15, 30],
    [10, -25],
  ];
  const BOSS_FINALE_BURST_INTERVAL_SEC = 0.18;
  const BOSS_FINALE_OVERLAY_GRACE_SEC = 0.5;

  function defeatBoss() {
    if (!boss || boss.defeated) return;
    boss.defeated = true;
    const bx = boss.pos.x + BOSS_WIDTH / 2;
    const by = boss.pos.y + BOSS_HEIGHT / 2;
    audio.playBossExplosion();
    destroy(boss);
    boss = null;
    if (bossHealthEl) bossHealthEl.hidden = true;

    BOSS_FINALE_BURST_OFFSETS.forEach((offset, i) => {
      wait(i * BOSS_FINALE_BURST_INTERVAL_SEC, () => spawnFireSmokeBurst(bx + offset[0], by + offset[1], rand(0.8, 1.4)));
    });
    const finaleDurationSec = BOSS_FINALE_BURST_OFFSETS.length * BOSS_FINALE_BURST_INTERVAL_SEC;
    wait(finaleDurationSec, () => spawnKillEffect("boss", bx, by, { width: BOSS_WIDTH, height: BOSS_HEIGHT }, 3.2));

    state.addScore(BOSS_CONFIG.scoreValue);
    winRound(finaleDurationSec + BOSS_FINALE_OVERLAY_GRACE_SEC);
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
    if (boss && !boss.defeated) {
      boss.health -= BOMB_BOSS_DAMAGE;
      boss.hitFlashMs = ENEMY_HIT_FLASH_MS;
      updateBossHealthBar();
      if (boss.health <= 0) defeatBoss();
    }
  }

  function handlePlayerHit() {
    if (!state.isPlaying || state.isHitInvincible) return;
    audio.playPlayerHit();
    spawnFireBurst(player.pos.x + PLAYER_WIDTH / 2, player.pos.y + PLAYER_HEIGHT / 2, 0.7);
    const lost = state.loseLife();
    if (lost) {
      finishGameOver();
    } else {
      state.triggerHitInvincibility(HIT_INVINCIBLE_MS);
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
    highscoresEl.innerHTML = list.map((entry) => `<li>${Number(entry.score) || 0}</li>`).join("");
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

  // revealDelaySec defers only the overlay's DOM reveal (see defeatBoss()'s
  // finale sequencing above) — every state/score/persistence side effect
  // below still happens synchronously regardless of the delay.
  function winRound(revealDelaySec = 0) {
    state.win();
    state.addScore(STAGE_CLEAR_BONUS + (state.tookDamage ? 0 : NO_DEATH_BONUS));
    audio.playWin();
    const { rank } = submitHighScore(state.score);
    if (bestEl) bestEl.textContent = getTopScore();
    const revealOverlay = () => showOverlay(rank ? `Stage Clear! New high score (#${rank})` : "Stage Clear!", "Play Again", `Score: ${state.score}`);
    if (revealDelaySec > 0) {
      wait(revealDelaySec, revealOverlay);
    } else {
      revealOverlay();
    }
  }

  function finishGameOver() {
    audio.playGameOver();
    const { rank } = submitHighScore(state.score);
    if (bestEl) bestEl.textContent = getTopScore();
    showOverlay(rank ? `Game Over — new high score (#${rank})` : "Game Over", "Try Again", `Score: ${state.score}`);
  }

  function resetRound() {
    get("enemy").forEach((enemy) => destroy(enemy));
    get("bullet").forEach((bullet) => destroy(bullet));
    get("powerup").forEach((powerup) => destroy(powerup));
    get("fx").forEach((fx) => destroy(fx));
    if (boss) {
      destroy(boss);
      boss = null;
    }
    if (bossHealthEl) bossHealthEl.hidden = true;
    spawnPointer = 0;
    bossSpawned = false;
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
    destroy(bullet);
    if (!state.isPlaying || enemy.defeated) return;
    enemy.health -= 1;
    if (enemy.health <= 0) {
      defeatEnemy(enemy);
    } else {
      enemy.hitFlashMs = ENEMY_HIT_FLASH_MS;
    }
  });

  onCollide("bullet-player", "boss", (bullet) => {
    destroy(bullet);
    if (!state.isPlaying || !boss || boss.defeated) return;
    boss.health -= 1;
    updateBossHealthBar();
    if (boss.health <= 0) {
      defeatBoss();
    } else {
      boss.hitFlashMs = ENEMY_HIT_FLASH_MS;
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

  onCollide("player", "boss", () => {
    if (!boss || boss.defeated) return;
    handlePlayerHit();
  });

  onCollide("player", "powerup", (playerObj, powerup) => {
    if (!state.isPlaying) return;
    spawnPowerUpSparkle(powerup.pos.x, powerup.pos.y);
    destroy(powerup);
    state.raiseWeaponLevel();
    state.addScore(30);
    audio.playPowerUp();
  });

  onUpdate(() => {
    scoreEl.textContent = state.score;
    livesEl.textContent = state.lives;
    bombsEl.textContent = state.bombs;
    weaponEl.textContent = WEAPON_LABELS[state.weaponLevel - 1];

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
    if (shootCooldownMs > 0) shootCooldownMs -= dt() * 1000;

    player.opacity = state.isHitInvincible ? (Math.floor(state.hitTimer / 90) % 2 === 0 ? 1 : 0.35) : 1;

    updatePlayerMovement(dt());
    if (isButtonDown("fire") && shootCooldownMs <= 0) {
      shootCooldownMs = SHOOT_COOLDOWN_MS;
      firePlayerBullet();
    }

    processSpawns();
    processEnemyFire();
    processBossFire();
    cleanupOffscreen();
    if (boss) updateBossHealthBar();
  });

  buildScene();
  if (bestEl) bestEl.textContent = getTopScore();
  if (messageEl) messageEl.textContent = "Dodge the bullet storm, power up, and take down the boss.";

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
        state: state.state,
        isHitInvincible: state.isHitInvincible,
        isPlaying: state.isPlaying,
        isOver: state.isOver,
        elapsedMs: state.elapsedMs,
        bossActive: !!boss,
        bossHealth: boss ? boss.health : null,
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
      skipToBoss: () => {
        state.elapsedMs = STAGE_DURATION_MS;
      },
      forceHit: () => {
        state.hitTimer = 0;
        handlePlayerHit();
      },
      triggerBomb,
      raiseWeaponLevel: () => state.raiseWeaponLevel(),
      // Generic tag counter — used by tests to verify e.g. how many
      // "bullet-player" objects a single shot at a given weapon level
      // produces, without needing a dedicated getter per tag.
      countTag: (tag) => get(tag).length,
      getPlayerPos: () => (player ? { x: player.pos.x, y: player.pos.y } : null),
      winRound,
      defeatBoss,
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
