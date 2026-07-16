// Collectible, goal, and bonus-pole factories. Relies on ambient Kaplay
// globals (see entities.js's note on `global: true`).
import { TILE_SIZE } from "./level.js";

export function createCollectible(type, x, y) {
  const isKey = type === "root-access";
  const spriteName = isKey ? "powerup-root-access" : "collectible-cash";
  const width = isKey ? 30 : 28;
  const height = isKey ? 16 : 20;
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

// A bonus flagpole planted just before the goal. Grabbing it near the top
// (a well-timed running jump) scores a much bigger "root climb" bonus than
// grabbing it low — Mario flagpole-style optional skill challenge. `groundY`
// is the world Y of the pole's base (top of the ground tile it stands on).
// 3 tiles tall: a perfectly-timed jump (max height ~140px, see main.js's
// tuned JUMP_FORCE/GRAVITY) grabs it close to the top without the top
// being physically unreachable.
export const POLE_HEIGHT = 3 * 48;

export function createPole(x, groundY) {
  const top = groundY - POLE_HEIGHT;
  add([
    rect(6, POLE_HEIGHT),
    pos(x + 21, top),
    color(180, 180, 190),
    outline(1, rgb(90, 90, 100)),
    "pole-visual",
  ]);
  add([
    sprite("bonus-flag"),
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
