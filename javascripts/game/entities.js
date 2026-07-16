// Player and enemy factories. Assumes Kaplay has already run with
// `global: true` (see main.js), so sprite()/pos()/area()/body()/add()/dt()
// etc. are ambient globals — the standard way Kaplay is used.

// Player sheet is a uniform 8x8 grid of 45x45 frames (see main.js's
// loadSprite call). Frame index = row*8 + col. Row 0 col 0 is a clean
// standing pose, row 1 col 0 a crouched-forward pose (used as the second
// "run" frame — a bob, not a true walk cycle, given the sheet's actual
// poses), row 3 col 6 has the gun raised overhead with a muzzle flash
// (used as the "jump" pose).
export const PLAYER_ANIMS = {
  idle: { from: 0, to: 0 },
  run: { frames: [0, 8], loop: true, speed: 6 },
  jump: { from: 30, to: 30 },
};

export const PATROL_RADIUS = 96;

export const ENEMY_CONFIGS = {
  bug: {
    label: "Bug",
    sprites: ["enemy-bug-1", "enemy-bug-2"],
    tint: [110, 210, 130],
    speed: 55,
    width: 32,
    height: 44,
    behavior: "patrol",
  },
  "latency-spike": {
    label: "Latency Spike",
    sprites: ["enemy-latency-spike-1", "enemy-latency-spike-2"],
    tint: [255, 157, 45],
    speed: 150,
    width: 34,
    height: 44,
    behavior: "burst",
  },
  "failed-pipeline": {
    label: "Failed Pipeline",
    sprites: ["enemy-failed-pipeline-1", "enemy-failed-pipeline-2"],
    tint: [180, 40, 55],
    speed: 65,
    width: 60,
    height: 44,
    behavior: "erratic",
  },
  outage: {
    label: "Outage",
    sprites: ["enemy-outage-1", "enemy-outage-2"],
    tint: [255, 255, 255],
    speed: 0,
    width: 34,
    height: 40,
    behavior: "turret",
    shootIntervalSec: 2.2,
  },
};

const ANIM_SWAP_SEC = 0.26;

export function createPlayer(x, y) {
  return add([
    sprite("player", { anim: "idle" }),
    pos(x, y),
    area(),
    body(),
    opacity(1),
    "player",
  ]);
}

export function createEnemy(type, x, y) {
  const config = ENEMY_CONFIGS[type];
  const enemy = add([
    sprite(config.sprites[0], { width: config.width, height: config.height }),
    pos(x, y),
    area(),
    body(),
    color(config.tint[0], config.tint[1], config.tint[2]),
    "enemy",
    {
      enemyType: type,
      label: config.label,
      spawnX: x,
      spawnY: y,
      minX: x - PATROL_RADIUS,
      maxX: x + PATROL_RADIUS,
      dir: 1,
      animTimer: 0,
      animIndex: 0,
      burstMode: "move",
      burstTimer: 0.6,
      shootTimer: config.shootIntervalSec ?? Infinity,
      readyToFire: false,
    },
  ]);

  enemy.onUpdate(() => {
    updateEnemy(enemy, config);
  });

  return enemy;
}

function swapFrame(enemy, config, deltaTime) {
  enemy.animTimer += deltaTime;
  if (enemy.animTimer >= ANIM_SWAP_SEC) {
    enemy.animTimer = 0;
    enemy.animIndex = 1 - enemy.animIndex;
    enemy.use(sprite(config.sprites[enemy.animIndex], { width: config.width, height: config.height }));
  }
}

function updateEnemy(enemy, config) {
  const deltaTime = dt();
  let speed = config.speed;

  if (config.behavior === "turret") {
    enemy.vel.x = 0;
    swapFrame(enemy, config, deltaTime);
    enemy.shootTimer -= deltaTime;
    if (enemy.shootTimer <= 0) {
      enemy.shootTimer = config.shootIntervalSec;
      enemy.readyToFire = true;
    }
    return;
  }

  if (config.behavior === "burst") {
    enemy.burstTimer -= deltaTime;
    if (enemy.burstTimer <= 0) {
      enemy.burstMode = enemy.burstMode === "move" ? "pause" : "move";
      enemy.burstTimer = enemy.burstMode === "move" ? 0.5 : 0.9;
    }
    speed = enemy.burstMode === "move" ? config.speed : 0;
  } else if (config.behavior === "erratic") {
    if (Math.random() < 0.004) enemy.dir *= -1;
  }

  if (enemy.pos.x <= enemy.minX) enemy.dir = 1;
  if (enemy.pos.x >= enemy.maxX) enemy.dir = -1;

  enemy.vel.x = enemy.dir * speed;
  if (speed > 0) swapFrame(enemy, config, deltaTime);
  // Source art faces left by default, so flip when patrolling right.
  enemy.flipX = enemy.dir > 0;
}

export const BULLET_SPEED = 320;

// Player/enemy shots. Plain runtime entities (never touched by addLevel()),
// so — unlike level tiles/enemies/collectibles — it's safe to destroy() them
// outright once they hit something or leave the level bounds.
export function createBullet(owner, x, y, dir) {
  const isPlayerBullet = owner === "player";
  return add([
    sprite(isPlayerBullet ? "bullet-player" : "bullet-enemy"),
    pos(x, y),
    area(),
    z(5),
    "bullet",
    isPlayerBullet ? "bullet-player" : "bullet-enemy",
    { dir, ownerTag: owner },
  ]);
}
