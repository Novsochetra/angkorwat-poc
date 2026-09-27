import { Color, Group, type BufferAttribute, type InstancedMesh, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { GlowBlocks, glowMaterial, haloPoints, pointScale, type Halo } from '../road/glow';
import type { MapFrame } from '../types';

/**
 * The village's lights, all glow (no light is added): window panes and door
 * gaps lit from inside, lanterns under the eaves, the shop's tube light,
 * embers in the kitchen stoves, the pagoda's candle-lit door and lamps.
 * Unlit boxes whose colour goes well above 1.0 (linear) at night, so the
 * bloom catches them; by day the panes are the dark rooms behind the
 * windows. Soft halos round the lanterns and lamps at night.
 *
 * Lamps that come on and go off (the market's bulbs, lit only while their
 * stall is open: `switchable`) are panes of the same mesh: `setLit(key,
 * on)` turns a group of them to a dark bulb with no halo, or back.
 */

/** Pane colours (sRGB): oil lamp, candle-lit hall, cool tube light, ember. */
export const GLOW = { window: 0xffa24c, warm: 0xffb866, hall: 0xffae52, tube: 0xdcefff, ember: 0xff5a1c, lantern: 0xffb45a } as const;

/** An unlit bulb. */
const OFF = new Color(0x2a2622);

/** A lamp its owner switches (`VillageLights.switchable`): its pane, its halo (−1: none) and size, its colour. */
interface Switch {
  key: string;
  pane: number;
  halo: number;
  size: number;
  color: number;
}

export class VillageLights {
  /** Panes and lamps that never move. */
  readonly still = new GlowBlocks();
  /** Panes on the floating houses (they bob with them: see `_floating.ts`). */
  readonly floating = new GlowBlocks();
  /** Which floating raft each `floating` pane belongs to. */
  readonly floatingOwner: number[] = [];
  readonly halos: Halo[] = [];
  /** The lamps that come on and go off, by group (`switchable`). */
  readonly switches: Switch[] = [];

  /** A pane on a raft. */
  addFloating(owner: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number, phase = 0): void {
    this.floating.add(x, y, z, sx, sy, sz, ry, color, phase);
    this.floatingOwner.push(owner);
  }

  /** A lantern's (or lamp's) soft halo at night. */
  halo(x: number, y: number, z: number, size: number, phase = 0): void {
    this.halos.push({ x, y, z, size, kind: 0, phase });
  }

  /** A still lamp that comes on and goes off with its group `key` (`build`'s `setLit`); lit until then. */
  switchable(key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number, halo: number, phase = 0): void {
    this.switches.push({ key, pane: this.still.list.length, halo: halo > 0 ? this.halos.length : -1, size: halo, color });
    this.still.add(x, y, z, sx, sy, sz, ry, color, phase);
    if (halo > 0) this.halo(x, y, z, halo, phase);
  }

  /** The meshes (one per list, the halos), their per-frame update, and the switch for a group of `switchable` lamps. */
  build(renderer: WebGLRenderer): { object: Group; floatingMesh: InstancedMesh | null; update(f: MapFrame, camera: PerspectiveCamera): void; setLit(key: string, on: boolean): void } {
    const object = new Group();
    object.name = 'village:lights';
    const { material, uniforms } = glowMaterial('lamp');
    material.name = 'village:glow';
    const still = this.still.mesh(material, 'village:glow');
    object.add(still);
    let floatingMesh: InstancedMesh | null = null;
    if (this.floating.list.length) {
      floatingMesh = this.floating.mesh(material, 'village:glow-floating');
      object.add(floatingMesh);
    }
    const halo = haloPoints(this.halos);
    halo.points.name = 'village:halos';
    halo.uniforms.uColor.value.setRGB(1, 0.66, 0.32);
    object.add(halo.points);
    const sizes = halo.points.geometry.getAttribute('aSize') as BufferAttribute;
    const lit = new Map<string, boolean>();
    const c = new Color();
    const switches = this.switches;
    return {
      object,
      floatingMesh,
      setLit(key, on) {
        if ((lit.get(key) ?? true) === on) return;
        lit.set(key, on);
        for (const s of switches) {
          if (s.key !== key) continue;
          still.setColorAt(s.pane, on ? c.setHex(s.color) : OFF);
          if (s.halo >= 0) (sizes.array as Float32Array)[s.halo] = on ? s.size : 0;
        }
        if (still.instanceColor) still.instanceColor.needsUpdate = true;
        sizes.needsUpdate = true;
      },
      update(f, camera) {
        const n = f.night;
        const k = n * n * (3 - 2 * n);
        uniforms.uTime.value = f.t;
        // By day the dark rooms behind the windows; at night lit, above 1 (bloom).
        uniforms.uLevel.value = 0.07 + k * 3.1;
        uniforms.uPulse.value = 0.03 + k * 0.05;
        uniforms.uNearLevel.value = 1 - k * 0.5;
        halo.uniforms.uTime.value = f.t;
        halo.uniforms.uScale.value = pointScale(renderer, camera);
        halo.uniforms.uLamp.value = k * k * 1.1;
      },
    };
  }
}
