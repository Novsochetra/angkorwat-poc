import { VoxelBuilder, type VoxelGrid } from '../../../voxel/VoxelBuilder';
import { hash3 } from '../../../voxel/random';
import { fromSheet, LEAF, OFFERING } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { rng, type Rng } from '../../shapes';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { joints, MossLayer, mossOnTop, placeTilted, poreMarks, pores, restOnGround, tiltedColliders } from './_masonry-props';
import { Mason, MOSS_CLUMP, mossCushions, SHRINE_CAVITY, SHRINE_PANEL, SHRINE_SHADOW, SHRINE_STONE, socketStone, T, type StoneOpts } from './_shrine';

/**
 * §20 ④ Small shrine — a miniature Khmer prasat, the tower language of the
 * five central towers at doll's-house scale: a stepped plinth with a front
 * stair, a cella on a redented plan (each face steps forward around its
 * door), a doorway with colonnettes and a lintel under a pointed pediment
 * (false doors on the other three faces), a cornice, receding roof tiers with
 * corner antefixes and small gables, and a lotus-bud crown. The ruined one has
 * fallen in: a stepped mound of big mossy blocks on its plinth, some tumbled
 * onto the ground around it (see {@link ruin}).
 *
 * Authored in texels (1/16 m); `height` scales the whole design and re-snaps
 * it to the texel grid.
 */

interface Storey {
  /** Half-width of the wall faces (texels). */
  hw: number;
  h: number;
}

interface ShrineSpec {
  /** Stepped plinth, bottom tier first. */
  base: Storey[];
  /** Risers of the front stair up to the plinth top, and its half-width. */
  steps: number;
  stairHw: number;
  cella: Storey & { doorHw: number; doorH: number };
  cornice: number;
  /** Rows of the pediments over the doors (0 = none). */
  pediment: number;
  /** Receding roof tiers above the cornice, bottom first: body half-width, height with its cornice. */
  tiers: Storey[];
  /** Lotus bud, a cap stone whose finial is lost (only its socket is left), or nothing. */
  crown: 'bud' | 'cap' | 'none';
  /** A ruin's mound of fallen blocks: its courses (texels), built on the plinth instead of the cella. */
  heap?: number[];
  cap: Storey;
  moss: number;
  stain: number;
  /** Chipped edges (BlockSet.erode amount). */
  wear: number;
}

const SPECS: Record<string, ShrineSpec> = {
  // The sheet's tall shrines (top row): ≈ 2.3 m on a 1.25 m plinth.
  prasat: {
    base: [{ hw: 10, h: 3 }, { hw: 8, h: 3 }],
    steps: 3,
    stairHw: 4,
    cella: { hw: 6, h: 14, doorHw: 3, doorH: 12 },
    cornice: 2,
    pediment: 6,
    tiers: [{ hw: 5, h: 4 }, { hw: 4, h: 4 }, { hw: 3, h: 3 }],
    crown: 'bud',
    cap: { hw: 3, h: 3 },
    moss: 0.5,
    stain: 0.32,
    wear: 0.12,
  },
  // Squat and broad like the top-right one: a wide plinth, two tiers, a cap stone.
  square: {
    base: [{ hw: 11, h: 3 }, { hw: 9, h: 3 }],
    steps: 3,
    stairHw: 4,
    cella: { hw: 7, h: 11, doorHw: 3, doorH: 9 },
    cornice: 2,
    pediment: 6,
    tiers: [{ hw: 6, h: 4 }, { hw: 4, h: 3 }],
    crown: 'cap',
    cap: { hw: 3, h: 3 },
    moss: 0.55,
    stain: 0.28,
    wear: 0.15,
  },
  // The slim pillar shrine (bottom left): a tall niche under a flared cap stone.
  narrow: {
    base: [{ hw: 7, h: 3 }, { hw: 6, h: 3 }],
    steps: 3,
    stairHw: 2,
    cella: { hw: 4, h: 17, doorHw: 2, doorH: 12 },
    cornice: 2,
    pediment: 3,
    tiers: [{ hw: 3, h: 3 }],
    crown: 'cap',
    cap: { hw: 5, h: 4 },
    moss: 0.4,
    stain: 0.3,
    wear: 0.12,
  },
  // Fallen in (bottom right): a stepped mound of big mossy blocks on one tall base course, blocks tumbled around it.
  ruined: {
    base: [{ hw: 13, h: 5 }],
    steps: 0,
    stairHw: 3,
    cella: { hw: 9, h: 11, doorHw: 2, doorH: 6 },
    cornice: 2,
    pediment: 0,
    tiers: [],
    crown: 'none',
    heap: [5, 4, 4],
    cap: { hw: 3, h: 3 },
    moss: 0.5,
    stain: 0.32,
    wear: 0.1,
  },
};

/** The finial pin on top of the lotus bud (m). */
const PIN = 0.06;
/** Pores per m² of face: half-texel marks, in scale with the small blocks. */
const PORES = 14;
/** Rows of the lotus bud. */
const BUD = [2.2, 3.0, 2.6, 1.6];

/** Height of a spec as built (m), for the `height` option. */
function specHeight(s: ShrineSpec): number {
  if (s.heap) return (s.base.reduce((a, b) => a + b.h, 0) + s.heap.reduce((a, b) => a + b, 0) + s.cap.h) * T;
  const t = [...s.base, s.cella, ...s.tiers].reduce((a, b) => a + b.h, 0) + s.cornice;
  return (t + (s.crown === 'bud' ? BUD.length : s.cap.h)) * T + (s.crown === 'bud' ? PIN : 0);
}

/** Every size scaled by k, re-snapped to whole texels. */
function scaleSpec(s: ShrineSpec, k: number): ShrineSpec {
  const r = (n: number) => Math.max(1, Math.round(n * k));
  const st = (b: Storey) => ({ hw: r(b.hw), h: r(b.h) });
  return {
    ...s,
    base: s.base.map(st),
    stairHw: r(s.stairHw),
    cella: { ...st(s.cella), doorHw: r(s.cella.doorHw), doorH: r(s.cella.doorH) },
    cornice: r(s.cornice),
    pediment: s.pediment && r(s.pediment),
    tiers: s.tiers.map(st),
    cap: st(s.cap),
    heap: s.heap?.map(r),
  };
}

/**
 * The spec scaled to a height (m): every size scaled and re-snapped, then the
 * rounding taken up in the cella (or a ruin's mound) so the top lands on the
 * texel nearest the height asked for.
 */
function fitSpec(s: ShrineSpec, height: number): ShrineSpec {
  const f = scaleSpec(s, Math.min(1.6, Math.max(0.6, height / specHeight(s))));
  const d = Math.round((height - specHeight(f)) / T);
  if (f.heap) f.heap[0] = Math.max(2, f.heap[0] + d);
  else {
    f.cella.doorH = Math.max(4, f.cella.doorH + d);
    f.cella.h = Math.max(f.cella.doorH + 1, f.cella.h + d);
  }
  return f;
}

/** Split a height into masonry courses of about `c` texels. */
function courses(h: number, c: number): number[] {
  if (h <= 0) return [];
  const n = Math.max(1, Math.round(h / c));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 1) * h) / n) - Math.round((i * h) / n));
}

/**
 * The four faces of a square storey (front, right, back, left): `u` runs along
 * the face, `d` outwards from the centre, so every door, projection and gable
 * is authored once and turned onto each face.
 */
type Face = 0 | 1 | 2 | 3;
const FACES: Face[] = [0, 1, 2, 3];

/** World texel box [x0, x1, z0, z1] of a face-local box (u0‥u1 along, d0‥d1 out). */
function faceBox(f: Face, u0: number, u1: number, d0: number, d1: number): [number, number, number, number] {
  switch (f) {
    case 0:
      return [u0, u1, d0, d1];
    case 1:
      return [d0, d1, -u1, -u0];
    case 2:
      return [-u1, -u0, -d1, -d0];
    default:
      return [-d1, -d0, u0, u1];
  }
}

/** World cell (i, k) of the face-local cell (u, d). */
function faceCell(f: Face, u: number, d: number): [number, number] {
  const [x0, , z0] = faceBox(f, u, u + 1, d, d + 1);
  return [x0, z0];
}

type Carve = (i: number, j: number, k: number, color: number, moss?: number) => void;

function build(spec: ShrineSpec, seed: number, ruined: boolean): KitPiece {
  const p = new PieceBuilder();
  const m = new Mason({ seed, moss: spec.moss, stain: spec.stain });
  const g = p.voxels.grid({ cell: T, origin: [0, 0, 0], mat: 'sandstone', jitter: 0.05, ao: 0.3, seed });
  /** A carved detail cell (pediments, the bud): one tone per carved stone, so it reads as a shape. */
  const carve: Carve = (i, j, k, color, moss = 1) => g.set(i, j, k, color, 'sandstone', 1, m.surf(i, j, k, moss));

  const { cella } = spec;
  const dw = cella.doorHw;
  /** Half-width of the avant-corps that steps forward around every door. */
  const pw = Math.min(cella.hw, dw + 2);
  const baseTop = spec.base.reduce((a, b) => a + b.h, 0);
  const plinth = spec.base[spec.base.length - 1];
  const yc0 = baseTop;
  const yc1 = baseTop + cella.h;

  const faceRun = (f: Face, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, len: [number, number], s: StoneOpts = {}) => {
    const [x0, x1, z0, z1] = faceBox(f, u0, u1, d0, d1);
    if (f % 2 === 0) m.runX(x0, x1, y0, y1, z0, z1, len, s);
    else m.runZ(z0, z1, y0, y1, x0, x1, len, s);
  };
  const faceBlock = (f: Face, u0: number, u1: number, y0: number, y1: number, d0: number, d1: number, s: StoneOpts = {}) => {
    const [x0, x1, z0, z1] = faceBox(f, u0, u1, d0, d1);
    return m.block(x0, y0, z0, x1, y1, z1, s);
  };

  // Front stair, laid first so it cuts into the plinth courses laid after it.
  const tread = 3;
  for (let s = 0; s < spec.steps - 1; s++) {
    const y1 = Math.round(((s + 1) * baseTop) / spec.steps);
    const z0 = plinth.hw + (spec.steps - 2 - s) * tread;
    m.runX(-spec.stairHw, spec.stairHw, 0, y1, z0, z0 + tread, [3, 4], { moss: 1.3 });
    p.collider(-spec.stairHw * T, 0, z0 * T, spec.stairHw * T, y1 * T, (z0 + tread) * T);
  }

  // Stepped plinth: courses of 4–7 texel blocks around a core (longer ones in a tall course).
  let y = 0;
  spec.base.forEach((b, i) => {
    m.ring(b.hw, b.hw, y, y + b.h, 3, i, b.h > 4 ? [6, 8] : [4, 7], { moss: 1.25 });
    if (b.hw > 3) m.block(-b.hw + 3, y, -b.hw + 3, b.hw - 3, y + b.h, b.hw - 3);
    // (a ruin's lowest course loses a block: its colliders come with the ruin)
    if (!ruined || i > 0) p.collider(-b.hw * T, y * T, -b.hw * T, b.hw * T, (y + b.h) * T, b.hw * T);
    y += b.h;
  });

  /** Ledges that moss hangs from (half-width, texel row, strands), laid once the stone is worn. */
  const ledges: [number, number, number][] = [[spec.base[0].hw, spec.base[0].h - 1, ruined ? 8 : 6]];
  let top: number;
  if (ruined) top = ruin(p, m, g, spec, baseTop, seed, ledges);
  else {
    // Cella. The dark interior shows through the doorway; the door reveals are
    // darker stone (their fronts hide behind the avant-corps). The other three
    // faces get false doors: a closed panel in the avant-corps, framed like the door.
    const skin = Math.max(1, Math.min(3, cella.hw - dw));
    const inner = cella.hw - skin;
    if (inner > 0) m.block(-inner, yc0, -inner, inner, yc1, inner, { tones: SHRINE_CAVITY, surf: stoneSurf() });
    for (const s of [-1, 1]) faceBlock(0, s < 0 ? -pw : dw, s < 0 ? -dw : pw, yc0, yc0 + cella.doorH, cella.hw - skin, cella.hw, { tones: SHRINE_SHADOW, surf: stoneSurf({ stain: 0.3 }) });
    for (const f of FACES) if (f) faceBlock(f, -dw, dw, yc0, yc0 + cella.doorH, cella.hw, cella.hw + 1, { tones: SHRINE_PANEL, moss: 0.4 });
    let cy = yc0;
    courses(cella.doorH, 3)
      .concat(courses(cella.h - cella.doorH, 3))
      .forEach((h, c) => {
        const door = cy + h <= yc0 + cella.doorH;
        m.ring(cella.hw, cella.hw, cy, cy + h, skin, c + 1, [3, 6], { moss: 0.7 }, { front: door ? [-pw, pw] : undefined });
        // The avant-corps: one texel proud of the wall around each door.
        for (const f of FACES) {
          if (door) {
            faceRun(f, -pw, -dw, cy, cy + h, cella.hw, cella.hw + 1, [2, 3], { moss: 0.7 });
            faceRun(f, dw, pw, cy, cy + h, cella.hw, cella.hw + 1, [2, 3], { moss: 0.7 });
          } else faceRun(f, -pw, pw, cy, cy + h, cella.hw, cella.hw + 1, [3, 5], { moss: 0.7 });
        }
        cy += h;
      });
    // Door frames: colonnettes on a base and under a capital, and the lintel.
    const doorTop = yc0 + cella.doorH;
    for (const f of FACES) {
      const d0 = cella.hw + 1;
      for (const s of [-1, 1]) {
        const [a, b] = s < 0 ? [-dw - 1, -dw] : [dw, dw + 1];
        const [a2, b2] = s < 0 ? [-dw - 2, -dw] : [dw, dw + 2];
        faceBlock(f, a2, b2, yc0, yc0 + 1, d0, d0 + 1, { moss: 1.4 });
        faceBlock(f, a, b, yc0 + 1, doorTop - 1, d0, d0 + 1, { moss: 0.5 });
        faceBlock(f, a2, b2, doorTop - 1, doorTop, d0, d0 + 1, { moss: 0.8 });
      }
      faceBlock(f, -pw, pw, doorTop, Math.min(yc1, doorTop + 2), d0, d0 + 1, { moss: 0.9 });
    }
    p.collider(-(cella.hw + 2) * T, yc0 * T, -(cella.hw + 2) * T, (cella.hw + 2) * T, yc1 * T, (cella.hw + 2) * T);

    // Cornice: a course one texel proud all round, two over the avant-corps.
    const ch = cella.hw + 1;
    m.ring(ch, ch, yc1, yc1 + spec.cornice, 2, 0, [3, 6], { moss: 1.2 });
    m.block(-ch + 2, yc1, -ch + 2, ch - 2, yc1 + spec.cornice, ch - 2);
    for (const f of FACES) faceRun(f, -pw - 2, pw + 2, yc1, yc1 + spec.cornice, ch, ch + 1, [3, 5], { moss: 1.2 });
    y = yc1 + spec.cornice;

    // Roof tiers: smaller replicas of the storey — a body with its avant-corps
    // under a cornice one texel proud, whose shadow line sets each tier apart.
    spec.tiers.forEach((t, i) => {
      const body = Math.max(1, t.h - 1);
      if (t.hw > 2) {
        m.ring(t.hw, t.hw, y, y + body, 2, i, [3, 5], { moss: 0.8 });
        m.block(-t.hw + 2, y, -t.hw + 2, t.hw - 2, y + body, t.hw - 2);
      } else m.runX(-t.hw, t.hw, y, y + body, -t.hw, t.hw, [2, 4], { moss: 0.8 });
      const tp = Math.max(1, t.hw - 2);
      if (t.hw >= 3) for (const f of FACES) faceRun(f, -tp, tp, y, y + body, t.hw, t.hw + 1, [2, 4], { moss: 0.8 });
      if (t.h > 1) {
        m.ring(t.hw + 1, t.hw + 1, y + body, y + t.h, 2, i + 1, [3, 6], { moss: 1.1 });
        if (t.hw > 1) m.block(-t.hw + 1, y + body, -t.hw + 1, t.hw - 1, y + t.h, t.hw - 1);
      }
      y += t.h;
    });
    const roofTop = y;
    const t0 = spec.tiers[0];
    if (t0) p.collider(-(t0.hw + 1) * T, (yc1 + spec.cornice) * T, -(t0.hw + 1) * T, (t0.hw + 1) * T, roofTop * T, (t0.hw + 1) * T);
    if (spec.crown === 'cap') capStone(p, m, g, spec.cap, roofTop, 0, 0);
    if (spec.pediment) pediments(m, spec, pw, yc1 + spec.cornice, seed);
    // Antefixes: a small stone tower on each corner of the cornice.
    const yt = yc1 + spec.cornice;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const [x0, z0] = [sx < 0 ? -ch : ch - 1, sz < 0 ? -ch : ch - 1];
        if (!m.solid(x0, yt, z0)) m.block(x0, yt, z0, x0 + 1, yt + 2, z0 + 1, { moss: 1.2 });
      }
    top = roofTop + (spec.crown === 'bud' ? BUD.length : spec.cap.h);
    if (spec.crown === 'bud') lotusBud(p, roofTop, carve, seed);
    if (seed % 3 !== 0) nicheBuddha(p, yc0 * T, inner * T);
    ledges.push([ch, yc1 - 1, 11]);
  }

  // Weathering: chipped corners and plinth edges; the carved frames stay crisp.
  // (before the moss, so it grows on the worn stone)
  m.set.erode(spec.wear, seed + 11, {
    where: (x, yy, z) => ruined || yy / T < baseTop || Math.min(Math.abs(x), Math.abs(z)) / T > pw + 1,
  });
  // Olive moss cushions on the ledges: the plinth's, and on an intact shrine the cornice and tiers too.
  const reach = spec.base[0].hw + 1;
  mossCushions(g, m, [-reach, reach, 1, ruined ? top + 2 : baseTop + 1, -reach, reach + spec.steps * tread], ruined ? 0.35 : spec.moss * 0.6, seed + 7);
  // (not up the lotus bud: only round its foot)
  if (!ruined) mossCushions(g, m, [-reach, reach, baseTop + 1, spec.crown === 'bud' ? top - BUD.length : top, -reach, reach], spec.moss * 1.6, seed + 9);
  else {
    // The ruin's ledges are grown over: a felt of moss round the cushions, seedlings at the edges.
    const felt = new MossLayer(p, seed, (x, yy, z) => m.set.solidAt(x, yy, z) || g.has(Math.floor(x / T), Math.floor(yy / T), Math.floor(z / T)));
    felt.cover(m.set, 0.2, (_x, yy) => yy > baseTop * T - 0.01);
    felt.commit();
    sprouts(g, m, [-reach + 1, reach - 1, baseTop, top + 4, -reach + 1, reach - 1], seed);
  }
  const dr = rng(seed * 5 + 1);
  for (const [hw, row, n] of ledges) mossDrips(p, m, hw, row, n, dr);
  pores(p, m.set, seed, PORES, () => true, T / 2);
  joints(p, m.set, seed);
  m.set.emit(p.voxels, { seed, jitter: 0.09 });
  g.commit();
  return p.done();
}

/** Half-widths of a pointed gable of n rows on a base P wide: steep at the foot, pointed at the top. */
function gableRows(P: number, n: number): number[] {
  return Array.from({ length: n }, (_, r) => Math.max(1, Math.round(1 + (P - 1) * (1 - Math.pow(r / Math.max(1, n - 1), 1.6)))));
}

/**
 * The pointed pediments over the four doors, standing on the cornice: a
 * darker tympanum of stepped slabs against the tier behind, a paler frame one
 * texel proud tracing its outline, upturned naga ends at its feet and a small
 * relief figure (a deity under its arch) in the middle.
 */
function pediments(m: Mason, spec: ShrineSpec, pw: number, y0: number, seed: number): void {
  const d = spec.cella.hw + 1;
  const P = Math.min(pw, d - 2);
  const rows = gableRows(P, spec.pediment);
  const put = (f: Face, u0: number, u1: number, y: number, y1: number, dd: number, color: number, moss: number) => {
    const [x0, x1, z0, z1] = faceBox(f, u0, u1, dd, dd + 1);
    const [ci, ck] = faceCell(f, u0, dd);
    if (!m.solid(ci, y, ck)) m.block(x0, y, z0, x1, y1, z1, { color, moss });
  };
  for (const f of FACES) {
    // The frame in the palest tones, the tympanum in the shadow tones behind it.
    const frame = SHRINE_STONE[hash3(f, 1, 2, seed) < 0.5 ? 2 : 0];
    const ground = SHRINE_SHADOW[Math.floor(hash3(f, 3, 4, seed) * SHRINE_SHADOW.length)];
    rows.forEach((w, r) => {
      const y = y0 + r;
      put(f, -w, w, y, y + 1, d - 1, ground, 0.5);
      if (r === rows.length - 1) put(f, -w, w, y, y + 1, d, frame, 0.6);
      else for (const u of [-w, w - 1]) put(f, u, u + 1, y, y + 1, d, frame, 0.6);
    });
    for (const u of [-P - 1, P]) put(f, u, u + 1, y0, y0 + Math.min(2, rows.length), d, frame, 0.6);
    if (rows.length > 3) put(f, -1, 1, y0 + 1, y0 + 3, d, frame, 0.3);
  }
}

/** Lotus-bud crown: round courses swelling and closing to a point, and the finial pin. */
function lotusBud(p: PieceBuilder, y0: number, carve: Carve, seed: number): void {
  BUD.forEach((r, n) => {
    const color = SHRINE_STONE[Math.floor(hash3(n, 5, 9, seed) * SHRINE_STONE.length)];
    for (let i = -3; i < 3; i++) for (let k = -3; k < 3; k++) if (Math.hypot(i + 0.5, k + 0.5) <= r) carve(i, y0 + n, k, color, n === 2 ? 0.9 : 0.5);
  });
  const top = (y0 + BUD.length) * T;
  p.voxels.box(0, top + PIN / 2, 0, 0.045, PIN, 0.045, SHRINE_STONE[2], 'sandstone', { surf: stoneSurf({ stain: 0.3 }) });
}

/**
 * A little gilt Buddha seated at the back of the doorway on a stone pedestal,
 * a saffron sash over one shoulder, as in the wayside shrines at Angkor.
 */
function nicheBuddha(p: PieceBuilder, y: number, z: number): void {
  const gilt = fromSheet(0xb08a40);
  const b = (dy: number, dz: number, sx: number, sy: number, sz: number) => p.voxels.box(0, y + dy, z + dz, sx, sy, sz, gilt, 'brass');
  p.voxels.box(0, y + 0.025, z + 0.07, 0.2, 0.05, 0.13, SHRINE_STONE[3], 'sandstone', { surf: stoneSurf({ stain: 0.4 }) });
  b(0.075, 0.075, 0.17, 0.05, 0.1);
  b(0.16, 0.055, 0.1, 0.12, 0.065);
  b(0.26, 0.055, 0.07, 0.075, 0.065);
  b(0.31, 0.055, 0.03, 0.03, 0.03);
  p.voxels.box(0.005, y + 0.17, z + 0.09, 0.11, 0.03, 0.012, OFFERING.marigold[1], 'petal', { rz: 0.7 });
}

/** The square cap stone of a shrine whose finial has gone: only its socket is left. */
function capStone(p: PieceBuilder, m: Mason, g: VoxelGrid, cap: Storey, y0: number, cx: number, cz: number): void {
  socketStone(m, g, cx, y0, cz, cap.hw, cap.h, 0.8);
  p.collider((cx - cap.hw) * T, y0 * T, (cz - cap.hw) * T, (cx + cap.hw) * T, (y0 + cap.h) * T, (cz + cap.hw) * T);
}

/**
 * The shrine fallen in (the sheet's ④, bottom right): on the plinth, a
 * stepped mound of the big blocks the cella and its tower came down in, each
 * course set back from the one below, some shifted out of line or raised on
 * rubble, a few gone (a dark hollow shows where the doorway was), the old cap
 * stone askew on top. The plinth's lower course is still in place but for a
 * block pushed out at a corner, which lies in front of it with a few more
 * tumbled onto the ground. Adds its courses to `ledges` (for the moss hanging
 * from them) and returns the top (texels).
 */
function ruin(p: PieceBuilder, m: Mason, g: VoxelGrid, spec: ShrineSpec, y0: number, seed: number, ledges: [number, number, number][]): number {
  const r = rng(seed * 7 + 3);
  // A corner block of the lower course, knocked out towards the front.
  const low = spec.base[0];
  const side = r.chance(0.5) ? 1 : -1;
  const corner = m.set.find((x, yy, z) => yy < low.h * T && z > (low.hw - 3) * T && x * side > (low.hw - 5) * T);
  const [e, h0] = [low.hw * T, low.h * T];
  if (corner.length) {
    const { min, max } = m.set.boxOf(corner[0]);
    m.set.remove(corner[0]);
    p.collider(-e, 0, -e, e, h0, min[2]);
    p.collider(side > 0 ? -e : max[0], 0, min[2], side > 0 ? min[0] : e, h0, e);
  } else p.collider(-e, 0, -e, e, h0, e);

  let y = y0;
  let hw = spec.base[spec.base.length - 1].hw - 2;
  (spec.heap ?? []).forEach((h, c) => {
    for (const f of FACES) {
      // Front and back own the corners on even courses, the sides on odd ones.
      const end = (f % 2 === 0) === (c % 2 === 0) ? hw : hw - 3;
      let u = -end;
      while (u < end) {
        let l = r.int(5, 8);
        if (end - (u + l) < 3) l = end - u;
        const door = c === 0 && f === 0 && Math.abs(u + l / 2) < 3;
        if (!door && !r.chance(0.08)) {
          const [x0, x1, z0, z1] = faceBox(f, u, u + l, hw - 3, hw + (r.chance(0.25) ? 1 : 0));
          m.block(x0, y + (r.chance(0.12) ? 1 : 0), z0, x1, y + h, z1, { moss: 1.2 });
        }
        u += l;
      }
    }
    // Rubble fills the mound; in its lowest course, the dark hollow of the fallen cella.
    if (hw > 3) m.block(-hw + 3, y, -hw + 3, hw - 3, y + h, hw - 3, c === 0 ? { tones: SHRINE_CAVITY, surf: stoneSurf() } : { moss: 1.1 });
    p.collider(-hw * T, y * T, -hw * T, hw * T, (y + h) * T, hw * T);
    ledges.push([hw, y + h - 1, 3]);
    y += h;
    hw -= 3;
  });
  capStone(p, m, g, spec.cap, y, r.int(-1, 1), r.int(-1, 1));

  // Tumbled blocks: the corner block in front of its gap, the others around the plinth.
  tumbled(p, r, side * (e - 0.1), e + 0.22, [5, 3, 4]);
  for (const f of [1, 2, 3, 0] as Face[]) {
    // Somewhere along each side, a stride out from the plinth (never across the middle of the front).
    const u = r.range(-0.7, 0.7) * e;
    const d = e + r.range(0.2, 0.34);
    const [cx, cz] = f === 0 ? [u, d] : f === 1 ? [d, -u] : f === 2 ? [-u, -d] : [-d, u];
    if (f === 0 && Math.abs(cx) < 0.35) continue;
    tumbled(p, r, cx, cz, [r.int(4, 6), r.int(3, 4), r.int(3, 5)]);
  }
  return y + spec.cap.h;
}

/** A block (texels) come to rest at an angle on the ground at (x, z) metres, pores, moss and a collider with it. */
function tumbled(p: PieceBuilder, r: Rng, x: number, z: number, size: number[]): void {
  const [sx, sy, sz] = size.map((v) => v * T);
  const local = new VoxelBuilder().box(0, 0, 0, sx, sy, sz, r.pick(SHRINE_STONE), 'sandstone', { surf: stoneSurf({ moss: r.range(0.3, 0.45), stain: 0.35, lichen: 0.15 }) });
  const lo: [number, number, number] = [-sx / 2, -sy / 2, -sz / 2];
  const hi: [number, number, number] = [sx / 2, sy / 2, sz / 2];
  poreMarks(local, lo, hi, r, PORES, () => true, T / 2);
  mossOnTop(local, lo, hi, 0.35, r.int(0, 999));
  const tilt = restOnGround({ at: [x, 0, z], rot: [r.range(-0.3, 0.3), r.range(-0.7, 0.7), r.range(-0.3, 0.3)] }, lo, hi);
  placeTilted(p, local, tilt);
  tiltedColliders(p, tilt, lo, hi, 1);
}

/**
 * Moss hanging down the walls from a ledge, like the sheet's green streaks
 * under the cornice and over the plinth edges: thin strands one texel wide
 * pressed against the stone. Tries `n` spots along the faces (half-width hw)
 * starting at texel row `y` and runs each down while there is wall behind it.
 */
function mossDrips(p: PieceBuilder, m: Mason, hw: number, y: number, n: number, r: Rng): void {
  const th = 0.018;
  for (let t = 0; t < n; t++) {
    const f = r.int(0, 3) as Face;
    const u = r.int(-hw, hw - 1);
    const solid = (d: number, j: number) => {
      const [i, k] = faceCell(f, u, d);
      return m.solid(i, j, k);
    };
    let d = hw + 3;
    while (d > 0 && !solid(d - 1, y)) d--;
    if (d <= 0 || solid(d, y)) continue;
    let j = y;
    const len = r.int(2, 6);
    while (y - j < len && solid(d - 1, j) && !solid(d, j)) j--;
    const h = (y - j) * T;
    if (h < 2 * T) continue;
    const [x0, x1, z0, z1] = faceBox(f, u, u + 1, d, d + 1).map((v) => v * T);
    const w = r.range(0.7, 1) * T;
    const cy = (j + 1) * T + h / 2;
    const color = r.pick(MOSS_CLUMP);
    if (f === 0) p.voxels.box((x0 + x1) / 2, cy, z0 + th / 2, w, h, th, color, 'leaves');
    else if (f === 2) p.voxels.box((x0 + x1) / 2, cy, z1 - th / 2, w, h, th, color, 'leaves');
    else if (f === 1) p.voxels.box(x0 + th / 2, cy, (z0 + z1) / 2, th, h, w, color, 'leaves');
    else p.voxels.box(x1 - th / 2, cy, (z0 + z1) / 2, th, h, w, color, 'leaves');
  }
}

/** Seedlings rooting in the ruin's joints, out at the edges of its ledges: a stem and a few round leaves. */
function sprouts(g: VoxelGrid, m: Mason, box: [number, number, number, number, number, number], seed: number): void {
  const [i0, i1, j0, j1, k0, k1] = box;
  const r = rng(seed * 13 + 5);
  const solid = (i: number, j: number, k: number) => m.solid(i, j, k) || g.has(i, j, k);
  const leaves = [LEAF.bright[4], LEAF.bright[2], LEAF.jungle[3], LEAF.dark[4]];
  let placed = 0;
  for (let t = 0; t < 600 && placed < 6; t++) {
    const i = r.int(i0, i1);
    const k = r.int(k0, k1);
    let j = j1;
    while (j > j0 && !solid(i, j - 1, k)) j--;
    if (j <= j0 || solid(i, j, k)) continue;
    // Only where the ledge ends: open air beside and below the spot.
    const out = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([di, dk]) => !solid(i + di, j - 1, k + dk));
    if (!out.length) continue;
    placed++;
    const h = r.int(1, 2);
    for (let s = 0; s < h; s++) g.set(i, j + s, k, LEAF.dark[1], 'leaves');
    const [di, dk] = r.pick(out);
    const leaf = () => r.pick(leaves);
    g.set(i, j + h, k, leaf(), 'leaves');
    g.set(i + di, j + h, k + dk, leaf(), 'leaves');
    if (r.chance(0.6)) g.set(i - dk, j + h - 1, k + di, leaf(), 'leaves');
  }
}

export default defineKitAsset({
  section: '20',
  order: 4,
  name: 'Small shrine',
  caption: 'Small spirit shrine or devotional structure.',
  size: {
    real: '2.3 m tall on a 1.25 m plinth (1.8–2.4 m tall, 1.0–1.4 m wide)',
    sheet: 'not given',
    note: 'Wayside prasat shrines and neak ta spirit shrines at Angkor stand about head height to a little above; the sheet’s tall proportions (about twice as tall as wide) are kept.',
  },
  variants: [
    { id: 'prasat', name: 'Prasat shrine' },
    { id: 'square', name: 'Square shrine' },
    { id: 'narrow', name: 'Pillar shrine' },
    { id: 'ruined', name: 'Ruined shrine' },
  ],
  ref: { sheet: 'section 20/6706F03E-0DFA-4AFA-80F0-5C031D4F49D5.PNG', box: [916, 88, 1222, 398] },
  build: ({ variant, seed, height }) => {
    let base = SPECS[variant] ?? SPECS.prasat;
    // Every other prasat carries a fourth, smaller tier under its bud.
    if (base === SPECS.prasat && seed % 2 === 0) base = { ...base, tiers: [{ hw: 5, h: 3 }, { hw: 4, h: 3 }, { hw: 3, h: 3 }, { hw: 2, h: 3 }] };
    return build(height ? fitSpec(base, height) : base, seed, !!base.heap);
  },
});
