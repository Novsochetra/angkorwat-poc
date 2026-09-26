import { Group, type Object3D } from 'three';
import type { MapContext, MapFrame, MapPart, Subject, SubjectKind } from '../types';
import { eventsNow } from '../events';
import { keepApart, RAIN_PACE, type Actor } from './_actor';
import { Bubble } from './_bubble';
import { buildPeopleLineup } from './_lineup';
import { Monks } from './_monks';
import { Crowd, PEOPLE_SCALE } from './_personModel';
import { Ground, RoadGraph, Traffic } from './_routes';
import type { PeopleEnv, PeopleScene } from './_scene';
import { Apsara } from './_sceneApsara';
import { OxCart } from './_sceneCart';
import { Farmers } from './_sceneFarm';
import { KiteKids } from './_sceneKites';
import { VillageLife } from './_sceneVillage';
import { Fishermen } from './_sceneFish';
import { Things } from './_things';
import { Tour } from './_tour';

/**
 * People on the map (part `people`): the monks of Angkor Wat (a procession
 * on the valley road, a monk sweeping below the gate) and a group of
 * visitors with their guide going round the temples. Seen from the
 * overview they are small moving dots on the roads; up close they walk,
 * stop, look, take photos, step aside for the explorer and greet him.
 * And Khmer life round the map (`_scene*.ts`): fishermen casting round nets
 * from boats on the great lake and the valley river and from the shallows
 * (`_sceneFish.ts`); an ox cart on the village trail (`_sceneCart.ts`, the
 * white oxen: `_ox.ts`); children flying khleng kites south of the paddies
 * (`_sceneKites.ts`); farmers planting, weeding and reaping by the season
 * (`_sceneFarm.ts`); village life: verandas, the jetty, a fruit stall,
 * children playing, the monk's alms round (`_sceneVillage.ts`); apsara
 * dancers with torches and a pinpeat ensemble in front of Angkor Wat at
 * night (`_sceneApsara.ts`). Their things (boats, the cart, kites and their
 * strings, the thrown net, torch stands, the stall) are boxes of one more
 * InstancedMesh (`_things.ts`). Their sounds go into `f.calls`
 * (`PeopleCallKind`: audio/people.ts).
 *
 * - The model, its kinds, poses and props: `_personModel.ts` (one
 *   InstancedMesh for everyone, posed in the vertex shader) and
 *   `_kinds.ts` (how each kind dresses).
 * - One person on the map: `_actor.ts`. Where people walk and how they get
 *   past each other: `_routes.ts`.
 * - The scenes: `_monks.ts`, `_tour.ts`, `_scene*.ts` (each a `PeopleScene`,
 *   `_scene.ts`; far off they step less often or hide: `Pace`); words over
 *   heads: `_bubble.ts`.
 *
 * A new scene: make it with the shared `PeopleEnv` (it adds its people to
 * the crowd when built), add it to `SCENES` below, and make room in
 * `CAPACITY` (and `THINGS`).
 *
 * Cost: 6 draws (the crowd, the things, the oxen: each +1 for its shadow);
 * ≈ 50 people's state machines on the CPU (< 0.1 ms a frame). URL:
 * `people=lineup` (every kind and pose on the valley road), `people=0`
 * (none), `people=<scene>,<scene>` (only those: monks, tour, fish, cart,
 * apsara, farm, kites, village), `monks=<m>` (the procession that far below
 * Angkor Wat's gate), `tour=<place>[:<s>]` (the visitors at that temple's
 * stop), `fish=<s>` (every fisherman that far into a throw), `cart=<m>`
 * (the ox cart that far round its loop).
 */

/** Room in the crowd (people the scenes add, and some to spare for more scenes). */
const CAPACITY = 60;
/** Room in the things (boxes of boats, the cart, kites, torches…: `_things.ts`). */
const THINGS = 640;
/** The scenes by name (`people=<name>,<name>` builds only those). */
const SCENES: Record<string, (env: PeopleEnv, ctx: MapContext) => PeopleScene> = {
  monks: (e) => new Monks(e),
  tour: (e) => new Tour(e),
  fish: (e) => new Fishermen(e),
  cart: (e) => new OxCart(e),
  apsara: (e) => new Apsara(e),
  farm: (e) => new Farmers(e),
  kites: (e) => new KiteKids(e),
  village: (e, c) => new VillageLife(e, c.scene),
};
/**
 * People, their things and the oxen cast shadows only while someone shown is
 * this near the camera (m): farther off a person's shadow is a texel or two
 * of the shadow map, and the crowd costs ≈ 100 k triangles a shadow pass.
 */
const SHADOW_NEAR = 250;
/** Seconds of life simulated before a still (shots), and of the explorer's effect on it. */
const PREROLL = 8;
const REACT = 1.6;

export function buildPeople(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'people';
  const params = new URLSearchParams(location.search);
  if (params.get('people') === 'lineup') {
    const l = buildPeopleLineup(ctx.field);
    object.add(l.crowd.mesh);
    return { name: 'people', object, update: (f) => l.update(f.t, f.night) };
  }
  const t0 = performance.now();
  const crowd = new Crowd(CAPACITY);
  object.add(crowd.mesh);
  const graph = new RoadGraph(ctx.field);
  const ground = Ground.of(ctx.field, ctx.scene);
  const traffic = new Traffic(ctx.scene);
  traffic.addBeacons(graph);
  const things = new Things(THINGS);
  object.add(things.mesh);
  const env: PeopleEnv = { crowd, graph, ground, traffic, bubble: new Bubble(), shot: ctx.shot, params, things };
  const only = params.get('people');
  const names = only === '0' ? [] : only ? only.split(',').filter((n) => n in SCENES) : Object.keys(SCENES);
  const scenes: PeopleScene[] = names.map((n) => SCENES[n](env, ctx));
  for (const s of scenes) if (s.object) object.add(s.object);
  const actors: Actor[] = scenes.flatMap((s) => [...s.actors]);
  Object.assign(window, { __people: { scenes, crowd, traffic, graph } });
  const buildMs = performance.now() - t0;
  const draws = 4 + scenes.filter((s) => s.object).length * 2;
  console.info(`[map] people: ${crowd.count} (${scenes.map((s) => s.name).join(', ')}) · ${crowd.boxes} boxes a person · ${things.used} thing boxes · ${draws} draws · built in ${buildMs.toFixed(0)} ms`);

  let now = 0;
  let started = false;
  let settled = false;
  const live = (dt: number, f: MapFrame, explorer = true) => {
    // (rain: walks quicken; scenes open umbrellas from `eventsNow(f).umbrellas` themselves)
    RAIN_PACE.hurry = eventsNow(f).hurry;
    traffic.update(f, explorer);
    for (const s of scenes) s.report(traffic);
    for (const s of scenes) s.update(dt, now, f, traffic.explorer);
    keepApart(actors, traffic.list);
    env.bubble.update(dt, f.camera, f.roam !== 'overview');
  };
  // (the shadow casters: the crowd, the things, the oxen; on for the first frames so their depth shaders compile at load)
  const casters: Object3D[] = [crowd.mesh, things.mesh];
  for (const s of scenes) s.object?.traverse((o) => void (o.castShadow && casters.push(o)));
  let casting = true;
  let warm = ctx.shot ? 0 : 6;
  const shadows = (f: MapFrame) => {
    if (warm > 0) return void warm--;
    const c = f.camera.position;
    let near = Infinity;
    for (const a of actors) if (a.shown) near = Math.min(near, (a.x - c.x) ** 2 + (a.y - c.y) ** 2 + (a.z - c.z) ** 2);
    const on = near < SHADOW_NEAR * SHADOW_NEAR;
    if (on === casting) return;
    casting = on;
    for (const o of casters) o.castShadow = on;
  };
  // (CPU a frame, measured over the first frames: printed once)
  let cpu = 0;
  let frames = 0;
  return {
    name: 'people',
    object,
    update(f: MapFrame) {
      let c0 = performance.now();
      if (!started) {
        started = true;
        now = ctx.shot ? f.t - PREROLL : f.t;
        // (a still: their life before it, then how they took the explorer's arrival)
        if (ctx.shot) for (let k = 0; k < PREROLL * 10; k++, now += 0.1) live(0.1, f, false);
      } else if (ctx.shot && !settled && f.dt > 0) {
        settled = true;
        for (let k = 0; k < REACT * 10; k++, now += 0.1) live(0.1, f);
        c0 = performance.now();
      }
      now += f.dt;
      live(f.dt, f);
      shadows(f);
      crowd.flush(now, f.night);
      things.flush(f.night);
      if (f.dt > 0 && frames < 24) {
        cpu += performance.now() - c0;
        if (++frames === 24 && ctx.shot) console.info(`[map] people: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24)`);
      }
    },
    // (the nature book, roam/_book.ts: who is out now, by kind; read only)
    subjects(out: Subject[]) {
      for (const a of actors) {
        if (!a.shown || !a.look.kind || !crowd.isShown(a.i)) continue;
        const r = 0.85 * PEOPLE_SCALE * a.look.height;
        out.push({ kind: a.look.kind as SubjectKind, x: a.x, y: a.y + r, z: a.z, r });
      }
      for (const s of scenes) s.subjects?.(out);
    },
  };
}
