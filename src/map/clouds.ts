import { Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry } from 'three';
import { hash3 } from '../voxel/random';
import { MAP_BOUNDS } from './layout';
import { buildBackdrop, RING_CENTRE } from './sky/backdrop';
import { HAZE, WIND } from './sky/haze';
import { mistBankMaterial, mistLayerMaterial } from './sky/mist';
import { SKY } from './sky/palette';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Mist: the sea of cloud the mesas rise from, banks drifting between them,
 * and far silhouettes (hills and temple towers) fading into the haze. All of
 * it is alive — calm, but it moves while you watch: the mist drifts west
 * with the wind (`WIND`, sky/haze.ts), rolls and breathes, nearer mist a
 * little faster than far mist. Everything runs on `f.drift`, so it stands
 * still under "reduce motion".
 *
 * - The mist between the mesas is part of the haze (sky/haze.ts): every
 *   material fogs itself with banks of valley mist, so trees and cliffs
 *   stand in it with soft feet and no cut lines. Its banks drift (≈ 2 m/s),
 *   roll and swell, thicken towards the side and back edges of the land
 *   (where the sinking land's end drowns in it), and keep off the road and
 *   the places (the land map, sky/mist.ts). Seen from low down it stays
 *   clear near the eye. Above it, wisps drift a little faster (≈ 27 m up,
 *   over the valley trees). The haze also carries soft cloud shadows over
 *   the land by day (set here, {@link SHADE}).
 * - Far backdrop (sky/backdrop.ts): four rings of hills and prasat towers
 *   all round the map, paler with distance.
 * - Sea of mist beyond the land: five stacked planes (10–29 m) sharing one
 *   noise field that flows (≈ 3 m/s) and rolls; each higher one keeps only
 *   the thicker parts, so they build soft mounds. Clear over the land.
 * - Banks: soft upright puffs along the map's side and back edges (so no cut
 *   land shows; they sway on their posts), beyond the front edge (seen when
 *   roaming looks south), and far out between the backdrop rings, where they
 *   drift slowly round the rings with long thin wisps between them. The
 *   mist inside every bank streams and rises, so its edges billow. One
 *   instanced draw, sorted back to front.
 */

/** Mist planes (m). */
const LAYER_Y = [10, 14, 18, 23, 29];

/** Cloud shadows by day: darkening, patch size (m), cover (0‥1, higher = fewer). */
const SHADE = { amount: 0.14, size: 1100, cover: 0.48 };

interface Bank {
  /** Resting base centre (m). */
  x: number;
  y: number;
  z: number;
  /** Width, height (m). */
  w: number;
  h: number;
  seed: number;
  /** 0 = a round puff ‥ 1 = a long thin wisp. */
  wisp: number;
  /** How fast the mist rolls through it (m/s). */
  roll: number;
  alpha: number;
  /** Sways back and forth along the wind (m either way): it stays on its post. */
  sway: number;
  /** Drifts round the backdrop rings (rad/s; 0 = stays), on a ring of radius r (m) from angle a. */
  orbit: number;
  r: number;
  a: number;
}

export function buildClouds(ctx: MapContext): MapPart {
  const field = ctx.field;
  const object = new Group();
  object.name = 'clouds';

  const backdrop = buildBackdrop();
  object.add(backdrop.object);

  // ── Sea of mist ─────────────────────────────────────────────────────────
  const plane = new PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2);
  LAYER_Y.forEach((y, i) => {
    const mesh = new Mesh(plane, mistLayerMaterial(y, i / (LAYER_Y.length - 1)));
    mesh.name = `mist ${y} m`;
    mesh.position.set(0, y, -300);
    mesh.renderOrder = 2 + i;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    object.add(mesh);
  });

  // ── Banks ───────────────────────────────────────────────────────────────
  const banks: Bank[] = [];
  const rnd = (a: number, b: number, s: number) => hash3(Math.round(a * 7), Math.round(b * 7), s, 9173);
  /** Highest ground within r of (x, z) (sampled on a ring and the centre). */
  const maxAround = (x: number, z: number, r: number) => {
    let h = field.heightAt(x, z);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      h = Math.max(h, field.heightAt(x + Math.cos(t) * r, z + Math.sin(t) * r), field.heightAt(x + Math.cos(t) * r * 0.5, z + Math.sin(t) * r * 0.5));
    }
    return h;
  };
  const still = { orbit: 0, r: 0, a: 0 };

  // Along the side and back edges: tall where the land is high at the edge.
  const edgeRuns: [number, number, number, number][] = [
    [MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x1, MAP_BOUNDS.z0],
    [MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x0, -240],
    [MAP_BOUNDS.x1, MAP_BOUNDS.z0, MAP_BOUNDS.x1, -240],
  ];
  for (const [xa, za, xb, zb] of edgeRuns) {
    const len = Math.hypot(xb - xa, zb - za);
    for (let s = 0; s <= len; s += 58) {
      const t = s / len;
      const x = xa + (xb - xa) * t + (rnd(s, xa, 1) - 0.5) * 30;
      const z = za + (zb - za) * t + (rnd(s, za, 2) - 0.5) * 30;
      const ground = maxAround(Math.min(MAP_BOUNDS.x1 - 2, Math.max(MAP_BOUNDS.x0 + 2, x)), Math.max(MAP_BOUNDS.z0 + 2, z), 50);
      const h = Math.max(40, ground + 20 + rnd(s, 3, 3) * 18);
      const seed = rnd(s, 5, 5);
      banks.push({ x, y: -8, z, w: Math.max(h * 1.6, 120 + rnd(s, 4, 4) * 90), h: h + 8, seed, wisp: 0, roll: 2.5 + rnd(s, 6, 6) * 1.5, alpha: 0.95, sway: 12 + seed * 14, ...still });
    }
  }

  // Beyond the front edge (below the overview camera's view): banks rising
  // from the sea of mist, so the land's end reads as its shore when roaming
  // looks south.
  for (let x = MAP_BOUNDS.x0 - 40; x <= MAP_BOUNDS.x1 + 40; x += 75) {
    const seed = rnd(x, 7, 7);
    banks.push({ x: x + (rnd(x, 8, 8) - 0.5) * 30, y: 0, z: MAP_BOUNDS.z1 + 90 + rnd(x, 9, 9) * 70, w: 150 + rnd(x, 10, 10) * 90, h: 50 + seed * 20, seed, wisp: 0, roll: 3, alpha: 0.95, sway: 15, ...still });
  }

  // Far out, between the backdrop rings, all the way round (cloud layers
  // towards the horizon): banks, and long thin wisps drifting between them.
  // They drift slowly round the rings, westward in the north (with the wind):
  // farther rings slower.
  for (const [r, wide, tall, speed] of [
    [760, 260, 45, 3.2],
    [1150, 380, 60, 3.6],
    [1650, 520, 80, 4],
    [2300, 700, 100, 4.4],
  ] as const) {
    const step = (wide * 0.55) / r;
    const n = Math.round((Math.PI * 2) / step);
    for (let i = 0; i < n; i++) {
      const a = ((i + (rnd(i, r, 41) - 0.5) * 0.6) / n) * Math.PI * 2;
      const seed = rnd(i, r, 44);
      banks.push({ x: 0, y: 0, z: 0, w: wide * (0.7 + rnd(i, r, 42) * 0.6), h: tall * (0.8 + rnd(i, r, 43) * 0.8), seed, wisp: 0, roll: speed * 1.4, alpha: 0.85, sway: 0, orbit: -speed / r, r, a });
      // A wisp between this ring and the next, now and then.
      if (rnd(i, r, 45) < 0.45) {
        const rw = r * 1.2 + rnd(i, r, 46) * r * 0.1;
        const aw = a + Math.PI / n;
        banks.push({ x: 0, y: 12 + rnd(i, r, 47) * tall * 0.3, z: 0, w: wide * (0.9 + rnd(i, r, 48) * 0.8), h: tall * 0.28, seed: rnd(i, r, 49), wisp: 1, roll: speed * 2, alpha: 0.7, sway: 0, orbit: (-speed * 1.25) / rw, r: rw, a: aw });
      }
    }
  }

  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const aCentre = new InstancedBufferAttribute(new Float32Array(banks.length * 3), 3);
  const aSize = new InstancedBufferAttribute(new Float32Array(banks.length * 2), 2);
  const aSeed = new InstancedBufferAttribute(new Float32Array(banks.length * 4), 4);
  geo.setAttribute('aCentre', aCentre);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aSeed', aSeed);
  geo.instanceCount = banks.length;
  const bankMesh = new Mesh(geo, mistBankMaterial());
  bankMesh.name = 'mist banks';
  bankMesh.frustumCulled = false;
  bankMesh.renderOrder = 10;
  bankMesh.raycast = () => {};
  object.add(bankMesh);

  // Where each bank is now (x, y, z, w, h), and the draw order.
  const now = new Float32Array(banks.length * 5);
  const order = banks.map((_, i) => i);
  const dist = new Float32Array(banks.length);
  let lastT = NaN;
  function place(t: number): void {
    banks.forEach((b, i) => {
      let x = b.x;
      let z = b.z;
      if (b.orbit) {
        const a = b.a + t * b.orbit;
        x = RING_CENTRE.x + Math.sin(a) * b.r;
        z = RING_CENTRE.z - Math.cos(a) * b.r;
      } else {
        // Back and forth along the wind (a minute or two each way).
        const s = Math.sin(t * (0.05 + b.seed * 0.03) + b.seed * 6.28) * b.sway;
        x += WIND.x * s;
        z += WIND.z * s;
      }
      // Breathing: a bank swells and settles.
      const k = i * 5;
      now[k] = x;
      now[k + 1] = b.y;
      now[k + 2] = z;
      now[k + 3] = b.w * (1 + 0.05 * Math.sin(t * 0.17 + b.seed * 11));
      now[k + 4] = b.h * (1 + 0.1 * Math.sin(t * 0.21 + b.seed * 17));
    });
  }
  /** Back to front for the camera (they blend over each other). */
  function sortBanks(cam: { x: number; y: number; z: number }): void {
    for (let i = 0; i < banks.length; i++) {
      const k = i * 5;
      dist[i] = (now[k] - cam.x) ** 2 + (now[k + 1] + now[k + 4] * 0.4 - cam.y) ** 2 + (now[k + 2] - cam.z) ** 2;
    }
    order.sort((a, b) => dist[b] - dist[a]);
    order.forEach((bi, i) => {
      const b = banks[bi];
      const k = bi * 5;
      aCentre.setXYZ(i, now[k], now[k + 1], now[k + 2]);
      aSize.setXY(i, now[k + 3], now[k + 4]);
      aSeed.setXYZW(i, b.seed, b.wisp, b.roll, b.alpha);
    });
    aCentre.needsUpdate = aSize.needsUpdate = aSeed.needsUpdate = true;
  }

  return {
    name: 'clouds',
    object,
    update(f: MapFrame) {
      backdrop.update(SKY, f.drift);
      if (f.drift !== lastT) {
        lastT = f.drift;
        place(f.drift);
      }
      sortBanks(f.camera.position);
      // Cloud shadows by day only (the moon's would be too faint to read).
      const day = 1 - Math.min(1, Math.max(0, (f.night - 0.1) / 0.4));
      HAZE.shade.set(SHADE.amount * day * day, 1 / SHADE.size, SHADE.cover);
    },
  };
}
