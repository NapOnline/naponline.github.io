export const STATES = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  WIN: 'WIN',
  LOSE: 'LOSE',
});

export const MAX_REDUNDANCY = 3;

// Below this remaining powerTimer, isPowerLow flips true — drives the
// "about to expire" warning blink in main.js's onUpdate/HUD sync, same idea
// as the low-redundancy critical-pulse but for the Root Access buff.
const POWER_LOW_THRESHOLD_MS = 2000;

// Power (ROOT ACCESS) and post-hit invincibility are independent countdowns
// rather than sub-states — a hit taken mid-buff, or a buff picked up mid
// grace-period, should never fight over which "state" the game is in.
export class GameState {
  constructor() {
    this.state = STATES.READY;
    this.score = 0;
    this.redundancy = MAX_REDUNDANCY;
    this.powerTimer = 0;
    this.hitTimer = 0;
    // Tracked for the end-of-run bonus breakdown in main.js's winRound() —
    // whether this run ever touched Root Access or the redundancy-restore
    // pickup (a clean run scores more for needing neither), how long the
    // run has taken so far (a faster run scores more), how many shots have
    // been fired (fewer, relative to the level's par, scores more), and
    // whether the player has ever taken damage this run (required for the
    // Perfect Run bonus/celebration).
    this.usedPower = false;
    this.usedHeal = false;
    this.elapsedMs = 0;
    this.shotsFired = 0;
    // Shots that actually landed on an enemy (whether or not that hit was
    // the killing blow) — shotsHit/shotsFired is the run's accuracy, shown
    // at the end regardless of whether the run was won or lost.
    this.shotsHit = 0;
    this.tookDamage = false;
  }

  start() {
    this.state = STATES.PLAYING;
    this.usedPower = false;
    this.usedHeal = false;
    this.elapsedMs = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.tookDamage = false;
  }

  // Accuracy as a whole-number percent, or null when no shots were fired
  // (a stomp-only/Pacifist run has no meaningful accuracy to report).
  get accuracyPercent() {
    if (this.shotsFired === 0) return null;
    return Math.round((this.shotsHit / this.shotsFired) * 100);
  }

  addScore(points) {
    this.score += points;
  }

  activatePower(durationMs) {
    this.powerTimer = durationMs;
    this.usedPower = true;
  }

  triggerHitInvincibility(durationMs) {
    this.hitTimer = durationMs;
  }

  restoreRedundancy(amount = 1) {
    this.redundancy = Math.min(MAX_REDUNDANCY, this.redundancy + amount);
    this.usedHeal = true;
  }

  tick(dtMs) {
    this.elapsedMs += dtMs;
    if (this.powerTimer > 0) this.powerTimer = Math.max(0, this.powerTimer - dtMs);
    if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - dtMs);
  }

  loseSegment() {
    this.tookDamage = true;
    this.redundancy -= 1;
    if (this.redundancy <= 0) {
      this.state = STATES.LOSE;
      return true;
    }
    return false;
  }

  win() {
    this.state = STATES.WIN;
  }

  get isPowered() {
    return this.powerTimer > 0;
  }

  get isPowerLow() {
    return this.isPowered && this.powerTimer <= POWER_LOW_THRESHOLD_MS;
  }

  get isHitInvincible() {
    return this.hitTimer > 0;
  }

  get isPlaying() {
    return this.state === STATES.PLAYING;
  }

  get isOver() {
    return this.state === STATES.WIN || this.state === STATES.LOSE;
  }
}
