#!/usr/bin/env python3
"""One-time asset generation: slices the hand-produced Skyfire Squadron
reference sheets (player.png, spaceship1-8.png, bullets1-4.png, powerups1.png —
each a labeled 7x5 grid, expected at ~/Downloads/skyfire/) into individually
named, transparent, tightly-trimmed sprite PNGs under
javascripts/skyfire-squadron/assets/{ships,bullets,powerups}/.

Python + Pillow instead of this repo's usual bash+ImageMagick convention (see
generate-enemy-fragments.sh / generate-skyfire-fragments.sh): a fixed ImageMagick
crop can't reliably separate each cell's art from its caption text, since art
bounding boxes vary a lot cell-to-cell and the caption sits close beneath it in
some cells. Instead, each cell's background is chroma-keyed transparent via a
corner flood-fill, then a second flood-fill from the cell's center isolates only
the *connected* art component and discards anything disconnected (the caption
text is never pixel-connected to the art) — this needs real flood-fill, which
ImageMagick's CLI doesn't expose per-region the way Pillow's ImageDraw does.

This is a one-time host-side tool (not part of dev/test.sh or the toolbox
build) — re-run only if the source sheets in ~/Downloads/skyfire/ change.
Requires: python3, Pillow (`pip install pillow`), and the source PNGs present
locally (they are not committed to the repo — only the sliced output is).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

SRC_DIR = Path.home() / "Downloads" / "skyfire"
OUT_ROOT = Path(__file__).resolve().parent.parent / "javascripts" / "skyfire-squadron" / "assets"

# Verified by direct pixel inspection of the border/grid-line color in
# player.png, cross-checked against spaceship1/8.png and bullets1/4.png at the
# row2/row3 divider (y=608 in every file) — one shared template across all 13
# sheets.
COLS = [0, 397, 800, 1206, 1610, 2016, 2419, 2816]
ROWS = [0, 303, 608, 928, 1233, 1536]
INSET = 6  # px inward from each boundary, to dodge border/gridline remnants

# Rows drawn in the horizontal "nose-right" profile (ship thrust/damaged/
# fire/explode rows, and all bullet art) need a 90-degree counter-clockwise
# rotation to face "up", matching the top-down "nose-up" rows and the
# vertical shmup's scroll direction. Pillow's Image.rotate() takes a
# positive angle as counter-clockwise (the opposite convention from
# ImageMagick's `-rotate`, which is positive-clockwise — an early manual
# verification pass here got bitten by that exact mismatch and shipped -90,
# which is actually clockwise in Pillow and rendered every effect frame/
# bullet upside down; re-verified against player-idle.png's known-correct
# nose-up orientation before fixing).
ROTATE_CCW = 90


def crop_cell(img, row, col):
    x0, x1 = COLS[col] + INSET, COLS[col + 1] - INSET
    y0, y1 = ROWS[row] + INSET, ROWS[row + 1] - INSET
    return img.crop((x0, y0, x1, y1))


MAJOR_COMPONENT_RATIO = 0.25
# Reject any component whose bounding box starts (top edge) below this
# fraction of the cell's height, regardless of size — a pure size-ratio
# filter alone missed this: on bullets4.png specifically (longer compound
# captions like "AOE FIELD (U7)"), a caption's word-cluster can exceed 25%
# of a *small/compact* piece of art's own pixel count and survive the size
# filter, leaving a text fragment baked into the sliced sprite (found on
# aoe_field_u7.png: "...IELD (U7)" visible in the corner). Every caption
# across every row sampled during development starts at 83%+ of the cell's
# height, so 0.80 is a safe cutoff that never clips real art (which always
# starts well above that, even when a flame trail/tail extends low — this
# checks the component's *top* edge, not how far down it reaches).
CAPTION_ZONE_TOP_FRACTION = 0.80


def _largest_component_mask(mask_rgb):
    """Label every connected component of the (black=background, white=opaque)
    mask via repeated flood-fill, and return a same-size mask with only the
    real art kept white. Two filters, both required: (1) size — every
    component at least MAJOR_COMPONENT_RATIO the size of the single largest
    one (a single "nearest to center" seed, tried first, turned out fragile
    for shapes with a large open gap near the cell center — e.g. a
    two-halves dome effect where the middle is empty — latching onto a tiny
    disconnected antialiasing speck instead of the real art; relative size
    correctly keeps genuinely multi-blob art like that same two-halves dome
    while discarding caption text in the common case); (2) position — a
    component entirely below CAPTION_ZONE_TOP_FRACTION of the cell height is
    rejected even if it passed the size filter (see that constant's
    comment)."""
    w, h = mask_rgb.size
    px = mask_rgb.load()
    visited = bytearray(w * h)
    components = []
    for y0 in range(h):
        for x0 in range(w):
            idx0 = y0 * w + x0
            if visited[idx0] or px[x0, y0] == (0, 0, 0):
                continue
            stack = [(x0, y0)]
            visited[idx0] = 1
            comp = [(x0, y0)]
            while stack:
                x, y = stack.pop()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny * w + nx
                        if not visited[nidx] and px[nx, ny] != (0, 0, 0):
                            visited[nidx] = 1
                            stack.append((nx, ny))
                            comp.append((nx, ny))
            components.append(comp)

    out = Image.new("RGB", (w, h), (0, 0, 0))
    if not components:
        return out
    largest = max(len(c) for c in components)
    caption_zone_y = h * CAPTION_ZONE_TOP_FRACTION
    opx = out.load()
    for comp in components:
        if len(comp) < largest * MAJOR_COMPONENT_RATIO:
            continue
        top_y = min(y for _x, y in comp)
        if top_y > caption_zone_y:
            continue
        for x, y in comp:
            opx[x, y] = (1, 1, 1)
    return out


# Hard pre-crop off the bottom fraction of every cell before any flood-fill/
# component analysis runs at all — belt-and-suspenders on top of
# _largest_component_mask()'s position filter. Some cells' caption text
# turned out *pixel-connected* to the art itself (a soft glow/aura effect
# bridging the gap to the caption below it — found on aoe_field_u7.png,
# where the whole cell was one single 73000px connected component spanning
# top to bottom), which no amount of component-based filtering can separate.
# Physically removing the pixels in the caption's zone before any of that
# runs sidesteps the connectivity question entirely. 0.80 sits below every
# measured "real art" extent across sampled rows (~75-84%) and above every
# measured caption start (~83-96%).
CAPTION_STRIP_FRACTION = 0.80


def isolate_art(cell_rgb):
    """Hard-trim the caption zone, chroma-key the background transparent,
    then discard anything not part of the largest remaining connected
    component (any caption remnants near that boundary, plus any grid-line
    remnants a corner flood-fill didn't reach)."""
    cell_rgb = cell_rgb.crop((0, 0, cell_rgb.width, round(cell_rgb.height * CAPTION_STRIP_FRACTION)))
    im = cell_rgb.convert("RGBA")
    w, h = im.size

    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(im, corner, (0, 0, 0, 0), thresh=40)

    alpha = im.getchannel("A")
    mask = Image.new("L", (w, h), 0)
    mpx, apx_src = mask.load(), alpha.load()
    for y in range(h):
        for x in range(w):
            mpx[x, y] = 255 if apx_src[x, y] > 10 else 0
    mask_rgb = mask.convert("RGB")

    keep_mask = _largest_component_mask(mask_rgb)
    keep = keep_mask.load()
    apx = im.load()
    for y in range(h):
        for x in range(w):
            if keep[x, y] != (1, 1, 1):
                r, g, b, _a = apx[x, y]
                apx[x, y] = (r, g, b, 0)

    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def constrain_max_dim(im, max_dim):
    """Downsize (never upsize) so the longer edge is at most max_dim, using
    Lanczos resampling. The source sheets are 300-400px per cell but ships
    render at 30-90px in-game — real-time GPU minification at that ratio
    (even with linear texFilter, see main.js) still under-samples and loses
    detail/aliases, since a single bilinear tap isn't a true area filter.
    Pre-shrinking with a proper high-quality resample here captures far more
    of the source detail into the pixels that actually ship, and shrinks
    file size/GPU minification ratio at the same time."""
    w, h = im.size
    longest = max(w, h)
    if longest <= max_dim:
        return im
    scale = max_dim / longest
    return im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def save_cell(img, row, col, out_path, rotate=False, max_dim=None):
    cell = crop_cell(img, row, col)
    art = isolate_art(cell)
    if rotate:
        art = art.rotate(ROTATE_CCW, expand=True)
    if max_dim:
        art = constrain_max_dim(art, max_dim)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    art.save(out_path)


# --- Ship template: identical row layout across player.png + spaceship1-8.png ---
SHIP_ROTATE_ROWS = {2, 3, 4}
SHIP_NAMES = {
    0: ["idle", "bank_left_1", "bank_left_2", "idle_alt", "bank_left_3", "bank_right_1", "bank_right_2"],
    1: ["side_top_down_idle", "side_left", "side_left_idle", "side_front", "side_back", "side_right", "side_right_idle"],
    2: ["thrust_1", "thrust_2", "thrust_3", "damaged_1", "damaged_2", "damaged_3", "damaged_4"],
    3: ["fire_1", "fire_2", "fire_3", "fire_4", "fire_5", "fire_6", "fire_7"],
    4: ["explode_1", "explode_2", "explode_3", "explode_4", "explode_5", "explode_6", "explode_7"],
}

SHIP_SHEETS = [("player.png", "player")] + [(f"spaceship{i}.png", f"ship{i}") for i in range(1, 9)]

# --- Bullet sheets: bullets1/2/3 share a category template; bullets4 mixes
# prefixed P/E/B/U variants of the same categories plus unique specials in its
# last row. All bullet art is rotated (right-facing source -> up-facing canonical
# asset; enemy-fired instances get a runtime rotate(180) rather than a second
# stored copy). ---
BULLET_NAMES_123 = {
    0: ["standard_1", "standard_2", "standard_3", "ap_round", "incendiary_1", "incendiary_2", "cluster_1"],
    1: ["standard_4", "light_1", "light_2", "ap_round_2", "incendiary_3", "incendiary_4", "cluster_2"],
    2: ["burst_1", "burst_2", "burst_3", "missile_1", "missile_2", "missile_3", "missile_4"],
    3: ["beam_pulse_1", "beam_pulse_2", "beam_pulse_3", "energy_lance_1", "energy_lance_2", "energy_lance_3", "energy_lance_4"],
    4: ["pulse_mine", "smart_bombs", "plasma_grenade", "aoe_field_1", "aoe_field_2", "aoe_field_3", "aoe_field_4"],
}
# bullets2/bullets3 swap cols 1-2 of row 2 from "burst cannon" variants to
# "goo-kinetic" and cols 1-2 of row 3 from "beam pulse" to "quasar-plasma" —
# different art, so different names (see plan notes on visual re-inspection).
BULLET_NAMES_23_OVERRIDES = {
    2: ["burst_1", "goo_kinetic_1", "goo_kinetic_2", "missile_1", "missile_2", "missile_3", "missile_4"],
    3: ["beam_pulse_1", "quasar_plasma_1", "quasar_plasma_2", "energy_lance_1", "energy_lance_2", "energy_lance_3", "energy_lance_4"],
}
BULLET_NAMES_4 = {
    0: ["standard_p1", "standard_p2", "standard_p3", "ap_round_p4", "incendiary_p5", "incendiary_p6", "cluster_p7"],
    1: ["standard_e1", "light_e2", "light_e3", "ap_round_e4", "incendiary_e5", "incendiary_e6", "cluster_e7"],
    2: ["burst_b1", "goo_kinetic_b2", "goo_kinetic_b3", "missile_b4", "missile_b5", "missile_b6", "missile_b7"],
    3: ["pulse_mine_u1", "smart_bombs_u2", "grenade_u3", "aoe_field_u4", "energy_lance_u5", "aoe_field_u6", "aoe_field_u7"],
    4: ["emp_field", "grav_well_1", "grav_well_2", "smoke_canister", "phase_shift", "nano_swarm", "final_effect"],
}

POWERUP_NAMES = {
    0: ["rapid_fire", "spread_shot", "giga_laser", "shield_booster", "reflective_shield", "armor_plating", "invincibility"],
    1: ["split_shot", "heat_seeking_shot", "piercing_shot", "cluster_missile", "guided_beam", "plasma_grenade_lob", "smart_bomb_reload"],
    2: ["score_multiplier", "speed_booster", "loot_magnet", "energy_cell", "overheat_coolant", "drone_deploy", "time_dilation"],
    3: ["critical_hit", "combo_meter", "elemental_buff_fire", "elemental_buff_ice", "elemental_buff_bio", "energy_charge_quasar", "lance_focus"],
    4: ["ultimate_recharge", "orbital_strike", "passive_hull_strength", "passive_shield_regen", "passive_loot_find", "passive_exp_boost", "hacker_mode"],
}


# Longest-edge caps for the Lanczos downsize in save_cell() — kept at least
# ~3x the largest actual in-game render dimension (see entities.js's
# ENEMY_CONFIGS/PLAYER_WIDTH/POWERUP_WIDTH) so the runtime GPU minification
# ratio stays comfortable for high-quality linear filtering, while still
# discarding genuinely-unneeded texture the source sheets have well beyond
# that (native cells top out around 380-400px).
SHIP_MAX_DIM = 340
BULLET_MAX_DIM = 200
POWERUP_MAX_DIM = 180


def process_ships():
    for fname, ship_id in SHIP_SHEETS:
        path = SRC_DIR / fname
        if not path.exists():
            print(f"  SKIP {fname} (not found)")
            continue
        img = Image.open(path).convert("RGB")
        for row, names in SHIP_NAMES.items():
            for col, name in enumerate(names):
                out = OUT_ROOT / "ships" / ship_id / f"{name}.png"
                save_cell(img, row, col, out, rotate=(row in SHIP_ROTATE_ROWS), max_dim=SHIP_MAX_DIM)
        print(f"  sliced {fname} -> ships/{ship_id}/ (35 files)")


def process_bullets():
    for n, sheet_names in [(1, BULLET_NAMES_123), (2, {**BULLET_NAMES_123, **BULLET_NAMES_23_OVERRIDES}),
                            (3, {**BULLET_NAMES_123, **BULLET_NAMES_23_OVERRIDES}), (4, BULLET_NAMES_4)]:
        fname = f"bullets{n}.png"
        path = SRC_DIR / fname
        if not path.exists():
            print(f"  SKIP {fname} (not found)")
            continue
        img = Image.open(path).convert("RGB")
        for row, names in sheet_names.items():
            for col, name in enumerate(names):
                out = OUT_ROOT / "bullets" / f"bullets{n}" / f"{name}.png"
                save_cell(img, row, col, out, rotate=True, max_dim=BULLET_MAX_DIM)
        print(f"  sliced {fname} -> bullets/bullets{n}/ (35 files)")


def process_powerups():
    fname = "powerups1.png"
    path = SRC_DIR / fname
    if not path.exists():
        print(f"  SKIP {fname} (not found)")
        return
    img = Image.open(path).convert("RGB")
    for row, names in POWERUP_NAMES.items():
        for col, name in enumerate(names):
            out = OUT_ROOT / "powerups" / f"{name}.png"
            save_cell(img, row, col, out, rotate=False, max_dim=POWERUP_MAX_DIM)
    print(f"  sliced {fname} -> powerups/ (35 files)")


if __name__ == "__main__":
    if not SRC_DIR.exists():
        print(f"Source directory not found: {SRC_DIR}", file=sys.stderr)
        sys.exit(1)
    print("Slicing ship sheets...")
    process_ships()
    print("Slicing bullet sheets...")
    process_bullets()
    print("Slicing powerup sheet...")
    process_powerups()
    print("Done.")
