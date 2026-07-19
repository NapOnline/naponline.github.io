Sprites in this directory are selected and renamed from Kenney's **Space Shooter
Redux** pack (kenney.nl), licensed **CC0 1.0 Universal** (public domain — attribution
not required, credited here as good practice). Source: https://kenney.nl/assets/space-shooter-redux
(also mirrored at https://opengameart.org/content/space-shooter-redux).

| File in this directory | Source file(s) |
| --- | --- |
| `player-ship.png` | `PNG/playerShip1_blue.png` |
| `enemy-drone.png` | `PNG/Enemies/enemyBlack1.png` |
| `enemy-fighter.png` | `PNG/Enemies/enemyBlue3.png` |
| `enemy-gunship.png` | `PNG/Enemies/enemyRed5.png` |
| `boss.png` | `PNG/ufoRed.png` (rendered scaled up in-game) |
| `bullet-player.png` | `PNG/Lasers/laserBlue01.png` |
| `bullet-enemy.png` | `PNG/Lasers/laserRed01.png` |
| `powerup-weapon.png` | `PNG/Power-ups/powerupBlue_bolt.png` |
| `bg-starfield.png` | `Backgrounds/black.png` |
| `bg-asteroid-1.png` | `PNG/Meteors/meteorBrown_big1.png` |
| `bg-asteroid-2.png` | `PNG/Meteors/meteorGrey_med1.png` |

`enemy-drone-fragment-0..3.png`, `enemy-fighter-fragment-0..3.png`,
`enemy-gunship-fragment-0..3.png`, and `boss-fragment-0..3.png` are mechanical 2x2
crops of the corresponding sprite above (see `dev/generate-skyfire-fragments.sh`),
used by the death "shatter" effect — same convention as the platformer's
`enemy-<type>-fragment-*.png` (see `dev/generate-enemy-fragments.sh`). Not new art,
same license as the source sprite.

---

**"Seamless Space Backgrounds"** by Screaming Brain Studios, licensed **CC0** (no
attribution required). Source: https://opengameart.org/content/seamless-space-backgrounds

| File in this directory | Source file(s) |
| --- | --- |
| `bg-nebula.png` | `Small 512x512/Purple Nebula/Purple Nebula 3 - 512x512.png` |
| `bg-stars-bright.png` | `Small 512x512/Starfields/Starfield 4 - 512x512.png` |

---

**Kenney "Smoke Particles"** (kenney.nl), licensed **CC0 1.0 Universal**. Source:
https://kenney.nl/assets/smoke-particles (mirrored at
https://opengameart.org/content/smoke-particle-assets).

| File in this directory | Source file(s) |
| --- | --- |
| `smoke-puff.png` | `PNG/Black smoke/blackSmoke12.png` (one frame of a 25-frame living-smoke loop, used as a static sprite and animated manually — see javascripts/skyfire-squadron/entities.js) |

---

**"20 CC0 Planet Sprites"** by Wisedawn, licensed **CC0** (public domain, no
attribution required). Source: https://opengameart.org/content/20-cc0-planet-sprites.
Downscaled from the source 1024x1024 to 256x256 (small decorative background
sprites don't need full resolution, and it cuts file size by ~94%).

| File in this directory | Source file(s) |
| --- | --- |
| `bg-planet-1.png` | `3.png` |
| `bg-planet-2.png` | `18.png` |
