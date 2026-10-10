import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_sell';
import { SFX } from '../audio/addonSfx';
import type { PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { HOME, HOME_AT, HOME_Z, homeFloor, homeToWorld } from '../hamlet/_homePlan';
import type { MapFrame, RoamMode } from '../types';
import { num, onLang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { gardenSay } from './_gardenToasts';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Grandma's gift (add-on `gardenGift`): the grandmother who kept his stilt
 * house has gone home after giving him the key (roam/_home*.ts), and left him
 * something to start his garden with. On his veranda, against the front wall
 * just west of the door (the side the stair comes up): a small round woven
 * basket (កញ្ជើ) with paper twists of seeds tied with red thread, a banana
 * sucker laid across it, a folded note on top, and beside it a papaya
 * seedling in its black bag; his tools leaning on the wall by it — the Khmer
 * hoe (ចប) and a galvanized watering can, as his own (roam/_gardenProps.ts).
 *
 * - It is there once she has gone (the house his, she out of sight down the
 *   trail). The first time he comes home with it still there (once a
 *   visit), a toast says Grandma left something by his door.
 * - On the veranda beside it: "E  Take Grandma's seeds". He turns to it,
 *   crouches and takes it up (the character's `interact`: the basket in his
 *   hand, then into his things), and the seeds are his: eggplant 3, corn 3, pumpkin 2, a banana sucker,
 *   a papaya seedling (`GIFT`: `GARDEN.addSeeds`, `GARDEN.takeGift`, saved).
 *   Her note is read out in two toasts in her own words (she calls him ចៅ),
 *   in the garden's line of toasts (_gardenToasts.ts `gardenSay`),
 *   then what he got.
 * - The hoe and the can stay leaning by the door (his tools' place).
 *
 * URL (checks): `gardengift=1` he stands on the veranda before it (with
 * `home=1`) · `gardengift=take` and takes it (`sim=_:<s>`: the note at
 * 0.85 s, the second line 3.6 s after, what he got after that) ·
 * `gardengift=taken` it is gone (the tools stay).
 */

/** The gift: what is in the basket, in the order the toast says it. */
const GIFT: readonly (readonly [PlantKindId, number])[] = [
  ['eggplant', 3],
  ['corn', 3],
  ['pumpkin', 2],
  ['banana', 1],
  ['papaya', 1],
];

/** Where it stands on the veranda (house-local m: the front wall's west side of the door), where he stands to take it, how near. */
const SPOT = { x: 1.62, z: 1.72 };
const STAND = { x: 1.15, z: 2.65 };
const REACH = 1.7;
/** The gift and the tools are drawn this much over true size (the house is built 1.4 × for the roaming explorer). */
const GIFT_SCALE = 1.35;
/** The hoe and the can against the wall, west of it (house-local). */
const TOOLS = { hoe: { x: 3.12, z: 1.47 }, can: { x: 2.6, z: 1.6 } };
/** The hint comes this near the house (m), this long after (s); the take: the basket goes at `GONE` s, done at `END` s. */
const HINT_NEAR = 16;
const HINT_AFTER = 1.5;
const GONE = 0.85;
const END = 1.9;
/** His chest over his feet (m, at his roaming size): the camera's look point while he takes it. */
const CHEST = 1.7 * 0.95 * 0.86;
/**
 * The camera while he takes it: low, out over the head of the stair (the gap in the railing) and a little to the side,
 * under the eaves' height so the roof's overhang never hides him, looking in at him and the basket by the door; eased
 * there, and back to the player's pitch and distance after. `yaw` is the follow camera's (it stands opposite it): the
 * house faces −z, so local (0.5, 1) out from him is the map's (−0.5, −1).
 */
const TAKE_CAM = { yaw: Math.atan2(0.5, 1), pitch: 0.05, distance: 3.9, rate: 5, back: 2.4 };

let env: AddonEnv | null = null;
let basket: Group | null = null;
let tools: Group | null = null;
let floorY = 0;
let curMode: RoamMode = 'overview';
/** Taking it: since when (s), the way he turns, gone yet. */
let take: { t: number; from: number; by: number; gone: boolean } | null = null;
/** The player's camera before the take (to go back to). */
let camBefore: { pitch: number; distance: number } | null = null;
/** The frame's clock (s). */
let clock = 0;
let hinted = false;
let nearSince = -1;
let prompt = '';
onLang(() => (prompt = ''));

/** The basket, the seeds, the sucker, the seedling and the note (house-local, the floor at y 0). */
function basketModel(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  // (drawn at the house's own scale, as its pots and jars: 1.35 × true size, so it reads beside the roaming explorer)
  const bx = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: number, mat: 'petal' | 'mapBark' | 'mapLeaf' | 'mapStone', ry = 0, rz = 0) => {
    const [x, z] = homeToWorld(SPOT.x + (lx - SPOT.x) * GIFT_SCALE, SPOT.z + (lz - SPOT.z) * GIFT_SCALE);
    b.box(x, floorY + y * GIFT_SCALE, z, sx * GIFT_SCALE, sy * GIFT_SCALE, sz * GIFT_SCALE, c, mat, { src, ry: ry + HOME_AT.facing, rz });
  };
  const { x, z } = SPOT;
  // The basket: a round woven bamboo basket (its sides in two shades, the weave's darker strips, a rim of split bamboo).
  bx(x, 0.1, z, 0.44, 0.2, 0.34, 0xdcb874, 'petal');
  bx(x, 0.1, z, 0.34, 0.2, 0.44, 0xd0ac66, 'petal');
  for (const dy of [0.05, 0.13]) bx(x, dy, z, 0.46, 0.025, 0.36, 0xa88050, 'petal');
  bx(x, 0.21, z, 0.48, 0.035, 0.38, 0x9a7038, 'petal');
  bx(x, 0.205, z, 0.38, 0.03, 0.48, 0x9a7038, 'petal');
  // Paper twists of seeds (old newspaper, tied at the neck with red thread), standing up in it.
  const twists: [number, number, number][] = [
    [-0.1, -0.06, 0.2],
    [0.03, -0.09, -0.2],
    [0.12, 0.02, 0.35],
    [-0.04, 0.07, -0.4],
    [0.1, 0.1, 0.1],
  ];
  twists.forEach(([dx, dz, r], i) => {
    bx(x + dx, 0.25, z + dz, 0.075, 0.1, 0.075, i % 2 ? 0xe8e2d0 : 0xddd6c2, 'petal', r);
    bx(x + dx, 0.31, z + dz, 0.04, 0.03, 0.04, 0xd8d0bc, 'petal', r);
    bx(x + dx, 0.295, z + dz, 0.05, 0.012, 0.05, 0xc0302a, 'petal', r);
  });
  // The folded note on top, a little white square.
  bx(x - 0.02, 0.33, z + 0.02, 0.12, 0.012, 0.09, 0xf6f4ec, 'petal', 0.3, 0.12);
  // The banana sucker laid across the basket: its corm with a little earth, the stem, two young leaves.
  bx(x + 0.3, 0.07, z + 0.12, 0.13, 0.12, 0.13, 0x7a5a38, 'petal');
  bx(x + 0.12, 0.2, z + 0.06, 0.42, 0.06, 0.06, 0x8aa04a, 'mapLeaf', 0.25, 0.32);
  bx(x - 0.12, 0.33, z, 0.24, 0.025, 0.11, 0x5a9a3a, 'mapLeaf', 0.6, 0.4);
  bx(x - 0.1, 0.36, z + 0.09, 0.22, 0.025, 0.1, 0x6aa840, 'mapLeaf', -0.3, 0.3);
  // The papaya seedling in its black bag beside the basket (east of it, nearer the door).
  const px = x - 0.42;
  const pz = z + 0.06;
  bx(px, 0.1, pz, 0.18, 0.2, 0.18, 0x1c1c1f, 'petal');
  bx(px, 0.205, pz, 0.15, 0.02, 0.15, 0x4a3424, 'petal');
  bx(px, 0.33, pz, 0.03, 0.26, 0.03, 0x9aa070, 'mapLeaf');
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6;
    bx(px + Math.sin(a) * 0.08, 0.46 + (k % 2) * 0.03, pz + Math.cos(a) * 0.08, 0.15, 0.02, 0.15, k % 2 ? 0x6ea83e : 0x7ab448, 'mapLeaf', a, 0.2);
  }
  return b;
}

/** His tools leaning on the wall: the Khmer hoe (a wide iron blade at a sharp angle on a long handle) and the galvanized can. */
function toolsModel(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  // (at the house's scale, as the gift: about the middle between the two)
  const ox = (TOOLS.hoe.x + TOOLS.can.x) / 2;
  const oz = (TOOLS.hoe.z + TOOLS.can.z) / 2;
  const bx = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: number, mat: 'petal' | 'mapBark' | 'mapStone', ry = 0, rx = 0) => {
    const [x, z] = homeToWorld(ox + (lx - ox) * GIFT_SCALE, oz + (lz - oz) * GIFT_SCALE);
    b.box(x, floorY + y * GIFT_SCALE, z, sx * GIFT_SCALE, sy * GIFT_SCALE, sz * GIFT_SCALE, c, mat, { src, ry: ry + HOME_AT.facing, rx });
  };
  // The hoe: its handle leaning back against the wall (the blade on the floor, edge out), the iron at the foot.
  const h = TOOLS.hoe;
  bx(h.x, 0.62, h.z + 0.18, 0.05, 1.25, 0.05, 0xa98455, 'mapBark', 0, -0.28);
  bx(h.x, 0.07, h.z + 0.34, 0.22, 0.1, 0.06, 0x4f4c48, 'mapStone', 0, 0.9);
  bx(h.x, 0.03, h.z + 0.4, 0.22, 0.03, 0.05, 0xc4c0b6, 'mapStone', 0, 0.9);
  bx(h.x, 0.13, h.z + 0.29, 0.07, 0.07, 0.07, 0x5a5650, 'mapStone');
  // The can: an oval galvanized body, its handle over the top, the long spout and rose, set on the floor by the wall.
  const c = TOOLS.can;
  bx(c.x, 0.13, c.z, 0.22, 0.26, 0.17, 0xaab0b3, 'mapStone', 0.15);
  bx(c.x, 0.13, c.z, 0.18, 0.26, 0.2, 0xa0a7ab, 'mapStone', 0.15);
  bx(c.x, 0.27, c.z, 0.2, 0.03, 0.16, 0xb6bbbe, 'mapStone', 0.15);
  bx(c.x - 0.02, 0.33, c.z, 0.2, 0.03, 0.03, 0x80888d, 'mapStone', 0.15);
  bx(c.x + 0.22, 0.24, c.z + 0.03, 0.26, 0.03, 0.03, 0xa0a7ab, 'mapStone', 0.15, 0);
  bx(c.x + 0.36, 0.34, c.z + 0.05, 0.05, 0.07, 0.07, 0xb6bbbe, 'mapStone', 0.15);
  return b;
}

/** The basket in his right fist as he takes it up (character space, body units: the `propR` joint's rest place is the fist). */
function heldBasket(): VoxelBuilder {
  const b = new VoxelBuilder();
  const M = 1 / BODY_UNIT_M;
  const F = { x: -5.65, y: 10.6, z: 0 };
  const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, mat: 'hat' | 'shirt' | 'leather' | 'wood') =>
    b.box(F.x + x * M, F.y + y * M, F.z + z * M, sx * M, sy * M, sz * M, c, mat);
  // (held by its rim, hanging under his fist: its weave, the rim, the paper twists and the sucker's leaves over it)
  put(0, -0.16, 0.12, 0.44, 0.2, 0.34, 0xdcb874, 'hat');
  put(0, -0.16, 0.12, 0.34, 0.2, 0.44, 0xd0ac66, 'hat');
  put(0, -0.05, 0.12, 0.48, 0.035, 0.38, 0x9a7038, 'wood');
  for (const [dx, dz] of [[-0.1, 0.06], [0.04, 0.03], [0.12, 0.16], [-0.04, 0.2]] as const) put(dx, -0.0, 0.12 + dz - 0.1, 0.075, 0.1, 0.075, 0xe8e2d0, 'shirt');
  put(0.1, 0.04, 0.1, 0.24, 0.025, 0.11, 0x5a9a3a, 'leather');
  put(-0.12, 0.05, 0.16, 0.22, 0.025, 0.1, 0x6aa840, 'leather');
  return b;
}

function build(e: AddonEnv): void {
  floorY = homeFloor(e.world.field).floor;
  const mk = (v: VoxelBuilder, name: string) => {
    const g = buildVoxelMesh(v, { quality: 'medium', name });
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.noWalk = true;
    });
    e.scene.add(g);
    return g;
  };
  basket = mk(basketModel(), 'roam:gardenGift');
  tools = mk(toolsModel(), 'roam:gardenTools');
  show();
}

/** She has gone home: the house his, and she is not about (walking off down the trail after giving him the key). */
const granGone = (): boolean => HOME.owned && !HOME.gran.shown;

/** The basket while it waits for him (the house his, she gone, not taken); the tools once the house is his. */
function show(): void {
  if (basket) basket.visible = granGone() && !GARDEN.gift && !(take && take.gone);
  if (tools) tools.visible = HOME.owned;
}

const [SPOT_X, SPOT_Z] = homeToWorld(SPOT.x, SPOT.z);

/** He stands on the veranda (on its floor) within reach of it. */
function near(ctx: RoamCtx): boolean {
  const p = ctx.body.pos;
  // (out on the veranda: in front of the front wall, not in the room behind it; the house faces −z, so local z is HOME_AT.z − z)
  return Math.abs(p.y - floorY) < 0.3 && HOME_AT.z - p.z > HOME_Z.wall + 0.1 && Math.hypot(p.x - SPOT_X, p.z - SPOT_Z) < REACH;
}

/** He takes it: the seeds his, the note read out, the basket gone. */
function taken(): void {
  for (const [k, n] of GIFT) GARDEN.addSeeds(k, n);
  GARDEN.takeGift();
  SFX.play('sellBasket', 0.7);
  const [e, c, p] = [GIFT[0][1], GIFT[1][1], GIFT[2][1]];
  // (in the garden's line of toasts, one after the other: her note, then what he got)
  gardenSay(t('gardenGiftNote1'));
  gardenSay(t('gardenGiftNote2'));
  gardenSay(t('gardenGiftGot', { e: num(e), c: num(c), p: num(p) }));
}

function start(ctx: RoamCtx): void {
  const to = Math.atan2(SPOT_X - ctx.body.pos.x, SPOT_Z - ctx.body.pos.z);
  take = { t: 0, from: ctx.body.yaw, by: angleDiff(to, ctx.body.yaw), gone: false };
  ctx.body.vel.set(0, 0, 0);
  const ex = ctx.body.explorer;
  if (ex.currentAction) ex.stop();
  ex.play('interact');
  ctx.hud.prompt(null);
}

registerAddon({
  id: 'gardenGift',
  order: 44,
  init(e) {
    env = e;
    build(e);
  },
  get holding() {
    return take !== null;
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || !env || env.busy() || take || !granGone() || GARDEN.gift || !near(ctx)) return null;
    return (prompt ||= `E  ${t('gardenGiftPrompt')}`);
  },
  use(ctx, mode) {
    if (mode !== 'walk' || !granGone() || GARDEN.gift) return;
    start(ctx);
  },
  hold(ctx, dt) {
    const { body } = ctx;
    // (the camera looks at him crouched over it: lower than his chest, so the basket at his feet is in the picture)
    ctx.cam.focus.set(body.pos.x, body.pos.y + CHEST * 0.62 * body.scale, body.pos.z);
    body.vel.set(0, 0, 0);
    body.grounded = true;
    body.explorer.setMotion(0, true, 0);
    const k = take!;
    k.t += dt;
    // (the camera comes round low to the side: see TAKE_CAM)
    const cam = ctx.cam;
    camBefore ??= { pitch: cam.pitch, distance: cam.distance };
    const e = env?.shot ? 1 : 1 - Math.exp(-TAKE_CAM.rate * dt);
    cam.yaw += angleDiff(TAKE_CAM.yaw, cam.yaw) * e;
    cam.behindYaw = TAKE_CAM.yaw;
    cam.pitch += (TAKE_CAM.pitch - cam.pitch) * e;
    cam.distance += (TAKE_CAM.distance - cam.distance) * e;
    const u = Math.min(1, k.t / 0.45);
    body.yaw = k.from + k.by * u * u * (3 - 2 * u);
    if (!k.gone && k.t >= GONE) {
      k.gone = true;
      taken();
      show();
      body.explorer.rig.setSlot('gardenGift', 'propR', heldBasket());
    }
    if (k.t >= END) {
      body.explorer.rig.clearSlot('gardenGift');
      take = null;
    }
    return { prompt: null };
  },
  frame(f: MapFrame) {
    clock = f.t;
    show();
  },
  after(ctx, mode, dt) {
    // (the camera back to the player's after the take)
    if (!take && camBefore && mode === 'walk') {
      const cam = ctx.cam;
      const e = 1 - Math.exp(-TAKE_CAM.back * dt);
      cam.pitch += (camBefore.pitch - cam.pitch) * e;
      cam.distance += (camBefore.distance - cam.distance) * e;
      if (Math.abs(camBefore.pitch - cam.pitch) < 0.005 && Math.abs(camBefore.distance - cam.distance) < 0.05) camBefore = null;
    }
    // The hint: the first time this visit he comes home with the gift still there.
    if (hinted || mode !== 'walk' || !granGone() || GARDEN.gift || !env || env.shot) return;
    const p = ctx.body.pos;
    if (Math.hypot(p.x - HOME_AT.x, p.z - HOME_AT.z) > HINT_NEAR) {
      nearSince = -1;
      return;
    }
    if (nearSince < 0) nearSince = clock;
    if (clock - nearSince < HINT_AFTER || env.busy()) return;
    hinted = true;
    gardenSay(t('gardenGiftHint'));
  },
  setMode(next) {
    curMode = next;
    if (next !== 'walk') camBefore = null;
    if (next !== 'walk' && take) {
      env?.explorer.rig.clearSlot('gardenGift');
      take = null;
    }
  },
  fromUrl(q, ctx) {
    const v = q.get('gardengift');
    if (!v || !env) return;
    if (v === 'taken') {
      GARDEN.takeGift();
      show();
      return;
    }
    if (!HOME.owned) console.warn('[map] gardenGift: the house is not his (add home=1)');
    // (on the veranda before it, turned to it)
    const [x, z] = homeToWorld(STAND.x, STAND.z);
    ctx.body.pos.set(x, floorY, z);
    ctx.body.yaw = Math.atan2(SPOT_X - x, SPOT_Z - z);
    ctx.body.vel.set(0, 0, 0);
    ctx.body.grounded = true;
    if (!q.has('rcam')) {
      // (behind his right shoulder, from over the stair's head: the basket and the door before him)
      ctx.cam.yaw = ctx.body.yaw + 0.75;
      ctx.cam.behindYaw = ctx.cam.yaw;
      ctx.cam.pitch = 0.42;
      ctx.cam.distance = 4.2;
    }
    hinted = true;
    if (v === 'take' && granGone() && !GARDEN.gift) start(ctx);
    console.info(`[map] gardenGift: on the veranda, the gift ${GARDEN.gift ? 'taken' : 'there'} (${curMode})`);
  },
  report() {
    return GARDEN.gift ? { gardengift: 'taken' } : null;
  },
});

