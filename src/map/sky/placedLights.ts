import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferAttribute, type Camera, type Scene } from 'three';
import { pixelSize } from '../graphics';
import { glowMaterial, haloPoints, type Halo } from '../road/glow';
import { addLamp, inSlot, type Lamp } from './lampSlots';

/**
 * Lights he puts up himself: the lamp posts and the spirit house's candle he builds at home (build/view.ts), and
 * whatever placeable piece comes next with a flame or a bulb (a lantern on a table, a string of lights). There can
 * be many (twenty lamp posts round his house), and none may cost a shader program or a light of its own.
 *
 * - **Every one glows**: two glowing blocks round its flame, square and turned 45° (an octagon), in the village's
 *   lamp material (road/glow.ts `glowMaterial('lamp')`: its program is the village's), dim by day, above 1.0 at night
 *   so it blooms; and a soft halo (road/glow.ts `haloPoints`: points sized by the scene's height, as every lamp's
 *   halo on the map). One draw for all the glows, one for all the halos.
 * - **The nearest few give real light**: each is a lamp of the map's few light slots (sky/lampSlots.ts `addLamp`,
 *   `placed`): at most `PLACED_SLOTS` (3) of them are put into slots — those whose light covers most of the view,
 *   the nearest in sight — easing in and out (0.45 s) as he walks among them; the world's lamps keep the other slots.
 * - **A fixed pool** (`MAX`): nothing is made when one comes or goes, no shader is compiled after Start (the lamp
 *   lights are made the first time a pool place is used; they cost nothing while dark).
 *
 * **The API** (`placedLights()`: one for the map; build/view.ts adds its `object` to roaming's group and calls
 * `frame` every frame):
 * ```ts
 * const light = placedLights().add({ x, y, z, color: 0xffb45a, glow: { w: 0.2, h: 0.235 }, halo: 1.7, candela: 9, reach: 14 });
 * light.move(x, y, z);   // it moved (a lantern carried to another table)
 * light.remove();        // taken down
 * ```
 * `x, y, z` the flame's middle (world m); `color` the glow's and the light's; `glow` the glowing block's size (m: a
 * little bigger than the model's own glass or flame, drawn over it); `halo` its halo across (m); `candela` how bright
 * its real light is at full night (0: it only glows); `reach` how far that light reaches at most (m); `yaw` turns the
 * octagon with the piece, `seed` its flicker's phase. Null when the pool is full (`MAX`).
 */

/** Placed lights at most (each two glowing blocks and a halo). */
const MAX = 64;
/** The real lights come on as it gets dark: from this much night (the glow's 0‥1, eased), fully this much later. */
const DUSK = { from: 0.05, over: 0.15 };
/** The real light's flicker (a kerosene flame: gentle). */
const FLICKER = { slow: 11.3, fast: 23.9, a: 0.05, b: 0.03 };

export interface PlacedLightSpec {
  x: number;
  y: number;
  z: number;
  /** The glow's and the light's colour. */
  color: number;
  /** The glowing block (m: across, high). */
  glow: { readonly w: number; readonly h: number };
  /** The halo across (m). */
  halo: number;
  /** Real light at full night (cd; 0 or none: it only glows). */
  candela?: number;
  /** How far its real light reaches at most (m). */
  reach?: number;
  /** The octagon's turn (rad). */
  yaw?: number;
  /** Its flicker's phase (0‥1). */
  seed?: number;
}

export interface PlacedLight {
  /** It moved (world m: the flame's middle). */
  move(x: number, y: number, z: number): void;
  /** It is gone. */
  remove(): void;
}

export interface PlacedLights {
  /** The glows and halos (in the scene before the shaders are made: build/view.ts puts it in roaming's group). */
  readonly object: Group;
  /** A light (null: the pool is full). */
  add(spec: PlacedLightSpec): PlacedLight | null;
  /** Every frame (before the lamp slots pick: an add-on's frame): the camera, seconds, how dark it is (0 day ‥ 1 night). */
  frame(camera: Camera, t: number, night: number): void;
  /** Checks: how many there are, how many of them hold one of the map's few lights now (sky/lampSlots.ts; dev: `window.__placedLights`). */
  stats(): { lights: number; lit: number; max: number };
}

interface Entry {
  spec: PlacedLightSpec;
  handle: PlacedLight;
  /** Its real light (kept with it while it stands, so a slot's light never jumps to another when one goes). */
  lamp: Lamp | null;
  /** Its flicker's phase. */
  readonly phase: number;
}

let api: PlacedLights | null = null;

/** The map's placed lights (made once). */
export function placedLights(): PlacedLights {
  if (api) return api;
  const object = new Group();
  object.name = 'placed lights';
  const list: Entry[] = [];
  /** The real lights made so far (at most `MAX`: the slots keep every lamp), and those no light holds now. */
  const lamps: Lamp[] = [];
  const spare: Lamp[] = [];
  let dirty = true;

  const { material: glowMat, uniforms: glowU } = glowMaterial('lamp');
  glowMat.name = 'placed:glow';
  const glowGeo = new BoxGeometry(1, 1, 1);
  const glows = new InstancedMesh(glowGeo, glowMat, MAX * 2);
  glows.name = 'placed:glows';
  glows.castShadow = glows.receiveShadow = false;
  glows.frustumCulled = false;
  const glowA = new Float32Array(MAX * 4);
  glowGeo.setAttribute('aGlow', new InstancedBufferAttribute(glowA, 2));
  glows.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 6), 3);
  const _m = new Matrix4();
  // (one tiny block far under the land while there is none: its program is compiled with the map's)
  glows.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
  glows.count = 1;
  object.add(glows);
  const haloList: Halo[] = Array.from({ length: MAX }, (_, i) => ({ x: 0, y: -500, z: 0, size: 0, kind: 0 as const, phase: i * 1.3 }));
  const halo = haloPoints(haloList);
  halo.points.name = 'placed:halos';
  halo.uniforms.uColor.value.setRGB(1, 0.66, 0.32);
  halo.points.frustumCulled = false;
  object.add(halo.points);
  const haloPos = halo.points.geometry.getAttribute('position') as BufferAttribute;
  const haloSize = halo.points.geometry.getAttribute('aSize') as BufferAttribute;
  // (none yet: neither is drawn; hidden, their programs are still compiled with the map's before Start: three's
  // compile walks hidden objects too, lazy.ts `compileFor`)
  glows.visible = halo.points.visible = false;

  const _q = new Quaternion();
  const _p = new Vector3();
  const _s = new Vector3();
  const _c = new Color();
  const UP = new Vector3(0, 1, 0);

  /** The glows and halos from the list (after a change). */
  function sync(): void {
    dirty = false;
    const n = list.length;
    list.forEach(({ spec: L }, i) => {
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        _q.setFromAxisAngle(UP, (L.yaw ?? 0) + (k * Math.PI) / 4);
        glows.setMatrixAt(j, _m.compose(_p.set(L.x, L.y, L.z), _q, _s.set(L.glow.w, L.glow.h, L.glow.w)));
        glows.setColorAt(j, _c.setHex(L.color));
        glowA[j * 2] = (L.seed ?? 0) * 20;
        glowA[j * 2 + 1] = L.glow.w;
      }
      haloPos.setXYZ(i, L.x, L.y, L.z);
      haloSize.setX(i, L.halo);
    });
    for (let i = n; i < MAX; i++) {
      haloPos.setXYZ(i, 0, -500, 0);
      haloSize.setX(i, 0);
    }
    glows.count = Math.max(1, n * 2);
    if (!n) glows.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    halo.points.geometry.setDrawRange(0, n);
    glows.visible = halo.points.visible = n > 0;
    glows.instanceMatrix.needsUpdate = true;
    if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
    (glowGeo.getAttribute('aGlow') as BufferAttribute).needsUpdate = true;
    haloPos.needsUpdate = true;
    haloSize.needsUpdate = true;
  }

  /** Shown: its group and every parent visible, in a scene. */
  function shown(): boolean {
    for (let o: typeof object | null = object; o; o = o.parent as Group | null) {
      if (!o.visible) return false;
      if (!o.parent) return (o as unknown as Scene).isScene === true;
    }
    return false;
  }

  api = {
    object,
    add(spec) {
      if (list.length >= MAX) {
        console.warn(`[lights] no more than ${MAX} placed lights: this one only stands`);
        return null;
      }
      let lamp: Lamp | null = null;
      if ((spec.candela ?? 0) > 0) {
        // (the one put out longest ago first)
        lamp = spare.shift() ?? addLamp({ kind: 'point', name: `placed light ${lamps.length + 1}`, placed: true });
        if (!lamps.includes(lamp)) lamps.push(lamp);
      }
      const e: Entry = {
        spec: { ...spec, glow: { ...spec.glow } },
        lamp,
        phase: (spec.seed ?? 0) * 40 + lamps.length * 1.7,
        handle: {
          move(x, y, z) {
            e.spec.x = x;
            e.spec.y = y;
            e.spec.z = z;
            dirty = true;
          },
          remove() {
            const i = list.indexOf(e);
            if (i < 0) return;
            list.splice(i, 1);
            if (e.lamp) {
              // (dark at once: the slot holding it lets it go, its light gone)
              e.lamp.intensity = 0;
              spare.push(e.lamp);
              e.lamp = null;
            }
            dirty = true;
          },
        },
      };
      list.push(e);
      dirty = true;
      return e.handle;
    },
    frame(camera, t, night) {
      if (dirty) sync();
      // Dim by day (the dark lamp), bright at night, as the village's.
      const n = Math.min(1, Math.max(0, night));
      const k = n * n * (3 - 2 * n);
      glowU.uTime.value = t;
      glowU.uLevel.value = 0.07 + k * 3.1;
      glowU.uPulse.value = 0.03 + k * 0.05;
      glowU.uNearLevel.value = 1 - k * 0.5;
      const u = halo.uniforms;
      u.uTime.value = t;
      u.uScale.value = 1 / pixelSize(camera);
      u.uLamp.value = k * k * 1.1;
      // The real lights: each placed light's lamp (the slots pick the nearest few), from dusk on (by day a lamp that
      // gave next to no light would still hold a slot and shade every pixel in its reach).
      const dusk = Math.min(1, Math.max(0, (k - DUSK.from) / DUSK.over));
      const on = list.length > 0 && dusk > 0 && shown();
      for (const { spec: L, lamp: l, phase: ph } of list) {
        if (!l) continue;
        if (!on) {
          l.intensity = 0;
          continue;
        }
        const cd = L.candela ?? 0;
        const flick = 1 - FLICKER.a - FLICKER.b + FLICKER.a * Math.sin(t * FLICKER.slow + ph) + FLICKER.b * Math.sin(t * FLICKER.fast + ph * 2.3);
        l.position.set(L.x, L.y, L.z);
        l.color.setHex(L.color);
        l.distance = L.reach ?? 0;
        l.intensity = cd * k * dusk * flick;
      }
    },
    stats: () => ({ lights: list.length, lit: lamps.filter((l) => inSlot(l) > 0).length, max: MAX }),
  };
  if (import.meta.env.DEV) Object.assign(window, { __placedLights: api });
  return api;
}
