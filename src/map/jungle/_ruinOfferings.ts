import { Vector3, type Object3D } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { SACRED_LAMPS } from '../sacred/finish';
import { candleLamp, offering, type OfferingKind, type OfferingOptionsByKind } from '../sacred/offerings';
import { trackSacred } from '../sacred/pending';
import type { SacredSet } from '../sacred/set';
import type { ShrineLights } from './_incense';
import type { SiteFrame } from './_ruinFrame';

/**
 * Offerings at the jungle shrines: the sculpted ones of sacred/offerings.ts
 * (candles in brass sticks, incense urns, lotus in vases, bay sei, fruit on
 * footed trays, marigold garlands), set down in a site's space and turned
 * to its facing; their candles light the statues near them (`SACRED_LAMPS`)
 * and bloom at night, their incense smokes (`ShrineLights`). And the
 * saffron cloth the people tie round a sacred tree's trunk, as blocks.
 *
 * Sculpted pieces are not solid: they stand on voxel tables, steps and
 * plinths. A statue's or a stupa's body is made solid by hidden blocks in
 * `Sculpted.solid` (ruins.ts). They are made just after the build (`later`:
 * the first of each kind takes a moment to sculpt), and so are their lights.
 */

export const BRASS = [0xc49a44, 0xb88d3a, 0xd1a851];
export const SAFFRON = [0xe98d1c, 0xf29a28, 0xdb7d18, 0xf5a531];
/** Red lacquered wood (offering tables, the spirit house's tray). */
export const LACQUER = [0x7a2a1c, 0x6e2618, 0x843020];

/** The explorer and his world are 1.4 × true size (roam/types.ts `ROAM_SCALE`): so are the offerings before him. */
export const K = 1.4;
/** A sculpted candle's flame height at true size (m, sacred/offerings.ts `candleFlame`). */
const FLAME = 0.036;

/** A shrine's sculpted pieces: the part's set (world metres), and a frame for the hidden blocks that make them solid. */
export interface Sculpted {
  set: SacredSet;
  /** Blocks put here are solid to the explorer but never drawn (ruins.ts): a statue's body, a stupa's. */
  solid: SiteFrame;
}

const pick = (list: readonly number[], a: number, b: number, s: number) => list[Math.floor(hash3(a, b, s, 811) * list.length)];

/**
 * Runs `make` just after the build, in the order asked (sculpting is kept
 * off the part's build time); shots wait for it (sacred/pending.ts).
 */
export function later(make: () => void): void {
  void trackSacred(
    new Promise<void>((done) =>
      setTimeout(() => {
        try {
          make();
        } finally {
          done();
        }
      }, 0),
    ),
  );
}

/** Puts a sculpted piece (standing on y = 0, its front +z) at a site point (m over the floor), turned `ry` from the site's front; `src` names the line that asked for it in bug reports. */
export function place<T extends Object3D>(fr: SiteFrame, S: Sculpted, o: T, x: number, y: number, z: number, ry = 0, src = traceSource()): T {
  const [mx, my, mz] = fr.point(x, y, z);
  o.position.set(mx, my, mz);
  o.rotation.y = fr.yaw + ry;
  o.userData.source = src;
  S.set.add(o);
  o.updateMatrixWorld(true);
  return o;
}

/**
 * A sculpted offering standing at a site point (m), made `later`: `scale`
 * over true size (default `K`), turned `ry`. Its candle flames light the
 * statues near them (`lamp` × a candle's light: less by white stucco, which
 * it bleaches) and get a core that blooms at night; its incense smokes
 * (`smoke` × a bowl's thread).
 */
export function offer<T extends OfferingKind>(
  fr: SiteFrame,
  S: Sculpted,
  L: ShrineLights,
  kind: T,
  x: number,
  y: number,
  z: number,
  o: OfferingOptionsByKind[T] & { ry?: number; smoke?: number; lamp?: number } = {} as never,
): void {
  const src = traceSource();
  later(() => {
    const p = offering(kind, { scale: K, ...o });
    place(fr, S, p.object, x, y, z, o.ry ?? 0, src);
    const k = o.scale ?? K;
    for (const f of p.flames) {
      const w = p.object.localToWorld(f.clone());
      SACRED_LAMPS.push(candleLamp(w, o.lamp ?? 1));
      L.cores.push({ at: [w.x, w.y, w.z], size: FLAME * k });
    }
    if (p.embers.length) {
      const c = new Vector3();
      for (const e of p.embers) c.add(p.object.localToWorld(e.clone()));
      c.divideScalar(p.embers.length);
      L.smoke.push({ at: [c.x, c.y + 0.02, c.z], strength: o.smoke ?? 0.8 });
    }
  });
}

/**
 * A sculpted marigold garland from a to b (site space, m) sagging `sag` m
 * in the middle (0 and a below b: hanging straight down), heads `scale` ×
 * true size (default `K`); made `later`.
 */
export function marigolds(fr: SiteFrame, S: Sculpted, a: [number, number, number], b: [number, number, number], sag: number, seed: number, scale = K): void {
  const src = traceSource();
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const rel = (p: [number, number, number]): [number, number, number] => [(p[0] - mid[0]) / scale, (p[1] - mid[1]) / scale, (p[2] - mid[2]) / scale];
  later(() => place(fr, S, offering('marigold', { from: rel(a), to: rel(b), sag: sag / scale, seed, scale }).object, mid[0], mid[1], mid[2], 0, src));
}

/**
 * A cloth tied round a post or trunk: a band on each of its four sides
 * (site space: the post's middle (x, z), its half widths, the band's
 * middle height and depth), and its knot's two tails on the front.
 */
export function clothBand(fr: SiteFrame, x: number, z: number, hx: number, hz: number, y: number, h: number, seed: number): void {
  const src = traceSource();
  const t = 0.07;
  const c = (s: number) => pick(SAFFRON, s, seed, 7);
  fr.b.box(x, y, z + hz + t / 2, hx * 2 + t * 2, h, t, c(0), 'krama', { src });
  fr.b.box(x, y, z - hz - t / 2, hx * 2 + t * 2, h, t, c(1), 'krama', { src });
  fr.b.box(x + hx + t / 2, y, z, t, h, hz * 2, c(2), 'krama', { src });
  fr.b.box(x - hx - t / 2, y, z, t, h, hz * 2, c(3), 'krama', { src });
  // The knot and its tails.
  fr.b.box(x + hx * 0.4, y, z + hz + t * 1.5, 0.16, h * 0.9, 0.08, c(4), 'krama', { src });
  fr.b.box(x + hx * 0.3, y - h * 0.5 - 0.22, z + hz + t * 1.3, 0.13, 0.5, 0.05, c(5), 'krama', { src, rz: 0.12 });
  fr.b.box(x + hx * 0.55, y - h * 0.5 - 0.18, z + hz + t * 1.3, 0.12, 0.42, 0.05, c(6), 'krama', { src, rz: -0.18 });
}
