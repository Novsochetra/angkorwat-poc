import { Group, type InstancedMesh, type PerspectiveCamera, type WebGLRenderer } from 'three';
import { GlowBlocks, glowMaterial, haloPoints, pointScale, type Halo } from '../road/glow';
import type { MapFrame } from '../types';

/**
 * The village's lights, all glow (no light is added): window panes and door
 * gaps lit from inside, lanterns under the eaves, the shop's tube light,
 * embers in the kitchen stoves, the pagoda's candle-lit door and lamps.
 * Unlit boxes whose colour goes well above 1.0 (linear) at night, so the
 * bloom catches them; by day the panes are the dark rooms behind the
 * windows. Soft halos round the lanterns and lamps at night.
 */

/** Pane colours (sRGB): oil lamp, candle-lit hall, cool tube light, ember. */
export const GLOW = { window: 0xffa24c, warm: 0xffb866, hall: 0xffae52, tube: 0xdcefff, ember: 0xff5a1c, lantern: 0xffb45a } as const;

export class VillageLights {
  /** Panes and lamps that never move. */
  readonly still = new GlowBlocks();
  /** Panes on the floating houses (they bob with them: see `_floating.ts`). */
  readonly floating = new GlowBlocks();
  /** Which floating raft each `floating` pane belongs to. */
  readonly floatingOwner: number[] = [];
  readonly halos: Halo[] = [];

  /** A pane on a raft. */
  addFloating(owner: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number, phase = 0): void {
    this.floating.add(x, y, z, sx, sy, sz, ry, color, phase);
    this.floatingOwner.push(owner);
  }

  /** A lantern's (or lamp's) soft halo at night. */
  halo(x: number, y: number, z: number, size: number, phase = 0): void {
    this.halos.push({ x, y, z, size, kind: 0, phase });
  }

  /** The meshes (one per list, the halos) and their per-frame update. */
  build(renderer: WebGLRenderer): { object: Group; floatingMesh: InstancedMesh | null; update(f: MapFrame, camera: PerspectiveCamera): void } {
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
    return {
      object,
      floatingMesh,
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
