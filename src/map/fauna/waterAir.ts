import { Group } from 'three';
import type { MapContext, MapFrame, MapPart, Subject, SubjectKind } from '../types';
import { buildBats } from './_airBats';
import { buildDragonflies } from './_airDragonflies';
import { dragonflyShape } from './_airModels';
import { creatureMaterial, Herd, readExplorer, STRIDE, View, type Explorer } from './_waterAirKit';
import { buildWaterCritters } from './_waterCritters';
import { buildDucks } from './_waterDucks';
import { CRITTER, DUCK, fishShape, frogShape, WADER } from './_waterModels';
import { Rings } from './_waterRings';
import { buildWaders } from './_waterWaders';

/**
 * Animals on the water and in the air, to make the map feel alive:
 *  - duck families on the calm river reaches (_waterDucks.ts);
 *  - egrets and herons wading by the banks and the waterfall pools, flying
 *    off along the river when the explorer comes close (_waterWaders.ts);
 *  - fish jumping now and then, frogs on the banks at night (_waterCritters.ts);
 *  - dragonflies over the water round the roaming explorer (_airDragonflies.ts);
 *  - bats at dusk and night round Angkor Wat's towers and over the rivers (_airBats.ts);
 *  - rings on the water: splashes and ripples (_waterRings.ts).
 *
 * Cheap to run: five draw calls at most (ducks, waders, bats, small critters,
 * rings), each one instanced buffer written once a frame with only the
 * animals near and in view; the joints move in the vertex shader
 * (_waterAirKit.ts). No shadows, no lights. The tiny ones (fish, dragonflies,
 * frogs) are small pools that follow the explorer or the view.
 *
 * URL `wildlife=<s>` (shots): run the animals' reactions to the roaming
 * explorer this many seconds before the still, to see them flee.
 */
export function buildWaterAirFauna(ctx: MapContext): MapPart {
  const t0 = performance.now();
  const object = new Group();
  object.name = 'wildlife';
  const field = ctx.field;
  const low = ctx.quality === 'low';

  const ducks = buildDucks(field);
  const waders = buildWaders(field);
  const bats = buildBats(field);
  const water = buildWaterCritters(field);
  const flies = buildDragonflies(field);
  const critters = new Herd('wildlife:critters', [fishShape(), dragonflyShape(), frogShape()], creatureMaterial('map:critters', { roughness: 0.6 }), 32);
  const rings = low ? null : new Rings(192);
  object.add(ducks.herd.mesh, waders.herd.mesh, bats.herd.mesh, critters.mesh);
  if (rings) object.add(rings.mesh);

  const view = new View();
  const me: Explorer = { near: false, boat: false, x: 0, y: 0, z: 0 };
  const warm = Number(new URLSearchParams(location.search).get('wildlife') ?? 0);
  let warmed = !ctx.shot || !(warm > 0);
  let frames = 0;
  let spent = 0;

  const step = (f: MapFrame) => {
    view.set(f.camera);
    readExplorer(f, me);
    rings?.begin(f.t, f.night);
    ducks.update(f, view, me, rings);
    waders.update(f, view, me, rings);
    bats.update(f, view, me);
    critters.begin();
    water.update(f, view, me, critters, rings);
    flies.update(f, view, me, critters);
    critters.end();
    rings?.end();
  };

  const ms = Math.round(performance.now() - t0);
  console.info(
    `[map] wildlife: ${ducks.count} ducks in ${ducks.families} families, ${waders.count} egrets and herons, ${bats.count} bats, ` +
      `${water.fishSlots} fish, ${flies.count} dragonflies, ${water.frogs} frogs · ${rings ? 5 : 4} draw calls at most · built in ${ms} ms`,
  );

  return {
    name: 'wildlife',
    object,
    update(f: MapFrame) {
      // (shots: let them react to the explorer for a while first)
      if (!warmed && f.roam !== 'overview' && f.dt > 0) {
        warmed = true;
        const [t, dt, calls] = [f.t, f.dt, f.calls.length];
        for (let s = 0; s < warm * 30; s++) {
          f.t = t - warm + s / 30;
          f.dt = 1 / 30;
          step(f);
        }
        f.t = t;
        f.dt = dt;
        f.calls.length = calls;
      }
      const a = performance.now();
      step(f);
      spent += performance.now() - a;
      if (++frames === 32)
        console.info(`[map] wildlife: ${(spent / frames).toFixed(3)} ms a frame (CPU, average of ${frames}) · drawn: ${ducks.herd.count} ducks, ${waders.herd.count} waders, ${bats.herd.count} bats, ${critters.count} critters, ${rings?.count ?? 0} rings`);
    },
    // (the nature book, roam/_book.ts: the animals drawn this frame, read from the herds' buffers)
    subjects(out: Subject[]) {
      const read = (h: Herd, what: (kind: number) => [SubjectKind, number] | null) => {
        for (let i = 0; i < h.count; i++) {
          const o = i * STRIDE;
          const d = h.data;
          const k = what(d[o + 7]);
          if (!k || d[o + 3] <= 0.05) continue;
          const r = k[1] * d[o + 3];
          out.push({ kind: k[0], x: d[o], y: d[o + 1] + r * 0.6, z: d[o + 2], r });
        }
      };
      read(ducks.herd, (k) => ['duck', k === DUCK.duckling ? 0.12 : 0.2]);
      read(waders.herd, (k) => (k === WADER.heron ? ['heron', 0.42] : ['egret', 0.38]));
      read(bats.herd, () => ['bat', 0.16]);
      read(critters, (k) => (k === CRITTER.fish ? ['fish', 0.12] : k === CRITTER.dragonfly ? ['dragonfly', 0.04] : ['frog', 0.04]));
    },
  };
}
