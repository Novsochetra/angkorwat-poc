import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Points,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  ZeroFactor,
  type PerspectiveCamera,
  type WebGLRenderer,
} from 'three';

/**
 * Light of the road: glowing blocks (the inlay down the middle, lamp glass,
 * the beacons), soft halos round the lamps and pools of lamplight on the
 * paving. Glow is unlit colour scaled by a level set every frame from the
 * time of day — soft by day, above 1.0 in linear light at night so it blooms.
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
  /** Near the camera the light gives way: within `x` m it is at `uNearLevel`, from `y` m full (x = y = 0: never). */
  uNear: { value: Vector2 };
  /** `road`: the faint ember left in the stone near the camera; `lamp`: the share of the level left there. */
  uNearLevel: { value: number };
}

/**
 * Unlit glow material. `road`: slow pulses of light run along the road
 * (the block value is its distance along the network) over a soft breathing;
 * `lamp`: a gentle per-lamp flicker (the value is a phase).
 *
 * Both soften near the camera (`uNear`). The road light fades out there
 * altogether: it is drawn over its carved stone ("over" blending of
 * premultiplied colour, still in the opaque pass: give its mesh a
 * `renderOrder` above the stone's), so from the road itself you walk on
 * stone and see the golden line only further on.
 */
export function glowMaterial(kind: 'road' | 'lamp'): { material: MeshBasicMaterial; uniforms: GlowUniforms } {
  const uniforms: GlowUniforms = { uTime: { value: 0 }, uLevel: { value: 1 }, uPulse: { value: 0.5 }, uNear: { value: new Vector2() }, uNearLevel: { value: 0 } };
  const material = new MeshBasicMaterial({ color: 0xffffff });
  material.name = `map:glow-${kind}`;
  if (kind === 'road') {
    material.blending = CustomBlending;
    material.blendSrc = OneFactor;
    material.blendDst = OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = ZeroFactor;
    material.blendDstAlpha = OneFactor;
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aGlow;\nvarying float vGlowS;\nvarying vec3 vGlowV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowS = aGlow.x + position.z * aGlow.y;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGlowV = mvPosition.xyz;');
    const near = /* glsl */ `
        float gNear = clamp((length(vGlowV) - uNear.x) / max(uNear.y - uNear.x, 1.0), 0.0, 1.0);
        gNear = gNear * gNear * (3.0 - 2.0 * gNear);`;
    const factor =
      kind === 'road'
        ? /* glsl */ `
        // Pulses every 170 m, travelling outwards at 4.5 m/s, each about 30 m long.
        float ph = fract((vGlowS - uTime * 4.5) / 170.0) - 0.5;
        float d = ph * 170.0;
        float pulse = exp(-d * d / 180.0);
        float breath = 0.93 + 0.07 * sin(uTime * 0.55);
        ${near}
        vec3 ember = outgoingLight * uNearLevel * breath * (1.0 + 1.5 * pulse);
        outgoingLight *= uLevel * breath * (1.0 + uPulse * pulse);`
        : /* glsl */ `
        float flick = 1.0 + uPulse * (0.6 * sin(uTime * 1.9 + vGlowS) + 0.4 * sin(uTime * 3.3 + vGlowS * 2.7));
        ${near}
        outgoingLight *= uLevel * flick * mix(uNearLevel, 1.0, gNear);`;
    // (road: the light over the stone as coverage, plus the ember added)
    const over = kind === 'road' ? '\ngl_FragColor = vec4(gl_FragColor.rgb * gNear + ember * (1.0 - gNear), gNear);' : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uLevel;\nuniform float uPulse;\nuniform vec2 uNear;\nuniform float uNearLevel;\nvarying float vGlowS;\nvarying vec3 vGlowV;')
      .replace('#include <opaque_fragment>', `${factor}\n#include <opaque_fragment>`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>${over}`);
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
        // Walking past a light, its halo thins out (the glow's own bloom is
        // enough there), so it never fills the view.
        float dist = length(mvPosition.xyz);
        float near = aKind > 0.5 ? mix(0.1, 1.0, smoothstep(10.0, 80.0, dist)) : smoothstep(6.0, 90.0, dist);
        mvPosition.xyz += normalize(-mvPosition.xyz) * aSize * 0.5;
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * uScale / max(1.0, -mvPosition.z);
        float breathe = aKind > 0.5 ? 0.9 + 0.1 * sin(uTime * 0.9 + aPhase) : 1.0 + 0.05 * sin(uTime * 1.9 + aPhase);
        vI = mix(uLamp, uBeacon, aKind) * breathe * near;
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

export interface PoolUniforms {
  uTime: { value: number };
  /** Brightness at the heart of a pool (linear; keep it under the bloom threshold). */
  uLevel: { value: number };
  /** Flicker depth (as the lamps'). */
  uPulse: { value: number };
  /** Pools fade out with distance from the camera: full within `x` m, gone by `y` m. */
  uFar: { value: Vector2 };
}

/**
 * Warm pools of lamplight on the road, faked: patches laid on the paving (up
 * the steps too) that add a lamp's light, falling off with distance from its
 * glass. One mesh, additive; lit by `uLevel` (night only).
 */
export class LightPools {
  private readonly pos: number[] = [];
  private readonly lamp: number[] = [];
  private readonly index: number[] = [];

  /** A quad (corners a, b, c, d in order round it) lit by the lamp at (lx, ly, lz) with its flicker phase. */
  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, lx: number, ly: number, lz: number, phase: number): void {
    const n = this.pos.length / 3;
    for (const p of [a, b, c, d]) {
      this.pos.push(p.x, p.y, p.z);
      this.lamp.push(lx, ly, lz, phase);
    }
    this.index.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }

  get quads(): number {
    return this.index.length / 6;
  }

  mesh(name: string): { mesh: Mesh; uniforms: PoolUniforms } {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('aLamp', new Float32BufferAttribute(this.lamp, 4));
    geo.setIndex(this.index);
    const material = new ShaderMaterial({
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uTime: { value: 0 }, uLevel: { value: 0 }, uPulse: { value: 0 }, uFar: { value: new Vector2(60, 140) }, uColor: { value: new Color(1, 0.5, 0.19) } }]),
      vertexShader: /* glsl */ `
        attribute vec4 aLamp;
        varying vec3 vPos;
        varying vec4 vLamp;
        varying float vDist;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vPos = position;
          vLamp = aLamp;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDist = length(mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uLevel;
        uniform float uPulse;
        uniform vec2 uFar;
        uniform vec3 uColor;
        varying vec3 vPos;
        varying vec4 vLamp;
        varying float vDist;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          // Falls off with distance from the glass: bright at the lamp's foot, gone by 5.2 m.
          vec3 dv = vPos - vLamp.xyz;
          float f = 1.0 - dot(dv, dv) / 27.0;
          if (f <= 0.0) discard;
          float flick = 1.0 + uPulse * (0.6 * sin(uTime * 1.9 + vLamp.w) + 0.4 * sin(uTime * 3.3 + vLamp.w * 2.7));
          float a = f * f * f * flick * uLevel * (1.0 - smoothstep(uFar.x, uFar.y, vDist));
          gl_FragColor = vec4(uColor * a, 1.0);
          #ifdef USE_FOG
            gl_FragColor.rgb *= 1.0 - hazeDistance(vDist);
          #endif
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
      fog: true,
    });
    material.name = 'map:light-pools';
    const mesh = new Mesh(geo, material);
    mesh.name = name;
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    return { mesh, uniforms: material.uniforms as unknown as PoolUniforms };
  }
}

/** Pixels per metre at 1 m for point sizes, from the camera and the drawing buffer. */
export function pointScale(renderer: WebGLRenderer, camera: PerspectiveCamera): number {
  const h = renderer.getContext().drawingBufferHeight;
  return h / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
