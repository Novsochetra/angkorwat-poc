import type { VoxelBuilder } from '../../../voxel/VoxelBuilder';
import { registerModel } from '../look';
import type { PlantLook } from '../state';
import { DEAD_LEAF, DEAD_STEM, mix, mound, pt, ribbon, rng, seg, step, thirsty, tone, turned, type P, type Rand } from './_crop';

/**
 * The sugarcane អំពៅ (garden/kinds.ts `KINDS.sugarcane`; the contract garden/look.ts): a clump of jointed canes,
 * up to about 3.4 m with their leaves: the canes purple-red (the chewing cane sold by the roadside) or
 * yellow-green (by `look.seed`), a ring at every joint; long narrow leaves arching out from the top third, the
 * green sheaths wrapping the cane there; dry brown sheaths hanging low down.
 *
 * Grown, its `fruit` is the canes' ripening: 0 green, 1 ripening, 2 ripe (the canes darker and thicker). The
 * first time it is grown (`cut` false) the clump stands at full height all along. Once he has cut it (`cut`: he
 * cuts the ripe canes with his knife), the stumps stay, cut pale, and the clump's younger canes grow on: short
 * regrowth just after (`fruit` 0), taller canes ripening (1), a full ripe clump again (2).
 *
 * Stages: 0 the cutting (a piece of cane with its buds) set slanting in the earth; 1 the first shoots from its
 * buds; 2 a fan of leafy shoots, no cane yet; 3 the canes up, about 2.2 m; 4 grown.
 */

/** The two kinds: purple-red, its joints pale with wax; yellow-green, its joints darker. */
const CANE = {
  purple: { cane: [0x7a3448, 0x86404e, 0x6e2e42], ring: 0xc2b496, young: 0x8a6a4a },
  yellow: { cane: [0xbcb65e, 0xc6bc66, 0xb0aa52], ring: 0x76603a, young: 0x9aaa4e },
} as const;
type CaneKind = keyof typeof CANE;

const LEAF = [0x5a9038, 0x649a40, 0x548a32, 0x6ea446] as const;
const SHEATH = 0x6e9a44;
const SPINDLE = 0x7aaa4c;
const DRY_SHEATH = [0xa88a5a, 0x9a7a4e, 0xb49a68] as const;
const CUT = 0xe2d2a4;

const TAU = Math.PI * 2;

interface Ctx {
  b: VoxelBuilder;
  look: PlantLook;
  r: Rand;
  kind: CaneKind;
  /** How green the canes still are (0 ripe ‥ 0.35 young): growing, or not yet ripe. */
  young: number;
  dead: boolean;
  droop: 0 | 1 | 2;
}

/** A leaf from `p`: up, out and over toward `yaw` (thirst lets it hang). */
function leaf(c: Ctx, p: P, yaw: number, len: number, w: number, tilt: number, i: number): void {
  const { r, droop, dead } = c;
  const col = (k: number): number => (dead ? tone(DEAD_LEAF, r(i, 60 + k)) : thirsty(k === 2 ? mix(tone(LEAF, r(i, 61)), 0x8ab452, 0.25) : tone(LEAF, r(i, 61)), droop, r(i, 62)));
  const t = tilt + (dead ? 0.9 : droop * 0.35);
  const bend = 0.62 + (dead ? 0.4 : droop * 0.3) + r(i, 63) * 0.15;
  ribbon(c.b, p, yaw, t, bend, 3, len * (dead ? 0.55 : droop === 2 ? 0.8 : 1), w, w * 0.5, 0.038, col, dead ? 'mapBark' : 'mapLeaf', (r(i, 64) - 0.5) * 0.9);
}

/**
 * One cane from (`x`, `z`) leaning out toward `yaw`: `C` of bare jointed cane, then the green sheaths up to the
 * crown at `crown`, its leaves (`nl`, `L` long) and the rolled spindle leaf on top.
 */
function cane(c: Ctx, x: number, z: number, yaw: number, lean: number, C: number, crown: number, thick: number, nl: number, L: number, i: number): void {
  const { b, r, kind, dead } = c;
  const k = CANE[kind];
  const dir = (d: number): P => step(pt(x, 0, z), d, yaw, lean);
  const caneCol = dead ? tone(DEAD_STEM, r(i, 1)) : mix(tone(k.cane, r(i, 1)), k.young, c.young);
  const p = pt(x, 0, z);
  if (C > 0) {
    seg(b, p, C, thick, thick, yaw, lean, caneCol, 'mapBark');
    // the joints: a ring every 26 cm or so (closer near the foot)
    if (!dead)
      for (let d = 0.1; d < C - 0.08; d += 0.23 + d * 0.05) {
        const j = dir(d);
        turned(b, j, thick * 1.22, 0.032, thick * 1.22, yaw, lean, 0, 0, k.ring, 'mapBark');
      }
    // a dry brown sheath hanging off a low joint
    if (C > 0.5) seg(b, dir(C * (0.45 + r(i, 2) * 0.3)), 0.34, 0.07, 0.02, yaw + (r(i, 3) - 0.5) * 2, 2.6, tone(DRY_SHEATH, r(i, 4)), 'mapBark');
  }
  // The green sheaths wrapping the top of the cane, up to the crown.
  const sh = dir(C);
  seg(b, sh, crown - C, thick * 1.1, thick * 1.1, yaw, lean, dead ? tone(DEAD_STEM, r(i, 5)) : thirsty(SHEATH, c.droop), dead ? 'mapBark' : 'mapLeaf');
  // Leaves from the crown and a little below it, all ways round; the spindle standing up in the middle.
  const top = dir(crown);
  for (let l = 0; l < nl; l++) {
    const at = dir(crown - (l % 2) * Math.min(0.25, (crown - C) * 0.5) - l * 0.04);
    leaf(c, at, yaw + l * 2.4 + r(i * 10 + l, 6) * 0.6, L * (0.85 + r(i * 10 + l, 7) * 0.3), 0.1, 0.35 + (l % 2) * 0.2, i * 10 + l);
  }
  if (!dead) seg(b, top, L * 0.42, 0.035, 0.035, yaw, lean * 0.5, SPINDLE, 'mapLeaf');
}

registerModel('sugarcane', (b, look) => {
  const r = rng(look, 71);
  const c: Ctx = { b, look, r, kind: r(0, 1) < 0.5 ? 'purple' : 'yellow', young: look.stage < 4 || look.fruit === 0 ? 0.35 : look.fruit === 1 ? 0.15 : 0, dead: look.dead, droop: look.droop };
  const { stage, dead, fruit } = look;
  const k = CANE[c.kind];
  const turn = r(0, 2) * TAU;

  if (stage <= 1) {
    // The cutting: a piece of cane with two or three joints, slanting half into the earth, its cut end up.
    mound(b, 0, 0, 0.26, r(0, 3));
    const p = pt(-Math.sin(turn) * 0.12, -0.04, -Math.cos(turn) * 0.12);
    const col = dead ? tone(DEAD_STEM, r(0, 4)) : tone(k.cane, r(0, 4));
    const tilt = 0.8;
    const start = pt(p.x, p.y, p.z);
    seg(b, p, 0.46, 0.08, 0.08, turn, tilt, col, 'mapBark');
    for (const d of [0.16, 0.34]) {
      const j = step(pt(start.x, start.y, start.z), d, turn, tilt);
      turned(b, j, 0.096, 0.03, 0.096, turn, tilt, 0, 0, dead ? col : k.ring, 'mapBark');
    }
    // its cut end, pale
    const e = step(pt(p.x, p.y, p.z), 0.008, turn, tilt);
    seg(b, e, 0.012, 0.074, 0.074, turn, tilt, dead ? mix(CUT, 0x8a7a5a, 0.5) : CUT, 'mapBark');
    if (stage === 0) {
      // a bud on its upper side, green (the eye that will sprout)
      if (!dead) {
        const j = step(pt(start.x, start.y + 0.05, start.z), 0.25, turn, tilt);
        b.box(j.x, j.y, j.z, 0.035, 0.035, 0.035, 0x8aa84a, 'mapLeaf', { ry: turn });
      }
      return;
    }
    // Stage 1: shoots from the buds, a few narrow leaves each.
    for (let s = 0; s < 2; s++) {
      const j = step(pt(start.x, start.y + 0.045, start.z), 0.16 + s * 0.18, turn, tilt);
      const sp = pt(j.x, j.y, j.z);
      seg(b, sp, 0.1, 0.03, 0.03, turn + s, 0.1, dead ? tone(DEAD_STEM, r(s, 8)) : thirsty(SHEATH, look.droop), dead ? 'mapBark' : 'mapLeaf');
      for (let l = 0; l < 3; l++) leaf(c, pt(sp.x, sp.y, sp.z), turn + s * 1.3 + l * 2.1, 0.3 - l * 0.05, 0.04, 0.15 + l * 0.2, s * 10 + l);
    }
    return;
  }

  // The clump: canes round its middle, leaning out a little.
  type Cane = { C: number; crown: number; thick: number; nl: number; L: number };
  const plan: Cane[] = [];
  // (cut once: stumps till the clump is ripe again; the canes regrow from short)
  const cut = stage === 4 && look.cut;
  const stumps = cut && fruit < 2 && !dead;
  const tall = (thick: number): void => {
    for (let i = 0; i < 6; i++) plan.push({ C: (1.95 + r(i, 10) * 0.3) * (i === 5 ? 0.7 : 1), crown: (2.45 + r(i, 11) * 0.25) * (i === 5 ? 0.75 : 1), thick, nl: i === 5 ? 3 : 5, L: 1.1 });
  };
  if (stage === 2) for (let i = 0; i < 4; i++) plan.push({ C: 0, crown: 0.28 + r(i, 10) * 0.1, thick: 0.04, nl: 3, L: 0.75 });
  else if (stage === 3) for (let i = 0; i < 5; i++) plan.push({ C: 0.75 + r(i, 10) * 0.25, crown: 1.45 + r(i, 11) * 0.2, thick: 0.062, nl: 4, L: 0.95 });
  else if (!cut) tall(fruit === 2 ? 0.085 : fruit === 1 ? 0.08 : 0.074);
  else if (fruit === 2) tall(0.085);
  else if (fruit === 1) for (let i = 0; i < 5; i++) plan.push({ C: (1.45 + r(i, 10) * 0.3) * (i === 4 ? 0.7 : 1), crown: (2.05 + r(i, 11) * 0.25) * (i === 4 ? 0.75 : 1), thick: 0.074, nl: i === 4 ? 3 : 5, L: 1.05 });
  else for (let i = 0; i < 4; i++) plan.push({ C: 0.55 + r(i, 10) * 0.3, crown: 1.35 + r(i, 11) * 0.2, thick: 0.058, nl: 4, L: 0.95 });
  const n = dead ? Math.min(3, plan.length) : plan.length;
  for (let i = 0; i < n; i++) {
    const a = turn + (i * TAU) / plan.length + (r(i, 12) - 0.5) * 0.5;
    const d = 0.05 + r(i, 13) * 0.09;
    const p = plan[i];
    const lean = 0.05 + r(i, 14) * 0.09 + (dead ? 0.25 : 0);
    const shrink = dead ? 0.7 : 1;
    cane(c, Math.sin(a) * d, Math.cos(a) * d, a, lean, p.C * shrink, p.crown * shrink, p.thick, dead ? 2 : p.nl, p.L, i);
  }
  // Cut: the stumps of the canes he took, their cut tops pale (weathered once the new canes are up).
  if (stumps)
    for (let i = 0; i < 3; i++) {
      const a = turn + 0.6 + (i * TAU) / 3;
      const d = 0.15 + r(i, 15) * 0.04;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const h = 0.13 + r(i, 16) * 0.07;
      b.box(x, h / 2, z, 0.075, h, 0.075, tone(k.cane, r(i, 17)), 'mapBark', { ry: a });
      b.box(x, h + 0.006, z, 0.068, 0.014, 0.068, fruit === 0 ? CUT : mix(CUT, 0x8e8068, 0.5), 'mapBark', { ry: a, rx: 0.25 });
    }
  // Dry leaves lying round the foot of a grown clump.
  if (stage === 4 && !dead)
    for (let i = 0; i < 2; i++) {
      const a = turn + 2 + i * 2.6;
      seg(b, pt(Math.sin(a) * 0.2, 0.03, Math.cos(a) * 0.2), 0.45, 0.07, 0.02, a, Math.PI / 2 - 0.05, tone(DRY_SHEATH, r(i, 18)), 'mapBark');
    }
});
