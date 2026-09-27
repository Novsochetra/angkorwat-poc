import { Group, Matrix4, Vector2, Vector3, type BufferAttribute, type InstancedMesh } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder, type VoxelBox } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { len2 } from '../fauna/_len';
import { GlowBlocks, glowMaterial, haloPoints, LightPools, pointScale, type Halo } from '../road/glow';
import { registerShop, type ShopItem } from '../shop';
import type { MapContext, MapFrame, Subject } from '../types';
import { Palms } from '../veg/palms';
import type { HamletPiece } from './index';
import { bendWithPalms } from './_psBend';
import { buildHome } from './_psHome';
import { buildHut, FIRE, WOK_TOP } from './_psHut';
import { psLadder } from './_psPalms';
import {
  BUY,
  CHIMNEY,
  COWS,
  HOME,
  HOME_LAMP,
  HUT,
  JARS,
  LANTERN,
  psCooking,
  psLamps,
  psPlan,
  psWorking,
  RACKS,
  SIGN,
  STALL,
  STOVE,
  SYRUP_DROP,
  WOK_R,
  WOKS,
  YARD,
  type Cooking,
  type Lamps,
  type PsPalm,
} from './_psPlan';
import { psSign } from './_psSign';
import { buildStall } from './_psStall';
import { buildSteam } from './_psSteam';
import { buildSyrup } from './_psSyrup';
import { buildYard } from './_psYard';

/**
 * The palm sugar yard (ចំការត្នោត, the passport's ខ្ទមស្ករត្នោត) of a
 * family between the sugar-palm village and the east paddies (layout.ts
 * `PALM_GROVE`; where everything stands: `_psPlan.ts`; the family and their
 * animals: people/_scenePalmSugar.ts, _scenePalmSugarYard.ts).
 *
 * Palm sugar (ស្ករត្នោត) as it is made in Cambodia (Kampong Speu's has the
 * EU's protected name; the same yards line the road to Banteay Srei at the
 * foot of Phnom Kulen): the sugar palm (ដើមត្នោត, Borassus flabellifer,
 * the national tree) is tapped in the dry season, about November to May.
 * The tapper climbs each palm twice a day on a bamboo ladder — one long pole
 * lashed to the trunk, the stubs of its side branches for footholds — in
 * the morning to bring down the tubes (បំពង់) that filled overnight under
 * the cut flower stalks, in the afternoon to hang clean ones; he shaves a
 * thin slice off each stalk with his knife so the juice keeps running, and
 * a sliver of popel wood in each tube keeps it from souring. A tapper climbs
 * about twenty palms a day; a family needs at least fifteen. The juice goes
 * home on a shoulder pole (or hung on a bicycle), through a cloth into big
 * jars, then into wide iron woks on a long clay stove fired with dry palm
 * fronds: two to three hours of boiling and stirring with a wooden paddle,
 * eight or nine litres of juice to a kilogram of sugar — the men climb, the
 * women cook and pack. The thick amber syrup is beaten as it cools and
 * poured into little rings of palm leaf, where it sets in a few minutes into
 * round golden-brown cakes (ស្ករដុំ), dried in the sun on flat trays, sold
 * wrapped in palm leaf; the rest is kept as paste in jars. The family sells
 * its own at a stall by the road, with fresh juice (ទឹកត្នោត) in the morning.
 *
 * What is built here:
 * - the sugar palms of the yard and on the paddies' dikes (veg/palms.ts:
 *   16, 8 of them tapped, the tubes on the ladder's side; in clumps and
 *   singles), and each tapped one's bamboo ladder with its lashings,
 *   footholds and the crossbar to stand on (`_psPalms.ts`), bending with its
 *   palm in the wind (`_psBend.ts`);
 * - the shed (`_psHut.ts`): smoke-dark thatch with a raised vent, woven
 *   gables and west wall, the long clay stove with three woks and three fire
 *   mouths facing the lane, a chimney, the juice jars, the mat of moulds, a
 *   bench, a lantern, fronds and firewood, a rack of clean tubes;
 * - the family's palm-leaf house on its posts (`_psHome.ts`): veranda,
 *   stair, the lamp by the door, a hammock and the kre under it, water jars;
 * - the yard (`_psYard.ts`): swept earth, the drying racks of cakes in the
 *   sun, the fence along the lane, a frond stack, the bicycle, a straw
 *   stack and the cows' stakes, a banana clump, pots of flowers, the dog;
 * - the stall by the lane (`_psStall.ts`, a shop: palm sugar cakes, fresh
 *   palm juice, young palm fruit; open while the family works) and its
 *   painted sign "ស្ករត្នោត / ទឹកត្នោតស្រស់" turned up the lane (`_psSign.ts`);
 * - the fire: coals and flames glowing in the mouths (glow blocks that
 *   flicker, above 1.0 at night: bloom; no light), only the coals after dusk,
 *   halos round the mouths and a warm pool on the floor at night; the lamps
 *   (the house's by its door and in its window, the shed's lantern: their
 *   own glow blocks and halos, `psLamps`);
 * - the juice boiling in the woks, each at its own stage, fresh to thick
 *   (`_psSyrup.ts`); the steam off them out of the vent and the open side,
 *   the wood smoke, sparks at night (`_psSteam.ts`);
 * - the stove with its woks and chimney, and the juice jars, solid to the
 *   roaming explorer (hidden blocks in the walk map, `palmSugar-solid`): he
 *   walks round them, never over the woks.
 *
 * The fire burns from the blue hour before dawn to dusk, embers through the
 * night (`psCooking`); the steam is thickest in the cool morning. Sounds
 * (`f.calls`, when the ears are within 60 m): the syrup's `bubble`, the
 * fire's `crackle`. Nature book: every palm is a `sugarPalm`.
 *
 * Cost: ≈ 2.7 k blocks (the shed ≈ 800, the house ≈ 330, the yard ≈ 430,
 * the stall and sign ≈ 330, the ladders ≈ 620) in four draws (bark with the
 * bend, stone, cloth, leaf) and the palms' two, the syrup, the fire's glow,
 * the lamps' glow (only while one is lit), the steam (+ halos and the
 * floor's pool at night); the blocks and palms cast only while their
 * shadows can be seen; built in ≈ 10 ms; its update is a few uniforms
 * (≈ 0.01 ms), and past 500 m from the camera the fire, the lamps, the syrup
 * and the steam are hidden.
 */

/** Past this far (m) from the camera nothing is updated (the steam and the glow are hidden). */
const FAR = 500;
/**
 * Past this far (m) from the shed (the yard's middle) the small blocks (props, the woks' rims, cords,
 * the ladders' stubs and lashings, the cakes, the sign's letters: most of them) are not drawn: under a
 * pixel there, and their triangles and shadows cost.
 */
const NEAR_DETAIL = 140;
/** Ears within this far (m) hear the syrup and the fire. */
const HEAR = 60;

/** The stall's goods (real 2026 prices, riel): a bundle of cakes wrapped in palm leaf, one cake, a tube of fresh juice, a bag of young palm fruit. */
const STALL_ITEMS: ShopItem[] = [
  { id: 'palmSugarBundle', name: { km: 'ស្ករត្នោតមួយខ្ចប់', en: 'Palm sugar cakes (a bundle)' }, price: 3000, consume: 'sweet', colors: [0xc08a42, 0x9a865e] },
  { id: 'palmSugarCake', name: { km: 'ស្ករត្នោតមួយដុំ', en: 'One palm sugar cake' }, price: 500, consume: 'sweet', colors: [0xc89448, 0xb07a38] },
  { id: 'palmJuice', name: { km: 'ទឹកត្នោតស្រស់', en: 'Fresh palm juice' }, price: 2000, consume: 'cupDrink', colors: [0x9a7a44, 0xeee2b8] },
  { id: 'youngPalmFruit', name: { km: 'ផ្លែត្នោតខ្ចី', en: 'Young palm fruit' }, price: 2000, consume: 'fruit', colors: [0xf2eee0, 0x3a2e28] },
];

export function buildPalmSugar(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const plan = psPlan(field);
  const gy = plan.y;
  const b = new VoxelBuilder();
  const glow = new GlowBlocks();
  const lampGlow = new GlowBlocks();
  const halos: Halo[] = [];
  const pools = new LightPools();
  const mouths: Vector3[] = [];

  // (the small things — props, rims, cords, stubs, cakes, letters — are drawn only near: `NEAR_DETAIL`)
  const small = new Set<VoxelBox>();
  // (the flames' glow blocks, by index: only the coals glow after dusk)
  const flames: number[] = [];
  // (the lamps' glow blocks, by index: the house's and the shed's, each folded away while it is out)
  const lampsOf: { home: number[]; shed: number[] } = { home: [], shed: [] };
  const count: Record<string, number> = {};
  const counted = (name: string, fn: () => void) => {
    const n0 = b.boxes.length;
    fn();
    count[name] = b.boxes.length - n0;
  };
  counted('shed', () =>
    buildHut(
      b,
      HUT.x,
      gy,
      HUT.z,
      (x, y, z, sx, sy, sz, color, phase) => {
        if (color === FIRE.flame) flames.push(glow.list.length);
        glow.add(HUT.x + x, gy + y, HUT.z + z, sx, sy, sz, 0, color, phase);
      },
      (x, y, z, sx, sy, sz, color, phase) => {
        lampsOf.shed.push(lampGlow.list.length);
        lampGlow.add(HUT.x + x, gy + y, HUT.z + z, sx, sy, sz, 0, color, phase);
      },
      small,
    ),
  );
  const homeY = field.heightAt(HOME.x, HOME.z);
  counted('house', () =>
    buildHome(
      b,
      homeY,
      (x, y, z, sx, sy, sz, color, phase) => {
        lampsOf.home.push(lampGlow.list.length);
        lampGlow.add(HOME.x + x, homeY + y, HOME.z + z, sx, sy, sz, 0, color, phase);
      },
      small,
    ),
  );
  counted('yard', () => buildYard(b, field, small));
  counted('stall', () => {
    buildStall(b, field.heightAt(STALL.x, STALL.z), small);
    // The painted sign over the stall's north-east corner, its face to the people coming down the lane from the village.
    psSign(b, SIGN.x, field.heightAt(SIGN.x, SIGN.z), SIGN.z, SIGN.face, small, SIGN.mid);
  });
  // (no tree on the house, the shed, the racks, the stall; none in the lane's view down to the shed, nor where the cows graze)
  field.occupy(HOME.x - 5.5, HOME.z - 4.5, HOME.x + 7.5, HOME.z + 5);
  field.occupy(HUT.x - 4.4, HUT.z - 9.6, HUT.x + 6.4, HUT.z + 6.4);
  field.occupy(RACKS[0].x0 - 1.2, RACKS[0].z - 2, RACKS[0].x1 + 1.5, RACKS[1].z + 2.2);
  field.occupy(STALL.x - 1.8, STALL.z - 3, STALL.x + 2.2, STALL.z + 2.6);
  field.occupy(YARD.straw.x - 2, YARD.straw.z - 2, YARD.straw.x + 2, YARD.straw.z + 2);
  field.occupy(384, -32, 397, -14);
  for (const c of COWS) field.occupy(c.x - c.r - 1.5, c.z - c.r - 1.5, c.x + c.r + 1.5, c.z + c.r + 1.5);
  const builtBlocks = b.boxes.length;

  // The fire mouths (east face of the stove): halos, and one warm pool on the floor before them (lit from the middle one).
  const fx = HUT.x + STOVE.x + STOVE.w / 2;
  WOKS.forEach((wz, k) => {
    const z = HUT.z + wz;
    mouths.push(new Vector3(fx + 0.05, gy + 0.3, z));
    halos.push({ x: fx + 0.25, y: gy + 0.3, z, size: 1.9, kind: 0, phase: k * 2.1 });
  });
  const pz = HUT.z + WOKS[1];
  const py = gy + 0.05;
  pools.quad(new Vector3(fx, py, pz - 5.3), new Vector3(fx, py, pz + 5.3), new Vector3(fx + 5.3, py, pz + 5.3), new Vector3(fx + 5.3, py, pz - 5.3), fx + 0.2, gy + 0.4, pz, 2.1);
  // The lamps' halos (the beacon kind: their own level): the house's lamp, the shed's lantern.
  const lampHalo = { home: halos.length, shed: halos.length + 1 };
  halos.push({ x: HOME.x + HOME_LAMP.x, y: homeY + HOME_LAMP.y, z: HOME.z + HOME_LAMP.z, size: 2.4, kind: 1, phase: 0.4 });
  halos.push({ x: HUT.x + LANTERN.x, y: gy + LANTERN.y, z: HUT.z + LANTERN.z, size: 2.2, kind: 1, phase: 1.9 });

  // The palms (veg/palms.ts: tapped ones with their tubes on the ladder's side) and the ladders (they bend with them).
  const palms = new Palms();
  const onPalm = new Map<VoxelBox, PsPalm>();
  for (const p of plan.palms) {
    palms.add({ kind: 'sugar', x: p.x, y: p.y, z: p.z, h: p.h, seed: p.seed, tapped: p.tapped, ladder: p.tapped ? p.ladder : undefined });
    if (p.tapped) {
      const n0 = b.boxes.length;
      psLadder(b, p, small);
      for (let i = n0; i < b.boxes.length; i++) onPalm.set(b.boxes[i], p);
    }
    field.occupy(p.x - 1.2, p.z - 1.2, p.x + 1.2, p.z + 1.2);
  }
  const ladderBlocks = b.boxes.length - builtBlocks;
  const palmSet = palms.build({ name: 'palmSugar:palms' });

  // The small blocks last in each family's list: far off, the meshes draw only the ones before them.
  const coarse = b.boxes.filter((x) => !small.has(x));
  const fine = b.boxes.filter((x) => small.has(x));
  b.boxes.length = 0;
  b.boxes.push(...coarse, ...fine);
  const object = new Group();
  object.name = 'palmSugar';
  const quality = ctx.quality === 'low' ? 'low' : 'medium';
  const blocks = buildVoxelMesh(b, { quality, name: 'palmSugar' });
  object.add(blocks);
  object.add(palmSet.object);
  // The stove, its woks and the chimney, and the juice jars by it: solid in the walk map (roam/walkmap.ts) up to 4 m
  // (hidden blocks, never drawn, never picked), else the stove's 0.7 m is a step the roaming explorer walks up and
  // over the woks, and the jars together a ledge; 4 m is over any jump's reach, and under the thatch. Bark: the
  // follow camera passes it softly. (The steam is not solid.)
  const hidden = new VoxelBuilder();
  hidden.span(HUT.x + STOVE.x - STOVE.w / 2, gy, HUT.z + CHIMNEY.z - 0.31, HUT.x + STOVE.x + STOVE.w / 2, gy + 4, HUT.z + STOVE.z1, 0x000000, 'mapBark');
  const jr = (k: number) => 0.41 * (1 - 0.08 * k);
  const [jx0, jx1] = [Math.min(...JARS.map((j, k) => j.x - jr(k))), Math.max(...JARS.map((j, k) => j.x + jr(k)))];
  const [jz0, jz1] = [Math.min(...JARS.map((j, k) => j.z - jr(k))), Math.max(...JARS.map((j, k) => j.z + jr(k)))];
  hidden.span(HUT.x + jx0, gy, HUT.z + jz0, HUT.x + jx1, gy + 4, HUT.z + jz1, 0x000000, 'mapBark');
  const solid = buildVoxelMesh(hidden, { quality: 'low', name: 'palmSugar-solid', castShadow: false, receiveShadow: false });
  solid.visible = false;
  solid.traverse((o) => (o.raycast = () => {}));
  object.add(solid);
  /** Each family's mesh: all its blocks, and how many are not small. */
  const detail: { mesh: InstancedMesh; all: number; coarse: number }[] = [];
  blocks.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    const mat = mesh.name.slice(mesh.name.lastIndexOf(':') + 1);
    detail.push({ mesh, all: mesh.count, coarse: coarse.filter((x) => x.mat === mat).length });
  });
  // The bark mesh's instances are the builder's bark blocks in order: the ladders' bend with their palm.
  const bark = blocks.getObjectByName('palmSugar:mapBark') as InstancedMesh | undefined;
  if (bark) {
    const feet = new Float32Array(bark.count * 4);
    let j = 0;
    for (const x of b.boxes) {
      if (x.mat !== 'mapBark') continue;
      const p = onPalm.get(x);
      if (p) feet.set([p.x, p.y, p.z, p.h], j * 4);
      j++;
    }
    bendWithPalms(bark, feet);
  }
  let detailed = true;

  // The fire: glow blocks (flickering), halos and floor pools at night.
  const { material: fireMat, uniforms: fire } = glowMaterial('lamp');
  fireMat.name = 'palmSugar:fire';
  const fireMesh = glow.mesh(fireMat, 'palmSugar:fire');
  object.add(fireMesh);
  const flameAt = flames.map((i) => {
    const m = new Matrix4();
    fireMesh.getMatrixAt(i, m);
    return m;
  });
  const folded = new Matrix4().makeScale(0, 0, 0);
  let flamesOn = true;
  // The lamps: glow blocks of their own (one draw while a lamp is lit), each lamp's folded away while it is out.
  const { material: lampMat, uniforms: lampU } = glowMaterial('lamp');
  lampMat.name = 'palmSugar:lamps';
  const lampMesh = lampGlow.mesh(lampMat, 'palmSugar:lamps');
  object.add(lampMesh);
  const lampAt = lampGlow.list.map((_, i) => {
    const m = new Matrix4();
    lampMesh.getMatrixAt(i, m);
    return m;
  });
  const lampOn = { home: true, shed: true };
  const halo = haloPoints(halos);
  halo.points.name = 'palmSugar:halos';
  halo.uniforms.uColor.value.setRGB(1, 0.5, 0.2);
  object.add(halo.points);
  const haloSize = halo.points.geometry.getAttribute('aSize') as BufferAttribute;
  const pool = pools.mesh('palmSugar:pools');
  object.add(pool.mesh);

  // The juice in the woks: fresh, thickening, thick.
  const syrup = buildSyrup(
    WOKS.map((wz, k) => ({ x: HUT.x + STOVE.x, y: gy + WOK_TOP - SYRUP_DROP, z: HUT.z + wz, r: WOK_R - 0.04, stage: [0.05, 0.5, 0.95][k], seed: hash3(k, 1, 2, 9181) })),
  );
  object.add(syrup.mesh);
  const steam = buildSteam({
    woks: WOKS.map((wz) => new Vector3(HUT.x + STOVE.x, gy + WOK_TOP, HUT.z + wz)),
    chimney: new Vector3(HUT.x + CHIMNEY.x, gy + CHIMNEY.top, HUT.z + CHIMNEY.z),
    mouths,
    out: new Vector2(3.2, 0),
    vent: new Vector2(-STOVE.x, 0),
  });
  object.add(steam.object);

  // The stall: a shop (roam/_shop*.ts offers "E  Buy" there), open while the family works, not in a storm.
  registerShop({
    id: 'palm-sugar-stall',
    name: { km: 'តូបស្ករត្នោត', en: 'Palm sugar stall' },
    x: BUY.x,
    y: field.heightAt(BUY.x, BUY.z),
    z: BUY.z,
    r: 1.8,
    facing: BUY.facing,
    items: STALL_ITEMS,
    open: (f) => psWorking(f.clock) && f.weather.storm <= 0.4,
  });

  // (the blocks cast only while their shadows can be seen; the rest never cast)
  const shadows = new ShadowGate().addAll(blocks).addAll(palmSet.object);
  const cook: Cooking = { fire: 0, steam: 0, boil: 0 };
  const lamps: Lamps = { home: 0, shed: 0 };
  let nextBubble = 0;
  let nextCrackle = 0;
  let lastNear = true;
  const nBlocks = b.boxes.length;
  const draws = detail.length;
  console.info(
    `[map] palmSugar: ${nBlocks} blocks (${Object.entries(count)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}, ladders ${ladderBlocks}; ${fine.length} small, drawn within ${NEAR_DETAIL} m) in ${draws} draws · ${plan.palms.length} palms (${plan.palms.filter((p) => p.tapped).length} tapped, ${palmSet.pieces} pieces) · built in ${(performance.now() - t0).toFixed(1)} ms`,
  );

  const hutAt = new Vector3(HUT.x, gy, HUT.z);
  return {
    object,
    blocks: nBlocks,
    update(f: MapFrame) {
      shadows.update(f);
      palmSet.update(f);
      const d = f.camera.position.distanceTo(hutAt);
      // (the small things only near)
      const near1 = d < NEAR_DETAIL;
      if (near1 !== detailed) {
        detailed = near1;
        for (const m of detail) m.mesh.count = near1 ? m.all : m.coarse;
      }
      const near = d < FAR;
      if (near !== lastNear) {
        lastNear = near;
        steam.object.visible = fireMesh.visible = syrup.mesh.visible = near;
      }
      if (!near) {
        halo.points.visible = pool.mesh.visible = lampMesh.visible = false;
        return;
      }
      psCooking(f.clock, f.weather.rain, cook);
      psLamps(f.clock, lamps);
      const n = f.night;
      const k = n * n * (3 - 2 * n);
      // Coals and flames: orange by day, blooming at night; embers only after dusk.
      fire.uTime.value = f.t;
      fire.uLevel.value = (0.95 + 2.9 * k) * cook.fire;
      fire.uPulse.value = 0.32;
      fire.uNearLevel.value = 1;
      // (the flames die down to embers after dusk: only the coals are left glowing)
      const on = cook.fire > 0.5;
      if (on !== flamesOn) {
        flamesOn = on;
        flames.forEach((i, j) => fireMesh.setMatrixAt(i, on ? flameAt[j] : folded));
        fireMesh.instanceMatrix.needsUpdate = true;
      }
      // The lamps: each lit one's blocks and halo shown, the level fading them in and out.
      const lit = Math.max(lamps.home, lamps.shed);
      lampMesh.visible = lit > 0.02;
      for (const w of ['home', 'shed'] as const) {
        const o = lamps[w] > 0.02;
        if (o === lampOn[w]) continue;
        lampOn[w] = o;
        for (const i of lampsOf[w]) lampMesh.setMatrixAt(i, o ? lampAt[i] : folded);
        lampMesh.instanceMatrix.needsUpdate = true;
        haloSize.setX(lampHalo[w], o ? halos[lampHalo[w]].size : 0);
        haloSize.needsUpdate = true;
      }
      lampU.uTime.value = f.t;
      lampU.uLevel.value = lit * (0.9 + 2.2 * k);
      lampU.uPulse.value = 0.12;
      lampU.uNearLevel.value = 1;
      const dark = k * cook.fire;
      halo.points.visible = dark > 0.05 || lit * k > 0.05;
      pool.mesh.visible = dark > 0.05;
      const scale = pointScale(ctx.renderer, f.camera);
      halo.uniforms.uTime.value = f.t;
      halo.uniforms.uScale.value = scale;
      halo.uniforms.uLamp.value = dark * k * 1.1;
      halo.uniforms.uBeacon.value = lit * k * 0.9;
      pool.uniforms.uTime.value = f.t;
      pool.uniforms.uLevel.value = dark * 0.45;
      pool.uniforms.uPulse.value = 0.3;
      syrup.update(f, cook.boil);
      steam.update(f, scale, cook.steam, 0.25 + 0.35 * cook.fire, k * Math.min(1, cook.fire * 3));
      if (f.dt > 0 && cook.fire > 0.15) sounds(f);
    },
    subjects(out: Subject[]) {
      palmSet.subjects(out);
    },
  };

  /** The syrup plopping in a wok, the fire crackling in a mouth, now and then, when the ears are near. */
  function sounds(f: MapFrame): void {
    const l = f.listener;
    if (len2(l.x - hutAt.x, l.z - hutAt.z) > HEAR) return;
    const r = hash3(Math.floor(f.t * 10), 3, 5, 9191);
    if (f.t >= nextBubble && cook.boil > 0.3) {
      const k = Math.floor(r * WOKS.length);
      f.calls.push({ kind: 'bubble', x: HUT.x + STOVE.x, y: gy + WOK_TOP, z: HUT.z + WOKS[k], gain: (0.5 + 0.2 * k) * cook.boil });
      nextBubble = f.t + 1.1 + 1.6 * r;
    }
    if (f.t >= nextCrackle) {
      const m = mouths[Math.floor(hash3(Math.floor(f.t * 10), 4, 6, 9192) * mouths.length)];
      f.calls.push({ kind: 'crackle', x: m.x, y: m.y, z: m.z, gain: 0.35 + 0.55 * cook.fire });
      nextCrackle = f.t + 0.7 + 1.5 * (1 - r) + (1 - cook.fire) * 3;
    }
  }
}
