import { BoxGeometry, Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { mulberry32 } from '../../voxel/random';

/**
 * Small flocks of big pale birds (egrets, storks) gliding in wide, slow loops
 * over the valley by day: blocky bodies and wings, mostly gliding with a few
 * lazy wing beats now and then, banking into the turn. Everything is a pure
 * function of time, so a still at `t` is always the same.
 */

interface Flock {
  /** Centre of the loop (m). */
  c: [number, number, number];
  /** Loop radii (m, x and z) and turn of the ellipse. */
  rx: number;
  rz: number;
  rot: number;
  /** Speed (m/s); sign = way round. */
  v: number;
  birds: number;
  color: number;
  seed: number;
}

/** Wingspan (m): a stork-sized bird, so it reads from 150 m. */
const SPAN = 2.2;

const FLOCKS: Flock[] = [
  // Over the valley in front of the summit.
  { c: [-15, 58, -30], rx: 60, rz: 38, rot: 0.3, v: 7, birds: 5, color: 0xf4efe4, seed: 1 },
  // East, over the river and the garden hills.
  { c: [110, 72, -95], rx: 70, rz: 48, rot: -0.4, v: -7.5, birds: 6, color: 0xf0ebe0, seed: 2 },
  // West, by the stone faces' cliffs.
  { c: [-175, 66, -110], rx: 55, rz: 40, rot: 0.8, v: 6.5, birds: 4, color: 0xe9e3d6, seed: 3 },
  // Dark birds high up, behind the summit.
  { c: [60, 135, -330], rx: 95, rz: 60, rot: 0.1, v: -8, birds: 7, color: 0x3a3430, seed: 4 },
];

export interface Birds {
  meshes: InstancedMesh[];
  update(t: number, night: number): void;
}

export function buildBirds(): Birds {
  const members = FLOCKS.flatMap((f) => {
    const rnd = mulberry32(f.seed * 977);
    return Array.from({ length: f.birds }, (_, i) => {
      // A loose V: each bird a little behind and to the side of the one before.
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      return {
        f,
        back: Math.abs(side) * (3.2 + rnd() * 1.5) + rnd() * 1.5,
        side: side * (2.6 + rnd() * 1.2),
        up: (rnd() - 0.5) * 2,
        phase: rnd() * 100,
        size: 0.85 + rnd() * 0.3,
      };
    });
  });
  const n = members.length;
  // A little self-light, so the pale birds stay bright white against the land in the low sun.
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, transparent: true, opacity: 1, emissive: 0x6a645a });
  material.name = 'map:birds';
  const body = new InstancedMesh(new BoxGeometry(0.28, 0.22, 0.9), material, n);
  // Each wing: a broad inner part and a narrower hand, swept back and bent up a little more.
  const wings = new InstancedMesh(new BoxGeometry(1, 0.06, 1), material, n * 4);
  body.name = 'life:birds';
  wings.name = 'life:bird-wings';
  const c = new Color();
  members.forEach((m, i) => {
    body.setColorAt(i, c.setHex(m.f.color));
    for (let w = 0; w < 4; w++) wings.setColorAt(i * 4 + w, c.setHex(m.f.color));
  });
  for (const mesh of [body, wings]) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  const pos = new Vector3();
  const fwd = new Vector3();
  const right = new Vector3();
  const q = new Quaternion();
  const e = new Euler(0, 0, 0, 'YXZ');
  const mb = new Matrix4();
  const mw = new Matrix4();
  const tw = new Matrix4();
  const rw = new Matrix4();
  const scale = new Vector3();
  const hw = new Matrix4();
  const v3 = new Vector3();
  const sc = new Vector3();
  const q0 = new Quaternion();
  const qs = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);

  return {
    meshes: [body, wings],
    update(t: number, night: number) {
      const k = 1 - smooth(0.25, 0.7, night);
      body.visible = wings.visible = k > 0.01;
      material.opacity = k;
      if (!body.visible) return;
      members.forEach((m, i) => {
        const f = m.f;
        const R = (f.rx + f.rz) / 2;
        const a = (f.v / R) * t + f.seed * 1.3;
        // Loop point and heading (derivative of the ellipse), turned by rot.
        const lx = Math.cos(a) * f.rx;
        const lz = Math.sin(a) * f.rz;
        const dx = -Math.sin(a) * f.rx * Math.sign(f.v);
        const dz = Math.cos(a) * f.rz * Math.sign(f.v);
        const cr = Math.cos(f.rot);
        const sr = Math.sin(f.rot);
        fwd.set(dx * cr - dz * sr, 0, dx * sr + dz * cr).normalize();
        right.set(-fwd.z, 0, fwd.x);
        const w = m.phase;
        pos.set(f.c[0] + lx * cr - lz * sr, f.c[1] + Math.sin(t * 0.21 + f.seed) * 3, f.c[2] + lx * sr + lz * cr);
        pos.addScaledVector(fwd, -m.back).addScaledVector(right, m.side + Math.sin(t * 0.37 + w) * 0.8);
        pos.y += m.up + Math.sin(t * 0.53 + w * 1.7) * 0.6;
        // Heading, a gentle bank into the turn, a slight nose-down glide.
        e.set(-0.04, Math.atan2(fwd.x, fwd.z), -Math.sign(f.v) * 0.22);
        q.setFromEuler(e);
        mb.compose(pos, q, scale.setScalar(m.size));
        body.setMatrixAt(i, mb);
        // Wings: glide with a slight dihedral; now and then a few slow beats.
        const burst = smooth(0.55, 0.85, Math.sin(t * 0.8 + w));
        const beat = Math.sin(t * 2 * Math.PI * 1.6 + w) * 0.55 * burst;
        for (const s of [-1, 1]) {
          const ang = (0.1 + beat) * s;
          // Inner wing: from the shoulder out to half the half-span.
          rw.makeRotationZ(ang);
          tw.compose(v3.set((s * SPAN) / 8, 0, 0.05), q0, sc.set(SPAN / 4, 1, 0.5));
          mw.multiplyMatrices(rw, tw).premultiply(mb);
          wings.setMatrixAt(i * 4 + (s > 0 ? 1 : 0), mw);
          // Hand: from the wrist, swept back, bent up a little more.
          hw.makeRotationZ((0.12 + beat * 0.6) * s);
          tw.compose(v3.set((s * SPAN) / 8, 0, -0.08), qs.setFromAxisAngle(yAxis, s * 0.35), sc.set(SPAN / 4, 1, 0.3));
          mw.makeTranslation((s * SPAN) / 4, 0, 0).multiply(hw).multiply(tw);
          mw.premultiply(rw).premultiply(mb);
          wings.setMatrixAt(i * 4 + 2 + (s > 0 ? 1 : 0), mw);
        }
      });
      body.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
  };
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
