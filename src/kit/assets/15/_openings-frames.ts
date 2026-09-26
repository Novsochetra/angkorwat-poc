import { coursesOf, FACE, overgrow, type FacadeWeather, type Ledge } from '../../lib/gallery';
import { balusterProfile, carve, doorCut, doorExtent, doorFrame, GLYPH, OPENINGS, pilasterGrow, turned, type DoorShape, type DoorSize, type MossTop } from '../../lib/openings';
import { WALL, type OpeningDraw, type WallOpening } from '../../lib/wall';
import { placePiece } from '../../place';
import { PieceBuilder } from '../../PieceBuilder';
import { here, snap, TEXEL } from '../../shapes';

/**
 * The frames of the §15 door and window pieces, drawn into the wall
 * library's openings (`WallOpening.draw`), so a door or a row of windows sits
 * in a run laid exactly like the other §15 segments — same plinth, string
 * courses, cornice, coping and stone — and tiles with them.
 *
 *  - {@link windowOpening}: Angkor Wat's baluster window at the kit size
 *    (1.375 × 1.625 m clear, 7 turned balusters nearly touching; or 1.0 ×
 *    1.375 m with 5), fitted to the §15 stack: the sill string is its sill,
 *    the head string its lintel (a fret carved along it), and stepped jambs
 *    stand as proud as the strings, so strings and jambs frame each window as
 *    one moulding, as the sheet draws them. Open (through the wall, balusters
 *    a quarter of the wall in) or blind (a dark recess, the balusters standing
 *    in it under a lowered stone blind).
 *  - {@link doorOpening}: lib/openings' door frame (threshold, jambs,
 *    lintels, colonnettes carrying a carved lintel, pilasters — the surround
 *    ≈ 3 × the clear width) at the ground, the explorer's level. The wall
 *    takes the surround's whole width out of its courses; the hook lays the
 *    wall back round the door and runs the plinth bands and string courses on
 *    to the pilasters, so the mouldings stop against them.
 */

const T = TEXEL;
const E = 1e-6;
/** How far window jambs stand out of the faces: as far as the string courses, so they meet flush. */
const JAMB = 0.125;
/** Depth of a blind window's recess. */
const BLIND_DEPTH = 0.25;

/** The kit's baluster windows fitted to the §15 stack (sill on the sill string, head under the head string). */
export const WINDOW_15 = {
  seven: { width: 1.375, height: 1.625, balusters: 7 },
  five: { width: 1.0, height: 1.375, balusters: 5 },
} as const;

export interface WindowSpec {
  x: number;
  /** A recess in the faces with the balusters standing in it, instead of a hole through the wall. */
  blind?: boolean;
  /** Faces a blind window is cut into (default both). */
  face?: 'front' | 'both';
  /** The standard window with 7 balusters (default) or the smaller one with 5. */
  type?: keyof typeof WINDOW_15;
}

/** A baluster window in a §15 run, centred on `x` (see the file header). */
export function windowOpening(o: WindowSpec): WallOpening {
  const s = WINDOW_15[o.type ?? 'seven'];
  const sill = WALL.window.sill;
  const head = sill + s.height;
  return {
    kind: o.blind ? 'blind' : 'window',
    x: o.x,
    width: s.width,
    sill,
    head,
    // (a shorter window keeps a head stone under the head string)
    frame: { side: WALL.window.frame, head: WALL.window.head - head, sill: 0 },
    depth: BLIND_DEPTH,
    face: o.face ?? 'both',
    balusters: s.balusters,
    draw: drawWindow,
  };
}

/** The string course of the stack whose underside is at `y` (the head string over a window), if any. */
const stringAt = (y: number) => WALL.strings.find((s) => Math.abs(s.y - y) < E);

function drawWindow(d: OpeningDraw): void {
  const { p, m, look, t, a, b, sill, head, oa, ob, oy0, oy1 } = d;
  const v = p.voxels;
  const through = d.kind === 'window';
  // Each face shown: its side (+1 front, −1 back) and the plane the frame starts from (the recess's back, or the far face).
  const faces: [1 | -1, number][] = through
    ? [[1, -t], [-1, t]]
    : d.cuts.map((c): [1 | -1, number] => (c[5] > t - E ? [1, c[2]] : [-1, c[5]]));
  // Jambs: two stones each, stepped — the outer half as proud as the strings, the inner a texel less.
  const split = snap(oy0 + (oy1 - oy0) * 0.55);
  const step = snap((a - oa) / 2);
  const jamb = (x0: number, x1: number, out: number) => {
    for (const [s, back] of through ? ([[1, -t]] as [1 | -1, number][]) : faces) {
      const [z0, z1] = through ? [-t - out, t + out] : s > 0 ? [back, t + out] : [-t - out, back];
      const closed = through ? 0 : s > 0 ? FACE.nz : FACE.pz;
      for (const [y0, y1] of [
        [oy0, split],
        [split, oy1],
      ])
        m.course([x0, y0, z0, x1, y1, z1], { length: [x1 - x0, x1 - x0], closed: closed | FACE.ny | FACE.py, face: s > 0 ? FACE.pz : FACE.nz, look });
    }
  };
  jamb(oa, oa + step, JAMB);
  jamb(oa + step, a, JAMB - T);
  jamb(b, ob - step, JAMB - T);
  jamb(ob - step, ob, JAMB);
  // A head stone under the head string when the window is shorter than the band.
  if (oy1 > head + E)
    for (const [s, back] of through ? ([[1, -t]] as [1 | -1, number][]) : faces) {
      const [z0, z1] = through ? [-t - JAMB + T, t + JAMB - T] : s > 0 ? [back, t + JAMB - T] : [-t - JAMB + T, back];
      m.course([a, head, z0, b, oy1, z1], { length: [b - a, b - a], closed: FACE.px | FACE.nx | FACE.py | (through ? 0 : s > 0 ? FACE.nz : FACE.pz), face: s > 0 ? FACE.pz : FACE.nz, look });
    }

  // Balusters nearly touching: through the wall a quarter of it in from the front; in a blind window standing in the recess.
  const w = b - a;
  const n = d.balusters;
  const pitch = w / n;
  const dia = Math.min(snap(pitch - T / 2, T / 4), 0.1875);
  const prof = balusterProfile(head - sill, dia);
  const lines: [1 | -1, number, number][] = through ? [[1, snap(t / 2), -t]] : faces.map(([s, back]) => [s, back + s * T, back]);
  for (const [s, bz, back] of lines) {
    for (let k = 0; k < n; k++) {
      const bx = a + (k + 0.5) * pitch;
      const one = look(bx, sill + (head - sill) / 2, bz);
      turned(v, bx, bz, sill, prof, () => one);
    }
    if (!through) stoneBlind(d, s, back, bz);
    // Moss on the sill inside the opening, in front of the balusters.
    if (s > 0) d.ledge(a, bz + dia / 2, b, t, sill);
  }
  if (through) p.collider(a, sill, snap(t / 2) - dia / 2, b, head, snap(t / 2) + dia / 2);

  // The head string over the window is its lintel: a running fret carved along it.
  const hs = stringAt(oy1);
  if (hs) {
    const width = ob - oa - 0.125;
    const count = Math.floor((width / (T / 2) - 2) / GLYPH.fret[0].length);
    const rows = GLYPH.fret.map((r) => r.repeat(count));
    const top = hs.y + hs.h / 2 + (rows.length * T) / 4;
    for (const [s] of faces) carve(v, s > 0 ? FACE.pz : FACE.nz, s * (t + hs.out), (oa + ob) / 2, top, rows, d.seed + Math.round(oa * 16));
  }
}

/**
 * A blind window's stone blind, as on Angkor Wat's false windows: lowered over
 * the top third of the balusters, horizontal slats stepping out to a rolled
 * edge, two tassel cords hanging from it.
 */
function stoneBlind(d: OpeningDraw, s: 1 | -1, back: number, line: number): void {
  const { p, look, a, b, sill, head } = d;
  const v = p.voxels;
  const src = here();
  const drop = snap((head - sill) * 0.36);
  const front = line + s * 0.125;
  const zspan = (f: number): [number, number] => (s > 0 ? [back, f] : [f, back]);
  const slats = Math.max(2, Math.floor((drop - 0.125) / (2 * T)));
  for (let i = 0; i < slats; i++) {
    const ya = head - (i + 1) * 2 * T;
    const l = look(a + i * 0.13, ya, front);
    const [z0, z1] = zspan(front - s * (T - ((i % 2) * T) / 2));
    v.span(a, ya, z0, b, ya + 2 * T, z1, l.color, 'sandstone', { shade: (l.shade ?? 1) * (0.9 + 0.04 * (i % 2)), surf: l.surf, src });
  }
  const rollTop = head - slats * 2 * T;
  const rl = look(a, rollTop, front);
  const [r0, r1] = zspan(front + s * T);
  v.span(a, Math.max(head - drop, rollTop - 0.125), r0, b, rollTop, r1, rl.color, 'sandstone', { shade: rl.shade, surf: rl.surf, src });
  for (const q of [0.25, 0.75]) {
    const tx = snap(a + (b - a) * q);
    const [c0, c1] = zspan(front);
    v.span(tx - T / 2, rollTop - 0.125 - 3 * T, s > 0 ? c1 - T : c0, tx + T / 2, rollTop - 0.125, s > 0 ? c1 : c0 + T, rl.color, 'sandstone', { shade: 0.95, surf: rl.surf, src });
  }
}

export interface DoorSpec {
  /** Centre along the run (default 0). */
  x?: number;
  size: DoorSize;
  /** The x-range of the run the door takes (default the surround's width): the hook lays the wall there. */
  span?: [number, number];
  /** The wall's weather: moss and grass on the surround's ledges. */
  weather: FacadeWeather;
  seed: number;
}

/** The surround's pilaster width, as lib/openings sizes it with the door (small / standard / main). */
const pilasterOf = (w: number) => (w >= 1.5 ? 0.5 : w <= 1.0 ? 0.25 : 0.375);

/** A doorway at ground level in a §15 run, with lib/openings' frame and carved surround (see the file header). */
export function doorOpening(o: DoorSpec): WallOpening {
  const shape: DoorShape = { x: o.x ?? 0, y: 0, size: o.size, wall: WALL.thickness };
  const ext = doorExtent(shape);
  const [za, zb] = o.span ?? [ext.x0, ext.x1];
  return {
    kind: 'door',
    x: (za + zb) / 2,
    // (a texel of "frame" each side, so the wall's plinth colliders there have a width)
    width: zb - za - 2 * T,
    frame: { side: T, head: 0, sill: 0 },
    sill: 0,
    head: doorCut(shape)[4],
    draw: (d) => drawDoor(d, o, shape),
  };
}

function drawDoor(d: OpeningDraw, o: DoorSpec, shape: DoorShape): void {
  const { p, m, look, t, oa, ob, oy1: top } = d;
  const cut = doorCut(shape);
  const ext = doorExtent(shape);
  const sides: [number, number][] = [
    [oa, cut[0]],
    [cut[3], ob],
  ].filter(([x0, x1]) => x1 - x0 > E) as [number, number][];

  // The wall round the frame: courses through the wall at the stack's levels, from the ends of the span to the jambs.
  const levels = [...new Set([0, ...plinthTops(), ...WALL.strings.flatMap((s) => [s.y, s.y + s.h]), top].filter((y) => y > -E && y < top + E))].sort((u, w) => u - w);
  let row = 0;
  for (let l = 0; l + 1 < levels.length; l++) {
    let y = levels[l];
    for (const h of coursesOf(levels[l + 1] - levels[l])) {
      for (const [x0, x1] of sides) m.course([x0, y, -t, x1, y + h, t], { row, length: [0.75, 1.25], closed: FACE.ny | FACE.py, look });
      y += h;
      row++;
    }
  }
  for (const [x0, x1] of sides) p.collider(x0, 0, -t, x1, top, t);

  // The plinth bands and string courses run on to the surround's pilasters (to their bases' edge below the shaft).
  const grow = pilasterGrow(pilasterOf(OPENINGS.door[o.size].width));
  const capital = top - OPENINGS.pillar.capital;
  const bands: [number, number, number][] = [];
  let y = 0;
  for (const [h, out] of WALL.plinth) (bands.push([y, y + h, out]), (y += h));
  for (const s of WALL.strings) if (s.y + s.h < top + E) bands.push([s.y, s.y + s.h, s.out]);
  const back: Ledge[] = [];
  for (const [y0, y1, out] of bands) {
    // (beside the pilaster's base or capital the band starts at their outer edge, else at the shaft's)
    const inset = y0 < OPENINGS.pillar.base - E || y1 > capital + E ? 0 : grow / 2;
    for (const [x0, x1] of [
      [oa, ext.x0 + inset],
      [ext.x1 - inset, ob],
    ]) {
      if (x1 - x0 < T - E) continue;
      for (const s of [1, -1] as const) {
        const [z0, z1] = s > 0 ? [t, t + out] : [-t - out, -t];
        m.course([x0, y0, z0, x1, y1, z1], { length: [0.5, 1.0], closed: FACE.ny | (s > 0 ? FACE.nz : FACE.pz), face: s > 0 ? FACE.pz : FACE.nz, look });
        p.collider(x0, y0, z0, x1, y1, z1);
      }
      d.ledge(x0, t, x1, t + out, y1);
      back.push({ x0: -x1, x1: -x0, z0: t, z1: t + out, y: y1, joints: [] });
    }
  }

  // The frame and its carved surround, in the wall's stone and masonry; their moss is the wall's.
  // (feet keep the threshold clear of the moss that settles on every other low stone top)
  const worn = (x: number, y: number, z: number) => {
    const l = look(x, y, z);
    return y < 0.25 && x > cut[0] && x < cut[3] ? { ...l, surf: [l.surf[0] * 0.1, l.surf[1], l.surf[2], l.surf[3] * 0.6] as const } : l;
  };
  const tops = doorFrame(p, { ...shape, seed: o.seed, look: worn, mason: m, moss: 0 });
  for (const q of tops) {
    if (q.edges & FACE.pz) d.ledge(q.x0, q.inner ? q.inner[3] : q.z0, q.x1, q.z1, q.y);
    if (q.edges & FACE.nz) back.push(backLedge(q));
  }
  // Ledges on the back face grow as if facing +Z, then turn round into place.
  const moss = o.weather.moss ?? 0;
  const grass = o.weather.grass ?? 0;
  if (back.length && (moss > 0 || grass > 0)) {
    const tmp = new PieceBuilder();
    overgrow(tmp, back, moss, grass, o.seed + 202);
    placePiece({ voxels: p.voxels }, tmp.done(), { x: 0, y: 0, z: 0, turn: 2 });
  }
}

/** The tops of the stack's plinth bands above the ground. */
function plinthTops(): number[] {
  let y = 0;
  return WALL.plinth.map(([h]) => (y += h));
}

/** A back-facing top as a ledge in the frame turned half round (x → −x, z → −z). */
function backLedge(q: MossTop): Ledge {
  const zIn = q.inner ? q.inner[1] : q.z1;
  return { x0: -q.x1, x1: -q.x0, z0: -zIn, z1: -q.z0, y: q.y, joints: [] };
}
