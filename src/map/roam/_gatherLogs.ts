import { Vector3, type Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { gatherLeft, registerGatherSource, type GatherSpot } from '../build/gather';
import type { HeightField } from '../heightfield';
import { CUT, LOG_BARK, pickTone, Site } from '../jungle/_campKit';
import { JUNGLE_SITES } from '../layout';
import { GatherLayer } from './_gatherLayer';

/**
 * **Logs at the woodcutters' camp** (ticket AWP-11; the gathering core AWP-9): two
 * felled trunks lie by the camp (layout.ts `JUNGLE_SITES` `woodcutters`, its
 * models jungle/_campWood.ts), their branches trimmed, their foot sawn off the
 * stump. He cuts logs off them with the woodcutter's axe (ពូថៅ, the gathering's
 * `axe` swing: two hands, from over his head), `HITS` blows a log, the outermost
 * log first: he stands across the trunk where the log comes off (the spot's
 * `along`), and the trunk is shorter after, a pale fresh cut at its end. A log
 * is heavy (4 of his load's 12: three at most). The woodcutters fell another
 * tree: each log is back `REGROW_DAYS` game days after it was cut.
 *
 * Spots: one a log (`logs:<trunk>:<n>`, one piece each), only the outermost one
 * still there is offered (a log that came back past one still missing waits
 * for it: the trunk shows as far as it is whole from its foot); no logs left:
 * the innermost's ("None left: it grows back in 3 days"). The trunks are this
 * source's own blocks (roam/_gatherLayer.ts), made again when a log goes or
 * comes back.
 */
const HITS = 6;
const REGROW_DAYS = 3;
/** Logs a trunk gives, each this long (m); the foot that stays by the stump. */
const LOGS = 3;
const LOG = 1.4;
const KEEP = 1.0;

interface Trunk {
  /** In the camp's own space (m: +z toward the trail, +x its left): its foot (the sawn end), the way it lies. */
  readonly foot: readonly [number, number];
  readonly toward: readonly [number, number];
  /** Thick (m). */
  readonly d: number;
}

/** Where the trunks lie: on open ground by the camp, clear of the fire, the lean-to, the stack and the chopping block. */
const TRUNKS: Record<string, Trunk> = {
  a: { foot: [-8.0, -2.4], toward: [-8.5, 3.4], d: 0.56 },
  b: { foot: [3.2, 7.2], toward: [8.6, 5.9], d: 0.5 },
};

interface Placed {
  id: string;
  t: Trunk;
  /** The foot and the way it lies on the map (unit), the angle (`atan2(dx, dz)`). */
  x: number;
  z: number;
  ux: number;
  uz: number;
  along: number;
  /** Its logs' spots, from the foot out. */
  logs: GatherSpot[];
}

let placed: Placed[] = [];
let spots: GatherSpot[] = [];
let layer: GatherLayer | null = null;
let site: Site | null = null;

/** Logs still there from the foot out without a gap (what is drawn). */
function whole(p: Placed): number {
  let n = 0;
  while (n < LOGS && gatherLeft(p.logs[n]) > 0) n++;
  return n;
}

/** The spots offered: per trunk its outermost log, or (none) its first. */
function offer(): void {
  spots = placed.map((p) => {
    const n = whole(p);
    return p.logs[Math.max(0, n - 1)];
  });
}

const _a = new Vector3();
const _b = new Vector3();

/** The trunks as they are now. */
function draw(field: HeightField): void {
  if (!layer || !site) return;
  const b = new VoxelBuilder();
  const s = new Site(b, field, site.x, site.y, site.z, site.yaw, undefined, site.seed);
  for (const p of placed) {
    const n = whole(p);
    const len = KEEP + n * LOG;
    const [fx, fz] = p.t.foot;
    const lx = (p.t.toward[0] - fx) / Math.hypot(p.t.toward[0] - fx, p.t.toward[1] - fz);
    const lz = (p.t.toward[1] - fz) / Math.hypot(p.t.toward[0] - fx, p.t.toward[1] - fz);
    const d = p.t.d;
    // (in pieces a metre or so long, each lying on the ground under it: the land steps)
    const at = (u: number): [number, number, number] => {
      const x = fx + lx * u;
      const z = fz + lz * u;
      return [x, s.ground(x, z) + d * 0.42, z];
    };
    const steps = Math.max(2, Math.ceil(len / 0.9));
    for (let i = 0; i < steps; i++) {
      const u0 = (len * i) / steps;
      const u1 = (len * (i + 1)) / steps;
      // (thinner toward its top)
      const th = d * (1 - 0.18 * ((u0 + u1) / 2 / (KEEP + LOGS * LOG)));
      s.log(at(u0), at(u1 + (i < steps - 1 ? 0.02 : 0)), th, pickTone(LOG_BARK, i, p.id.length, 7, s.seed), 'mapBark');
      // (moss here and there on its top)
      if (hash3(i, p.id.charCodeAt(0), 3, 8101) < 0.35) {
        const m = at((u0 + u1) / 2);
        s.box(m[0], m[1] + th * 0.38, m[2], th * 0.5, 0.06, (u1 - u0) * 0.6, 0x5d6b3a, 'mapBark', { ry: Math.atan2(lx, lz) });
      }
    }
    // Its foot: sawn off the stump, pale and ringed.
    const f = at(0);
    const ry = Math.atan2(lx, lz);
    s.box(f[0] - lx * 0.01, f[1], f[2] - lz * 0.01, d * 0.72, d * 0.72, 0.03, pickTone(CUT, 1, p.id.length, 9, s.seed), 'wood', { ry });
    s.box(f[0] - lx * 0.03, f[1], f[2] - lz * 0.03, d * 0.34, d * 0.34, 0.02, 0xb88e58, 'wood', { ry });
    const e = at(len);
    if (n === LOGS) {
      // Whole: its top end rough where the crown was cut away, two branch stubs.
      s.box(e[0], e[1], e[2], d * 0.6, d * 0.6, 0.05, 0x8a6a48, 'wood', { ry });
      for (const k of [0.45, 0.75]) {
        const m = at(len * k);
        const side = k < 0.6 ? 1 : -1;
        s.beam([m[0], m[1] + d * 0.2, m[2]], [m[0] + lz * side * 0.5, m[1] + d * 0.55, m[2] - lx * side * 0.5], 0.13, 0.13, pickTone(LOG_BARK, k * 10, 2, 10, s.seed), 'mapBark');
        s.box(m[0] + lz * side * 0.52, m[1] + d * 0.57, m[2] - lx * side * 0.52, 0.11, 0.03, 0.11, pickTone(CUT, k * 10, 3, 11, s.seed), 'wood');
      }
    } else {
      // Cut: the fresh end, pale, its rings, chips in the grass by it.
      s.box(e[0] + lx * 0.01, e[1], e[2] + lz * 0.01, d * 0.74, d * 0.74, 0.03, 0xe6c896, 'wood', { ry });
      s.box(e[0] + lx * 0.03, e[1], e[2] + lz * 0.03, d * 0.36, d * 0.36, 0.02, 0xd4ae78, 'wood', { ry });
      for (let i = 0; i < 9; i++) {
        const a = hash3(i, n, p.id.charCodeAt(0), 8102) * Math.PI * 2;
        const r = 0.35 + hash3(i, n, 2, 8103) * 0.9;
        const x = e[0] + Math.cos(a) * r;
        const z = e[2] + Math.sin(a) * r;
        s.box(x, s.ground(x, z) + 0.02, z, 0.12 + 0.06 * hash3(i, 4, n, 8104), 0.03, 0.06, pickTone(CUT, i, n, 12, s.seed), 'wood', { ry: a * 2 });
      }
    }
  }
  layer.set(b);
}

/** Register the trunks (roam/_gather.ts `init`): their spots and their blocks in the roaming group. Returns the logs. */
export function registerLogs(field: HeightField, parent: Object3D): number {
  const camp = JUNGLE_SITES.find((s) => s.kind === 'woodcutter');
  if (!camp) return 0;
  site = new Site(new VoxelBuilder(), field, camp.x, field.heightAt(camp.x, camp.z), camp.z, camp.facing, undefined, 23);
  layer ??= new GatherLayer(parent, 'gather:logs');
  placed = Object.entries(TRUNKS).map(([key, t]) => {
    const w = site!.world(t.foot[0], 0, t.foot[1], _a);
    const to = site!.world(t.toward[0], 0, t.toward[1], _b);
    const ux = (to.x - w.x) / Math.hypot(to.x - w.x, to.z - w.z);
    const uz = (to.z - w.z) / Math.hypot(to.x - w.x, to.z - w.z);
    const along = Math.atan2(ux, uz);
    const p: Placed = { id: `logs:${key}`, t, x: w.x, z: w.z, ux, uz, along, logs: [] };
    for (let n = 0; n < LOGS; n++) {
      // (the blow lands on its top where the log comes off, the log's inner end: a hand's width off its middle line, on
      // its round top; it lies with its middle `d · 0.42` over the ground)
      const u = KEEP + n * LOG;
      p.logs.push({ id: `logs:${key}:${n}`, material: 'log', x: w.x + ux * u, z: w.z + uz * u, r: 0.14, hits: HITS, pieces: 1, regrowDays: REGROW_DAYS, hitY: t.d * 0.88, along });
    }
    return p;
  });
  offer();
  registerGatherSource({
    id: 'logs',
    spots: () => spots,
    onTake: () => {
      offer();
      draw(field);
    },
    onLeft: () => {
      offer();
      draw(field);
    },
  });
  draw(field);
  return placed.length * LOGS;
}

/** Checks: the blocks drawn. */
export const logsDrawn = (): number => layer?.blocks ?? 0;
