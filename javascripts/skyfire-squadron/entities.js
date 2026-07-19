// Player, enemy, bullet, powerup and explosion factories. Assumes Kaplay has
// already run with `global: true` (see main.js), so sprite()/pos()/area()/
// add()/dt()/destroy() etc. are ambient globals — same assumption
// javascripts/game/entities.js makes.
//
// Unlike the platformer, nothing here goes through addLevel() (see the
// comment at the top of main.js), so every entity here is a plain runtime
// object — destroy()/recreate is always safe, and movement is driven by
// each object's own .onUpdate() callback (same pattern the platformer uses
// for its enemies, see javascripts/game/entities.js's createEnemy()) rather
// than by physics bodies — nothing here uses body()/gravity, everything
// moves by mutating .pos directly, since free 2D flight has no floor to
// rest on the way the platformer's gravity-driven cast does.
//
// Ship art (player + all 8 enemy archetypes) comes from
// dev/generate-skyfire-sheet-assets.py-sliced sprite sheets under
// assets/ships/<shipId>/ — each ship has the same named-frame set (idle,
// bank_left_1-3, bank_right_1-2, idle_alt, thrust_1-3, damaged_1-4,
// fire_1-7, explode_1-7). main.js's preload loads each frame this file
// actually uses as `${shipId}-${frameName}`.

export const PLAYER_WIDTH = 56;
export const PLAYER_HEIGHT = 48;
const PLAYER_SHIP_ID = "player";

// --- Shared ship pose/animation helpers (player + every enemy) -------------
//
// Every ship always faces straight up (no left/right banking tilt — dropped
// per direct request in favor of a simpler, more traditional look). A
// "damaged" frame (health below a threshold) overrides the default thrust
// flicker so a badly-hurt ship always reads as hurt. Sprite swaps only ever
// happen when the desired frame actually changes (tracked via
// entity.currentFrame) — same "don't call .use() every single frame for no
// reason" discipline as the platformer's sprite-pool animation.
const THRUST_FRAME_MS = 110;
const THRUST_FRAMES = ["thrust_1", "thrust_2", "thrust_3"];

// Only `height` is passed to sprite() here (never both width and height) —
// each named frame (idle/thrust/damaged/explode) has a slightly different
// natural crop bounding box after slicing (dev/generate-skyfire-sheet-assets.py's
// isolate_art()+trim), so forcing every frame into one fixed width AND
// height independently scales x/y and visibly squashes whichever frames
// don't happen to match that exact aspect ratio. Height-only lets Kaplay
// derive width from each frame's own native aspect ratio instead (see the
// `sprite()` factory in the vendored kaplay.mjs: passing only one dimension
// computes a single uniform scale from it, rather than independent x/y
// scales) — the ship's on-screen height stays exactly config.height as
// intended, width just floats a few px between frames instead of ever
// distorting.
//
// flipY: entity.faceDown mirrors the whole sprite vertically for enemies —
// every source frame is drawn nose-up (matching the player, which flies
// up-screen and should stay nose-up), but enemies descend down-screen
// toward the player, so their nose needs to point *down* (their direction
// of travel) or they visibly fly backwards, thrusters-first. flipX is left
// alone — these ships are bilaterally symmetric, so a left-right mirror
// would be invisible anyway, and the goal here is only the top/bottom swap.
function setShipFrame(entity, frameName) {
  if (entity.currentFrame === frameName) return;
  entity.currentFrame = frameName;
  entity.use(sprite(`${entity.shipId}-${frameName}`, { height: entity.shipHeight, flipY: entity.faceDown }));
}

// damagedThresholds: fraction-of-max-health breakpoints, most-damaged first
// — the first one the enemy's current health fraction is at or below wins.
const DAMAGED_THRESHOLDS = [
  { at: 0.15, frame: "damaged_3" },
  { at: 0.4, frame: "damaged_2" },
  { at: 0.7, frame: "damaged_1" },
];

function damagedFrameFor(fraction) {
  for (const { at, frame } of DAMAGED_THRESHOLDS) {
    if (fraction <= at) return frame;
  }
  return null;
}

// Called once per frame per ship. No left/right banking tilt (kept simple/
// traditional per direct request — every ship, player included, always
// faces straight up regardless of horizontal movement); `healthFraction` is
// current/max health (1 for anything that doesn't track multi-hit damage
// visuals).
function updateShipPose(entity, deltaTime, healthFraction = 1) {
  entity.thrustMs -= deltaTime * 1000;
  if (entity.thrustMs <= 0) {
    entity.thrustMs = THRUST_FRAME_MS;
    entity.thrustIndex = (entity.thrustIndex + 1) % THRUST_FRAMES.length;
  }

  const damagedFrame = damagedFrameFor(healthFraction);
  setShipFrame(entity, damagedFrame ?? THRUST_FRAMES[entity.thrustIndex]);
}

export function createPlayerShip(x, y) {
  const player = add([
    // height-only, see setShipFrame()'s comment on why width is never also
    // passed.
    sprite(`${PLAYER_SHIP_ID}-idle`, { height: PLAYER_HEIGHT }),
    pos(x, y),
    area(),
    z(10),
    // Explicit opacity() component (not just relying on sprite()'s own
    // render) since main.js mutates .opacity every frame for the
    // hit-invincibility blink — same pairing javascripts/game/entities.js's
    // createPlayer()/createEnemy() always use wherever .opacity gets set
    // later.
    opacity(1),
    "player",
    {
      shipId: PLAYER_SHIP_ID,
      shipHeight: PLAYER_HEIGHT,
      currentFrame: "idle",
      thrustMs: THRUST_FRAME_MS,
      thrustIndex: 0,
      faceDown: false,
    },
  ]);
  return player;
}

// main.js calls this every frame with the player's remaining-lives fraction
// (of MAX_LIVES) so a badly-hurt run reads as visibly damaged, same spirit
// as the enemy damaged-frame system below.
export function updatePlayerPose(player, deltaTime, livesFraction) {
  updateShipPose(player, deltaTime, livesFraction);
}

// Per-archetype tuning. "movement" selects which branch of
// updateEnemyMovement() below drives this type each frame:
//   straight    — constant-speed descent, never fires (Scout: cheap fodder).
//   zigzag      — sine-wave horizontal drift while descending, periodic
//                 single aimed shot at the player (Interceptor).
//   swarm       — faster straight descent with a tighter/quicker horizontal
//                 jitter than zigzag, weak periodic shot (Swarmer — meant to
//                 be spawned in small clusters by stage.js).
//   barrage     — straight descent with a periodic spread volley, no
//                 stop-and-hold (Bulwark/Dreadnought — armored ships that
//                 just plow forward while lobbing shots).
//   hold-beam   — descends to a fixed holdY, then repeatedly fires a single
//                 fast aimed shot before eventually leaving (Lancer).
//   hold-burst  — descends to a fixed holdY, pauses there to fire a burst of
//                 spread shots, then continues off the bottom (Gunship —
//                 unchanged from the original 3-enemy roster).
//   erratic     — fast descent with a randomly re-rolled sine frequency/
//                 amplitude, periodic aimed shot (Phantom — reads as
//                 unpredictable rather than a clean wave).
export const ENEMY_CONFIGS = {
  scout: {
    shipId: "ship1",
    width: 48,
    height: 42,
    speed: 100,
    health: 1,
    score: 60,
    movement: "straight",
  },
  interceptor: {
    shipId: "ship3",
    width: 50,
    height: 45,
    speed: 82,
    health: 2,
    score: 130,
    movement: "zigzag",
    fireIntervalSec: 1.7,
    bulletSpeed: 220,
    bulletSprite: "enemy-bullet-interceptor",
    bulletHeight: 30,
  },
  swarmer: {
    shipId: "ship4",
    width: 39,
    height: 36,
    speed: 132,
    health: 1,
    score: 40,
    movement: "swarm",
    fireIntervalSec: 2.2,
    bulletSpeed: 180,
    bulletSprite: "enemy-bullet-swarmer",
    bulletHeight: 26,
  },
  bulwark: {
    shipId: "ship6",
    width: 67,
    height: 59,
    speed: 46,
    health: 6,
    score: 200,
    movement: "barrage",
    fireIntervalSec: 2.0,
    spreadVelX: [-100, 0, 100],
    bulletSpeed: 170,
    bulletSprite: "enemy-bullet-bulwark",
    bulletHeight: 28,
  },
  lancer: {
    shipId: "ship5",
    width: 56,
    height: 62,
    speed: 50,
    health: 4,
    score: 170,
    movement: "hold-beam",
    holdY: 150,
    fireIntervalSec: 1.3,
    bulletSpeed: 260,
    bulletSprite: "enemy-bullet-lancer",
    bulletHeight: 40,
    leaveFireIntervalSec: 1.8,
    burstCount: 4,
  },
  gunship: {
    shipId: "ship2",
    width: 73,
    height: 63,
    speed: 55,
    health: 5,
    score: 220,
    movement: "hold-burst",
    holdY: 130,
    burstCount: 3,
    burstIntervalSec: 0.45,
    leaveFireIntervalSec: 1.6,
    spreadVelX: [-100, 0, 100],
    bulletSpeed: 220,
    bulletSprite: "enemy-bullet-gunship",
    bulletHeight: 30,
  },
  phantom: {
    shipId: "ship8",
    width: 53,
    height: 50,
    speed: 118,
    health: 3,
    score: 260,
    movement: "erratic",
    fireIntervalSec: 1.5,
    bulletSpeed: 300,
    bulletSprite: "enemy-bullet-phantom",
    bulletHeight: 34,
  },
  dreadnought: {
    shipId: "ship7",
    width: 87,
    height: 81,
    speed: 34,
    health: 10,
    score: 400,
    movement: "barrage",
    fireIntervalSec: 1.8,
    spreadVelX: [-140, -70, 0, 70, 140],
    bulletSpeed: 190,
    bulletSprite: "enemy-bullet-dreadnought",
    bulletHeight: 32,
  },
};

// Duration of the blink triggered by a non-lethal bullet hit — same idiom
// as the platformer's ENEMY_HIT_FLASH_MS.
export const ENEMY_HIT_FLASH_MS = 160;

function updateEnemyMovement(enemy, config, deltaTime) {
  enemy.ageSec += deltaTime;

  if (enemy.hitFlashMs > 0) {
    enemy.hitFlashMs -= deltaTime * 1000;
  }
  updateShipPose(enemy, deltaTime, enemy.health / config.health);
  // Hit-flash blink layers on top of the pose opacity, same as before.
  enemy.opacity = enemy.hitFlashMs > 0 && Math.floor(enemy.hitFlashMs / 40) % 2 === 0 ? 0.35 : 1;

  if (config.movement === "straight") {
    enemy.pos.y += config.speed * deltaTime;
    return;
  }

  if (config.movement === "zigzag") {
    enemy.pos.y += config.speed * deltaTime;
    enemy.pos.x = enemy.baseX + Math.sin(enemy.ageSec * 3) * 50;
    enemy.shootTimer -= deltaTime;
    if (enemy.shootTimer <= 0) {
      enemy.shootTimer = config.fireIntervalSec;
      enemy.wantsFire = "aimed";
    }
    return;
  }

  if (config.movement === "swarm") {
    enemy.pos.y += config.speed * deltaTime;
    enemy.pos.x = enemy.baseX + Math.sin(enemy.ageSec * 6) * 22;
    enemy.shootTimer -= deltaTime;
    if (enemy.shootTimer <= 0) {
      enemy.shootTimer = config.fireIntervalSec;
      enemy.wantsFire = "aimed";
    }
    return;
  }

  if (config.movement === "barrage") {
    enemy.pos.y += config.speed * deltaTime;
    enemy.shootTimer -= deltaTime;
    if (enemy.shootTimer <= 0) {
      enemy.shootTimer = config.fireIntervalSec;
      enemy.wantsFire = "spread";
    }
    return;
  }

  if (config.movement === "erratic") {
    enemy.erraticRerollSec -= deltaTime;
    if (enemy.erraticRerollSec <= 0) {
      enemy.erraticRerollSec = rand(0.8, 1.5);
      enemy.erraticFreq = rand(2, 5);
      enemy.erraticAmp = rand(30, 70);
    }
    enemy.pos.y += config.speed * deltaTime;
    enemy.pos.x = enemy.baseX + Math.sin(enemy.ageSec * enemy.erraticFreq) * enemy.erraticAmp;
    enemy.shootTimer -= deltaTime;
    if (enemy.shootTimer <= 0) {
      enemy.shootTimer = config.fireIntervalSec;
      enemy.wantsFire = "aimed";
    }
    return;
  }

  if (config.movement === "hold-beam") {
    if (enemy.phase === "descend") {
      enemy.pos.y += config.speed * deltaTime;
      if (enemy.pos.y >= config.holdY) {
        enemy.pos.y = config.holdY;
        enemy.phase = "hold";
        enemy.shootTimer = 0.4;
        enemy.burstsLeft = config.burstCount;
      }
    } else if (enemy.phase === "hold") {
      enemy.shootTimer -= deltaTime;
      if (enemy.shootTimer <= 0) {
        enemy.wantsFire = "aimed";
        enemy.burstsLeft -= 1;
        enemy.shootTimer = config.fireIntervalSec;
        if (enemy.burstsLeft <= 0) {
          enemy.phase = "leave";
          enemy.shootTimer = config.leaveFireIntervalSec;
        }
      }
    } else if (enemy.phase === "leave") {
      enemy.pos.y += config.speed * 1.4 * deltaTime;
    }
    return;
  }

  if (config.movement === "hold-burst") {
    if (enemy.phase === "descend") {
      enemy.pos.y += config.speed * deltaTime;
      if (enemy.pos.y >= config.holdY) {
        enemy.pos.y = config.holdY;
        enemy.phase = "hold";
        enemy.shootTimer = 0.5;
        enemy.burstsLeft = config.burstCount;
      }
    } else if (enemy.phase === "hold") {
      enemy.shootTimer -= deltaTime;
      if (enemy.shootTimer <= 0) {
        enemy.wantsFire = "spread";
        enemy.burstsLeft -= 1;
        enemy.shootTimer = config.burstIntervalSec;
        if (enemy.burstsLeft <= 0) {
          enemy.phase = "leave";
          enemy.shootTimer = config.leaveFireIntervalSec;
        }
      }
    } else if (enemy.phase === "leave") {
      enemy.pos.y += config.speed * 1.4 * deltaTime;
    }
    return;
  }
}

// x/y are pixel spawn coordinates (already resolved from stage.js's
// normalized 0-1 x by main.js). speedMultiplier/healthMultiplier come from
// stage.js's difficultyMultiplier(stageNumber) — scaling the shared config
// rather than needing a per-stage copy of ENEMY_CONFIGS. wantsFire is a
// one-frame flag this object sets on itself when it's time to shoot — main.js's
// per-frame enemy loop reads and clears it, then does the actual
// createBullet() call (needs the live player position, which entities.js has
// no reference to), same indirection the platformer's readyToFire flag uses.
export function createEnemy(type, x, y, speedMultiplier = 1, healthMultiplier = 1, getTimeScale = () => 1) {
  const config = ENEMY_CONFIGS[type];
  const health = Math.max(1, Math.round(config.health * healthMultiplier));
  const enemy = add([
    // height-only (see setShipFrame()'s comment on why width is never also
    // passed) and flipY: true — every enemy descends down-screen toward the
    // player and needs to fly nose-first (see setShipFrame()'s comment on
    // faceDown).
    sprite(`${config.shipId}-idle`, { height: config.height, flipY: true }),
    pos(x, y),
    area(),
    z(8),
    opacity(1),
    "enemy",
    {
      enemyType: type,
      shipId: config.shipId,
      shipHeight: config.height,
      currentFrame: "idle",
      thrustMs: THRUST_FRAME_MS,
      thrustIndex: 0,
      faceDown: true,
      spawnX: x,
      spawnY: y,
      baseX: x,
      ageSec: 0,
      health,
      maxHealth: health,
      effectiveSpeed: config.speed * speedMultiplier,
      hitFlashMs: 0,
      defeated: false,
      phase: "descend",
      shootTimer: config.fireIntervalSec ?? Infinity,
      wantsFire: null,
      burstsLeft: 0,
      erraticRerollSec: 0,
      erraticFreq: 3,
      erraticAmp: 40,
    },
  ]);
  // A scaled-speed view of config so updateEnemyMovement()'s `config.speed`
  // reads reflect this instance's difficulty-scaled speed without mutating
  // the shared ENEMY_CONFIGS object other instances also reference.
  const scaledConfig = Object.assign(Object.create(config), { speed: enemy.effectiveSpeed });
  // getTimeScale() lets main.js's Time Dilation power-up slow enemies down
  // (see state.js's isSlowMo) without entities.js needing to import
  // state.js — main.js just passes () => state.isSlowMo ? 0.45 : 1.
  enemy.onUpdate(() => updateEnemyMovement(enemy, scaledConfig, dt() * getTimeScale()));
  return enemy;
}

// Player/enemy shots. Plain runtime entities never touched by addLevel(), so
// destroy() on them is always safe (see the top-of-file comment). Movement
// is applied by main.js's single per-frame `get("bullet")` loop (mirrors the
// platformer's bullet-movement loop exactly), which is also where each
// bullet gets destroyed once it leaves the fixed viewport — deliberately a
// manual bounds check there rather than Kaplay's offscreen() component,
// since some of these are created already above/near the top edge (enemy
// entrances) and offscreen()'s exact behavior for an object that starts
// outside the screen isn't worth relying on unverified.
//
// All bullet art is sliced canonically facing "up" (see
// dev/generate-skyfire-sheet-assets.py) — enemy-fired bullets get a runtime
// rotate(180) instead of a second stored asset.
export function createBullet(owner, x, y, velX, velY, opts = {}) {
  const isPlayerBullet = owner === "player";
  const spriteName = opts.sprite ?? "player-bullet-standard";
  return add([
    // height-only, see setShipFrame()'s comment on why width is never also
    // passed — each bullet sprite has its own native aspect ratio (a stubby
    // round vs. a long thin lance), and forcing a caller-supplied width
    // alongside height would squash it.
    sprite(spriteName, { height: opts.height ?? 26 }),
    pos(x, y),
    anchor("center"),
    rotate(isPlayerBullet ? 0 : 180),
    area(),
    z(6),
    "bullet",
    isPlayerBullet ? "bullet-player" : "bullet-enemy",
    { velX, velY, piercing: opts.piercing ?? false },
  ]);
}

// --- Power-ups --------------------------------------------------------------
//
// Rendered near-native size and given a continuous breathe/wobble so each
// reads as a live pickup rather than a static icon. anchor("center") makes
// x/y the pickup's center (unlike most entities in this file, which are
// top-left-anchored) so the scale()/rotate() pulse below pivots in place
// instead of swinging around a corner — see spawnFromEntry() in main.js for
// the one call site, which passes the intended center directly.
export const POWERUP_HEIGHT = 38;
const POWERUP_BREATHE_RATE = 4;
const POWERUP_BREATHE_AMOUNT = 0.12;
const POWERUP_WOBBLE_RATE = 2.5;
const POWERUP_WOBBLE_DEG = 14;

// The 10 power-ups wired to real effects this pass (see main.js's
// applyPowerUp()) — sprite keys match the `powerup-<type>` names main.js
// preloads from assets/powerups/<name>.png. All 35 sliced icons exist on
// disk regardless; only these have gameplay effects so far.
export const POWERUP_TYPES = [
  "rapid_fire",
  "spread_shot",
  "shield_booster",
  "armor_plating",
  "invincibility",
  "speed_booster",
  "score_multiplier",
  "smart_bomb_reload",
  "time_dilation",
  "giga_laser",
];

export function createPowerUp(x, y, type) {
  const powerup = add([
    // height-only, see setShipFrame()'s comment on why width is never also
    // passed — each of the 35 power-up icons is independently illustrated
    // with its own native aspect ratio.
    sprite(`powerup-${type}`, { height: POWERUP_HEIGHT }),
    pos(x, y),
    anchor("center"),
    area(),
    rotate(0),
    scale(1),
    z(7),
    "powerup",
    { velY: 70, ageSec: 0, powerupType: type },
  ]);
  powerup.onUpdate(() => {
    const dtSec = dt();
    powerup.ageSec += dtSec;
    powerup.pos.y += powerup.velY * dtSec;
    const breathe = 1 + Math.sin(powerup.ageSec * POWERUP_BREATHE_RATE) * POWERUP_BREATHE_AMOUNT;
    powerup.scale = vec2(breathe, breathe);
    powerup.angle = Math.sin(powerup.ageSec * POWERUP_WOBBLE_RATE) * POWERUP_WOBBLE_DEG;
  });
  return powerup;
}

// Pickup burst — see main.js's onCollide("player", "powerup", ...). Same
// one-shot particles() pattern as the effects below, colored to match the
// weapon-upgrade cue (gold/white) rather than the death effects' fire
// palette.
const POWERUP_SPARKLE_COUNT = 14;
const POWERUP_SPARKLE_LIFE = 0.4;

export function spawnPowerUpSparkle(x, y) {
  const fx = add([
    pos(x, y),
    particles(
      {
        max: POWERUP_SPARKLE_COUNT,
        speed: [60, 160],
        angle: [0, 360],
        lifeTime: [0.2, POWERUP_SPARKLE_LIFE],
        colors: [rgb(255, 238, 150), rgb(140, 210, 255)],
        opacities: [1, 0],
      },
      { lifetime: POWERUP_SPARKLE_LIFE + 0.1, rate: 0, direction: 0, spread: 180 },
    ),
    z(9),
    "fx",
  ]);
  fx.emit(POWERUP_SPARKLE_COUNT);
  fx.onEnd(() => destroy(fx));
}

// --- Fire/death effects ------------------------------------------------------
//
// Fiery particle burst — a 3-stop color/opacity gradient per particle
// (bright core fading through orange to dark ember) rather than any sprite
// art, so it reads correctly layered under the explosion sprite animation
// below at any scale.
const FIRE_BURST_LIFE = 0.45;

export function spawnFireBurst(x, y, burstScale = 1) {
  const count = Math.round(18 * burstScale);
  const fx = add([
    pos(x, y),
    particles(
      {
        max: count,
        speed: [80 * burstScale, 220 * burstScale],
        angle: [0, 360],
        lifeTime: [0.22, FIRE_BURST_LIFE],
        colors: [rgb(255, 250, 210), rgb(255, 140, 40), rgb(110, 40, 20)],
        opacities: [1, 0.85, 0],
      },
      { lifetime: FIRE_BURST_LIFE + 0.1, rate: 0, direction: 0, spread: 180 },
    ),
    z(11),
    "fx",
  ]);
  fx.emit(count);
  fx.onEnd(() => destroy(fx));
  return fx;
}

const SMOKE_BASE_SIZE = 30;
const SMOKE_LIFE_MS = 1300;
const SMOKE_START_SCALE = 0.6;
const SMOKE_END_SCALE = 2.2;

// A single vendored "black smoke" puff frame (see CREDITS.md — one frame of
// a 25-frame *living*-smoke loop meant to be looped in place, not a
// grow-from-nothing sequence). Drives its own grow/drift/fade over time via
// a manual scale()/pos/opacity transform — same idiom as every other fx
// object in this file (no tween()). Named sizeScale, not scale — a local
// `scale` would shadow Kaplay's own scale() component factory used below.
function createSmokePuff(x, y, sizeScale) {
  const driftX = rand(-14, 14);
  const driftY = rand(-40, -18); // smoke drifts up and slightly sideways
  const smoke = add([
    sprite("smoke-puff", { width: SMOKE_BASE_SIZE * sizeScale, height: SMOKE_BASE_SIZE * sizeScale }),
    pos(x, y),
    anchor("center"),
    opacity(0.85),
    scale(SMOKE_START_SCALE),
    z(10), // just behind the explosion sprite / fire burst (z 11) above
    "fx",
    { lifeMs: SMOKE_LIFE_MS, ageMs: 0, driftX, driftY },
  ]);
  smoke.onUpdate(() => {
    const deltaMs = dt() * 1000;
    smoke.ageMs += deltaMs;
    smoke.lifeMs -= deltaMs;
    const t = Math.min(1, smoke.ageMs / SMOKE_LIFE_MS);
    const growScale = SMOKE_START_SCALE + (SMOKE_END_SCALE - SMOKE_START_SCALE) * t;
    smoke.scale = vec2(growScale, growScale);
    smoke.pos.x += smoke.driftX * dt();
    smoke.pos.y += smoke.driftY * dt();
    smoke.opacity = 0.85 * (1 - t);
    if (smoke.lifeMs <= 0) destroy(smoke);
  });
  return smoke;
}

const EXPLODE_FRAME_MS = 90;
const EXPLODE_FRAME_COUNT = 7;

// Plays the ship's own sliced 7-frame explosion sequence in place (a real
// authored death animation — spark, fireball, debris chunks flying apart,
// smoke/embers, final smoke+arc — see dev/generate-skyfire-sheet-assets.py's
// SHIP_NAMES row 4). This supersedes the previous session's auto-cropped
// quadrant-fragment shatter: the authored frames already show the ship
// breaking apart, so a separate geometric fragment system would be
// redundant. Manual frame-advance-on-a-timer, matching this codebase's
// established "no onAnimEnd, manual countdown" idiom (see the fire burst/
// smoke puff above and javascripts/game/main.js's death-animation handling).
// height-only, see setShipFrame()'s comment on why width is never also
// passed — each of the 7 explosion frames has its own natural bounding box
// (a tiny spark vs. a big fireball vs. drifting smoke), so a fixed width
// alongside height would squash most of them.
// flipY: true — spawnKillEffect() is only ever called for enemies (see
// main.js's defeatEnemy()), which fly nose-down (see setShipFrame()'s
// comment on faceDown), so their death animation is flipped to match.
function spawnShipExplosionAnim(shipId, cx, cy, height) {
  const fx = add([
    sprite(`${shipId}-explode_1`, { height, flipY: true }),
    pos(cx, cy),
    anchor("center"),
    z(11),
    "fx",
    { frameIdx: 0, frameMs: EXPLODE_FRAME_MS },
  ]);
  fx.onUpdate(() => {
    fx.frameMs -= dt() * 1000;
    if (fx.frameMs > 0) return;
    fx.frameIdx += 1;
    if (fx.frameIdx >= EXPLODE_FRAME_COUNT) {
      destroy(fx);
      return;
    }
    fx.frameMs = EXPLODE_FRAME_MS;
    fx.use(sprite(`${shipId}-explode_${fx.frameIdx + 1}`, { height, flipY: true }));
  });
  return fx;
}

// Full kill effect: the ship's own explosion animation plus a particle fire
// burst and trailing smoke layered underneath, used once at the moment a
// ship dies (defeatEnemy() in main.js — enemies only, see
// spawnShipExplosionAnim()'s comment).
export function spawnKillEffect(shipId, cx, cy, config, killScale = 1) {
  spawnShipExplosionAnim(shipId, cx, cy, config.height * 1.4);
  spawnFireBurst(cx, cy, killScale);
  createSmokePuff(cx, cy, killScale);
}
