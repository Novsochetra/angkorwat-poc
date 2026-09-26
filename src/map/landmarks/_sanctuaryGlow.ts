import { BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, Object3D, PointLight } from 'three';
import type { MapFrame } from '../types';
import type { GlowBox } from './_sanctuaryMason';

/**
 * The sanctuary's lights: lit doorways, lamps in the galleries and torch
 * flames, as unlit boxes whose colour goes above 1.0 (linear) at night so the
 * bloom picks them up; soft by day. One warm point light at the main door.
 */

/** Brightness (linear multiplier) by day and at night, per kind. */
const LEVEL = {
  door: { day: 0.9, night: 3.6 },
  window: { day: 0.05, night: 2.8 },
  flame: { day: 0.35, night: 3.4 },
  shrine: { day: 0.9, night: 1.25 },
} as const;

export interface SanctuaryLights {
  object: Group;
  update(f: MapFrame): void;
}

export function buildLights(boxes: GlowBox[], door: [number, number, number]): SanctuaryLights {
  const object = new Group();
  object.name = 'sanctuary:lights';
  const geo = new BoxGeometry(1, 1, 1);
  const dummy = new Object3D();
  const c = new Color();
  const mats: { kind: keyof typeof LEVEL; mat: MeshBasicMaterial; flicker: number }[] = [];
  for (const kind of ['door', 'window', 'flame', 'shrine'] as const) {
    const list = boxes.filter((b) => b.kind === kind);
    if (!list.length) continue;
    const mat = new MeshBasicMaterial({ color: 0xffffff, fog: true });
    const mesh = new InstancedMesh(geo, mat, list.length);
    mesh.name = `sanctuary:glow:${kind}`;
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(b.sx, b.sy, b.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, c.setHex(b.color));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    object.add(mesh);
    mats.push({ kind, mat, flicker: kind === 'flame' ? 0.12 : kind === 'door' || kind === 'shrine' ? 0.03 : 0 });
  }

  // Warm light spilling from the main door onto the forecourt and the stairs.
  const lamp = new PointLight(0xffa55a, 0, 70, 2);
  lamp.name = 'sanctuary door light';
  lamp.position.set(door[0], door[1], door[2]);
  object.add(lamp);

  return {
    object,
    update(f: MapFrame) {
      const n = f.night;
      for (const { kind, mat, flicker } of mats) {
        const l = LEVEL[kind];
        // A slow, soft flicker (nothing moves fast on the map).
        const wave = 1 + flicker * (Math.sin(f.t * 2.1) * 0.6 + Math.sin(f.t * 3.7 + 1.3) * 0.4) * n;
        mat.color.setScalar((l.day + (l.night - l.day) * n) * wave);
      }
      lamp.intensity = 40 + 900 * n;
    },
  };
}
