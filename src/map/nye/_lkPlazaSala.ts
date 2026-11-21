import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { Kit } from '../festival/_kit';
import type { HeightField } from '../heightfield';
import { BAMBOO, PLANK, POST, Site } from '../jungle/_campKit';
import { registerShop, type ShopItem } from '../shop';
import { LAKE_SALA_FLOOR, LAKE_SALAS, LAKE_STALL_COUNTER, LAKE_STALLS, lakePlazaPolar } from './plan';
import { LATERITE, pick, POST_STONE } from './_sqKit';
import { BULB, GOLD, LANTERN, towerLantern, type Bodies } from './_lkKit';
import type { PlazaPools } from './_lkPlazaLight';

/**
 * The lake plaza's two salas and its food stalls (AWP-35, the owner's lake reference; where: plan.ts `LAKE_SALAS`,
 * `LAKE_STALLS`).
 *
 * - **The salas** (សាលា) stand in the ring wall's line either side of the landing, facing the plaza's middle: open
 *   wooden pavilions on a laterite and sandstone plinth with steps down to the floor, red-brown lacquered posts on stone
 *   bases, and the Khmer two-tiered roof of terracotta tiles — a hipped skirt, over it a gable roof whose gable end faces
 *   the plaza (a lacquer board in each stepped triangle, gilt along its edges, a gilt lotus at its peak), a plain ridge
 *   with a small Angkor tower in its middle. Never Thai: no gable horns, no flame finials. Inside, families' low
 *   tables with fruit and sweets on them, mats; lit warm: three tower lanterns hanging from the tie beams and four under
 *   the eaves' corners, bulbs along all four eaves (`eaves`: the plaza's string lights tie on at the front corners), the
 *   gables' gilt edges glowing, a pool of light on its floor and before its steps.
 * - **The food stalls** inside the wall, their backs to it: a timber stand under a red-and-white striped canopy (two
 *   slopes to a ridge, a scalloped valance: cloth in the festival kit, lit through a little at night), a counter with a
 *   red cloth and a gilt hem, the goods on it, lamps hanging at the front and over the goods, a pool of light before it. Each registers a shop (shop.ts: E Buy while roaming; ids `nye-lake-*`): grilled fish and
 *   prawns from the lake, fruit, drinks, sweets.
 *
 * Families: stone (plinths, tiles, jars), bark (timber: solid to walk on), petal (cloth, food: soft). In the shore's
 * builder: no draw of its own. Their ground is occupied (trees keep off).
 */

export interface SalasIn {
  field: HeightField;
  b: VoxelBuilder;
  kit: Kit;
  bodies: Bodies;
  glow: Glow;
  low: boolean;
  src: SourceTrace | undefined;
  /** The plaza's pools of light on the ground (their floors lit warm). */
  pools?: PlazaPools | null;
}

type V3 = { x: number; y: number; z: number };

export interface Salas {
  blocks: number;
  /** Per sala: the front eave's corners (map m), `near` the one toward the landing. */
  eaves: { near: V3; far: V3 }[];
}

const TILE = [0xa8492e, 0x9e4229, 0xb25234, 0x963d26];
const TILE_DARK = [0x7e3220, 0x76301e, 0x873724];
const LACQ = [0x6e2e22, 0x652a1f, 0x763325];
const WOOD = [0x8a5a3a, 0x7f5235, 0x93613f];
const LAMP_HALO = 0xffb45a;

export function buildLakeSalas(o: SalasIn): Salas {
  const n0 = o.b.boxes.length;
  const eaves: Salas['eaves'] = [];
  for (const [i, s] of LAKE_SALAS.entries()) eaves.push(sala(o, s, i));
  for (const [i, p] of LAKE_STALLS.entries()) stall(o, p, i);
  return { blocks: o.b.boxes.length - n0, eaves };
}

// ── The salas ────────────────────────────────────────────────────────────────

function sala(o: SalasIn, p: (typeof LAKE_SALAS)[number], i: number): { near: V3; far: V3 } {
  const { field, b, bodies, glow, low, src } = o;
  const { w, d } = p;
  // (its floor on the lowest of its corners: the plinth hides the rest)
  const site0 = new Site(b, field, p.x, 0, p.z, p.facing, src, 640 + i);
  const g = Math.min(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => site0.ground((sx * w) / 2, (sz * d) / 2))));
  const S = new Site(b, field, p.x, g, p.z, p.facing, src, 640 + i);
  const r = (k: number, j = 0) => hash3(i, k, j, 641);
  const lat = (k: number) => pick(LATERITE, i, k, 1, 642);
  const st = (k: number) => pick(POST_STONE, i, k, 2, 642);
  const tile = (k: number) => pick(TILE, i, k, 3, 642);
  // ── The plinth (sunk into the land), a sandstone top with a lip; steps down the front (+z) to the plaza's floor ──
  const ph = LAKE_SALA_FLOOR;
  S.box(0, 0.1, 0, w, 0.8, d, lat(0), 'mapStone', { shade: 0.95 });
  S.box(0, ph - 0.11, 0, w + 0.16, 0.22, d + 0.16, st(1), 'mapStone', { shade: 1.04 });
  for (let k = 0; k < 3; k++) {
    const z = d / 2 + 0.2 + k * 0.36;
    const top = ph - 0.22 * (k + 1);
    S.box(0, (top - 0.3) / 2, z, 2.8, top + 0.3, 0.38, k % 2 ? lat(k + 3) : st(k + 3), 'mapStone', { shade: 1 - 0.03 * k });
  }
  for (const sd of [-1, 1]) S.box(sd * 1.6, ph / 2 - 0.05, d / 2 + 0.55, 0.36, ph + 0.1, 1.15, st(7 + sd), 'mapStone');
  // ── Posts on stone bases, beams ──
  const px = w / 2 - 0.45;
  const zs = [-d / 2 + 0.5, -d / 6 + 0.1, d / 6 - 0.1, d / 2 - 0.5];
  const postH = 2.75;
  for (const sd of [-1, 1])
    for (const [k, z] of zs.entries()) {
      S.box(sd * px, ph + 0.12, z, 0.38, 0.24, 0.38, st(10 + k), 'mapStone');
      S.box(sd * px, ph + 0.24 + postH / 2, z, 0.24, postH, 0.24, pick(LACQ, sd, k, 4, 642), 'mapBark');
      S.box(sd * px, ph + postH - 0.2, z, 0.28, 0.1, 0.28, pick(GOLD, sd, k, 5, 642), 'mapStone', { shade: 0.95 });
    }
  const by = ph + 0.24 + postH;
  for (const sd of [-1, 1]) S.box(sd * px, by + 0.12, 0, 0.28, 0.24, d - 0.6, pick(LACQ, sd, 0, 6, 642), 'mapBark');
  for (const z of zs) S.box(0, by + 0.32, z, w - 0.6, 0.18, 0.22, pick(LACQ, z, 1, 7, 642), 'mapBark', { shade: 0.95 });
  // ── Inside: low tables with fruit and sweets, mats, a bench along the back ──
  for (const [k, z] of [-d / 6 - 0.5, d / 6 + 0.3].entries()) {
    S.box(0, ph + 0.01, z, 3.2, 0.02, 1.9, k ? 0xc89a4e : 0xb84a3a, 'petal');
    S.box(0, ph + 0.34, z, 1.6, 0.07, 0.8, pick(WOOD, k, 8, 642), 'mapBark', { shade: 1.04 });
    for (const [dx, dz] of [
      [-0.65, -0.3],
      [0.65, -0.3],
      [-0.65, 0.3],
      [0.65, 0.3],
    ])
      S.box(dx, ph + 0.16, z + dz, 0.08, 0.3, 0.08, pick(WOOD, dx, dz, 9, 642), 'mapBark', { shade: 0.85 });
    if (!low) {
      // (a bowl of fruit, a plate of cakes, cups)
      S.box(-0.4, ph + 0.42, z, 0.36, 0.08, 0.36, 0xd8d0be, 'mapStone');
      for (let f = 0; f < 5; f++) S.box(-0.4 + (r(f, k) - 0.5) * 0.22, ph + 0.5, z + (r(f + 9, k) - 0.5) * 0.22, 0.12, 0.11, 0.12, [0xe8c040, 0xd0402a, 0x7aa832, 0xf08a1a, 0xc8306a][f], 'petal');
      S.box(0.35, ph + 0.41, z, 0.42, 0.05, 0.3, 0xb8945a, 'mapBark');
      for (let f = 0; f < 4; f++) S.box(0.2 + (f % 2) * 0.28, ph + 0.46, z - 0.07 + Math.floor(f / 2) * 0.14, 0.11, 0.05, 0.11, [0x5a8a3a, 0xe85a8a, 0xe8d090, 0xc8843a][f], 'petal');
      for (const dx of [0.68, -0.72]) S.box(dx, ph + 0.44, z + 0.25, 0.08, 0.13, 0.08, 0xf2efe6, 'mapStone');
    }
  }
  S.box(0, ph + 0.42, -d / 2 + 0.75, w - 1.6, 0.08, 0.46, pick(WOOD, 1, 2, 10, 642), 'mapBark', { shade: 1.03 });
  // ── The roof: a hipped skirt of tiles stepping in, a dark band, the gable roof over it, the ridge ──
  let y = by + 0.42;
  let hx = w / 2 + 1.0;
  let hz = d / 2 + 1.0;
  S.box(0, y + 0.02, 0, hx * 2 + 0.06, 0.06, hz * 2 + 0.06, pick(GOLD, 0, 1, 11, 642), 'mapStone', { shade: 0.92 });
  const eaveY = y - 0.05;
  const eaveZ = hz;
  const eaveX = hx;
  for (let k = 0; k < 4; k++) {
    S.box(0, y + 0.13, 0, hx * 2, 0.22, hz * 2, k % 2 ? tile(k) : pick(TILE_DARK, k, 0, 12, 642), 'mapStone', { shade: 1 - 0.02 * k });
    y += 0.22;
    hx -= 0.36;
    hz -= 0.3;
  }
  S.box(0, y + 0.18, 0, hx * 2 - 0.3, 0.36, hz * 2 - 0.3, pick(LACQ, 0, 0, 13, 642), 'mapBark', { shade: 0.75 });
  y += 0.36;
  // The gable roof: its ridge runs front to back (z), so its gable end faces the plaza.
  let gx = hx + 0.35;
  const gz = hz + 0.25;
  const steps = 8;
  const dx = (gx - 0.3) / steps;
  S.box(0, y + 0.02, 0, gx * 2 + 0.06, 0.06, gz * 2 + 0.06, pick(GOLD, 0, 2, 14, 642), 'mapStone', { shade: 0.92 });
  const y0 = y;
  for (let k = 0; k < steps; k++) {
    S.box(0, y + 0.13, 0, gx * 2, 0.22, gz * 2, k % 2 ? tile(k + 20) : pick(TILE_DARK, k, 1, 15, 642), 'mapStone', { shade: 1 + 0.01 * k });
    y += 0.22;
    gx -= dx;
  }
  // The gable ends: a lacquer board in each stepped triangle, gilt along its stepped edges, a gilt lotus at its peak.
  for (const sd of [-1, 1]) {
    const z = sd * (gz + 0.01);
    for (let k = 1; k < steps; k++) {
      const yy = y0 + 0.22 * k + 0.11;
      const ww = 2 * (0.3 + dx * (steps - k)) - 0.3;
      if (ww > 0.2) S.box(0, yy, z, ww, 0.22, 0.04, pick(LACQ, k, sd, 16, 642), 'mapBark', { shade: 0.9 });
      if (ww > 0.2) for (const sx of [-1, 1]) S.box((sx * (ww + 0.12)) / 2, yy, z + sd * 0.02, 0.1, 0.22, 0.05, pick(GOLD, k, sx, 17, 642), 'mapStone', { shade: 1.02 });
    }
    // (a little kbach flame of gilt in the triangle's middle, and the lotus at the peak: no horns at the ends)
    S.box(0, y0 + 0.75, z + sd * 0.03, 0.5, 0.12, 0.04, pick(GOLD, sd, 1, 18, 642), 'mapStone', { shade: 1.05 });
    S.box(0, y0 + 0.92, z + sd * 0.03, 0.26, 0.22, 0.04, pick(GOLD, sd, 2, 18, 642), 'mapStone', { shade: 1.08 });
    S.box(0, y - 0.3, z + sd * 0.02, 0.3, 0.3, 0.05, pick(GOLD, sd, 3, 18, 642), 'mapStone', { shade: 1.05 });
  }
  S.box(0, y + 0.08, 0, 0.36, 0.16, gz * 2 + 0.1, pick(TILE_DARK, 0, 2, 19, 642), 'mapStone');
  let ty = y + 0.16;
  for (const [k, [ww, hh]] of (
    [
      [0.62, 0.22],
      [0.48, 0.2],
      [0.36, 0.18],
      [0.24, 0.16],
    ] as const
  ).entries()) {
    S.box(0, ty + hh / 2, 0, ww, hh, ww, k % 2 ? st(30 + k) : pick(GOLD, k, 3, 20, 642), 'mapStone', { shade: 1 + 0.02 * k });
    ty += hh;
  }
  S.box(0, ty + 0.1, 0, 0.12, 0.2, 0.12, pick(GOLD, 0, 4, 21, 642), 'mapStone', { shade: 1.1 });
  // ── Lit warm inside: three tower lanterns hanging from the tie beams, four more under the eaves' corners, bulbs along
  // all four eaves, the gable ends' gilt edges glowing, a pool of light on its floor and before its steps ──
  for (const z of [zs[1], zs[2], 0]) {
    const top = by + 0.23;
    const ly = top - 0.8;
    S.box(0, (top + ly + 0.2) / 2, z, 0.03, top - ly - 0.2, 0.03, 0x2a2420, 'mapStone');
    S.box(0, ly + 0.2, z, 0.3, 0.06, 0.3, pick(GOLD, 0, z, 22, 642), 'mapStone');
    S.box(0, ly + 0.27, z, 0.2, 0.08, 0.2, pick(GOLD, 1, z, 23, 642), 'mapStone');
    S.box(0, ly - 0.2, z, 0.3, 0.06, 0.3, pick(GOLD, 2, z, 24, 642), 'mapStone');
    const L = S.world(0, ly, z);
    bodies.add(L.x, L.y, L.z, 0.26, 0.34, 0.26, LANTERN[(i + Math.round(z * 3)) & 3], 1.25, p.facing);
    glow.add(L.x, L.y, L.z, LAMP_HALO, 3, { level: 0.9 });
  }
  for (const [cx, cz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ]) {
    const W = S.world(cx * (eaveX - 0.35), eaveY - 0.02, cz * (eaveZ - 0.35));
    towerLantern(b, o.kit, bodies, glow, W.x, W.y, W.z, 0.22, 650 + i * 4 + cx + 2 * cz, src, p.facing);
  }
  const step = low ? 0.7 : 0.42;
  for (const [ex, ez, along] of [
    [0, eaveZ, true],
    [0, -eaveZ, true],
    [eaveX, 0, false],
    [-eaveX, 0, false],
  ] as const) {
    const half = along ? eaveX : eaveZ;
    for (let t = -half; t <= half + 0.01; t += step) {
      const W = S.world(along ? t : ex, eaveY - 0.08 - 0.06 * Math.cos((t / half) * Math.PI * 0.5), along ? ez : t);
      bodies.add(W.x, W.y, W.z, 0.1, 0.12, 0.1, BULB[Math.floor(hash3(t, i, ex + ez, 643) * BULB.length) % BULB.length], 0.5);
    }
  }
  for (const sd of [-1, 1])
    for (let k = 1; k < steps; k++) {
      const ww = 2 * (0.3 + dx * (steps - k)) - 0.3;
      if (ww <= 0.2) continue;
      for (const sx of [-1, 1]) {
        const W = S.world((sx * (ww + 0.12)) / 2, y0 + 0.22 * k + 0.11, sd * (gz + 0.06));
        bodies.add(W.x, W.y, W.z, 0.1, 0.22, 0.04, 0xffc35a, 0.55, p.facing);
      }
    }
  if (o.pools) {
    for (const z of [zs[1], zs[2]]) {
      const W = S.world(0, 0, z);
      o.pools.add(W.x, W.z, 2.6, 0xffb058, 0.46, g + ph + 0.02);
    }
    const F = S.world(0, 0, d / 2 + 2.6);
    o.pools.add(F.x, F.z, 4.2, 0xffa850, 0.32);
  }
  // Its ground: no trees.
  for (let lz = -d / 2 - 1.5; lz <= d / 2 + 1.6; lz += 0.5)
    for (let lx = -w / 2 - 1.3; lx <= w / 2 + 1.3; lx += 0.5) {
      const W = S.world(lx, 0, lz);
      field.occupy(W.x - 0.3, W.z - 0.3, W.x + 0.3, W.z + 0.3);
    }
  // (the eave corners on the plaza's side: the one nearer the landing first)
  const a = S.world(-eaveX, eaveY, eaveZ);
  const c = S.world(eaveX, eaveY, eaveZ);
  const A = { x: a.x, y: a.y, z: a.z };
  const B = { x: c.x, y: c.y, z: c.z };
  // (nearer the landing: the corner whose bearing round the plaza is nearer 0, the stage's)
  const bearing = (q: V3) => Math.abs(lakePlazaPolar(q.x, q.z)[0]);
  return bearing(A) <= bearing(B) ? { near: A, far: B } : { near: B, far: A };
}

// ── The food stalls ──────────────────────────────────────────────────────────

type Kind = 'grill' | 'fruit' | 'drinks' | 'sweets';
const KINDS: Kind[] = ['grill', 'fruit', 'drinks', 'sweets'];

const item = (id: string, km: string, en: string, price: number, consume: ShopItem['consume'], colors?: number[]): ShopItem => ({ id, name: { km, en }, price, consume, ...(colors ? { colors } : {}) });

const SHOPS: Record<Kind, { km: string; en: string; items: ShopItem[] }> = {
  grill: {
    km: 'តូបត្រីអាំង',
    en: 'Lakeside grill',
    items: [
      item('trei-ang', 'ត្រីអាំង', 'Grilled lake fish', 4000, 'skewer', [0xb88a5a, 0x8a5a32]),
      item('bangkear-ang', 'បង្គាអាំង', 'Grilled river prawns', 5000, 'skewer', [0xe8783a]),
      item('poat-ang', 'ពោតអាំង', 'Grilled corn', 2000, 'skewer', [0xe8c040]),
    ],
  },
  fruit: {
    km: 'តូបផ្លែឈើ',
    en: 'Fruit stall',
    items: [
      item('svay', 'ស្វាយ', 'Green mango with chilli salt', 2000, 'fruit', [0x9ac040]),
      item('sav-mav', 'សាវម៉ាវ', 'Rambutans', 3000, 'fruit', [0xd02a3a]),
      item('chek-ang', 'ចេកអាំង', 'Grilled bananas', 1500, 'skewer', [0xe8b850]),
    ],
  },
  drinks: {
    km: 'តូបភេសជ្ជៈ',
    en: 'Drinks stall',
    items: [
      item('tuk-ampov', 'ទឹកអំពៅ', 'Sugarcane juice', 2000, 'cupDrink', [0xc8d878]),
      item('daung', 'ដូងខ្ចី', 'Green coconut', 3000, 'coconut'),
      item('tuk-thnot', 'ទឹកត្នោត', 'Palm juice', 2000, 'cupDrink', [0xe8dcb0]),
      item('tuk', 'ទឹកសុទ្ធ', 'Water', 1000, 'bottle'),
    ],
  },
  sweets: {
    km: 'តូបនំ',
    en: 'Sweets stall',
    items: [
      item('num-krok', 'នំក្រក', 'Num krok (coconut rice cakes)', 2000, 'sweet', [0xf0d8a0, 0xd89a48]),
      item('num-ansom', 'នំអន្សម', 'Num ansom (sticky rice cake)', 2000, 'sweet', [0x5a8a3a, 0xe8e0c8]),
      item('num-plae-ai', 'នំផ្លែអាយ', 'Num plae ai (palm sugar balls)', 1500, 'sweet', [0xf2f0e8, 0xb8783a]),
    ],
  },
};

/** The counter (stall space: +z its front, toward the plaza's middle). */
const COUNTER = LAKE_STALL_COUNTER;
const RED = 0xc8202a;
const WHITE = 0xf2eee4;

function stall(o: SalasIn, p: (typeof LAKE_STALLS)[number], i: number): void {
  const { field, b, bodies, glow, low, src } = o;
  const kind = KINDS[i % KINDS.length];
  const y = field.heightAt(p.x, p.z) + 0.08;
  const s = new Site(b, field, p.x, y, p.z, p.facing, src, 660 + i);
  const tone = (list: readonly number[], a: number, c: number) => pick(list, a, c, 1, 660 + i);
  // Posts, beams.
  const px = 1.55;
  const pzF = 1.1;
  const pzB = -0.85;
  const H = 2.6;
  for (const [x, z] of [
    [-px, pzF],
    [px, pzF],
    [-px, pzB],
    [px, pzB],
  ]) s.box(x, H / 2, z, 0.13, H, 0.13, tone(POST, x * 10, z * 10), 'mapBark');
  for (const z of [pzF, pzB]) s.box(0, H - 0.05, z, 2 * px + 0.2, 0.1, 0.1, tone(PLANK, z, 2), 'mapBark');
  // The canopy: two slopes up to a ridge along x, red and white stripes running down them, a scalloped valance.
  const ridgeY = H + 0.75;
  const half = (pzF - pzB) / 2 + 0.45;
  const zMid = (pzF + pzB) / 2;
  const tilt = Math.atan2(ridgeY - H, half);
  const slope = Math.hypot(ridgeY - H, half) + 0.04;
  // (cloth in the festival kit, glowing a little at night: the lamps under it light it through, a lit stall from afar)
  const cloth = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: number, pitch = 0) => {
    const W = s.world(lx, ly, lz);
    o.kit.box(W.x, W.y, W.z, sx, sy, sz, color, { yaw: p.facing, pitch, glow: color === RED ? 0.2 : 0.13 });
  };
  const stripes = 9;
  for (const side of [-1, 1])
    for (let k = 0; k < stripes; k++) {
      const x = -px - 0.25 + ((k + 0.5) * (2 * px + 0.5)) / stripes;
      cloth(x, (H + ridgeY) / 2, zMid + (side * half) / 2, (2 * px + 0.5) / stripes + 0.005, 0.05, slope, k % 2 ? WHITE : RED, side * tilt);
    }
  s.box(0, ridgeY + 0.03, zMid, 2 * px + 0.6, 0.08, 0.1, 0xe2b04a, 'petal');
  for (const side of [-1, 1]) {
    const fz = zMid + side * (half + 0.02);
    for (let k = 0; k < 10; k++) {
      const x = -px - 0.25 + ((k + 0.5) * (2 * px + 0.5)) / 10;
      cloth(x, H - 0.02, fz, (2 * px + 0.5) / 10 - 0.02, 0.2, 0.04, k % 2 ? RED : WHITE);
      cloth(x, H - 0.16, fz, 0.18, 0.1, 0.04, k % 2 ? RED : WHITE);
    }
  }
  // The counter: a plank top on legs, a red cloth with a gilt hem down its front.
  const C = COUNTER;
  for (const sx of [1, -1]) for (const dz of [-1, 1]) s.box(sx * (C.w / 2 - 0.08), C.top / 2, C.z + dz * (C.d / 2 - 0.06), 0.08, C.top, 0.08, tone(BAMBOO, sx, dz), 'mapBark');
  s.box(0, C.top - 0.03, C.z, C.w, 0.06, C.d, tone(PLANK, 4, 5), 'mapBark');
  s.box(0, C.top * 0.55, C.z + C.d / 2 + 0.02, C.w, C.top * 0.8, 0.04, 0xb01828, 'petal');
  s.box(0, C.top * 0.17, C.z + C.d / 2 + 0.03, C.w, 0.06, 0.04, 0xe2b04a, 'petal');
  s.box(0.65, 0.2, -0.25, 0.36, 0.06, 0.36, 0xd8352a, 'mapStone');
  s.box(0.65, 0.09, -0.25, 0.3, 0.18, 0.3, 0xc82e24, 'mapStone');
  goods(s, kind, low);
  // A lamp hanging from the front beam by the left post, a bulb string along the front.
  const L = s.world(-1.0, 2.15, pzF);
  s.box(-1.0, 2.45, pzF, 0.02, 0.28, 0.02, 0x3a3028, 'mapBark');
  s.box(-1.0, 2.3, pzF, 0.26, 0.05, 0.26, 0xb4a385, 'mapStone');
  s.box(-1.0, 2.36, pzF, 0.14, 0.07, 0.14, 0xd9a93a, 'mapStone');
  s.box(-1.0, 1.98, pzF, 0.22, 0.05, 0.22, 0xb4a385, 'mapStone');
  bodies.add(L.x, L.y, L.z, 0.21, 0.26, 0.21, 0xffb860, 1.2);
  glow.add(L.x, L.y, L.z, LAMP_HALO, 2, { level: 0.9 });
  // (and a lantern over the goods in the middle, lighting them: the stall reads lit from afar)
  for (const [lx, lz] of [
    [1.0, pzF],
    [0, 0.45],
  ]) {
    const M = s.world(lx, 2.12, lz);
    s.box(lx, 2.45, lz, 0.02, 0.36, 0.02, 0x3a3028, 'mapBark');
    s.box(lx, 2.28, lz, 0.26, 0.05, 0.26, 0xd9a93a, 'mapStone');
    bodies.add(M.x, M.y, M.z, 0.21, 0.26, 0.21, 0xffc070, 1.15, p.facing);
    glow.add(M.x, M.y, M.z, LAMP_HALO, 1.9, { level: 0.85 });
  }
  if (o.pools) {
    const F = s.world(0, 0, 1.9);
    o.pools.add(F.x, F.z, 4.4, 0xffb058, 0.4);
  }
  for (let x = -px; x <= px + 0.01; x += low ? 0.6 : 0.36) {
    const W = s.world(x, H - 0.32 - 0.05 * Math.cos((x / px) * Math.PI * 0.5), pzF + 0.62);
    bodies.add(W.x, W.y, W.z, 0.09, 0.11, 0.09, BULB[Math.floor(hash3(x, i, 2, 661) * BULB.length) % BULB.length], 0.5);
  }
  field.occupy(p.x - 2.4, p.z - 2.4, p.x + 2.4, p.z + 2.4);
  // The shop: before the counter's middle, facing the stall.
  const at = s.world(0, 0, 1.85);
  const sh = SHOPS[kind];
  registerShop({ id: `nye-lake-${kind}`, name: { km: sh.km, en: sh.en }, x: at.x, y: field.heightAt(at.x, at.z) + 0.08, z: at.z, r: 1.9, facing: p.facing + Math.PI, items: sh.items });
}

/** The goods on the counter (and beside it), by kind. */
function goods(s: Site, kind: Kind, low: boolean): void {
  const C = COUNTER;
  const top = C.top;
  const r = (a: number, b = 0) => hash3(a, b, 7, s.seed);
  if (kind === 'grill') {
    // A long charcoal grill, fish split and skewered on bamboo, prawns, corn; a basket of fish beside it.
    s.box(0.2, top + 0.08, C.z, 1.7, 0.14, 0.44, 0x3a3634, 'mapStone');
    s.box(0.2, top + 0.155, C.z, 1.6, 0.02, 0.36, 0x9a3a1a, 'mapStone', { shade: 1.25 });
    for (let k = 0; k < (low ? 4 : 8); k++) {
      const x = -0.5 + k * 0.19;
      const fish = k % 3 !== 2;
      s.box(x, top + 0.19, C.z, fish ? 0.12 : 0.06, 0.04, fish ? 0.36 : 0.5, fish ? 0xb08050 : 0xe8783a, 'petal', { shade: 0.95 + 0.1 * r(k) });
    }
    s.box(-1.05, top + 0.08, C.z, 0.44, 0.14, 0.4, 0xb89a5a, 'mapBark');
    for (let k = 0; k < 4; k++) s.box(-1.12 + (k % 2) * 0.16, top + 0.17, C.z - 0.08 + Math.floor(k / 2) * 0.16, 0.1, 0.05, 0.28, 0xa8a496, 'petal');
  } else if (kind === 'fruit') {
    // Heaps of fruit in flat baskets: mangoes, rambutans, dragon fruit, bananas hanging from the front beam.
    for (const [k, [x, col]] of (
      [
        [-0.85, 0x9ac040],
        [-0.25, 0xd02a3a],
        [0.35, 0xe0306a],
        [0.95, 0xe8b850],
      ] as const
    ).entries()) {
      s.box(x, top + 0.03, C.z, 0.5, 0.05, 0.46, 0xb8945a, 'mapBark');
      for (let f = 0; f < (low ? 3 : 7); f++) s.box(x - 0.15 + (f % 3) * 0.15, top + 0.1 + (f >= 6 ? 0.1 : 0), C.z - 0.1 + Math.floor((f % 6) / 3) * 0.2, 0.13, 0.12, 0.13, col, 'petal', { shade: 0.92 + 0.14 * r(f, k) });
    }
    if (!low) for (let k = 0; k < 3; k++) s.box(0.8 + k * 0.14, 2.2, 1.1, 0.1, 0.34, 0.1, 0xe8c050, 'petal');
  } else if (kind === 'drinks') {
    for (let k = 0; k < (low ? 4 : 7); k++) {
      const x = -0.95 + (k % 4) * 0.2 + (k >= 4 ? 0.1 : 0);
      s.box(x, top + 0.1 + (k >= 4 ? 0.16 : 0), C.z, 0.2, 0.2, 0.2, [0x6a9a2a, 0x7aa832, 0x5e8e26][k % 3], 'petal', { ry: r(k) });
    }
    for (let k = 0; k < 5; k++) s.box(0.05 + k * 0.14, top + 0.07, C.z + 0.12, 0.08, 0.12, 0.08, k % 2 ? 0xc8d878 : 0xe8dcb0, 'petal');
    s.box(1.0, top + 0.17, C.z - 0.05, 0.5, 0.32, 0.4, 0x2a6ab8, 'mapStone');
    s.box(1.0, top + 0.35, C.z - 0.05, 0.52, 0.05, 0.42, 0xf2efe6, 'mapStone');
    for (let k = 0; k < 3; k++) s.box(1.4 - k * 0.08, 0.9, 1.3, 0.05, 1.8, 0.05, 0x8a9a3a, 'mapBark', { rz: 0.12 + k * 0.05 });
  } else {
    // The num krok griddle over a clay stove, trays of cakes, rice cakes in banana leaf.
    s.box(0.9, top + 0.12, C.z, 0.5, 0.22, 0.5, 0x8a5a3a, 'mapStone');
    s.box(0.9, top + 0.25, C.z, 0.52, 0.05, 0.52, 0x2a2826, 'mapStone');
    if (!low) for (let a = 0; a < 3; a++) for (let c = 0; c < 3; c++) s.box(0.75 + a * 0.15, top + 0.28, C.z - 0.15 + c * 0.15, 0.08, 0.02, 0.08, 0xf0d8a0, 'petal');
    for (const [x, col] of [
      [-0.9, 0xc8843a],
      [-0.25, 0xe8d090],
      [0.3, 0xe85a8a],
    ] as const) {
      s.box(x, top + 0.03, C.z, 0.48, 0.04, 0.42, 0xb8945a, 'mapBark');
      for (let k = 0; k < (low ? 2 : 6); k++) s.box(x - 0.15 + (k % 3) * 0.15, top + 0.08, C.z - 0.08 + Math.floor(k / 3) * 0.16, 0.1, 0.05, 0.1, col, 'petal', { shade: 0.95 + 0.1 * r(k, x) });
    }
  }
}
