import { RigDef } from './_things';

/**
 * Other players' rides, cheap (people/_scenePlayers.ts): a few boxes of the people's things each (`_things.ts`: one
 * InstancedMesh for all), in world metres at the explorer's size (`ROAM_SCALE` 1.4: his boat, glider, canopy and
 * balloon are drawn that big), the rig's origin at the player's feet (`PeerState` x, y, z; facing +z). Their bicycles
 * are the village bicycle (`_bicycle.ts`). Far simpler than his own (block models of hundreds of cells): enough to
 * read as a boat, a hang glider, a canopy, a balloon from where another player sees them.
 */

/** The explorer's size: his rides are drawn this much over their true size. */
const K = 1.4;
type V3 = [number, number, number];

/** A tube (box) from a to b, `w` thick. */
function tube(d: RigDef, a: V3, b: V3, w: number, color: number, glow = 0): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  // (a box along z turned YXZ: direction (sin ry · cos rx, −sin rx, cos ry · cos rx))
  d.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w, w, len], color, { rot: [-Math.asin(dy / len), Math.atan2(dx, dz), 0], glow });
}

const TEAK = 0x6b4426;
const TEAK_DARK = 0x4a2c18;
const CAP = 0xc08652;

/** A wooden boat (the explorer's dugout, 3.2 m true): he sits on its floor, the feet point just over it. 11 boxes. */
export function playerBoatDef(): RigDef {
  const d = new RigDef();
  const L = 3.2 * K;
  const B = 0.45 * K;
  d.box([0, -0.2, 0], [B * 1.5, 0.14, L * 0.9], TEAK_DARK)
    .box([0, -0.12, 0], [B * 1.7, 0.04, L * 0.82], 0x5c3419)
    .box([B, 0.02, 0], [0.1, 0.4, L * 0.86], TEAK)
    .box([-B, 0.02, 0], [0.1, 0.4, L * 0.86], TEAK)
    .box([B + 0.02, 0.23, 0], [0.15, 0.05, L * 0.86], CAP)
    .box([-B - 0.02, 0.23, 0], [0.15, 0.05, L * 0.86], CAP)
    .box([B + 0.06, 0.12, 0], [0.014, 0.07, L * 0.84], 0xa8352a)
    .box([-B - 0.06, 0.12, 0], [0.014, 0.07, L * 0.84], 0xa8352a)
    .box([0, 0.05, L * 0.47], [B * 1.2, 0.42, 0.42], TEAK)
    .box([0, 0.38, L * 0.52], [0.16, 0.4, 0.22], CAP)
    .box([0, 0.04, -L * 0.47], [B * 1.2, 0.38, 0.4], TEAK);
  return d;
}

/** The hang glider's sail and its blue leading edge (the explorer's: cream silk, the flag's blue). */
const SILK = [0xf1e5cb, 0xebdec2] as const;
const BLUE = 0x0a3092;
const TUBE = 0x8a8c90;

/**
 * A hang glider over a pilot lying face down along +z (people/_scenePlayers.ts tips him: `GLIDE_PITCH`): the delta
 * sail in four steps a side (its chord narrowing to the tips, swept back, a little anhedral), the blue leading edges,
 * the keel, the king post, the A-frame down to the control bar by his shoulders. 15 boxes.
 */
export function playerGliderDef(): RigDef {
  const d = new RigDef();
  const half = 4.75 * K;
  const back = 2.47 * K;
  const root = 2.6 * K;
  const tip = 0.95 * K;
  // (the keel over his back, the nose ahead of his head)
  const keelY = 2.5;
  const nose = 1.3 + 1.35 * K;
  const STEPS = 4;
  for (let j = 0; j < STEPS; j++) {
    const xc = ((j + 0.5) / STEPS) * half;
    const u = xc / half;
    const le = nose - u * back;
    const chord = root + (tip - root) * u;
    for (const side of [1, -1]) d.box([side * xc, keelY - 0.04 - u * 0.32, le - chord / 2], [half / STEPS + 0.04, 0.05, chord], SILK[j % 2]);
  }
  for (const side of [1, -1]) tube(d, [0, keelY, nose], [side * half, keelY - 0.36, nose - back], 0.11, BLUE);
  tube(d, [0, keelY + 0.02, nose], [0, keelY + 0.02, nose - 3.2 * K], 0.07, TUBE);
  tube(d, [0, keelY, 1.3 + 0.28 * K], [0, keelY + 0.95 * K, 1.3 + 0.28 * K], 0.05, TUBE);
  // (the A-frame: down from the keel to the bar under his chest, the bar across)
  const apex: V3 = [0, keelY, 1.3 + 0.28 * K];
  const barY = keelY - 1.7 * K;
  const barZ = 1.3 + 0.42 * K + 0.25;
  for (const side of [1, -1]) tube(d, apex, [side * 0.85 * K, barY, barZ], 0.05, TUBE);
  tube(d, [-0.85 * K, barY, barZ], [0.85 * K, barY, barZ], 0.05, TUBE);
  return d;
}

/** The pilot lies this far tipped forward (rad) under the hang glider. */
export const GLIDE_PITCH = 1.38;

/**
 * The parachute's canopy (the explorer's: nine cells of cream silk, blue in the middle) arched over the pilot hanging
 * upright, and its four lines down to his shoulders. 13 boxes.
 */
export function playerChuteDef(): RigDef {
  const d = new RigDef();
  const N = 9;
  const span = 6.9 * K;
  const chord = 2.15 * K;
  const top = 1.55 + 4.1 * K;
  const R = 7.2;
  const cell = span / N;
  for (let j = 0; j < N; j++) {
    const a = ((j - (N - 1) / 2) * cell) / R;
    const color = j === 4 ? BLUE : j === 3 || j === 5 ? 0xf4ead6 : SILK[j % 2];
    d.box([R * Math.sin(a), top - R * (1 - Math.cos(a)), 0], [cell + 0.06, 0.28, chord], color, { rot: [0, 0, -a] });
  }
  const end = (span / 2 - cell / 2) / R;
  const mid = (span / 6) / R;
  for (const a of [end, mid, -mid, -end]) tube(d, [Math.sign(a) * 0.22, 1.5, 0], [R * Math.sin(a), top - R * (1 - Math.cos(a)) - 0.16, 0], 0.025, 0x33291f);
  return d;
}

/** The balloon's cloth by layer, bottom up (the flag's blue and red; the red band round its widest). */
const BALLOON_CLOTH = [0x1a3a9a, 0x1a3a9a, 0xc8202e, 0xd02a36, 0xc8202e, 0x1a3a9a, 0x1f44a8, 0x1a3a9a] as const;
/** The burner's flame (box `BALLOON_FLAME` of the balloon: it glows while the player climbs). */
export const BALLOON_FLAME = 0;

/**
 * A hot air balloon (the explorer's: 8.4 m across, its crown 12.65 m over the basket floor, true size): the envelope
 * in eight layers of two crossed slabs each (an octagon a layer, swelling to its widest then rounding over), the
 * flame (box 0), the burner frame, four cables, the wicker basket round the player's feet. 24 boxes.
 */
export function playerBalloonDef(): RigDef {
  const d = new RigDef();
  d.box([0, 2.05 * K + 0.2, 0], [0.24, 0.42, 0.24], 0xffb050, { glow: 1 });
  d.box([0, 2.05 * K, 0], [0.9, 0.08, 0.9], 0x3a3a3e);
  const throat = 3.45 * K;
  const equator = 8.65 * K;
  const crown = 12.65 * K;
  const r = 4.2 * K;
  const L = BALLOON_CLOTH.length;
  for (let j = 0; j < L; j++) {
    const y0 = throat + ((crown - throat) * j) / L;
    const y1 = throat + ((crown - throat) * (j + 1)) / L;
    const y = (y0 + y1) / 2;
    // (a teardrop: from the mouth out to the widest at the equator, a round cap above)
    const rr = y < equator ? 1.0 + (r - 1.0) * Math.sin(((y - throat) / (equator - throat)) * (Math.PI / 2)) ** 0.8 : r * Math.sqrt(Math.max(0.04, 1 - ((y - equator) / (crown - equator)) ** 2));
    const w = rr * 1.72;
    d.box([0, y, 0], [w, y1 - y0 + 0.02, w], BALLOON_CLOTH[j]).box([0, y, 0], [w, y1 - y0 + 0.01, w], BALLOON_CLOTH[j] === 0x1a3a9a ? 0x23459e : 0xb81c2a, { rot: [0, Math.PI / 4, 0] });
  }
  const bx = 0.55 * K;
  const bz = 0.5 * K;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) tube(d, [sx * bx, 0.62 * K, sz * bz], [sx * 0.7, throat + 0.1, sz * 0.7], 0.035, 0x5a4a3a);
  d.box([0, 0.31 * K - 0.12, 0], [bx * 2, 0.62 * K, bz * 2], 0xa8864a).box([0, 0.62 * K, 0], [bx * 2 + 0.08, 0.08, bz * 2 + 0.08], 0x6a4a2a);
  return d;
}

/** A party member's mark: a small gold diamond turning over the head (glows a little, more at night). */
export function partyMarkDef(): RigDef {
  return new RigDef().box([0, 0, 0], [0.2, 0.2, 0.2], 0xffcc4a, { glow: 0.55, rot: [Math.PI / 4, 0, Math.PI / 4] });
}
