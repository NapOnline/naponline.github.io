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

// Rendered near-native size (native art is 34x33 — the previous 22x21 render
// shrank the bolt icon down to a near-illegible flat blue blob) and given a
// continuous breathe/wobble so it reads as a live pickup rather than a
// static square. anchor("center") makes x/y the pickup's center (unlike
// most entities in this file, which are top-left-anchored) so the
// scale()/rotate() pulse below pivots in place instead of swinging around a
// corner — see spawnFromEntry() in main.js for the one call site, which
// passes the intended center directly.
export const POWERUP_WIDTH = 30;
export const POWERUP_HEIGHT = 29;
const POWERUP_BREATHE_RATE = 4;
const POWERUP_BREATHE_AMOUNT = 0.12;
const POWERUP_WOBBLE_RATE = 2.5;
const POWERUP_WOBBLE_DEG = 14;

export function createPowerUp(x, y) {
  const powerup = add([
    sprite("powerup-weapon", { width: POWERUP_WIDTH, height: POWERUP_HEIGHT }),
    pos(x, y),
    anchor("center"),
    area(),
    rotate(0),
    scale(1),
    z(7),
    "powerup",
    { velY: 70, ageSec: 0 },
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

// Fiery particle burst — replaces a previous sprite-sheet anim (composited
// from Kenney's fire00-fire19 frames) that never actually read as fire: the
// bottom-aligned, non-uniform source frames came out as pale flashing
// vertical slivers once forced into uniform sliceX/sliceY cells, not a
// blast. particles() (see javascripts/game/entities.js's fx helpers, the
// platformer's own equivalent) instead fakes the "boom" with a 3-stop
// color/opacity gradient per particle — bright core fading through orange to
// dark ember — which reads correctly at any scale and needs no source art.
const FIRE_BURST_LIFE = 0.45;

export function spawnFireBurst(x, y, scale = 1) {
  const count = Math.round(18 * scale);
  const fx = add([
    pos(x, y),
    particles(
      {
        max: count,
        speed: [80 * scale, 220 * scale],
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
// grow-from-nothing sequence, so it isn't worth compositing into a sprite
// sheet). Instead this drives its own grow/drift/fade over time via a manual
// scale()/pos/opacity transform —
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

// Fire burst plus a trailing smoke puff that outlives it (SMOKE_LIFE_MS >
// FIRE_BURST_LIFE) — used for the boss finale's smaller flourish bursts (see
// defeatBoss() in main.js), which are cosmetic secondary blasts around a
// boss already mid-shatter, not a full ship breakup. spawnFireBurst() itself
// stays fire-only and is used as-is for the player's non-lethal hit flash,
// which shouldn't linger with smoke the way a kill does.
export function spawnFireSmokeBurst(x, y, scale = 1) {
  spawnFireBurst(x, y, scale);
  createSmokePuff(x, y, scale);
}

const FRAGMENT_LIFE_MS = 500;

// Enemy/boss death "shatter": the ship's own sprite cut into 4 fragments
// (spriteBase is "enemy-<type>" or "boss" — see
// dev/generate-skyfire-fragments.sh for how the `<spriteBase>-fragment-N.png`
// tiles were cut) flying outward under a manual gravity/velocity, fading and
// destroy()ing themselves — mirrors the platformer's spawnEnemyFragments()
// (javascripts/game/entities.js) almost exactly, adapted only for this
// game's center coordinates: defeatEnemy()/defeatBoss() in main.js already
// compute the ship's center (cx/cy), unlike the platformer's top-left
// enemy.pos, so offsets here are signed around that center rather than
// added onto a top-left corner. Tagged "fx" — never touched by
// resetRound()'s "enemy"/"boss" clearing, always destroy()-safe.
export function spawnShipFragments(spriteBase, cx, cy, config) {
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const offsets = [
    [-halfW, -halfH],
    [0, -halfH],
    [-halfW, 0],
    [0, 0],
  ];
  offsets.forEach(([ox, oy], i) => {
    const dirSign = ox < 0 ? -1 : 1;
    const frag = add([
      sprite(`${spriteBase}-fragment-${i}`, { width: halfW, height: halfH }),
      pos(cx + ox, cy + oy),
      opacity(1),
      rotate(rand(-30, 30)),
      z(9),
      "fx",
      {
        fragVel: vec2(dirSign * rand(60, 160), rand(-240, -110)),
        fragAngVel: rand(-360, 360),
        lifeMs: FRAGMENT_LIFE_MS,
      },
    ]);
    frag.onUpdate(() => {
      const dtSec = dt();
      frag.fragVel.y += 900 * dtSec;
      frag.pos.x += frag.fragVel.x * dtSec;
      frag.pos.y += frag.fragVel.y * dtSec;
      frag.rotateBy(frag.fragAngVel * dtSec);
      frag.lifeMs -= dtSec * 1000;
      frag.opacity = Math.max(0, frag.lifeMs / FRAGMENT_LIFE_MS);
      if (frag.lifeMs <= 0) destroy(frag);
    });
  });
}

// Full kill effect: shatter + fire + trailing smoke, used once at the actual
// moment a ship dies (defeatEnemy(), and defeatBoss()'s final full-size
// blast) — see spawnFireSmokeBurst() above for the boss finale's other,
// fragment-less flourish bursts.
export function spawnKillEffect(spriteBase, cx, cy, config, scale = 1) {
  spawnShipFragments(spriteBase, cx, cy, config);
  spawnFireBurst(cx, cy, scale);
  createSmokePuff(cx, cy, scale);
}
