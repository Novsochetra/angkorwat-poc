import { hash3 } from '../../voxel/random';
import type { CampLights } from './_campFx';
import { BAMBOO, banana, CUT, LOG_BARK, pickTone, PLANK, POST, ROPE, Site, stone, THATCH, type P3 } from './_campKit';

/**
 * The woodcutters' camp at the foot of Phnom Kulen: a fire ring of sooty
 * stones with charred logs (embers that glow at night, a thin wisp of
 * smoke) and a blackened pot on a tripod over it, two logs to sit on, a
 * lean-to of thatch on forked posts with a bamboo bed under it and a
 * two-man saw hung on its post, a stack of cut logs between stakes, the
 * chopping block with an axe in it among chips and split firewood, an ox
 * cart's wheel leaning on the stack, and the stumps of trees they felled.
 *
 * Site space (m): +z toward the trail (the way it faces), +x its left,
 * the ground at y = 0.
 */

const FIRE: P3 = [0, 0, 1.6];

export function buildWoodcutters(s: Site, lights: CampLights): void {
  const seed = s.seed;
  const tone = (list: readonly number[], i: number, j: number, k: number) => pickTone(list, i, j, k, seed);
  const r = (i: number, k: number) => hash3(i, k, 3, seed + 17);

  // ── Fire ring ────────────────────────────────────────────────────────────
  const [fx, , fz] = FIRE;
  const fg = s.ground(fx, fz);
  s.box(fx, fg + 0.02, fz, 1.3, 0.05, 1.3, 0x4a4540, 'mapStone', { ry: 0.3, shade: 0.8 });
  s.box(fx, fg + 0.03, fz, 1.0, 0.05, 1.0, 0x5d5750, 'mapStone', { ry: 1.1, shade: 0.85 });
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + r(i, 1) * 0.2;
    const d = 0.78 + 0.06 * r(i, 2);
    const w = 0.3 + 0.12 * r(i, 3);
    s.box(fx + Math.sin(a) * d, fg + 0.1, fz + Math.cos(a) * d, w, 0.22 + 0.08 * r(i, 4), w * 0.85, tone([0x6a655d, 0x5a554e, 0x77716a], i, 1, 1), 'mapStone', { ry: a + r(i, 5), shade: 0.8 + 0.15 * r(i, 6) });
  }
  // Charred logs, their ends meeting in the middle; embers between them.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const out = 0.62;
    s.log([fx + Math.sin(a) * out, fg + 0.12, fz + Math.cos(a) * out], [fx + Math.sin(a) * 0.12, fg + 0.2, fz + Math.cos(a) * 0.12], 0.16, i % 2 ? 0x2e2620 : 0x3a2f26, 'mapBark');
    // (the burnt end glows)
    lights.glow(s, fx + Math.sin(a) * 0.2, fg + 0.2, fz + Math.cos(a) * 0.2, 0.13, 0.1, 0.13, 'ember');
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 1.2;
    lights.glow(s, fx + Math.sin(a) * 0.28, fg + 0.07, fz + Math.cos(a) * 0.28, 0.16, 0.06, 0.12, 'ember');
  }
  lights.glow(s, fx, fg + 0.1, fz, 0.22, 0.08, 0.22, 'ember');
  // A few small flames licking up where the logs meet (a low cooking fire under the pot).
  for (const [ox, oz, h] of [
    [0.06, 0.04, 0.3],
    [-0.08, 0.02, 0.22],
    [0.0, -0.08, 0.18],
  ])
    lights.glow(s, fx + ox, fg + 0.22 + h / 2, fz + oz, 0.09, h, 0.09, 'flame');
  lights.halo(s, fx, fg + 0.5, fz, 3.4, 'ember');
  lights.smoke(s, fx, fg + 0.35, fz);
  // A tripod over it, a blackened pot hanging on a short chain.
  const top: P3 = [fx, fg + 1.75, fz];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    s.beam([fx + Math.sin(a) * 1.05, fg - 0.05, fz + Math.cos(a) * 1.05], [top[0] - Math.sin(a) * 0.12, top[1] + 0.2, top[2] - Math.cos(a) * 0.12], 0.07, 0.07, tone(POST, i, 2, 2), 'mapBark');
  }
  s.box(fx, top[1] + 0.02, fz, 0.16, 0.12, 0.16, tone(ROPE, 1, 3, 3), 'wood');
  s.beam([fx, top[1], fz], [fx, fg + 0.95, fz], 0.03, 0.03, 0x3b3835, 'mapStone');
  s.box(fx, fg + 0.72, fz, 0.46, 0.34, 0.46, 0x2a2724, 'mapStone');
  s.box(fx, fg + 0.72, fz, 0.4, 0.3, 0.4, 0x2a2724, 'mapStone', { ry: Math.PI / 4 });
  s.box(fx, fg + 0.9, fz, 0.5, 0.04, 0.5, 0x35312d, 'mapStone');
  s.beam([fx - 0.24, fg + 0.9, fz], [fx, fg + 0.97, fz], 0.02, 0.02, 0x3b3835, 'mapStone');
  s.beam([fx + 0.24, fg + 0.9, fz], [fx, fg + 0.97, fz], 0.02, 0.02, 0x3b3835, 'mapStone');

  // Two logs to sit on, either side of the fire, their cut ends pale.
  for (const [sx, turn] of [
    [1, 0.12],
    [-1, -0.2],
  ]) {
    const x = fx + sx * 2.0;
    const a: P3 = [x - Math.sin(turn) * 0.9, s.ground(x, fz) + 0.2, fz - Math.cos(turn) * 0.9];
    const b: P3 = [x + Math.sin(turn) * 0.9, s.ground(x, fz) + 0.2, fz + Math.cos(turn) * 0.9];
    s.log(a, b, 0.42, tone(LOG_BARK, sx, 4, 4), 'mapBark');
    for (const e of [a, b]) {
      const d = e === a ? -1 : 1;
      s.box(e[0] + Math.sin(turn) * d * 0.01, e[1], e[2] + Math.cos(turn) * d * 0.01, 0.34, 0.34, 0.02, tone(CUT, sx, d, 5), 'wood', { ry: turn });
    }
  }

  // ── The lean-to at the back ──────────────────────────────────────────────
  const zf = -3.6;
  const zb = -6.1;
  const hf = 2.4;
  for (const sx of [1, -1]) {
    const x = sx * 1.7;
    const g = s.ground(x, zf);
    // A forked post: the stem, and the two prongs the ridge pole rests in.
    s.beam([x, g - 0.2, zf], [x, g + hf - 0.1, zf], 0.14, 0.14, tone(POST, sx, 6, 6), 'mapBark');
    s.beam([x, g + hf - 0.2, zf], [x + 0.12, g + hf + 0.15, zf + 0.05], 0.07, 0.07, tone(POST, sx, 7, 7), 'mapBark');
    s.beam([x, g + hf - 0.2, zf], [x - 0.12, g + hf + 0.15, zf - 0.04], 0.07, 0.07, tone(POST, sx, 8, 8), 'mapBark');
  }
  s.log([-2.3, hf, zf], [2.3, hf, zf], 0.14, tone(POST, 1, 9, 9), 'mapBark');
  // Rafters from the ridge pole down to the ground behind, thatch over them.
  for (let i = 0; i < 4; i++) {
    const x = -1.8 + i * 1.2;
    s.beam([x, hf + 0.05, zf + 0.2], [x, s.ground(x, zb) + 0.05, zb], 0.07, 0.07, tone(BAMBOO, i, 10, 10), 'wood');
  }
  const slope = Math.atan2(hf, zf - zb);
  const len = Math.hypot(hf, zf - zb);
  const rows = 5;
  for (let c = 0; c < rows; c++)
    for (let p = 0; p < 4; p++) {
      const u = (c + 0.5) / rows;
      const x = -1.85 + (p + 0.5) * 1.15;
      const y = hf * (1 - u) + 0.14 + 0.02 * c;
      const z = zf + 0.25 - (zf + 0.25 - zb) * u;
      s.box(x, y, z, 1.2, 0.18, (len / rows) * 1.3, tone(THATCH, c, p, 11), 'mapBark', { rx: -slope, shade: 0.85 + 0.12 * hash3(c, p, 1, seed) });
    }
  // (a fringe along the front edge)
  for (let x = -2.2; x <= 2.2; x += 0.25) {
    const l = 0.15 + 0.18 * r(x * 10, 12);
    s.box(x, hf + 0.17 - l / 2, zf + 0.3, 0.2, l, 0.07, tone(THATCH, x * 10, 13, 13), 'mapBark', { shade: 0.82 });
  }
  // A bamboo bed under it on four short legs, a rolled mat and a folded krama on it.
  const bedY = 0.5;
  for (const [x, z] of [
    [-1.2, -4.1],
    [1.2, -4.1],
    [-1.2, -5.1],
    [1.2, -5.1],
  ])
    s.box(x, (s.ground(x, z) + bedY) / 2, z, 0.1, bedY - s.ground(x, z), 0.1, tone(POST, x * 10, z * 10, 14), 'mapBark');
  for (let i = 0; i < 7; i++) s.box(0, bedY + 0.03, -4.0 - i * 0.18, 2.6, 0.06, 0.15, tone(BAMBOO, i, 15, 15), 'wood', { shade: 0.95 + 0.08 * r(i, 16) });
  s.log([-1.1, bedY + 0.16, -4.8], [-0.2, bedY + 0.16, -4.8], 0.24, 0x9c7a45, 'krama');
  s.box(0.8, bedY + 0.1, -4.5, 0.6, 0.08, 0.4, 0xb8322a, 'krama', { ry: 0.2 });
  s.box(0.8, bedY + 0.141, -4.5, 0.6, 0.01, 0.08, 0xf1ead8, 'krama', { ry: 0.2 });
  // A two-man saw hung on the right-hand post: the blade and a handle at each end.
  const sawX = -1.8;
  s.box(sawX - 0.09, 1.55, zf + 0.02, 0.02, 0.2, 1.3, 0x9aa0a6, 'mapStone', { rx: 0.1 });
  for (const d of [1, -1]) s.box(sawX - 0.09, 1.55 + d * 0.065, zf + 0.02 + d * 0.7, 0.05, 0.05, 0.28, tone(PLANK, d, 17, 17), 'wood', { rx: 1.4 });
  // A water gourd on a cord from the ridge pole.
  s.beam([0.9, hf - 0.05, zf + 0.05], [0.9, hf - 0.55, zf + 0.05], 0.02, 0.02, tone(ROPE, 2, 18, 18), 'wood');
  s.box(0.9, hf - 0.66, zf + 0.05, 0.16, 0.14, 0.16, 0xb58a4a, 'wood');
  s.box(0.9, hf - 0.84, zf + 0.05, 0.22, 0.22, 0.22, 0xb58a4a, 'wood');

  // ── The log stack between stakes ─────────────────────────────────────────
  const sx0 = 4.6;
  const sz0 = -1.6;
  const L = 3.2;
  const d = 0.46;
  let id = 0;
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 4 - row; i++) {
      const x = sx0 + (i - (3 - row) / 2) * (d + 0.02);
      const y = s.ground(sx0, sz0) + d / 2 + row * d * 0.86;
      const jitter = (r(id, 20) - 0.5) * 0.3;
      const a: P3 = [x, y, sz0 - L / 2 + jitter];
      const b: P3 = [x, y, sz0 + L / 2 + jitter];
      s.log(a, b, d * (0.9 + 0.15 * r(id, 21)), tone(LOG_BARK, id, 22, 22), 'mapBark');
      // (the sawn ends: pale rounds, darker rings)
      for (const e of [a, b]) {
        const dz = e === a ? -0.01 : 0.01;
        s.box(x, y, e[2] + dz, d * 0.72, d * 0.72, 0.02, tone(CUT, id, dz * 100, 23), 'wood');
        s.box(x, y, e[2] + dz * 2, d * 0.3, d * 0.3, 0.02, 0xb88e58, 'wood');
      }
      id++;
    }
  for (const sxs of [1, -1])
    for (const z of [sz0 - L / 2 + 0.3, sz0 + L / 2 - 0.3]) s.beam([sx0 + sxs * 1.1, s.ground(sx0, z) - 0.2, z], [sx0 + sxs * 1.05, s.ground(sx0, z) + 1.55, z], 0.1, 0.1, tone(POST, sxs, z * 10, 24), 'mapBark');

  // ── The ox cart's wheel, leaning on the stack's end ──────────────────────
  wheel(s, [sx0 + 0.2, 0, sz0 + L / 2 + 0.5], 0.72, 0.28);

  // ── Chopping block, the axe, chips and split wood ─────────────────────────
  const cx = -3.0;
  const cz = 0.3;
  const cg = s.ground(cx, cz);
  s.log([cx, cg - 0.1, cz], [cx, cg + 0.55, cz], 0.72, 0x5f4a38, 'mapBark');
  s.box(cx, cg + 0.555, cz, 0.6, 0.02, 0.6, tone(CUT, 1, 25, 25), 'wood', { ry: Math.PI / 8 });
  // The axe: its head sunk in the top, the handle up at an angle.
  const hx = cx + 0.08;
  s.box(hx, cg + 0.62, cz, 0.08, 0.16, 0.22, 0x7c8186, 'mapStone', { rx: 0.5 });
  s.box(hx, cg + 0.57, cz + 0.07, 0.03, 0.06, 0.2, 0xb9bdc1, 'mapStone', { rx: 0.5 });
  s.beam([hx, cg + 0.66, cz - 0.05], [hx, cg + 1.1, cz - 0.72], 0.05, 0.06, 0x8a6a44, 'wood');
  // Chips round the block.
  for (let i = 0; i < 16; i++) {
    const a = r(i, 26) * Math.PI * 2;
    const dd = 0.5 + r(i, 27) * 1.1;
    const x = cx + Math.sin(a) * dd;
    const z = cz + Math.cos(a) * dd;
    s.box(x, s.ground(x, z) + 0.015, z, 0.1 + 0.08 * r(i, 28), 0.03, 0.05 + 0.05 * r(i, 29), tone(CUT, i, 30, 30), 'wood', { ry: a * 3 });
  }
  // Split firewood heaped by it: quarter logs, pale split faces up.
  for (let i = 0; i < 12; i++) {
    const layer = i < 6 ? 0 : i < 10 ? 1 : 2;
    const k = i - (layer === 0 ? 0 : layer === 1 ? 6 : 10);
    const x = cx - 1.3 + (k - (layer === 0 ? 2.5 : layer === 1 ? 1.5 : 0.5)) * 0.2;
    const z = cz + 1.3;
    const y = s.ground(x, z) + 0.08 + layer * 0.15;
    const turn = (r(i, 31) - 0.5) * 0.3;
    s.box(x, y, z, 0.16, 0.14, 0.62, i % 3 === 0 ? tone(LOG_BARK, i, 32, 32) : tone(CUT, i, 33, 33), 'wood', { ry: turn, rz: Math.PI / 4 });
  }

  // ── Stumps of trees they felled, a few stones ─────────────────────────────
  for (const [x, z, w] of [
    [-5.4, -3.2, 0.8],
    [3.6, 4.2, 0.62],
    [-4.8, 4.6, 0.7],
    [6.4, -5.2, 0.9],
  ] as const) {
    const g = s.ground(x, z);
    s.log([x, g - 0.1, z], [x, g + 0.45, z], w, 0x5a4636, 'mapBark');
    s.box(x, g + 0.455, z, w * 0.82, 0.02, w * 0.82, 0xc49a62, 'wood', { ry: Math.PI / 8 });
    // (a root or two into the ground)
    for (let i = 0; i < 2; i++) {
      const a = r(x * 10, i + 34) * Math.PI * 2;
      s.beam([x, g + 0.25, z], [x + Math.sin(a) * w * 0.9, g - 0.05, z + Math.cos(a) * w * 0.9], 0.18, 0.14, 0x5a4636, 'mapBark');
    }
  }
  banana(s, -6.4, -5.0, 3.0, 4);
  stone(s, -6.2, 0.8, 0.8, 11, 0.7);
  stone(s, 6.8, 2.4, 0.7, 12, 0.5);
  stone(s, 2.2, -7.0, 1.0, 13, 0.8);
  // (a bucket by the fire)
  s.box(1.3, s.ground(1.3, 2.7) + 0.2, 2.7, 0.34, 0.4, 0.34, tone(PLANK, 2, 36, 36), 'wood');
  s.box(1.3, s.ground(1.3, 2.7) + 0.2, 2.7, 0.36, 0.05, 0.36, 0x4a4540, 'mapStone');
}

/**
 * A cart wheel (Khmer ox carts have tall spoked wheels), `r` its radius,
 * standing at `at` (its foot) and leaning back by `lean` rad (toward −z).
 */
function wheel(s: Site, at: P3, r: number, lean: number): void {
  const g = s.ground(at[0], at[2]);
  const c = [at[0], g + r * Math.cos(lean), at[2] - r * Math.sin(lean)] as const;
  // The wheel's plane: across (x) and up the lean.
  const up = [0, Math.cos(lean), -Math.sin(lean)] as const;
  const pt = (a: number, rr: number): P3 => [c[0] + Math.cos(a) * rr, c[1] + up[1] * Math.sin(a) * rr, c[2] + up[2] * Math.sin(a) * rr];
  const WOOD = [0x7a6650, 0x6e5c48, 0x857058];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    s.beam(pt(a0, r - 0.06), pt(a1, r - 0.06), 0.12, 0.12, pickTone(WOOD, i, 1, 2, s.seed), 'wood');
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.beam(pt(a, 0.12), pt(a, r - 0.1), 0.06, 0.06, pickTone(WOOD, i, 3, 4, s.seed), 'wood');
  }
  // The hub, through the wheel.
  const n2 = [0, Math.sin(lean) * 0.2, Math.cos(lean) * 0.2] as const;
  s.log([c[0] - n2[0], c[1] - n2[1], c[2] - n2[2]], [c[0] + n2[0], c[1] + n2[1], c[2] + n2[2]], 0.24, 0x5e4c3a, 'wood');
}
