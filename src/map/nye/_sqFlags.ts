import { Sphere, Vector3, type Group } from 'three';
import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { ANIM, Kit, perPeriod, type KitUniforms } from '../festival/_kit';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { FLAG_ASPECT, FLAG_BLUE, FLAG_RED, FLAG_WHITE, flagCell } from '../roam/_flag';
import { GATE, SQUARE } from './plan';
import { GOLD, LATERITE, pick, POST_STONE } from './_sqKit';
import { ARCH, AVENUE, KERB_LAMP, layAvenue } from './_sqWalk';

/**
 * The national celebration (AWP-35): the flag of Cambodia everywhere on the way in, as on a national day in Phnom
 * Penh — blue, the red band, Angkor Wat in white with its THREE towers (roam/_flag.ts `flagCell`; five is the
 * 1979–89 flag). All cloth is in a festival kit of its own (`_kit.ts`: one draw, waving in its shader, `ANIM.wave`
 * as the square's banners, the same program), no shadow:
 *
 * - a row of flags on slim white poles down both sides of the avenue (`_sqWalk.ts` `AVENUE`), in pairs facing
 *   each other, between the kerb lamps (every 4.5 m; 9 m on low), and bunting of small flags strung across the
 *   avenue between the first pairs near the gate;
 * - two tall flagpoles (13 m) with big flags on stepped laterite bases, flanking the gate outside;
 * - pairs of flags round the square's edge between its banners and stalls (θ 30°, 58°, 122°, 150°).
 *
 * All flags fly the same way (the evening breeze from the east: the cloth west of its pole). The avenue itself (its
 * pavers, lamps, fire bowls, the welcome arch) is laid here too (`layAvenue`), so square.ts makes one call.
 * Poles: the walk's builder (`wb`, stone) by the avenue, the square's (`b`) round the square and at the gate.
 */

export interface WayIn {
  object: Group;
  /** The floor's builder (pavers: no walk map, no shadow), the square's and the walk's. */
  fb: VoxelBuilder;
  b: VoxelBuilder;
  wb: VoxelBuilder;
  field: HeightField;
  u: KitUniforms;
  lamps: Lamps;
  /** Soft warm lights (the string lights' bulbs): the glow strips along the kerbs. */
  bulbs: Lamps;
  glow: Glow | null;
  low: boolean;
}

/** The cloth flies toward −x (west). */
const DIR = -Math.PI / 2;
/** Waving at about 2.4 rad/s (a whole number of turns in the kit's period); the bunting quicker. */
const WAVE = perPeriod(2.4);
const FLUTTER = perPeriod(3.6);
const POLE = [0xe6e2d8, 0xdcd8ce, 0xeeeae0];
const WIRE = 0x2a2420;

export function raiseFlags(o: WayIn): { blocks: number; kitBoxes: number } {
  const { object, fb, b, wb, field, u, lamps, bulbs, glow, low } = o;
  const src = traceSource();
  const b0 = b.boxes.length + wb.boxes.length;
  const avenue = layAvenue(fb, wb, field, lamps, bulbs, glow, low);
  const kit = new Kit();
  const spots: Vector3[] = [];

  // ── The avenue's rows: pairs of flags facing each other, between the kerb lamps ──
  const every = low ? 9 : 4.5;
  const pairs: { z: number; top: number }[] = [];
  for (let z = AVENUE.z0 + 4.45; z < ARCH.z - 1.2; z += every) {
    let top = 0;
    let both = true;
    for (const sd of [-1, 1]) {
      const x = AVENUE.x + sd * (KERB_LAMP + 0.75);
      if (!avenue.free(x, z)) {
        both = false;
        continue;
      }
      top = slimPole(wb, field, x, z, 4.6, src);
      flag(kit, x, top - 0.12, z, DIR, 1.3, low, 2.2 * sd + z);
      field.occupy(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
      spots.push(new Vector3(x, top, z));
    }
    if (both) pairs.push({ z, top });
  }
  // Bunting across the avenue between the first pairs (from the gate: three strings on medium, two on low).
  for (const p of pairs.slice(0, low ? 2 : 3))
    bunting(kit, { x: AVENUE.x - KERB_LAMP - 0.75, y: p.top - 0.55, z: p.z }, { x: AVENUE.x + KERB_LAMP + 0.75, y: p.top - 0.55, z: p.z }, 0.55, low);

  // ── Two tall flagpoles flanking the gate outside ──
  for (const sd of [-1, 1]) {
    const x = GATE.x + sd * 11.5;
    const z = GATE.z + 4.6;
    const g = field.heightAt(x, z);
    for (const [k, [w, h]] of (
      [
        [1.7, 0.36],
        [1.25, 0.32],
        [0.8, 0.3],
      ] as const
    ).entries()) {
      const y = g + [0, 0.36, 0.68][k];
      b.box(x, y + h / 2 - (k ? 0 : 0.12), z, w, h + (k ? 0 : 0.24), w, k === 1 ? pick(POST_STONE, x, z, k, 95) : pick(LATERITE, x, z, k, 95), 'mapStone', { src, shade: 0.96 + 0.04 * k });
    }
    const h = 13;
    b.box(x, g + 0.98 + h / 2, z, 0.2, h, 0.2, pick(POLE, x, z, 4, 95), 'mapStone', { src, shade: 1.02 });
    b.box(x, g + 0.98 + h + 0.1, z, 0.34, 0.2, 0.34, pick(GOLD, x, z, 5, 95), 'mapStone', { src, shade: 1.05 });
    b.box(x, g + 0.98 + h + 0.32, z, 0.18, 0.24, 0.18, pick(GOLD, x, z, 6, 95), 'mapStone', { src, shade: 1.1 });
    flag(kit, x, g + 0.98 + h - 0.15, z, DIR, 3.4, low, 40 + sd, true);
    field.occupy(x - 1, z - 1, x + 1, z + 1);
    spots.push(new Vector3(x, g + h, z));
  }

  // ── Round the square's edge: pairs of flags between its banners and stalls ──
  for (const th of [30, 58, 122, 150]) {
    const a = (th * Math.PI) / 180;
    for (const off of [-0.032, 0.032]) {
      const x = SQUARE.x + Math.cos(a + off) * SQUARE.rx * 1.07;
      const z = SQUARE.z + Math.sin(a + off) * SQUARE.rz * 1.07;
      const g = field.heightAt(x, z);
      b.box(x, g + 0.15, z, 0.4, 0.3, 0.4, pick(LATERITE, x, z, 1, 96), 'mapStone', { src });
      const top = slimPole(b, field, x, z, 5.4, src);
      flag(kit, x, top - 0.12, z, DIR, 1.5, low, th + off * 50);
      field.occupy(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
      spots.push(new Vector3(x, top, z));
    }
  }

  const km = kit.build('nye:flags', u);
  km.show(true);
  km.mesh.castShadow = false;
  const s = new Sphere().setFromPoints(spots);
  s.radius += 4;
  km.mesh.geometry.boundingSphere = s;
  km.mesh.frustumCulled = true;
  object.add(km.mesh);
  const blocks = b.boxes.length + wb.boxes.length - b0;
  console.info(
    `[map] nye way in: ${blocks + avenue.pavers} blocks (pavers ${avenue.pavers}, avenue ${avenue.blocks}, poles ${blocks - avenue.blocks}) · ${avenue.lights.length} lamps and fires · flags kit ${km.boxes} boxes`,
  );
  return { blocks: blocks + avenue.pavers, kitBoxes: km.boxes };
}

/** A slim white flagpole with a gilt knob (its foot on the land); returns its top (m). */
export function slimPole(b: VoxelBuilder, field: HeightField, x: number, z: number, h: number, src: SourceTrace | undefined): number {
  const g = field.heightAt(x, z);
  b.box(x, g + 0.08, z, 0.3, 0.24, 0.3, pick(POST_STONE, x, z, 1, 97), 'mapStone', { src, shade: 0.95 });
  b.box(x, g + h / 2, z, 0.09, h, 0.09, pick(POLE, x, z, 2, 97), 'mapStone', { src, shade: 1.02 });
  b.box(x, g + h + 0.07, z, 0.16, 0.14, 0.16, pick(GOLD, x, z, 3, 97), 'mapStone', { src, shade: 1.08 });
  return g + h;
}

/**
 * The flag of Cambodia on its pole: the hoist at (x, z), its top edge at `top`, `w` m out toward `dir`, as tall
 * as the flag's 25 : 16 says; columns of runs of `flagCell` colours (the temple's white a little proud of the red,
 * so it reads), waving.
 */
export function flag(kit: Kit, x: number, top: number, z: number, dir: number, w: number, low: boolean, seed: number, big = false): void {
  const h = w / FLAG_ASPECT;
  // (fine enough across for the temple's three spires to stand apart: a blob of white is not Angkor Wat)
  const cols = big ? (low ? 25 : 37) : low ? 19 : 25;
  const rows = big ? (low ? 24 : 36) : low ? 16 : 24;
  const yaw = dir - Math.PI / 2;
  const s = Math.sin(dir);
  const c = Math.cos(dir);
  const phase = hash3(x, z, seed, 7) * 6.28;
  const du = w / cols;
  const dv = h / rows;
  const at = (col: number, row: number) => flagCell(col / cols, row / rows, (col + 1) / cols, (row + 1) / rows);
  for (let col = 0; col < cols; col++) {
    const u0 = col * du;
    const cx = x + s * (u0 + du / 2);
    const cz = z + c * (u0 + du / 2);
    let r0 = 0;
    while (r0 < rows) {
      const color = at(col, r0);
      let r1 = r0 + 1;
      while (r1 < rows && at(col, r1) === color) r1++;
      const hh = (r1 - r0) * dv;
      const white = color === FLAG_WHITE;
      kit.box(cx, top - r0 * dv - hh / 2, cz, du + 0.002, hh + 0.002, white ? 0.045 : 0.025, color, { yaw, anim: ANIM.wave, a: [big ? 0.05 : 0.08, u0, WAVE], b: [phase, 0, 0, 0] });
      r0 = r1;
    }
  }
}

/**
 * Bunting from p to q sagging `sag` m: the cord in short straight pieces, small flags of Cambodia hanging from it
 * every 0.5 m (blue, red, blue, the white temple a dot on the red), fluttering.
 */
function bunting(kit: Kit, p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }, sag: number, low: boolean): void {
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  const yaw = Math.atan2(q.x - p.x, q.z - p.z) - Math.PI / 2;
  const yAt = (t: number) => p.y + (q.y - p.y) * t - sag * 4 * t * (1 - t);
  const pieces = Math.max(3, Math.round(len / 1.2));
  for (let i = 0; i < pieces; i++) {
    const t0 = i / pieces;
    const t1 = (i + 1) / pieces;
    const x0 = p.x + (q.x - p.x) * t0;
    const x1 = p.x + (q.x - p.x) * t1;
    const z0 = p.z + (q.z - p.z) * t0;
    const z1 = p.z + (q.z - p.z) * t1;
    const y0 = yAt(t0);
    const y1 = yAt(t1);
    kit.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, y1 - y0, z1 - z0), 0.025, 0.025, WIRE, { yaw, roll: Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0)) });
  }
  const n = Math.max(2, Math.round(len / (low ? 0.75 : 0.5)));
  const fw = 0.34;
  const fh = fw / FLAG_ASPECT;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = p.x + (q.x - p.x) * t;
    const z = p.z + (q.z - p.z) * t;
    const y = yAt(t) - 0.02;
    // (each little flag hangs below the cord, its face across the avenue's line: seen walking up it)
    const o = { yaw, anim: ANIM.wave, a: [0.12, 0, FLUTTER] as [number, number, number], b: [hash3(x, z, i, 9) * 6.28, 0, 0, 0] as [number, number, number, number] };
    kit.box(x, y - fh * 0.125, z, fw, fh * 0.25, 0.02, FLAG_BLUE, o);
    kit.box(x, y - fh * 0.5, z, fw, fh * 0.5, 0.02, FLAG_RED, o);
    kit.box(x, y - fh * 0.875, z, fw, fh * 0.25, 0.02, FLAG_BLUE, o);
    if (!low) kit.box(x, y - fh * 0.48, z, fw * 0.36, fh * 0.26, 0.03, FLAG_WHITE, o);
  }
}
