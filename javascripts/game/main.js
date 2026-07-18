import kaplay from "../vendor/kaplay.mjs";
import { LEVEL_MAP, LEVEL_WIDTH, LEVEL_HEIGHT, TILE_SIZE } from "./level.js";
import {
  PLAYER_ANIMS,
  LEGS_ANIMS,
  PLAYER_HEIGHT,
  ENEMY_CONFIGS,
  ENEMY_HIT_FLASH_MS,
  createPlayer,
  createEnemy,
  createBullet,
  spawnEnemyFragments,
  spawnEnemyDeathSpark,
  spawnPickupSparkle,
  spawnFloatingText,
  spawnMuzzleFlash,
  spawnLandingDust,
  spawnPowerAura,
} from "./entities.js";
import { createCollectible, createGoal, createPole, POLE_HEIGHT } from "./collectibles.js";
import { GameState, MAX_REDUNDANCY, STATES } from "./state.js";
import { setupTouchControls } from "./input.js";
import { loadHighScores, submitHighScore, getTopScore } from "./highscores.js";
import { ACHIEVEMENTS, loadUnlocked, unlock as unlockAchievement } from "./achievements.js";
import * as audio from "./audio.js";

const VIEW_W = 480;
const VIEW_H = 240;
const GRAVITY = 2400;
const JUMP_FORCE = 820;
const MOVE_SPEED = 200;
const POWER_DURATION_MS = 8000;
// Root Access visual feedback (see onUpdate) — the gold tint target, same
// triple as --gold-accent in stylesheet.css so the in-canvas tint and the
// HUD glow read as the same color. Deliberately not the turret telegraph's
// red/orange warning tint, which reads as danger rather than "buffed."
const POWER_TINT = [255, 209, 102];
const POWER_AURA_INTERVAL_MS = 150;
const HIT_INVINCIBLE_MS = 1400;
const HIT_STUN_MS = 220;
const SHOOT_COOLDOWN_MS = 260;
// How long the "shoot" pose (PLAYER_ANIMS.shoot, frames 28-29) holds after
// a shot is fired, independent of the fire-rate cooldown above — keeps the
// pose visibly readable for a single tap instead of flashing one frame.
const SHOOT_POSE_MS = 240;
const CLIMB_SPEED = 210;
// Camera shake pulse per enemy kill (see defeatEnemy()). Kaplay's shake()
// is additive to cam.shake, not clamped/replaced, so this stays well below
// the Perfect Run flourish's shake(12) to avoid compounding unpleasantly
// during a fast combo chain.
const DEATH_SHAKE_MAGNITUDE = 4;
const FALL_DEATH_Y = LEVEL_HEIGHT + 200;

// Parallax background: two copies of the same bg-subway tile scrolling
// slower than the 1:1 foreground/camera rate, for a sense of depth (Contra/
// Mega Man-style scrolling stages) — see buildLevel() (creation) and the
// camX-driven reposition in onUpdate. PARALLAX_MARGIN widens the tiled
// sprite well past LEVEL_WIDTH so it still fully covers the visible camera
// range at every scroll factor below 1 (the slower a layer scrolls, the
// further its own world position lags behind the camera).
const PARALLAX_MARGIN = 2000;
const PARALLAX_FAR_FACTOR = 0.35;
const PARALLAX_MID_FACTOR = 0.7;

// End-of-run bonus tuning (winRound()) — rewards a clean, fast run on top
// of the existing Full Deploy/pole-climb bonuses.
const REDUNDANCY_BONUS_PER_NODE = 100;
const NO_POWER_BONUS = 250;
const NO_HEAL_BONUS = 250;
const SPEED_BONUS_MAX = 1000;
const SPEED_BONUS_DECAY_PER_SEC = 8;
// Shot-efficiency bonus: a continuous taper around totalMinShots (computed
// per-level in buildLevel() from each enemy's configured health) — at or
// under par scores the max bonus, every shot past par shrinks it, and past
// the zero crossing it becomes a growing penalty (floored so spamming the
// fire button can't spiral the score arbitrarily negative).
const SHOT_BONUS_MAX = 500;
const SHOT_DECAY_PER_SHOT = 15;
const SHOT_PENALTY_CAP = 300;
// Extra flat nod for clearing the level without ever firing — the taper
// above already maxes out at 0 shots, this stacks an additional callout.
const PACIFIST_BONUS = 150;
// Kill-streak combo: chaining kills within this window escalates a bonus,
// awarded immediately at each extension (see defeatEnemy()).
const COMBO_WINDOW_MS = 2000;
const COMBO_BONUS_PER_STEP = 25;
// Perfect Run: never hit, every enemy defeated, everything collected, and
// Root Access never touched.
const PERFECT_RUN_BONUS = 1000;
// How long the player plays its death animation before the game-over
// overlay appears (see handlePlayerHit()/finishGameOver()).
const DEATH_ANIM_MS = 650;

// Speedrunner achievement threshold — tuned against SPEED_BONUS_DECAY_PER_SEC
// above (that bonus tapers to 0 at 125s), so 45s reads as a genuinely fast,
// skilled clear rather than just "didn't dawdle."
const SPEEDRUN_THRESHOLD_MS = 45000;
// Flagpole Ace achievement — grabbing the pole in roughly its top 10%.
const FLAGPOLE_ACE_HEIGHT_FRAC = 0.9;
// Root Cause achievement — kills within a single Root Access window.
const ROOT_CAUSE_KILL_COUNT = 3;

const ENEMY_SYMBOLS = {
  b: "bug",
  l: "latency-spike",
  p: "failed-pipeline",
  o: "outage",
  d: "ddos-bot",
  s: "stack-overflow",
};

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
  const statsEl = document.getElementById("game-stats");
  const bonusesEl = document.getElementById("game-bonuses");
  const highscoresEl = document.getElementById("game-highscores");
  const startBtn = document.getElementById("game-start");
  const muteBtn = document.getElementById("game-mute");
  const achievementsBtn = document.getElementById("game-achievements-btn");
  const achievementsPanelEl = document.getElementById("game-achievements-panel");
  const achievementToastEl = document.getElementById("game-achievement-toast");
  const touchControls = document.getElementById("game-touch-controls");
  const hitFlashEl = document.getElementById("game-hit-flash");
  const comboEl = document.getElementById("game-combo");
  const perfectFlashEl = document.getElementById("game-perfect-flash");
  const powerToastEl = document.getElementById("game-power-toast");
  const criticalPulseEl = document.getElementById("game-critical-pulse");
  const pauseBtn = document.getElementById("game-pause-btn");
  const pauseOverlayEl = document.getElementById("game-pause-overlay");
  const resumeBtn = document.getElementById("game-resume");

  // Read once — a live-updating media query isn't worth the complexity here,
  // and matches how the rest of the game treats this as a fixed preference
  // rather than something that changes mid-session. Gates the two shake()
  // calls below; the CSS side of this (flash/toast keyframes) lives in
  // stylesheet.css's own prefers-reduced-motion block.
  const REDUCE_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  kaplay({
    canvas,
    width: VIEW_W,
    height: VIEW_H,
    background: [18, 16, 19],
    crisp: true,
    global: true,
    stretch: true,
    buttons: {
      left: { keyboard: ["left", "a"] },
      right: { keyboard: ["right", "d"] },
      jump: { keyboard: ["space", "up", "w"] },
      shoot: { keyboard: ["e", "j", "control"] },
    },
  });


  loadSprite("player", `${ASSET_BASE}player.png`, { sliceX: 8, sliceY: 8, anims: PLAYER_ANIMS });
  loadSprite("player-torso", `${ASSET_BASE}player-torso.png`);
  loadSprite("player-legs", `${ASSET_BASE}player-legs.png`, { sliceX: 4, sliceY: 1, anims: LEGS_ANIMS });
  Object.entries(ENEMY_CONFIGS).forEach(([type, config]) => {
    config.sprites.forEach((name) => loadSprite(name, `${ASSET_BASE}${name}.png`));
    // The "gunner" behavior's fire-pose telegraph pool — see entities.js's
    // updateEnemy(). Only present on types that use it (currently ddos-bot).
    if (config.fireSprites) {
      config.fireSprites.forEach((name) => loadSprite(name, `${ASSET_BASE}${name}.png`));
    }
    // Per-type shot sprite override — see ENEMY_CONFIGS's bulletSprite field
    // and main.js's fire loop. Falls back to the default "bullet-enemy"
    // sprite (loaded below) when absent.
    if (config.bulletSprite) {
      loadSprite(config.bulletSprite, `${ASSET_BASE}${config.bulletSprite}.png`);
    }
    // Shatter-effect fragments (see entities.js's spawnEnemyFragments() and
    // dev/generate-enemy-fragments.sh) — 4 mechanical crops per type.
    for (let i = 0; i < 4; i++) {
      loadSprite(`enemy-${type}-fragment-${i}`, `${ASSET_BASE}enemy-${type}-fragment-${i}.png`);
    }
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
  loadSprite("bonus-uplink", `${ASSET_BASE}bonus-uplink.png`);

  setGravity(GRAVITY);
  setupTouchControls(touchControls);

  const state = new GameState();
  let player;
  let playerSpawn = { x: 0, y: 0 };
  let totalCollectibles = 0;
  let collectedCount = 0;
  // Cash specifically, not totalCollectibles/collectedCount — those also
  // include the Root Access key, and requiring the key would make Perfect
  // Run (which requires never touching Root Access) impossible to satisfy
  // at the same time, since collecting the key is what activates it. The
  // user's own definition of a clean run was "all the cash", not the key.
  let totalCash = 0;
  let collectedCash = 0;
  // Level-derived par for the shot-efficiency bonus (sum of every enemy's
  // configured health) and the enemy-clear tally for the Perfect Run check
  // — both accumulated in buildLevel() alongside totalCollectibles.
  let totalMinShots = 0;
  let totalEnemies = 0;
  let defeatedEnemyCount = 0;
  // How many of those kills were specifically via bullet — the Sharpshooter
  // achievement requires every enemy to go down to gunfire, not just an
  // efficient total shot count (see defeatEnemy()).
  let bulletKillCount = 0;
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
  // Which anim is active while playerLayer === "full" — "idle" or "shoot".
  // Needed alongside playerLayer because two different full-sheet anims can
  // both apply there; playerLayer alone can't tell them apart, so a swap
  // from one to the other wouldn't otherwise trigger a fresh .use() call.
  let playerAnim = "idle";
  // Counts down after a shoot press — see SHOOT_POSE_MS and onButtonPress
  // "shoot" below. While > 0, the shoot pose overrides grounded/airborne.
  let shootPoseMs = 0;
  // Non-null while the player is riding the bonus pole down to the goal —
  // see the "pole" collision handler and updateClimb() below.
  let climb = null;
  // Kill-streak combo — see defeatEnemy() and the COMBO_* constants above.
  let comboCount = 0;
  let comboTimerMs = 0;
  // Counts down while the player's death animation plays after a fatal hit;
  // finishGameOver() (submit score, show the overlay) is deferred until it
  // reaches 0 instead of firing immediately — see handlePlayerHit()/onUpdate.
  let deathAnimMs = 0;
  let deathSourceLabel = "";
  // Grounded-transition tracker for the landing dust puff/squash — see the
  // onUpdate block below. Starts true so the very first frame (player
  // already resting at spawn) doesn't read as a "landing".
  let wasGrounded = true;
  // Root Access kill tracking for the Root Cause achievement — reset to 0
  // each time Root Access is picked up (see the collectible collide
  // handler), incremented in defeatEnemy() on a "power" kill.
  let powerKillCount = 0;
  // Comeback achievement tracking — hitCritical latches once redundancy
  // drops to its last node (see the HUD-sync block in onUpdate);
  // recoveredFromCritical latches if the heal pickup is grabbed afterward
  // (see the collectible collide handler), checked in winRound().
  let hitCritical = false;
  let recoveredFromCritical = false;
  // Root Access visual feedback — see the onUpdate block below.
  // powerPulseMs is a free-running phase accumulator for the steady tint
  // pulse (deliberately NOT derived from state.powerTimer's countdown, so
  // the pulse rate stays constant regardless of how much buff time is
  // left). powerAuraMs throttles spawnPowerAura() to a fixed interval
  // rather than emitting a burst every single frame.
  let powerPulseMs = 0;
  let powerAuraMs = 0;
  // Parallax background layers — see buildLevel() (creation) and the
  // camX-driven reposition in onUpdate. Kept as outer-scope refs since
  // they're repositioned every frame, same pattern as `player`.
  let bgFar;
  let bgMid;

  function buildLevel() {
    collectedCount = 0;
    totalCollectibles = 0;
    totalCash = 0;
    collectedCash = 0;
    totalMinShots = 0;
    totalEnemies = 0;

    // Two-layer parallax background, well behind everything else.
    // buildLevel() only ever runs once (see resetRound()'s comment), so
    // these are created exactly once too. Both reuse the same bg-subway
    // tile (there's only the one background asset) — the far layer is
    // darkened via a runtime color() tint (same technique already used for
    // enemy tints) so it still reads as a distinct, more distant layer
    // rather than a duplicate. pos.x is repositioned every frame in
    // onUpdate to scroll slower than the camera.
    bgFar = add([
      sprite("bg-subway", { width: LEVEL_WIDTH + PARALLAX_MARGIN * 2, height: VIEW_H, tiled: true }),
      pos(-PARALLAX_MARGIN, 0),
      color(90, 85, 105),
      z(-101),
      "background",
    ]);
    bgMid = add([
      sprite("bg-subway", { width: LEVEL_WIDTH + PARALLAX_MARGIN * 2, height: VIEW_H, tiled: true }),
      pos(-PARALLAX_MARGIN, 0),
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
            const tags = ["ground"];
            if (isEdge) tags.push("ground-edge");
            return [
              sprite(tileSprite),
              area(),
              body({ isStatic: true }),
              ...tags,
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
        // totalMinShots/totalEnemies feed the shot-efficiency bonus and the
        // Perfect Run check in winRound() — both level-derived, not
        // hardcoded, so they stay correct if the level or any enemy's
        // configured health changes.
        b: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.b, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalMinShots += ENEMY_CONFIGS[ENEMY_SYMBOLS.b].health;
          totalEnemies += 1;
          return [];
        },
        l: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.l, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalMinShots += ENEMY_CONFIGS[ENEMY_SYMBOLS.l].health;
          totalEnemies += 1;
          return [];
        },
        p: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.p, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalMinShots += ENEMY_CONFIGS[ENEMY_SYMBOLS.p].health;
          totalEnemies += 1;
          return [];
        },
        o: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.o, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalMinShots += ENEMY_CONFIGS[ENEMY_SYMBOLS.o].health;
          totalEnemies += 1;
          return [];
        },
        d: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.d, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalMinShots += ENEMY_CONFIGS[ENEMY_SYMBOLS.d].health;
          totalEnemies += 1;
          return [];
        },
        s: (tilePos) => {
          createEnemy(ENEMY_SYMBOLS.s, tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalMinShots += ENEMY_CONFIGS[ENEMY_SYMBOLS.s].health;
          totalEnemies += 1;
          return [];
        },
        c: (tilePos) => {
          createCollectible("cash", tilePos.x * TILE_SIZE, tilePos.y * TILE_SIZE);
          totalCollectibles += 1;
          totalCash += 1;
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

  function clearEffects() {
    get("fx").forEach((fx) => destroy(fx));
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
    collectedCash = 0;
    defeatedEnemyCount = 0;
    bulletKillCount = 0;
    comboCount = 0;
    comboTimerMs = 0;
    deathAnimMs = 0;
    climb = null;
    hitStunMs = 0;
    shootPoseMs = 0;
    wasGrounded = true;
    powerKillCount = 0;
    hitCritical = false;
    recoveredFromCritical = false;
    playerLayer = "full";
    playerAnim = "idle";
    player.use(sprite("player", { anim: "idle" }));
    player.legs.hidden = true;
    player.scale = vec2(1, 1);
    clearBullets();
    clearEffects();
    player.pos.x = playerSpawn.x;
    player.pos.y = playerSpawn.y;
    player.vel.x = 0;
    player.vel.y = 0;
    player.opacity = 1;
    // Otherwise a round ending mid-Root-Access-buff freezes the gold tint
    // through the entire win/lose overlay — the onUpdate logic that resets
    // it is gated behind isPlaying, same class of gap player.opacity = 1
    // above already guards against.
    player.color = rgb(255, 255, 255);
    player.legs.color = rgb(255, 255, 255);
    get("enemy").forEach((enemy) => {
      const config = ENEMY_CONFIGS[enemy.enemyType];
      enemy.hidden = false;
      enemy.paused = false;
      enemy.defeated = false;
      enemy.pos.x = enemy.spawnX;
      enemy.pos.y = enemy.spawnY;
      enemy.vel.x = 0;
      enemy.vel.y = 0;
      enemy.dir = 1;
      enemy.shootTimer = config.shootIntervalSec ?? Infinity;
      enemy.readyToFire = false;
      // Otherwise a "gunner" enemy (see entities.js) revived mid-fire-pose
      // would stay stuck mid-animation instead of resuming its walk cycle.
      enemy.firePoseMs = 0;
      enemy.health = config.health;
      enemy.hitFlashMs = 0;
      enemy.opacity = 1;
      // Also reset burst-cycle and frame-swap state (set by createEnemy())
      // — otherwise a retry/respawn can resume a "burst" enemy mid-pause or
      // leave its sprite mid-frame-swap instead of a fresh, consistent start.
      enemy.burstMode = "move";
      enemy.burstTimer = 0.6;
      enemy.animTimer = 0;
      enemy.animIndex = 0;
      enemy.use(sprite(config.sprites[0], { width: config.width, height: config.height }));
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
    // Coerced through Number() before interpolation — defensive only (the
    // list only ever comes from our own submitHighScore() writes), so a
    // hand-edited localStorage entry can't inject markup into innerHTML.
    highscoresEl.innerHTML = list.map((entry) => `<li>${Number(entry.score) || 0}</li>`).join("");
  }

  // Each line is { text, isPenalty } — the shot-efficiency bonus can go
  // negative (spamming the fire button), rendered distinctly (red "−")
  // from the normal green "+" bonus lines via the is-penalty class.
  function renderBonuses(lines) {
    if (!bonusesEl) return;
    if (!lines || lines.length === 0) {
      bonusesEl.hidden = true;
      bonusesEl.innerHTML = "";
      return;
    }
    bonusesEl.hidden = false;
    bonusesEl.innerHTML = lines
      .map((line) => `<li class="${line.isPenalty ? "is-penalty" : ""}">${line.text}</li>`)
      .join("");
  }

  // Accuracy — shotsHit/shotsFired — shown on every overlay that follows a
  // round with at least one shot fired (win or game-over alike); stays
  // hidden on the very first "Start Game" screen and on a Pacifist/
  // stomp-only run, where state.accuracyPercent is null.
  function renderStats() {
    if (!statsEl) return;
    if (state.accuracyPercent === null) {
      statsEl.hidden = true;
      statsEl.textContent = "";
      return;
    }
    statsEl.hidden = false;
    statsEl.textContent = `Accuracy: ${state.accuracyPercent}% (${state.shotsHit}/${state.shotsFired} shots hit)`;
  }

  function showOverlay(message, buttonLabel, bonusLines) {
    overlayEl.hidden = false;
    overlayEl.classList.remove("game-overlay--perfect");
    messageEl.textContent = message;
    startBtn.textContent = buttonLabel;
    renderStats();
    renderBonuses(bonusLines);
    renderHighScores();
    // The achievements popover and the start/game-over overlay are both
    // absolutely positioned over the canvas frame and toggled independently
    // — without this, leaving the popover open into a win/loss/restart
    // stacks it on top of the overlay with no way to close it.
    if (achievementsPanelEl) achievementsPanelEl.hidden = true;
    if (achievementsBtn) achievementsBtn.setAttribute("aria-expanded", "false");
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function startGame() {
    audio.initAudio();
    setPaused(false);
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

  if (achievementsBtn && achievementsPanelEl) {
    achievementsBtn.addEventListener("click", () => {
      const opening = achievementsPanelEl.hidden;
      if (opening) renderAchievementsPanel();
      achievementsPanelEl.hidden = !opening;
      achievementsBtn.setAttribute("aria-expanded", String(opening));
    });
  }

  // Pause freezes the whole game loop — physics, onUpdate callbacks,
  // animations, particles — via Kaplay's own debug.paused switch (the same
  // flag its built-in F8 debug shortcut toggles) rather than a second
  // hand-rolled "paused" gate layered on top of state.isPlaying; the DOM
  // overlay/button just mirror that single source of truth.
  function setPaused(value) {
    if (value && !state.isPlaying) return;
    debug.paused = value;
    if (pauseOverlayEl) pauseOverlayEl.hidden = !value;
    if (pauseBtn) pauseBtn.setAttribute("aria-pressed", String(value));
    // Also close the achievements popover, same reasoning as showOverlay()
    // — two independently-toggled overlays stacking on the canvas at once.
    if (value && achievementsPanelEl) {
      achievementsPanelEl.hidden = true;
      if (achievementsBtn) achievementsBtn.setAttribute("aria-expanded", "false");
    }
  }

  if (pauseBtn) pauseBtn.addEventListener("click", () => setPaused(!debug.paused));
  if (resumeBtn) resumeBtn.addEventListener("click", () => setPaused(false));

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Escape" && e.code !== "KeyP") return;
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;
    if (!overlayEl.hidden) return; // don't fight the Start/Try Again handler
    if (!state.isPlaying && !debug.paused) return;
    e.preventDefault();
    setPaused(!debug.paused);
  });

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

  function triggerComboPopup(text) {
    if (!comboEl) return;
    comboEl.textContent = text;
    comboEl.classList.remove("is-active");
    void comboEl.offsetWidth;
    comboEl.classList.add("is-active");
  }

  function triggerPerfectFlash() {
    if (!perfectFlashEl) return;
    perfectFlashEl.classList.remove("is-active");
    void perfectFlashEl.offsetWidth;
    perfectFlashEl.classList.add("is-active");
  }

  function triggerAchievementToast(text) {
    if (!achievementToastEl) return;
    achievementToastEl.textContent = text;
    achievementToastEl.classList.remove("is-active");
    void achievementToastEl.offsetWidth;
    achievementToastEl.classList.add("is-active");
  }

  // A dedicated element rather than reusing comboEl/achievementToastEl: a
  // Root Access pickup landing the same frame as a kill-combo would clobber
  // shared text, and it isn't a one-time unlock like the achievement toast.
  function triggerPowerToast(text) {
    if (!powerToastEl) return;
    powerToastEl.textContent = text;
    powerToastEl.classList.remove("is-active");
    void powerToastEl.offsetWidth;
    powerToastEl.classList.add("is-active");
  }

  // Attempts to unlock each id, and if any are newly unlocked (not already
  // owned from a previous run), shows a single combined toast — several can
  // land in the same win (e.g. a first-ever win that's also a Perfect Run).
  function announceUnlocks(ids) {
    const newlyUnlocked = ids.filter((id) => unlockAchievement(id));
    if (newlyUnlocked.length === 0) return;
    const names = newlyUnlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id);
    const label =
      newlyUnlocked.length === 1
        ? `\u{1F3C6} Achievement unlocked: ${names[0]}!`
        : `\u{1F3C6} ${newlyUnlocked.length} achievements unlocked: ${names.join(", ")}!`;
    triggerAchievementToast(label);
  }

  function renderAchievementsPanel() {
    if (!achievementsPanelEl) return;
    const unlocked = loadUnlocked();
    achievementsPanelEl.innerHTML = ACHIEVEMENTS.map((a) => {
      const isUnlocked = Boolean(unlocked[a.id]);
      return `<li class="${isUnlocked ? "is-unlocked" : "is-locked"}">
        <strong>${isUnlocked ? "\u{1F3C6}" : "\u{1F512}"} ${a.name}</strong>
        ${isUnlocked ? `<span>${a.description}</span>` : ""}
      </li>`;
    }).join("");
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

  // Extracted so it can fire either right away or (on a fatal hit) after
  // the death animation plays — see handlePlayerHit()'s gameOver branch and
  // the deathAnimMs branch in onUpdate().
  function finishGameOver() {
    const { rank } = submitHighScore(state.score);
    if (bestEl) bestEl.textContent = getTopScore();
    const scoreNote = rank === 1 ? " New best!" : rank ? " High score!" : "";
    audio.playLose();
    showOverlay(`Redundancy exhausted — taken down by ${deathSourceLabel}. Game over.${scoreNote}`, "Try Again");
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
    if (!REDUCE_MOTION) shake(2.5);
    if (gameOver) {
      // Play the death animation in place before handing off to
      // finishGameOver() — see the deathAnimMs branch in onUpdate(), which
      // runs ahead of the normal !state.isPlaying gate so the animation
      // isn't frozen the instant state flips to LOSE.
      deathSourceLabel = sourceLabel;
      // A fatal fall can leave the player well below the visible viewport
      // (the camera's Y never follows the player, and FALL_DEATH_Y — see
      // its own comment — only triggers ~200px past the bottom edge of the
      // frame) — without this, the death-flail anim below would play
      // entirely off-screen and never be seen.
      if (player.pos.y > VIEW_H) player.pos.y = VIEW_H - 60;
      deathAnimMs = DEATH_ANIM_MS;
      shootPoseMs = 0;
      playerLayer = "full";
      playerAnim = "death";
      player.use(sprite("player", { anim: "death" }));
      player.legs.hidden = true;
      player.vel.x = 0;
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

  function defeatEnemy(enemy, scoreValue, method) {
    // Never destroy() — see the comment in resetRound(). Hiding + pausing +
    // moving far away is functionally equivalent (invisible, inert, can't
    // collide) without ever touching the object graph after initial build.
    // Score is granted here, on the actual kill, rather than at each call
    // site — a stomp/Root-Access touch is always an instant kill regardless
    // of remaining health, but a bullet only reaches here on the hit that
    // brings health to 0, so multi-hit enemies never over-reward chip damage.
    audio.playEnemyDefeated();
    // Shatter/spark/shake feedback — spawned before the enemy is hidden and
    // moved off-stage below, since the effect reads its current position.
    const config = ENEMY_CONFIGS[enemy.enemyType];
    spawnEnemyFragments(enemy, config);
    spawnEnemyDeathSpark(enemy.pos.x + config.width / 2, enemy.pos.y + config.height / 2);
    if (!REDUCE_MOTION) shake(DEATH_SHAKE_MAGNITUDE);
    enemy.defeated = true;
    enemy.hidden = true;
    enemy.paused = true;
    enemy.pos.x = -9999;
    state.addScore(scoreValue);
    defeatedEnemyCount += 1;
    // Sharpshooter achievement tracks HOW every kill happened, not just how
    // many shots were fired — bulletKillCount only reaches totalEnemies if
    // every single enemy went down to gunfire, with no stomps/Root Access.
    if (method === "bullet") bulletKillCount += 1;
    // Root Cause achievement — powerKillCount is reset to 0 each time Root
    // Access is picked up (see the collectible collide handler).
    if (method === "power") {
      powerKillCount += 1;
      if (powerKillCount >= ROOT_CAUSE_KILL_COUNT) announceUnlocks(["root-cause"]);
    }

    // Kill-streak combo: chaining kills within COMBO_WINDOW_MS of each
    // other escalates a bonus, awarded immediately at each extension (not
    // deferred to when the window lapses) so the feedback stays legible.
    comboCount = comboTimerMs > 0 ? comboCount + 1 : 1;
    comboTimerMs = COMBO_WINDOW_MS;
    if (comboCount >= 2) {
      const comboBonus = (comboCount - 1) * COMBO_BONUS_PER_STEP;
      state.addScore(comboBonus);
      triggerComboPopup(`${comboCount}x COMBO +${comboBonus}!`);
    }
    if (comboCount >= 4) announceUnlocks(["combo-master"]);
  }

  function winRound(bonus, bonusLabel) {
    if (state.isOver) return;
    let total = bonus;
    const bonusLines = [];
    if (bonusLabel) bonusLines.push({ text: bonusLabel, isPenalty: false });
    if (totalCollectibles > 0 && collectedCount >= totalCollectibles) {
      total += 300;
      bonusLines.push({ text: "Full Deploy bonus +300!", isPenalty: false });
    }
    // Clean-run bonuses — reward finishing with redundancy to spare, never
    // touching Root Access, never needing the heal pickup, and finishing
    // quickly, on top of the completion bonuses above. Each is skipped
    // entirely (no line, no score) when it comes out to 0.
    const redundancyBonus = state.redundancy * REDUNDANCY_BONUS_PER_NODE;
    if (redundancyBonus > 0) {
      total += redundancyBonus;
      const nodeWord = state.redundancy === 1 ? "node" : "nodes";
      bonusLines.push({
        text: `Redundancy bonus +${redundancyBonus}! (${state.redundancy} ${nodeWord} left)`,
        isPenalty: false,
      });
    }
    if (!state.usedPower) {
      total += NO_POWER_BONUS;
      bonusLines.push({ text: `No Root Access needed +${NO_POWER_BONUS}!`, isPenalty: false });
    }
    if (!state.usedHeal) {
      total += NO_HEAL_BONUS;
      bonusLines.push({ text: `Self-healing-free +${NO_HEAL_BONUS}!`, isPenalty: false });
    }
    const elapsedSeconds = state.elapsedMs / 1000;
    const speedBonus = Math.max(0, Math.round(SPEED_BONUS_MAX - elapsedSeconds * SPEED_BONUS_DECAY_PER_SEC));
    if (speedBonus > 0) {
      total += speedBonus;
      bonusLines.push({ text: `Speed bonus +${speedBonus}!`, isPenalty: false });
    }

    // Shot efficiency — a continuous taper around the level's par
    // (totalMinShots, accumulated in buildLevel() from each enemy's
    // configured health): at/under par scores the max bonus, every shot
    // past it shrinks the bonus, and past the zero crossing it becomes a
    // growing penalty, floored so spamming fire can't spiral the score
    // arbitrarily negative.
    const overPar = state.shotsFired - totalMinShots;
    const rawShotBonus = overPar <= 0 ? SHOT_BONUS_MAX : Math.round(SHOT_BONUS_MAX - overPar * SHOT_DECAY_PER_SHOT);
    const shotBonus = Math.max(rawShotBonus, -SHOT_PENALTY_CAP);
    if (shotBonus !== 0) {
      total += shotBonus;
      const text =
        shotBonus > 0
          ? `Sharpshooter bonus +${shotBonus}! (${state.shotsFired} shots, par ${totalMinShots})`
          : `Trigger-happy penalty ${shotBonus}! (${state.shotsFired} shots, par ${totalMinShots})`;
      bonusLines.push({ text, isPenalty: shotBonus < 0 });
    }
    // A deliberate extra nod on top of the curve above, which already caps
    // out at 0 shots — this calls out the literal zero-shots case by name.
    if (state.shotsFired === 0) {
      total += PACIFIST_BONUS;
      bonusLines.push({ text: `Pacifist bonus +${PACIFIST_BONUS}! Not a single shot fired.`, isPenalty: false });
    }

    // Cash specifically (totalCash/collectedCash), not totalCollectibles —
    // that also counts the Root Access key, which would make this
    // impossible to satisfy alongside !state.usedPower (collecting the key
    // is what activates it).
    const isPerfect =
      defeatedEnemyCount >= totalEnemies &&
      collectedCash >= totalCash &&
      !state.tookDamage &&
      !state.usedPower;
    if (isPerfect) {
      total += PERFECT_RUN_BONUS;
      bonusLines.push({ text: `Perfect Run bonus +${PERFECT_RUN_BONUS}!`, isPenalty: false });
    }

    if (total > 0) state.addScore(total);
    state.win();

    const { rank } = submitHighScore(state.score);
    if (bestEl) bestEl.textContent = getTopScore();

    const unlockIds = ["first-deploy"];
    if (state.shotsFired === 0) unlockIds.push("pacifist");
    // Every enemy defeated, and every one of them via bullet — not shot
    // count efficiency (that's the separate Sharpshooter score bonus above).
    if (totalEnemies > 0 && bulletKillCount >= totalEnemies) unlockIds.push("sharpshooter");
    if (isPerfect) unlockIds.push("perfect-run");
    if (state.redundancy === 1) unlockIds.push("iron-will");
    if (state.elapsedMs < SPEEDRUN_THRESHOLD_MS) unlockIds.push("speedrunner");
    // No Survivors — every enemy defeated by any method, unlike the
    // bullet-only Sharpshooter check above.
    if (totalEnemies > 0 && defeatedEnemyCount >= totalEnemies) unlockIds.push("no-survivors");
    if (recoveredFromCritical) unlockIds.push("comeback");
    announceUnlocks(unlockIds);

    let message = isPerfect ? "PERFECT RUN — flawless deploy!" : "Deployed to production!";
    if (rank === 1) message += " New best!";
    else if (rank) message += " High score!";

    const reveal = () => showOverlay(message, "Play Again", bonusLines);

    if (isPerfect) {
      // A brief on-canvas flourish before the overlay lands — gold screen
      // flash + camera shake, sequenced on Kaplay's own clock (wait()) so
      // it stays in step with the game loop rather than a raw setTimeout.
      audio.playPerfectWin();
      triggerPerfectFlash();
      if (!REDUCE_MOTION) shake(12);
      wait(0.5, () => {
        reveal();
        overlayEl.classList.add("game-overlay--perfect");
      });
    } else {
      audio.playWin();
      reveal();
    }
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
      powerEl.classList.add("is-active");
      powerEl.classList.toggle("is-low", state.isPowerLow);
    } else {
      powerEl.hidden = true;
      powerEl.classList.remove("is-active", "is-low");
    }
    // Low-REDUNDANCY warning pulse — see .game-critical-pulse in
    // stylesheet.css. Latches hitCritical for the Comeback achievement too
    // (see the collectible collide handler's heal branch/winRound()).
    const isCritical = state.isPlaying && state.redundancy === 1;
    if (criticalPulseEl) criticalPulseEl.classList.toggle("is-active", isCritical);
    if (isCritical) hitCritical = true;

    // Runs even though state.state has already flipped to LOSE (so the
    // !state.isPlaying gate right below would otherwise freeze it) — plays
    // the death pose in place for DEATH_ANIM_MS, then hands off to the
    // deferred game-over overlay/high-score submission.
    if (deathAnimMs > 0 && player) {
      deathAnimMs -= dt() * 1000;
      player.vel.x = 0;
      player.vel.y = 0;
      if (deathAnimMs <= 0) finishGameOver();
      return;
    }

    if (!state.isPlaying || !player) return;

    state.tick(dt() * 1000);
    if (shootCooldownMs > 0) shootCooldownMs -= dt() * 1000;
    if (shootPoseMs > 0) shootPoseMs -= dt() * 1000;
    if (hitStunMs > 0) hitStunMs -= dt() * 1000;
    if (comboTimerMs > 0) comboTimerMs -= dt() * 1000;

    player.opacity = state.isHitInvincible ? (Math.floor(state.hitTimer / 90) % 2 === 0 ? 1 : 0.35) : 1;
    player.legs.opacity = player.opacity;

    // Jump/land squash-and-stretch — jump takeoff sets a stretched scale
    // (see onButtonPress("jump", ...)) and landing below sets a squashed
    // one; both decay back toward (1,1) here every frame regardless of
    // climb/hit-stun state, same idiom as the manual dt()-driven fx
    // countdowns in entities.js (no tween() used anywhere in this codebase).
    if (player.scale.x !== 1 || player.scale.y !== 1) {
      const t = Math.min(1, dt() * 12);
      player.scale.x += (1 - player.scale.x) * t;
      player.scale.y += (1 - player.scale.y) * t;
      if (Math.abs(player.scale.x - 1) < 0.01 && Math.abs(player.scale.y - 1) < 0.01) {
        player.scale.x = 1;
        player.scale.y = 1;
      }
    }

    // Root Access visual feedback — a steady gold pulse (same sine-lerp
    // idiom as the turret's telegraph tint in entities.js) while powered,
    // switching to a hard on/off blink in the last POWER_LOW_THRESHOLD_MS
    // (a distinct channel from the opacity-based hit-invincible blink above,
    // so the two never visually collide if both happen to be active), plus
    // a small periodic aura spark. Reset to white the instant the buff ends.
    if (state.isPowered) {
      if (state.isPowerLow) {
        const blinkOn = Math.floor(state.powerTimer / 100) % 2 === 0;
        const tint = blinkOn ? rgb(POWER_TINT[0], POWER_TINT[1], POWER_TINT[2]) : rgb(255, 255, 255);
        player.color = tint;
        player.legs.color = tint;
      } else {
        powerPulseMs += dt() * 1000;
        const pulse = Math.abs(Math.sin(powerPulseMs * 0.006));
        const tint = rgb(
          lerp(255, POWER_TINT[0], pulse),
          lerp(255, POWER_TINT[1], pulse),
          lerp(255, POWER_TINT[2], pulse),
        );
        player.color = tint;
        player.legs.color = tint;
      }
      powerAuraMs -= dt() * 1000;
      if (powerAuraMs <= 0) {
        powerAuraMs = POWER_AURA_INTERVAL_MS;
        spawnPowerAura(player.pos.x + 20, player.pos.y + 20);
      }
    } else if (player.color.r !== 255 || player.color.g !== 255 || player.color.b !== 255) {
      player.color = rgb(255, 255, 255);
      player.legs.color = rgb(255, 255, 255);
    }

    // Landing dust puff + squash, on the airborne->grounded transition only
    // (not a sustained grounded check, or it'd fire every frame standing
    // still). Skipped while climbing the bonus pole — that's a scripted
    // slide down to the goal, not a real landing.
    const isGroundedNow = player.isGrounded();
    if (isGroundedNow && !wasGrounded && !climb) {
      spawnLandingDust(player.pos.x + 23, player.pos.y + PLAYER_HEIGHT - 4);
      player.scale = vec2(1.3, 0.75);
    }
    wasGrounded = isGroundedNow;

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
    // Shoot pose wins regardless of grounded/airborne — it's a third pose
    // bucket layered on top of the grounded/airborne split below. Grounded:
    // swap the root object to the legs-less torso crop and let the
    // separate legs child (see createPlayer()) carry the walk cycle.
    // Airborne (and not shooting): the full sheet's idle pose, which
    // already has its own baked-in legs — there's no dedicated mid-air
    // pose in this sheet (see entities.js's PLAYER_ANIMS comment), so idle
    // reads better than the old gun-raised pose did; that case hides the
    // legs child so it doesn't double up. The shoot frames (28-29) are
    // upper-body-only crops just like player-torso — no baked-in legs at
    // all (confirmed by their pixel bounds) — so unlike idle, this case
    // must keep the legs child visible or the player renders legless.
    if (shootPoseMs > 0) {
      if (playerLayer !== "full" || playerAnim !== "shoot") {
        player.use(sprite("player", { anim: "shoot" }));
        playerLayer = "full";
        playerAnim = "shoot";
      }
      player.legs.hidden = false;
      const desiredLegsAnim = player.isGrounded() && player.vel.x !== 0 ? "run" : "stand";
      if (player.legs.getCurAnim()?.name !== desiredLegsAnim) player.legs.play(desiredLegsAnim);
    } else if (player.isGrounded()) {
      if (playerLayer !== "torso") {
        player.use(sprite("player-torso"));
        playerLayer = "torso";
      }
      player.legs.hidden = false;
      const desiredLegsAnim = player.vel.x !== 0 ? "run" : "stand";
      if (player.legs.getCurAnim()?.name !== desiredLegsAnim) player.legs.play(desiredLegsAnim);
    } else {
      if (playerLayer !== "full" || playerAnim !== "idle") {
        player.use(sprite("player", { anim: "idle" }));
        playerLayer = "full";
        playerAnim = "idle";
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
      const config = ENEMY_CONFIGS[enemy.enemyType];
      const dir = player.pos.x < enemy.pos.x ? -1 : 1;
      enemy.flipX = dir < 0;
      const bx = enemy.pos.x + (dir > 0 ? 30 : -10);
      const by = enemy.pos.y + 14;
      const bulletOpts = { sprite: config.bulletSprite, speed: config.bulletSpeed };
      if (config.shotPattern === "spread") {
        // A tight vertical fan of small bullets — e.g. ddos-bot's "packet
        // flood" shot. spreadVelY is the max per-side vertical velocity
        // offset; t sweeps -0.5..0.5 across the fan so it's centered on dir.
        const count = config.spreadCount ?? 3;
        const spread = config.spreadVelY ?? 60;
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0 : i / (count - 1) - 0.5;
          createBullet("enemy", bx, by, dir, { ...bulletOpts, velY: t * spread * 2 });
        }
      } else if (config.shotPattern === "arc") {
        // A lobbed shot: launches with an upward velY, then arcGravity pulls
        // it back down every frame (see the bullet-movement loop below) —
        // same manual dt()-accumulated idiom spawnEnemyFragments() uses for
        // its death-fragment physics.
        createBullet("enemy", bx, by, dir, {
          ...bulletOpts,
          velY: config.arcVelY ?? -180,
          gravity: config.arcGravity ?? 420,
        });
      } else {
        createBullet("enemy", bx, by, dir, bulletOpts);
      }
    });

    const camX = Math.min(Math.max(player.pos.x, VIEW_W / 2), LEVEL_WIDTH - VIEW_W / 2);
    // Parallax: each layer's own world pos.x lags behind camX by its scroll
    // factor, so on-screen it appears to move slower than the 1:1
    // foreground (screenX = layer.pos.x - camX = -PARALLAX_MARGIN +
    // camX*(1-factor), which nets out to camX*-factor plus the fixed
    // margin offset — smaller factor reads as further away).
    bgFar.pos.x = -PARALLAX_MARGIN + camX * (1 - PARALLAX_FAR_FACTOR);
    bgMid.pos.x = -PARALLAX_MARGIN + camX * (1 - PARALLAX_MID_FACTOR);

    get("bullet").forEach((bullet) => {
      if (bullet.gravity) bullet.velY += bullet.gravity * dt();
      bullet.pos.x += bullet.velX * dt();
      bullet.pos.y += bullet.velY * dt();
      // All bullets despawn if they leave the level bounds. The y check is
      // a defensive backstop for arc shots — in practice they already
      // destroy() on hitting "ground" via the existing bullet-enemy/ground
      // collision handler below.
      if (bullet.pos.x < -40 || bullet.pos.x > LEVEL_WIDTH + 40 || bullet.pos.y > LEVEL_HEIGHT + 100) {
        destroy(bullet);
      }
      // Player bullets also despawn if they leave the camera view (see createBullet)
    });

    setCamPos(camX, VIEW_H / 2);
  });

  onButtonPress("jump", () => {
    if (state.isPlaying && player && !climb && hitStunMs <= 0 && player.isGrounded()) {
      player.jump(JUMP_FORCE);
      player.scale = vec2(0.75, 1.3);
      audio.playJump();
    }
  });

  onButtonPress("shoot", () => {
    if (!state.isPlaying || !player || climb || shootCooldownMs > 0) return;
    shootCooldownMs = SHOOT_COOLDOWN_MS;
    shootPoseMs = SHOOT_POSE_MS;
    const dir = player.flipX ? -1 : 1;
    // Offsets tuned against the "shoot" pose's (frames 28-29) muzzle-flash
    // position, so the bullet appears to leave the gun in both facing
    // directions, grounded or airborne.
    const muzzleX = player.pos.x + (dir > 0 ? 40 : 5);
    const muzzleY = player.pos.y + 24;
    createBullet("player", muzzleX, muzzleY, dir);
    spawnMuzzleFlash(muzzleX, muzzleY);
    audio.playShoot();
    state.shotsFired += 1;
  });

  onCollide("player", "enemy", (playerObj, enemy, col) => {
    if (!state.isPlaying || enemy.defeated || climb) return;
    if (state.isHitInvincible) return;
    if (state.isPowered) {
      defeatEnemy(enemy, 200, "power");
      return;
    }
    if (col && col.isBottom()) {
      defeatEnemy(enemy, 200, "stomp");
      playerObj.jump(JUMP_FORCE / 2);
    } else {
      handlePlayerHit(enemy.label, { knockbackDir: playerObj.pos.x < enemy.pos.x ? -1 : 1 });
    }
  });

  onCollide("bullet-player", "enemy", (bullet, enemy) => {
    destroy(bullet);
    if (!state.isPlaying || enemy.defeated || state.isHitInvincible) return;
    enemy.health -= 1;
    state.shotsHit += 1;
    if (enemy.health <= 0) {
      defeatEnemy(enemy, 150, "bullet");
    } else {
      enemy.hitFlashMs = ENEMY_HIT_FLASH_MS;
    }
  });

  onCollide("bullet-player", "ground", (bullet) => destroy(bullet));
  onCollide("bullet-enemy", "ground", (bullet) => destroy(bullet));

  onCollide("bullet-enemy", "player", (bullet, playerObj) => {
    destroy(bullet);
    if (!state.isPlaying || climb) return;
    if (state.isHitInvincible || state.isPowered) return;
    handlePlayerHit("enemy fire", { knockbackDir: playerObj.pos.x < bullet.pos.x ? -1 : 1 });
  });

  onCollide("player", "collectible", (playerObj, item) => {
    if (!state.isPlaying || item.collected) return;
    item.collected = true;
    // Capture the live position before hiding/relocating below — same
    // ordering lesson as defeatEnemy(): the effects need real coordinates.
    const fxX = item.pos.x + item.width / 2;
    const fxY = item.pos.y + item.height / 2;
    item.hidden = true;
    item.pos.x = -9999;
    collectedCount += 1;
    if (item.collectibleType === "root-access") {
      state.activatePower(POWER_DURATION_MS);
      state.addScore(50);
      audio.playCollectPower();
      spawnPickupSparkle(fxX, fxY, [rgb(240, 181, 65), rgb(255, 238, 131)], { count: 24 });
      spawnFloatingText(fxX, fxY, "+50", [255, 238, 131]);
      triggerPowerToast("ROOT ACCESS!");
      // Root Cause achievement — see defeatEnemy(); each window starts a
      // fresh count.
      powerKillCount = 0;
    } else if (item.collectibleType === "redundancy") {
      // Comeback achievement — only counts if this heal follows having
      // actually been down to the last node (see the HUD-sync block in
      // onUpdate that latches hitCritical), not just any heal pickup.
      if (hitCritical) recoveredFromCritical = true;
      state.restoreRedundancy(1);
      state.addScore(25);
      audio.playCollectRedundancy();
      spawnPickupSparkle(fxX, fxY, [rgb(53, 208, 127), rgb(0, 102, 255)]);
      spawnFloatingText(fxX, fxY, "+25", [53, 208, 127]);
    } else {
      state.addScore(10);
      audio.playCollectCash();
      collectedCash += 1;
      spawnPickupSparkle(fxX, fxY, [rgb(255, 224, 120), rgb(74, 178, 110)]);
      spawnFloatingText(fxX, fxY, "+10", [255, 224, 120]);
    }
  });

  onCollide("player", "pole", (playerObj, pole) => {
    if (!state.isPlaying || climb || pole.climbed) return;
    pole.climbed = true;
    const grabHeight = Math.max(0, Math.min(POLE_HEIGHT, pole.poleBottom - playerObj.pos.y));
    climb = { poleX: pole.pos.x, poleBottom: pole.poleBottom, grabHeight };
    // Flagpole Ace — an immediate unlock at the moment of the grab (like
    // combo-master), not deferred to winRound().
    if (grabHeight >= POLE_HEIGHT * FLAGPOLE_ACE_HEIGHT_FRAC) announceUnlocks(["flagpole-ace"]);
    // Riding the pole down is a scripted celebration, not a hazard course —
    // shield the player for the whole slide so a stray enemy/bullet can't
    // interrupt it.
    state.triggerHitInvincibility(3000);
  });

  onCollide("player", "goal", () => {
    if (!state.isPlaying || climb) return;
    winRound(0, "");
  });

  // ============================================================================
  // Dev-only debug hook for testing (completely inert without __NAP_TEST_HOOK__)
  // ============================================================================
  // Test harness injects window.__NAP_TEST_HOOK__ = true before page load via
  // page.addInitScript() before main.js runs. This gate ensures the hook is
  // unreachable without explicit test setup — it never affects production.
  // The test runner uses page.evaluate() to invoke these functions directly.
  if (window.__NAP_TEST_HOOK__ === true) {
    window.__gameDebug = {
      // Snapshot game state (used by test assertions)
      getState: () => ({
        score: state.score,
        redundancy: state.redundancy,
        state: state.state,
        isPowered: state.isPowered,
        isPowerLow: state.isPowerLow,
        isHitInvincible: state.isHitInvincible,
        isPlaying: state.isPlaying,
        isOver: state.isOver,
        powerTimer: state.powerTimer,
        hitTimer: state.hitTimer,
        shotsFired: state.shotsFired,
        shotsHit: state.shotsHit,
        usedPower: state.usedPower,
        usedHeal: state.usedHeal,
        tookDamage: state.tookDamage,
        elapsedMs: state.elapsedMs,
        accuracyPercent: state.accuracyPercent,
        defeatedEnemyCount,
        totalEnemies,
        collectedCash,
        totalCash,
        collectedCount,
        totalCollectibles,
        totalMinShots,
        comboCount,
      }),

      // Mutate game state (used to set up test scenarios)
      setState: (patch) => {
        Object.assign(state, patch);
      },

      // Mutate closure-scoped run counters not part of `state` (comboCount,
      // comboTimerMs) — needed because these drive combo-related bonuses/
      // achievements but aren't GameState fields.
      setComboCount: (value) => {
        comboCount = value;
        comboTimerMs = value > 0 ? COMBO_WINDOW_MS : 0;
      },

      // Get live enemy data. readyToFire/firePoseMs/shootTimer are included
      // to let tests assert on the "gunner" behavior's on-screen-only fire
      // gating (see entities.js's updateEnemy()) without needing to inspect
      // bullets directly.
      getEnemies: () => {
        return get("enemy").map((e) => ({
          enemyType: e.enemyType,
          pos: { x: e.pos.x, y: e.pos.y },
          health: e.health,
          defeated: e.defeated,
          readyToFire: e.readyToFire,
          firePoseMs: e.firePoseMs,
          shootTimer: e.shootTimer,
        }));
      },

      // Fast teleport for scenario setup
      teleportPlayer: (x, y) => {
        if (player) {
          player.pos.x = x;
          player.pos.y = y;
          player.vel.x = 0;
          player.vel.y = 0;
        }
      },

      // Defeat all enemies (used in victory scenario tests)
      killAllEnemies: (method = "bullet") => {
        get("enemy").forEach((enemy) => {
          if (!enemy.defeated) defeatEnemy(enemy, 150, method);
        });
      },

      // Collect all collectibles
      collectAllItems: () => {
        get("collectible").forEach((item) => {
          if (!item.collected) {
            item.collected = true;
            item.hidden = true;
            item.pos.x = -9999;
            collectedCount += 1;
            if (item.collectibleType === "cash") collectedCash += 1;
            state.addScore(item.collectibleType === "root-access" ? 50 : item.collectibleType === "redundancy" ? 25 : 10);
          }
        });
      },

      // Direct function references (for calling real game logic)
      winRound,
      defeatEnemy,
      announceUnlocks,
      resetRound,
    };
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
