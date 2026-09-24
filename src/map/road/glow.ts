import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Points,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';

/**
 * Light of the road: glowing blocks (the inlay down the middle, lantern glass,
 * the beacons) and soft halos round the lamps. Glow is unlit colour scaled by
 * a level set every frame from the time of day — soft by day, above 1.0 in
 * linear light at night so it blooms.
 */

/** One glowing block: centre, size (across × height × along), turn, colour, and a per-block value (distance along the road, or a phase). */
interface GlowBlock {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  ry: number;
  color: number;
  a: number;
}

export class GlowBlocks {
  readonly list: GlowBlock[] = [];

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: number, a = 0): void {
    this.list.push({ x, y, z, sx, sy, sz, ry, color, a });
  }

  /** One instanced mesh; `aGlow` = (value, length along the block's z). */
  mesh(material: MeshBasicMaterial, name: string): InstancedMesh {
    const geo = new BoxGeometry(1, 1, 1);
    const n = this.list.length;
    const mesh = new InstancedMesh(geo, material, Math.max(1, n));
    mesh.count = n;
    mesh.name = name;
    const glow = new Float32Array(Math.max(1, n) * 2);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const up = new Vector3(0, 1, 0);
    const c = new Color();
    this.list.forEach((g, i) => {
      m.compose(p.set(g.x, g.y, g.z), q.setFromAxisAngle(up, g.ry), s.set(g.sx, g.sy, g.sz));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(g.color));
      glow[i * 2] = g.a;
      glow[i * 2 + 1] = g.sz;
    });
    geo.setAttribute('aGlow', new InstancedBufferAttribute(glow, 2));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    return mesh;
  }
}

export interface GlowUniforms {
  uTime: { value: number };
  /** Brightness multiplier (1 = the block's colour). */
  uLevel: { value: number };
  /** Extra brightness at a pulse's peak (road) or flicker depth (lamps). */
  uPulse: { value: number };
}

/**
 * Unlit glow material. `road`: slow pulses of light run along the road
 * (the block value is its distance along the network) over a soft breathing;
 * `lamp`: a gentle per-lamp flicker (the value is a phase).
 */
export function glowMaterial(kind: 'road' | 'lamp'): { material: MeshBasicMaterial; uniforms: GlowUniforms } {
  const uniforms: GlowUniforms = { uTime: { value: 0 }, uLevel: { value: 1 }, uPulse: { value: 0.5 } };
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.name = `map:glow-${kind}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying float vGlowS;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowS = aGlow.x + position.z * aGlow.y;');
    const factor =
      kind === 'road'
        ? /* glsl */ `
        // Pulses every 170 m, travelling outwards at 4.5 m/s, each about 30 m long.
        float ph = fract((vGlowS - uTime * 4.5) / 170.0) - 0.5;
        float d = ph * 170.0;
        float pulse = exp(-d * d / 180.0);
        float breath = 0.93 + 0.07 * sin(uTime * 0.55);
        outgoingLight *= uLevel * breath * (1.0 + uPulse * pulse);`
        : /* glsl */ `
        float flick = 1.0 + uPulse * (0.6 * sin(uTime * 1.9 + vGlowS) + 0.4 * sin(uTime * 3.3 + vGlowS * 2.7));
        outgoingLight *= uLevel * flick;`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uLevel;\nuniform float uPulse;\nvarying float vGlowS;')
      .replace('#include <opaque_fragment>', `${factor}\n#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `map-glow-${kind}`;
  return { material, uniforms };
}

/** A soft round halo round a light: position, size (m), brightness, which light (0 lantern, 1 beacon), phase. */
export interface Halo {
  x: number;
  y: number;
  z: number;
  size: number;
  kind: 0 | 1;
  phase: number;
}

export interface HaloUniforms {
  uTime: { value: number };
  /** Pixels per metre at 1 m distance (drawing buffer height / (2 tan(fov / 2))). */
  uScale: { value: number };
  uLamp: { value: number };
  uBeacon: { value: number };
  uColor: { value: Color };
}

/**
 * Halos as one cloud of camera-facing points (additive, faded by the fog). Each
 * point is pulled towards the camera by its radius, so the ground in front of
 * a lamp does not cut its halo in half.
 */
export function haloPoints(halos: Halo[]): { points: Points; uniforms: HaloUniforms } {
  const pos = new Float32Array(halos.length * 3);
  const size = new Float32Array(halos.length);
  const kind = new Float32Array(halos.length);
  const phase = new Float32Array(halos.length);
  halos.forEach((h, i) => {
    pos.set([h.x, h.y, h.z], i * 3);
    size[i] = h.size;
    kind[i] = h.kind;
    phase[i] = h.phase;
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  geo.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
  geo.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uScale: { value: 800 }, uLamp: { value: 0 }, uBeacon: { value: 0 }, uColor: { value: new Color(1, 0.62, 0.26) } }]),
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aKind;
      attribute float aPhase;
      uniform float uScale;
      uniform float uTime;
      uniform float uLamp;
      uniform float uBeacon;
      varying float vI;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        mvPosition.xyz += normalize(-mvPosition.xyz) * aSize * 0.5;
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * uScale / max(1.0, -mvPosition.z);
        float breathe = aKind > 0.5 ? 0.9 + 0.1 * sin(uTime * 0.9 + aPhase) : 1.0 + 0.05 * sin(uTime * 1.9 + aPhase);
        vI = mix(uLamp, uBeacon, aKind) * breathe;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vI;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 >= 1.0) discard;
        float a = (exp(-r2 * 6.0) * 0.8 + exp(-r2 * 30.0) * 0.6) * (1.0 - r2);
        gl_FragColor = vec4(uColor * vI * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          gl_FragColor.rgb *= 1.0 - fogFactor;
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: true,
  });
  material.name = 'map:halo';
  const points = new Points(geo, material);
  points.name = 'road:halos';
  points.frustumCulled = false;
  points.renderOrder = 2;
  const u = material.uniforms as unknown as HaloUniforms;
  return { points, uniforms: u };
}

/** Pixels per metre at 1 m for point sizes, from the camera and the drawing buffer. */
export function pointScale(renderer: WebGLRenderer, camera: PerspectiveCamera): number {
  const h = renderer.getContext().drawingBufferHeight;
  return h / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
