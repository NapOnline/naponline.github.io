// Player and enemy factories. Assumes Kaplay has already run with
// `global: true` (see main.js), so sprite()/pos()/area()/body()/add()/dt()
// etc. are ambient globals — the standard way Kaplay is used.

// Player sheet is a uniform 8x8 grid of 45x45 frames (see main.js's
// loadSprite call). Frame index = row*8 + col. Row 0 col 0 is a clean
// standing pose (its upper portion is cropped into assets/player-torso.png
// — see below), row 3 col 6 has the gun raised overhead with a muzzle
// flash (used as the "jump" pose, rendered from this full sheet exactly as
// before). This table only covers those two root-object states now —
// grounded movement is driven by the separate legs child, not by animating
// this sheet (see LEGS_ANIMS/createPlayer()).
export const PLAYER_ANIMS = {
  idle: { from: 0, to: 0 },
  jump: { from: 30, to: 30 },
};

// Frames 18-27 of the sheet above are standalone legs-only art (no
// torso/head) — a real stride cycle meant to be layered under a
// mostly-static torso, unlike the two full-body poses the old single-layer
// "run" anim used to flash between. assets/player-legs.png is a 4-frame
// strip cropped from a curated subset of those (frame order: contact-wide,
// stride-a, contact-narrow, stride-b) — not a biomechanically matched
// cycle (the source art wasn't drawn as one set), but enough to read as an
// actual walk instead of a flicker.
export const LEGS_ANIMS = {
  stand: { from: 0, to: 0 },
  run: { frames: [0, 1, 2, 3], loop: true, speed: 8 },
};

// The original full sheet's cell height. Used anywhere sizing needs to
// stay pinned to the "full body" silhouette (e.g. the bonus-pole climb in
// main.js) regardless of which sprite layer the root player object
// currently has active — the live .height of a swapped-in player-torso
// sprite is much shorter and would otherwise throw that math off.
export const PLAYER_HEIGHT = 45;

export const PATROL_RADIUS = 96;

// Each enemy's hitbox is a fixed rect (offset + size, local to the sprite's
// topleft) sized to the visible silhouette shared by both its anim frames —
// not the full sprite canvas, which for these has a few px of transparent
// margin on each side (see the bbox each sprite was cropped/padded to when
// generated). A static shape can't track exact per-frame bounds as a pose
// shifts slightly between frames; this trades that precision for "hits feel
// like they're landing on the character," matching the player's hitbox in
// createPlayer() below.
export const ENEMY_CONFIGS = {
  bug: {
    // Original art (see AGENTS.md/plan notes) — fully self-colored, no
    // runtime tint needed. Native render size, no upscale.
    label: "Bug",
    sprites: ["enemy-bug-1", "enemy-bug-2"],
    tint: [255, 255, 255],
    speed: 55,
    width: 32,
    height: 44,
    hitbox: { offset: [0, 9], width: 32, height: 34 },
    health: 1,
    behavior: "patrol",
  },
  "latency-spike": {
    label: "Latency Spike",
    sprites: ["enemy-latency-spike-1", "enemy-latency-spike-2"],
    tint: [255, 255, 255],
    speed: 150,
    width: 34,
    height: 44,
    hitbox: { offset: [0, 7], width: 33, height: 37 },
    health: 2,
    behavior: "burst",
  },
  "failed-pipeline": {
    label: "Failed Pipeline",
    sprites: ["enemy-failed-pipeline-1", "enemy-failed-pipeline-2"],
    tint: [255, 255, 255],
    speed: 65,
    width: 58,
    height: 44,
    hitbox: { offset: [8, 1], width: 42, height: 43 },
    health: 3,
    behavior: "erratic",
  },
  outage: {
    label: "Outage",
    sprites: ["enemy-outage-1", "enemy-outage-2"],
    tint: [255, 255, 255],
    speed: 0,
    width: 34,
    height: 40,
    hitbox: { offset: [1, 0], width: 32, height: 40 },
    health: 2,
    behavior: "turret",
    shootIntervalSec: 2.2,
  },
};

const ANIM_SWAP_SEC = 0.26;

// A bare area() defaults to the active sprite's full render rect — for the
// player that's the whole 45x45 cell, which is roughly twice the width and
// height of the actual character silhouette (idle bbox is ~x15-35,y15-45;
// the jump pose is narrower still). This fixed rect is sized to cover both
// the grounded torso+legs silhouette and the airborne jump-frame silhouette
// reasonably well without swapping shape per state (same static-rect
// tradeoff as the enemy hitboxes in ENEMY_CONFIGS above).
const PLAYER_HITBOX = { offset: [13, 8], width: 20, height: 34 };

export function createPlayer(x, y) {
  const player = add([
    sprite("player", { anim: "idle" }),
    pos(x, y),
    area({ shape: new Rect(vec2(...PLAYER_HITBOX.offset), PLAYER_HITBOX.width, PLAYER_HITBOX.height) }),
    body(),
    opacity(1),
    "player",
  ]);
  // Legs are a child (parent-relative pos, never destroyed — only ever
  // shown/hidden, same "never destroy/recreate post-addLevel()" rule as
  // everything else). Hidden by default: the root object starts on the
  // full "player" sheet (its own baked-in legs already visible), and only
  // swaps to the legs-less player-torso sprite once grounded movement
  // starts driving it — see main.js's onUpdate.
  // y:26 matches the source crop offset used to build player-legs.png (see
  // its generation note) — the torso crop stops at y:30 of the original
  // 45x45 frame, the legs strip starts at y:26 of the same frame, and this
  // local offset reproduces that alignment under the parent's topleft anchor.
  player.legs = player.add([sprite("player-legs", { anim: "stand" }), pos(0, 26), opacity(1), "player-legs"]);
  player.legs.hidden = true;
  return player;
}

export function createEnemy(type, x, y) {
  const config = ENEMY_CONFIGS[type];
  const enemy = add([
    sprite(config.sprites[0], { width: config.width, height: config.height }),
    pos(x, y),
    area({ shape: new Rect(vec2(...config.hitbox.offset), config.hitbox.width, config.hitbox.height) }),
    body(),
    color(config.tint[0], config.tint[1], config.tint[2]),
    opacity(1),
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
      // Bullets chip this down by 1 (see main.js's bullet-enemy collision
      // handler); a stomp or Root-Access touch bypasses it entirely and
      // defeats in one hit regardless. hitFlashMs drives a brief opacity
      // blink on a non-lethal hit — see updateEnemy()'s decay below.
      health: config.health,
      hitFlashMs: 0,
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

// Duration of the blink triggered by a non-lethal bullet hit (see
// main.js's bullet-enemy collision handler, which sets enemy.hitFlashMs).
export const ENEMY_HIT_FLASH_MS = 220;

function updateEnemy(enemy, config) {
  const deltaTime = dt();

  if (enemy.hitFlashMs > 0) {
    enemy.hitFlashMs -= deltaTime * 1000;
    enemy.opacity = enemy.hitFlashMs > 0 && Math.floor(enemy.hitFlashMs / 40) % 2 === 0 ? 0.35 : 1;
  }

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
