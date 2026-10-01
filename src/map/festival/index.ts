import { Group, Sphere, Vector3, type InstancedBufferAttribute, type Mesh } from 'three';
import { CastView } from '../cull';
import { Crowd } from '../people/_personModel';
import { fadeNearMaterial } from '../roam/_nearFade';
import type { MapContext, MapFrame, MapPart, Subject } from '../types';
import { PAGODA } from '../village/_spots';
import { createBanner } from './_banner';
import { PROCESSION } from './_circuit';
import { Glow } from './_glow';
import { Kit, kitUniforms, PERIOD, type KitMesh } from './_kit';
import { buildNewYear } from './_newyear';
import { buildPchumBen } from './_pchumBen';
import { FESTIVAL_SCENE, festivalNow, type Festival } from './_schedule';
import { buildVisak } from './_visak';
import { buildWaterFestival } from './_water';

/**
 * Khmer festivals on the map (part `festival`), when the calendar says so
 * (`_schedule.ts`: `MapFrame.season` and the moon) or the URL holds one
 * (`fest=water|newyear|pchumben|visak`):
 *
 * - **Bon Om Touk**, the Water Festival (`_water.ts`): racing boats (ngo) race on
 *   the great lake by day, the village cheering on the beach; at night lit
 *   floats and floating lotus candles on the lake and Angkor Wat's moat,
 *   families saluting the full moon (Sampeah Preah Khae).
 * - **Chaul Chnam Thmey**, Khmer New Year (`_newyear.ts`): sand stupas,
 *   flags and bunting, water play, Chol Chhoung, blessings of the elders,
 *   musicians.
 * - **Pchum Ben** (`_pchumBen.ts`) at the village pagoda: before dawn people
 *   walk round the hall with candles throwing rice balls (bay ben) for the
 *   ancestors' spirits; by day families bring food to the monks in tiffin
 *   carriers.
 * - **Visak Bochea** (`_visak.ts`) at the village pagoda: on the full-moon
 *   night the candle procession, three times round the hall, the monks
 *   leading. (The two pagoda festivals share the way round the hall and its
 *   line of people: `_circuit.ts`, `_pagodaLine.ts`; the explorer joins them:
 *   roam/_pchumBen.ts, roam/_visak.ts.)
 *
 * Draws: the festival on shows its kit (all its boxes: one draw and one for
 * the shadow, `_kit.ts`), its people (one crowd of the people part's model:
 * one draw and its shadow), its glow when it has one at night (one additive
 * draw: halos and streaks, `_glow.ts`; the pagoda's walkers' candles move
 * with them) and, at Pchum Ben, the rice balls in the air (one small
 * instanced draw). With no festival nothing is drawn (the meshes stay in the
 * scene with no instances). The kit casts shadows only while they can be
 * seen, and is drawn only while it or they can (`KitMesh.inView`; three
 * cannot cull what the shader poses).
 *
 * The part is built only for a visit that can see a festival (main.ts,
 * lazy.ts): as the page opens when one is on (or `fest=` holds one), else in
 * the background once `festivalSoon` says one is within about a day of the
 * map's time; its shaders are compiled before it joins the scene.
 *
 * The festival's name shows under the title card, and once as a toast when
 * roaming starts (`_banner.ts`, words in ui/lang.ts). Its sounds: the Water
 * Festival's and New Year's in audio/festival.ts (it reads `FESTIVAL_SCENE`),
 * the pagoda's chant in audio/_visak.ts and audio/_pchum.ts (they follow
 * `PROCESSION`).
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
  // The pagoda's two: each its kit and its glow (its first quads the walkers' candles, moved by its line).
  const pKit = new Kit();
  const pGlow = new Glow();
  const pchum = buildPchumBen(pKit, pGlow, u, ctx.field, villageBuilt);
  const pMesh = pKit.build('festival:pchumben', u);
  const pGlowMesh = pGlow.build('festival:pchumben', u);
  const vKit = new Kit();
  const vGlow = new Glow();
  const visak = buildVisak(vKit, vGlow, ctx.field, villageBuilt);
  const vMesh = vKit.build('festival:visak', u);
  const vGlowMesh = vGlow.build('festival:visak', u);
  const attrs = (m: Mesh) => [m.geometry.getAttribute('gPos') as InstancedBufferAttribute, m.geometry.getAttribute('gCol') as InstancedBufferAttribute] as const;
  pchum.line.bindGlow(...attrs(pGlowMesh.mesh));
  visak.line.bindGlow(...attrs(vGlowMesh.mesh));
  const pagoda = { pchumben: pchum, visak } as const;

  const scenes = { water, newyear: newYear } as const;
  const lists = [water.looks, newYear.looks, pchum.looks, visak.looks];
  const capacity = Math.max(...lists.map((l) => l.length));
  const crowd = new Crowd(capacity, 'festival', { renderer: ctx.renderer, still: ctx.shot && !ctx.video });
  for (let i = 0; i < capacity; i++) crowd.add(lists.find((l) => l[i])![i]);
  crowd.mesh.count = 0;
  // (the crowd is drawn only when its festival's ground is in view: the lake and its beach, or the village and Angkor Wat,
  // or the pagoda's terrace and its stair; not culled for the first frames, so its shaders compile at load)
  let warm = 0;
  const atPagoda = new Sphere(new Vector3(PAGODA.x, PAGODA.floor, 100), 30);
  const reach: Record<Festival, Sphere> = {
    water: new Sphere(new Vector3(-432, 8, 8), 165),
    newyear: new Sphere(new Vector3(-150, 30, -48), 245),
    pchumben: atPagoda,
    visak: atPagoda,
  };
  const kits: Record<Festival, KitMesh> = { water: wMesh, newyear: nMesh, pchumben: pMesh, visak: vMesh };
  const view = new CastView();
  const balls = pchum.line.balls;
  object.add(wMesh.mesh, glow.mesh, nMesh.mesh, pMesh.mesh, pGlowMesh.mesh, vMesh.mesh, vGlowMesh.mesh, crowd.mesh);
  if (balls) object.add(balls);
  // (the follow camera sees through pennants, boats and people close in front of it: the part is not solid to the camera)
  for (const m of [wMesh.mesh.material, nMesh.mesh.material, pMesh.mesh.material, vMesh.mesh.material, crowd.mesh.material]) if (!Array.isArray(m)) fadeNearMaterial(m);

  const banner = createBanner();
  let active: Festival | null | undefined;
  let now = 0;
  let started = false;
  let cpu = 0;
  let frames = 0;
  console.info(
    `[map] festival: water ${wMesh.boxes} boxes + ${wGlow.count} glows, new year ${nMesh.boxes} boxes, Pchum Ben ${pMesh.boxes} boxes + ${pGlow.count} glows, Visak Bochea ${vMesh.boxes} boxes + ${vGlow.count} glows, crowd ${lists.map((l) => l.length).join(' / ')} (${crowd.boxes} boxes a person)${villageBuilt ? '' : ' · no village part: the pagoda on the bare ground'} · built in ${(performance.now() - t0).toFixed(0)} ms`,
  );

  /** Show one festival's things and dress its people (or none). */
  function activate(kind: Festival | null): void {
    // (the pagoda's festival going away: its line, its people and its sound off)
    if (active === 'pchumben' || active === 'visak') pagoda[active].clear(crowd);
    active = kind;
    wMesh.show(kind === 'water');
    glow.show(kind === 'water');
    nMesh.show(kind === 'newyear');
    pMesh.show(kind === 'pchumben');
    pGlowMesh.show(kind === 'pchumben');
    vMesh.show(kind === 'visak');
    vGlowMesh.show(kind === 'visak');
    FESTIVAL_SCENE.kind = kind;
    FESTIVAL_SCENE.crowd = FESTIVAL_SCENE.music = FESTIVAL_SCENE.play = null;
    for (const b of FESTIVAL_SCENE.boats) b.row = 0;
    if (kind !== 'pchumben' && kind !== 'visak') {
      PROCESSION.kind = null;
      PROCESSION.running = PROCESSION.full = false;
      PROCESSION.chant = null;
    }
    if (!kind) {
      crowd.mesh.count = 0;
      return;
    }
    crowd.mesh.boundingSphere = reach[kind];
    const looks = kind === 'pchumben' || kind === 'visak' ? pagoda[kind].looks : scenes[kind].looks;
    for (let i = 0; i < looks.length; i++) {
      crowd.dress(i, looks[i]);
      crowd.hide(i);
    }
    crowd.mesh.count = looks.length;
  }

  return {
    name: 'festival',
    object,
    blocks: wMesh.boxes + nMesh.boxes + pMesh.boxes + vMesh.boxes,
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
      const lit = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
      glow.level.value = pGlowMesh.level.value = vGlowMesh.level.value = lit;
      // (no glow by day: no draw)
      glow.show(kind === 'water' && lit > 0);
      pGlowMesh.show(kind === 'pchumben' && lit > 0);
      vGlowMesh.show(kind === 'visak' && lit > 0);
      // The people's shadows only when the camera is near enough to see them.
      const r = reach[kind];
      crowd.mesh.castShadow = f.camera.position.distanceTo(r.center) < r.radius + 250;
      if (kind === 'pchumben' || kind === 'visak') pagoda[kind].update(f, now, crowd, first);
      else scenes[kind].update(f, now, f.dt, crowd, first);
      // (the kit where its rigs are now; drawn and casting in the first frames: its shaders compile at load)
      if (warm >= 3) {
        const kit = kits[kind];
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
    // (the nature book, roam/_book.ts: the festival's people where they are now, one kind for them all)
    subjects(out: Subject[]) {
      if (!active) return;
      const m = crowd.mesh.instanceMatrix.array as ArrayLike<number>;
      for (let i = 0; i < crowd.mesh.count; i++) {
        if (!crowd.isShown(i)) continue;
        const o = i * 16;
        const r = 0.85 * crowd.scale(i);
        out.push({ kind: 'festival', x: m[o + 12], y: m[o + 13] + r, z: m[o + 14], r });
      }
    },
  };
}
