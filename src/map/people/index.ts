import { Group, type Object3D } from 'three';
import type { MapContext, MapFrame, MapPart, Subject, SubjectKind } from '../types';
import { eventsNow } from '../events';
import { keepApart, RAIN_PACE, type Actor } from './_actor';
import { Bubble } from './_bubble';
import { GreetBack } from './_greetBack';
import { SaleBack } from './_saleBack';
import { buildPeopleLineup } from './_lineup';
import { Crowd, PEOPLE_SCALE } from './_personModel';
import { Ground, RoadGraph, Traffic } from './_routes';
import type { PeopleEnv, PeopleScene } from './_scene';
import { Things } from './_things';

/**
 * People on the map (part `people`): the monks of Angkor Wat (a procession
 * on the valley road, a monk sweeping below the gate) and a group of
 * visitors with their guide going round the temples. Seen from the
 * overview they are small moving dots on the roads; up close they walk,
 * stop, look, take photos, step aside for the explorer and greet him.
 * And Khmer life round the map (`_scene*.ts`): fishermen casting round nets
 * from boats on the great lake and the valley river and from the shallows
 * (`_sceneFish.ts`); an ox cart on the village trail (`_sceneCart.ts`, the
 * white oxen: `_ox.ts`); kite flyers: children south of the west paddies,
 * families with big humming khleng ek south of the east paddies in the dry
 * season (`_sceneKites.ts`, the kites `_kite.ts`); farmers planting,
 * weeding and reaping by the season (`_sceneFarm.ts`); village life: verandas, the jetty,
 * children playing, the monk's alms round (`_sceneVillage.ts`) and its market
 * (sellers, boats at the jetty, buyers: `_sceneVillageMarket.ts`); apsara
 * dancers with torches and a pinpeat ensemble in front of Angkor Wat at
 * night (`_sceneApsara.ts`). Their things (boats, the cart, kites and their
 * strings, the thrown net, torch stands, the stall) are boxes of one more
 * InstancedMesh (`_things.ts`). Their sounds go into `f.calls`
 * (`PeopleCallKind`: audio/people.ts).
 *
 * - The model, its kinds, poses and props: `_personModel.ts` (everyone in
 *   two InstancedMeshes, near and far, posed on the GPU by a bone pass; `FIT`
 *   for where bodies meet things) and `_kinds.ts` (how each kind dresses);
 *   the bicycle a rider fits: `_bicycle.ts`.
 * - One person on the map: `_actor.ts`. Where people walk and how they get
 *   past each other: `_routes.ts`.
 * - The scenes: `_monks.ts`, `_tour.ts`, `_scene*.ts` (each a `PeopleScene`,
 *   `_scene.ts`; far off they step less often or hide: `Pace`); words over
 *   heads: `_bubble.ts`.
 *
 * A new scene: make it with the shared `PeopleEnv` (it adds its people to
 * the crowd when built), add its module's loader to `SCENES` below (a scene
 * that fails to load or build is logged and left out), and make room in
 * `CAPACITY` (and `THINGS`).
 *
 * Cost: 8 draws (the crowd near and far, the things, the oxen: each +1 for
 * its shadow; a list with nobody in it is not drawn) and the crowd's bone
 * pass; ≈ 140 people: the crowd packs the shown ones each frame (hidden:
 * nothing; far: the far model; on low out of view: nothing), ≈ 30 k
 * triangles from the overview, ≈ 100 k in the market; the
 * crowd and things ≈ 0.1 ms of CPU a frame (most of it the bone pass's
 * render target), the scenes the rest (a shot
 * prints both, and the CPU by step). URL:
 * `people=lineup` (every kind and pose on the valley road, and the new
 * life's; `_lineup.ts`), `lod=near|far` (everyone in one model), `people=0`
 * (none), `people=<scene>,<scene>` (only those: monks, tour, fish, cart,
 * apsara, farm, kites, village, villagemarket, market, palmsugar,
 * eastvillage, kulen, back), `monks=<m>` (the procession that far below
 * Angkor Wat's gate), `tour=<place>[:<s>]` (the visitors at that temple's
 * stop), `fish=<s>` (every fisherman that far into a throw), `cart=<m>`
 * (the ox cart that far round its loop).
 */

/** Room in the crowd (people the scenes add, and some to spare for more scenes). */
const CAPACITY = 240;
/** Room in the things (boxes of boats, the cart, kites, torches…: `_things.ts`). */
const THINGS = 2200;
/** A scene's maker (its module is loaded on its own: one that fails to load or to build is logged and left out). */
type SceneMaker = (env: PeopleEnv, ctx: MapContext) => PeopleScene;
/** The scenes by name (`people=<name>,<name>` builds only those). */
const SCENES: Record<string, () => Promise<SceneMaker>> = {
  monks: async () => ((m) => (e) => new m.Monks(e))(await import('./_monks')),
  tour: async () => ((m) => (e) => new m.Tour(e))(await import('./_tour')),
  fish: async () => ((m) => (e) => new m.Fishermen(e))(await import('./_sceneFish')),
  cart: async () => ((m) => (e) => new m.OxCart(e))(await import('./_sceneCart')),
  apsara: async () => ((m) => (e) => new m.Apsara(e))(await import('./_sceneApsara')),
  farm: async () => ((m) => (e) => new m.Farmers(e))(await import('./_sceneFarm')),
  kites: async () => ((m) => (e) => new m.KiteKids(e))(await import('./_sceneKites')),
  village: async () => ((m) => (e, c) => new m.VillageLife(e, c.scene))(await import('./_sceneVillage')),
  // The floating village's market: its sellers, the women selling from boats at the jetty, buyers and eaters.
  villagemarket: async () => ((m) => (e, c) => new m.VillageMarket(e, c.scene))(await import('./_sceneVillageMarket')),
  // The east side and the new life round the map (each its own scene file).
  market: async () => ((m) => (e) => new m.MarketLife(e))(await import('./_sceneMarket')),
  palmsugar: async () => ((m) => (e) => new m.PalmSugarFamily(e))(await import('./_scenePalmSugar')),
  eastvillage: async () => ((m) => (e, c) => new m.EastVillageLife(e, c.scene))(await import('./_sceneEastVillage')),
  kulen: async () => ((m) => (e) => new m.KulenLife(e))(await import('./_sceneKulen')),
  back: async () => ((m) => (e) => new m.BackLife(e))(await import('./_sceneBack')),
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

export async function buildPeople(ctx: MapContext): Promise<MapPart> {
  const object = new Group();
  object.name = 'people';
  const params = new URLSearchParams(location.search);
  const force = params.get('lod');
  if (params.get('people') === 'lineup') {
    const l = buildPeopleLineup(ctx.field, { renderer: ctx.renderer, still: ctx.shot && !ctx.video });
    l.crowd.force = force === 'near' || force === 'far' ? force : null;
    object.add(l.object);
    return { name: 'people', object, update: (f) => l.update(f.t, f.night, f.camera) };
  }
  const only = params.get('people');
  const names = only === '0' ? [] : only ? only.split(',').filter((n) => n in SCENES) : Object.keys(SCENES);
  // (the scenes' modules load side by side; timed from when they are in)
  const makers = await Promise.allSettled(names.map((n) => SCENES[n]()));
  const t0 = performance.now();
  // (packed near and far lists: a hidden person costs nothing, a far one a fifth; `lod=near|far` puts everyone in one)
  const crowd = new Crowd(CAPACITY, 'people', { lod: true, renderer: ctx.renderer, still: ctx.shot && !ctx.video });
  crowd.force = force === 'near' || force === 'far' ? force : null;
  object.add(crowd.mesh, crowd.far!);
  const graph = new RoadGraph(ctx.field);
  const ground = Ground.of(ctx.field, ctx.scene);
  const traffic = new Traffic(ctx.scene);
  traffic.addBeacons(graph);
  const things = new Things(THINGS);
  object.add(things.mesh);
  const env: PeopleEnv = { crowd, graph, ground, traffic, bubble: new Bubble(), shot: ctx.shot, params, things };
  const scenes: PeopleScene[] = [];
  const failed: string[] = [];
  makers.forEach((m, k) => {
    try {
      if (m.status === 'rejected') throw m.reason;
      scenes.push(m.value(env, ctx));
    } catch (e) {
      failed.push(names[k]);
      console.error(`[map] people scene "${names[k]}" failed:`, e);
    }
  });
  for (const s of scenes) if (s.object) object.add(s.object);
  const actors: Actor[] = scenes.flatMap((s) => [...s.actors]);
  // (the explorer greets: those who see him greet him back, _greetBack.ts)
  const greetBack = new GreetBack(env, actors);
  // (the explorer buys at a stall: its seller looks up, hands it over and thanks him, _saleBack.ts)
  const saleBack = new SaleBack(env, actors);
  Object.assign(window, { __people: { scenes, crowd, traffic, graph } });
  const buildMs = performance.now() - t0;
  // (the crowd near and far, the things: each a draw and its shadow; the far list is drawn only while someone is in it)
  const draws = 6 + scenes.filter((s) => s.object).length * 2;
  console.info(
    `[map] people: ${crowd.count} (${scenes.map((s) => s.name).join(', ')}) · ${crowd.boxes} boxes a person (${crowd.farBoxes} far) · ${things.used} thing boxes · ${draws} draws · built in ${buildMs.toFixed(0)} ms${failed.length ? ` · FAILED: ${failed.join(', ')}` : ''}`,
  );

  let now = 0;
  let started = false;
  let settled = false;
  // (a shot's measured frames: CPU by scene, and the shared steps: traffic, greeting back, keeping apart, the bubble)
  const byScene = new Float64Array(scenes.length + 4);
  const live = (dt: number, f: MapFrame, explorer = true, measure = false) => {
    // (rain: walks quicken; scenes open umbrellas from `eventsNow(f).umbrellas` themselves)
    RAIN_PACE.hurry = eventsNow(f).hurry;
    let t = measure ? performance.now() : 0;
    const lap = (k: number) => {
      const n = performance.now();
      byScene[k] += n - t;
      t = n;
    };
    traffic.update(f, explorer);
    if (measure) lap(scenes.length);
    for (let k = 0; k < scenes.length; k++) {
      scenes[k].report(traffic);
      if (measure) lap(k);
    }
    for (let k = 0; k < scenes.length; k++) {
      scenes[k].update(dt, now, f, traffic.explorer);
      if (measure) lap(k);
    }
    greetBack.update(dt, now, f);
    saleBack.update(dt, now, f);
    if (measure) lap(scenes.length + 1);
    keepApart(actors, traffic.list);
    if (measure) lap(scenes.length + 2);
    env.bubble.update(dt, f.camera, f.roam !== 'overview');
    if (measure) lap(scenes.length + 3);
  };
  // (the shadow casters: the crowd, the things, the oxen; on for the first frames so their depth shaders compile at load)
  const casters: Object3D[] = [crowd.mesh, crowd.far!, things.mesh];
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
  // (CPU a frame, measured over the first frames: printed once; the crowd's own packing and uploads apart)
  let cpu = 0;
  let cpuCrowd = 0;
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
      live(f.dt, f, true, ctx.shot && f.dt > 0 && frames < 24);
      shadows(f);
      const c1 = performance.now();
      crowd.flush(now, f.night, f.camera);
      things.flush(f.night);
      if (f.dt > 0 && frames < 24) {
        const c2 = performance.now();
        cpu += c2 - c0;
        cpuCrowd += c2 - c1;
        if (++frames === 24 && ctx.shot) {
          const tris = (crowd.drawn.near * crowd.boxes + crowd.drawn.far * crowd.farBoxes) * 12;
          console.info(`[map] people: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24; the crowd and things ${(cpuCrowd / 24).toFixed(3)}) · drawn ${crowd.drawn.near} near + ${crowd.drawn.far} far of ${crowd.count} (${(tris / 1000).toFixed(0)} k triangles, ${((things.used * 12) / 1000).toFixed(0)} k in things)`);
          const names = [...scenes.map((s) => s.name), 'traffic', 'greetBack', 'keepApart', 'bubble'];
          console.info(`[map] people CPU by step (ms a frame): ${names.map((n, k) => `${n} ${(byScene[k] / 24).toFixed(3)}`).join(' · ')}`);
        }
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
