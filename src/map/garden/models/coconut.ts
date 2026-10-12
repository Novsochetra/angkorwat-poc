import { registerModel } from '../look';
import type { PlantLook } from '../state';
import {
  COCO_RING,
  COCO_SHAFT,
  COCO_TRUNK,
  DEAD_FROND,
  FLOWER,
  FROND,
  FROND_OLD,
  FROND_YOUNG,
  HUSK,
  HUSK_DARK,
  NUT_GREEN,
  NUT_TURNING,
  PalmKit,
  palmR,
  SHEATH,
  fallenSpot,
  frond,
  mixHex,
  pick,
  strap,
  witherOf,
  type Wither,
} from './_palmKit';

/**
 * The coconut palm ដូង (garden/kinds.ts `KINDS.coconut`; the contract: garden/look.ts),
 * stage by stage, as the map's own coconut palms (veg/palms.ts `coconutPalm`) in
 * the garden's blocks:
 *
 * - 0: the classic sprouting coconut: a brown husked nut lying half in the earth,
 *   a green shoot of three folded leaves from its eye end;
 * - 1: the nut still at the foot, a fan of young undivided leaves (two broad lobes
 *   opening like a fish's tail);
 * - 2: a fan of young feather fronds straight from the ground (the youngest still
 *   undivided), no trunk;
 * - 3: a young palm: a short thick trunk, a crown of a dozen fronds;
 * - 4: grown (≈ 11 m): the slender ringed grey trunk leaning out and curving back
 *   up, the olive crown shaft, a crown of long arching feather fronds (the oldest
 *   yellowing, a dead one hanging), bunches of green coconuts under it (the ripe
 *   ones turning yellow-brown and falling: `fallen` lie round the foot, under the
 *   crown's side, drawn smooth by the view: garden/_viewFruit.ts); just picked, a
 *   flower spathe and a bunch of young buttons.
 *
 * Thirsty (`droop`), the fronds hang and pale (1) or go limp and yellow-brown (2);
 * dead, a dry brown sprawl, nothing green.
 */

/** The map's coconut trunks catch more light than a bark block of their colour (veg/palms.ts): this much lighter. */
const BARK = 1.15;

/** The coconut's seeded numbers' salt, how far out its fallen nuts roll (m). */
const SALT = 23;
const FALL_REACH = 2.0;

/**
 * Where fallen coconut `i` lies (local m: x, z), as the model lays it: toward the trunk's lean (`la`: `K.r(3)`), up
 * to `FALL_REACH` out (_palmKit.ts `fallenSpot`). roam/_gardenWork.ts goes there to pick it up.
 */
export function fallenAt(look: PlantLook, i: number): [number, number] {
  const r = palmR(look.seed, SALT);
  return fallenSpot(r, look.fallen, r(3) * Math.PI * 2, FALL_REACH, i);
}

registerModel('coconut', (b, look) => {
  const K = new PalmKit(b, look.seed, SALT);
  const W = witherOf(look);
  if (look.stage === 0) sprout(K, W);
  else if (look.stage === 1) seedling(K, W);
  else if (look.stage === 2) young(K, W);
  else palm(K, look, W);
});

/** The husked nut lying on its side, half in the earth, its eye end (where the shoot comes) toward its +x (turned `yaw`). */
function nut(K: PalmKit, x: number, y: number, z: number, yaw: number, old: number): void {
  const c = pick(HUSK, K.r(2));
  // Along the nut (its eye end a little up), and level across it.
  const tilt = 0.16;
  const dx = Math.cos(tilt) * Math.cos(yaw);
  const dy = Math.sin(tilt);
  const dz = -Math.cos(tilt) * Math.sin(yaw);
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  // (three-cornered and blunt: a block and its twin turned a quarter about its length)
  K.beam(x - dx * 0.15, y - dy * 0.15, z - dz * 0.15, x + dx * 0.15, y + dy * 0.15, z + dz * 0.15, 0.24, 0.22, hx, 0, hz, c, 'petal', 0.95 - 0.12 * old);
  K.beam(x - dx * 0.135, y - dy * 0.135, z - dz * 0.135, x + dx * 0.135, y + dy * 0.135, z + dz * 0.135, 0.21, 0.21, hx * 0.7, 0.7, hz * 0.7, c, 'petal', 0.88 - 0.12 * old);
  // The eye end, darker.
  K.beam(x + dx * 0.12, y + dy * 0.12, z + dz * 0.12, x + dx * 0.19, y + dy * 0.19, z + dz * 0.19, 0.13, 0.13, hx, 0, hz, HUSK_DARK, 'petal', 1 - 0.1 * old);
}

/** Stage 0: the sprouting coconut. */
function sprout(K: PalmKit, W: Wither): void {
  const yaw = K.r(1) * Math.PI * 2;
  nut(K, 0, 0.04, 0, yaw, 0);
  // The shoot from the eye end: its sheath, then three folded leaves fanning up and out.
  K.mark();
  const ex = 0.12 * Math.cos(yaw);
  const ez = -0.12 * Math.sin(yaw);
  K.beam(ex, 0.1, ez, ex, 0.28, ez, 0.075, 0.07, Math.cos(yaw), 0, -Math.sin(yaw), W.dead ? 0x7d6341 : pick(SHEATH, K.r(3)), 'mapLeaf', 0.95);
  for (let i = 0; i < 3; i++) {
    const az = yaw + 0.6 + i * 2.1 + (K.r(10 + i) - 0.5) * 0.5;
    const el = (W.dead ? 0.5 : 1.32 - 0.12 * i) - W.sag * 0.6;
    const len = (0.5 - 0.08 * i + K.r(20 + i) * 0.08) * (W.dead ? 0.8 : 1);
    const c = W.tint(pick(FROND_YOUNG, K.r(30 + i)), K.r(40 + i));
    strap(K, ex, 0.27, ez, az, el, 0, len, 0.11, 0.9 * W.bend, c, 1, 3, 0.75, true);
  }
}

/** Stage 1: the nut at the foot, a fan of young leaves, each two broad pleated lobes opening like a fish's tail. */
function seedling(K: PalmKit, W: Wither): void {
  const yaw = K.r(1) * Math.PI * 2;
  nut(K, -0.06 * Math.cos(yaw), 0.02, 0.06 * Math.sin(yaw), yaw, 0.6);
  K.mark();
  const fx = 0.06 * Math.cos(yaw);
  const fz = -0.06 * Math.sin(yaw);
  K.block(fx, 0.17, fz, 0.15, 0.34, 0.15, yaw, W.dead ? 0x7d6341 : pick(SHEATH, K.r(3)), 'mapLeaf', 0.92);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const az = yaw + i * 2.39996 + (K.r(10 + i) - 0.5) * 0.4;
    const el = 1.38 - 0.55 * u - W.sag * (0.7 + u);
    const len = 0.7 + 0.35 * Math.sin(Math.PI * u) + K.r(20 + i) * 0.12;
    const c = W.tint(pick(u < 0.3 ? FROND_YOUNG : FROND, K.r(30 + i)), K.r(40 + i));
    // (its stalk, then the blade)
    const pl = 0.18;
    const ce = Math.cos(el);
    K.beam(fx, 0.3, fz, fx + Math.sin(az) * ce * pl, 0.3 + Math.sin(el) * pl, fz + Math.cos(az) * ce * pl, 0.05, 0.04, Math.cos(az), 0, -Math.sin(az), c, 'mapLeaf', 0.9);
    strap(K, fx + Math.sin(az) * ce * pl, 0.3 + Math.sin(el) * pl, fz + Math.cos(az) * ce * pl, az, el - 0.1, (K.r(50 + i) - 0.5) * 0.4, len, 0.34, (0.6 + 0.35 * u) * W.bend, c, 1, 4, 0.3, false, 0.45);
  }
}

/** Stage 2: a fan of young fronds from the ground (the youngest still undivided). */
function young(K: PalmKit, W: Wither): void {
  const turn = K.r(1) * Math.PI * 2;
  // The swollen foot, green-brown, wrapped in the fronds' sheaths.
  K.block(0, 0.2, 0, 0.36, 0.5, 0.36, turn, W.dead ? 0x7d6341 : pick(SHEATH, K.r(3)), 'mapLeaf', 0.9);
  K.block(0, 0.24, 0, 0.32, 0.5, 0.32, turn + Math.PI / 4, W.dead ? 0x6f573a : pick(SHEATH, K.r(4)), 'mapLeaf', 0.84);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const az = turn + i * 2.39996 + (K.r(10 + i) - 0.5) * 0.3;
    const el = 1.3 - 1.0 * u + (K.r(20 + i) - 0.5) * 0.1 - W.sag * (0.6 + u);
    const len = 1.55 + 0.6 * Math.sin(Math.PI * Math.min(1, u * 1.3)) + (K.r(30 + i) - 0.5) * 0.2;
    const bend = (0.25 + 0.2 * u) * W.bend;
    const c = W.tint(pick(u < 0.2 ? FROND_YOUNG : FROND, K.r(40 + i)), K.r(50 + i));
    // (the youngest still a bifid leaf; the others split into leaflets)
    if (i === 0) strap(K, 0, 0.4, 0, az, el, 0, len * 0.75, 0.32, bend, c, 1, 4, 0.3, false, 0.5);
    else frond(K, 0, 0.38, 0, az, el, (K.r(60 + i) - 0.5) * 0.3, len, 0.6, bend, c, 0.95 + K.r(70 + i) * 0.1, { segs: 4, pairs: 10, rib: c, hang: W.hang, tip: W.dead ? 0.6 : 1 });
  }
}

/** Stages 3 and 4: the palm with its trunk, crown and (grown) coconuts. */
function palm(K: PalmKit, look: PlantLook, W: Wither): void {
  const grown = look.stage === 4;
  const turn = K.r(1) * Math.PI * 2;
  // Height of the trunk to the crown, its lean (the top over the foot, m), its girth.
  const h = grown ? 7.3 + K.r(2) * 0.8 : 1.25;
  const la = K.r(3) * Math.PI * 2;
  const ld = grown ? 1.0 + K.r(4) * 0.6 : 0.12;
  const lx = Math.sin(la) * ld;
  const lz = Math.cos(la) * ld;
  const girth = grown ? 1 : 1.25;
  const at = (t: number): [number, number, number] => {
    const k = 2 * t - t * t;
    return [lx * k, h * t, lz * k];
  };
  // The swollen bole.
  K.mark();
  const bark = (c: number) => (W.dead ? mixDry(c) : c);
  K.block(0, 0.2, 0, 0.62 * girth, 0.7, 0.62 * girth, turn, bark(COCO_TRUNK[2]), 'mapBark', BARK * 0.92);
  K.block(0, 0.2, 0, 0.58 * girth, 0.66, 0.58 * girth, turn + Math.PI / 4, bark(COCO_TRUNK[2]), 'mapBark', BARK * 0.86);
  // The trunk in lengths along its curve, a ring (the old leaves' scars) at each joint.
  const n = grown ? Math.round(h / 0.6) : 2;
  for (let i = 0; i < n; i++) {
    const [ax, ay, az] = at(i / n);
    const [bx, by, bz] = at((i + 1) / n);
    const f = (i + 0.5) / n;
    const wd = (0.42 - 0.12 * f) * girth;
    const sp = turn + i * 0.3;
    K.beam(ax, ay, az, bx, by, bz, wd, wd, Math.cos(sp), 0, -Math.sin(sp), bark(pick(COCO_TRUNK, K.r(10 + i))), 'mapBark', BARK * (1 - 0.06 * f), 0.04);
    if (i > 0) {
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const l = Math.hypot(dx, dy, dz);
      const r = sp + Math.PI / 4;
      K.beam(ax - (dx / l) * 0.03, ay - (dy / l) * 0.03, az - (dz / l) * 0.03, ax + (dx / l) * 0.03, ay + (dy / l) * 0.03, az + (dz / l) * 0.03, wd + 0.035, wd + 0.035, Math.cos(r), 0, -Math.sin(r), bark(COCO_RING), 'mapBark', BARK);
    }
  }
  const [cx, cy, cz] = at(1);
  // The crown shaft (the fronds' bases wrapped round it).
  K.block(cx, cy + 0.12, cz, 0.5 * girth, 0.62, 0.5 * girth, turn, W.dead ? 0x7d6341 : COCO_SHAFT, 'mapLeaf', 0.9);
  K.block(cx, cy + 0.16, cz, 0.46 * girth, 0.6, 0.46 * girth, turn + Math.PI / 4, W.dead ? 0x6f573a : COCO_SHAFT, 'mapLeaf', 0.84);

  // Coconuts (grown, alive): bunches under the fronds on their stalks; or, just picked, a flower spathe and buttons.
  if (grown && !W.dead) nuts(K, look, cx, cy, cz, turn);

  // Fronds: spiralling, the upper ones rising and arching over, the middle spreading, the old hanging and yellowing.
  K.mark();
  const N = grown ? 16 + Math.floor(K.r(5) * 3) : 11;
  const lenK = grown ? 1 : 0.68;
  const scale = grown ? 1 : 0.8;
  const pairs = grown ? 14 : 11;
  const segs = grown ? 6 : 5;
  for (let k = 0; k < N; k++) {
    const u = (k + 0.5) / N;
    const el = 1.2 - 1.8 * u + (K.r(100 + k) - 0.5) * 0.15 - W.sag * (0.5 + u);
    const az = turn + k * 2.39996 + (K.r(110 + k) - 0.5) * 0.3;
    const len = (3.6 + 1.3 * Math.sin(Math.PI * Math.min(1, u * 1.3)) + (K.r(120 + k) - 0.5) * 0.5) * lenK * (W.dead ? 0.85 : 1);
    const bend = (0.1 + 0.18 * u + (K.r(130 + k) - 0.5) * 0.04) * W.bend / lenK;
    const tones = u < 0.1 ? FROND_YOUNG : u > 0.82 ? FROND_OLD : FROND;
    // (a little sunnier than the map's colours: its fronds glow with the light through them, veg/palms.ts)
    const c = W.tint(mixHex(pick(tones, K.r(160 + k)), 0xb4c050, 0.14), K.r(165 + k));
    frond(K, cx, cy + 0.35, cz, az, el, (K.r(140 + k) - 0.5) * 0.3, len, scale * (0.9 + K.r(150 + k) * 0.2), bend, c, 0.92 + K.r(170 + k) * 0.14, { segs, pairs, rib: c, hang: W.hang, tip: W.dead ? 0.6 : 1 });
  }
  // The spear: the next frond, still folded, standing up out of the crown.
  if (!W.dead) {
    const sp = W.tint(FROND_YOUNG[1], K.r(180));
    K.beam(cx, cy + 0.3, cz, cx + 0.08, cy + 0.3 + (grown ? 1.7 : 1.1), cz - 0.05, 0.1, 0.08, 1, 0, 0, sp, 'mapLeaf', 1.04);
  }
  // A dead frond or two hanging down the trunk (grown).
  if (grown) {
    const nd = 1 + (K.r(6) < 0.5 ? 1 : 0);
    for (let k = 0; k < nd; k++) {
      const az = turn + 2 + k * 2.5;
      const c = pick(DEAD_FROND, K.r(210 + k));
      frond(K, cx, cy + 0.1, cz, az, -1.3 - K.r(180 + k) * 0.15, (K.r(190 + k) - 0.5) * 0.4, 3.0 + K.r(200 + k) * 0.5, 0.75, 0.04, c, 0.95, { segs: 4, pairs: 7, rib: c, tip: 0.7, hang: 0.3 });
    }
  }
  // (ripe coconuts lying on the ground, fallen toward its side: drawn smooth by the view where `fallenAt` says,
  // garden/_viewFruit.ts — one oval husk each, not a block)
}

/** Coconut bunches under the crown (green; turning yellow-brown when ripe), or a flower spathe and young buttons. */
function nuts(K: PalmKit, look: PlantLook, cx: number, cy: number, cz: number, turn: number): void {
  K.mark();
  const ripe = look.fruit === 2 || look.fallen > 0;
  if (look.fruit === 0) {
    // Just picked: a boat-shaped spathe opening, its flower spike, a few small buttons.
    const az = turn + 1.2;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    K.beam(cx + dx * 0.2, cy + 0.05, cz + dz * 0.2, cx + dx * 0.75, cy - 0.45, cz + dz * 0.75, 0.16, 0.1, -dz, 0, dx, FLOWER[0], 'petal', 0.95);
    K.beam(cx + dx * 0.3, cy, cz + dz * 0.3, cx + dx * 0.7, cy - 0.6, cz + dz * 0.7, 0.07, 0.07, -dz, 0, dx, FLOWER[2], 'petal', 1.05);
    for (let k = 0; k < 3; k++) {
      const a = az + 2.4 + (k - 1) * 0.5;
      K.block(cx + Math.sin(a) * 0.36, cy - 0.2 - (k % 2) * 0.1, cz + Math.cos(a) * 0.36, 0.12, 0.13, 0.12, a, NUT_GREEN[1], 'petal', 1);
    }
    return;
  }
  // (bunches round the crown, so some show from every side)
  const bunches = 3;
  for (let c = 0; c < bunches; c++) {
    const az = turn + 0.8 + c * 2.1 + K.r(20 + c) * 0.7;
    const dx = Math.sin(az);
    const dz = Math.cos(az);
    const n = 6 + Math.floor(K.r(30 + c) * 3);
    // (the bunch's stalk, out and down from the crown shaft)
    K.beam(cx + dx * 0.15, cy + 0.05, cz + dz * 0.15, cx + dx * 0.52, cy - 0.5, cz + dz * 0.52, 0.07, 0.07, -dz, 0, dx, 0x9a8a50, 'mapLeaf', 1);
    for (let k = 0; k < n; k++) {
      const a = az + (k - n / 2) * 0.38;
      const rr = 0.5 + (k % 2) * 0.14;
      // Ripe: the oldest few of the bunch turning yellow-brown.
      const hex = ripe && k < 1 + c ? pick(NUT_TURNING, K.r(40 + k + c * 9)) : pick(NUT_GREEN, K.r(50 + k + c * 9));
      K.turned(cx + Math.sin(a) * rr, cy - 0.52 - (k % 3) * 0.16, cz + Math.cos(a) * rr, 0.29, 0.32, 0.29, (K.r(60 + k) - 0.5) * 0.3, a, (K.r(70 + k) - 0.5) * 0.3, hex, 'petal', 1.08 + K.r(80 + k) * 0.12);
    }
  }
}

/** A dead palm's trunk: greyer and paler. */
const mixDry = (c: number): number => mixHex(c, 0x80766a, 0.25);
