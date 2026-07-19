Ship, bullet, and power-up art (`ships/`, `bullets/`, `powerups/`) is original artwork
produced for this site, delivered as labeled 7x5 reference sheets (one player ship,
8 enemy ships, 4 bullet-type sheets, and a power-up icon sheet) and sliced into
individual named sprite PNGs by `dev/generate-skyfire-sheet-assets.py` — see that
script for the exact per-sheet cell layout and naming convention. Effect frames
(thruster/damaged/firing/explosion) and all bullet art are rotated 90° during
slicing to face "up," matching this vertical shmup's scroll direction; enemy-fired
bullets get a runtime 180° flip instead of a second stored asset (see
`entities.js`'s `createBullet()`).

---

Sprites below are selected and renamed from Kenney's **Space Shooter Redux** pack
(kenney.nl), licensed **CC0 1.0 Universal** (public domain — attribution not
required, credited here as good practice). Source:
https://kenney.nl/assets/space-shooter-redux (also mirrored at
https://opengameart.org/content/space-shooter-redux).

| File in this directory | Source file(s) |
| --- | --- |
| `bg-starfield.png` | `Backgrounds/black.png` |
| `bg-asteroid-1.png` | `PNG/Meteors/meteorBrown_big1.png` |
| `bg-asteroid-2.png` | `PNG/Meteors/meteorGrey_med1.png` |

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
