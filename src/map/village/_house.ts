import type { RoofKind, WallKind } from './_spots';
import { gableEnd, gableRoof, jar, lantern, Local, planks, potPlant, RIDGE, ROOFS, roofTop, roofUnder, tone, TRIM, WALLS, type GlowFn, type Hole, type Roof } from './_kit';
import { GLOW } from './_lights';

/**
 * The body of a Khmer village house, on a floor already laid: plank walls
 * round the rooms at the back, an open veranda in front under the same
 * roof, a steep stepped roof (palm thatch or tin), windows with open
 * shutters, doors. Local frame (m): x across, +z to the front (the lake),
 * y the world height. The windows and the front doorway of a lived-in house
 * glow at night (`glow`); a lantern hangs on its veranda.
 */

export interface HouseBody {
  /** Across (x) and the rooms' depth, the veranda's depth in front (m). */
  w: number;
  d: number;
  v: number;
  /** Floor top (m). */
  floor: number;
  roof: RoofKind;
  walls: WallKind;
  /** Lived in tonight: lit windows, a lantern. */
  lit: boolean;
  /** A shop: the rooms' front wall is an open counter with shelves of goods. */
  shop?: boolean;
  /** Where the railing opens at the veranda's front (x), or null for none. */
  gap: number | null;
}

/** Height of the walls over the floor (m): the eaves over the veranda leave room for the explorer (2.4 m). */
export const WALL_H = 2.9;

/** The roof over a house body (its rows step in `run` m and up `rise` m). */
export function houseRoof(o: HouseBody): Roof {
  const thatch = o.roof === 'thatch';
  const run = thatch ? 0.45 : 0.5;
  const rise = thatch ? 0.5 : 0.34;
  const zb = -(o.d + o.v) / 2;
  const zf = (o.d + o.v) / 2;
  return { x0: -o.w / 2 - 0.45, x1: o.w / 2 + 0.45, z0: zb - run, z1: zf + run, eave: o.floor + WALL_H - rise, run, rise };
}

/** Build the body: walls, doors, windows, veranda posts and railing, roof. Returns the roof. */
export function houseBody(L: Local, o: HouseBody, glow: GlowFn): Roof {
  const W = o.w;
  const zb = -(o.d + o.v) / 2;
  const zf = (o.d + o.v) / 2;
  const zw = zb + o.d;
  const F = o.floor;
  const top = F + WALL_H;
  const wall = WALLS[o.walls];
  const trim = TRIM[o.walls];
  const r = houseRoof(o);
  const T = 0.2;
  const dark = 0x2b221c;
  const pane = (x: number, y: number, z: number, sx: number, sz: number) => {
    if (o.lit) glow(x, y, z, sx, 0.8, sz, GLOW.window);
    else L.box(x, y, z, sx, 0.8, sz, dark, 'mapBark', 0.9);
  };

  // ── Back wall: the back door (to the landing and stair) and a window ────
  const doorX = -W / 2 + 1.1;
  const backHoles: Hole[] = [{ a0: doorX - 0.5, a1: doorX + 0.5, y0: F, y1: F + 2.1 }];
  const winX = W / 2 - 1.3;
  if (W >= 5.5) backHoles.push({ a0: winX - 0.45, a1: winX + 0.45, y0: F + 1.05, y1: F + 1.95 });
  planks(L, 'x', zb + T / 2, T, -W / 2, W / 2, F, top, backHoles, wall);
  L.span(doorX - 0.5, F, zb + 0.02, doorX + 0.5, F + 2.1, zb + 0.14, tone(trim, L.r(1, 2)), 'mapBark', 0.9);
  if (W >= 5.5) {
    pane(winX, F + 1.5, zb + 0.1, 0.9, 0.1);
    shutters(L, 'x', winX, F + 1.5, zb - 0.04, trim);
  }

  // ── The rooms' front: a door onto the veranda between two windows (or the shop's counter) ──
  const frontTop = Math.min(roofUnder(r, zw - T), roofUnder(r, zw));
  const wx = W / 4 + 0.45;
  if (o.shop) {
    // An open front: a counter, shelves of goods behind, a tube light.
    planks(L, 'x', zw - T / 2, T, -W / 2, W / 2, F + 2.3, frontTop, [], wall);
    L.span(-W / 2, F, zw - T, -W / 2 + 0.5, F + 2.3, zw, tone(wall, 0.3), 'mapBark');
    L.span(W / 2 - 0.5, F, zw - T, W / 2, F + 2.3, zw, tone(wall, 0.6), 'mapBark');
    L.span(-W / 2 + 0.5, F, zw - 0.1, W / 2 - 0.5, F + 1.0, zw + 0.5, 0xd8d0bd, 'mapBark');
    L.span(-W / 2 + 0.4, F + 1.0, zw - 0.15, W / 2 - 0.4, F + 1.08, zw + 0.6, 0x7a5a40, 'mapBark');
    // The dark shop behind, shelves with goods in bright packets.
    L.span(-W / 2 + 0.5, F, zw - 1.3, W / 2 - 0.5, F + 2.3, zw - 1.1, 0x3a2e26, 'mapBark');
    for (const sy of [F + 1.2, F + 1.75]) {
      L.span(-W / 2 + 0.5, sy - 0.05, zw - 1.1, W / 2 - 0.5, sy, zw - 0.8, 0x6a5040, 'mapBark');
      for (let x = -W / 2 + 0.7, i = 0; x < W / 2 - 0.6; x += 0.32, i++) {
        const h = 0.18 + L.r(i, sy, 31) * 0.2;
        L.box(x, sy + h / 2, zw - 0.95, 0.22, h, 0.2, tone([0xd83a2a, 0x2a7ad8, 0xf0c030, 0x3aa84a, 0xf07a2a, 0xe8e0d0], L.r(i, sy, 32)), 'petal');
      }
    }
    // Snacks hung in strips at the counter, a drinks cooler, two plastic stools.
    for (let i = 0; i < 3; i++) L.box(-W / 2 + 1.2 + i * 0.35, F + 1.9, zw + 0.25, 0.2, 0.7, 0.04, tone([0xe83a2a, 0xf0c030, 0x2a8ad8], L.r(i, 33)), 'petal');
    L.span(W / 2 - 1.3, F, zw + 0.7, W / 2 - 0.5, F + 0.9, zw + 1.3, 0x2a6ac8, 'metal');
    L.span(W / 2 - 1.28, F + 0.9, zw + 0.72, W / 2 - 0.52, F + 0.98, zw + 1.28, 0xe8eef2, 'metal');
    for (const [sx, sz] of [
      [-0.8, zw + 1.2],
      [0.3, zf - 0.6],
    ])
      L.box(sx, F + 0.22, sz, 0.36, 0.44, 0.36, 0xc8302a, 'petal');
    glow(0, F + 2.35, zw + 0.25, 1.2, 0.07, 0.07, GLOW.tube, 0.9);
    glow(0, F + 1.5, zw - 1.05, W - 1.2, 1.4, 0.05, GLOW.warm);
    // The sign board over the front.
    L.span(-W / 2 + 0.3, F + 2.4, zw + 0.02, W / 2 - 0.3, F + 2.85, zw + 0.1, 0xc8302a, 'mapStone');
    L.span(-W / 2 + 0.6, F + 2.52, zw + 0.1, W / 2 - 0.6, F + 2.72, zw + 0.13, 0xf0e0b0, 'mapStone');
  } else {
    const frontHoles: Hole[] = [
      { a0: -0.5, a1: 0.5, y0: F, y1: F + 2.1 },
      { a0: -wx - 0.45, a1: -wx + 0.45, y0: F + 1.05, y1: F + 1.95 },
      { a0: wx - 0.45, a1: wx + 0.45, y0: F + 1.05, y1: F + 1.95 },
    ];
    planks(L, 'x', zw - T / 2, T, -W / 2, W / 2, F, frontTop, frontHoles, wall);
    // The doorway: open, the room lit behind it at night (dark by day); shut if nobody is home.
    if (o.lit) glow(0, F + 1.05, zw - 0.12, 1.0, 2.1, 0.08, GLOW.warm);
    else L.span(-0.5, F, zw - 0.14, 0.5, F + 2.1, zw - 0.02, tone(trim, L.r(3, 4)), 'mapBark', 0.9);
    for (const x of [-wx, wx]) {
      pane(x, F + 1.5, zw - 0.1, 0.9, 0.1);
      shutters(L, 'x', x, F + 1.5, zw + 0.04, trim);
    }
  }

  // ── Side walls (a window in each when the rooms are deep enough), gables ──
  for (const side of [-1, 1]) {
    const x = side * (W / 2 - T / 2);
    const mid = (zb + zw) / 2;
    const holes: Hole[] = o.d >= 4 ? [{ a0: mid - 0.45, a1: mid + 0.45, y0: F + 1.05, y1: F + 1.95 }] : [];
    planks(L, 'z', x, T, zb + T, zw - T, F, top, holes, wall);
    if (holes.length) {
      pane(side * (W / 2 - 0.1), F + 1.5, mid, 0.1, 0.9);
      shutters(L, 'z', mid, F + 1.5, side * (W / 2 + 0.04), trim);
    }
    gableEnd(L, r, x, T, zb, zf, top, wall);
  }

  // ── Veranda: corner posts up to the eaves, a railing, pots ───────────────
  for (const side of [-1, 1]) L.span(side * (W / 2 - 0.3) - 0.14, F, zf - 0.28, side * (W / 2 - 0.3) + 0.14, top, zf, tone(wall, 0.9), 'mapBark', 0.85);
  const railY = F + 0.95;
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    L.span(x0, railY - 0.1, z0, x1, railY, z1, tone(trim, 0.2), 'mapBark');
    const along = x1 - x0 > z1 - z0;
    const len = along ? x1 - x0 : z1 - z0;
    for (let s = 0.3; s < len - 0.15; s += 0.55) {
      const x = along ? x0 + s : (x0 + x1) / 2;
      const z = along ? (z0 + z1) / 2 : z0 + s;
      L.box(x, F + 0.42, z, 0.08, 0.84, 0.08, tone(trim, 0.7), 'mapBark');
    }
  };
  const g = o.gap;
  if (!o.shop) {
    if (g === null) rail(-W / 2 + 0.3, zf - 0.1, W / 2 - 0.3, zf);
    else {
      rail(-W / 2 + 0.3, zf - 0.1, g - 0.55, zf);
      rail(g + 0.55, zf - 0.1, W / 2 - 0.3, zf);
    }
    rail(-W / 2, zw + 0.05, -W / 2 + 0.1, zf - 0.28);
    rail(W / 2 - 0.1, zw + 0.05, W / 2, zf - 0.28);
    potPlant(L, -W / 2 + 0.5, F, zf - 0.45);
    potPlant(L, W / 2 - 0.55, F, zw + 0.45, true);
    if (L.r(9, 9) < 0.6) jar(L, -W / 2 + 0.55, F, zw + 0.5, 0.8);
  }

  // ── Roof ──────────────────────────────────────────────────────────────────
  gableRoof(L, r, ROOFS[o.roof], RIDGE[o.roof], o.roof === 'thatch' ? 'mapBark' : 'metal', o.roof === 'thatch' ? 1.6 : 0.9);

  // A lantern on the veranda of a lived-in house.
  if (o.lit && !o.shop) lantern(L, W / 2 - 1.1, top - 0.5, zf - 0.5, glow);
  return r;
}

/** Two open shutters flat against a wall, either side of a window (centre `a` along the wall, at height `y`; `at` the wall's outer face). */
function shutters(L: Local, axis: 'x' | 'z', a: number, y: number, at: number, trim: readonly number[]): void {
  const c = tone(trim, L.r(a, y, 7));
  for (const s of [-1, 1]) {
    const p = a + s * 0.72;
    if (axis === 'x') L.box(p, y, at, 0.44, 0.9, 0.06, c, 'mapBark', 0.95);
    else L.box(at, y, p, 0.06, 0.9, 0.44, c, 'mapBark', 0.95);
  }
}

/** The top of a house body's roof (m). */
export const houseTop = (o: HouseBody): number => roofTop(houseRoof(o));
