import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { AngkorExplorer } from '../character/AngkorExplorer';
import { defaultGardenSpot, gardenBody, gardenPose, GARDEN_REACH, type GardenBody } from '../character/gardenWork';
import { ACTIONS, type GardenAction } from '../map/garden/actions';
import { KINDS, type PlantKindId } from '../map/garden/kinds';
import {
  GardenHands,
  basketBuilder,
  canBuilder,
  cuttingBuilder,
  fruitBuilder,
  hoeBuilder,
  knifeBuilder,
  poleHeadBuilder,
  poleShaftBuilder,
  pupBuilder,
  seedBuilder,
  seedlingBuilder,
  stickBuilder,
  tornBagBuilder,
} from '../map/roam/_gardenProps';
import { BODY_UNIT_M } from '../world/scale';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import type { VoxelBuilder } from '../voxel/VoxelBuilder';

/**
 * The garden's work in the character viewer (character/gardenWork.ts, the props
 * map/roam/_gardenProps.ts): `garden=<action>` poses him frozen `gt=` s into it
 * (`kind=<plant>`, `spot=x,y,z` in body units, his space; default: the action's
 * own, `GARDEN_SPOT`), `sheet=<n>` puts n of him in a row across the action's
 * length (a contact sheet; `from=`, `to=` a part of it), `mark=1` a red block at
 * the spot, `loop=1` (not in shots) plays it over and over.
 *
 *   viewer.html?garden=plant&sheet=8&view=60&shot=1
 *   viewer.html?garden=water&gt=1.2&kind=papaya&view=90&zoom=torso&shot=1
 */
export interface ViewerGarden {
  action: GardenAction;
  kind: PlantKindId | null;
  spot: Vector3;
  gt: number;
  sheet: number;
  from: number;
  to: number;
  loop: boolean;
  mark: boolean;
  /** The plant's seed (`seed=`: its variety), or null. */
  seed: number | null;
  bodies: GardenBody[];
  hands: GardenHands[];
}

const isAction = (s: string | null): s is GardenAction => !!s && s in ACTIONS;
/** What each action shows without `kind=`. */
const DEFAULT_KIND: Record<GardenAction, PlantKindId | null> = {
  plant: 'corn',
  plantTree: 'mango',
  water: null,
  fill: null,
  pickLow: 'eggplant',
  pickReach: 'guava',
  pickCut: 'sugarcane',
  pickPole: 'mango',
  pickGround: 'durian',
  clear: 'corn',
};

export function gardenFromParams(params: URLSearchParams, shot: boolean): ViewerGarden | null {
  const a = params.get('garden');
  if (!isAction(a)) return null;
  const k = params.get('kind');
  const spot = params.get('spot')?.split(',').map(Number);
  const len = ACTIONS[a].len;
  return {
    action: a,
    kind: k && k in KINDS ? (k as PlantKindId) : DEFAULT_KIND[a],
    spot: spot && spot.length === 3 && spot.every(Number.isFinite) ? new Vector3(spot[0], spot[1], spot[2]) : defaultGardenSpot(a).clone(),
    gt: Number(params.get('gt') ?? len * 0.5),
    sheet: Math.max(0, Math.min(12, Number(params.get('sheet') ?? 0))),
    from: Number(params.get('from') ?? 0),
    to: Number(params.get('to') ?? len),
    loop: !shot && params.get('loop') === '1',
    mark: params.get('mark') === '1',
    seed: params.has('seed') ? Number(params.get('seed')) : null,
    bodies: [],
    hands: [],
  };
}

/** The time of the i-th of `count` (a sheet: evenly from `from` to `to`). */
export function gardenTime(g: ViewerGarden, i: number, count: number): number {
  if (!g.sheet || count <= 1) return g.gt;
  return g.from + ((g.to - g.from) * i) / (count - 1);
}

/** Pose explorer `i` of `count` at his time, his props in his hands. */
export function applyGarden(e: AngkorExplorer, g: ViewerGarden, i: number, count: number): void {
  const w = gardenBody(g.action);
  w.spot.copy(g.spot);
  w.kind = g.kind;
  w.t = gardenTime(g, i, count);
  g.bodies[i] = w;
  e.animator.postureFeet = false;
  e.animator.posture = (t) => {
    w.life = t;
    return gardenPose(w);
  };
  const h = (g.hands[i] ??= new GardenHands(e));
  h.setSpot(g.spot);
  if (g.mark) {
    const m = new Mesh(new BoxGeometry(0.6, 0.6, 0.6), new MeshBasicMaterial({ color: 0xff2020 }));
    m.position.copy(g.spot);
    e.rig.joints.root.add(m);
  }
}

/** After each explorer's update: the props follow (and the loop plays on). */
export function gardenAfter(g: ViewerGarden, dt: number): void {
  const len = ACTIONS[g.action].len;
  g.bodies.forEach((w, i) => {
    if (g.loop) w.t = (w.t + dt) % (len + 0.6);
    const t = Math.min(w.t, len);
    g.hands[i]?.update(g.action, t, g.kind, g.spot, g.seed);
  });
}

/** Every action swept (every 0.05 s, its default spot, `kind`): the worst shortfall of each hand and when (checks). */
export function gardenReachAll(kind: PlantKindId | null = null, only?: GardenAction, spot?: number[]): string {
  const out: string[] = [];
  for (const a of Object.keys(ACTIONS) as GardenAction[]) {
    if (only && a !== only) continue;
    const w = gardenBody(a);
    w.spot.copy(spot ? new Vector3(spot[0], spot[1], spot[2]) : defaultGardenSpot(a));
    w.kind = kind;
    let worst = { L: 0, R: 0, tl: 0, tr: 0 };
    for (let t = 0; t <= ACTIONS[a].len + 1e-6; t += 0.05) {
      w.t = t;
      gardenPose(w);
      if (GARDEN_REACH.L > worst.L) worst = { ...worst, L: GARDEN_REACH.L, tl: t };
      if (GARDEN_REACH.R > worst.R) worst = { ...worst, R: GARDEN_REACH.R, tr: t };
    }
    out.push(`${a}: L ${worst.L.toFixed(2)}@${worst.tl.toFixed(2)} R ${worst.R.toFixed(2)}@${worst.tr.toFixed(2)}`);
  }
  return out.join('\n');
}

/** One moment's hands: targets, shoulders, shortfalls (checks). */
export function gardenAt(a: GardenAction, t: number, kind: PlantKindId | null = null, spot?: number[]): string {
  const w = gardenBody(a);
  w.spot.copy(spot ? new Vector3(spot[0], spot[1], spot[2]) : defaultGardenSpot(a));
  w.kind = kind;
  w.t = t;
  gardenPose(w);
  const f = (v: Vector3) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
  const r = GARDEN_REACH;
  return (['L', 'R'] as const).map((s) => `${s}: target ${f(r.target[s])} shoulder ${f(r.shoulder[s])} dist ${r.target[s].distanceTo(r.shoulder[s]).toFixed(2)} short ${r[s].toFixed(2)}`).join('\n');
}

/** How far each fist fell short (BU) for the bodies as posed (checks). */
export function gardenReach(g: ViewerGarden): string {
  return g.bodies
    .map((w) => {
      gardenPose(w);
      return `${w.t.toFixed(2)}s L${GARDEN_REACH.L.toFixed(2)} R${GARDEN_REACH.R.toFixed(2)}`;
    })
    .join(' · ');
}

/**
 * Every garden prop in rows on the ground (`gardenprops=1`; body units at his true scale): the tools, what he
 * plants, the harvest of each kind. Returns the group (centred on the origin).
 */
export function gardenPropsLineup(only = -1): Group {
  const g = new Group();
  const rows: [string, VoxelBuilder, number?][][] = [
    [
      ['hoe', hoeBuilder(), -Math.PI / 2],
      ['can', canBuilder()],
      ['knife', knifeBuilder(), -Math.PI / 2],
      ['basket', basketBuilder()],
      ['poleHead', poleHeadBuilder(), -Math.PI / 2],
    ],
    [
      ['seed', seedBuilder('corn')],
      ['cutting', cuttingBuilder()],
      ['pup', pupBuilder()],
      ['bag', seedlingBuilder('mango', true)],
      ['ball', seedlingBuilder('mango', false)],
      ['palmBag', seedlingBuilder('coconut', true)],
      ['torn', tornBagBuilder()],
      ['stickCrop', stickBuilder(false)],
      ['stickTree', stickBuilder(true)],
    ],
    (['eggplant', 'corn', 'pumpkin', 'papaya', 'guava', 'mango', 'jackfruit', 'durian', 'coconut', 'sugarPalm'] as const).map((k) => [k, fruitBuilder(k)] as [string, VoxelBuilder]),
    [
      ['sugarcane', fruitBuilder('sugarcane'), -Math.PI / 2],
      ['banana', fruitBuilder('banana'), Math.PI / 2],
    ],
  ];
  void poleShaftBuilder;
  rows.forEach((row, r) => {
    if (only >= 0 && r !== only) return;
    let x = 0;
    const items = row.map(([name, b, rx]) => {
      const m = buildVoxelMesh(b, { name: `lineup:${name}` });
      const o = new Group();
      o.add(m);
      if (rx) o.rotation.x = rx;
      o.updateMatrixWorld(true);
      return o;
    });
    const widths = items.map(() => 11);
    const total = widths.reduce((a, b) => a + b, 0);
    items.forEach((o, i) => {
      o.position.set((x - total / 2 + widths[i] / 2) * BODY_UNIT_M, 0.12, only >= 0 ? 0 : (r - 1.5) * 19 * BODY_UNIT_M);
      o.scale.setScalar(BODY_UNIT_M);
      x += widths[i];
      g.add(o);
    });
  });
  return g;
}
