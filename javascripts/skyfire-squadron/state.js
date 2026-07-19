export const STATES = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  WIN: 'WIN',
  LOSE: 'LOSE',
});

export const MAX_LIVES = 3;
export const MAX_BOMBS = 3;
export const MAX_WEAPON_LEVEL = 3;

// Hit-invincibility grace period after taking damage — same idea as the
// platformer's GameState.isHitInvincible, independent of any other timer so
// a hit taken mid-bomb-clear or mid-powerup never fights over "state".
export class GameState {
  constructor() {
    this.state = STATES.READY;
    this.score = 0;
    this.lives = MAX_LIVES;
    this.bombs = MAX_BOMBS;
    this.weaponLevel = 1;
    this.elapsedMs = 0;
    this.hitTimer = 0;
    this.tookDamage = false;
  }

  start() {
    this.state = STATES.PLAYING;
    this.elapsedMs = 0;
    this.tookDamage = false;
  }

  addScore(points) {
    this.score += points;
  }

  triggerHitInvincibility(durationMs) {
    this.hitTimer = durationMs;
  }

  tick(dtMs) {
    this.elapsedMs += dtMs;
    if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - dtMs);
  }

  loseLife() {
    this.tookDamage = true;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.state = STATES.LOSE;
      return true;
    }
    return false;
  }

  raiseWeaponLevel() {
    this.weaponLevel = Math.min(MAX_WEAPON_LEVEL, this.weaponLevel + 1);
  }

  win() {
    this.state = STATES.WIN;
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
