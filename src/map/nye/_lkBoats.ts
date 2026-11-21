import { hash3 } from '../../voxel/random';
import { ANIM, perPeriod, SHOW, type BoxOpts, type Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { VILLAGE } from '../layout';
import { onTemple } from '../roam/_flag';
import { LAKE_STAGE, LAKE_VIEW } from './plan';
import { LAKE_BARGES } from './show';
import type { WaterLights } from './_lkReflect';
import type { LakeFrame } from './_lkKit';

/**
 * The event night's lantern flotilla on the great lake (AWP-35, lake.ts; the owner's picture
 * assets/new-year-online/lake-reference.png: many small boats glowing warm on a deep blue lake, each light reflected).
 * Khmer lights on the water — never sky lanterns (khom loi are Thai):
 *
 * - **lantern boats**: small Tonle Sap skiffs (long and narrow, bow and stern raised, a painted strake), a Khmer lantern
 *   (a glowing body under a little dark Angkor tower top) on a bamboo pole at the bow, some under a curved bamboo
 *   canopy (dok), some with candles along their gunwales;
 * - **lotus floats** (បណ្តែតប្រទីប as big as a boat: a banana-trunk raft, two rings of petals, candles among them);
 * - **two illuminated floats** of the Water Festival (ពិធីបណ្តែតប្រទីប): a raft carrying Angkor Wat's three towers
 *   drawn in gold lights, either side of the stage, facing the shore.
 *
 * Where: thick round the stage and thinning out to ≈ 150 m, and in two loose processions leading from beside the stage
 * out toward where the fireworks rise (from the terrace the eye follows them to the horizon); only on open water, off
 * the stage, the jetty and the shallows before the ghat, the fireworks' barges (show.ts `LAKE_BARGES`), the families'
 * boats' way in from the floating village and their moorings (people/_nyeLakePlan.ts), and the village itself.
 *
 * All boxes in the event night's kit (one instanced draw with the night's candles, drawn only that night), each boat's
 * boxes drifting together (the kit's `ANIM.drift`: a slow wander round its spot, a gentle bob), its halo and its
 * reflection riding along in the water lights (`_lkReflect.ts` `WaterLights`, event night only). Low: fewer and plainer.
 */

export interface Flotilla {
  boats: number;
  lotus: number;
  floats: number;
}

type Drift = { a: [number, number, number]; b: [number, number, number, number] };

/** Hull timber (sRGB), painted strakes, the canopy's bamboo and thatch, lantern glass. */
const HULL = [0x4a3424, 0x553c2a, 0x3e2c20, 0x5e4430] as const;
const STRAKE = [0x2f6f8a, 0x8a2a22, 0x3d7a4a, 0x2c4f8f, 0xb08a2a] as const;
const DOK = [0xa08a58, 0x8f7a4c, 0xb39a64] as const;
const GLASS = [0xffb860, 0xffc878, 0xffa850, 0xffd090, 0xff9c50] as const;
/** The deck's planks and the gunwales' tops, warm where the lantern lights them (sRGB). */
const DECK = 0x8a5e36;
const BAMBOO_POLE = 0xc8b27a;
const PETAL = [0xf29ab8, 0xee86aa, 0xf6f0e4, 0xf4b8cc] as const;
const BULB = 0xffdc96;

const pickOf = <T>(list: readonly T[], r: number): T => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** A box riding its boat's drift. */
const on = (d: Drift, o: BoxOpts = {}): BoxOpts => ({ show: SHOW.night, anim: ANIM.drift, a: d.a, b: d.b, ...o });

/** A slow wander of `r` m round its spot (one turn in ≈ `period` s) and the kit's bob. */
function wander(seed: number, r: number, period: number): Drift {
  return { a: [0, hash3(seed, 1, 5, 431), r], b: [0, 0, perPeriod((Math.PI * 2) / period), 0] };
}

/**
 * A lantern skiff at (x, wy, z), its bow toward `yaw`: `canopy` a curved bamboo roof amidships, `candles` small lights
 * along its gunwales. In the kit and the water lights (halo, streak), riding `d`.
 */
export function lanternSkiff(kit: Kit, lights: WaterLights, x: number, wy: number, z: number, yaw: number, seed: number, d: Drift, low: boolean, canopy: boolean, candles: boolean): void {
  const r = (i: number) => hash3(seed, i, 7, 432);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  const L = 4.2 + 1.1 * r(1);
  const hull = pickOf(HULL, r(2));
  const strake = pickOf(STRAKE, r(3));
  const at = (s: number, side = 0): [number, number] => [x + fx * s + ax * side, z + fz * s + az * side];
  const seg = low ? 2 : 4;
  for (let i = 0; i < seg; i++) {
    const s = -L / 2 + ((i + 0.5) * L) / seg;
    const k = 1 - Math.pow(Math.abs(s) / (L / 2), 2.2);
    const w = 0.34 + 0.66 * k;
    const len = L / seg + 0.03;
    const [cx, cz] = at(s);
    // (the lantern at the bow lights its boat: the deck and the gunwales' tops warm, most near it; the hull's sides dark)
    const lit = 0.16 + 0.3 * (i / Math.max(1, seg - 1));
    kit.box(cx, wy + 0.05, cz, w * 0.84, 0.12, len, hull, on(d, { yaw }));
    kit.box(cx, wy + 0.125, cz, w * 0.7, 0.03, len, DECK, on(d, { yaw, glow: lit }));
    for (const side of [-1, 1]) {
      const [px, pz] = at(s, side * w * 0.46);
      kit.box(px, wy + 0.22, pz, 0.07, 0.34, len, hull, on(d, { yaw }));
      kit.box(px - ax * side * 0.01, wy + 0.4, pz - az * side * 0.01, 0.09, 0.05, len, low ? DECK : strake, on(d, { yaw, glow: lit * 0.8 }));
    }
  }
  // (the raised bow and stern)
  for (const end of [-1, 1]) {
    const [cx, cz] = at(end * (L / 2 + 0.1));
    kit.box(cx, wy + 0.4, cz, 0.16, 0.46, 0.3, hull, on(d, { yaw, pitch: -end * 0.4 }));
  }
  // The canopy: a curved roof of split bamboo and thatch over the middle.
  if (canopy && !low) {
    const [cx, cz] = at(-0.35);
    const c = pickOf(DOK, r(4));
    for (const side of [-1, 1]) {
      kit.box(cx + ax * side * 0.36, wy + 0.86, cz + az * side * 0.36, 0.06, 0.62, 1.5, c, on(d, { yaw, roll: side * 0.42 }));
    }
    kit.box(cx, wy + 1.14, cz, 0.5, 0.06, 1.5, c, on(d, { yaw }));
  }
  // Thwarts across, lit too.
  for (const t of [-0.9, 0.5]) {
    const [cx, cz] = at(t * (L / 4.6));
    kit.box(cx, wy + 0.34, cz, 0.86, 0.05, 0.2, DECK, on(d, { yaw, glow: t > 0 ? 0.38 : 0.22 }));
  }
  // The bow's lantern: a stout bamboo pole standing in the bow, a short arm, a Khmer lantern under a small dark tower top
  // hanging just over the boat (it lights the boat and reads as the boat's lantern from above, never floating free).
  const [px, pz] = at(L / 2 - 0.5);
  const poleH = (low ? 1.95 : 1.75) + 0.4 * r(5);
  kit.box(px, wy + poleH / 2 + 0.1, pz, 0.09, poleH, 0.09, BAMBOO_POLE, on(d, { glow: 0.12 }));
  kit.box(px, wy + poleH + 0.06, pz, 0.12, 0.08, 0.12, 0x6a4a2a, on(d));
  const [lx, lz] = [px - fx * 0.36, pz - fz * 0.36];
  kit.box(px - fx * 0.18, wy + poleH - 0.02, pz - fz * 0.18, 0.06, 0.06, 0.42, BAMBOO_POLE, on(d, { yaw, glow: 0.12 }));
  const ly = wy + poleH - 0.44;
  const glass = pickOf(GLASS, r(6));
  kit.box(lx, ly + 0.27, lz, 0.02, 0.12, 0.02, 0x2e2018, on(d));
  kit.box(lx, ly, lz, 0.44, 0.56, 0.44, glass, on(d, { yaw, glow: 1.5 }));
  kit.box(lx, ly + 0.31, lz, 0.54, 0.07, 0.54, 0x2e2018, on(d, { yaw }));
  if (!low) kit.box(lx, ly + 0.42, lz, 0.28, 0.15, 0.28, 0x3a2a1e, on(d, { yaw }));
  if (!low) kit.box(lx, ly + 0.54, lz, 0.1, 0.1, 0.1, 0xe0b040, on(d, { yaw, glow: 0.6 }));
  kit.box(lx, ly - 0.31, lz, 0.48, 0.06, 0.48, 0x2e2018, on(d, { yaw }));
  lights.halo(lx, ly, lz, 0xffb050, 1.9, { drift: d, level: 0.45, event: true });
  // (its light on and round the boat, low: the boat sits in a warm pool)
  const [mx, mz] = at(L * 0.12);
  lights.halo(mx, wy + 0.45, mz, 0xffa048, L * 0.62, { drift: d, level: 0.16, event: true });
  lights.streak(lx, wy, lz, ly - wy, undefined, { drift: d, level: 1.8, width: 0.8, event: true });
  // Candles along the gunwales.
  if (candles && !low) {
    for (const [s, side] of [
      [-0.9, -1],
      [0.2, 1],
      [-1.6, 1],
    ] as const) {
      const [cx, cz] = at(s, side * 0.42);
      kit.box(cx, wy + 0.46, cz, 0.05, 0.12, 0.05, 0xf4ecd8, on(d));
      kit.box(cx, wy + 0.56, cz, 0.06, 0.08, 0.06, 0xffc070, on(d, { glow: 2.4 }));
    }
    const [cx, cz] = at(-0.6);
    lights.streak(cx, wy, cz, 0.6, undefined, { drift: d, level: 1.1, width: 0.7, event: true });
  }
}

/**
 * A lotus candle float (បណ្តែតប្រទីប) at (x, wy, z), `size` m across: a banana-trunk raft, an outer ring of petals leaning
 * out and an inner ring more upright, a gold heart, candles among the petals; a halo and its streak. Riding `d`.
 */
export function lotusFloat(kit: Kit, lights: WaterLights, x: number, wy: number, z: number, size: number, seed: number, d: Drift, low: boolean): void {
  const r = (i: number) => hash3(seed, i, 9, 433);
  const s = size;
  const turn = r(1) * Math.PI;
  // The raft: banana trunk pieces, crossed.
  for (let i = 0; i < (low ? 2 : 3); i++) kit.box(x, wy + 0.06, z, s * 0.86, 0.12, s * 0.34, 0x5f9a3a, on(d, { yaw: turn + (i * Math.PI) / (low ? 2 : 3) }));
  const petal = (n: number, rr: number, lean: number, w: number, h: number, y0: number, ph: number) => {
    for (let i = 0; i < n; i++) {
      const a = turn + ph + (i / n) * Math.PI * 2;
      const c = pickOf(PETAL, r(10 + i + n));
      const ox = Math.sin(a) * (rr + 0.5 * h * Math.sin(lean));
      const oz = Math.cos(a) * (rr + 0.5 * h * Math.sin(lean));
      kit.box(x + ox, wy + y0 + 0.5 * h * Math.cos(lean), z + oz, w, h, 0.05, c, on(d, { yaw: a, pitch: lean, glow: 0.35 }));
    }
  };
  petal(low ? 6 : 8, s * 0.3, 0.95, s * 0.24, s * 0.3, 0.1, 0);
  if (!low) petal(6, s * 0.16, 0.45, s * 0.18, s * 0.28, 0.12, 0.4);
  kit.box(x, wy + 0.2, z, s * 0.16, 0.1, s * 0.16, 0xf0c040, on(d, { glow: 0.8 }));
  // Candles: one in the heart, more round it.
  const n = low ? 2 : 4;
  for (let i = 0; i <= n; i++) {
    const a = turn + (i / n) * Math.PI * 2 + 0.3;
    const rr = i === n ? 0 : s * 0.22;
    const cx = x + Math.sin(a) * rr;
    const cz = z + Math.cos(a) * rr;
    const h = i === n ? 0.26 : 0.16;
    kit.box(cx, wy + 0.2 + h / 2, cz, 0.05, h, 0.05, 0xf4ecd8, on(d));
    kit.box(cx, wy + 0.24 + h, cz, 0.06, 0.09, 0.06, 0xffc070, on(d, { glow: 1.7 }));
  }
  lights.halo(x, wy + 0.45, z, 0xffa850, 1.2 + 0.7 * s, { drift: d, level: 0.45, event: true });
  lights.streak(x, wy, z, 0.5, undefined, { drift: d, level: 1.6, width: 0.35 + 0.3 * s, event: true });
}

/**
 * An illuminated float of the Water Festival: a bamboo raft with a red skirt and, on a dark upright board facing `yaw`,
 * Angkor Wat (the flag's drawing, three towers: roam/_flag.ts `onTemple`) traced in gold bulbs, a row of bulbs along
 * the raft's edge; halos and broad streaks on the water. Riding `d`. Returns its boxes.
 */
export function angkorFloat(kit: Kit, lights: WaterLights, x: number, wy: number, z: number, yaw: number, d: Drift, low: boolean): number {
  const n0 = kit.count;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  const W = 7.4;
  const D = 3.2;
  const at = (u: number, v: number): [number, number] => [x + ax * u + fx * v, z + az * u + fz * v];
  // The raft: two bundles of bamboo, a deck, a red lacquer skirt with a gilt line.
  for (const v of [-D / 2 + 0.4, D / 2 - 0.4]) {
    const [cx, cz] = at(0, v);
    kit.box(cx, wy + 0.04, cz, W, 0.4, 0.62, 0x8f8250, on(d, { yaw }));
  }
  {
    const [cx, cz] = at(0, 0);
    kit.box(cx, wy + 0.32, cz, W + 0.1, 0.12, D, 0x4a3426, on(d, { yaw }));
    const [sx, sz] = at(0, D / 2 + 0.03);
    kit.box(sx, wy + 0.3, sz, W + 0.16, 0.2, 0.06, 0x8a2219, on(d, { yaw }));
    kit.box(sx + fx * 0.02, wy + 0.42, sz + fz * 0.02, W + 0.16, 0.04, 0.06, 0xe6b44a, on(d, { yaw, glow: 0.5 }));
  }
  // The board the picture is lit on (dark, so the lights read), on two posts.
  const PW = 6.2;
  const PH = PW * (0.4 * (16 / 25)) / 0.42;
  const y0 = wy + 0.6;
  {
    const [cx, cz] = at(0, -0.4);
    kit.box(cx, y0 + PH / 2 + 0.1, cz, PW + 0.5, PH + 0.5, 0.08, 0x14182a, on(d, { yaw }));
    for (const u of [-(PW / 2 + 0.2), PW / 2 + 0.2]) {
      const [px, pz] = at(u, -0.5);
      kit.box(px, y0 + (PH + 0.6) / 2, pz, 0.14, PH + 0.9, 0.14, 0x3a2a1e, on(d, { yaw }));
    }
  }
  // Angkor Wat in bulbs: the outline of the flag's temple (u 0.29‥0.71, v 0.29‥0.69 of the flag), one bulb a cell.
  const U0 = 0.29;
  const U1 = 0.71;
  const V0 = 0.285;
  const V1 = 0.685;
  const step = low ? 0.34 : 0.19;
  const nu = Math.round(PW / step);
  const nv = Math.round(PH / step);
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nu && j < nv && onTemple(U0 + ((i + 0.5) / nu) * (U1 - U0), V0 + ((j + 0.5) / nv) * (V1 - V0));
  let bulbs = 0;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      if (!inside(i, j)) continue;
      const edge = !inside(i - 1, j) || !inside(i + 1, j) || !inside(i, j - 1) || !inside(i, j + 1);
      // (the outline, and every other row of the galleries' and base's courses)
      if (!edge && j % 3 !== 0) continue;
      const u = -PW / 2 + (i + 0.5) * step;
      const y = y0 + 0.1 + PH - (j + 0.5) * step;
      const [bx, bz] = at(u, -0.33);
      kit.box(bx, y, bz, 0.09, 0.09, 0.05, BULB, on(d, { yaw, glow: edge ? 2.2 : 1.6 }));
      if (edge && bulbs++ % 9 === 0) lights.halo(bx + fx * 0.1, y, bz + fz * 0.1, 0xffc070, 1.5, { drift: d, level: 0.35, event: true });
    }
  // Bulbs along the raft's front edge; the picture's light on the water.
  for (let u = -W / 2 + 0.3; u <= W / 2 - 0.25; u += low ? 0.9 : 0.45) {
    const [bx, bz] = at(u, D / 2 + 0.07);
    kit.box(bx, wy + 0.47, bz, 0.08, 0.08, 0.05, BULB, on(d, { yaw, glow: 2.6 }));
  }
  for (const u of low ? [-1.6, 1.6] : [-2.4, -0.8, 0.8, 2.4]) {
    const [rx, rz] = at(u, D / 2 + 0.3);
    lights.streak(rx, wy, rz, 2.6, 0xffc060, { drift: d, level: 1.1, width: 1.3, event: true });
  }
  lights.halo(...xyz(at(0, -0.1), y0 + PH * 0.55), 0xffb050, PW * 1.1, { drift: d, level: 0.22, event: true });
  return kit.count - n0;
}

const xyz = ([x, z]: [number, number], y: number): [number, number, number] => [x, y, z];

/**
 * Launch the flotilla into the event night's kit and water lights (lake.ts). `open` tells open water round a point (the stage,
 * the jetty and its lane left out: `_lkWater.ts`).
 */
export function launchFlotilla(field: HeightField, fr: LakeFrame, kit: Kit, lights: WaterLights, open: (x: number, z: number, margin: number) => boolean, low: boolean): Flotilla {
  const hd = LAKE_STAGE.d / 2;
  const taken: [number, number, number][] = [];
  /** The families' boats' way in from the floating village and their moorings (stage frame: _nyeLakePlan.ts `FROM`, `MOOR`). */
  const LANE: readonly [number, number][] = [
    [-72, -46],
    [-48, -16],
    [-36, -5],
    [-22, 1],
  ];
  const segDist = (u: number, v: number, a: readonly [number, number], b: readonly [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((u - a[0]) * dx + (v - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(u - a[0] - dx * t, v - a[1] - dy * t);
  };
  const free = (x: number, z: number, room: number): boolean => {
    if (!open(x, z, room)) return false;
    const [u, v] = fr.local(x, z);
    // (not in the shallows before the ghat and the jetty, where the candles go out from the steps)
    if (v > hd - 1 && Math.abs(u) < 26) return false;
    // (off the stage itself)
    if (Math.abs(u) < LAKE_STAGE.w / 2 + 4 && Math.abs(v) < hd + 4) return false;
    for (let i = 0; i + 1 < LANE.length; i++) if (segDist(u, v, LANE[i], LANE[i + 1]) < 8) return false;
    if (u < -12 && u > -34 && v > -6 && v < 8) return false;
    for (const b of LAKE_BARGES) if ((b.x - x) ** 2 + (b.z - z) ** 2 < 11 * 11) return false;
    // (the floating village: its floating houses and the stilt houses' shore)
    if (Math.hypot(x - VILLAGE.water.x, z - VILLAGE.water.z) < VILLAGE.water.r + 30) return false;
    for (const [sx, sz] of VILLAGE.shore) if (Math.hypot(x - sx, z - sz) < 26) return false;
    for (const [tx, tz, tr] of taken) if (Math.hypot(x - tx, z - tz) < tr + room) return false;
    return true;
  };
  const wyAt = (x: number, z: number) => field.waterAt(x, z) ?? fr.water;
  /** Bow toward the stage, give or take. */
  const towardStage = (x: number, z: number, seed: number) => Math.atan2(fr.x - x, fr.z - z) + (hash3(seed, 2, 3, 434) - 0.5) * 1.4;
  let boats = 0;
  let lotus = 0;
  let floats = 0;
  let seed = 0;

  // ── The two illuminated floats, either side of the stage, facing the shore ──
  for (const [u, v] of low ? ([[27, -14]] as const) : ([[-27, -18], [27, -14]] as const)) {
    for (let k = 0; k < 8; k++) {
      const [x, z] = fr.at(u + Math.sign(u) * k * 2, v - k * 2);
      if (!free(x, z, 5)) continue;
      const yaw = Math.atan2(fr.x + fr.f[0] * 60 - x, fr.z + fr.f[1] * 60 - z);
      angkorFloat(kit, lights, x, wyAt(x, z), z, yaw, wander(900 + floats, 0.8, 520), low);
      taken.push([x, z, 5.5]);
      floats++;
      break;
    }
  }

  // ── Two processions, from beside the stage out toward the fireworks (stage frame: u across, v toward the shore) ──
  const lines: (readonly [number, number])[][] = [
    [
      [17, -2],
      [24, -30],
      [31, -64],
      [36, -100],
      [40, -140],
    ],
    [
      [-17, -10],
      [-21, -36],
      [-20, -70],
      [-14, -108],
      [-6, -146],
    ],
  ];
  const along = low ? 15 : 8.5;
  for (const [li, line] of lines.entries()) {
    let carry = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const [u0, v0] = line[i];
      const [u1, v1] = line[i + 1];
      const len = Math.hypot(u1 - u0, v1 - v0);
      for (let t = carry; t < len; t += along) {
        seed++;
        const j = (hash3(seed, li, 1, 435) - 0.5) * 6;
        const du = (u1 - u0) / len;
        const dv = (v1 - v0) / len;
        const u = u0 + du * t - dv * j;
        const v = v0 + dv * t + du * j;
        const [x, z] = fr.at(u, v);
        if (!free(x, z, 3)) continue;
        const yaw = Math.atan2(-(fr.a[0] * du + fr.f[0] * dv), -(fr.a[1] * du + fr.f[1] * dv)) + (hash3(seed, 3, 1, 435) - 0.5) * 0.5;
        const r = hash3(seed, 4, 1, 435);
        lanternSkiff(kit, lights, x, wyAt(x, z), z, yaw, 1000 + seed, wander(1000 + seed, 0.6 + 0.8 * r, 360 + 240 * r), low, r < 0.35, r > 0.7);
        taken.push([x, z, 3]);
        boats++;
      }
      carry = (carry + len) % along;
    }
  }

  // ── In the gaps the plaza's crowd sees the water through (LAKE_VIEW: either side of the stage, between it and the
  // plaza's salas and blossom trees; and farther right for the side views; screen angles from the view's middle, ° right),
  // 62‥180 m out from the crowd, broadside to it so each reads as a boat with its lantern ──
  {
    const [cx, , cz] = LAKE_VIEW.cam;
    const len = Math.hypot(LAKE_VIEW.at[0] - cx, LAKE_VIEW.at[2] - cz);
    const dx = (LAKE_VIEW.at[0] - cx) / len;
    const dz = (LAKE_VIEW.at[2] - cz) / len;
    const rx = -dz;
    const rz = dx;
    const bands: [number, number, number][] = low
      ? [
          [-18, -9, 4],
          [5, 13, 4],
          [21, 28, 2],
        ]
      : [
          [-18, -9, 10],
          [5, 13, 10],
          [21, 28, 4],
        ];
    for (const [b0, b1, want] of bands)
      for (let i = 0, made = 0; i < want * 14 && made < want; i++) {
        seed++;
        const th = ((b0 + (b1 - b0) * hash3(seed, 1, 6, 438)) * Math.PI) / 180;
        const dist = 62 + 118 * Math.pow(hash3(seed, 2, 6, 438), 1.4);
        const x = cx + dist * (Math.cos(th) * dx + Math.sin(th) * rx);
        const z = cz + dist * (Math.cos(th) * dz + Math.sin(th) * rz);
        if (!free(x, z, 3.4)) continue;
        const r = hash3(seed, 3, 6, 438);
        const yaw = Math.atan2(rx, rz) + (r < 0.5 ? 0 : Math.PI) + (hash3(seed, 4, 6, 438) - 0.5) * 0.7;
        lanternSkiff(kit, lights, x, wyAt(x, z), z, yaw, 4000 + seed, wander(4000 + seed, 0.6 + 1.0 * r, 320 + 260 * r), low, r < 0.3, r > 0.72);
        taken.push([x, z, 3.4]);
        boats++;
        made++;
      }
  }

  // ── The rest round the stage: thick near it, thinning out to ≈ 150 m ──
  const want = low ? 10 : 40;
  for (let i = 0, made = 0; i < want * 12 && made < want; i++) {
    seed++;
    const a = hash3(seed, 1, 2, 436) * Math.PI * 2;
    const rr = 22 * Math.pow(150 / 22, hash3(seed, 2, 2, 436));
    const x = fr.x + Math.cos(a) * rr;
    const z = fr.z + Math.sin(a) * rr;
    if (!free(x, z, 3.2)) continue;
    const r = hash3(seed, 3, 2, 436);
    lanternSkiff(kit, lights, x, wyAt(x, z), z, towardStage(x, z, seed), 2000 + seed, wander(2000 + seed, 0.8 + 1.4 * r, 300 + 300 * r), low, r < 0.3, r > 0.75);
    taken.push([x, z, 3.2]);
    boats++;
    made++;
  }

  // ── Lotus floats among the candles, nearer the stage ──
  const lotusWant = low ? 5 : 10;
  for (let i = 0, made = 0; i < lotusWant * 14 && made < lotusWant; i++) {
    seed++;
    const a = hash3(seed, 1, 4, 437) * Math.PI * 2;
    const rr = 12 + 34 * Math.sqrt(hash3(seed, 2, 4, 437));
    const x = fr.x + Math.cos(a) * rr;
    const z = fr.z + Math.sin(a) * rr;
    if (!free(x, z, 1.6)) continue;
    const s = 1.1 + 0.7 * hash3(seed, 3, 4, 437);
    lotusFloat(kit, lights, x, wyAt(x, z), z, s, 3000 + seed, wander(3000 + seed, 0.5 + 1.2 * hash3(seed, 4, 4, 437), 240 + 200 * hash3(seed, 5, 4, 437)), low);
    taken.push([x, z, 1.4]);
    lotus++;
    made++;
  }
  return { boats, lotus, floats };
}
