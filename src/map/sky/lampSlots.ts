import { Color, Frustum, Group, Matrix4, PointLight, Sphere, SpotLight, Vector3, type Object3D, type Scene } from 'three';
import type { MapFrame } from '../types';

/**
 * The map's lamp lights, in a few fixed slots.
 *
 * Every lit material's shader is made for the number of point and spot lights in the scene, and three makes every
 * shader again when that number changes (a freeze on this map). The map's lamps — the temples' lamps, the
 * sanctuary's door, the explorer's lantern, torch and flashlight, the phone's light on his face, the Look page's
 * fill, the boat's lantern — were lights of their own, all in the scene all the time: every lit shader carried
 * seven lights' shading, written out once per light, and every lit pixel went through them all, wherever they were
 * (on a phone, an eighth of a picture's time; each light the shader carries costs even while dark).
 *
 * Now each is a `Lamp`: where it is, its colour, how bright, how far it reaches (a spot: where it points, its cone).
 * This module keeps a few real lights (`SLOTS`), always in the scene — the count never changes, so no shader is made
 * again — and every frame puts into them the lamps that matter most for the picture: the explorer's own first (his
 * light in hand, the phone's, the Look page's fill), then the others by how much of the view their light falls on
 * (how far it reaches against how far it is from the camera); none whose light cannot reach the view. A lamp eases
 * in as it gets a slot and out as it loses one (`FADE`), so nothing pops; the shot's last step (`dt` 0) puts them
 * at once. A slot with no lamp is dark (and skipped per pixel: darkLights.ts).
 *
 * The spot slot holds the flashlight or the Look page's fill; while neither is out it holds a point lamp as a spot
 * whose cone is the whole sphere but a sliver straight up (`ROUND_EDGE`): the same light as a point light's (three
 * shades a spot as a point light with its cone's falloff on top), so the night overview has its four temples' lamps
 * and the ledge explorer's lantern from four point lights.
 *
 * A lamp with an `anchor` is where the anchor is, and lit only while the anchor and all its parents are shown and
 * in the scene (as a light of its own was: the boat's lantern goes with the boat it is on, a hidden part's lamps
 * go out).
 *
 * URL (checks): `lampslots=<points>,<spots>` this many slots (the shaders are made for them).
 */

export type LampKind = 'point' | 'spot';

export interface LampOptions {
  kind: LampKind;
  /** For the console (`window.__lampSlots.debug()` on the dev server). */
  name: string;
  color?: number;
  intensity?: number;
  /** How far it reaches (m; 0: no end). */
  distance?: number;
  decay?: number;
  /** A spot's cone (radians from its axis) and its soft edge (0‥1). */
  angle?: number;
  penumbra?: number;
  /** The explorer's own (his light in hand, the phone's, the Look page's fill): a slot before every other lamp. */
  own?: boolean;
  /** Where the lamp is: this object (in the scene graph, so it moves and hides with its parents). */
  anchor?: Object3D | null;
}

/** A lamp the map wants lit. Set its fields as a light's (every frame if they change); the slots read them after the parts' updates. */
export class Lamp {
  /** Where it is (world m), when it has no anchor. */
  readonly position = new Vector3();
  readonly color: Color;
  intensity: number;
  distance: number;
  decay: number;
  /** A spot: what it points at (world m), its cone and soft edge. */
  readonly target = new Vector3();
  angle: number;
  penumbra: number;
  readonly kind: LampKind;
  readonly name: string;
  readonly own: boolean;
  readonly anchor: Object3D | null;
  /** Where it was this frame (world m: the anchor's), and how much it matters to the picture (the slots'). */
  readonly world = new Vector3();
  score = 0;

  constructor(o: LampOptions) {
    this.kind = o.kind;
    this.name = o.name;
    this.color = new Color(o.color ?? 0xffffff);
    this.intensity = o.intensity ?? 0;
    this.distance = o.distance ?? 0;
    this.decay = o.decay ?? 2;
    this.angle = o.angle ?? Math.PI / 3;
    this.penumbra = o.penumbra ?? 0;
    this.own = o.own ?? false;
    this.anchor = o.anchor ?? null;
  }

  /** Giving light now: bright, not black, and its anchor shown in the scene. */
  get lit(): boolean {
    if (!(this.intensity > 0) || (this.color.r <= 0 && this.color.g <= 0 && this.color.b <= 0)) return false;
    for (let o = this.anchor; o; o = o.parent) {
      if (!o.visible) return false;
      if (!o.parent) return (o as Scene).isScene === true;
    }
    return true;
  }

  /** Where it is now (world m), into `world` too. */
  locate(): Vector3 {
    if (!this.anchor) return this.world.copy(this.position);
    this.anchor.updateWorldMatrix(true, false);
    return this.world.setFromMatrixPosition(this.anchor.matrixWorld);
  }
}

const LAMPS: Lamp[] = [];

/** A lamp for the slots (it stays in their list: the map's lamps live as long as the page). */
export function addLamp(o: LampOptions): Lamp {
  const l = new Lamp(o);
  LAMPS.push(l);
  return l;
}

/** Every lamp (the snow's flakes catch the lit ones near the camera: sky/snow.ts). */
export function lamps(): readonly Lamp[] {
  return LAMPS;
}

/**
 * Slots: point lights, spot lights (the shaders are made for these; each costs a little even while dark). A walk
 * wants one to three lamps; the night overview six (the four temples', the ledge explorer's lantern, the boat's at
 * the landing): five fit, and the boat's, which matters least there, goes (its halo stays; `lampslots=5,1` keeps it).
 */
const SLOTS = { point: 4, spot: 1 };
/** Seconds a lamp takes to ease in or out of a slot; out, for the explorer's own light or a spot waiting for one. */
const FADE = 0.45;
const FADE_FAST = 0.12;
/** How much more a lamp not in a slot must matter than one in it to take its slot (no flicker between two alike). */
const HOLD = 1.3;
/**
 * Light (lux-like) a lamp must give a surface to show at night: how far it reaches is where its light falls under
 * this (or its `distance`, if nearer). A temple's lamp (900 cd) reaches about 40 m, the lantern (8 cd) 4.
 */
const SEEN = 0.5;
/** A point lamp in a spot slot: the cone's soft edge (its cone is all round; dark only within ~0.5° of straight up). */
const ROUND_EDGE = 0.003;

/** A slot: its light, the lamp it holds and how far that has eased in. */
interface Slot {
  readonly light: PointLight | SpotLight;
  readonly spot: boolean;
  lamp: Lamp | null;
  /** 0‥1. */
  fade: number;
}

export interface LampSlots {
  /** The slots' lights (in the scene before the shaders are made: main.ts). */
  readonly object: Group;
  /** After the parts' updates, the camera placed: the lamps that matter most into the slots. */
  update(f: MapFrame): void;
  /** What each slot holds (checks: `window.__lampSlots` on the dev server). */
  debug(): Record<string, string>;
}

let api: LampSlots | null = null;

const _m = new Matrix4();
const _frustum = new Frustum();
const _sphere = new Sphere();
const _lamps: Lamp[] = [];
const _wanted: Lamp[] = [];

/** How much of the view a lamp's light falls on: 1 with the camera inside its reach, less the farther it is; 0 if none reaches the view. */
function scoreOf(l: Lamp, cam: Vector3): number {
  const p = l.locate();
  const end = l.distance > 0 ? l.distance : Infinity;
  const reach = Math.min(end, Math.sqrt(l.intensity / SEEN));
  if (!_frustum.intersectsSphere(_sphere.set(p, Math.min(end, reach * 2)))) return 0;
  // (the explorer's own: first, the brightest first)
  if (l.own) return 1e6 + l.intensity;
  const k = reach / Math.max(p.distanceTo(cam), reach);
  return k * k;
}

/** The lamps that matter most into the slots (a spot lamp needs a spot slot; a point lamp takes a point slot, else a free spot slot), easing in and out. */
function place(slots: readonly Slot[], cam: Vector3, dt: number): void {
  const held = (l: Lamp) => slots.some((s) => s.lamp === l);
  _lamps.length = 0;
  for (const l of LAMPS) {
    if (!l.lit) continue;
    l.score = scoreOf(l, cam);
    if (l.score <= 0) continue;
    if (held(l)) l.score *= HOLD;
    _lamps.push(l);
  }
  _lamps.sort((a, b) => b.score - a.score);
  // (as many as there are slots for, the most wanted first)
  let points = 0;
  let spots = 0;
  for (const s of slots) s.spot ? spots++ : points++;
  _wanted.length = 0;
  for (const l of _lamps) {
    if (l.kind === 'spot' ? spots > 0 : points + spots > 0) _wanted.push(l);
    else continue;
    if (l.kind === 'spot' || points === 0) spots--;
    else points--;
  }
  // (a lamp of the explorer's or a spot with no slot yet: the slot it takes empties fast; a spot takes its slot from a point lamp)
  const spotWaits = _wanted.some((l) => l.kind === 'spot' && !held(l));
  const hurry = spotWaits || _wanted.some((l) => l.own && !held(l));
  const now = dt <= 0;
  for (const s of slots) {
    const l = s.lamp;
    if (l && _wanted.includes(l) && !(spotWaits && s.spot && l.kind === 'point')) {
      s.fade = now || l.own ? 1 : Math.min(1, s.fade + dt / FADE);
      continue;
    }
    // (a lamp no longer wanted eases out; one gone dark or hidden leaves at once: its light is gone anyway)
    if (l && l.lit && !now) s.fade = Math.max(0, s.fade - dt / (hurry ? FADE_FAST : FADE));
    else s.fade = 0;
    if (s.fade <= 0) s.lamp = null;
  }
  // (a point lamp in a spot slot moves to a point slot as soon as one is free: the same light, kept free for a spot)
  for (const s of slots) {
    if (!s.spot || s.lamp?.kind !== 'point') continue;
    const to = slots.find((x) => !x.spot && !x.lamp);
    if (!to) break;
    to.lamp = s.lamp;
    to.fade = s.fade;
    s.lamp = null;
    s.fade = 0;
  }
  for (const l of _wanted) {
    if (held(l)) continue;
    const s = slots.find((x) => !x.lamp && !x.spot && l.kind === 'point') ?? slots.find((x) => !x.lamp && x.spot);
    if (!s) continue;
    s.lamp = l;
    s.fade = now || l.own ? 1 : 0;
  }
  for (const s of slots) light(s);
}

/** A slot's light from its lamp, eased in this far (dark with none). */
function light(s: Slot): void {
  const g = s.light;
  const l = s.lamp;
  if (!l || s.fade <= 0) {
    g.intensity = 0;
    return;
  }
  g.position.copy(l.world);
  g.color.copy(l.color);
  g.intensity = l.intensity * s.fade * s.fade * (3 - 2 * s.fade);
  g.distance = l.distance;
  g.decay = l.decay;
  if (!s.spot) return;
  const sp = g as SpotLight;
  if (l.kind === 'spot') {
    sp.target.position.copy(l.target);
    sp.angle = l.angle;
    sp.penumbra = l.penumbra;
  } else {
    // (a point lamp: aimed down, its cone all round but straight up)
    sp.target.position.copy(l.world).y -= 1;
    sp.angle = Math.PI;
    sp.penumbra = ROUND_EDGE;
  }
}

/** The slots, made once. */
export function lampSlots(): LampSlots {
  if (api) return api;
  const q = new URLSearchParams(location.search).get('lampslots')?.split(',').map(Number);
  const n = (i: number, k: LampKind) => (q && Number.isInteger(q[i]) && q[i] >= 0 && q[i] <= 8 ? q[i] : SLOTS[k]);
  const object = new Group();
  object.name = 'lamp slots';
  const slots: Slot[] = [];
  for (let i = 0; i < n(0, 'point'); i++) {
    const light = new PointLight(0xffffff, 0, 10, 2);
    light.name = `lamp slot ${i + 1}`;
    slots.push({ light, spot: false, lamp: null, fade: 0 });
  }
  for (let i = 0; i < n(1, 'spot'); i++) {
    const light = new SpotLight(0xffffff, 0, 10, 0.5, 0.5, 2);
    light.name = `lamp spot slot ${i + 1}`;
    object.add(light.target);
    slots.push({ light, spot: true, lamp: null, fade: 0 });
  }
  for (const { light } of slots) {
    light.castShadow = false;
    object.add(light);
  }
  api = {
    object,
    update(f) {
      const cam = f.camera;
      _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      place(slots, cam.position, f.dt);
    },
    debug: () =>
      Object.fromEntries(
        slots.map((s) => [
          s.light.name,
          s.lamp ? `${s.lamp.name} at ${s.lamp.world.toArray().map(Math.round).join(',')} ${(s.fade * 100).toFixed(0)}% (score ${s.lamp.score.toFixed(3)})` : '—',
        ]),
      ),
  };
  if (import.meta.env.DEV) Object.assign(window, { __lampSlots: api });
  return api;
}
