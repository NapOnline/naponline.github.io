// Player, enemy, boss, bullet, powerup and explosion factories. Assumes
// Kaplay has already run with `global: true` (see main.js), so sprite()/
// pos()/area()/add()/dt()/destroy() etc. are ambient globals — same
// assumption javascripts/game/entities.js makes.
//
// Unlike the platformer, nothing here goes through addLevel() (see the
// comment at the top of main.js), so every entity here is a plain runtime
// object — destroy()/recreate is always safe, and movement is driven by
// each object's own .onUpdate() callback (same pattern the platformer uses
// for its enemies, see javascripts/game/entities.js's createEnemy()) rather
// than by physics bodies — nothing here uses body()/gravity, everything
// moves by mutating .pos directly, since free 2D flight has no floor to
// rest on the way the platformer's gravity-driven cast does.

export const PLAYER_WIDTH = 46;
export const PLAYER_HEIGHT = 35;

export function createPlayerShip(x, y) {
  return add([
    sprite("player-ship", { width: PLAYER_WIDTH, height: PLAYER_HEIGHT }),
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
  ]);
}

// Per-type movement/attack tuning. "movement" selects which branch of
// updateEnemyMovement() below drives this type each frame:
//   straight   — constant-speed descent, never fires (drone: cheap fodder).
//   zigzag     — sine-wave horizontal drift while descending, periodic
//                single aimed shot at the player (fighter).
//   hold-burst — descends to a fixed holdY, pauses there to fire a burst of
//                spread shots, then continues off the bottom (gunship).
export const ENEMY_CONFIGS = {
  drone: {
    sprite: "enemy-drone",
    width: 40,
    height: 36,
    speed: 95,
    health: 1,
    score: 50,
    movement: "straight",
  },
  fighter: {
    sprite: "enemy-fighter",
    width: 44,
    height: 36,
    speed: 75,
    health: 3,
    score: 120,
    movement: "zigzag",
    fireIntervalSec: 1.8,
    bulletSpeed: 210,
  },
  gunship: {
    sprite: "enemy-gunship",
    width: 54,
    height: 47,
    speed: 55,
    health: 5,
    score: 220,
    movement: "hold-burst",
    holdY: 130,
    burstCount: 3,
    burstIntervalSec: 0.45,
    leaveFireIntervalSec: 1.6,
    bulletSpeed: 220,
  },
};

// Duration of the blink triggered by a non-lethal bullet hit — same idiom
// as the platformer's ENEMY_HIT_FLASH_MS.
export const ENEMY_HIT_FLASH_MS = 160;

function updateEnemyMovement(enemy, config, deltaTime) {
  enemy.ageSec += deltaTime;

  if (enemy.hitFlashMs > 0) {
    enemy.hitFlashMs -= deltaTime * 1000;
    enemy.opacity = enemy.hitFlashMs > 0 && Math.floor(enemy.hitFlashMs / 40) % 2 === 0 ? 0.35 : 1;
  } else {
    enemy.opacity = 1;
  }

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
// normalized 0-1 x by main.js). wantsFire is a one-frame flag this object
// sets on itself when it's time to shoot — main.js's per-frame enemy loop
// reads and clears it, then does the actual createBullet() call (needs the
// live player position, which entities.js has no reference to), same
// indirection the platformer's readyToFire flag uses.
export function createEnemy(type, x, y) {
  const config = ENEMY_CONFIGS[type];
  const enemy = add([
    sprite(config.sprite, { width: config.width, height: config.height }),
    pos(x, y),
    area(),
    z(8),
    opacity(1),
    "enemy",
    {
      enemyType: type,
      spawnX: x,
      spawnY: y,
      baseX: x,
      ageSec: 0,
      health: config.health,
      hitFlashMs: 0,
      defeated: false,
      phase: "descend",
      shootTimer: config.fireIntervalSec ?? Infinity,
      wantsFire: null,
      burstsLeft: 0,
    },
  ]);
  enemy.onUpdate(() => updateEnemyMovement(enemy, config, dt()));
  return enemy;
}

export const BOSS_WIDTH = 130;
export const BOSS_HEIGHT = 130;
const BOSS_ENTER_SPEED = 60;
const BOSS_TARGET_Y = 90;

// bossConfig is stage.js's BOSS_CONFIG — phases sorted by ascending
// hpThreshold isn't required; updateBossMovement() picks the last phase
// whose hpThreshold is >= the current health fraction, matching however
// stage.js orders them (currently full-health-down-to-50%, then 50%-to-0%).
export function createBoss(x, y, bossConfig) {
  const boss = add([
    sprite("boss", { width: BOSS_WIDTH, height: BOSS_HEIGHT }),
    pos(x, y),
    area(),
    z(9),
    opacity(1),
    // updateBossMovement() mutates .color for the phase-2 telegraph pulse
    // (same technique as the platformer's outage-turret warning tint) — an
    // explicit color() component is required for that, same pairing as
    // opacity() above.
    color(255, 255, 255),
    "boss",
    {
      health: bossConfig.hp,
      maxHealth: bossConfig.hp,
      hitFlashMs: 0,
      telegraphMs: 0,
      shootTimer: 1.5,
      wantsFire: null,
      entering: true,
      defeated: false,
    },
  ]);
  boss.onUpdate(() => updateBossMovement(boss, bossConfig, dt()));
  return boss;
}

function currentBossPhase(boss, bossConfig) {
  const frac = boss.health / boss.maxHealth;
  let phase = bossConfig.phases[0];
  for (const p of bossConfig.phases) {
    if (frac <= p.hpThreshold) phase = p;
  }
  return phase;
}

function updateBossMovement(boss, bossConfig, deltaTime) {
  if (boss.hitFlashMs > 0) {
    boss.hitFlashMs -= deltaTime * 1000;
    boss.opacity = boss.hitFlashMs > 0 && Math.floor(boss.hitFlashMs / 40) % 2 === 0 ? 0.5 : 1;
  } else {
    boss.opacity = 1;
  }

  if (boss.entering) {
    boss.pos.y += BOSS_ENTER_SPEED * deltaTime;
    if (boss.pos.y >= BOSS_TARGET_Y) {
      boss.pos.y = BOSS_TARGET_Y;
      boss.entering = false;
    }
    return;
  }

  const phase = currentBossPhase(boss, bossConfig);

  if (boss.telegraphMs > 0) {
    boss.telegraphMs -= deltaTime * 1000;
    const pulse = Math.abs(Math.sin(boss.telegraphMs * 0.03));
    boss.color = rgb(lerp(255, 255, pulse), lerp(255, 70, pulse), lerp(255, 70, pulse));
    if (boss.telegraphMs <= 0) {
      boss.color = rgb(255, 255, 255);
      boss.wantsFire = { pattern: phase.pattern, bulletSpeed: phase.bulletSpeed };
    }
    return;
  }

  boss.shootTimer -= deltaTime;
  if (boss.shootTimer <= 0) {
    boss.shootTimer = phase.shootIntervalSec;
    boss.telegraphMs = phase.telegraphSec * 1000;
  }
}

// Player/enemy/boss shots. Plain runtime entities never touched by
// addLevel(), so destroy() on them is always safe (see the top-of-file
// comment). Movement is applied by main.js's single per-frame `get("bullet")`
// loop (mirrors the platformer's bullet-movement loop exactly), which is
// also where each bullet gets destroyed once it leaves the fixed viewport —
// deliberately a manual bounds check there rather than Kaplay's offscreen()
// component, since some of these are created already above/near the top
// edge (enemy/boss entrances) and offscreen()'s exact behavior for an
// object that starts outside the screen isn't worth relying on unverified.
export function createBullet(owner, x, y, velX, velY, opts = {}) {
  const isPlayerBullet = owner === "player";
  const spriteName = opts.sprite ?? (isPlayerBullet ? "bullet-player" : "bullet-enemy");
  return add([
    sprite(spriteName, { width: opts.width ?? 6, height: opts.height ?? 26 }),
    pos(x, y),
    area(),
    z(6),
    "bullet",
    isPlayerBullet ? "bullet-player" : "bullet-enemy",
    { velX, velY },
  ]);
}

export function createPowerUp(x, y) {
  const powerup = add([
    sprite("powerup-weapon", { width: 22, height: 21 }),
    pos(x, y),
    area(),
    z(7),
    "powerup",
    { velY: 70 },
  ]);
  powerup.onUpdate(() => {
    powerup.pos.y += powerup.velY * dt();
  });
  return powerup;
}

const EXPLOSION_FRAME_W = 32;
const EXPLOSION_FRAME_H = 82;
const EXPLOSION_LIFE_MS = 850;

// One-shot burst animation (the vendored 20-frame Kenney fire sheet, see
// javascripts/skyfire-squadron/assets/CREDITS.md), tagged "fx" like the
// platformer's transient effects — never touched by resetRound()'s revival
// logic, always safe to destroy() on a manual timer. This codebase has no
// onAnimEnd usage anywhere (see javascripts/game/main.js's death-animation
// handling, which uses the same manual-countdown idiom) so this follows
// suit rather than introducing a new pattern.
export function createExplosion(x, y, scale = 1) {
  const fx = add([
    sprite("explosion", { anim: "burst", width: EXPLOSION_FRAME_W * scale, height: EXPLOSION_FRAME_H * scale }),
    pos(x, y),
    anchor("center"),
    z(11),
    "fx",
    { lifeMs: EXPLOSION_LIFE_MS },
  ]);
  fx.onUpdate(() => {
    fx.lifeMs -= dt() * 1000;
    if (fx.lifeMs <= 0) destroy(fx);
  });
  return fx;
}

const SMOKE_BASE_SIZE = 30;
const SMOKE_LIFE_MS = 1300;
const SMOKE_START_SCALE = 0.6;
const SMOKE_END_SCALE = 2.2;

// A single vendored "black smoke" puff frame (see CREDITS.md — one frame of
// a 25-frame *living*-smoke loop meant to be looped in place, not a
// grow-from-nothing sequence, so it isn't worth compositing into a sprite
// sheet the way explosion-sheet.png was). Instead this drives its own
// grow/drift/fade over time via a manual scale()/pos/opacity transform —
// same idiom as every other fx object in this codebase (no tween(), see the
// fire burst above and javascripts/game/main.js's death-animation handling).
// Named sizeScale, not scale — a local `scale` would shadow Kaplay's own
// scale() component factory used below (as the platformer's createPlayer()
// avoids the same shadow by never naming a parameter `scale` either).
function createSmokePuff(x, y, sizeScale) {
  const driftX = rand(-14, 14);
  const driftY = rand(-40, -18); // smoke drifts up and slightly sideways
  const smoke = add([
    sprite("smoke-puff", { width: SMOKE_BASE_SIZE * sizeScale, height: SMOKE_BASE_SIZE * sizeScale }),
    pos(x, y),
    anchor("center"),
    opacity(0.85),
    scale(SMOKE_START_SCALE),
    z(10), // just behind the fire burst (z 11) so fire flashes on top of it
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

// Richer death effect: the existing fire burst plus a trailing smoke puff
// that outlives it (SMOKE_LIFE_MS > EXPLOSION_LIFE_MS) — used for actual
// kills (defeatEnemy()/defeatBoss() in main.js). createExplosion() itself
// stays fire-only and is still used as-is for the player's non-lethal hit
// flash, which shouldn't linger with smoke the way a kill does.
export function createDeathEffect(x, y, scale = 1) {
  createExplosion(x, y, scale);
  createSmokePuff(x, y, scale);
}
