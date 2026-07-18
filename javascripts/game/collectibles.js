// Collectible, goal, and bonus-pole factories. Relies on ambient Kaplay
// globals (see entities.js's note on `global: true`).
import { TILE_SIZE } from "./level.js";

const COLLECTIBLE_SPRITES = {
  // powerup-root-access.png's native art is a tiny 13x7 — the smallest
  // source sprite of the three by far. Rendering it at the same height as
  // collectible-cash.png (20) instead of a further-shrunk 16 keeps its
  // visual weight closer to the other two pickups rather than reading as
  // a thin sliver next to them (width follows from preserving its 13:7
  // aspect ratio, not an arbitrary choice).
  "root-access": { sprite: "powerup-root-access", width: 37, height: 20 },
  cash: { sprite: "collectible-cash", width: 28, height: 20 },
  redundancy: { sprite: "collectible-redundancy", width: 32, height: 32 },
};

export function createCollectible(type, x, y) {
  const { sprite: spriteName, width, height } = COLLECTIBLE_SPRITES[type];
  return add([
    sprite(spriteName, { width, height }),
    pos(x, y),
    area(),
    "collectible",
    { collectibleType: type, spawnX: x, spawnY: y, collected: false },
  ]);
}

export function createGoal(x, y) {
  return add([
    sprite("goal-terminal", { width: 48, height: 72 }),
    pos(x, y),
    area(),
    "goal",
  ]);
}

// A bonus server rack planted just before the goal. Grabbing it near the top
// (a well-timed running jump) scores a much bigger "root climb" bonus than
// grabbing it low — Mario flagpole-style optional skill challenge, reskinned
// as a rack with an uplink antenna instead of a flag. `groundY` is the world
// Y of the pole's base (top of the ground tile it stands on). 3 tiles tall:
// a perfectly-timed jump (max height ~140px, see main.js's tuned
// JUMP_FORCE/GRAVITY) grabs it close to the top without the top being
// physically unreachable.
export const POLE_HEIGHT = 3 * 48;

// Status-light color pairs blinked along the rack shaft (see the blip loop
// below) — deliberately not tied to any GameState value, purely ambient
// flavor for the reskin, like a real rack's activity LEDs. Plain [r,g,b]
// arrays rather than rgb() Color instances, since color()'s initial
// component list wants three separate numbers, same as every other
// color(...) call in this codebase.
const RACK_LIGHT_COLORS = [
  [53, 208, 127],
  [255, 45, 58],
];
const RACK_LIGHT_BLINK_SEC = 0.5;

export function createPole(x, groundY) {
  const top = groundY - POLE_HEIGHT;
  add([
    rect(6, POLE_HEIGHT),
    pos(x + 21, top),
    color(40, 42, 50),
    outline(1, rgb(180, 30, 40)),
    "pole-visual",
  ]);
  // A few blinking status-light blips down the shaft — same plain
  // rect()+color() decoration idiom as the ground-edge warning caps in
  // main.js's "#" tile handler, just alternating color on a timer instead
  // of being static.
  for (let i = 0; i < 3; i++) {
    const startIndex = i % 2;
    const blip = add([
      rect(4, 4),
      pos(x + 22, top + 16 + i * 40),
      color(...RACK_LIGHT_COLORS[startIndex]),
      z(1),
      "pole-visual",
      { blipIndex: startIndex, blinkTimer: i * 0.15 },
    ]);
    blip.onUpdate(() => {
      blip.blinkTimer += dt();
      if (blip.blinkTimer >= RACK_LIGHT_BLINK_SEC) {
        blip.blinkTimer = 0;
        blip.blipIndex = 1 - blip.blipIndex;
        blip.color = rgb(...RACK_LIGHT_COLORS[blip.blipIndex]);
      }
    });
  }
  add([
    sprite("bonus-uplink"),
    pos(x + 6, top),
    "pole-visual",
  ]);
  return add([
    rect(TILE_SIZE, POLE_HEIGHT),
    pos(x, top),
    area(),
    opacity(0),
    "pole",
    { poleTop: top, poleBottom: groundY, climbed: false },
  ]);
}
