import { Color, DoubleSide, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import { mulberry32 } from '../../voxel/random';

/**
 * A few butterflies by day round the explorer's ledge, close to the camera:
 * two little wings each, fluttering, on slow meandering paths over the edge
 * of the ledge. They go to rest at dusk.
 */

const COLORS = [0xf2a33a, 0xf5d04a, 0xf6f1e4, 0xe8762e, 0xf2c14e, 0xa9d8f0];
const COUNT = 6;
/** Wing size (m), a little large for a butterfly so it reads at 8–12 m. */
const WING = 0.13;

export interface Butterflies {
  mesh: InstancedMesh;
  update(t: number, night: number): void;
}

export function buildButterflies(feet: Vector3): Butterflies {
  const rnd = mulberry32(777);
  const flies = Array.from({ length: COUNT }, () => ({
    // Home spot: over the ledge's edge, right of and in front of the explorer.
    home: new Vector3(feet.x - 1 + rnd() * 5.5, feet.y + 0.6 + rnd() * 2, feet.z - 4.5 + rnd() * 5),
    phase: rnd() * 100,
    rate: 0.7 + rnd() * 0.5,
    color: COLORS[Math.floor(rnd() * COLORS.length)],
  }));
  // One wing: a big forewing and a smaller hindwing, hinged at x = 0 (the body),
  // outline in (out, forward) and laid flat.
  const k = WING / 0.13;
  const outline: [number, number][] = [[0, 0.02], [0.04, 0.07], [0.1, 0.085], [0.13, 0.05], [0.11, 0.005], [0.075, -0.012], [0.085, -0.05], [0.055, -0.08], [0.02, -0.06], [0, -0.02]];
  const geo = new ShapeGeometry(new Shape(outline.map(([x, y]) => new Vector2(x * k, y * k))));
  geo.rotateX(Math.PI / 2);
  const material = new MeshLambertMaterial({ color: 0xffffff, side: DoubleSide, transparent: true });
  material.name = 'map:butterflies';
  const mesh = new InstancedMesh(geo, material, COUNT * 2);
  mesh.name = 'life:butterflies';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  const c = new Color();
  flies.forEach((f, i) => {
    mesh.setColorAt(i * 2, c.setHex(f.color));
    mesh.setColorAt(i * 2 + 1, c.setHex(f.color));
  });
  const p = new Vector3();
  const v = new Vector3();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const body = new Matrix4();
  const wing = new Matrix4();
  const one = new Vector3(1, 1, 1);
  return {
    mesh,
    update(t: number, night: number) {
      const k = 1 - Math.min(1, Math.max(0, (night - 0.15) / 0.35));
      mesh.visible = k > 0.01;
      material.opacity = k;
      if (!mesh.visible) return;
      flies.forEach((f, i) => {
        const s = t * f.rate + f.phase;
        // Wandering loops a couple of metres across, with a little bob.
        const path = (u: number, out: Vector3) =>
          out.set(
            f.home.x + Math.sin(u * 0.43) * 1.6 + Math.sin(u * 1.1) * 0.4,
            f.home.y + Math.sin(u * 0.71) * 0.45 + Math.sin(u * 3.3) * 0.08,
            f.home.z + Math.cos(u * 0.37) * 1.4 + Math.cos(u * 0.9) * 0.4,
          );
        path(s, p);
        path(s + 0.05, v).sub(p);
        q.setFromAxisAngle(up, Math.atan2(v.x, v.z));
        body.compose(p, q, one);
        // Flutter: quick beats with short glides.
        const beat = 0.25 + 1.05 * Math.abs(Math.sin(t * 9 + f.phase * 3)) * (0.6 + 0.4 * Math.sin(t * 1.3 + f.phase));
        for (const side of [-1, 1]) {
          wing.makeRotationZ(side > 0 ? beat : Math.PI - beat);
          wing.premultiply(body);
          mesh.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), wing);
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
