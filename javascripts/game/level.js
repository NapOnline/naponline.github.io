// Hand-authored level for the DevOps side-scroller, consumed via Kaplay's
// addLevel() in main.js. Each row must be the same length (generated with a
// small Python script to guarantee alignment and to check every ground gap
// stays within the tuned jump physics in main.js: MOVE_SPEED / JUMP_FORCE /
// GRAVITY give a max same-height jump distance of ~2.8 tiles, so gaps here
// never exceed 2).
//
// Legend:
//   # solid ground/platform (rendered with the ground sprite on the floor
//     row, and the platform sprite on any elevated island)
//   . empty space (or a pit, in the ground row)
//   @ player spawn
//   b/l/p/o enemy spawns (bug/latency-spike/failed-pipeline/outage turret)
//   c cash pickup             k Root Access key
//   r Redundancy restore (heals one lost REDUNDANCY node, capped at max)
//   F bonus flagpole (climb it for a height bonus before the goal)
//   g goal terminal ("Deploy to Production")
//
// Entities sit one row above the ground row they stand on; gravity settles
// the few leftover pixels on the first physics tick. Keep every gap
// jumpable given the tuned physics constants in main.js if you widen the map.

export const TILE_SIZE = 48;

export const LEVEL_MAP = [
  "......................................................................................................................................................",
  ".........c......................c.......................k..........................c.........................c........................c...............",
  "........###....................###.....................###........................###.......................###......................###..............",
  "..@..c.....c......b.c........c...l......c.p.kc......c.....o.c....b.c...c.lr....c.....p......c..oc..b....c.....lc.....p.c...c.o....bc....lc....c.F...g.",
  "##############.#########..##########.###########..############.############..###########.############..###########.############..##########.##########",
];

export const LEVEL_WIDTH = LEVEL_MAP[0].length * TILE_SIZE;
export const LEVEL_HEIGHT = LEVEL_MAP.length * TILE_SIZE;
