export const STATES = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  LOSE: 'LOSE',
});

export const MAX_LIVES = 3;
export const MAX_BOMBS = 3;
export const MAX_WEAPON_LEVEL = 3;

// Hit-invincibility grace period after taking damage — same idea as the
// platformer's GameState.isHitInvincible, independent of any other timer so
// a hit taken mid-bomb-clear or mid-powerup never fights over "state". The
// power-up timers below (speedBoostMs, scoreMultiplierMs, etc.) all follow
// the exact same "duration counts down in tick(), a getter exposes
// isActive" pattern as hitTimer/isHitInvincible, just one field per buff —
// see stage.js's POWERUP_CONFIGS for what triggers each one.
export class GameState {
  constructor() {
    this.state = STATES.READY;
    this.score = 0;
    this.lives = MAX_LIVES;
    this.bombs = MAX_BOMBS;
    this.weaponLevel = 1;
    this.stage = 1;
    this.elapsedMs = 0;
    this.hitTimer = 0;
    this.tookDamage = false;

    // Power-up-driven timed buffs (0/false = inactive). powerInvincibleMs is
    // deliberately separate from hitTimer/isHitInvincible — the post-hit
    // grace period and the Invincibility power-up read as different things
    // to the player (one is a brief "you just got hit" blink, the other a
    // sustained "you're untouchable" state) and shouldn't visually collide.
    this.shieldCharges = 0;
    this.powerInvincibleMs = 0;
    this.speedBoostMs = 0;
    this.scoreMultiplierMs = 0;
    this.rapidFireMs = 0;
    this.slowMoMs = 0;
    this.gigaLaserMs = 0;
  }

  start() {
    this.state = STATES.PLAYING;
    this.elapsedMs = 0;
    this.tookDamage = false;
  }

  addScore(points) {
    this.score += this.scoreMultiplierMs > 0 ? points * 2 : points;
  }

  triggerHitInvincibility(durationMs) {
    this.hitTimer = durationMs;
  }

  addShield() {
    this.shieldCharges = 1;
  }

  addLife() {
    this.lives += 1;
  }

  addBomb() {
    this.bombs = Math.min(MAX_BOMBS, this.bombs + 1);
  }

  triggerInvincibility(durationMs) {
    this.powerInvincibleMs = durationMs;
  }

  triggerSpeedBoost(durationMs) {
    this.speedBoostMs = durationMs;
  }

  triggerScoreMultiplier(durationMs) {
    this.scoreMultiplierMs = durationMs;
  }

  triggerRapidFire(durationMs) {
    this.rapidFireMs = durationMs;
  }

  triggerSlowMo(durationMs) {
    this.slowMoMs = durationMs;
  }

  triggerGigaLaser(durationMs) {
    this.gigaLaserMs = durationMs;
  }

  advanceStage() {
    this.stage += 1;
  }

  tick(dtMs) {
    this.elapsedMs += dtMs;
    if (this.hitTimer > 0) this.hitTimer = Math.max(0, this.hitTimer - dtMs);
    if (this.powerInvincibleMs > 0) this.powerInvincibleMs = Math.max(0, this.powerInvincibleMs - dtMs);
    if (this.speedBoostMs > 0) this.speedBoostMs = Math.max(0, this.speedBoostMs - dtMs);
    if (this.scoreMultiplierMs > 0) this.scoreMultiplierMs = Math.max(0, this.scoreMultiplierMs - dtMs);
    if (this.rapidFireMs > 0) this.rapidFireMs = Math.max(0, this.rapidFireMs - dtMs);
    if (this.slowMoMs > 0) this.slowMoMs = Math.max(0, this.slowMoMs - dtMs);
    if (this.gigaLaserMs > 0) this.gigaLaserMs = Math.max(0, this.gigaLaserMs - dtMs);
  }

  // loseLife() itself never consults shieldCharges — a shield absorbing a
  // hit means the hit never gets this far (see main.js's handlePlayerHit(),
  // which checks shieldCharges/powerInvincibleMs before calling this).
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

  get isHitInvincible() {
    return this.hitTimer > 0;
  }

  get isPowerInvincible() {
    return this.powerInvincibleMs > 0;
  }

  get isSpeedBoosted() {
    return this.speedBoostMs > 0;
  }

  get isScoreMultiplied() {
    return this.scoreMultiplierMs > 0;
  }

  get isRapidFire() {
    return this.rapidFireMs > 0;
  }

  get isSlowMo() {
    return this.slowMoMs > 0;
  }

  get isGigaLaser() {
    return this.gigaLaserMs > 0;
  }

  get isPlaying() {
    return this.state === STATES.PLAYING;
  }

  get isOver() {
    return this.state === STATES.LOSE;
  }
}
