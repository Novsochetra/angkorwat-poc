import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate, splitByPlace } from '../cull';
import { JUNGLE_SITES, type JungleSite } from '../layout';
import type { MapContext, MapFrame, MapPart, Subject } from '../types';
import { bridgeSpan, buildBridge, type BridgeSpan } from './_bridges';
import { CampFx } from './_campFx';
import { buildMonkHut } from './_campHut';
import { Site } from './_campKit';
import { buildPool } from './_campPool';
import { buildWoodcutters } from './_campWood';
import { buildSwing, swingSpot, type SwingBuild } from './_swing';

/**
 * The lived-in places of the jungle (layout.ts `JUNGLE_SITES`, the ones
 * people made or use; the ruins are the `jungle` part's): the forest monk's
 * hut on stilts (monk-hut), the woodcutters' camp with its fire
 * (woodcutters), the rope swing in a big old tree on the Bayon's rim over
 * the lake (rim-swing, ridden with E: roam/_swingRide.ts), foot bridges
 * where the trails cross the Bayon stream (rim-bridge, pool-bridge) and the
 * pool at the foot of its fall (stream-pool).
 *
 * Voxel meshes for each place (solid: huts, decks, rails, logs, stones;
 * leaves, glow and petals are soft; the places out of view are not drawn
 * and cast shadows only while those can be seen: cull.ts; the glow blocks
 * of them all in one mesh), plus what moves or shines: the swing's
 * ropes and seat (left out of the walk map), the lamp's and the fire's
 * halos and the fire's smoke (not voxels). No lights: glow + bloom.
 */
export function buildCamps(ctx: MapContext): MapPart {
  const { field } = ctx;
  const b = new VoxelBuilder();
  const src = traceSource();
  const fx = new CampFx();
  const object = new Group();
  object.name = 'camps';
  const at = (s: JungleSite) => field.heightAt(s.x, s.z);
  const done: string[] = [];
  let swing: SwingBuild | null = null;
  const spans: BridgeSpan[] = [];
  /** The pool's lotus (the nature book's). */
  const lotus: Subject[] = [];

  // Bridges first: the pool keeps its stones off them.
  for (const site of JUNGLE_SITES)
    if (site.kind === 'bridge') {
      const span = bridgeSpan(field, site);
      if (!span) {
        console.warn(`[map] camps: no stream under the bridge "${site.id}"`);
        continue;
      }
      buildBridge(b, field, span, 40 + spans.length, src);
      spans.push(span);
      done.push(site.id);
    }
  const onBridge = (x: number, z: number) =>
    spans.some((p) => {
      const dx = p.bx - p.ax;
      const dz = p.bz - p.az;
      const l2 = dx * dx + dz * dz;
      const u = Math.max(0, Math.min(1, ((x - p.ax) * dx + (z - p.az) * dz) / l2));
      return Math.hypot(x - (p.ax + dx * u), z - (p.az + dz * u)) < 2.6;
    });

  for (const site of JUNGLE_SITES) {
    switch (site.kind) {
      case 'monkHut':
        buildMonkHut(new Site(b, field, site.x, at(site), site.z, site.facing, src, 11), fx);
        break;
      case 'woodcutter':
        buildWoodcutters(new Site(b, field, site.x, at(site), site.z, site.facing, src, 23), fx);
        break;
      case 'swing':
        if (swing) continue;
        swing = buildSwing(b, field, site, src);
        object.add(swing.object);
        break;
      case 'pool': {
        const level = field.waterAt(site.x, site.z) ?? at(site);
        lotus.push(...buildPool(new Site(b, field, site.x, level, site.z, 0, src, 37), field, site, level, onBridge));
        break;
      }
      default:
        continue;
    }
    done.push(site.id);
  }

  // (sites this near share their meshes; the glow blocks stay in one mesh, in their order: CampFx lights them)
  const { parts, rest } = splitByPlace(b, JUNGLE_SITES.filter((site) => done.includes(site.id)), 80, ['glow']);
  const places = new Group();
  places.name = 'camps:places';
  for (const part of parts) places.add(buildVoxelMesh(part, { quality: 'medium', name: 'camps' }));
  const voxels = buildVoxelMesh(rest, { quality: 'medium', name: 'camps' });
  object.add(places, voxels);
  fx.finish(voxels);
  object.add(fx.object);
  const shadows = new ShadowGate(true).addAll(places);
  const blocks = b.boxes.length + (swing?.blocks ?? 0);
  const sp = swingSpot();
  const s = sp ? `, swing: stand at ${sp.stand.x.toFixed(1)},${sp.stand.z.toFixed(1)} facing ${((sp.yaw * 180) / Math.PI).toFixed(0)}°` : '';
  console.info(`[map] camps: ${done.join(', ')} · ${blocks} blocks${s}`);

  return {
    name: 'camps',
    object,
    blocks,
    update(f: MapFrame) {
      shadows.update(f);
      fx.update(f, ctx.renderer);
      swing?.update(f);
    },
    // (the nature book, roam/_book.ts: the pool's lotus flowers and buds)
    subjects(out: Subject[]) {
      for (const l of lotus) out.push(l);
    },
  };
}
