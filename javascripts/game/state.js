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
  }

  start() {
    this.state = STATES.PLAYING;
  }

  addScore(points) {
    this.score += points;
  }

  activatePower(durationMs) {
    this.powerTimer = durationMs;
  }

  triggerHitInvincibility(durationMs) {
    this.hitTimer = durationMs;
  }

  tick(dtMs) {
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
