import { Group, Sphere, Vector3 } from 'three';
import { CastView } from '../cull';
import { Crowd } from '../people/_personModel';
import type { MapContext, MapFrame, MapPart } from '../types';
import { createBanner } from './_banner';
import { Glow } from './_glow';
import { Kit, kitUniforms, PERIOD } from './_kit';
import { buildNewYear } from './_newyear';
import { FESTIVAL_SCENE, festivalNow, type Festival } from './_schedule';
import { buildWaterFestival } from './_water';

/**
 * Khmer festivals on the map (part `festival`), when the calendar says so
 * (`_schedule.ts`: `MapFrame.season` and the moon) or the URL holds one
 * (`fest=water|newyear`):
 *
 * - **Bon Om Touk**, the Water Festival (`_water.ts`): dragon boats race on
 *   the great lake by day, the village cheering on the beach; at night lit
 *   floats and floating lotus candles on the lake and Angkor Wat's moat,
 *   families saluting the full moon (Sampeah Preah Khae).
 * - **Chaul Chnam Thmey**, Khmer New Year (`_newyear.ts`): sand stupas,
 *   flags and bunting, water play, Chol Chhoung, blessings of the elders,
 *   musicians.
 *
 * Draws: the festival on shows its kit (all its boxes: one draw and one for
 * the shadow, `_kit.ts`), its people (one crowd of the people part's model:
 * one draw and its shadow) and, for the Water Festival, its glow (one
 * additive draw: halos and streaks on the water, `_glow.ts`). With no
 * festival nothing is drawn; the shaders are compiled at load all the same
 * (the meshes stay in the scene with no instances). The kit casts shadows
 * only while they can be seen, and is drawn only while it or they can
 * (`KitMesh.inView`; three cannot cull what the shader poses).
 *
 * The festival's name shows under the title card, and once as a toast when
 * roaming starts (`_banner.ts`, words in ui/lang.ts). Its sounds are in
 * audio/festival.ts (it reads `FESTIVAL_SCENE`).
 */
export function buildFestival(ctx: MapContext): MapPart {
  const t0 = performance.now();
  const object = new Group();
  object.name = 'festival';
  const u = kitUniforms();
  // (the pagoda's terrace is there only when the village part is built)
  const villageBuilt = !!ctx.scene.getObjectByName('village');

  const wKit = new Kit();
  const wGlow = new Glow();
  const water = buildWaterFestival(wKit, wGlow, u, ctx.field);
  const wMesh = wKit.build('festival:water', u);
  const glow = wGlow.build('festival:water', u);
  const nKit = new Kit();
  const newYear = buildNewYear(nKit, ctx.field, villageBuilt);
  const nMesh = nKit.build('festival:newyear', u);

  const scenes = { water, newyear: newYear } as const;
  const capacity = Math.max(water.looks.length, newYear.looks.length);
  const crowd = new Crowd(capacity, 'festival');
  for (let i = 0; i < capacity; i++) crowd.add(water.looks[i] ?? newYear.looks[i]);
  crowd.mesh.count = 0;
  // (the crowd is drawn only when its festival's ground is in view: the lake and its beach, or the village and Angkor Wat;
  // not culled for the first frames, so its shaders compile at load)
  let warm = 0;
  const reach: Record<Festival, Sphere> = { water: new Sphere(new Vector3(-432, 8, 8), 165), newyear: new Sphere(new Vector3(-150, 30, -48), 245) };
  const view = new CastView();
  object.add(wMesh.mesh, glow.mesh, nMesh.mesh, crowd.mesh);

  const banner = createBanner();
  let active: Festival | null | undefined;
  let now = 0;
  let started = false;
  let cpu = 0;
  let frames = 0;
  console.info(
    `[map] festival: water ${wMesh.boxes} boxes + ${wGlow.count} glows, new year ${nMesh.boxes} boxes, crowd ${water.looks.length} / ${newYear.looks.length} (${crowd.boxes} boxes a person)${villageBuilt ? '' : ' · no village part: the pagoda on the bare ground'} · built in ${(performance.now() - t0).toFixed(0)} ms`,
  );

  /** Show one festival's things and dress its people (or none). */
  function activate(kind: Festival | null): void {
    active = kind;
    wMesh.show(kind === 'water');
    glow.show(kind === 'water');
    nMesh.show(kind === 'newyear');
    FESTIVAL_SCENE.kind = kind;
    FESTIVAL_SCENE.crowd = FESTIVAL_SCENE.music = FESTIVAL_SCENE.play = null;
    for (const b of FESTIVAL_SCENE.boats) b.row = 0;
    if (!kind) {
      crowd.mesh.count = 0;
      return;
    }
    crowd.mesh.boundingSphere = reach[kind];
    const looks = scenes[kind].looks;
    for (let i = 0; i < looks.length; i++) {
      crowd.dress(i, looks[i]);
      crowd.hide(i);
    }
    crowd.mesh.count = looks.length;
  }

  return {
    name: 'festival',
    object,
    blocks: wMesh.boxes + nMesh.boxes,
    update(f: MapFrame) {
      const c0 = performance.now();
      if (warm < 3 && ++warm === 3) crowd.mesh.frustumCulled = true;
      if (!started) {
        started = true;
        now = f.t;
      } else now += f.dt;
      const kind = festivalNow(f);
      banner.update(kind, f.roam !== 'overview', f.t);
      const first = kind !== active;
      if (first) activate(kind);
      FESTIVAL_SCENE.t = now;
      FESTIVAL_SCENE.night = f.night;
      if (!kind) return;
      const n = f.night;
      u.uTime.value = ((now % PERIOD) + PERIOD) % PERIOD;
      u.uNight.value = n;
      // Glowing boxes: soft by day, blooming at night.
      u.uGlow.value = 0.3 + 3.2 * n * n;
      glow.level.value = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
      // (no glow by day: no draw)
      glow.show(kind === 'water' && glow.level.value > 0);
      // The people's shadows only when the camera is near enough to see them.
      const r = reach[kind];
      crowd.mesh.castShadow = f.camera.position.distanceTo(r.center) < r.radius + 250;
      scenes[kind].update(f, now, f.dt, crowd, first);
      // (the kit where its rigs are now; drawn and casting in the first frames: its shaders compile at load)
      if (warm >= 3) {
        const kit = kind === 'water' ? wMesh : nMesh;
        view.set(f);
        kit.mesh.castShadow = kit.inView(view, true);
        kit.mesh.visible = kit.mesh.castShadow || kit.inView(view, false);
      }
      crowd.flush(now, n);
      if (f.dt > 0 && frames < 24) {
        cpu += performance.now() - c0;
        if (++frames === 24 && ctx.shot) console.info(`[map] festival: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24)`);
      }
    },
  };
}
