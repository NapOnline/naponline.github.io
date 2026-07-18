// Composable enemy behavior components, extracted from the monolithic updateEnemy().
// Each behavior is now a reusable component that can be composed into createEnemy().

const ANIM_SWAP_SEC = 0.26;
const TURRET_TELEGRAPH_SEC = 0.3;

// Animate between two frames of the enemy sprite
function swapFrame(enemy, config, deltaTime) {
  enemy.animTimer += deltaTime;
  if (enemy.animTimer >= ANIM_SWAP_SEC) {
    enemy.animTimer = 0;
    enemy.animIndex = 1 - enemy.animIndex;
    enemy.use(sprite(config.sprites[enemy.animIndex], { width: config.width, height: config.height }));
  }
}

// Patrol within a radius, bouncing at edges
export function patrolBehavior(config) {
  return {
    update() {
      if (this.pos.x <= this.minX) this.dir = 1;
      if (this.pos.x >= this.maxX) this.dir = -1;

      this.vel.x = this.dir * config.speed;
      if (config.speed > 0) swapFrame(this, config, dt());
      this.flipX = this.dir > 0;
    },
  };
}

// Burst-move with alternating pause phases
export function burstBehavior(config) {
  return {
    update() {
      this.burstTimer -= dt();
      if (this.burstTimer <= 0) {
        this.burstMode = this.burstMode === "move" ? "pause" : "move";
        this.burstTimer = this.burstMode === "move" ? 0.5 : 0.9;
      }
      const speed = this.burstMode === "move" ? config.speed : 0;

      if (this.pos.x <= this.minX) this.dir = 1;
      if (this.pos.x >= this.maxX) this.dir = -1;

      this.vel.x = this.dir * speed;
      if (speed > 0) swapFrame(this, config, dt());
      this.flipX = this.dir > 0;
    },
  };
}

// Random direction changes
export function erraticBehavior(config) {
  return {
    update() {
      if (Math.random() < 0.004) this.dir *= -1;

      if (this.pos.x <= this.minX) this.dir = 1;
      if (this.pos.x >= this.maxX) this.dir = -1;

      this.vel.x = this.dir * config.speed;
      swapFrame(this, config, dt());
      this.flipX = this.dir > 0;
    },
  };
}

// Stationary turret, shoots with warning
export function turretBehavior(config) {
  return {
    update() {
      this.vel.x = 0;
      swapFrame(this, config, dt());
      this.shootTimer -= dt();

      if (this.shootTimer <= TURRET_TELEGRAPH_SEC) {
        const elapsed = TURRET_TELEGRAPH_SEC - Math.max(0, this.shootTimer);
        const pulse = Math.abs(Math.sin(elapsed * 25));
        this.color = rgb(
          lerp(config.tint[0], 255, pulse),
          lerp(config.tint[1], 70, pulse),
          lerp(config.tint[2], 50, pulse),
        );
      } else if (this.hitFlashMs <= 0) {
        this.color = rgb(config.tint[0], config.tint[1], config.tint[2]);
      }

      if (this.shootTimer <= 0) {
        this.shootTimer = config.shootIntervalSec;
        this.readyToFire = true;
        this.color = rgb(config.tint[0], config.tint[1], config.tint[2]);
      }
    },
  };
}
