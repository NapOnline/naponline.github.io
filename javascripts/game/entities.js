// Player and enemy factories. Assumes Kaplay has already run with
// `global: true` (see main.js), so sprite()/pos()/area()/body()/add()/dt()
// etc. are ambient globals — the standard way Kaplay is used.

// Player sheet is a uniform 8x8 grid of 45x45 frames (see main.js's
// loadSprite call). Frame index = row*8 + col. Row 0 col 0 is a clean
// standing pose (its upper portion is cropped into assets/player-torso.png
// — see below). Row 3 cols 4-5 (frames 28-29) are a crouched, gun-forward
// pose with a horizontal muzzle flash — the "shoot" anim, used whenever
// shootPoseMs is active in main.js, grounded or airborne. Like
// player-torso.png, these two frames are upper-body-only crops — their
// pixel content stops around y=31 of the 45-tall cell, nowhere near the
// legs — so main.js keeps the separate legs child visible under this anim
// too, not just under player-torso. There is no dedicated mid-air pose
// anywhere in this sheet (every other full-body pose reads as
// standing/crouched-on-ground), so airborne-and-not-shooting just reuses
// "idle" rather than a mislabeled pose. Row 7 cols 0-4 (frames
// 56-60) are a previously-unused fall-and-collapse sequence — falling
// backward mid-air, arcing down, sprawled, then prone — played on a fatal
// hit (see main.js's handlePlayerHit()/finishGameOver()). This table only
// covers root-object states now — grounded movement is driven by the
// separate legs child, not by animating this sheet (see
// LEGS_ANIMS/createPlayer()).
export const PLAYER_ANIMS = {
  idle: { from: 0, to: 0 },
  shoot: { from: 28, to: 29, loop: true, speed: 8 },
  death: { from: 56, to: 60, loop: false, speed: 8 },
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
    shootIntervalSec: 2.6,
  },
  "ddos-bot": {
    label: "DDoS Bot",
    // Walk cycle (used by createEnemy()/resetRound(), same convention as every
    // other type above); fireSprites is the new addition — a second 2-frame
    // pool for the "gunner" behavior's fire-pose telegraph, see updateEnemy().
    sprites: ["enemy-ddos-bot-1", "enemy-ddos-bot-2"],
    fireSprites: ["enemy-ddos-bot-fire-1", "enemy-ddos-bot-fire-2"],
    tint: [255, 255, 255],
    speed: 70,
    width: 36,
    height: 44,
    hitbox: { offset: [2, 8], width: 32, height: 36 },
    health: 2,
    behavior: "gunner",
    shootIntervalSec: 2.4,
    // How long the fire-pose animation holds before the shot actually leaves
    // — the visual telegraph, same fairness idea as TURRET_TELEGRAPH_SEC
    // below but done via a sprite swap instead of a color pulse (this enemy
    // moves and swaps sprites constantly already, so a color pulse would be
    // easy to miss against the walk-cycle flicker).
    firePoseSec: 0.5,
    // "Packet flood" shot — a tight 3-way vertical fan instead of a single
    // bolt, thematically a DDoS flood. See main.js's fire loop for how
    // shotPattern/spreadCount/spreadVelY drive createBullet().
    bulletSprite: "bullet-ddos",
    shotPattern: "spread",
    spreadCount: 3,
    spreadVelY: 60,
  },
  "stack-overflow": {
    label: "Stack Overflow",
    sprites: ["enemy-stack-overflow-1", "enemy-stack-overflow-2"],
    tint: [255, 255, 255],
    speed: 0,
    width: 32,
    height: 48,
    hitbox: { offset: [2, 4], width: 28, height: 42 },
    health: 2,
    // Reuses "turret" as-is (stationary + telegraph + fire) — a precarious
    // stack of blocks sitting in place until it topples fits that exactly,
    // no new updateEnemy() branch needed. Bullet shape is decided entirely
    // by shotPattern below, not by the behavior.
    behavior: "turret",
    shootIntervalSec: 2.8,
    // Lobbed "overflowing block" shot — arcs up then falls under arcGravity
    // (see main.js's bullet-movement loop). A slower bulletSpeed than the
    // default keeps it reading as a heavy tumbling block, not a bolt.
    bulletSprite: "bullet-stack-overflow",
    shotPattern: "arc",
    bulletSpeed: 160,
    arcVelY: -190,
    arcGravity: 460,
  },
};

const ANIM_SWAP_SEC = 0.26;

// How long before an "outage" turret fires that it starts telegraphing —
// see updateEnemy()'s turret branch below. Previously readyToFire flipped
// with zero visible warning; this gives the player a fair reaction window,
// same idea as a Mega Man/Contra turret flashing before it shoots.
const TURRET_TELEGRAPH_SEC = 0.3;

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
    // White = no tint. Mutated in main.js's onUpdate to a gold pulse while
    // Root Access is active (and a hard blink as it's about to expire) —
    // see main.js's POWER_TINT constant. .use(sprite(...)) swaps below never
    // touch this component (same as the enemy tint surviving updateEnemy()'s
    // sprite swaps), so it persists across every player layer change.
    color(255, 255, 255),
    // Drives the jump/land squash-and-stretch — see main.js's onUpdate,
    // which sets a stretched/squashed scale on takeoff/landing and decays
    // it back toward (1,1) every frame. Scaling the parent composes through
    // to the legs child automatically (it's a real child object, not a
    // separate root entity), so no separate scale on player.legs is needed.
    scale(1),
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
  player.legs = player.add([
    sprite("player-legs", { anim: "stand" }),
    pos(0, 26),
    opacity(1),
    color(255, 255, 255),
    "player-legs",
  ]);
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
      // Counts down the "gunner" behavior's fire-pose telegraph — see
      // updateEnemy()'s gunner branch. Unused (stays 0) by every other
      // behavior.
      firePoseMs: 0,
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

// spritePool defaults to the walk-cycle pair every other behavior uses;
// the "gunner" behavior's fire-pose telegraph passes config.fireSprites
// instead so it can alternate over its own 2-frame pool without disturbing
// enemy.animIndex's normal walk-cycle meaning.
function swapFrame(enemy, config, deltaTime, spritePool = config.sprites) {
  enemy.animTimer += deltaTime;
  if (enemy.animTimer >= ANIM_SWAP_SEC) {
    enemy.animTimer = 0;
    enemy.animIndex = 1 - enemy.animIndex;
    enemy.use(sprite(spritePool[enemy.animIndex], { width: config.width, height: config.height }));
  }
}

// Shared bounce-at-patrol-bounds check — used by the generic patrol/burst/
// erratic fallthrough at the bottom of updateEnemy() and by the "gunner"
// behavior below, which needs the same bounds logic but can't use that
// shared fallthrough (it has its own full per-frame animation state machine).
function applyPatrolBounds(enemy) {
  if (enemy.pos.x <= enemy.minX) enemy.dir = 1;
  if (enemy.pos.x >= enemy.maxX) enemy.dir = -1;
}

// "On screen" here only needs an X check — see main.js's onUpdate: the
// camera's Y never moves (the level is exactly one screen tall), and X is
// clamped to follow the player. getCamPos()/width() are Kaplay's own
// ambient globals (width() returns the fixed internal render resolution set
// by kaplay({width: VIEW_W, ...}) in main.js, i.e. exactly VIEW_W) — reusing
// them here means this never needs to duplicate main.js's camera-clamp math
// or thread a value through by hand.
function isOnScreen(x, entityWidth) {
  const cam = getCamPos();
  return Math.abs(x + entityWidth / 2 - cam.x) < width() / 2;
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
    if (enemy.shootTimer <= TURRET_TELEGRAPH_SEC) {
      // Pulse the tint toward a warning color as the shot approaches — the
      // hit-flash blink (see the block above) already uses opacity for "I
      // was just hit," so this uses color instead to stay visually distinct.
      const elapsed = TURRET_TELEGRAPH_SEC - Math.max(0, enemy.shootTimer);
      const pulse = Math.abs(Math.sin(elapsed * 25));
      enemy.color = rgb(
        lerp(config.tint[0], 255, pulse),
        lerp(config.tint[1], 70, pulse),
        lerp(config.tint[2], 50, pulse),
      );
    } else if (enemy.hitFlashMs <= 0) {
      enemy.color = rgb(config.tint[0], config.tint[1], config.tint[2]);
    }
    if (enemy.shootTimer <= 0) {
      enemy.shootTimer = config.shootIntervalSec;
      enemy.readyToFire = true;
      enemy.color = rgb(config.tint[0], config.tint[1], config.tint[2]);
    }
    return;
  }

  if (config.behavior === "gunner") {
    // Walks continuously (unlike turret, which is stationary) and only
    // fires when both it and the player are on screen — see isOnScreen()
    // above. The fire-pose animation itself is the telegraph: shootTimer
    // hitting 0 doesn't fire immediately, it starts a firePoseSec-long pose
    // (alternating over config.fireSprites), and only at the end of that
    // window does readyToFire flip true — main.js's existing generic
    // get("enemy").forEach(...) bullet-spawn loop needs no changes to
    // handle this, exactly like it already does for the turret.
    applyPatrolBounds(enemy);
    enemy.vel.x = enemy.dir * config.speed;
    enemy.flipX = enemy.dir > 0;

    if (enemy.firePoseMs > 0) {
      enemy.firePoseMs -= deltaTime * 1000;
      swapFrame(enemy, config, deltaTime, config.fireSprites);
      if (enemy.firePoseMs <= 0) {
        enemy.readyToFire = true;
        enemy.shootTimer = config.shootIntervalSec;
        enemy.animIndex = 0;
        enemy.use(sprite(config.sprites[0], { width: config.width, height: config.height }));
      }
      return;
    }

    swapFrame(enemy, config, deltaTime);
    const player = get("player")[0];
    if (player && isOnScreen(enemy.pos.x, config.width) && isOnScreen(player.pos.x, player.width)) {
      enemy.shootTimer -= deltaTime;
      if (enemy.shootTimer <= 0) {
        enemy.firePoseMs = config.firePoseSec * 1000;
        // Clean telegraph start — otherwise the fire pose's first frame-swap
        // would inherit whatever fractional time was left on the walk cycle.
        enemy.animTimer = 0;
        enemy.animIndex = 0;
      }
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

  applyPatrolBounds(enemy);

  enemy.vel.x = enemy.dir * speed;
  if (speed > 0) swapFrame(enemy, config, deltaTime);
  // Source art faces left by default, so flip when patrolling right.
  enemy.flipX = enemy.dir > 0;
}

export const BULLET_SPEED = 320;

// Player/enemy shots. Plain runtime entities (never touched by addLevel()),
// so — unlike level tiles/enemies/collectibles — it's safe to destroy() them
// outright once they hit something or leave the level bounds.
//
// opts lets a firing enemy (see ENEMY_CONFIGS's bulletSprite/shotPattern
// fields and main.js's fire loop) override the sprite/speed and give the
// bullet an initial vertical velocity and/or per-frame gravity accel, on top
// of the plain horizontal dir every bullet has always had — a spread shot
// passes a small velY fan, an arc shot passes a launch velY plus gravity.
// Collision handlers still key only on the generic "bullet-player"/
// "bullet-enemy" tags, so any shot shape reaches them for free.
export function createBullet(owner, x, y, dir, opts = {}) {
  const isPlayerBullet = owner === "player";
  const spriteName = opts.sprite ?? (isPlayerBullet ? "bullet-player" : "bullet-enemy");
  const speed = opts.speed ?? BULLET_SPEED;
  const components = [
    sprite(spriteName),
    pos(x, y),
    area(),
    z(5),
    "bullet",
    isPlayerBullet ? "bullet-player" : "bullet-enemy",
  ];
  // Only player bullets despawn based on camera position; enemy bullets (turrets)
  // have limited range already and should only despawn on level bounds (see main.js)
  if (isPlayerBullet) {
    components.push(offscreen({ destroy: true, distance: 80 }));
  }
  components.push({ dir, ownerTag: owner, velX: dir * speed, velY: opts.velY ?? 0, gravity: opts.gravity ?? 0 });
  return add(components);
}

const FRAGMENT_LIFE_MS = 500;

// Enemy death "shatter" effect — see defeatEnemy() in main.js. Spawns 4
// fragments cut from the enemy's own sprite (enemy-<type>-fragment-0..3.png,
// see dev/generate-enemy-fragments.sh), each flying outward under a manual
// gravity/velocity and fading out, then destroy()ing itself. Tagged "fx" —
// a shared tag for every transient one-shot effect in this file (also used
// by the pickup effects below), never "enemy" — resetRound()'s
// enemy-revival loop must never touch these. Plain runtime objects, same
// "safe to destroy()" category as bullets above — never touched by
// addLevel(), so never subject to the "don't destroy() level entities"
// constraint noted in main.js's resetRound().
export function spawnEnemyFragments(enemy, config) {
  const halfW = config.width / 2;
  const halfH = config.height / 2;
  const offsets = [
    [0, 0],
    [halfW, 0],
    [0, halfH],
    [halfW, halfH],
  ];
  offsets.forEach(([ox, oy], i) => {
    const dirSign = ox === 0 ? -1 : 1;
    const frag = add([
      sprite(`enemy-${enemy.enemyType}-fragment-${i}`),
      pos(enemy.pos.x + ox, enemy.pos.y + oy),
      opacity(1),
      rotate(rand(-30, 30)),
      z(6),
      "fx",
      {
        fragVel: vec2(dirSign * rand(60, 140), rand(-220, -100)),
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

// Small spark/debris burst layered on top of the fragments above, using
// Kaplay's built-in particles() component (previously unused anywhere in
// this game). One-shot: emit() fires the whole burst immediately (eopt's
// rate is 0, so there's no ongoing trickle), then the effect object
// destroy()s itself once the emitter's own lifetime elapses.
export function spawnEnemyDeathSpark(x, y) {
  const fx = add([
    pos(x, y),
    particles(
      {
        max: 16,
        speed: [80, 220],
        angle: [0, 360],
        lifeTime: [0.2, 0.4],
        colors: [rgb(255, 210, 90), rgb(255, 120, 60)],
        opacities: [1, 0],
      },
      { lifetime: 0.45, rate: 0, direction: 0, spread: 180 },
    ),
    z(7),
    "fx",
  ]);
  fx.emit(16);
  fx.onEnd(() => destroy(fx));
}

// Small particle sparkle for a collectible pickup, colored per collectible
// type by the caller (see main.js's onCollide("player","collectible", ...)).
// Same one-shot particles() burst pattern as spawnEnemyDeathSpark above —
// smaller/quicker by default, with caller-supplied colors instead of the
// death spark's fixed orange palette. opts.count lets a rarer pickup (Root
// Access) ask for a bigger burst without a separate function.
const SPARKLE_DEFAULT_COUNT = 10;
const SPARKLE_LIFE = 0.35;

export function spawnPickupSparkle(x, y, colors, opts = {}) {
  const count = opts.count ?? SPARKLE_DEFAULT_COUNT;
  const fx = add([
    pos(x, y),
    particles(
      {
        max: count,
        speed: [50, 140],
        angle: [0, 360],
        lifeTime: [0.2, SPARKLE_LIFE],
        colors,
        opacities: [1, 0],
      },
      { lifetime: SPARKLE_LIFE + 0.1, rate: 0, direction: 0, spread: 180 },
    ),
    z(7),
    "fx",
  ]);
  fx.emit(count);
  fx.onEnd(() => destroy(fx));
}

// Muzzle flash at the gun tip — see main.js's onButtonPress("shoot", ...).
// Same one-shot particles() pattern as the effects above, tiny and very
// brief so it reads as an instantaneous spark rather than its own effect.
const MUZZLE_FLASH_LIFE = 0.08;

export function spawnMuzzleFlash(x, y) {
  const fx = add([
    pos(x, y),
    particles(
      {
        max: 6,
        speed: [40, 90],
        angle: [0, 360],
        lifeTime: [0.05, MUZZLE_FLASH_LIFE],
        colors: [rgb(255, 250, 200), rgb(255, 200, 90)],
        opacities: [1, 0],
      },
      { lifetime: MUZZLE_FLASH_LIFE + 0.05, rate: 0, direction: 0, spread: 180 },
    ),
    z(6),
    "fx",
  ]);
  fx.emit(6);
  fx.onEnd(() => destroy(fx));
}

// Small periodic spark while Root Access is active — see main.js's onUpdate,
// which throttles calls to this on a timer (powerAuraMs) rather than every
// frame. Same one-shot particles() pattern as the effects above, small and
// upward-drifting (unlike the omnidirectional pickup sparkle) so it reads as
// an ongoing aura rather than another one-off burst.
const POWER_AURA_LIFE = 0.35;

export function spawnPowerAura(x, y) {
  const fx = add([
    pos(x, y),
    particles(
      {
        max: 5,
        speed: [20, 55],
        angle: [0, 360],
        lifeTime: [0.15, POWER_AURA_LIFE],
        colors: [rgb(255, 209, 102), rgb(255, 238, 180)],
        opacities: [0.9, 0],
      },
      { lifetime: POWER_AURA_LIFE + 0.1, rate: 0, direction: -90, spread: 100 },
    ),
    z(6),
    "fx",
  ]);
  fx.emit(5);
  fx.onEnd(() => destroy(fx));
}

// Landing-impact dust — see main.js's onUpdate grounded-transition check.
// Same one-shot particles() pattern, sized small/brief/muted-gray for a
// ground impact rather than a celebratory pickup sparkle.
const LANDING_DUST_LIFE = 0.3;

export function spawnLandingDust(x, y) {
  const fx = add([
    pos(x, y),
    particles(
      {
        max: 8,
        speed: [40, 90],
        angle: [0, 360],
        lifeTime: [0.15, LANDING_DUST_LIFE],
        colors: [rgb(200, 195, 190), rgb(150, 145, 140)],
        opacities: [0.7, 0],
      },
      { lifetime: LANDING_DUST_LIFE + 0.1, rate: 0, direction: 0, spread: 180 },
    ),
    z(6),
    "fx",
  ]);
  fx.emit(8);
  fx.onEnd(() => destroy(fx));
}

// Small floating "+N" score readout that rises FLOAT_TEXT_RISE px and fades
// out over FLOAT_TEXT_LIFE_MS, then destroy()s itself — the same manual
// dt()-driven countdown idiom spawnEnemyFragments uses above (this codebase
// has never used tween() for its own effects, so this doesn't introduce it
// either). anchor("center") just keeps "+10"/"+25"/"+50" centered on the
// pickup regardless of string length, without measuring text width by hand.
const FLOAT_TEXT_LIFE_MS = 550;
const FLOAT_TEXT_RISE = 24;

export function spawnFloatingText(x, y, label, textColor) {
  const t = add([
    pos(x, y),
    anchor("center"),
    text(label, { size: 12 }),
    color(textColor[0], textColor[1], textColor[2]),
    opacity(1),
    z(8),
    "fx",
    { lifeMs: FLOAT_TEXT_LIFE_MS },
  ]);
  t.onUpdate(() => {
    const dtSec = dt();
    t.pos.y -= (FLOAT_TEXT_RISE / (FLOAT_TEXT_LIFE_MS / 1000)) * dtSec;
    t.lifeMs -= dtSec * 1000;
    t.opacity = Math.max(0, t.lifeMs / FLOAT_TEXT_LIFE_MS);
    if (t.lifeMs <= 0) destroy(t);
  });
}
