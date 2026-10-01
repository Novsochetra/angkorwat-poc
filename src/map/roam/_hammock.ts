import { Color, Group, LinearSRGBColorSpace, Matrix4, Quaternion, Sphere, Vector3, type InstancedMesh, type Object3D } from 'three';
import { HAMMOCK_U, hammockDuration, hammockPose, hammockState } from '../../character/hammock';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_hammock';
import { SFX } from '../audio/addonSfx';
import { nearby, type Nearby } from '../greet';
import { HOMES as BACK_HOMES, hammockTies, homeToWorld } from '../hamlet/_bhSpots';
import { EV_BUILT, EV_HOMES, EV_LIFT, evStilts, evToWorld, type EvHome } from '../hamlet/_evSpots';
import { HAMMOCK_EMPTY, hutHammock } from '../hamlet/_knHut';
import { kulenSite } from '../hamlet/_knSite';
import { HAMMOCK as PS_HAMMOCK, HOME as PS_HOME } from '../hamlet/_psPlan';
import { pad } from '../pad/pad';
import { GRANDPA_HAMMOCK, hammockDef } from '../people/_sceneBackKit';
import type { MapFrame, RoamMode } from '../types';
import { t } from '../ui/lang';
import { FV_HOMES } from '../village/_fvPlan';
import { GROUND as VILLAGE_GROUND, STILT_HOMES } from '../village/_spots';
import { registerAddon, type AddonEnv, type AddonHold } from './_addons';
import { addHammock, HAMMOCK_IN_USE, hammocks, hammocksVersion, type HammockBlock, type HammockPoint, type HammockSpot } from './_hammockSpots';
import { createSnore } from './_rest';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Lying in a hammock (អង្រឹង): they hang under the stilt houses of the
 * floating village and the sugar-palm village, in the palm sugar family's
 * yard, in a picnic hut at Kulen's falls and under the old house behind
 * Angkor Wat (the grandfather's). One inside the roaming area with nobody
 * in it is his: beside it, E "Lie in the hammock". He turns his back to it,
 * sits back onto its edge (the cloth sags under him), swings his legs up and
 * lies back (character/hammock.ts); his pack goes down on the ground beside
 * it, his hat off, his light away. It sways gently; A / D (the stick sideways)
 * push it to swing more, and it slows by itself; the ropes creak at each end
 * of a swing. Lying still 10 s he dozes (his eyes close, a "Z z z" as on the
 * ground: _rest.ts). The camera comes down low beside him at his feet,
 * looking along him (the drag still turns it). E, Space or the stick forward
 * or back: he gets up (asleep, he wakes first), sits up the way he got in and
 * stands beside it, on his feet.
 *
 * The hammock he lies in is drawn by this add-on while he is in it (the
 * place's own — voxel blocks of its part, or the grandfather's rig — is
 * hidden meanwhile): the same colours and stripes, read off the blocks it
 * replaces, sagging deeper under his hips, its edges curling up round him,
 * swinging about the line of its ties. Nobody else lies down in it meanwhile
 * (`hammockTaken`, _hammockSpots.ts: the people ask), nor while he is near it
 * after.
 *
 * Checks: `hammock=1` (lying in the nearest one to `at=`), `hammock=sleep`
 * (asleep), `hammock=in` (getting in from beside it: with `sim=_:<s>`),
 * `hamswing=<radians>` (swinging that hard), `hamside=1|-1` (got in from that
 * side). The console says which hammocks it found (shots).
 */

// ── Tuning ─────────────────────────────────────────────────────────────────

/** Segments of the cloth he lies in (each its bottom and two curled edges), and its ropes (two each end: along, then down). */
const SEGS = 14;
const ROPES = 4;
/** E reaches this far past the cloth's edge (m), on the same ground as under it (± `LEVEL` m), along its middle part. */
const REACH = 1.15;
const LEVEL = 0.6;
const ALONG = 0.18;
/** Spots looked at from this near (m). */
const NEAR = 5;
/** His hips along the cloth from the head end (0‥1), and how much deeper the cloth hangs under him (m). */
const U_HIPS = 0.6;
const EXTRA = 0.17;
/** Along the way (`u`): he takes his hat off lying back past this, puts it on sitting up. */
const HAT_AT = 1.35;
/** Over the cloth's top (BU): the hips joint sitting on it, and lying in it. */
const SEAT_OVER = 1.4;
const LIE_OVER = 2.0;
/** How far along the cloth the torso and the legs lie (m): its rise under them is theirs. */
const TORSO_LEN = 0.6;
const LEGS_LEN = 0.45;
/** Standing with his back to it: his feet this far out from the cloth's edge (m); sitting: his hips this far out from the line of the ties. */
const STAND_GAP = 0.27;
const SEAT_OFF = 0.2;
/** Walking to where he sits (m/s, at the roaming size) and turning his back to it (1/s). */
const APPROACH = 2.2;
const TURN = 9;
/**
 * The swing (radians, 1/s): it slows by itself (`DAMP`), a push (A / D) adds `PUSH` a second along the way it
 * goes, up to `AMAX`; it never quite stops (`AIDLE`: a gentle sway). Getting up, his foot brakes it (`BRAKE`).
 */
const DAMP = 0.32;
const BRAKE = 3.2;
const PUSH = 1.25;
const AMAX = 0.48;
const AIDLE = 0.035;
const IDLE_DRIVE = 0.09;
/** Lying still this long (s) he dozes; his eyes close over `DOZE` (s). */
const SLEEP_AFTER = 10;
const DOZE = 2.5;
/**
 * The camera while he lies: low beside him at his feet, looking along him (`side`: radians from his feet's way
 * round to the open side), a little from above; eased in over `FRAME_FOR` s (then the drag is the player's), and
 * back to where it was as he gets up.
 */
const VIEW = { dist: 4.1, pitch: 0.17, side: 0.7, rate: 1.6, out: 2.2 };
const FRAME_FOR = 3;
/** The hammock stays his (the people keep out of it) until he is this far from it (m). */
const AWAY = 12;

// ── Hammocks: where, and how they look ─────────────────────────────────────

/** What the finder read off a hammock's blocks. */
interface Look {
  /** The cloth from `c0` to `c1` along the ties (0 at `a`, 1 at `b`). */
  c0: number;
  c1: number;
  /** Its middle line's height under the ties' line, y(s) = f0 + f1 s + f2 s² (m). */
  f0: number;
  f1: number;
  f2: number;
  /** Its stripes along it (sorted): where, colour (sRGB), width (m). */
  stripes: { s0: number; s1: number; color: number; width: number }[];
  rope: number;
  /** The ropes go along from the ties, then straight down to the cloth's ends. */
  knee: boolean;
  thick: number;
}

/** A hammock made ready: its frame (m, world: along a→b, up, across), the ground under it, its look and blocks. */
interface Prep {
  spot: HammockSpot;
  a: Vector3;
  b: Vector3;
  d: Vector3;
  up: Vector3;
  n: Vector3;
  len: number;
  mid: Vector3;
  /** The ground (or the deck) under its middle (m). */
  ground: number;
  inside: boolean;
  /** Read yet; what it looks like (null: not found, not offered); its blocks to hide while he lies in it. */
  tried: boolean;
  /** Not found yet (its part still building what is near): looked for again after this (performance.now, ms). */
  retry: number;
  look: Look | null;
  blocks: { mesh: InstancedMesh; i: number }[];
  saved: Float32Array | null;
}

let env: AddonEnv | null = null;
let preps: Prep[] = [];
let prepsAt = -1;
let builtins = false;

/** The map's own hammocks (once, at init): each place's from its plan, as it builds them. */
function addBuiltins(e: AddonEnv): void {
  if (builtins) return;
  builtins = true;
  const field = e.world.field;
  const has = (name: string) => e.parts.some((p) => p.name === name);
  // The floating village's stilt houses (village/_houses.ts `stiltHouse`): in the shade under the veranda's front,
  // between the 2nd and 3rd stilts of the front row, about 1.3 m up (no ropes: the cloth to the posts).
  for (const h of STILT_HOMES) {
    if (h.shop || h.seed % 3 !== 0 || h.floor - VILLAGE_GROUND <= 3) continue;
    const W = h.w;
    const zb = -(h.d + h.v) / 2;
    const zf = (h.d + h.v) / 2;
    const nx = Math.max(2, Math.ceil(W / 2.4) + 1);
    const x0 = -W / 2 + 0.2 + (W - 0.4) / (nx - 1);
    const x1 = -W / 2 + 0.2 + (2 * (W - 0.4)) / (nx - 1);
    const z = zb + 0.2 + (zf - zb - 0.4);
    const at = (lx: number): HammockPoint => {
      const [x, wz] = homeToWorld(h, lx, z);
      return [x, VILLAGE_GROUND + 1.35, wz];
    };
    addHammock({ id: `village-${h.id}`, a: at(x0), b: at(x1), part: 'village', ready: () => has('village') });
  }
  // The Khmer houses of the sugar-palm village and the floating village's north street (hamlet/_evHouse.ts): across
  // the front of the bay under the floor, the ropes along from the stilts then down to the cloth.
  const evHammock = (h: EvHome, part: string, ready: () => boolean) => {
    if (!h.under.includes('hammock')) return;
    const F = field.heightAt(h.x, h.z) + EV_LIFT;
    const { xs, zs } = evStilts(h);
    const i = h.stairX > 0 ? 0 : xs.length - 2;
    const z = zs[zs.length - 1];
    const at = (lx: number): HammockPoint => {
      const [x, wz] = evToWorld(h, lx, z);
      return [x, F - 0.75, wz];
    };
    addHammock({ id: `${part === 'village' ? 'village' : 'east'}-${h.id}`, a: at(xs[i] + 0.16), b: at(xs[i + 1] - 0.16), part, ready });
  };
  for (const h of EV_HOMES) evHammock(h, 'hamlet', () => has('hamlet') && EV_BUILT.has(h.id));
  for (const h of FV_HOMES) evHammock(h, 'village', () => has('village'));
  // The palm sugar family's, under their house (hamlet/_psHome.ts): along z between the middle stilt and the south one.
  {
    const y = field.heightAt(PS_HOME.x, PS_HOME.z) + 1.45;
    const x = PS_HOME.x + PS_HAMMOCK.x;
    addHammock({ id: 'palm-sugar', a: [x, y, PS_HOME.z + PS_HAMMOCK.z0 + 0.1], b: [x, y, PS_HOME.z + PS_HAMMOCK.z1 - 0.1], part: 'hamlet', ready: () => has('hamlet') });
  }
  // The empty one in a picnic hut at Kulen's falls (hamlet/_knHut.ts), between its back posts.
  {
    const hut = kulenSite(field).huts[HAMMOCK_EMPTY];
    if (hut) {
      const hm = hutHammock(hut);
      addHammock({ id: 'kulen-hut', a: hm.a, b: hm.b, part: 'hamlet', ready: () => has('hamlet') });
    }
  }
  // The grandfather's under the old house behind Angkor Wat: the people's rig (people/_sceneBackFolk.ts), which hides
  // itself while he lies in it (`hammockHidden`).
  {
    const h = BACK_HOMES.find((x) => x.under === 'hammock');
    if (h) {
      const tie = hammockTies(h);
      const [ax, az] = homeToWorld(h, tie.a[0], tie.a[1]);
      const [bx, bz] = homeToWorld(h, tie.b[0], tie.b[1]);
      const y = field.heightAt((ax + bx) / 2, (az + bz) / 2) + tie.up;
      addHammock({ id: 'back-hamlet', a: [ax, y, az], b: [bx, y, bz], blocks: rigBlocks(ax, y, az, bx, bz), ready: () => has('people') && has('hamlet') });
    }
  }
}

/** The grandfather's hammock rig's boxes on the map, as the finder reads blocks (people/_sceneBackKit.ts `hammockDef`, placed as _sceneBackFolk.ts does). */
function rigBlocks(ax: number, y: number, az: number, bx: number, bz: number): HammockBlock[] {
  const half = Math.hypot(bx - ax, bz - az) / 2;
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const g = GRANDPA_HAMMOCK;
  const { def } = hammockDef(half - g.inset, g.sag, g.cloth, g.stripe);
  return def.boxes.map((box) => {
    const tilt = box.rot?.[2] ?? 0;
    const [lx, ly, lz] = box.c;
    const [sx, sy, sz] = box.s;
    return {
      c: [mx + lx * c + lz * s, y + ly, mz - lx * s + lz * c] as HammockPoint,
      along: sx * Math.abs(Math.cos(tilt)) + sy * Math.abs(Math.sin(tilt)),
      across: sz,
      up: sx * Math.abs(Math.sin(tilt)) + sy * Math.abs(Math.cos(tilt)),
      color: box.color,
    };
  });
}

/** The list made ready to look at (frames; the reading of the blocks waits until he first comes near). */
function syncPreps(e: AddonEnv): void {
  if (prepsAt === hammocksVersion()) return;
  prepsAt = hammocksVersion();
  const old = new Map(preps.map((p) => [p.spot.id, p]));
  preps = hammocks().map((spot) => {
    const was = old.get(spot.id);
    if (was && was.spot === spot) return was;
    const a = new Vector3(...spot.a);
    const b = new Vector3(...spot.b);
    const d = new Vector3().subVectors(b, a);
    const len = Math.max(0.5, d.length());
    d.divideScalar(len);
    const up = new Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize();
    const n = new Vector3().crossVectors(d, up).normalize();
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
    // (the ground or deck under it: what is solid below its middle, under where its cloth hangs)
    const w = e.world;
    const g = w.standAt ? w.standAt(mid.x, mid.z, mid.y - 0.5, 0.05, 0) : NaN;
    const ground = Number.isFinite(g) ? g : w.field.heightAt(mid.x, mid.z);
    return { spot, a, b, d, up, n, len, mid, ground, inside: w.inBounds(mid.x, mid.z), tried: false, retry: 0, look: null, blocks: [], saved: null };
  });
}

// ── Reading a hammock's blocks ──────────────────────────────────────────────

const _m = new Matrix4();
const _c = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _v = new Vector3();
const _sph = new Sphere();
const _col = new Color();

interface Read extends HammockBlock {
  s: number;
  y: number;
  w: number;
  mesh: InstancedMesh | null;
  i: number;
}

/** Find the blocks that draw it (its part's `petal` blocks between the ties: the cloth and the ropes), and its look. */
function readSpot(e: AddonEnv, p: Prep): void {
  if (p.tried && (p.look || performance.now() < p.retry)) return;
  p.tried = true;
  p.retry = performance.now() + 3000;
  const spot = p.spot;
  const found: Read[] = [];
  const add = (c: Vector3, along: number, across: number, up: number, color: number, mesh: InstancedMesh | null, i: number) => {
    _v.subVectors(c, p.a);
    const s = _v.dot(p.d) / p.len;
    const y = _v.dot(p.up);
    const w = _v.dot(p.n);
    // (between the ties, not the knots on the posts; over the ground; not a post, not a beam)
    if (s < 0.02 || s > 0.98 || Math.abs(w) > 0.6 || y > 0.12 || c.y < p.ground + 0.25) return;
    found.push({ c: [c.x, c.y, c.z], along, across, up, color, s, y, w, mesh, i });
  };
  if (spot.blocks) for (const b of spot.blocks) add(_c.set(...b.c), b.along, b.across, b.up, b.color, null, -1);
  else {
    const root: Object3D | undefined = spot.root ?? e.parts.find((q) => q.name === spot.part)?.object;
    if (!root) return;
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      const m = o as InstancedMesh;
      // (all its blocks, also those it does not draw now: the palm sugar yard draws its small ones only near)
      const n = m.isInstancedMesh ? m.instanceMatrix.count : 0;
      if (!n || m.name.slice(m.name.lastIndexOf(':') + 1) !== 'petal') return;
      if (m.boundingSphere && _sph.copy(m.boundingSphere).applyMatrix4(m.matrixWorld).distanceToPoint(p.mid) > p.len) return;
      const e16 = m.instanceMatrix.array as Float32Array;
      const col = m.instanceColor?.array as Float32Array | undefined;
      for (let i = 0; i < n; i++) {
        _m.fromArray(e16, i * 16).premultiply(m.matrixWorld);
        const me = _m.elements;
        _x.set(me[0], me[1], me[2]);
        _y.set(me[4], me[5], me[6]);
        _z.set(me[8], me[9], me[10]);
        const big = Math.max(_x.length(), _y.length(), _z.length());
        if (big < 1e-4 || big > 1.3) continue;
        _c.set(me[12], me[13], me[14]);
        const ext = (v: Vector3) => Math.abs(_x.dot(v)) + Math.abs(_y.dot(v)) + Math.abs(_z.dot(v));
        const color = col ? _col.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2], LinearSRGBColorSpace).getHex() : 0xd8d0c0;
        add(_c, ext(p.d), ext(p.n), ext(p.up), color, m, i);
      }
    });
  }
  // The cloth (wide), its ropes (thin, along its middle line) and its curled edges (thin, off the middle).
  let cloth = found.filter((r) => r.across >= 0.22);
  if (cloth.length < 3) {
    if (e.shot || import.meta.env.DEV) console.warn(`[map] hammock "${spot.id}": its cloth was not found (${found.length} blocks near), not offered (looked for again in 3 s)`);
    return;
  }
  // Its middle line: a parabola through the cloth's blocks (twice: what lies far off it is something else).
  let fit = parabola(cloth);
  cloth = cloth.filter((r) => Math.abs(r.y - (fit[0] + fit[1] * r.s + fit[2] * r.s * r.s)) < 0.2);
  if (cloth.length < 3) return;
  fit = parabola(cloth);
  const ropes = found.filter((r) => r.across < 0.15 && Math.abs(r.w) < 0.1);
  const edges = found.filter((r) => r.across < 0.15 && Math.abs(r.w) >= 0.1 && Math.abs(r.w) < 0.5);
  cloth.sort((q, r) => q.s - r.s);
  const stripes = cloth.map((r) => ({ s0: r.s - r.along / 2 / p.len, s1: r.s + r.along / 2 / p.len, color: r.color, width: r.across }));
  const thick = Math.min(0.09, Math.max(0.045, cloth.map((r) => r.up).sort((q, r) => q - r)[cloth.length >> 1] * 0.9));
  // (the rope's colour: the most of them)
  const count = new Map<number, number>();
  for (const r of ropes) count.set(r.color, (count.get(r.color) ?? 0) + 1);
  let rope = 0xd8d0c0;
  let most = 0;
  for (const [c, n] of count)
    if (n > most) {
      most = n;
      rope = c;
    }
  p.look = {
    c0: stripes[0].s0,
    c1: stripes[stripes.length - 1].s1,
    f0: fit[0],
    f1: fit[1],
    f2: fit[2],
    stripes,
    rope,
    knee: ropes.some((r) => r.up > 0.3 && r.along < 0.12),
    thick,
  };
  p.blocks = [...cloth, ...ropes, ...edges].filter((r) => r.mesh).map((r) => ({ mesh: r.mesh!, i: r.i }));
  if (e.shot) console.info(`[map] hammock "${spot.id}": ${cloth.length} cloth, ${ropes.length} rope, ${edges.length} edge blocks; ${p.len.toFixed(2)} m between its ties, cloth ${p.look.c0.toFixed(2)}‥${p.look.c1.toFixed(2)}${p.look.knee ? ', ropes along then down' : ''}`);
}

/** Least squares y = f0 + f1 s + f2 s² through the blocks' middles. */
function parabola(rs: readonly Read[]): [number, number, number] {
  // (normal equations, 3 × 3)
  let n = 0;
  let s1 = 0;
  let s2 = 0;
  let s3 = 0;
  let s4 = 0;
  let y0 = 0;
  let y1 = 0;
  let y2 = 0;
  for (const r of rs) {
    const s = r.s;
    n++;
    s1 += s;
    s2 += s * s;
    s3 += s * s * s;
    s4 += s * s * s * s;
    y0 += r.y;
    y1 += r.y * s;
    y2 += r.y * s * s;
  }
  const det = (a: number[]) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const A = [n, s1, s2, s1, s2, s3, s2, s3, s4];
  const D = det(A);
  if (Math.abs(D) < 1e-12) return [y0 / Math.max(1, n), 0, 0];
  const col = (k: number, v: number[]) => A.map((x, i) => (i % 3 === k ? v[(i / 3) | 0] : x));
  const v = [y0, y1, y2];
  return [det(col(0, v)) / D, det(col(1, v)) / D, det(col(2, v)) / D];
}

/** Hide the place's own blocks of it (keeping their matrices), or put them back. */
function hideBlocks(p: Prep, hide: boolean): void {
  if (!p.blocks.length) return;
  if (hide && !p.saved) {
    p.saved = new Float32Array(p.blocks.length * 16);
    p.blocks.forEach(({ mesh, i }, k) => {
      const a = mesh.instanceMatrix.array as Float32Array;
      p.saved!.set(a.subarray(i * 16, i * 16 + 16), k * 16);
      a.fill(0, i * 16, i * 16 + 16);
      mesh.instanceMatrix.addUpdateRange(i * 16, 16);
      mesh.instanceMatrix.needsUpdate = true;
    });
  } else if (!hide && p.saved) {
    const saved = p.saved;
    p.blocks.forEach(({ mesh, i }, k) => {
      const a = mesh.instanceMatrix.array as Float32Array;
      // (only where it is still as we left it: a part rebuilt meanwhile has its own)
      if (a[i * 16] !== 0 || a[i * 16 + 5] !== 0) return;
      a.set(saved.subarray(k * 16, k * 16 + 16), i * 16);
      mesh.instanceMatrix.addUpdateRange(i * 16, 16);
      mesh.instanceMatrix.needsUpdate = true;
    });
    p.saved = null;
  }
}

// ── Lying in one ───────────────────────────────────────────────────────────

/** He is in a hammock (or getting in or out). */
interface Session {
  p: Prep;
  look: Look;
  /** His feet toward `b` (1) or `a` (−1); he came from the side `n` points to (1) or the other (−1); the camera's side. */
  dir: 1 | -1;
  side: 1 | -1;
  camSide: 1 | -1;
  /** Along the ties (0 at a): the cloth's middle (where he sits), his hips lying. */
  sMid: number;
  sHips: number;
  /** Where he stands with his back to it, sits (his hips over), lies (his hips over): feet's spots (m, world). */
  stand: Vector3;
  seat: Vector3;
  lie: Vector3;
  /** Facing out from it (sitting) and along it to his feet (lying). */
  yawOut: number;
  yawLie: number;
  /** Walking to `stand` and turning his back to it (before he sits). */
  walking: boolean;
  /** Along the way (0 standing ‥ 2 lying), the move under way. */
  u: number;
  from: number;
  to: number;
  k: number;
  len: number;
  /** The swing about the ties' line (radians, + = out to his left lying), its rate; he wants up (braking first). */
  roll: number;
  rate: number;
  rising: boolean;
  /** Lying still (s), how asleep (0‥1, eased), asleep; waking to get up (s left). */
  still: number;
  sleep: number;
  asleep: boolean;
  wakeUp: number;
  /** The stick has been let go since E (held on from walking up, it does not get him straight out again). */
  stickFree: boolean;
  /** The ground where his pack goes down (m), found once. */
  packGround: number;
  /** He took his hat off to lie back. */
  hatTaken: boolean;
  /** The camera as it was, and how long it has been framed for him lying (s). */
  before: { pitch: number; distance: number };
  framed: number;
  /** His hammock drawn (the place's hidden), its mesh, and the cloth's state last drawn. */
  shown: boolean;
  holder: Group;
  mesh: InstancedMesh | null;
  meshGroup: Object3D | null;
  drawnLoad: number;
  drawnHips: number;
  push: number;
  /** For sounds: where `u` was last step, the swing's direction. */
  lastU: number;
  lastDir: number;
  /** Seconds in it. */
  time: number;
}

let session: Session | null = null;
/** After he got up: the camera easing back, and the hammock his until he is `AWAY` from it. */
let after: { x: number; z: number; pitch: number; distance: number; easing: boolean } | null = null;
/** The spot E would use now (offer → use). */
let offered: { p: Prep; side: 1 | -1 } | null = null;
const st = hammockState();
const posture = (time: number) => {
  st.t = time;
  return hammockPose(st);
};
let snore: { show(on: boolean): void; place(x: number, y: number): void } | null = null;
const finder: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };

const smooth = (v: number) => {
  const c = Math.min(1, Math.max(0, v));
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** The cloth's middle line under the ties (m, the frame's y) at `s` (0 at a), with him in it (`load` 0‥1, his weight at `hips`). */
function clothY(look: Look, s: number, load: number, hips: number): number {
  const y = look.f0 + look.f1 * s + look.f2 * s * s;
  if (load <= 0) return y;
  const u = (s - look.c0) / (look.c1 - look.c0);
  const h = Math.min(0.85, Math.max(0.15, (hips - look.c0) / (look.c1 - look.c0)));
  const k = u <= 0 || u >= 1 ? 0 : u <= h ? 1 - ((h - u) / h) ** 2 : 1 - ((u - h) / (1 - h)) ** 2;
  return y - load * EXTRA * k;
}

/** How much he weighs on it (0 standing, 0.6 sitting, 1 lying), and where (`hips`, along the ties) along the way `u`. */
const loadAt = (u: number) => (u <= 1 ? 0.6 * smooth((u - 0.45) / 0.55) : 0.6 + 0.4 * smooth((u - 1) / 0.8));
const hipsAt = (s: Session, u: number) => mix(s.sMid, s.sHips, smooth(u - 1));

/** A point of the hammock's frame (m, world): `s` along (0 at a), `y` up from the ties' line, `w` across (to `n`). */
function framePoint(p: Prep, s: number, y: number, w: number, out: Vector3): Vector3 {
  return out.copy(p.a).addScaledVector(p.d, s * p.len).addScaledVector(p.up, y).addScaledVector(p.n, w);
}

/** What is solid under (x, z) near height `y` (m), else `y`. */
function groundNear(e: AddonEnv, x: number, z: number, y: number): number {
  const w = e.world;
  const g = w.standAt ? w.standAt(x, z, y + 0.5, 1.0, 0) : w.field.heightAt(x, z);
  return Number.isFinite(g) && Math.abs(g - y) < 1.2 ? g : y;
}

/** The hammock (made ready) E would put him in here, and the side he is on; or null. */
function inReach(e: AddonEnv, ctx: RoamCtx): { p: Prep; side: 1 | -1 } | null {
  syncPreps(e);
  const pos = ctx.body.pos;
  let best: { p: Prep; side: 1 | -1 } | null = null;
  let bd = Infinity;
  for (const p of preps) {
    const dx = pos.x - p.mid.x;
    const dz = pos.z - p.mid.z;
    if (dx * dx + dz * dz > NEAR * NEAR || !p.inside || Math.abs(pos.y - p.ground) > LEVEL) continue;
    if (p.spot.ready && !p.spot.ready()) continue;
    readSpot(e, p);
    const look = p.look;
    if (!look) continue;
    _v.subVectors(pos, p.a);
    const s = _v.dot(p.d) / p.len;
    const w = _v.dot(p.n);
    const span = look.c1 - look.c0;
    const width = look.stripes[look.stripes.length >> 1].width;
    if (s < look.c0 + ALONG * span || s > look.c1 - ALONG * span || Math.abs(w) > width / 2 + REACH) continue;
    const d = Math.abs(w) + Math.abs(s - (look.c0 + look.c1) / 2) * p.len * 0.5;
    if (d >= bd) continue;
    // Somebody in it (or right by it)? (asked 0.3 m off its middle and 2 m under it: the finder then leaves out
    // whoever is exactly there and the people on the floor over it, greet.ts `nearby`)
    const low = p.a.y + clothY(look, (look.c0 + look.c1) / 2, 0, 0.5);
    framePoint(p, (look.c0 + look.c1) / 2, 0, 0.3, _c);
    if (nearby(_c.x, low - 2, _c.z, 0, 1.25, Math.PI, finder)) continue;
    bd = d;
    best = { p, side: w >= 0 ? 1 : -1 };
  }
  return best;
}

/**
 * The view of him lying (`dir`: his feet toward b (1) or a (−1); `camSide`: the camera on the side `n` points to
 * (1) or the other): of the four, the one whose camera spot is most open — the way to him clear of what the camera
 * cannot see through, open sky over it (not under the house's floor) —, the end the camera is at now and the side
 * he came from winning a tie.
 */
function bestView(e: AddonEnv, p: Prep, side: 1 | -1): { dir: 1 | -1; camSide: 1 | -1 } {
  const look = p.look!;
  const cam = e.cam.camera.position;
  const near: 1 | -1 = (cam.x - p.mid.x) * p.d.x + (cam.z - p.mid.z) * p.d.z >= 0 ? 1 : -1;
  const w = e.world;
  let best = { dir: near, camSide: side, score: -Infinity };
  for (const dir of [near, -near as 1 | -1])
    for (const cs of [side, -side as 1 | -1]) {
      const sh = dir > 0 ? look.c0 + (look.c1 - look.c0) * U_HIPS : look.c1 - (look.c1 - look.c0) * U_HIPS;
      const f = framePoint(p, sh, clothY(look, sh, 1, sh) + 0.6, 0, _c);
      const vx = p.d.x * dir * Math.cos(VIEW.side) + p.n.x * cs * Math.sin(VIEW.side);
      const vz = p.d.z * dir * Math.cos(VIEW.side) + p.n.z * cs * Math.sin(VIEW.side);
      const cx = f.x + vx * VIEW.dist;
      const cy = f.y + Math.sin(VIEW.pitch) * VIEW.dist;
      const cz = f.z + vz * VIEW.dist;
      const free = w.hardClearance?.(f.x, f.y, f.z, cx, cy, cz) ?? 1;
      const sky = (w.ceilingAt?.(cx, cz, cy) ?? Infinity) - cy > 3 ? 1 : 0;
      const score = free + 0.6 * sky + (dir === near ? 0.04 : 0) + (cs === side ? 0.02 : 0);
      if (score > best.score) best = { dir, camSide: cs, score };
    }
  return best;
}

/** Can he stand beside it on that side, his back to it (as `begin` puts him), on the same ground as under it? */
function standable(e: AddonEnv, p: Prep, side: 1 | -1): boolean {
  const look = p.look!;
  const w = look.stripes[look.stripes.length >> 1].width;
  framePoint(p, (look.c0 + look.c1) / 2, 0, side * (w / 2 + STAND_GAP * (e.body.scale / 1.4)), _x);
  const g = e.world.standAt ? e.world.standAt(_x.x, _x.z, p.ground + 0.3, 0.4, 1.7 * e.body.scale * 0.95) : e.world.groundAt(_x.x, _x.z);
  return Number.isFinite(g) && Math.abs(g - p.ground) < 0.15;
}

/** Start: walk to beside it, turn his back to it, sit, lie. `lying`: already lying (a URL's), `side` forced. */
function begin(e: AddonEnv, ctx: RoamCtx, p: Prep, side: 1 | -1, lying = false): void {
  const look = p.look!;
  const body = ctx.body;
  // (no room to stand on his side — off a hut's deck, against a post —: from the other)
  if (!standable(e, p, side) && standable(e, p, -side as 1 | -1)) side = -side as 1 | -1;
  // Which end his feet go to, and the camera's side (it comes down at his feet, looking along him): the most open
  // view (nothing solid in the way, no floor low over it), else the end the camera is at now and the side he is on.
  const { dir, camSide } = bestView(e, p, side);
  const sMid = (look.c0 + look.c1) / 2;
  const sHips = dir > 0 ? look.c0 + (look.c1 - look.c0) * U_HIPS : look.c1 - (look.c1 - look.c0) * U_HIPS;
  const width = look.stripes[look.stripes.length >> 1].width;
  // (he stands where he is level with, not up on the posts' footings: the ground under the hammock's middle)
  const g0 = p.ground;
  const stand = framePoint(p, sMid, 0, side * (width / 2 + STAND_GAP * (body.scale / 1.4)), new Vector3());
  stand.y = groundNear(e, stand.x, stand.z, g0);
  const seat = framePoint(p, sMid, 0, side * SEAT_OFF, new Vector3());
  seat.y = groundNear(e, seat.x, seat.z, g0);
  const lie = framePoint(p, sHips, 0, 0, new Vector3());
  lie.y = groundNear(e, lie.x, lie.z, g0);
  const yawOut = Math.atan2(p.n.x * side, p.n.z * side);
  const yawLie = Math.atan2(p.d.x * dir, p.d.z * dir);
  const holder = new Group();
  holder.name = 'roam:hammock';
  holder.visible = false;
  e.scene.add(holder);
  const s: Session = {
    p,
    look,
    dir,
    side,
    camSide,
    sMid,
    sHips,
    stand,
    seat,
    lie,
    yawOut,
    yawLie,
    walking: !lying,
    u: lying ? HAMMOCK_U.lie : 0,
    from: lying ? HAMMOCK_U.lie : 0,
    to: lying ? HAMMOCK_U.lie : 0,
    k: 1,
    len: 0,
    roll: 0,
    rate: 0,
    rising: false,
    still: 0,
    sleep: 0,
    asleep: false,
    wakeUp: -1,
    stickFree: false,
    packGround: NaN,
    hatTaken: false,
    before: { pitch: e.cam.pitch, distance: e.cam.distance },
    framed: 0,
    shown: false,
    holder,
    mesh: null,
    meshGroup: null,
    drawnLoad: -1,
    drawnHips: -1,
    push: 0,
    lastU: lying ? HAMMOCK_U.lie : 0,
    lastDir: 0,
    time: 0,
  };
  session = s;
  after = null;
  HAMMOCK_IN_USE.id = p.spot.id;
  HAMMOCK_IN_USE.x = p.mid.x;
  HAMMOCK_IN_USE.z = p.mid.z;
  HAMMOCK_IN_USE.hide = false;
  body.vel.set(0, 0, 0);
  if (lying) {
    // (straight in: lying, his hat off, his pack down, the hammock his)
    body.pos.copy(lie);
    body.yaw = yawLie;
    startPosture(e, s);
    setShown(s, true);
    hat(e, s, false);
  }
}

/** The posture on (from standing where he is). */
function startPosture(e: AddonEnv, s: Session): void {
  const ex = e.explorer;
  ex.animator.posture = posture;
  ex.animator.postureFeet = false;
  s.walking = false;
  fillState(e, s);
}

/** Go along the way to `target` (0 standing, 1 sitting, 2 lying). */
function go(s: Session, target: number): void {
  if (target === s.to && s.k < 1) return;
  s.from = s.u;
  s.to = target;
  s.k = 0;
  s.len = Math.max(0.2, hammockDuration(s.from, s.to));
}

/** His hammock drawn (the place's hidden), or the place's back. */
function setShown(s: Session, on: boolean): void {
  if (on === s.shown) return;
  s.shown = on;
  if (on && !s.mesh) buildMesh(s);
  s.holder.visible = on;
  hideBlocks(s.p, on);
  HAMMOCK_IN_USE.hide = on;
  if (on) drawMesh(s, true);
}

/** The hat off to lie back (its brim), on again getting up (unless the player put it back on meanwhile). */
function hat(e: AddonEnv, s: Session, on: boolean): void {
  const ex = e.explorer;
  if (!on && ex.currentOutfit.hat) {
    ex.setOutfit({ hat: false });
    e.photo.refreshBody();
    s.hatTaken = true;
  } else if (on && s.hatTaken) {
    s.hatTaken = false;
    if (!ex.currentOutfit.hat) {
      ex.setOutfit({ hat: true });
      e.photo.refreshBody();
    }
  }
}

/** Out at once (a new mode, back to the map): everything as it was, quietly. `soft`: he got up (the camera eases back). */
function end(e: AddonEnv, soft: boolean): void {
  const s = session;
  if (!s) return;
  session = null;
  const ex = e.explorer;
  ex.animator.posture = null;
  ex.animator.postureFeet = true;
  ex.asleep = false;
  snore?.show(false);
  hat(e, s, true);
  setShown(s, false);
  if (s.meshGroup) disposeVoxelMesh(s.meshGroup as Group);
  s.holder.removeFromParent();
  const body = e.body;
  body.vel.set(0, 0, 0);
  body.grounded = true;
  if (!soft) {
    body.pos.copy(s.stand);
    e.cam.pitch = s.before.pitch;
    e.cam.distance = s.before.distance;
    HAMMOCK_IN_USE.id = null;
    HAMMOCK_IN_USE.hide = false;
    after = null;
  } else after = { x: s.p.mid.x, z: s.p.mid.z, pitch: s.before.pitch, distance: s.before.distance, easing: true };
}

// ── His hammock, drawn ─────────────────────────────────────────────────────

const _mA = new Matrix4();
const _mB = new Matrix4();
const _mS = new Matrix4();
const _q = new Quaternion();
const _qF = new Quaternion();
const _basis = new Matrix4();
const _p0 = new Vector3();
const _one = new Vector3();

/** The stripe (colour, width) at `s` along the ties. */
function stripeAt(look: Look, s: number): { color: number; width: number } {
  let best = look.stripes[0];
  let bd = Infinity;
  for (const r of look.stripes) {
    const d = s < r.s0 ? r.s0 - s : s > r.s1 ? s - r.s1 : 0;
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** Its blocks (the cloth's segments, each a bottom and two edges, and the ropes) in its colours; placed by `drawMesh`. */
function buildMesh(s: Session): void {
  const look = s.look;
  const vb = new VoxelBuilder();
  for (let j = 0; j < SEGS; j++) {
    const c = stripeAt(look, look.c0 + ((look.c1 - look.c0) * (j + 0.5)) / SEGS).color;
    for (let q = 0; q < 3; q++) vb.box(0, 0, 0, 1, 1, 1, c, 'petal');
  }
  for (let r = 0; r < ROPES; r++) vb.box(0, 0, 0, 1, 1, 1, look.rope, 'petal');
  const g = buildVoxelMesh(vb, { quality: 'medium', name: 'roam:hammock' });
  g.traverse((o) => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh) return;
    s.mesh = m;
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.noWalk = true;
  });
  s.meshGroup = g;
  s.holder.add(g);
}

/** Put a box (unit, scaled) at `m` into slot `i`. */
function put(a: Float32Array, i: number, m: Matrix4): void {
  m.toArray(a, i * 16);
}

/** Its blocks for the cloth as it hangs now (`load`, `hips`), and the swing (the holder's turn). */
function drawMesh(s: Session, force = false): void {
  const p = s.p;
  const look = s.look;
  const mesh = s.mesh;
  // The holder: at the tie `a`, along a→b, turned about that line by the swing.
  _basis.makeBasis(p.d, p.up, p.n);
  _qF.setFromRotationMatrix(_basis);
  s.holder.position.copy(p.a);
  s.holder.quaternion.setFromAxisAngle(p.d, s.dir * s.roll).multiply(_qF);
  if (!mesh) return;
  const load = loadAt(s.u);
  const hips = hipsAt(s, s.u);
  if (!force && Math.abs(load - s.drawnLoad) < 1e-4 && Math.abs(hips - s.drawnHips) < 1e-4) return;
  s.drawnLoad = load;
  s.drawnHips = hips;
  const a = mesh.instanceMatrix.array as Float32Array;
  const L = p.len;
  const span = look.c1 - look.c0;
  const th = look.thick;
  for (let j = 0; j < SEGS; j++) {
    const u = (j + 0.5) / SEGS;
    const sj = look.c0 + span * u;
    const ds = span / SEGS;
    const y = clothY(look, sj, load, hips);
    const slope = Math.atan2(clothY(look, sj + ds / 2, load, hips) - clothY(look, sj - ds / 2, load, hips), ds * L);
    const seg = (ds * L) / Math.cos(slope) + 0.015;
    const W = Math.max(0.3, stripeAt(look, sj).width);
    // (its edges curl up round him: most in the middle, gathered at the ends)
    const curl = load * Math.sqrt(Math.sin(Math.PI * u));
    const wb = W * (1 - 0.38 * curl);
    const wf = W * 0.36 * curl;
    const ang = 0.25 + 0.95 * curl;
    // Bottom: T(x, y) · Rz(slope) · S.
    _mA.compose(_p0.set(sj * L, y, 0), _q.setFromAxisAngle(Z, slope), _one.set(seg, th, wb));
    put(a, j * 3, _mA);
    for (let side = 1; side >= -1; side -= 2) {
      _mA.compose(_p0.set(sj * L, y, 0), _q.setFromAxisAngle(Z, slope), _one.set(1, 1, 1));
      _mB.compose(_p0.set(0, Math.sin(ang) * wf * 0.5, side * (wb / 2 + Math.cos(ang) * wf * 0.5)), _q.setFromAxisAngle(X, -side * ang), _one.set(seg, th, Math.max(1e-4, wf)));
      if (wf < 1e-3) _mB.makeScale(0, 0, 0);
      put(a, j * 3 + (side > 0 ? 1 : 2), _mA.multiply(_mB));
    }
  }
  // Ropes: from each tie to the cloth's end (along, then down when it hangs so).
  for (let e = 0; e < 2; e++) {
    const tie = e;
    const c = e ? look.c1 : look.c0;
    const ex = c * L;
    const ey = clothY(look, c, load, hips);
    const tx = tie * L;
    const gone = Math.abs(ex - tx) < 0.06;
    if (look.knee && !gone) {
      rope(a, SEGS * 3 + e * 2, tx, 0, ex, 0);
      rope(a, SEGS * 3 + e * 2 + 1, ex, 0, ex, ey);
    } else {
      if (gone) put(a, SEGS * 3 + e * 2, _mS.makeScale(0, 0, 0));
      else rope(a, SEGS * 3 + e * 2, tx, 0, ex, ey);
      put(a, SEGS * 3 + e * 2 + 1, _mS.makeScale(0, 0, 0));
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

/** A rope box from (x0, y0) to (x1, y1) in the holder's plane. */
function rope(a: Float32Array, i: number, x0: number, y0: number, x1: number, y1: number): void {
  const l = Math.hypot(x1 - x0, y1 - y0);
  _mS.compose(_p0.set((x0 + x1) / 2, (y0 + y1) / 2, 0), _q.setFromAxisAngle(Z, Math.atan2(y1 - y0, x1 - x0)), _one.set(l + 0.03, 0.045, 0.045));
  put(a, i, _mS);
}

// ── Each step ──────────────────────────────────────────────────────────────

/** The posture's numbers for where he is now (his space: BU from his feet's spot, facing `body.yaw`). */
function fillState(e: AddonEnv, s: Session): void {
  const body = e.body;
  const p = s.p;
  const look = s.look;
  const k = BODY_UNIT_M * body.scale;
  const base = body.pos.y;
  // (the ties' line over his hips and over the middle)
  const tieHips = p.a.y + p.d.y * s.sHips * p.len;
  const tieMid = p.a.y + p.d.y * s.sMid * p.len;
  st.u = s.u;
  st.sleep = s.sleep;
  st.seatY = (tieMid + clothY(look, s.sMid, 0.6, s.sMid) + look.thick / 2 - base) / k + SEAT_OVER;
  st.lieY = (tieHips + clothY(look, s.sHips, 1, s.sHips) + look.thick / 2 - base) / k + LIE_OVER;
  const y0 = clothY(look, s.sHips, 1, s.sHips);
  const sT = s.sHips - (s.dir * TORSO_LEN) / p.len;
  const sL = s.sHips + (s.dir * LEGS_LEN) / p.len;
  st.torso = Math.min(0.85, Math.max(0.12, Math.atan2(clothY(look, sT, 1, s.sHips) - y0, TORSO_LEN)));
  st.legs = Math.min(0.9, Math.max(0.05, Math.atan2(clothY(look, sL, 1, s.sHips) - y0, LEGS_LEN)));
  st.axisY = (tieHips - base) / k;
  st.roll = s.roll;
  st.push = s.push;
  // (his feet where he stood while he sits; then they come up with him)
  const fd = s.u <= 1 ? Math.hypot(s.stand.x - body.pos.x, s.stand.z - body.pos.z) : Math.hypot(s.stand.x - s.seat.x, s.stand.z - s.seat.z);
  st.feetZ = fd / k;
  // His pack: on the ground beside the hammock on the side he came from, under his chest, its straps to it.
  const o = e.explorer.currentOutfit;
  st.pack = o.pack;
  // (toward the head end, under his shoulders: out of the way of the view along him from his feet)
  framePoint(p, s.sHips - (s.dir * 0.55) / p.len, 0, s.side * (stripeAt(look, s.sHips).width / 2 + 0.32), _c);
  if (Number.isNaN(s.packGround)) s.packGround = groundNear(e, _c.x, _c.z, p.ground);
  const gy = s.packGround;
  const dx = _c.x - body.pos.x;
  const dz = _c.z - body.pos.z;
  const cy = Math.cos(body.yaw);
  const sy = Math.sin(body.yaw);
  st.packX = (dx * cy - dz * sy) / k;
  st.packZ = (dx * sy + dz * cy) / k;
  st.packY = (gy - base) / k;
  const vx = -p.n.x * s.side;
  const vz = -p.n.z * s.side;
  st.packYaw = Math.atan2(vx * cy - vz * sy, vx * sy + vz * cy);
}

/** The swing's ω² (1/s²): a pendulum from the ties' line down to his middle, a little over the cloth under him. */
function swingW2(s: Session): number {
  return 9.8 / Math.max(0.5, -clothY(s.look, s.sHips, 1, s.sHips) - 0.2);
}

/** The swing for a step: it slows, his pushes add, it never quite stops; getting up, his foot brakes it. */
function swing(e: AddonEnv, s: Session, dt: number, push: number): void {
  const w2 = swingW2(s);
  const amp = amplitude(s.roll, s.rate, w2);
  let acc = -w2 * Math.sin(s.roll) - (s.rising ? BRAKE : DAMP) * s.rate;
  // (a push goes with the swing, never against it: holding one key pushes once each time it goes that way)
  if (!s.rising && push !== 0 && amp < AMAX && (Math.sign(s.rate) === Math.sign(push) || amp < 0.06)) acc += PUSH * push;
  if (!s.rising && amp < AIDLE) acc += IDLE_DRIVE * (s.rate >= 0 ? 1 : -1);
  s.rate += acc * dt;
  s.roll += s.rate * dt;
  // At each end of a swing (it turns): the ropes creak, as hard as it swings; a hard one ticks the pad.
  const d = Math.sign(s.rate);
  if (d !== 0 && s.lastDir !== 0 && d !== s.lastDir) {
    const a = Math.abs(s.roll);
    if (a > 0.07 && !e.shot) SFX.play('hamCreak', Math.min(1, Math.max(0.12, (a - 0.05) / 0.4)));
    if (a > 0.22) pad.rumble('tick', (a / AMAX) * 0.45);
  }
  if (d !== 0) s.lastDir = d;
}

/** The swing's amplitude (radians) from where it is and how fast it goes. */
function amplitude(roll: number, rate: number, w2: number): number {
  const en = (rate * rate) / 2 + w2 * (1 - Math.cos(roll));
  return Math.acos(Math.max(-1, Math.min(1, 1 - en / w2)));
}

/** One step in the hammock (the walker hands it here while `holding`). */
function step(e: AddonEnv, ctx: RoamCtx, dt: number): AddonHold {
  const s = session!;
  const { body, input, cam } = ctx;
  const ex = e.explorer;
  s.time += dt;
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  ex.setMotion(0, true, 0);
  body.vel.set(0, 0, 0);
  body.grounded = true;

  // ── Walking to where he sits, turning his back to it ─────────────────────
  if (s.walking) {
    const dx = s.stand.x - body.pos.x;
    const dz = s.stand.z - body.pos.z;
    const dist = Math.hypot(dx, dz);
    const v = (APPROACH * body.scale) / 1.4;
    if (dist > 0.04) {
      const stepLen = Math.min(dist, v * dt);
      body.pos.x += (dx / dist) * stepLen;
      body.pos.z += (dz / dist) * stepLen;
      body.pos.y += (s.stand.y - body.pos.y) * Math.min(1, dt * 10);
      // (facing the way he goes, the last bit turning round)
      const want = dist > 0.3 ? Math.atan2(dx, dz) : s.yawOut;
      body.yaw += angleDiff(want, body.yaw) * Math.min(1, dt * TURN);
      ex.setMotion(stepLen / dt / body.scale, true, 0);
    } else {
      body.pos.copy(s.stand);
      const dy = angleDiff(s.yawOut, body.yaw);
      body.yaw += dy * Math.min(1, dt * TURN);
      if (Math.abs(dy) < 0.06) {
        body.yaw = s.yawOut;
        startPosture(e, s);
        go(s, HAMMOCK_U.lie);
      }
    }
    camera(ctx, s, dt);
    return { prompt: null };
  }

  // ── Getting up: wakes first, brakes the swing, then sits up and stands ───
  const lying = s.to === HAMMOCK_U.lie && s.u >= HAMMOCK_U.lie - 1e-3;
  if (s.wakeUp >= 0 && (s.wakeUp -= dt) < 0) s.rising = true;
  if (Math.hypot(input.move.x, input.move.y) < 0.2) s.stickFree = true;
  if (lying && !s.asleep && s.wakeUp < 0 && !e.photo.kind && (input.use || input.jump || (s.stickFree && Math.abs(input.move.y) > 0.5))) s.rising = true;
  // (E or Space while he gets in: he changes his mind, back up from where he is)
  else if (!lying && s.to === HAMMOCK_U.lie && s.u > 0.05 && !e.photo.kind && (input.use || input.jump)) go(s, HAMMOCK_U.stand);
  if (s.rising && s.to === HAMMOCK_U.lie && amplitude(s.roll, s.rate, swingW2(s)) < 0.07) {
    go(s, HAMMOCK_U.stand);
    s.rising = false;
  }
  // ── Along the way ─────────────────────────────────────────────────────────
  if (s.k < 1) {
    s.k = Math.min(1, s.k + dt / s.len);
    s.u = s.from + (s.to - s.from) * s.k * s.k * (3 - 2 * s.k);
  } else s.u = s.to;
  sounds(s);
  // Where his feet's spot is and which way he faces, along the way.
  if (s.u <= 1) {
    body.pos.lerpVectors(s.stand, s.seat, smooth(s.u));
    body.yaw = s.yawOut;
  } else {
    body.pos.lerpVectors(s.seat, s.lie, smooth(s.u - 1));
    body.yaw = s.yawOut + angleDiff(s.yawLie, s.yawOut) * smooth((s.u - 1.05) / 0.75);
  }
  // His hammock drawn once it takes his weight (the place's own before that, and after: it hangs the same then).
  setShown(s, s.u > 0.45);
  // The hat off as he lies back (its brim), on again as he sits up: once each way (H meanwhile is the player's).
  if (crossed(s.lastU, s.u, HAT_AT) && s.u > s.lastU) hat(e, s, false);
  else if (crossed(s.lastU, s.u, HAT_AT) && s.u < s.lastU) hat(e, s, true);

  // ── The swing (lying, or braking to get up) ───────────────────────────────
  let push = 0;
  if (s.u >= HAMMOCK_U.lie - 0.05 && s.to === HAMMOCK_U.lie) {
    const mx = Math.abs(input.move.x) > 0.15 && !s.asleep && !s.rising ? input.move.x : 0;
    // (screen-wise: D pushes it the way the view's right is)
    const rx = -Math.cos(cam.yaw);
    const rz = Math.sin(cam.yaw);
    const lx = Math.cos(body.yaw);
    const lz = -Math.sin(body.yaw);
    push = mx * (rx * lx + rz * lz >= 0 ? 1 : -1);
    if (mx) s.still = 0;
    swing(e, s, dt, push);
  } else {
    // (sitting up or getting in: no swing; what is left of it dies away)
    s.rate *= Math.exp(-6 * dt);
    s.roll *= Math.exp(-6 * dt);
  }
  // (lying down sets it going a little)
  if (s.lastU < HAMMOCK_U.lie - 0.05 && s.u >= HAMMOCK_U.lie - 0.05 && s.to === HAMMOCK_U.lie) s.rate += 0.1 * (s.side > 0 ? 1 : -1);
  s.push += (push - s.push) * Math.min(1, dt * 4);
  s.lastU = s.u;

  // ── Sleep ─────────────────────────────────────────────────────────────────
  const free = !e.photo.kind && !e.photo.albumOpen;
  if (lying && !s.rising && s.wakeUp < 0 && free && Math.abs(push) < 0.01) {
    s.still += dt;
    if (!s.asleep && s.still >= SLEEP_AFTER) {
      s.asleep = true;
      ctx.hud.toast(t(pad.active ? 'rAsleepPad' : 'rAsleep'));
    }
  } else if (!free || !lying) {
    s.asleep = false;
    s.still = 0;
  }
  s.sleep = Math.max(0, Math.min(1, s.sleep + (s.asleep ? dt : -3 * dt) / DOZE));
  ex.asleep = s.asleep && s.sleep > 0.2;

  fillState(e, s);
  drawMesh(s);
  camera(ctx, s, dt);

  // ── Up again: standing beside it ──────────────────────────────────────────
  if (s.to === HAMMOCK_U.stand && s.u <= 0) {
    body.pos.copy(s.stand);
    body.yaw = s.yawOut;
    end(e, true);
    return { prompt: null };
  }
  // The keys (not while he gets in or out, asleep, or with the camera or the phone up).
  if (!lying || s.asleep || s.rising || s.wakeUp >= 0 || e.photo.kind) return { prompt: null };
  return { prompt: pad.active || touching() ? `E  ${t('rGetUp')}` : `E  ${t('rGetUp')}  ·  A/D  ${t('hamSwing')}` };
}

const touching = () => document.body.classList.contains('roam-touch');

/** The sounds along the way: the cloth as he sits into it and lies back (and out again), the ropes taking his weight. */
function sounds(s: Session): void {
  if (!env || env.shot) return;
  const a = s.lastU;
  const b = s.u;
  if (b > a) {
    if (crossed(a, b, 0.5)) SFX.play('hamRustle', 0.75);
    if (crossed(a, b, 0.85)) SFX.play('hamCreak', 0.3);
    if (crossed(a, b, 1.3)) SFX.play('hamRustle', 1);
    if (crossed(a, b, 1.85)) SFX.play('hamCreak', 0.35);
  } else if (b < a) {
    if (crossed(a, b, 1.75)) SFX.play('hamRustle', 0.9);
    if (crossed(a, b, 0.95)) SFX.play('hamCreak', 0.3);
    if (crossed(a, b, 0.45)) SFX.play('hamRustle', 0.6);
  }
}

/** `u` went past `x` between two steps (either way). */
const crossed = (a: number, b: number, x: number): boolean => (a < x && b >= x) || (a > x && b <= x);

/** The follow camera: from his shoulder down to low beside him at his feet, looking along him; back as he gets up. */
function camera(ctx: RoamCtx, s: Session, dt: number): void {
  const cam = ctx.cam;
  const body = ctx.body;
  const p = s.p;
  const look = s.look;
  const h = 1.7 * body.scale * 0.95;
  // (his chest standing; his middle lying, a third of the way with the swing)
  const lieW = smooth((s.u - 0.6) / 1.2);
  const hips = hipsAt(s, Math.max(s.u, 1));
  const yLie = clothY(look, hips, 1, hips) + 0.55 * (body.scale / 1.4);
  framePoint(p, hips - (s.dir * 0.22) / p.len, yLie, 0, _c);
  // (turned about the ties' line with a third of the swing)
  const r = s.dir * s.roll * 0.35;
  _v.subVectors(_c, framePoint(p, hips - (s.dir * 0.22) / p.len, 0, 0, _x)).applyAxisAngle(p.d, r);
  _c.copy(_x).add(_v);
  cam.focus.set(mix(body.pos.x, _c.x, lieW), mix(body.pos.y + h * 0.86, _c.y, lieW), mix(body.pos.z, _c.z, lieW));
  cam.fov = 50;
  // (once he leans back: not while he still sits up, the camera would swing round through the posts by him)
  if (s.to === HAMMOCK_U.lie && s.u > 1.5) {
    s.framed += dt;
    if (s.framed <= FRAME_FOR) {
      const k = 1 - Math.exp(-VIEW.rate * dt);
      const vx = p.d.x * s.dir * Math.cos(VIEW.side) + p.n.x * s.camSide * Math.sin(VIEW.side);
      const vz = p.d.z * s.dir * Math.cos(VIEW.side) + p.n.z * s.camSide * Math.sin(VIEW.side);
      cam.yaw += angleDiff(Math.atan2(-vx, -vz), cam.yaw) * k;
      cam.pitch += (VIEW.pitch - cam.pitch) * k;
      cam.distance += (VIEW.dist * (body.scale / 1.4) - cam.distance) * k;
    }
  } else if (s.to === HAMMOCK_U.stand) {
    const k = 1 - Math.exp(-VIEW.out * dt);
    cam.pitch += (s.before.pitch - cam.pitch) * k;
    cam.distance += (s.before.distance - cam.distance) * k;
  }
  cam.behindYaw = cam.yaw;
}

// ── The add-on ─────────────────────────────────────────────────────────────

registerAddon({
  id: 'hammock',
  get holding() {
    return session !== null;
  },
  get handsBusy() {
    return session !== null;
  },

  init(e) {
    env = e;
    addBuiltins(e);
    // (checks: where they are, for `at=`)
    if (e.shot && e.params.has('hammock')) {
      syncPreps(e);
      console.info(`[map] hammocks: ${preps.map((p) => `${p.spot.id} (${p.mid.x.toFixed(1)}, ${p.mid.z.toFixed(1)})${p.inside ? '' : ' outside the roaming area'}`).join(' · ')}`);
    }
  },

  input(ctx, mode) {
    const s = session;
    if (!s || mode !== 'walk' || !env) return false;
    const i = ctx.input;
    // Asleep: any key, a click or the stick wakes him and does nothing else; E, Space or the stick forward or back
    // then gets him up (a moment after his eyes open).
    if (s.asleep) {
      const any = (i.taps?.size ?? 0) > 0 || i.jump || i.use || i.click || Math.hypot(i.move.x, i.move.y) > 0.3;
      if (!any) return false;
      s.asleep = false;
      s.still = 0;
      ctx.hud.toast(t('rAwake'));
      if (i.use || i.jump || Math.abs(i.move.y) > 0.5) s.wakeUp = 0.45;
      return true;
    }
    return false;
  },

  offer(ctx, mode) {
    offered = null;
    if (mode !== 'walk' || !env || session || env.busy() || !ctx.body.grounded) return null;
    offered = inReach(env, ctx);
    return offered ? `E  ${t('hamLie')}` : null;
  },

  use(ctx) {
    if (!env || !offered || session) return;
    begin(env, ctx, offered.p, offered.side);
    offered = null;
    ctx.hud.toast(t(pad.active || touching() ? 'hamLyingStick' : 'hamLying'));
  },

  hold(ctx, dt) {
    if (!env || !session) return { prompt: null };
    return step(env, ctx, dt);
  },

  after(ctx, mode, dt) {
    // (after he got up: the camera back to where it was, unless the player turns it; the hammock his until he goes)
    const a = after;
    if (!a || session) return;
    const cam = ctx.cam;
    if (a.easing && mode === 'walk') {
      if (ctx.input.lookYaw || ctx.input.lookPitch || ctx.input.zoom) a.easing = false;
      else {
        const k = 1 - Math.exp(-VIEW.out * dt);
        cam.pitch += (a.pitch - cam.pitch) * k;
        cam.distance += (a.distance - cam.distance) * k;
        if (Math.abs(a.pitch - cam.pitch) < 0.005 && Math.abs(a.distance - cam.distance) < 0.05) a.easing = false;
      }
    }
    if (mode === 'overview' || Math.hypot(ctx.body.pos.x - a.x, ctx.body.pos.z - a.z) > AWAY) {
      after = null;
      HAMMOCK_IN_USE.id = null;
      HAMMOCK_IN_USE.hide = false;
    }
  },

  frame(f: MapFrame, mode: RoamMode) {
    const s = session;
    const e = env;
    if (!s || !e || mode !== 'walk') {
      snore?.show(false);
      return;
    }
    // (asleep: the "Z z z" over his head, as on the ground: _rest.ts)
    const on = s.asleep && s.sleep > 0.5 && e.photo.view < 0.3;
    if (on && !snore) snore = createSnore(e.layer);
    snore?.show(on);
    if (!on || !snore) return;
    e.explorer.rig.joints.head.getWorldPosition(_v);
    _v.y += 0.5 * e.body.scale;
    _v.project(f.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.2 || Math.abs(_v.y) > 1.2) {
      snore.show(false);
      return;
    }
    const r = e.canvas.getBoundingClientRect();
    snore.place(r.left + ((_v.x + 1) / 2) * r.width, r.top + ((1 - _v.y) / 2) * r.height);
  },

  setMode(next) {
    if (!env) return;
    if (next !== 'walk') {
      end(env, false);
      if (next === 'overview') {
        after = null;
        HAMMOCK_IN_USE.id = null;
        HAMMOCK_IN_USE.hide = false;
      }
    }
  },

  fromUrl(q, ctx) {
    const v = q.get('hammock');
    const e = env;
    if (!v || !e || v === '0' || ctx.body.grounded === false) return;
    syncPreps(e);
    // The nearest one to `at=` (made ready), within 40 m.
    let best: Prep | null = null;
    let bd = 40;
    for (const p of preps) {
      if (p.spot.ready && !p.spot.ready()) continue;
      const d = Math.hypot(p.mid.x - ctx.body.pos.x, p.mid.z - ctx.body.pos.z);
      if (d >= bd) continue;
      readSpot(e, p);
      if (!p.look) continue;
      bd = d;
      best = p;
    }
    if (!best) {
      console.warn(`[map] hammock=${v}: none found within 40 m of (${ctx.body.pos.x.toFixed(1)}, ${ctx.body.pos.z.toFixed(1)})`);
      return;
    }
    _v.subVectors(ctx.body.pos, best.a);
    const hs = Number(q.get('hamside'));
    const side: 1 | -1 = hs === 1 || hs === -1 ? hs : _v.dot(best.n) >= 0 ? 1 : -1;
    begin(e, ctx, best, side, v !== 'in');
    const s = session!;
    const f = (w: Vector3) => `(${w.x.toFixed(1)}, ${w.y.toFixed(2)}, ${w.z.toFixed(1)})`;
    console.info(`[map] hammock: ${v === 'in' ? 'getting into' : 'in'} "${best.spot.id}"${v === 'sleep' ? ', asleep' : ''}, feet toward ${s.dir > 0 ? 'b' : 'a'}, from side ${s.side} (stands at ${f(s.stand)}; under it ${best.ground.toFixed(2)}; the camera's side ${s.camSide})`);
    // (a bug report's camera stays as it was: `rcam`)
    if (q.has('rcam')) s.framed = Infinity;
    if (v === 'in') {
      // (from beside it, as E would)
      ctx.body.pos.copy(s.stand);
      ctx.body.yaw = s.yawOut;
      return;
    }
    const amp = Number(q.get('hamswing'));
    if (Number.isFinite(amp) && amp > 0) s.roll = Math.min(AMAX, amp) * (s.side > 0 ? 1 : -1);
    if (v === 'sleep') {
      s.asleep = true;
      s.sleep = 1;
      s.still = SLEEP_AFTER;
      e.explorer.asleep = true;
    }
    fillState(e, s);
    drawMesh(s, true);
  },

  report() {
    const s = session;
    if (!s) return null;
    const out: Record<string, string> = { hammock: s.asleep ? 'sleep' : '1', hamside: String(s.side) };
    const amp = amplitude(s.roll, s.rate, swingW2(s));
    if (amp > 0.06) out.hamswing = amp.toFixed(2);
    return out;
  },
});
