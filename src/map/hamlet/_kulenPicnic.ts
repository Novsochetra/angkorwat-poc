import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { banana, FLAGSTONE, fern, MOSS, pickTone, PLANK, POST, ROCK, Site, stone } from '../jungle/_campKit';
import { KULEN_PICNIC } from '../layout';
import type { MapContext, MapFrame } from '../types';
import type { HamletPiece } from './index';
import { KnFx } from './_knFx';
import { buildHut } from './_knHut';
import { KN_BUILT, kulenSite, onSteps, roadStall, wetAt } from './_knSite';
import { Local, shadeTree } from '../village/_kit';
import { neakTa } from './_knShrine';
import { signWords } from './_knSign';
import { buildDrinkStall, buildFoodStall, GRILL } from './_knStall';
import { registerKulenShops } from './_shops';

/**
 * The picnic place below the Kulen stream's falls (layout.ts
 * `KULEN_PICNIC`), as Cambodian families love it on a weekend or a holiday:
 * a row of little stilted picnic huts with palm-thatch roofs along the
 * pool at the foot of the stream's lowest, biggest fall (`_knHut.ts`), a
 * food stall with its grill smoking (`_knStall.ts`), rocks round the pool,
 * the big rock the children jump from and flat stones along the edge, a
 * wooden sign where the picnic trail comes in (its words in Khmer:
 * `_knSign.ts`), the place's neak ta (its guardian spirit: a little stone
 * shrine shaped like an Angkor tower at the foot of a big shade tree,
 * `_knShrine.ts`), ferns and banana plants round the terrace; the huts'
 * lanterns and the shrine's candle are lit at dusk (`_knFx.ts`: glow, no
 * light). And at the mountain road's foot, the pilgrims' drinks stall (the
 * sugarcane-juice cart, low stools).
 *
 * Where everything goes is read from the land at build time (`_knSite.ts`:
 * the fall, the pool, the terrace, the trail), so it follows the world
 * pass's shaping. Its people, their food, hammocks, motos and the stalls'
 * goods are the people part's (`people/_sceneKulen.ts`).
 *
 * Solid in the walk map (decks, rocks, stones: the explorer walks on them;
 * cloth is soft; the huts' thatch is left out, a build of its own, so he
 * steps up onto the decks under it: `_knHut.ts`), the terrace kept clear of
 * trees (`field.occupy`). Two builds (the picnic place, the road stall) so
 * each is culled on its own; families `mapBark`, `mapStone`, `petal`,
 * `mapLeaf` (4 draws each place, and 1 the thatch;
 * shadows only while they can be seen: cull.ts) and the lanterns, halos and
 * smoke (3 more, hidden far off), the sign's words (1, only near). Its
 * console line: `[map] kulenPicnic: …`.
 */
export function buildKulenPicnic(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const site = kulenSite(field);
  const P = KULEN_PICNIC;
  const src = traceSource();
  const b = new VoxelBuilder();
  const fx = new KnFx();

  // ── The huts, the stall ──────────────────────────────────────────────────
  // (their thatch in a build of its own, out of the walk map: _knHut.ts)
  const bThatch = new VoxelBuilder();
  site.huts.forEach((h, i) => {
    buildHut(new Site(b, field, h.x, h.ground, h.z, h.yaw, src, 60 + i * 7), h, i, fx, new Site(bThatch, field, h.x, h.ground, h.z, h.yaw, src, 60 + i * 7));
    field.occupy(h.x - 3, h.z - 3, h.x + 3, h.z + 3);
  });
  const st = site.stall;
  const stall = new Site(b, field, st.x, site.ground, st.z, st.yaw, src, 71);
  buildFoodStall(stall);
  const g = stall.world(GRILL.x, GRILL.top + 0.05, GRILL.z);
  fx.smoke(g.x, g.y, g.z);
  field.occupy(st.x - 4.5, st.z - 4.5, st.x + 4.5, st.z + 4.5);
  // (the terrace's middle: people walk there; trees and ferns grow round its rim)
  field.occupy(P.x - P.r + 3, P.z - P.r + 3, P.x + P.r - 3, P.z + P.r - 3);

  // ── Steps of laterite from the terrace's edge down to the beach, a flat stone at their foot ──
  for (const [k, st] of site.steps.entries()) {
    const fl = new Site(b, field, st.x, st.bottom, st.z, st.yaw, src, 88 + k);
    const rise = (st.top - st.bottom) / (st.n + 1);
    for (let j = 0; j < st.n; j++) {
      const top = st.top - st.bottom - rise * (j + 1);
      const z = (j + 0.5) * st.run;
      fl.box(0, (top - 0.2) / 2, z, st.w, top + 0.2, st.run + 0.02, pickTone(FLAGSTONE, j, k, 2, 88), 'mapStone', { shade: 0.95 + 0.06 * (j % 2) });
      // (a worn lip, lighter, and a cheek stone either side)
      fl.box(0, top - 0.04, z + st.run / 2 - 0.06, st.w - 0.1, 0.1, 0.14, pickTone(FLAGSTONE, j, k, 3, 88), 'mapStone', { shade: 1.08 });
      for (const sx of [1, -1]) fl.box(sx * (st.w / 2 + 0.12), (top + 0.1) / 2, z, 0.24, top + 0.3, st.run + 0.04, pickTone(ROCK, j, sx, 4, 88), 'mapStone', { shade: 0.9 });
    }
    fl.box(0, 0.04, st.n * st.run + 0.45, st.w * 0.8, 0.12, 0.8, pickTone(FLAGSTONE, 9, k, 5, 88), 'mapStone', { ry: 0.1 });
    field.occupy(st.x - 3, st.z - 3, st.x + 3, st.z + 3);
  }

  // ── The pool: boulders at the fall's foot, the children's rock, flat stones along the edge ──
  const here = new Site(b, field, P.x, 0, P.z, 0, src, 91);
  const tone = (list: readonly number[], i: number, j: number) => pickTone(list, i, j, 7, 91);
  const wet = (x: number, z: number) => wetAt(field, x, z);
  if (site.fall) {
    const d = site.fall.dir;
    for (const [i, [ox, oz, size]] of [
      [2.8, 2.2, 1.5],
      [-2.9, 1.6, 1.2],
      [1.2, 4.6, 0.9],
      [-1.6, 5.2, 0.8],
    ].entries()) {
      const x = site.fall.x + d[0] * oz - d[1] * ox;
      const z = site.fall.z + d[1] * oz + d[0] * ox;
      if (!wet(x, z)) continue;
      // (dark and wet, standing a good way out of the water, a cushion of moss on top)
      const bed = field.heightAt(x, z);
      const top = site.level + size * 0.7;
      const w = size * (1 + 0.2 * hash3(i, 7, 8, 91));
      here.box(x - P.x, (bed + top) / 2, z - P.z, w, top - bed, size * 0.85, tone([0x5f5a52, 0x6a645b, 0x55504a], i, 9), 'mapStone', { ry: i * 1.3 });
      here.box(x - P.x + 0.08, top + 0.1, z - P.z, w * 0.72, 0.2, size * 0.6, tone([0x5f5a52, 0x6a645b, 0x55504a], i, 11), 'mapStone', { ry: i * 1.3 + 0.4, shade: 1.05 });
      here.box(x - P.x + 0.1, top + 0.22, z - P.z, w * 0.55, 0.12, size * 0.45, tone(MOSS, i, 10), 'mapLeaf', { ry: i * 1.3 + 0.2 });
    }
  }
  {
    // The children's rock: a big, rounded boulder standing out of the pool, a flat-ish top a metre over the water.
    const k = site.rock;
    const bed = field.heightAt(k.x, k.z);
    const lx = k.x - P.x;
    const lz = k.z - P.z;
    const h0 = k.top - bed;
    here.box(lx, bed + (h0 - 0.35) / 2, lz, k.size, h0 - 0.35, k.size * 0.9, tone(ROCK, 1, 11), 'mapStone', { ry: 0.4 });
    here.box(lx, bed + (h0 - 0.35) / 2, lz, k.size * 0.86, h0 - 0.3, k.size * 0.96, tone(ROCK, 2, 12), 'mapStone', { ry: 0.4 + Math.PI / 4, shade: 0.95 });
    here.box(lx + 0.08, k.top - 0.18, lz - 0.05, k.size * 0.72, 0.36, k.size * 0.66, tone(ROCK, 3, 13), 'mapStone', { ry: 0.55, shade: 1.06 });
    here.box(lx - k.size * 0.3, k.top - 0.34, lz + k.size * 0.25, 0.7, 0.2, 0.5, tone(MOSS, 4, 14), 'mapLeaf', { ry: 0.2 });
  }
  site.stones.forEach((q, i) => {
    const bed = field.heightAt(q.x, q.z);
    const top = site.level + 0.14;
    const lx = q.x - P.x;
    const lz = q.z - P.z;
    here.box(lx, (bed + top - 0.12) / 2, lz, q.s * 0.8, top - 0.12 - bed, q.s * 0.7, tone(ROCK, i, 15), 'mapStone', { ry: hash3(i, 1, 2, 91) * 3 });
    here.box(lx, top - 0.07, lz, q.s, 0.16, q.s * 0.82, tone(ROCK, i, 16), 'mapStone', { ry: hash3(i, 1, 2, 91) * 3, shade: 1.05 });
  });

  // ── Round the terrace's rim: stones, ferns, banana plants (not on the trail, the huts or the stall) ──
  const busy = (x: number, z: number) =>
    wet(x, z) ||
    site.huts.some((h) => Math.hypot(h.x - x, h.z - z) < 3.4) ||
    Math.hypot(st.x - x, st.z - z) < 4.5 ||
    site.motos.some((m) => Math.hypot(m.x - x, m.z - z) < 1.8) ||
    Math.hypot(site.sign.x - x, site.sign.z - z) < 1.6 ||
    onSteps(site.steps, x, z, 1) ||
    field.trail[field.index(x, z)] > 0;
  let plants = 0;
  for (let a = 0; a < 40 && plants < 12; a++) {
    const ang = (a / 40) * Math.PI * 2 + hash3(a, 3, 5, 92) * 0.3;
    const d = P.r - 1.5 + hash3(a, 4, 6, 92) * 3;
    const x = P.x + Math.sin(ang) * d;
    const z = P.z + Math.cos(ang) * d;
    if (busy(x, z) || Math.abs(field.heightAt(x, z) - site.ground) > 1.1) continue;
    const r = hash3(a, 5, 7, 92);
    if (r < 0.35) fern(here, x - P.x, z - P.z, 0.9 + 0.5 * hash3(a, 6, 8, 92), a);
    else if (r < 0.55) banana(here, x - P.x, z - P.z, 2.6 + 0.8 * hash3(a, 7, 9, 92), a);
    else if (r < 0.75) stone(here, x - P.x, z - P.z, 0.6 + 0.5 * hash3(a, 8, 10, 92), a, 0.7);
    else continue;
    plants++;
  }

  // ── The sign where the trail comes in: a board on two posts (its words are painted: `_knSign.ts`) ──
  const SIGN = { w: 1.8, h: 0.8, y: 1.55 };
  const sg = new Site(b, field, site.sign.x, field.heightAt(site.sign.x, site.sign.z), site.sign.z, site.sign.yaw, src, 93);
  for (const sx of [1, -1]) sg.box(sx * 0.75, 1.0, 0, 0.14, 2.0, 0.14, pickTone(POST, sx, 1, 2, 93), 'mapBark');
  sg.box(0, SIGN.y, 0.04, SIGN.w, SIGN.h, 0.08, 0x2c5a8a, 'mapBark');
  sg.box(0, 1.98, 0.02, 1.9, 0.08, 0.14, pickTone(PLANK, 3, 4, 5, 93), 'mapBark');
  const words = signWords(SIGN.w - 0.1, SIGN.h - 0.1);
  {
    const w = sg.world(0, SIGN.y, 0.086);
    words.mesh.position.copy(w);
    words.mesh.rotation.y = site.sign.yaw;
  }

  // ── The neak ta: the place's guardian spirit, a little stone shrine shaped like an Angkor tower at the foot of a big tree ──
  {
    let best: { x: number; z: number; score: number } | null = null;
    for (let a = 0; a < 36; a++) {
      const ang = (a / 36) * Math.PI * 2;
      const x = P.x + Math.sin(ang) * (P.r - 2.5);
      const z = P.z + Math.cos(ang) * (P.r - 2.5);
      // (on the terrace's rim away from the water: the tree's crown shades the huts' backs, not the pool)
      if (busy(x, z) || Math.abs(field.heightAt(x, z) - site.ground) > 0.6 || busy(x + Math.sin(ang) * 2, z + Math.cos(ang) * 2)) continue;
      const score = Math.hypot(x - site.plunge.x, z - site.plunge.z) + hash3(a, 2, 3, 95);
      if (!best || score > best.score) best = { x, z, score };
    }
    if (best) {
      const face = Math.atan2(P.x - best.x, P.z - best.z);
      const tx = best.x - Math.sin(face) * 1.9;
      const tz = best.z - Math.cos(face) * 1.9;
      shadeTree(new Local(b, src, 96), tx, field.heightAt(tx, tz), tz, 96);
      neakTa(new Site(b, field, best.x, field.heightAt(best.x, best.z), best.z, face, src, 94), fx);
      field.occupy(tx - 5, tz - 5, tx + 5, tz + 5);
    }
  }

  // ── The drinks stall at the mountain road's foot (its own build: culled on its own) ──
  const road = roadStall(field);
  const b2 = new VoxelBuilder();
  if (road) {
    buildDrinkStall(new Site(b2, field, road.x, road.ground, road.z, road.yaw, src, 97));
    field.occupy(road.x - 4, road.z - 4, road.x + 4, road.z + 4);
  }

  const object = new Group();
  object.name = 'kulenPicnic';
  const quality = ctx.quality === 'low' ? 'low' : 'medium';
  const built = buildVoxelMesh(b, { quality, name: 'kulenPicnic' });
  object.add(built);
  // (the people stand on its steps, decks and rocks: their walk map is made from this)
  KN_BUILT.object = built;
  if (b2.boxes.length) object.add(buildVoxelMesh(b2, { quality, name: 'kulenPicnic:road' }));
  // (the huts' thatch: seen and casting shadows as the rest, but not in the walk map — the explorer steps up onto the decks under it)
  if (bThatch.boxes.length) {
    const thatch = buildVoxelMesh(bThatch, { quality, name: 'kulenPicnic:thatch' });
    thatch.traverse((o) => (o.userData.noWalk = true));
    object.add(thatch);
  }
  const shadows = new ShadowGate(true).addAll(object);
  const lights = fx.build(ctx.renderer, site.plunge);
  object.add(lights.object, words.mesh);
  const blocks = b.boxes.length + b2.boxes.length + bThatch.boxes.length;
  // (the food stall and the road-foot drinks stall sell to the roaming explorer: _shops.ts)
  registerKulenShops(field);
  console.info(
    `[map] kulenPicnic: ${site.huts.length} huts${site.huts.some((h) => h.over) ? ` (${site.huts.filter((h) => h.over).length} over the water)` : ''}, terrace ${site.ground} m${site.beach < site.ground ? `, beach ${site.beach} m, ${site.steps.length} flights of steps` : ''}, the fall ${site.fall ? `at ${site.fall.x.toFixed(0)},${site.fall.z.toFixed(0)} (${site.fall.top}→${site.fall.bottom} m)` : 'not found'}, pool ${site.level.toFixed(1)} m, rock at ${site.rock.x.toFixed(1)},${site.rock.z.toFixed(1)}, stall at ${st.x.toFixed(1)},${st.z.toFixed(1)}${road ? `, road stall at ${road.x.toFixed(1)},${road.z.toFixed(1)}` : ''} · ${blocks} blocks · ${(performance.now() - t0).toFixed(0)} ms`,
  );
  return {
    object,
    blocks,
    update(f: MapFrame) {
      shadows.update(f);
      lights.update(f);
      words.update(f);
    },
  };
}
