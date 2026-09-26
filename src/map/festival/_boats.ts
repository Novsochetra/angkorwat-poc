import { hash3 } from '../../voxel/random';
import { flag, garland } from './_decor';
import { ANIM, type Kit } from './_kit';

/**
 * Models of the Water Festival (kit boxes, metres, in their rig's space:
 * +z ahead, +x to the left, y = 0 the water line).
 *
 * - `dragonBoat`: a ngo, the long narrow racing boat of Bon Om Touk: a 20 m
 *   painted hull, a naga head rising at the bow and its tail at the stern,
 *   thwarts for nine pairs of rowers (their paddles swing with the boat's
 *   stroke), a drum at the front, the steering oar, the flag of Cambodia.
 *   `ROWERS` / `DRUMMER` / `CALLER` / `STEERER` say where the crew sits.
 * - `litFloat`: an illuminated float of the night (Loy Pratip): a barge
 *   with a frame of lights: Angkor Wat, the seven-headed naga or a lotus.
 */

/** Crew colours (shirts and paint), one per boat. */
export const CREWS = [
  { hull: 0xb8262a, band: 0xe8b84a, dots: 0xf4f0e6, shirt: 0xd8312a },
  { hull: 0x1f7a4a, band: 0xf0c850, dots: 0xf4f0e6, shirt: 0x2a9a5a },
  { hull: 0x1f4a9a, band: 0xe8b84a, dots: 0xf4f0e6, shirt: 0x3a6ad0 },
  { hull: 0xd89a1a, band: 0xb8262a, dots: 0x1f4a9a, shirt: 0xf0b030 },
];

/** Half length of the hull (m). */
const HALF = 10;
/** Floor top (m over the water) where the crew's feet rest, and the thwart top. */
export const FLOOR = 0.1;
/** Rower rows: along the boat (z), two a row (x ±). */
export const ROW_Z = Array.from({ length: 9 }, (_, i) => 6.2 - i * 1.45);
export const ROW_X = 0.55;
/** Where the drummer sits (facing aft), the caller stands at the bow (facing aft), the steerer at the stern. */
export const DRUMMER = { x: 0, y: FLOOR, z: 8.1 };
export const CALLER = { x: 0, y: 0.42, z: 9.2 };
export const STEERER = { x: 0, y: 0.42, z: -8.5 };

const halfBeam = (z: number) => 1.15 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(z) / (HALF + 0.4), 2.6)));
const sheer = (z: number) => 0.45 + 0.5 * Math.pow(Math.abs(z) / HALF, 3);

/** A dragon boat on rig `rig`, painted `crew`. */
export function dragonBoat(kit: Kit, rig: number, crew: (typeof CREWS)[number], seed: number): void {
  const o = { rig };
  const WOOD = 0x5c3a22;
  const DECK = 0x7a5232;
  // Hull: sides, floor and a gold band under the gunwale, in 0.8 m slices.
  const step = 0.8;
  for (let z = -HALF + step / 2; z < HALF; z += step) {
    const w = halfBeam(z);
    const top = sheer(z);
    const h = top + 0.32;
    const yc = top - h / 2;
    for (const sx of [-1, 1]) {
      kit.box(sx * (w - 0.06), yc, z, 0.13, h, step + 0.02, crew.hull, o);
      kit.box(sx * (w - 0.055), top - 0.07, z, 0.14, 0.12, step + 0.02, crew.band, o);
      // Painted scales / dots along the side.
      if (Math.round((z + HALF) / step) % 2 === 0) kit.box(sx * (w + 0.005), top - 0.26, z, 0.02, 0.1, 0.22, crew.dots, o);
    }
    kit.box(0, FLOOR - 0.05, z, Math.max(0.2, 2 * w - 0.2), 0.1, step + 0.02, DECK, o);
    // Keel under the water (seen from close by, through the clear water).
    kit.box(0, -0.3, z, Math.max(0.2, 2 * w - 0.5), 0.1, step + 0.02, crew.hull, o);
  }
  // Thwarts for the rowers.
  for (const z of ROW_Z) kit.box(0, FLOOR + 0.33, z - 0.25, 2 * halfBeam(z) - 0.22, 0.07, 0.3, WOOD, o);
  // Platforms for the caller and the steerer.
  kit.box(0, 0.36, CALLER.z, 0.9, 0.1, 0.9, DECK, o);
  kit.box(0, 0.36, STEERER.z, 0.9, 0.1, 1.0, DECK, o);

  // ── The naga's head at the bow: a neck rising forward, the head, crest and eyes ──
  const GOLD = 0xe8b84a;
  const neck: [number, number, number][] = [
    [HALF - 0.2, 0.95, 0.55],
    [HALF + 0.3, 1.25, 0.5],
    [HALF + 0.75, 1.6, 0.46],
    [HALF + 1.1, 1.95, 0.44],
    [HALF + 1.35, 2.3, 0.42],
  ];
  for (const [z, y, s] of neck) {
    kit.box(0, y, z, s, 0.5, 0.55, crew.hull, o);
    kit.box(0, y + 0.18, z - 0.1, s * 0.5, 0.3, 0.4, GOLD, o);
  }
  const hz = HALF + 1.75;
  const hy = 2.55;
  kit.box(0, hy, hz, 0.62, 0.5, 0.95, GOLD, o);
  // Upper jaw and snout, the lower jaw open, a red tongue.
  kit.box(0, hy + 0.05, hz + 0.65, 0.5, 0.28, 0.5, GOLD, o);
  kit.box(0, hy - 0.3, hz + 0.45, 0.42, 0.12, 0.6, crew.hull, o);
  kit.box(0, hy - 0.18, hz + 0.6, 0.12, 0.05, 0.4, 0xd02030, o);
  for (const sx of [-1, 1]) {
    // Eyes (white, dark pupil), the curled crest behind them, whiskers.
    kit.box(sx * 0.3, hy + 0.12, hz + 0.18, 0.05, 0.16, 0.2, 0xf8f4ea, o);
    kit.box(sx * 0.325, hy + 0.12, hz + 0.22, 0.04, 0.09, 0.1, 0x141010, o);
    kit.box(sx * 0.22, hy + 0.42, hz - 0.35, 0.1, 0.45, 0.25, crew.hull, { ...o, pitch: -0.5 });
    kit.box(sx * 0.3, hy - 0.2, hz + 0.75, 0.3, 0.04, 0.05, GOLD, { ...o, roll: sx * 0.4 });
  }
  // The crest: flames of gold up the back of the head.
  for (let i = 0; i < 4; i++) kit.box(0, hy + 0.35 + i * 0.12, hz - 0.1 - i * 0.22, 0.08, 0.35 - i * 0.05, 0.18, i % 2 ? crew.hull : GOLD, { ...o, pitch: -0.4 });
  // A marigold garland round the neck (offerings to the boat's spirit).
  garland(kit, -0.3, 1.9, HALF + 1.1, 0.3, 1.9, HALF + 1.1, 0.25, o);

  // ── The tail at the stern: rising and curling, a fan of gold ──
  const tail: [number, number, number][] = [
    [-HALF + 0.2, 0.95, 0.5],
    [-HALF - 0.25, 1.25, 0.42],
    [-HALF - 0.6, 1.62, 0.36],
    [-HALF - 0.85, 2.0, 0.3],
    [-HALF - 0.95, 2.4, 0.26],
  ];
  for (const [z, y, s] of tail) kit.box(0, y, z, s, 0.45, 0.45, crew.hull, o);
  for (let i = -1; i <= 1; i++) kit.box(0, 2.85, -HALF - 0.85 + i * 0.25, 0.08, 0.6, 0.18, GOLD, { ...o, pitch: i * 0.45 });

  // Drum at the front, gold bands.
  kit.box(0, FLOOR + 0.28, DRUMMER.z - 0.75, 0.5, 0.5, 0.5, 0xa82a22, o);
  for (const dy of [-0.2, 0.2]) kit.box(0, FLOOR + 0.28 + dy, DRUMMER.z - 0.75, 0.54, 0.05, 0.54, GOLD, o);
  kit.box(0, FLOOR + 0.54, DRUMMER.z - 0.75, 0.46, 0.02, 0.46, 0xe8dcc0, o);

  // Paddles: one per rower, outboard, swinging with the stroke (ANIM.paddle).
  for (const z of ROW_Z)
    for (const side of [1, -1]) {
      const px = side * (halfBeam(z) + 0.12);
      const py = 0.95;
      const pz = z + 0.3;
      const a: [number, number, number] = [px, py, pz];
      const b: [number, number, number, number] = [side, 0, 0, 0];
      kit.box(px, py - 0.7, pz, 0.06, 1.4, 0.06, 0x9a6a3a, { ...o, anim: ANIM.paddle, a, b });
      kit.box(px, py - 1.22, pz, 0.2, 0.46, 0.04, crew.hull, { ...o, anim: ANIM.paddle, a, b });
      kit.box(px, py + 0.02, pz, 0.05, 0.05, 0.16, 0x9a6a3a, { ...o, anim: ANIM.paddle, a, b });
    }

  // The steering oar over the stern, into the water.
  kit.box(-0.35, 0.9, -HALF - 0.4, 0.09, 0.09, 3.4, 0x8a5a32, { ...o, pitch: 0.42, yaw: 0.12 });
  kit.box(-0.55, -0.1, -HALF - 1.85, 0.05, 0.55, 0.7, 0x8a5a32, { ...o, pitch: 0.42, yaw: 0.12 });

  // The flag of Cambodia on a pole at the stern, a pennant in the crew's colour at the bow.
  kit.box(0.3, 1.5, -HALF + 0.9, 0.06, 2.6, 0.06, 0xd8c8a0, o);
  flag(kit, 0.3, 2.45, -HALF + 0.9, 1.1, 0.72, Math.PI, 'khmer', o);
  kit.box(0.25, 1.3, HALF - 1.2, 0.05, 1.8, 0.05, 0xd8c8a0, o);
  flag(kit, 0.25, 2.0, HALF - 1.2, 0.7, 0.35, Math.PI, crew.band, o);
  // Water off the bow and along the sides when she moves (ANIM.wake: the rig's speed).
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = HALF - 0.5 - i * 1.1;
      kit.box(sx * (halfBeam(z) + 0.25 + i * 0.22), 0.02, z, 0.35 + i * 0.1, 0.05, 0.9, 0xeef4f2, { ...o, anim: ANIM.wake, a: [hash3(i, sx, seed, 3), 0, 0] });
    }
    // (the wake behind: broken patches of foam, spreading and thinning out)
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      const r = hash3(i, sx, seed, 4);
      const s = (0.55 - 0.3 * u) * (0.7 + 0.6 * r);
      kit.box(sx * (0.4 + u * 2.4 + (r - 0.5) * 0.6), 0.02, -HALF - 0.8 - u * 9 - r * 0.8, s, 0.04, s * (1 + r), 0xe4eeee, { ...o, anim: ANIM.wake, a: [r, 0, 0] });
    }
  }
}

type Pt = [number, number];

/** Bulbs along a polyline (m, the frame's x, y), `gap` m apart. */
function bulbs(kit: Kit, rig: number, pts: Pt[], color: number, gap = 0.32, z = 0.3, size = 0.22, glow = 0.7): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / gap));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      kit.box(ax + (bx - ax) * u, ay + (by - ay) * u, z, size, size, size, color, { rig, glow });
    }
  }
  const [lx, ly] = pts[pts.length - 1];
  kit.box(lx, ly, z, size, size, size, color, { rig, glow });
}

/** A lotus-bud tower outline: base middle (x, y), height h, half width w. */
function tower(x: number, y: number, h: number, w: number): Pt[] {
  const pts: Pt[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const r = w * Math.pow(Math.max(0, 1 - u), 0.55) * (1 + 0.15 * Math.sin(u * Math.PI));
    pts.push([x - r, y + h * u]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const u = i / n;
    const r = w * Math.pow(Math.max(0, 1 - u), 0.55) * (1 + 0.15 * Math.sin(u * Math.PI));
    pts.push([x + r, y + h * u]);
  }
  return pts;
}

const circle = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, n = 16): Pt[] => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as Pt;
});

export type FloatKind = 'angkor' | 'naga' | 'lotus';

/**
 * An illuminated float on rig `rig`: the display faces +z. A dark barge
 * 13 × 5 m, a frame of poles, the picture in bulbs (warm gold, the flag's
 * blue and red at Angkor Wat's foot, green on the naga, pink on the lotus),
 * a string of lights round the deck.
 */
export function litFloat(kit: Kit, rig: number, kind: FloatKind): void {
  const o = { rig };
  const GOLD = 0xffc45a;
  const WARM = 0xffe0a0;
  kit.box(0, 0.1, 0, 13, 0.9, 5, 0x3a2a20, o);
  kit.box(0, 0.45, 2.52, 13, 0.18, 0.06, 0xa82a22, o);
  kit.box(0, 0.58, 0, 12.8, 0.08, 4.8, 0x5a4030, o);
  // The frame (dark, hard to see at night).
  for (const x of [-6.2, -3, 0, 3, 6.2]) kit.box(x, 5, -0.4, 0.1, 9, 0.1, 0x1c1a1c, o);
  kit.box(0, 9.4, -0.4, 12.6, 0.1, 0.1, 0x1c1a1c, o);
  // Lights round the deck.
  const edge: Pt[] = [
    [-6.4, 0.75],
    [6.4, 0.75],
  ];
  bulbs(kit, rig, edge, WARM, 0.55, 2.45, 0.18);
  if (kind === 'angkor') {
    // Base in the flag's colours, the gallery, five lotus-bud towers (the middle one tallest).
    bulbs(kit, rig, [[-6, 1.3], [6, 1.3]], 0x4a7aff);
    bulbs(kit, rig, [[-6, 1.7], [6, 1.7]], 0xff5a4a);
    bulbs(kit, rig, [[-5.4, 2.1], [-5.4, 3.3], [5.4, 3.3], [5.4, 2.1]], GOLD);
    for (let x = -4.8; x <= 4.8; x += 0.8) bulbs(kit, rig, [[x, 2.4], [x, 2.9]], WARM, 0.25);
    for (const [cx, by, h, w] of [
      [0, 3.3, 5.9, 1.15],
      [-2.5, 3.3, 4.3, 0.9],
      [2.5, 3.3, 4.3, 0.9],
      [-4.5, 3.3, 3.1, 0.7],
      [4.5, 3.3, 3.1, 0.7],
    ]) {
      bulbs(kit, rig, tower(cx, by, h, w), GOLD);
      for (const u of [0.3, 0.55, 0.75]) {
        const r = w * Math.pow(1 - u, 0.55) * (1 + 0.15 * Math.sin(u * Math.PI));
        bulbs(kit, rig, [[cx - r, by + h * u], [cx + r, by + h * u]], WARM, 0.36, 0.28, 0.18);
      }
      kit.box(cx, by + h + 0.2, 0.3, 0.3, 0.3, 0.3, 0xffffff, { rig, glow: 1.4 });
    }
  } else if (kind === 'naga') {
    // The seven heads fanned as a hood, the body in waves to the tail.
    const hx = -3.4;
    const hy = 6.0;
    bulbs(kit, rig, circle(hx, hy - 0.2, 2.35, Math.PI * 0.08, Math.PI * 0.92, 18), GOLD);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.12 + (0.76 * i) / 6);
      const x = hx + Math.cos(a) * 2.35;
      const y = hy - 0.2 + Math.sin(a) * 2.35;
      bulbs(kit, rig, circle(x, y, 0.42, 0, Math.PI * 2, 8), 0x9aff8a, 0.3, 0.3, 0.2);
      kit.box(x, y, 0.35, 0.22, 0.22, 0.22, 0xfff4c0, { rig, glow: 1.4 });
    }
    // The neck down to the body.
    bulbs(kit, rig, [[hx - 1.3, hy - 0.4], [hx - 0.9, 2.6], [hx, 1.9]], GOLD);
    bulbs(kit, rig, [[hx + 1.3, hy - 0.4], [hx + 0.9, 2.6]], GOLD);
    const body: Pt[] = [];
    for (let x = hx; x <= 5.6; x += 0.3) body.push([x, 2.4 + 0.75 * Math.sin((x - hx) * 1.15)]);
    body.push([5.9, 3.6], [5.5, 4.4], [5.0, 4.2]);
    bulbs(kit, rig, body, GOLD);
    bulbs(kit, rig, body.map(([x, y]) => [x, y - 0.45] as Pt), 0x9aff8a, 0.45, 0.28, 0.18);
  } else {
    // A lotus: five petals round a gold heart, a stem and two leaves.
    const cx = 0;
    const cy = 5.2;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.1 + 0.2 * i);
      const pts: Pt[] = [];
      for (let k = 0; k <= 16; k++) {
        const u = (k / 16) * Math.PI * 2;
        const lx = Math.sin(u) * 0.9;
        const ly = (1 - Math.cos(u)) * 1.6;
        pts.push([cx + Math.cos(a - Math.PI / 2) * lx + Math.cos(a) * ly * 1.05, cy + Math.sin(a - Math.PI / 2) * lx + Math.sin(a) * ly * 1.05]);
      }
      bulbs(kit, rig, pts, i === 2 ? 0xffb0c8 : 0xff8fb0);
    }
    bulbs(kit, rig, circle(cx, cy + 0.2, 0.55, 0, Math.PI * 2, 10), GOLD, 0.3, 0.3, 0.22);
    bulbs(kit, rig, [[cx, cy - 0.3], [cx, 1.4]], 0x8aff6a);
    bulbs(kit, rig, circle(cx - 2.6, 2.0, 1.5, Math.PI * 0.05, Math.PI * 0.95, 12), 0x8aff6a);
    bulbs(kit, rig, circle(cx + 2.6, 2.0, 1.5, Math.PI * 0.05, Math.PI * 0.95, 12), 0x8aff6a);
  }
  // Small flags on the corners.
  for (const sx of [-1, 1]) {
    kit.box(sx * 6.3, 1.6, 2.2, 0.05, 2.1, 0.05, 0xd8c8a0, o);
    flag(kit, sx * 6.3, 2.4, 2.2, 0.8, 0.5, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 'khmer', o);
  }
}
