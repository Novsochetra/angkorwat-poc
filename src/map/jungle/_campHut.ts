import { hash3 } from '../../voxel/random';
import { BAMBOO, banana, pickTone, PLANK, POST, ROCK, ROPE, SAFFRON, Site, stone, THATCH } from './_campKit';
import type { CampLights } from './_campFx';

/**
 * A forest monk's hut (kuti) in its clearing: a one-room house of woven
 * bamboo on stilts, a steep thatched roof of dried palm leaves with the
 * small upturned ends of a Khmer gable, a plank veranda in front under the
 * roof, a ladder down to the ground. By it: an orange robe and its shoulder
 * cloth drying on a line to a bamboo pole, a big glazed water jar with a
 * coconut-shell dipper, a palm-rib broom against a stilt, sandals at the
 * foot of the ladder, the alms bowl on the veranda, stepping stones out to
 * the trail, and a small lamp at the eave that glows at night.
 *
 * Site space (m): +z the way it faces (to the trail), +x its left, the
 * ground at y = 0. Real sizes, a little generous for the 2.4 m roaming explorer.
 */

/** Veranda and room floor (top of the planks). */
const FLOOR = 1.6;
/** The room: half width, back and front wall (z). */
const HW = 1.8;
const BACK = -2.6;
const FRONT = 0.6;
/** The veranda's front edge. */
const EDGE = 2.0;
/** Walls from the floor up to the eaves' plate. */
const WALL = 2.3;
/** Roof: rise over the half width, overhang past the walls (sides, back and front). */
const RISE = 2.0;
const OVER_SIDE = 0.7;
const OVER_END = 0.5;

export function buildMonkHut(s: Site, lights: CampLights): void {
  const seed = s.seed;
  const tone = (list: readonly number[], i: number, j: number, k: number) => pickTone(list, i, j, k, seed);
  const top = FLOOR + WALL;

  // ── Stilts on flat stones, joists, the floor ────────────────────────────
  const rows = [BACK + 0.1, (BACK + FRONT) / 2, FRONT, EDGE - 0.1];
  for (const [r, z] of rows.entries())
    for (const x of [-HW + 0.1, HW - 0.1]) {
      const g = s.ground(x, z);
      // (the room's corner posts run on up to the eaves)
      const up = r < 3 ? top : FLOOR - 0.12;
      const h = up - g + 0.3;
      const parts = Math.ceil(h / 1.6);
      for (let p = 0; p < parts; p++) {
        const y0 = g - 0.3 + (p * h) / parts;
        s.box(x, y0 + h / parts / 2, z, 0.2, h / parts - 0.01, 0.2, tone(POST, r, p, x > 0 ? 1 : 2), 'mapBark');
      }
      s.box(x, g + 0.06, z, 0.46, 0.16, 0.46, tone(ROCK, r, x > 0 ? 3 : 4, 5), 'mapStone');
    }
  // Middle posts under the floor (it is 3.6 m across).
  for (const z of rows) {
    const g = s.ground(0, z);
    s.box(0, (g + FLOOR - 0.12) / 2, z, 0.16, FLOOR - 0.12 - g, 0.16, tone(POST, 9, z * 10, 6), 'mapBark');
  }
  // Bearers across on each row, joists front to back, the planks across.
  for (const z of rows) s.box(0, FLOOR - 0.2, z, 2 * HW + 0.1, 0.14, 0.14, tone(POST, 3, z * 10, 7), 'mapBark');
  for (const x of [-HW + 0.1, -0.6, 0.6, HW - 0.1]) s.box(x, FLOOR - 0.1, (BACK + EDGE) / 2, 0.1, 0.1, EDGE - BACK, tone(POST, x * 10, 4, 8), 'mapBark');
  const pitch = 0.3;
  const n = Math.round((EDGE - BACK) / pitch);
  for (let i = 0; i < n; i++) {
    const z = BACK + (i + 0.5) * pitch;
    s.box(0, FLOOR - 0.03, z, 2 * HW + 0.06, 0.06, pitch - 0.025, tone(PLANK, i, 5, 9), 'wood', { shade: 0.93 + 0.12 * hash3(i, 1, 2, seed) });
  }

  // ── Walls: woven bamboo panels in a frame, a door, a window each side ───
  // (a checker of two tones across and up reads as the weave)
  const weave = (i: number, j: number) => ((i + j) % 2 === 0 ? tone(BAMBOO, i, j, 10) : tone(BAMBOO, i + 7, j + 3, 11));
  const cellW = 0.45;
  const cellH = WALL / 5;
  /** A wall panel from (a0, …) to (a1, …) along x (front/back, at z) or along z (sides, at x), leaving holes. */
  const panel = (along: 'x' | 'z', at: number, a0: number, a1: number, hole: (a: number, y: number) => boolean, id: number) => {
    const m = Math.round((a1 - a0) / cellW);
    const w = (a1 - a0) / m;
    for (let i = 0; i < m; i++)
      for (let j = 0; j < 5; j++) {
        const a = a0 + (i + 0.5) * w;
        const y = FLOOR + (j + 0.5) * cellH;
        if (hole(a, y)) continue;
        const c = weave(i + id * 13, j);
        const inset = (i + j) % 2 === 0 ? 0 : 0.02;
        if (along === 'x') s.box(a, y, at + (at > 0 ? -inset : inset), w - 0.015, cellH - 0.015, 0.07, c, 'wood');
        else s.box(at + (at > 0 ? -inset : inset), y, a, 0.07, cellH - 0.015, w - 0.015, c, 'wood');
      }
  };
  const door = (a: number, y: number) => Math.abs(a) < 0.5 && y < FLOOR + 2.0;
  const window = (c: number) => (a: number, y: number) => Math.abs(a - c) < 0.35 && y > FLOOR + 0.9 && y < FLOOR + 1.6;
  panel('x', FRONT, -HW + 0.2, HW - 0.2, door, 0);
  panel('x', BACK, -HW + 0.2, HW - 0.2, window(0.6), 1);
  panel('z', HW - 0.1, BACK + 0.2, FRONT - 0.1, window(-1.0), 2);
  panel('z', -HW + 0.1, BACK + 0.2, FRONT - 0.1, window(-1.0), 3);
  // The frame: sills, the eaves' plates, the door's jambs and lintel, window shutters propped open.
  for (const z of [FRONT, BACK]) {
    s.box(0, FLOOR + 0.05, z, 2 * HW, 0.1, 0.12, tone(POST, z * 10, 12, 12), 'mapBark');
    s.box(0, top + 0.05, z, 2 * HW + 0.3, 0.12, 0.14, tone(POST, z * 10, 13, 13), 'mapBark');
  }
  for (const x of [-HW + 0.1, HW - 0.1]) s.box(x, top + 0.05, (BACK + FRONT) / 2, 0.14, 0.12, FRONT - BACK + 0.3, tone(POST, x * 10, 14, 14), 'mapBark');
  for (const x of [-0.55, 0.55]) s.box(x, FLOOR + 1.0, FRONT + 0.02, 0.1, 2.0, 0.12, tone(PLANK, x * 10, 15, 15), 'wood');
  s.box(0, FLOOR + 2.05, FRONT + 0.02, 1.2, 0.12, 0.14, tone(PLANK, 1, 16, 16), 'wood');
  // A dark room behind the door and the windows (so they read as openings).
  s.box(0, FLOOR + 1.0, FRONT - 0.25, 1.0, 2.0, 0.06, 0x2a2119, 'wood', { shade: 0.8 });
  for (const x of [HW - 0.35, -HW + 0.35]) s.box(x, FLOOR + 1.25, -1.0, 0.06, 0.7, 0.7, 0x2a2119, 'wood', { shade: 0.8 });
  s.box(0.6, FLOOR + 1.25, BACK + 0.3, 0.7, 0.7, 0.06, 0x2a2119, 'wood', { shade: 0.8 });
  for (const x of [HW + 0.02, -HW - 0.02]) s.box(x + Math.sign(x) * 0.18, FLOOR + 1.85, -1.0, 0.05, 0.62, 0.72, tone(BAMBOO, x * 10, 17, 17), 'wood', { rz: Math.sign(x) * 0.55 });

  // ── Veranda: a low rail each side, the alms bowl, the lamp ──────────────
  for (const x of [-HW + 0.1, HW - 0.1]) {
    for (const z of [FRONT + 0.45, EDGE - 0.1]) s.box(x, FLOOR + 0.35, z, 0.1, 0.7, 0.1, tone(POST, x * 10, z * 10, 18), 'mapBark');
    s.box(x, FLOOR + 0.72, (FRONT + EDGE) / 2 + 0.2, 0.08, 0.07, EDGE - FRONT - 0.3, tone(BAMBOO, x * 10, 19, 19), 'wood');
    s.box(x, FLOOR + 0.4, (FRONT + EDGE) / 2 + 0.2, 0.06, 0.05, EDGE - FRONT - 0.3, tone(BAMBOO, x * 10, 20, 20), 'wood');
  }
  // Along the front edge, leaving the ladder's opening in the middle.
  for (const sx of [1, -1]) {
    s.box(sx * 1.2, FLOOR + 0.72, EDGE - 0.1, 1.2, 0.07, 0.08, tone(BAMBOO, sx, 21, 21), 'wood');
    s.box(sx * 0.6, FLOOR + 0.35, EDGE - 0.1, 0.1, 0.7, 0.1, tone(POST, sx, 22, 22), 'mapBark');
  }
  // The alms bowl (black, with its lid) on a low stand by the door, a folded mat.
  s.box(1.05, FLOOR + 0.1, FRONT + 0.4, 0.3, 0.14, 0.3, 0x5c4630, 'wood');
  s.box(1.05, FLOOR + 0.3, FRONT + 0.4, 0.34, 0.26, 0.34, 0x24211f, 'mapStone');
  s.box(1.05, FLOOR + 0.3, FRONT + 0.4, 0.28, 0.26, 0.28, 0x24211f, 'mapStone', { ry: Math.PI / 4 });
  s.box(1.05, FLOOR + 0.46, FRONT + 0.4, 0.26, 0.05, 0.26, 0x3a3530, 'mapStone');
  s.box(-1.0, FLOOR + 0.05, FRONT + 0.55, 0.9, 0.06, 0.6, 0xb89a62, 'krama', { ry: 0.08 });
  // The lamp: a little tin lantern hung from the front beam, left of the ladder.
  const lampY = FLOOR + 2.0;
  const lx = -1.15;
  const lz = EDGE + 0.05;
  s.beam([lx, top + 0.1, lz], [lx, lampY + 0.2, lz], 0.02, 0.02, 0x3a3530, 'mapStone');
  s.box(lx, lampY + 0.17, lz, 0.2, 0.04, 0.2, 0x6d6a64, 'mapStone');
  s.box(lx, lampY - 0.14, lz, 0.18, 0.04, 0.18, 0x6d6a64, 'mapStone');
  for (const [a, b] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    s.box(lx + a * 0.08, lampY + 0.01, lz + b * 0.08, 0.025, 0.3, 0.025, 0x6d6a64, 'mapStone');
  lights.glow(s, lx, lampY + 0.01, lz, 0.13, 0.22, 0.13, 'lamp');
  lights.halo(s, lx, lampY, lz, 3.2, 'lamp');

  // ── Roof: two slopes of thatch in overlapping courses, a ridge, gables ──
  const zr0 = BACK - OVER_END;
  const zr1 = EDGE + OVER_END;
  const half = HW + OVER_SIDE;
  const slope = Math.atan2(RISE, HW);
  const run = half / Math.cos(slope);
  /** Roof height over the plate at x (the slope's underside). */
  const roofAt = (x: number) => top + RISE * (1 - Math.abs(x) / HW);
  const courses = 8;
  const cw = run / courses;
  // (short bundles, each a little thicker or thinner, higher or lower: thatch, not tiles)
  const pieces = 9;
  const pl = (zr1 - zr0) / pieces;
  for (const sx of [1, -1])
    for (let c = 0; c < courses; c++) {
      // From the eave (c = 0) up to the ridge; each course lies over the one below.
      const d = (c + 0.55) * cw;
      const x = sx * (half - d * Math.cos(slope));
      const y = roofAt(x) + 0.14 + 0.03 * c;
      for (let p = 0; p < pieces; p++) {
        const z = zr0 + (p + 0.5) * pl;
        const sh = 0.84 + 0.08 * (c / courses) + 0.14 * hash3(c, p, sx, seed + 3);
        const t = 0.18 + 0.07 * hash3(c, p, sx, seed + 5);
        s.box(x, y + (hash3(c, p, sx, seed + 6) - 0.5) * 0.06, z, cw * 1.3, t, pl + 0.03, tone(THATCH, c, p, sx + 30), 'mapBark', { rz: -sx * slope, shade: sh });
        // (the course's ragged lower edge, darker: the roof reads as layers of leaves)
        const e = cw * 0.6;
        s.box(x + sx * e * Math.cos(slope), y - e * Math.sin(slope) - 0.05, z + (hash3(c, p, 7, seed) - 0.5) * 0.1, 0.14, 0.2, pl - 0.05, tone(THATCH, c, p, sx + 32), 'mapBark', {
          rz: -sx * slope,
          shade: 0.66 + 0.08 * hash3(c, p, 8, seed),
        });
      }
    }
  // Ragged fringe hanging from the eaves (and the gable ends' edges).
  for (const sx of [1, -1]) {
    const x = sx * (half - 0.05);
    const y = roofAt(x) + 0.02;
    for (let z = zr0 + 0.12; z < zr1; z += 0.24) {
      const len = 0.18 + 0.2 * hash3(z * 10, sx, 1, seed + 4);
      s.box(x, y - len / 2, z, 0.08, len, 0.2, tone(THATCH, z * 10, sx, 31), 'mapBark', { shade: 0.85 });
    }
  }
  // Ridge: a bundled cap along the top, dark, and the upturned ends of the gable (Khmer kbach horns).
  const ry = top + RISE + 0.36;
  for (let p = 0; p < pieces; p++) s.box(0, ry, zr0 + (p + 0.5) * pl, 0.5, 0.3, pl + 0.02, tone(THATCH, p, 40, 41), 'mapBark', { shade: 0.72 });
  for (const [z, dir] of [
    [zr1 + 0.05, 1],
    [zr0 - 0.05, -1],
  ]) {
    s.beam([0, ry, z - dir * 0.2], [0, ry + 0.5, z + dir * 0.25], 0.14, 0.14, tone(POST, dir, 42, 43), 'mapBark');
    s.beam([0, ry + 0.48, z + dir * 0.22], [0, ry + 0.75, z + dir * 0.12], 0.1, 0.1, tone(POST, dir, 44, 45), 'mapBark');
  }
  // Gables: boards filling the triangle over the front beam and the back wall, a bargeboard along each edge.
  for (const [z, id] of [
    [EDGE, 0],
    [BACK, 1],
  ]) {
    const zz = z + (id === 0 ? 0.02 : -0.02);
    if (id === 0) s.box(0, top + 0.05, zz, 2 * HW + 0.3, 0.14, 0.14, tone(POST, 5, 46, 47), 'mapBark');
    for (let x = -HW + 0.15; x < HW; x += 0.3) {
      const h = roofAt(x) - top - 0.05;
      if (h < 0.1) continue;
      s.box(x, top + 0.1 + h / 2, zz, 0.28, h, 0.05, tone(PLANK, x * 10, id, 48), 'wood', { shade: 0.9 });
    }
    for (const sx of [1, -1]) s.beam([sx * half, roofAt(sx * half) + 0.2, zz + (id === 0 ? 1 : -1) * OVER_END], [0, top + RISE + 0.28, zz + (id === 0 ? 1 : -1) * OVER_END], 0.07, 0.24, tone(POST, sx, id, 49), 'mapBark', 0);
  }
  // Veranda posts up to the front beam.
  for (const x of [-HW + 0.1, HW - 0.1]) {
    const z = EDGE - 0.1;
    s.box(x, (FLOOR + top) / 2, z, 0.18, top - FLOOR, 0.18, tone(POST, x * 10, 50, 50), 'mapBark');
  }

  // ── Ladder down from the veranda's middle ───────────────────────────────
  const foot = 1.3;
  for (const sx of [1, -1]) s.beam([sx * 0.36, s.ground(sx * 0.36, EDGE + foot) - 0.05, EDGE + foot], [sx * 0.36, FLOOR + 0.85, EDGE - 0.05], 0.09, 0.1, tone(BAMBOO, sx, 51, 51), 'wood');
  // (rungs on the rails' line: from the foot to the top of the rails)
  const [z0, z1, y1] = [EDGE + foot, EDGE - 0.05, FLOOR + 0.85];
  for (let r = 1; r <= 4; r++) {
    const y = (r * FLOOR) / 5;
    s.box(0, y, z0 + ((z1 - z0) * y) / y1, 0.78, 0.07, 0.14, tone(BAMBOO, r, 52, 52), 'wood');
  }
  // Sandals at its foot, side by side, toes out.
  for (const [x, turn] of [
    [0.12, 0.1],
    [-0.14, -0.08],
  ]) {
    s.box(x, 0.02, EDGE + foot + 0.4, 0.12, 0.04, 0.28, 0x4a3524, 'wood', { ry: turn });
    s.box(x, 0.055, EDGE + foot + 0.36, 0.13, 0.025, 0.035, 0x2c211a, 'wood', { ry: turn });
  }
  // Stepping stones out towards the trail.
  for (let i = 0; i < 4; i++) {
    const z = EDGE + foot + 1.3 + i * 1.1;
    const x = 0.2 * Math.sin(i * 1.7);
    s.box(x, s.ground(x, z) + 0.04, z, 0.7 + 0.15 * hash3(i, 1, 0, seed), 0.14, 0.55, tone(ROCK, i, 53, 53), 'mapStone', { ry: hash3(i, 2, 0, seed) - 0.5 });
  }

  // ── The water jar and its dipper, the broom ─────────────────────────────
  const jx = -1.25;
  const jz = EDGE + 0.9;
  const jar = [0x5a3b26, 0x4e3322, 0x66442c];
  const jg = s.ground(jx, jz);
  for (const [y0, h, w] of [
    [0, 0.14, 0.48],
    [0.14, 0.42, 0.72],
    [0.56, 0.14, 0.58],
    [0.7, 0.1, 0.38],
    [0.8, 0.05, 0.46],
  ]) {
    s.box(jx, jg + y0 + h / 2, jz, w, h, w, tone(jar, y0 * 10, 54, 54), 'wood');
    s.box(jx, jg + y0 + h / 2, jz, w * 0.88, h, w * 0.88, tone(jar, y0 * 10, 55, 55), 'wood', { ry: Math.PI / 4 });
  }
  // (a wooden lid, the coconut shell on it with its stick handle)
  s.box(jx, jg + 0.86, jz, 0.5, 0.05, 0.5, tone(PLANK, 3, 56, 56), 'wood', { ry: 0.3 });
  s.box(jx + 0.05, jg + 0.93, jz, 0.18, 0.09, 0.18, 0x6a4a2c, 'wood');
  s.beam([jx + 0.05, jg + 0.93, jz], [jx + 0.42, jg + 0.98, jz - 0.12], 0.035, 0.035, tone(BAMBOO, 1, 57, 57), 'wood');
  // The broom: a long handle, a fan of palm ribs, leaning on the front-right stilt.
  const bx = HW + 0.12;
  const bz = EDGE + 0.25;
  s.beam([bx + 0.02, 0.45, bz + 0.45], [bx - 0.05, 1.75, bz - 0.02], 0.05, 0.05, tone(BAMBOO, 2, 58, 58), 'wood');
  for (const f of [-1, 0, 1]) s.beam([bx + 0.02, 0.5, bz + 0.45], [bx + 0.05 + f * 0.16, 0.04, bz + 0.6], 0.12, 0.04, tone(THATCH, f, 59, 59), 'mapBark', 0.3 * f);

  // ── The robe drying on a line to a bamboo pole ──────────────────────────
  const pole: [number, number, number] = [HW + 3.4, 0, -1.4];
  const pg = s.ground(pole[0], pole[2]);
  for (let p = 0; p < 2; p++) s.box(pole[0], pg + 0.7 + p * 1.4, pole[2], 0.09 - p * 0.01, 1.39, 0.09 - p * 0.01, tone(BAMBOO, p, 60, 60), 'wood');
  s.box(pole[0], pg + 1.2, pole[2], 0.11, 0.05, 0.11, 0x5e4a30, 'wood');
  s.box(pole[0], pg + 2.2, pole[2], 0.11, 0.05, 0.11, 0x5e4a30, 'wood');
  const la: [number, number, number] = [HW - 0.05, FLOOR + 1.7, BACK + 1.0];
  const lb: [number, number, number] = [pole[0], pg + 2.75, pole[2]];
  const sag = 0.18;
  s.rope(la, lb, sag, 0.035, 7, tone(ROPE, 1, 61, 61));
  // (the line's height at u, and a point on it)
  const on = (u: number): [number, number, number] => [la[0] + (lb[0] - la[0]) * u, la[1] + (lb[1] - la[1]) * u - sag * 4 * u * (1 - u), la[2] + (lb[2] - la[2]) * u];
  const along = Math.atan2(lb[0] - la[0], lb[2] - la[2]);
  /** Cloth folded over the line from u0 to u1: two hanging panels (strips with a little sway), `drop` long. */
  const cloth = (u0: number, u1: number, drop: number, list: readonly number[], id: number) => {
    const strips = Math.max(2, Math.round((u1 - u0) * 12));
    for (let i = 0; i < strips; i++) {
      const u = u0 + ((i + 0.5) / strips) * (u1 - u0);
      const [x, y, z] = on(u);
      const w = (Math.hypot(lb[0] - la[0], lb[2] - la[2]) * (u1 - u0)) / strips;
      for (const side of [1, -1]) {
        const d = drop * (side > 0 ? 1 : 0.85) * (0.95 + 0.1 * hash3(i, side, id, seed));
        const off = side * 0.05;
        const nx = Math.cos(along) * off;
        const nz = -Math.sin(along) * off;
        s.box(x + nx, y - d / 2 - 0.01, z + nz, 0.035, d, w - 0.01, tone(list, i, side, id + 62), 'krama', { ry: along, rx: 0, shade: 0.92 + 0.14 * hash3(i, side, id + 1, seed) });
      }
    }
  };
  cloth(0.2, 0.62, 1.15, SAFFRON, 0);
  cloth(0.72, 0.88, 0.7, [0xe5962e, 0xdc8a28], 1);
  // A few pegs on the line.
  for (const u of [0.2, 0.62, 0.72, 0.88]) {
    const [x, y, z] = on(u);
    s.box(x, y + 0.02, z, 0.05, 0.09, 0.03, 0x8a6a44, 'wood', { ry: along });
  }

  // Banana plants by the hut (the monk's own), a mossy stone or two where the clearing ends, a stool log by the jar.
  banana(s, -3.6, 0.9, 3.4, 1);
  banana(s, 3.9, -3.6, 2.9, 2);
  banana(s, -2.9, -4.2, 2.6, 3);
  stone(s, -3.4, -1.8, 0.8, 1, 0.8);
  stone(s, 3.1, 1.6, 0.6, 2, 0.6);
  s.log([-2.4, 0.2, 2.6], [-2.4, 0.2, 3.5], 0.42, 0x6b533e, 'mapBark');
  s.box(-2.4, 0.42, 3.05, 0.3, 0.02, 0.85, 0xc9a06a, 'wood');
}
