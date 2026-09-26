import { Group, Vector3 } from 'three';
import { birdShelter } from './fauna/_waterAirKit';
import { explorerFeet } from './foreground';
import { OVERVIEW } from './layout';
import { buildBirds } from './road/birds';
import { buildButterflies } from './road/butterflies';
import { buildFireflies } from './road/fireflies';
import { pointScale } from './road/glow';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Small moving life, slow and sparse: flocks of pale birds gliding in wide
 * loops over the valley by day (fewer in rain), fireflies drifting over the lowlands and round
 * the explorer's ledge at night, and a few butterflies by the ledge by day.
 * Helpers in road/ (birds.ts, fireflies.ts, butterflies.ts).
 */
export function buildLife(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'life';
  const feet = explorerFeet();
  const birds = buildBirds();
  const flies = buildFireflies(ctx.field, feet, new Vector3(...OVERVIEW.pos));
  const butterflies = buildButterflies(feet);
  object.add(...birds.meshes, flies.points, butterflies.mesh);
  return {
    name: 'life',
    object,
    update(f: MapFrame) {
      birds.update(f.t, f.night, birdShelter(f));
      butterflies.update(f.t, f.night);
      flies.uniforms.uTime.value = f.t;
      flies.uniforms.uNight.value = f.night;
      flies.uniforms.uScale.value = pointScale(ctx.renderer, f.camera);
    },
  };
}
