import { hash3, mulberry32 } from '../../voxel/random';
import { CARRY, FEAT, SLOT, type Look } from './_personModel';

/**
 * New Year's Eve's two crowds made alive (AWP-35, the craft pass; the owner's lake reference: people spread over the
 * plaza in small groups, children running, a circle dance round the gold mandala). Shared by both venues' scenes
 * (`_sceneNye.ts`, the Kulen square; `_sceneNyeLake.ts`, the lake's plaza); the plans (`_nyePlan.ts`,
 * `_nyeLakePlan.ts`) still say who comes, with whom and when.
 *
 * - `spreadGroups`: the standing families re-placed as small groups over the whole plaza — each on a short arc round
 *   its own middle (a family chatting, the arc open to the stage), the groups ≥ ≈ 2.5 m apart, denser toward the
 *   stage; some round the dance (watching it), a few before the stalls. Their place's facing stays the board's (the
 *   countdown); the chat's facing is new (`GroupPlan.chat`). `gatherPlaces`: where they gather toward the stage for
 *   the countdown (closer together, the dance's ring left open).
 * - `pickCouples` and `vongAt`: the roam vong (រាំវង់) round the mandala: couples from the crowd, the woman a step
 *   ahead of the man, slowly round the ring (counter-clockwise seen from above), now and then she turns back to face
 *   him, or turns once on the spot; the hands in `POSE.vong`.
 * - `planRunners` and `runnerAt`: children running between the groups, two by two (one chasing the other round a
 *   loop of four points near their family), a breath at each point.
 * - `moreSparklers`: sparklers for more of the young (the plans give some children theirs); their sparks are the
 *   night's life's (nye/_life.ts, `SPARKS` in nye/_lifeSparks.ts).
 */

/** What the spread reads of a plan's member (both plans' members have these). */
export interface CrowdMember {
  role: string;
  group: number;
  x: number;
  z: number;
  yaw: number;
  kid: boolean;
  low: boolean;
  partner: number;
  phone: boolean;
  sparkler: boolean;
  route: Float32Array;
  cum: Float32Array;
}

/** A venue's floor as the spread sees it. */
export interface Venue {
  /** May someone stand at (x, z) (on the plaza, clear of everything built and of the dance)? */
  ok(x: number, z: number): boolean;
  /** The plaza's box (x0, z0, x1, z1). */
  box: readonly [number, number, number, number];
  /** The yaw (toward (sin, cos) in x, z) from (x, z) to the board. */
  board(x: number, z: number): number;
  /** The stage's front middle: groups are denser near it (halving at `reach` m). */
  front: { x: number; z: number; reach: number };
  /** The roam vong's ring (its middle, radius m). */
  ring: { x: number; z: number; r: number };
  /** Stalls (their middle and the way they face): a group stands before a few of them, turned to them. */
  stalls: readonly { x: number; z: number; facing: number }[];
  /** How far before a stall's middle its group's middle stands (m). */
  stallOut: number;
  /** May a child run across (x, z) (default: `ok`)? */
  open?(x: number, z: number): boolean;
  seed: number;
}

/** The groups' kinds: out on the plaza, before a stall, round the dance. */
export const GROUP = { open: 0, stall: 1, ring: 2 } as const;

export interface GroupPlan {
  /** Per member (the plan's order; NaN: not re-placed): the yaw to the group's middle (chatting). */
  chat: Float32Array;
  /** Per member: their group's kind (`GROUP`) and the point it attends to before the countdown (its middle, a stall, the ring). */
  kind: Uint8Array;
  ax: Float32Array;
  az: Float32Array;
  /** Per member: their group's middle. */
  cx: Float32Array;
  cz: Float32Array;
  /** Groups placed (by kind). */
  count: [number, number, number];
}

/** Room between neighbouring groups' people (m), and between people in a group (m, along its arc). */
const GAP = 2.4;
const SPACING = 0.85;

/** A member's place moved to (x, z): the end of their way in too. */
export function moveTo(m: CrowdMember, x: number, z: number, yaw: number): void {
  m.x = x;
  m.z = z;
  m.yaw = yaw;
  const r = m.route;
  const c = m.cum;
  const n = c.length;
  r[2 * n - 2] = x;
  r[2 * n - 1] = z;
  c[n - 1] = c[n - 2] + Math.hypot(x - r[2 * n - 4], z - r[2 * n - 3]);
}

/** A group of n on an arc: its angular step and radius (neighbours `SPACING` apart). */
function arcOf(n: number): { step: number; r: number } {
  if (n <= 1) return { step: 0, r: 0 };
  const step = n === 2 ? 1.6 : Math.min((Math.PI * 2) / n, 1.45);
  return { step, r: SPACING / (2 * Math.sin(step / 2)) };
}

/**
 * Re-place the standing families (`role` 'stand'; a child on the shoulders rides on its carrier, seated families and
 * monks keep their places) as small groups spread over the venue. `skip`: members not to re-place.
 */
export function spreadGroups(members: CrowdMember[], v: Venue, skip: (k: number) => boolean = () => false): GroupPlan {
  const n = members.length;
  const out: GroupPlan = {
    chat: new Float32Array(n).fill(NaN),
    kind: new Uint8Array(n),
    ax: new Float32Array(n),
    az: new Float32Array(n),
    cx: new Float32Array(n),
    cz: new Float32Array(n),
    count: [0, 0, 0],
  };
  const rnd = mulberry32(v.seed);
  // The standing groups, in the plan's order (the first come first: they take the best places).
  const byGroup = new Map<number, number[]>();
  members.forEach((m, k) => {
    if (m.role !== 'stand' || skip(k)) return;
    let list = byGroup.get(m.group);
    if (!list) byGroup.set(m.group, (list = []));
    list.push(k);
  });
  const groups = [...byGroup.values()];
  // Candidate middles: a jittered grid over the plaza where a group's middle may stand.
  const [x0, z0, x1, z1] = v.box;
  const cand: number[] = [];
  for (let z = z0; z <= z1; z += 0.7)
    for (let x = x0; x <= x1; x += 0.7) {
      const jx = x + (rnd() - 0.5) * 0.5;
      const jz = z + (rnd() - 0.5) * 0.5;
      if (v.ok(jx, jz)) cand.push(jx, jz);
    }
  const placed: { x: number; z: number; r: number }[] = [];
  const clear = (x: number, z: number, r: number) => {
    for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < p.r + r + GAP) return false;
    return true;
  };
  /** The arc's places round (x, z), opening toward `open` (yaw from the middle): all on the floor, or null. */
  const arc = (x: number, z: number, size: number, open: number, shrink = 1): [number, number][] | null => {
    const { step, r } = arcOf(size);
    const pts: [number, number][] = [];
    for (let j = 0; j < size; j++) {
      const a = open + Math.PI + (j - (size - 1) / 2) * step;
      const px = x + Math.sin(a) * r * shrink;
      const pz = z + Math.cos(a) * r * shrink;
      if (!v.ok(px, pz)) return null;
      pts.push([px, pz]);
    }
    return pts;
  };
  const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);
  const put = (list: number[], pts: [number, number][], cx: number, cz: number, kind: number, ax: number, az: number) => {
    list.forEach((k, j) => {
      const [px, pz] = pts[j];
      moveTo(members[k], px, pz, v.board(px, pz));
      // (one alone: turned to what the group attends to, or out on the plaza somewhere near the board's way)
      out.chat[k] = list.length > 1 ? yawTo(px, pz, cx, cz) : kind === GROUP.open ? v.board(px, pz) + (rnd() - 0.5) * 1.4 : yawTo(px, pz, ax, az);
      out.kind[k] = kind;
      out.ax[k] = ax;
      out.az[k] = az;
      out.cx[k] = cx;
      out.cz[k] = cz;
    });
    placed.push({ x: cx, z: cz, r: arcOf(list.length).r });
    out.count[kind]++;
  };
  // Who goes where: a few groups before the stalls, a fifth round the dance, the rest over the plaza.
  const order = groups.map((g, i) => ({ g, i, u: rnd() }));
  const stallGroups = new Set<number>();
  const ringGroups = new Set<number>();
  {
    const shuffled = [...order].sort((a, b) => a.u - b.u);
    let s = 0;
    for (const o of shuffled) {
      if (s < v.stalls.length && o.g.length >= 2 && o.g.length <= 4) {
        stallGroups.add(o.i);
        s++;
      } else if (ringGroups.size < Math.round(groups.length * 0.22)) ringGroups.add(o.i);
    }
  }
  // Round the dance: middles on a ring outside it, evenly round (each opening toward the ring).
  const ringR = v.ring.r;
  let ringK = 0;
  const ringN = Math.max(1, ringGroups.size);
  let stallK = 0;
  for (const o of order) {
    const list = o.g;
    const size = list.length;
    const { r } = arcOf(size);
    let done = false;
    if (stallGroups.has(o.i)) {
      const st = v.stalls[stallK++ % v.stalls.length];
      for (let d = 0; d < 4 && !done; d += 0.5) {
        const cx = st.x + Math.sin(st.facing) * (v.stallOut + r + d);
        const cz = st.z + Math.cos(st.facing) * (v.stallOut + r + d);
        const open = yawTo(cx, cz, st.x, st.z);
        const pts = clear(cx, cz, r) ? arc(cx, cz, size, open) : null;
        if (pts) {
          put(list, pts, cx, cz, GROUP.stall, st.x, st.z);
          done = true;
        }
      }
    } else if (ringGroups.has(o.i)) {
      const a0 = rnd() * 0.4 + (ringK++ / ringN) * Math.PI * 2;
      for (let t = 0; t < 24 && !done; t++) {
        const a = a0 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.09;
        const d = ringR + 2.4 + r + (t % 3) * 0.6;
        const cx = v.ring.x + Math.sin(a) * d;
        const cz = v.ring.z + Math.cos(a) * d;
        const open = yawTo(cx, cz, v.ring.x, v.ring.z);
        const pts = clear(cx, cz, r) ? arc(cx, cz, size, open) : null;
        if (pts) {
          put(list, pts, cx, cz, GROUP.ring, v.ring.x, v.ring.z);
          done = true;
        }
      }
    }
    if (done) continue;
    // Out on the plaza: the best of the candidates by a weighted draw (nearer the stage likelier), clear of the others.
    let best = -1;
    let bestKey = -1;
    for (let c = 0; c < cand.length; c += 2) {
      const cx = cand[c];
      const cz = cand[c + 1];
      if (!clear(cx, cz, r)) continue;
      const d = Math.hypot(cx - v.front.x, cz - v.front.z);
      const w = 0.35 + 1 / (1 + (d / v.front.reach) ** 2);
      const key = rnd() ** (1 / w);
      if (key > bestKey && arc(cx, cz, size, v.board(cx, cz))) {
        bestKey = key;
        best = c;
      }
    }
    if (best >= 0) {
      const cx = cand[best];
      const cz = cand[best + 1];
      const open = v.board(cx, cz);
      put(list, arc(cx, cz, size, open)!, cx, cz, GROUP.open, cx, cz);
      continue;
    }
    // (no room left: they keep the plan's places, facing the board)
    for (const k of list) {
      const m = members[k];
      out.chat[k] = m.yaw;
      out.ax[k] = out.cx[k] = m.x;
      out.az[k] = out.cz[k] = m.z;
    }
  }
  return out;
}

/** Room between neighbouring groups gathered before the stage for the countdown (m). */
const GATHER_GAP = 1.1;

/**
 * Where each re-placed group stands for the countdown (into `gx`, `gz` a member; the others keep their place): each
 * group moved `pull` of the way toward the stage's front (the nearest the stage first, onto the free place nearest
 * that), closer together, each on its own arc still (opening toward the board), the dance's ring left open.
 */
export function gatherPlaces(members: CrowdMember[], plan: GroupPlan, v: Venue, pull: number): { gx: Float32Array; gz: Float32Array } {
  const n = members.length;
  const gx = new Float32Array(n);
  const gz = new Float32Array(n);
  members.forEach((m, k) => {
    gx[k] = m.x;
    gz[k] = m.z;
  });
  const rnd = mulberry32(v.seed + 11);
  const byGroup = new Map<number, number[]>();
  members.forEach((m, k) => {
    if (Number.isNaN(plan.chat[k])) return;
    let list = byGroup.get(m.group);
    if (!list) byGroup.set(m.group, (list = []));
    list.push(k);
  });
  const dFront = (x: number, z: number) => Math.hypot(x - v.front.x, z - v.front.z);
  const groups = [...byGroup.values()].sort((a, b) => dFront(plan.cx[a[0]], plan.cz[a[0]]) - dFront(plan.cx[b[0]], plan.cz[b[0]]));
  const [x0, z0, x1, z1] = v.box;
  const cand: { x: number; z: number; d: number }[] = [];
  for (let z = z0; z <= z1; z += 0.6)
    for (let x = x0; x <= x1; x += 0.6) {
      const jx = x + (rnd() - 0.5) * 0.4;
      const jz = z + (rnd() - 0.5) * 0.4;
      if (v.ok(jx, jz)) cand.push({ x: jx, z: jz, d: 0 });
    }
  const placed: { x: number; z: number; r: number }[] = [];
  for (const list of groups) {
    const size = list.length;
    const { step, r } = arcOf(size);
    // (the free places by their distance from where the group heads: its middle, pulled toward the stage's front)
    const cx = plan.cx[list[0]];
    const cz = plan.cz[list[0]];
    const tx = cx + (v.front.x - cx) * pull;
    const tz = cz + (v.front.z - cz) * pull;
    for (const c of cand) c.d = Math.hypot(c.x - tx, c.z - tz) + rnd() * 0.6;
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand) {
      if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < p.r + r + GATHER_GAP)) continue;
      const open = v.board(c.x, c.z);
      const pts: [number, number][] = [];
      for (let j = 0; j < size; j++) {
        const a = open + Math.PI + (j - (size - 1) / 2) * step * 0.8;
        const px = c.x + Math.sin(a) * r;
        const pz = c.z + Math.cos(a) * r;
        if (!v.ok(px, pz)) break;
        pts.push([px, pz]);
      }
      if (pts.length < size) continue;
      list.forEach((k, j) => {
        gx[k] = pts[j][0];
        gz[k] = pts[j][1];
      });
      placed.push({ x: c.x, z: c.z, r });
      break;
    }
  }
  return { gx, gz };
}

// ── The roam vong ─────────────────────────────────────────────────────────────

/** The dance: its pace round the ring (m/s along it), the couple's step apart (m along it and across). */
export const VONG = { pace: 0.26, apart: 1.35, across: 0.4 } as const;

/**
 * Couples for the dance: two grown-ups of one standing family who are partners (not carrying a child), the young
 * first; `max` couples, each [woman or first, man or second]. `ok` filters members (e.g. not the runners).
 */
export function pickCouples(members: CrowdMember[], max: number, ok: (k: number) => boolean, seed: number): [number, number][] {
  const rnd = mulberry32(seed);
  const pairs: { a: number; b: number; key: number }[] = [];
  members.forEach((m, k) => {
    const p = m.partner;
    if (p <= k || m.role !== 'stand' || m.kid || !ok(k) || !ok(p)) return;
    const o = members[p];
    if (o.role !== 'stand' || o.kid) return;
    // (families of two — friends, a young couple — first, then any)
    const fam = members.filter((q) => q.group === m.group).length;
    pairs.push({ a: k, b: p, key: rnd() + (fam <= 2 ? 1 : 0) });
  });
  pairs.sort((p, q) => q.key - p.key);
  return pairs.slice(0, max).map((p) => [p.a, p.b]);
}

/**
 * Where dancer `j` of `n` (couple ⌊j/2⌋, the woman at even j) is at the night's second `s` round `ring` (into `out`:
 * x, z, the yaw, and `turn` 0‥1 while she faces him); `phase` offsets the whole ring (rad).
 */
export function vongAt(j: number, n: number, s: number, ring: { x: number; z: number; r: number }, phase: number, out: { x: number; z: number; yaw: number; turn: number }): void {
  const couples = Math.max(1, Math.ceil(n / 2));
  const c = j >> 1;
  const woman = (j & 1) === 0;
  const w = VONG.pace / ring.r;
  // (each couple's place round the ring, the woman a step ahead, the man a little outside her)
  const base = phase + (c / couples) * Math.PI * 2 + w * s;
  const a = base + (woman ? 0.5 : -0.5) * (VONG.apart / ring.r);
  const r = ring.r + (woman ? -0.5 : 0.5) * VONG.across;
  out.x = ring.x + Math.sin(a) * r;
  out.z = ring.z + Math.cos(a) * r;
  // (facing along the way round: θ grows counter-clockwise seen from above, its tangent θ + π/2)
  const ahead = a + Math.PI / 2;
  // Every 16 s a couple's figure: she turns back to face him for a few seconds (both stepping on), or turns once round.
  const u = (((s + c * 5.3) % 16) + 16) % 16;
  const face = smooth(1, 2.2, u) * (1 - smooth(6, 7.2, u));
  const spin = c % 3 === 1 ? smooth(9, 12, u) : 0;
  out.turn = woman ? face : 0;
  out.yaw = ahead + (woman ? face * Math.PI + spin * Math.PI * 2 : face * 0.35);
}

/** The dancers' best: silk tops (cream, lotus pink, gold, sky) over deep sampot (purple, red, teal, gold-brown), a gilt edge. */
const VONG_TOPS = [0xf4efe2, 0xf2a6bf, 0xe9c46a, 0xa9d0ee, 0xf6e7c8, 0xe58fb0];
const VONG_LOWS = [0x6a2a8a, 0xa82838, 0x1f6f78, 0x8a5a22, 0x3a2a6a, 0xb03a5a];

/** A dancer dressed for the roam vong (their own look, the colours changed): bright enough to read round the mandala from afar. */
export function vongLook(l: Look, k: number): Look {
  const colors = l.colors.slice();
  const top = VONG_TOPS[k % VONG_TOPS.length];
  const low = VONG_LOWS[(k * 7 + 3) % VONG_LOWS.length];
  for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = top;
  for (const s of [SLOT.hips, SLOT.thigh]) colors[s] = low;
  colors[SLOT.accent] = 0xe0b048;
  return { ...l, colors, feats: l.feats.filter((f) => f !== FEAT.phone), carry: CARRY.none };
}

// ── Children running between the groups ────────────────────────────────────────

export interface Runner {
  /** The member running, and the loop (x, z pairs, closed) with its lengths; their lag behind the loop's leader (s). */
  k: number;
  pts: Float32Array;
  cum: Float32Array;
  lag: number;
}

/** Running pace (m/s) and the breath at each point (s). */
export const RUN = { v: 2.1, rest: 1.4 } as const;

/**
 * Children running in twos round a loop of four points near their family (the points on the floor, the way between
 * them clear of the dance's ring). `ok` filters the children.
 */
export function planRunners(members: CrowdMember[], plan: GroupPlan, v: Venue, max: number, ok: (k: number) => boolean): Runner[] {
  const rnd = mulberry32(v.seed + 7);
  const kids: number[] = [];
  members.forEach((m, k) => {
    if (m.kid && m.role === 'stand' && !Number.isNaN(plan.chat[k]) && ok(k)) kids.push(k);
  });
  kids.sort(() => rnd() - 0.5);
  const out: Runner[] = [];
  const clearOfRing = (ax: number, az: number, bx: number, bz: number) => {
    for (let t = 0; t <= 1; t += 0.25) {
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (Math.hypot(x - v.ring.x, z - v.ring.z) < v.ring.r + 1.6 || !(v.open ?? v.ok)(x, z)) return false;
    }
    return true;
  };
  for (let i = 0; i < kids.length && out.length < max; i++) {
    const k = kids[i];
    const cx = plan.cx[k];
    const cz = plan.cz[k];
    let pts: number[] | null = null;
    for (let t = 0; t < 30 && !pts; t++) {
      const a0 = rnd() * Math.PI * 2;
      const p: number[] = [];
      for (let q = 0; q < 4; q++) {
        const a = a0 + q * (Math.PI / 2) + (rnd() - 0.5) * 0.5;
        const d = 3.2 + rnd() * 3.2;
        p.push(cx + Math.sin(a) * d, cz + Math.cos(a) * d);
      }
      let good = true;
      for (let q = 0; q < 4 && good; q++) good = clearOfRing(p[2 * q], p[2 * q + 1], p[(2 * q + 2) % 8], p[(2 * q + 3) % 8]);
      if (good) pts = p;
    }
    if (!pts) continue;
    pts.push(pts[0], pts[1]);
    const loop = new Float32Array(pts);
    const cum = new Float32Array(5);
    for (let q = 1; q < 5; q++) cum[q] = cum[q - 1] + Math.hypot(loop[2 * q] - loop[2 * q - 2], loop[2 * q + 1] - loop[2 * q - 1]);
    out.push({ k, pts: loop, cum, lag: 0 });
    // (a second child of a family nearby chases the first round the same loop)
    for (let j = i + 1; j < kids.length && out.length < max; j++) {
      const o = kids[j];
      if (Math.hypot(plan.cx[o] - cx, plan.cz[o] - cz) > 9) continue;
      out.push({ k: o, pts: loop, cum, lag: 0.9 + rnd() * 0.6 });
      kids.splice(j, 1);
      break;
    }
  }
  return out;
}

/** Where a runner is at time `t` (s; into `out`), and whether running (1) or catching a breath at a point (0). */
export function runnerAt(r: Runner, t: number, out: { x: number; z: number; yaw: number }): number {
  const legs = r.cum.length - 1;
  const period = r.cum[legs] / RUN.v + legs * RUN.rest;
  let u = (((t - r.lag) % period) + period) % period;
  for (let q = 0; q < legs; q++) {
    const run = (r.cum[q + 1] - r.cum[q]) / RUN.v;
    const ax = r.pts[2 * q];
    const az = r.pts[2 * q + 1];
    const bx = r.pts[2 * q + 2];
    const bz = r.pts[2 * q + 3];
    out.yaw = Math.atan2(bx - ax, bz - az);
    if (u < run) {
      const k = u / run;
      out.x = ax + (bx - ax) * k;
      out.z = az + (bz - az) * k;
      return 1;
    }
    u -= run;
    if (u < RUN.rest) {
      out.x = bx;
      out.z = bz;
      return 0;
    }
    u -= RUN.rest;
  }
  out.x = r.pts[0];
  out.z = r.pts[1];
  return 0;
}

// ── Sparklers ───────────────────────────────────────────────────────────────

/**
 * A look holding a sparkler: a thin grey wire, its tip a small dim ember (the plans' children's burned white-gold and
 * bloomed into blobs; the sparks round the tip are the night's life's small points, nye/_life.ts).
 */
export function sparklerLook(l: Look): Look {
  const colors = l.colors.slice();
  colors[SLOT.flame] = 0x8a5a24;
  colors[SLOT.wood] = 0x8a8a86;
  const feats = l.feats.filter((f) => f !== FEAT.phone);
  if (!feats.includes(FEAT.torch)) feats.push(FEAT.torch);
  return { ...l, feats, colors, carry: CARRY.torch };
}

/**
 * Up to `max` more sparklers for those standing who hold no phone (children, and the young who jump at midnight: the
 * `jumps` flag), picked by a seeded hash; `ok` filters them (not the dancers). Their looks change (and the plan's own
 * sparklers': `sparklerLook`); returns how many new.
 */
export function moreSparklers(members: (CrowdMember & { look: Look; jumps: boolean })[], max: number, ok: (k: number) => boolean, seed: number): number {
  const order = members.map((_, k) => k).sort((a, b) => hash3(a, 3, 1, seed) - hash3(b, 3, 1, seed));
  // (the plans' own sparklers too: the same small ember)
  for (const m of members) if (m.sparkler) m.look = sparklerLook(m.look);
  let n = 0;
  for (const k of order) {
    if (n >= max) break;
    const m = members[k];
    if (m.sparkler || m.phone || m.role !== 'stand' || !(m.kid || m.jumps) || !ok(k)) continue;
    m.sparkler = true;
    m.look = sparklerLook(m.look);
    n++;
  }
  return n;
}

function smooth(a: number, b: number, x: number): number {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}
