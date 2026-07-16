export const STATES = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  WIN: 'WIN',
  LOSE: 'LOSE',
});

export const MAX_REDUNDANCY = 3;

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
    // pickup (a clean run scores more for needing neither), and how long
    // the run has taken so far (a faster run scores more).
    this.usedPower = false;
    this.usedHeal = false;
    this.elapsedMs = 0;
  }

  start() {
    this.state = STATES.PLAYING;
    this.usedPower = false;
    this.usedHeal = false;
    this.elapsedMs = 0;
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
