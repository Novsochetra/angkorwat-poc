import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import { SQUARE } from './plan';
import { GOLD, LAMP_HALO, LATERITE, pick, POST_STONE } from './_sqKit';

/**
 * The sala (សាលា, AWP-35) on the square's west side: an open wooden pavilion where people sit out of the sun or
 * the dew and watch, as at every pagoda and crossroads in Cambodia. A laterite and sandstone plinth with steps on
 * its east side (toward the square), eight red-brown lacquered posts on stone bases, beams, benches round three
 * sides, and a two-tiered roof of terracotta tiles: a hipped skirt, over it a gable roof on a dark band, a plain
 * ridge with a small Angkor tower finial in its middle (corbelled tiers, a gilt lotus bud). Khmer, never Thai: no
 * gable horns (chofa), no flame finials. Three small lanterns hang inside from the tie beams; their flames glow.
 *
 * Where: `SALA` (between the square's west trees, outside its edge; the zip line's last station is 26 m north-west).
 * Built in the square's builder (stone and bark: no draw of its own); its ground is occupied (trees keep off).
 */
export const SALA = { x: SQUARE.x - SQUARE.rx - 10.5, z: SQUARE.z - 0.5, w: 6.4, d: 8.8 } as const;

const TILE = [0xa8492e, 0x9e4229, 0xb25234, 0x963d26];
const TILE_DARK = [0x7e3220, 0x76301e, 0x873724];
const LACQUER = [0x6e2e22, 0x652a1f, 0x763325];
const PLANK = [0x8a5a3a, 0x7f5235, 0x93613f];

export function buildSala(b: VoxelBuilder, field: HeightField, lamps: Lamps, bulbs: Lamps, glow: Glow | null, low: boolean): number {
  const src = traceSource();
  const n0 = b.boxes.length;
  const { x: cx, z: cz, w, d } = SALA;
  const g = Math.min(field.heightAt(cx - w / 2, cz - d / 2), field.heightAt(cx + w / 2, cz + d / 2), field.heightAt(cx - w / 2, cz + d / 2), field.heightAt(cx + w / 2, cz - d / 2));
  const lat = (i: number, k = 0) => pick(LATERITE, i, k, 1, 120);
  const st = (i: number, k = 0) => pick(POST_STONE, i, k, 2, 120);
  const tile = (i: number) => pick(TILE, i, cz, 3, 120);
  // ── The plinth: a laterite course (sunk into the land), a sandstone top with a lip ──
  const ph = 0.75;
  b.box(cx, g + 0.12, cz, w, 0.7, d, lat(0), 'mapStone', { src, shade: 0.95 });
  b.box(cx, g + ph - 0.12, cz, w + 0.16, 0.24, d + 0.16, st(1), 'mapStone', { src, shade: 1.04 });
  const fy = g + ph;
  // Steps down the east side, middle (three, 0.25 m each).
  for (let k = 0; k < 3; k++) {
    const x = cx + w / 2 + 0.2 + k * 0.4;
    const top = fy - 0.25 * (k + 1);
    b.box(x, (top + g - 0.2) / 2, cz, 0.42, top - g + 0.2, 2.8, k % 2 ? lat(k + 3) : st(k + 3), 'mapStone', { src, shade: 1 - 0.03 * k });
  }
  // Cheek walls either side of the steps.
  for (const sd of [-1, 1]) b.box(cx + w / 2 + 0.6, g + 0.35, cz + sd * 1.6, 1.25, 0.7, 0.36, st(7, sd), 'mapStone', { src });
  // ── Posts on stone bases, beams ──
  const px = w / 2 - 0.45;
  const zs = [-d / 2 + 0.5, -d / 6 + 0.16, d / 6 - 0.16, d / 2 - 0.5];
  const postH = 2.7;
  for (const sd of [-1, 1])
    for (const [k, dz] of zs.entries()) {
      const x = cx + sd * px;
      const z = cz + dz;
      b.box(x, fy + 0.12, z, 0.38, 0.24, 0.38, st(10 + k, sd), 'mapStone', { src });
      b.box(x, fy + 0.24 + postH / 2, z, 0.24, postH, 0.24, pick(LACQUER, x, z, 4, 120), 'mapBark', { src });
      // (a gilt band near the top, as on pagoda posts)
      b.box(x, fy + postH - 0.2, z, 0.28, 0.1, 0.28, pick(GOLD, x, z, 5, 120), 'mapStone', { src, shade: 0.95 });
    }
  const by = fy + 0.24 + postH;
  for (const sd of [-1, 1]) b.box(cx + sd * px, by + 0.12, cz, 0.28, 0.24, d - 0.6, pick(LACQUER, sd, 0, 6, 120), 'mapBark', { src });
  for (const dz of zs) b.box(cx, by + 0.32, cz + dz, w - 0.6, 0.18, 0.22, pick(LACQUER, dz, 1, 7, 120), 'mapBark', { src, shade: 0.95 });
  // ── Benches: along the west side and both ends (the east is open to the square) ──
  const seat = (x: number, z: number, sx: number, sz: number) => {
    b.box(x, fy + 0.42, z, sx, 0.08, sz, pick(PLANK, x, z, 8, 120), 'mapBark', { src, shade: 1.03 });
    for (const t of [-0.4, 0.4]) b.box(x + (sx > sz ? t * sx : 0), fy + 0.2, z + (sz > sx ? t * sz : 0), 0.14, 0.38, 0.14, pick(PLANK, x, t, 9, 120), 'mapBark', { src, shade: 0.85 });
  };
  seat(cx - px + 0.45, cz, 0.5, d - 2.2);
  for (const sd of [-1, 1]) seat(cx - 0.2, cz + sd * (d / 2 - 0.95), w - 2.4, 0.5);
  // ── The roof: a hipped skirt of tiles stepping in, a dark band, the gable roof over it, the ridge ──
  let y = by + 0.42;
  let hx = w / 2 + 1.0;
  let hz = d / 2 + 1.0;
  // (the eave's fascia: a lacquer board, gilt along its foot)
  b.box(cx, y + 0.02, cz, hx * 2 + 0.06, 0.06, hz * 2 + 0.06, pick(GOLD, cx, cz, 10, 120), 'mapStone', { src, shade: 0.92 });
  for (let k = 0; k < 4; k++) {
    b.box(cx, y + 0.13, cz, hx * 2, 0.22, hz * 2, k % 2 ? tile(k) : pick(TILE_DARK, k, 0, 11, 120), 'mapStone', { src, shade: 1 - 0.02 * k });
    y += 0.22;
    hx -= 0.36;
    hz -= 0.3;
  }
  // The band between the tiers (dark, set back).
  b.box(cx, y + 0.18, cz, hx * 2 - 0.3, 0.36, hz * 2 - 0.3, pick(LACQUER, 0, 0, 12, 120), 'mapBark', { src, shade: 0.75 });
  y += 0.36;
  // The gable roof: overhanging the band, its slopes stepping to the ridge along z.
  let gx = hx + 0.35;
  const gz = hz + 0.15;
  const steps = 7;
  const dx = (gx - 0.3) / steps;
  b.box(cx, y + 0.02, cz, gx * 2 + 0.06, 0.06, gz * 2 + 0.06, pick(GOLD, cx, cz, 13, 120), 'mapStone', { src, shade: 0.92 });
  for (let k = 0; k < steps; k++) {
    b.box(cx, y + 0.13, cz, gx * 2, 0.22, gz * 2, k % 2 ? tile(k + 20) : pick(TILE_DARK, k, 1, 14, 120), 'mapStone', { src, shade: 1 + 0.01 * k });
    y += 0.22;
    gx -= dx;
  }
  // The gable ends: a lacquer board set into each stepped triangle, gilt lotus at its peak.
  for (const sd of [-1, 1]) {
    const z = cz + sd * (gz + 0.01);
    for (let k = 1; k < steps; k++) {
      const yy = y - 0.22 * (steps - k) + 0.11;
      const ww = 2 * (0.3 + dx * (steps - k)) - 0.3;
      if (ww > 0.2) b.box(cx, yy, z, ww, 0.22, 0.04, pick(LACQUER, k, sd, 15, 120), 'mapBark', { src, shade: 0.9 });
    }
    b.box(cx, y - 0.4, z + sd * 0.02, 0.3, 0.3, 0.04, pick(GOLD, cx, sd, 16, 120), 'mapStone', { src, shade: 1.05 });
  }
  // The ridge (plain), and the small Angkor tower in its middle.
  b.box(cx, y + 0.08, cz, 0.36, 0.16, gz * 2 + 0.1, pick(TILE_DARK, 0, 2, 17, 120), 'mapStone', { src });
  let ty = y + 0.16;
  for (const [k, [ww, hh]] of (
    [
      [0.62, 0.22],
      [0.48, 0.2],
      [0.36, 0.18],
      [0.24, 0.16],
    ] as const
  ).entries()) {
    b.box(cx, ty + hh / 2, cz, ww, hh, ww, k % 2 ? st(30 + k) : pick(GOLD, k, 3, 18, 120), 'mapStone', { src, shade: 1 + 0.02 * k });
    ty += hh;
  }
  b.box(cx, ty + 0.1, cz, 0.12, 0.2, 0.12, pick(GOLD, cx, cz, 19, 120), 'mapStone', { src, shade: 1.1 });

  // ── Three lanterns hanging from the tie beams' middles ──
  for (const dz of [zs[1], zs[2], 0]) {
    const z = cz + dz;
    const top = by + 0.23;
    const ly = top - 0.75;
    b.box(cx, (top + ly + 0.2) / 2, z, 0.03, top - ly - 0.2, 0.03, 0x2a2420, 'mapStone', { src });
    b.box(cx, ly + 0.2, z, 0.3, 0.06, 0.3, pick(GOLD, cx, z, 20, 120), 'mapStone', { src });
    b.box(cx, ly - 0.2, z, 0.3, 0.06, 0.3, pick(GOLD, cx, z, 21, 120), 'mapStone', { src });
    b.box(cx, ly - 0.28, z, 0.1, 0.1, 0.1, pick(GOLD, cx, z, 22, 120), 'mapStone', { src, shade: 1.08 });
    lamps.add([cx, ly, z], 0.28, 1);
    glow?.add(cx, ly, z, LAMP_HALO, 2.4, { level: 0.85 });
  }
  // String lights along the east eave (the square's side), medium and up.
  if (!low) {
    const ex = cx + w / 2 + 1.0 - 0.05;
    for (let z = cz - d / 2 - 0.6; z <= cz + d / 2 + 0.6; z += 0.6) bulbs.add([ex, by + 0.3 - 0.05 * Math.sin(((z - cz) / d) * Math.PI + Math.PI / 2), z], 0.1, 0.8 + 0.4 * hash3(ex, z, 1, 121));
  }
  field.occupy(cx - w / 2 - 1.2, cz - d / 2 - 0.4, cx + w / 2 + 1.6, cz + d / 2 + 0.4);
  return b.boxes.length - n0;
}
