import { BoxGeometry, Color, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { PERIOD } from '../festival/_kit';
import { smooth, type Bodies } from './_lkKit';

/**
 * Live flames for the lake stage (AWP-35, `_lkStage.ts`): the fire bowls along its front, the braziers before the board,
 * the lamps in the towers' doors. A flame is five glowing boxes — a wide low ember bed, the bright heart and three thin
 * tongues round it, each licking up to its own height on its own beat — in ONE instanced unlit draw that moves only in its vertex shader (the `nye` part is FROZEN: no matrix moves): each box
 * stretches and shrinks in height from its foot (more, and quicker, the higher it sits in its flame), draws in toward
 * its top, its top sways, and its brightness flickers, each flame on its own phase. Over 1.0 at night, so it blooms.
 *
 * On the low graphics level the flames are still boxes in the venue's `Bodies` instead (no draw of their own).
 */

/** Flame colours (sRGB): the ember bed, the heart, the tongues (yellow enough that the tone mapping keeps them orange). */
const BED = 0xff8c1e;
const HEART = 0xffc24a;
const TONGUE = 0xff9a2a;

interface FireBox {
  p: [number, number, number];
  s: [number, number, number];
  ry: number;
  c: number;
  /** Phase (rad), how much it moves (0 the bed … 1 the tongue). */
  ph: number;
  role: number;
}

export class Fires {
  private readonly boxes: FireBox[] = [];
  readonly material = new MeshBasicMaterial({ color: 0xffffff });
  private readonly u = { uTime: { value: 0 } };
  private flames = 0;

  /** `still`: on low, the venue's glowing boxes take the flames as they are (no draw of their own). */
  constructor(private readonly still: Bodies | null) {
    this.material.name = 'nye:lake:fire';
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aFire;\nuniform float uTime;\nvarying float vFlick;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
  {
    float ph = aFire.x;
    float role = aFire.y;
    float hy = position.y + 0.5;
    // (taller and shorter from its foot, more the higher the box sits in its flame)
    float s = 1.0 + role * (0.3 * sin(uTime * 8.3 + ph) + 0.17 * sin(uTime * 13.7 + ph * 2.3));
    transformed.y = -0.5 + hy * s;
    // (drawing in toward its top; the top swaying)
    transformed.xz *= 1.0 - hy * role * (0.55 + 0.2 * sin(uTime * 11.0 + ph * 1.7));
    transformed.x += hy * role * 0.42 * sin(uTime * 4.7 + ph * 1.3);
    transformed.z += hy * role * 0.34 * sin(uTime * 3.9 + ph * 0.7);
    vFlick = 0.84 + 0.16 * sin(uTime * 17.0 + ph * 3.1) * sin(uTime * 6.1 + ph);
  }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFlick;')
        .replace('#include <opaque_fragment>', 'outgoingLight *= vFlick;\n#include <opaque_fragment>');
    };
    this.material.customProgramCacheKey = () => 'nye-lake-fire';
  }

  get count(): number {
    return this.flames;
  }

  /**
   * A flame standing on (x, y, z) (map m): `w` wide at its foot, `h` tall, turned `ry`, brightness `k`; `phase` sets it
   * apart from its neighbours.
   */
  flame(x: number, y: number, z: number, w: number, h: number, ry: number, phase: number, k = 1.2): void {
    this.flames++;
    const parts: [number, number, number, number, number, number, number, number][] = [
      // (height share from, to; width share; offset across, along (share of w); colour; brightness share; how much it moves)
      [0, 0.28, 1, 0, 0, BED, 0.85, 0.25],
      [0.1, 0.66, 0.6, 0, 0, HEART, 1, 0.55],
      [0.38, 1, 0.26, 0.12, 0.06, TONGUE, 0.95, 1],
      [0.3, 0.84, 0.22, -0.16, 0.1, TONGUE, 0.9, 0.9],
      [0.28, 0.76, 0.2, 0.02, -0.18, HEART, 0.9, 0.85],
    ];
    const ca = Math.cos(ry);
    const sa = Math.sin(ry);
    for (const [i, [a, b, ws, ox, oz, c, kk, role]] of parts.entries()) {
      if (this.still && i > 2) break;
      const yy = y + h * (a + b) * 0.5;
      const hh = h * (b - a);
      const px = x + (ca * ox + sa * oz) * w;
      const pz = z + (-sa * ox + ca * oz) * w;
      if (this.still) {
        // (low: still boxes, as the venue's other glowing boxes)
        this.still.add(px, yy, pz, w * ws, hh, w * ws, c, k * kk, ry + role);
        continue;
      }
      this.boxes.push({ p: [px, yy, pz], s: [w * ws, hh, w * ws], ry: ry + role * 0.8 + i * 0.4, c, ph: phase + i * 1.7, role });
    }
  }

  /** The draw (null on low, or with no flames), and its brightness from the night each frame. */
  build(name: string): { mesh: InstancedMesh; update(t: number, night: number, event: number): void } | null {
    const n = this.boxes.length;
    if (!n) return null;
    const geo = new BoxGeometry(1, 1, 1);
    const fire = new Float32Array(n * 2);
    const mesh = new InstancedMesh(geo, this.material, n);
    mesh.name = name;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const v = new Vector3();
    const s = new Vector3();
    const col = new Color();
    this.boxes.forEach((b, i) => {
      m.compose(v.set(...b.p), q.setFromEuler(e.set(0, b.ry, 0)), s.set(...b.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.setHex(b.c));
      fire[i * 2] = b.ph;
      fire[i * 2 + 1] = b.role;
    });
    geo.setAttribute('aFire', new InstancedBufferAttribute(fire, 2));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    mesh.computeBoundingSphere();
    mesh.boundingSphere!.radius += 1;
    const { material, u } = this;
    return {
      mesh,
      update(t, night, event) {
        u.uTime.value = ((t % PERIOD) + PERIOD) % PERIOD;
        const k = smooth(0.1, 0.85, night);
        // (kept under ≈ 1.6: brighter, the neutral tone mapping bleaches a flame's orange to salmon and white)
        material.color.setScalar((0.55 + 0.85 * k) * (1 + 0.1 * event));
      },
    };
  }
}
