import kaplay from "../vendor/kaplay.mjs";
import { LEVEL_MAP, LEVEL_WIDTH, LEVEL_HEIGHT, TILE_SIZE } from "./level.js";
import {
  PLAYER_ANIMS,
  LEGS_ANIMS,
  PLAYER_HEIGHT,
  ENEMY_CONFIGS,
  ENEMY_HIT_FLASH_MS,
  BULLET_SPEED,
  createPlayer,
  createEnemy,
  createBullet,
} from "./entities.js";
import { createCollectible, createGoal, createPole, POLE_HEIGHT } from "./collectibles.js";
import { GameState, MAX_REDUNDANCY, STATES } from "./state.js";
import { setupTouchControls } from "./input.js";
import { loadHighScores, submitHighScore, getTopScore } from "./highscores.js";
import * as audio from "./audio.js";

const VIEW_W = 480;
const VIEW_H = 240;
const GRAVITY = 2400;
const JUMP_FORCE = 820;
const MOVE_SPEED = 200;
const POWER_DURATION_MS = 8000;
const HIT_INVINCIBLE_MS = 1400;
const HIT_STUN_MS = 220;
const SHOOT_COOLDOWN_MS = 260;
const CLIMB_SPEED = 210;
const FALL_DEATH_Y = LEVEL_HEIGHT + 200;

// End-of-run bonus tuning (winRound()) — rewards a clean, fast run on top
// of the existing Full Deploy/pole-climb bonuses.
const REDUNDANCY_BONUS_PER_NODE = 100;
const NO_POWER_BONUS = 250;
const NO_HEAL_BONUS = 250;
const SPEED_BONUS_MAX = 1000;
const SPEED_BONUS_DECAY_PER_SEC = 8;

const ENEMY_SYMBOLS = { b: "bug", l: "latency-spike", p: "failed-pipeline", o: "outage" };

const ASSET_BASE = new URL("./assets/", import.meta.url).href;

// Responsive canvas sizing: instead of leaning on CSS aspect-ratio alone
// (which left the floor row clipped on at least one real mobile browser in
// portrait orientation), the frame's pixel height is computed explicitly
// from its own measured width on every resize/orientation change. Kaplay's
// internal render resolution stays fixed at VIEW_W x VIEW_H throughout —
// see the kaplay({width,height,...}) call below, which (with no `stretch`
// or `letterbox` option) makes Kaplay's own resize handler a no-op — so
// this only ever controls the CSS box the fixed-resolution canvas is
// scaled into.
function layoutCanvas() {
  const wrap = document.querySelector(".game-wrap");
  const frame = document.querySelector(".game-canvas-frame");
  if (!wrap || !frame) return;
  const w = wrap.clientWidth;
  if (w <= 0) return;
  const h = Math.round((w * VIEW_H) / VIEW_W);
  frame.style.height = `${h}px`;
}

function init() {
  const canvas = document.getElementById("platformer-canvas");
  if (!canvas) return;

  layoutCanvas();
  window.addEventListener("resize", layoutCanvas);
  window.addEventListener("orientationchange", () => setTimeout(layoutCanvas, 60));

  const scoreEl = document.getElementById("game-score");
  const bestEl = document.getElementById("game-best");
  const redundancyEl = document.getElementById("game-redundancy");
  const redundancyNodes = redundancyEl ? Array.from(redundancyEl.querySelectorAll("[data-node]")) : [];
  const powerEl = document.getElementById("game-power");
  const powerTimerEl = document.getElementById("game-power-timer");
  const overlayEl = document.getElementById("game-overlay");
  const messageEl = document.getElementById("game-message");
  const bonusesEl = document.getElementById("game-bonuses");
  const highscoresEl = document.getElementById("game-highscores");
  const startBtn = document.getElementById("game-start");
  const muteBtn = document.getElementById("game-mute");
  const touchControls = document.getElementById("game-touch-controls");
  const hitFlashEl = document.getElementById("game-hit-flash");

  kaplay({
    canvas,
    width: VIEW_W,
    height: VIEW_H,
    background: [18, 16, 19],
    crisp: true,
    global: true,
    buttons: {
      left: { keyboard: ["left", "a"] },
      right: { keyboard: ["right", "d"] },
      jump: { keyboard: ["space", "up", "w"] },
      shoot: { keyboard: ["e", "j", "control"] },
    },
  });

  // Kaplay (given explicit width/height and no stretch/letterbox option)
  // hard-codes the canvas's own inline style to a FIXED "480px"/"240px" —
  // not a percentage — regardless of how big or small its parent actually
  // is. That's harmless as long as the frame happens to render at exactly
  // 480x240 CSS px, but on any narrower box (e.g. a phone in portrait,
  // where .game-wrap shrinks below 480px) the fixed-size canvas overflows
  // its frame and `overflow: hidden` on .game-canvas-frame silently clips
  // whatever sits past the bottom edge — which is exactly the ground row.
  // Overriding it to fill the frame (matching #platformer-canvas's own
  // width/height:100% in the stylesheet) is what actually fixes that.
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  loadSprite("player", `${ASSET_BASE}player.png`, { sliceX: 8, sliceY: 8, anims: PLAYER_ANIMS });
  loadSprite("player-torso", `${ASSET_BASE}player-torso.png`);
  loadSprite("player-legs", `${ASSET_BASE}player-legs.png`, { sliceX: 4, sliceY: 1, anims: LEGS_ANIMS });
  Object.values(ENEMY_CONFIGS).forEach((config) => {
    config.sprites.forEach((name) => loadSprite(name, `${ASSET_BASE}${name}.png`));
  });
  loadSprite("collectible-cash", `${ASSET_BASE}collectible-cash.png`);
  loadSprite("powerup-root-access", `${ASSET_BASE}powerup-root-access.png`);
  loadSprite("collectible-redundancy", `${ASSET_BASE}collectible-redundancy.png`);
  loadSprite("goal-terminal", `${ASSET_BASE}goal-terminal.png`);
  loadSprite("bg-subway", `${ASSET_BASE}bg-subway.png`);
  loadSprite("tile-ground", `${ASSET_BASE}tile-ground.png`);
  loadSprite("tile-platform", `${ASSET_BASE}tile-platform.png`);
  loadSprite("bullet-player", `${ASSET_BASE}bullet-player.png`);
  loadSprite("bullet-enemy", `${ASSET_BASE}bullet-enemy.png`);
  loadSprite("bonus-flag", `${ASSET_BASE}bonus-flag.png`);

  setGravity(GRAVITY);
  setupTouchControls(touchControls);

  const state = new GameState();
  let player;
  let playerSpawn = { x: 0, y: 0 };
  let totalCollectibles = 0;
  let collectedCount = 0;
  let shootCooldownMs = 0;
  // Counts down after a side-hit knockback; while > 0, the movement input
  // block below leaves player.vel.x alone instead of overwriting it every
  // frame, so the knockback shove is actually visible instead of being
  // clobbered same-frame by whatever direction key is held.
  let hitStunMs = 0;
  // Which root-object sprite layer is currently active — "full" (the
  // original sheet, used only while airborne) or "torso" (grounded,
  // legs-less crop, with the separate legs child carrying the walk cycle).
  // Tracked locally rather than queried off the sprite component each
  // frame so the .use() swap below only happens on an actual transition.
  let playerLayer = "full";
  // Non-null while the player is riding the bonus pole down to the goal —
  // see the "pole" collision handler and updateClimb() below.
  let climb = null;

  function buildLevel() {
    collectedCount = 0;
    totalCollectibles = 0;

    // Tiled background layer, well behind everything else. buildLevel()
    // only ever runs once (see resetRound()'s comment), so this is created
    // exactly once too.
    add([
      sprite("bg-subway", { width: LEVEL_WIDTH, height: VIEW_H, tiled: true }),
      pos(0, 0),
      z(-100),
      "background",
    ]);

    const groundRow = LEVEL_MAP.length - 1;

    addLevel(LEVEL_MAP, {
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tiles: {
        "#": (tilePos) => {
          const isGroundRow = tilePos.y === groundRow;
          const tileSprite = isGroundRow ? "tile-ground" : "tile-platform";

          if (isGroundRow) {
            // Ground tiles bordering a gap get a bright warning cap so pits
            // read as hazards instead of blending into the walkable run —
            // both were otherwise just plain ground tiles.
            const row = LEVEL_MAP[tilePos.y] ?? "";
            const leftChar = tilePos.x > 0 ? row[tilePos.x - 1] : "#";
            const rightChar = tilePos.x < row.length - 1 ? row[tilePos.x + 1] : "#";
            const isEdge = leftChar !== "#" || rightChar !== "#";
            if (isEdge) {
              add([
                rect(TILE_SIZE, 6),
                pos(tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE),
                color(rgb(255, 200, 40)),
                z(1),
              ]);
            }
            return [
              sprite(tileSprite),
              area(),
              body({ isStatic: true }),
              isEdge ? "ground-edge" : "ground",
            ];
          }

          return [sprite(tileSprite), area(), body({ isStatic: true }), "ground"];
        },
        // addLevel calls these with grid (col, row) coordinates, not pixel
        // positions — only a factory's own unmodified returned component
        // list gets auto-converted via the level's internal tile2Pos().
        // Since these factories build free-standing objects themselves
        // instead of returning components, they must scale by TILE_SIZE.
        "@": (tilePos) => {
          playerSpawn = { x: tilePos.x * TILE_SIZE, y: tilePos.y * TILE_SIZE };
          player = createPlayer(playerSpawn.x, playerSpawn.y);
          return [];
        },
        b: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.b, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          return [];
        },
        l: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.l, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          return [];
        },
        p: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.p, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          return [];
        },
        o: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.o, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          return [];
        },
        c: (tilePos) => {
          createCollectible("cash", tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalCollectibles += 1;
          return [];
        },
        k: (tilePos) => {
          createCollectible("root-access", tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalCollectibles += 1;
          return [];
        },
        // Not counted toward totalCollectibles/the Full Deploy bonus — a
        // full-health run shouldn't need to fish for a heal it doesn't need
        // just to hit 100%.
        r: (tilePos) => {
          createCollectible("redundancy", tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          return [];
        },
        F: (tilePos) => {
          const baseX = tilePos.x * TILE_SIZE;
          const groundY = (tilePos.y + 1) * TILE_SIZE;
          createPole(baseX, groundY);
          return [];
        },
        g: (tilePos) => {
          createGoal(tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          return [];
        },
      },
    });
  }

  function clearBullets() {
    get("bullet").forEach((bullet) => destroy(bullet));
  }

  function resetRound() {
    // Never call destroyAll()/addLevel() again after the initial buildLevel()
    // — a second call silently wedges Kaplay's entire update loop (the HUD
    // just stops updating, no thrown error), regardless of where it's
    // called from. So every "reset" (full restart or a mid-round respawn)
    // works by repositioning/reviving existing objects instead of
    // destroying and rebuilding the level. Runtime-only objects that never
    // went through addLevel() — bullets — are the one thing safe to
    // destroy() outright.
    collectedCount = 0;
    climb = null;
    hitStunMs = 0;
    playerLayer = "full";
    player.use(sprite("player", { anim: "idle" }));
    player.legs.hidden = true;
    clearBullets();
    player.pos.x = playerSpawn.x;
    player.pos.y = playerSpawn.y;
    player.vel.x = 0;
    player.vel.y = 0;
    player.opacity = 1;
    get("enemy").forEach((enemy) => {
      enemy.hidden = false;
      enemy.paused = false;
      enemy.defeated = false;
      enemy.pos.x = enemy.spawnX;
      enemy.pos.y = enemy.spawnY;
      enemy.vel.x = 0;
      enemy.vel.y = 0;
      enemy.dir = 1;
      enemy.shootTimer = ENEMY_CONFIGS[enemy.enemyType].shootIntervalSec ?? Infinity;
      enemy.readyToFire = false;
      enemy.health = ENEMY_CONFIGS[enemy.enemyType].health;
      enemy.hitFlashMs = 0;
      enemy.opacity = 1;
    });
    get("collectible").forEach((item) => {
      item.hidden = false;
      item.collected = false;
      item.pos.x = item.spawnX;
      item.pos.y = item.spawnY;
    });
    get("pole").forEach((pole) => {
      pole.climbed = false;
    });
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
    highscoresEl.innerHTML = list.map((entry) => `<li>${entry.score}</li>`).join("");
  }

  function renderBonuses(lines) {
    if (!bonusesEl) return;
    if (!lines || lines.length === 0) {
      bonusesEl.hidden = true;
      bonusesEl.innerHTML = "";
      return;
    }
    bonusesEl.hidden = false;
    bonusesEl.innerHTML = lines.map((line) => `<li>${line}</li>`).join("");
  }

  function showOverlay(message, buttonLabel, bonusLines) {
    overlayEl.hidden = false;
    messageEl.textContent = message;
    startBtn.textContent = buttonLabel;
    renderBonuses(bonusLines);
    renderHighScores();
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function startGame() {
    audio.initAudio();
    if (state.isOver || !player) {
      state.score = 0;
      state.redundancy = MAX_REDUNDANCY;
      state.powerTimer = 0;
      state.hitTimer = 0;
      state.state = STATES.READY;
      resetRound();
    }
    state.start();
    hideOverlay();
    // Clicking the overlay button moves DOM focus onto it; Kaplay reads
    // keyboard input relative to the canvas, so without this, arrow/WASD
    // presses can stop registering after Start/Try Again is clicked even
    // though the game looks like it resumed.
    canvas.focus();
  }

  startBtn.addEventListener("click", startGame);

  // Keyboard alternative to clicking Start/Try Again/Play Again. Listens on
  // the document (not Kaplay's own button system, which only reads input
  // relative to the focused canvas and is gated behind state.isPlaying
  // anyway) so it works the instant the overlay appears, before the canvas
  // has focus.
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

  buildLevel();
  if (bestEl) bestEl.textContent = getTopScore();
  showOverlay("Run, jump, and reach Deploy to Production.", "Start Game");

  function triggerHitFlash() {
    if (!hitFlashEl) return;
    hitFlashEl.classList.remove("is-active");
    // Force a reflow so re-adding the class restarts the CSS animation even
    // if a previous flash is still fading out from a hit taken moments ago.
    void hitFlashEl.offsetWidth;
    hitFlashEl.classList.add("is-active");
  }

  function respawnAfterHit() {
    // Reposition in place rather than touching the level's object graph at
    // all — still-defeated enemies and still-collected items stay gone,
    // matching the original game's "keep your progress" behavior; only the
    // player and any surviving enemies move back to their spawn points.
    player.pos.x = playerSpawn.x;
    player.pos.y = playerSpawn.y;
    player.vel.x = 0;
    player.vel.y = 0;
    get("enemy").forEach((enemy) => {
      if (enemy.defeated) return;
      enemy.pos.x = enemy.spawnX;
      enemy.pos.y = enemy.spawnY;
      enemy.vel.x = 0;
      enemy.vel.y = 0;
      enemy.dir = 1;
    });
  }

  function handlePlayerHit(sourceLabel, opts = {}) {
    // A hit no longer pauses play for a "Continue" click — it costs a
    // redundancy node, flashes/knocks the player back, and grants a brief
    // grace period (see state.isHitInvincible) during which the player can
    // neither be hit again nor defeat anything, then play carries on.
    if (state.isHitInvincible) return;
    const gameOver = state.loseSegment();
    triggerHitFlash();
    audio.playHit();
    if (gameOver) {
      const { rank } = submitHighScore(state.score);
      if (bestEl) bestEl.textContent = getTopScore();
      const scoreNote = rank === 1 ? " New best!" : rank ? " High score!" : "";
      audio.playLose();
      showOverlay(`Redundancy exhausted — taken down by ${sourceLabel}. Game over.${scoreNote}`, "Try Again");
      return;
    }
    state.triggerHitInvincibility(HIT_INVINCIBLE_MS);
    if (opts.respawn) {
      respawnAfterHit();
    } else if (opts.knockbackDir) {
      // No manufactured vertical pop here — that used to double as a free
      // jump that could carry the player clear across a pit they never
      // intentionally jumped for. Gravity still governs vel.y normally, so
      // a hit taken mid-air still arcs from whatever momentum it already
      // had; hitStunMs just holds the horizontal shove for a beat instead
      // of letting the input block overwrite it the very next frame.
      player.vel.x = opts.knockbackDir * 220;
      hitStunMs = HIT_STUN_MS;
    }
  }

  function defeatEnemy(enemy, scoreValue) {
    // Never destroy() — see the comment in resetRound(). Hiding + pausing +
    // moving far away is functionally equivalent (invisible, inert, can't
    // collide) without ever touching the object graph after initial build.
    // Score is granted here, on the actual kill, rather than at each call
    // site — a stomp/Root-Access touch is always an instant kill regardless
    // of remaining health, but a bullet only reaches here on the hit that
    // brings health to 0, so multi-hit enemies never over-reward chip damage.
    audio.playEnemyDefeated();
    enemy.defeated = true;
    enemy.hidden = true;
    enemy.paused = true;
    enemy.pos.x = -9999;
    state.addScore(scoreValue);
  }

  function winRound(bonus, bonusLabel) {
    if (state.isOver) return;
    let total = bonus;
    const bonusLines = [];
    if (bonusLabel) bonusLines.push(bonusLabel);
    if (totalCollectibles > 0 && collectedCount >= totalCollectibles) {
      total += 300;
      bonusLines.push("Full Deploy bonus +300!");
    }
    // Clean-run bonuses — reward finishing with redundancy to spare, never
    // touching Root Access, never needing the heal pickup, and finishing
    // quickly, on top of the completion bonuses above. Each is skipped
    // entirely (no line, no score) when it comes out to 0.
    const redundancyBonus = state.redundancy * REDUNDANCY_BONUS_PER_NODE;
    if (redundancyBonus > 0) {
      total += redundancyBonus;
      const nodeWord = state.redundancy === 1 ? "node" : "nodes";
      bonusLines.push(`Redundancy bonus +${redundancyBonus}! (${state.redundancy} ${nodeWord} left)`);
    }
    if (!state.usedPower) {
      total += NO_POWER_BONUS;
      bonusLines.push(`No Root Access needed +${NO_POWER_BONUS}!`);
    }
    if (!state.usedHeal) {
      total += NO_HEAL_BONUS;
      bonusLines.push(`Self-healing-free +${NO_HEAL_BONUS}!`);
    }
    const elapsedSeconds = state.elapsedMs / 1000;
    const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX - elapsedSeconds * SPEED_BONUS_DECAY_PER_SEC));
    if (speedBonus > 0) {
      total += speedBonus;
      bonusLines.push(`Speed bonus +${speedBonus}!`);
    }
    if (total > 0) state.addScore(total);
    state.win();
    audio.playWin();
    const { rank } = submitHighScore(state.score);
    if (bestEl) bestEl.textContent = getTopScore();
    let message = "Deployed to production!";
    if (rank === 1) message += " New best!";
    else if (rank) message += " High score!";
    showOverlay(message, "Play Again", bonusLines);
  }

  function updateClimb() {
    player.vel.x = 0;
    player.vel.y = CLIMB_SPEED;
    player.pos.x = climb.poleX;
    if (player.pos.y >= climb.poleBottom - PLAYER_HEIGHT) {
      player.pos.y = climb.poleBottom - PLAYER_HEIGHT;
      const bonus = Math.round((climb.grabHeight / POLE_HEIGHT) * 1000);
      climb = null;
      winRound(bonus, bonus > 0 ? `Root climb bonus +${bonus}!` : "");
    }
  }

  onUpdate(() => {
    // HUD must stay in sync even during the brief hit/invincibility grace
    // period — never gate these behind isPlaying, or the last hit taken
    // won't show until the next frame of active play.
    scoreEl.textContent = state.score;
    redundancyNodes.forEach((node, i) => {
      node.classList.toggle("is-up", i < state.redundancy);
      node.classList.toggle("is-down", i >= state.redundancy);
    });
    if (state.isPowered) {
      powerEl.hidden = false;
      powerTimerEl.textContent = Math.ceil(state.powerTimer / 1000);
    } else {
      powerEl.hidden = true;
    }

    if (!state.isPlaying || !player) return;

    state.tick(dt() * 1000);
    if (shootCooldownMs > 0) shootCooldownMs -= dt() * 1000;
    if (hitStunMs > 0) hitStunMs -= dt() * 1000;

    player.opacity = state.isHitInvincible ? (Math.floor(state.hitTimer / 90) % 2 === 0 ? 1 : 0.35) : 1;
    player.legs.opacity = player.opacity;

    if (climb) {
      updateClimb();
      return;
    }

    if (hitStunMs <= 0) {
      if (isButtonDown("left")) {
        player.vel.x = -MOVE_SPEED;
        player.flipX = true;
      } else if (isButtonDown("right")) {
        player.vel.x = MOVE_SPEED;
        player.flipX = false;
      } else {
        player.vel.x = 0;
      }
    }
    // Grounded: swap the root object to the legs-less torso crop and let
    // the separate legs child (see createPlayer()) carry the walk cycle.
    // Airborne: swap back to the original full sheet's static jump frame,
    // which already has its own baked-in legs, and hide the legs child so
    // it doesn't double up.
    if (player.isGrounded()) {
      if (playerLayer !== "torso") {
        player.use(sprite("player-torso"));
        playerLayer = "torso";
      }
      player.legs.hidden = false;
      const desiredLegsAnim = player.vel.x !== 0 ? "run" : "stand";
      if (player.legs.getCurAnim()?.name !== desiredLegsAnim) player.legs.play(desiredLegsAnim);
    } else {
      if (playerLayer !== "full") {
        player.use(sprite("player", { anim: "jump" }));
        playerLayer = "full";
      }
      player.legs.hidden = true;
    }
    player.legs.flipX = player.flipX;

    if (player.pos.y > FALL_DEATH_Y) {
      handlePlayerHit("a fall", { respawn: true });
    }

    get("enemy").forEach((enemy) => {
      if (!enemy.readyToFire) return;
      enemy.readyToFire = false;
      const dir = player.pos.x < enemy.pos.x ? -1 : 1;
      enemy.flipX = dir < 0;
      createBullet("enemy", enemy.pos.x + (dir > 0 ? 30 : -10), enemy.pos.y + 14, dir);
    });

    get("bullet").forEach((bullet) => {
      bullet.pos.x += bullet.dir * BULLET_SPEED * dt();
      if (bullet.pos.x < -40 || bullet.pos.x > LEVEL_WIDTH + 40) destroy(bullet);
    });

    const camX = Math.min(Math.max(player.pos.x, VIEW_W / 2), LEVEL_WIDTH - VIEW_W / 2);
    setCamPos(camX, VIEW_H / 2);
  });

  onButtonPress("jump", () => {
    if (state.isPlaying && player && !climb && hitStunMs <= 0 && player.isGrounded()) {
      player.jump(JUMP_FORCE);
      audio.playJump();
    }
  });

  onButtonPress("shoot", () => {
    if (!state.isPlaying || !player || climb || shootCooldownMs > 0) return;
    shootCooldownMs = SHOOT_COOLDOWN_MS;
    const dir = player.flipX ? -1 : 1;
    createBullet("player", player.pos.x + (dir > 0 ? 42 : -12), player.pos.y + 16, dir);
    audio.playShoot();
  });

  onCollide("player", "enemy", (playerObj, enemy, col) => {
    if (!state.isPlaying || enemy.defeated || climb) return;
    if (state.isHitInvincible) return;
    if (state.isPowered) {
      defeatEnemy(enemy, 200);
      return;
    }
    if (col && col.isBottom()) {
      defeatEnemy(enemy, 200);
      playerObj.jump(JUMP_FORCE / 2);
    } else {
      handlePlayerHit(enemy.label, { knockbackDir: playerObj.pos.x < enemy.pos.x ? -1 : 1 });
    }
  });

  onCollide("bullet-player", "enemy", (bullet, enemy) => {
    destroy(bullet);
    if (!state.isPlaying || enemy.defeated || state.isHitInvincible) return;
    enemy.health -= 1;
    if (enemy.health <= 0) {
      defeatEnemy(enemy, 150);
    } else {
      enemy.hitFlashMs = ENEMY_HIT_FLASH_MS;
    }
  });

  onCollide("bullet-player", "ground", (bullet) => destroy(bullet));
  onCollide("bullet-player", "ground-edge", (bullet) => destroy(bullet));
  onCollide("bullet-enemy", "ground", (bullet) => destroy(bullet));
  onCollide("bullet-enemy", "ground-edge", (bullet) => destroy(bullet));

  onCollide("bullet-enemy", "player", (bullet, playerObj) => {
    destroy(bullet);
    if (!state.isPlaying || climb) return;
    if (state.isHitInvincible || state.isPowered) return;
    handlePlayerHit("enemy fire", { knockbackDir: playerObj.pos.x < bullet.pos.x ? -1 : 1 });
  });

  onCollide("player", "collectible", (playerObj, item) => {
    if (!state.isPlaying || item.collected) return;
    item.collected = true;
    item.hidden = true;
    item.pos.x = -9999;
    collectedCount += 1;
    if (item.collectibleType === "root-access") {
      state.activatePower(POWER_DURATION_MS);
      state.addScore(50);
      audio.playCollectPower();
    } else if (item.collectibleType === "redundancy") {
      state.restoreRedundancy(1);
      state.addScore(25);
      audio.playCollectRedundancy();
    } else {
      state.addScore(10);
      audio.playCollectCash();
    }
  });

  onCollide("player", "pole", (playerObj, pole) => {
    if (!state.isPlaying || climb || pole.climbed) return;
    pole.climbed = true;
    const grabHeight = Math.max(0, Math.min(POLE_HEIGHT, pole.poleBottom - playerObj.pos.y));
    climb = { poleX: pole.pos.x, poleBottom: pole.poleBottom, grabHeight };
    // Riding the pole down is a scripted celebration, not a hazard course —
    // shield the player for the whole slide so a stray enemy/bullet can't
    // interrupt it.
    state.triggerHitInvincibility(3000);
  });

  onCollide("player", "goal", () => {
    if (!state.isPlaying || climb) return;
    winRound(0, "");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
