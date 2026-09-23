import {
  BackSide,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { KitView } from '../kit/types';

/**
 * Camera presets (degrees): azimuth from +Z towards +X, elevation above the
 * horizon. The reference sheets use a 3/4 view from the front-right with the
 * light from the upper left, so the front (+Z) face reads lit and the right
 * (+X) face a step darker.
 */
export const VIEW_PRESETS: Record<KitView, { az: number; el: number }> = {
  iso: { az: 45, el: 30 },
  'iso-low': { az: 38, el: 16 },
  front: { az: 0, el: 10 },
  side: { az: 90, el: 10 },
  back: { az: 180, el: 10 },
  top: { az: 0, el: 90 },
  elevation: { az: 0, el: 0 },
};

/** Something the stage shows: an object placed in its own slot of the world. */
export interface Subject {
  object: Object3D;
  /** World-space bounds (after placement). */
  bounds: Box3;
}

export interface StageView {
  el: HTMLElement;
  subject: Subject;
  /** Orthographic for the sheet views; perspective for dioramas (see addPerspectiveView). */
  camera: OrthographicCamera | PerspectiveCamera;
  view: KitView;
  /** Clear colour behind this view. */
  bg: Color;
  /** Extra room around the subject (fraction of its size). */
  pad: number;
  controls?: OrbitControls;
  /** Called after the view is drawn (overlays that follow the camera). */
  after?: (v: StageView, rect: DOMRect) => void;
}

const SLOT_GAP = 60;

/**
 * Studio light intensities (tunable from the URL: hemi=…&key=…&fill=…&rim=…&env=…),
 * plus the key light's azimuth / elevation in degrees (kaz=…&kel=…, to try others).
 */
export interface StudioLight {
  hemi: number;
  key: number;
  fill: number;
  rim: number;
  env: number;
  kaz?: number;
  kel?: number;
  /** Sky (hemisphere) and fill colours as hex numbers (skyc=…&fillc=…, to try others). */
  skyc?: number;
  fillc?: number;
}
export const STUDIO_LIGHT: StudioLight = { hemi: 0.4, key: 3.1, fill: 0.3, rim: 0.4, env: 0.15 };

/**
 * Draws many orthographic views into one full-page canvas: each view is a DOM
 * element; the renderer scissors to its rectangle every frame. Subjects live in
 * separate slots of one scene, so every view has its own shadows and the depth
 * range of each camera is clipped to its subject.
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly views: StageView[] = [];
  readonly subjects: Subject[] = [];
  readonly key: DirectionalLight;
  readonly pageBg: Color;
  /** Gradient sky shown behind perspective (diorama) views only. */
  private readonly sky: Mesh;
  private slotX = 0;
  private dirty = true;
  /** Key light direction (towards the light): upper left, in front. */
  private readonly keyDir = new Vector3(-2.0, 6.4, 3.0).normalize();

  constructor(
    readonly canvas: HTMLCanvasElement,
    o: { shot: boolean; pageBg: string; light?: Partial<StudioLight> },
  ) {
    const L = { ...STUDIO_LIGHT, ...o.light };
    if (L.kaz !== undefined || L.kel !== undefined) {
      const a = ((L.kaz ?? -33.7) * Math.PI) / 180;
      const e = ((L.kel ?? 60.6) * Math.PI) / 180;
      this.keyDir.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    }
    const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: o.shot, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, o.shot ? 1 : 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.autoClear = false;
    this.renderer = renderer;
    this.pageBg = new Color(o.pageBg);

    const pmrem = new PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = L.env;
    // Warm key from the upper left, cool dim fill: the sheets' lit faces glow,
    // their shaded faces go a cool grey-brown.
    this.scene.add(new HemisphereLight(L.skyc ?? 0xb8cbf5, 0x8a8a8e, L.hemi));
    const key = new DirectionalLight(0xfff4e8, L.key);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.intensity = 0.6;
    this.scene.add(key, key.target);
    this.key = key;
    // Cool fill from the right, so the shaded side reads grey-violet like the
    // sheets (measured on the §19.1 cube: shaded face #6d5b4c vs the sheet's #6c5750).
    const fill = new DirectionalLight(L.fillc ?? 0x7390f0, L.fill);
    fill.position.set(3.0, 1.2, 2.0);
    const rim = new DirectionalLight(0xffd7a8, L.rim);
    rim.position.set(1.0, 3.0, -4.0);
    this.scene.add(fill, rim);
    // Afternoon sky like the sheets' environment examples: blue overhead, warm haze at the horizon.
    this.sky = new Mesh(
      new SphereGeometry(900, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        uniforms: { top: { value: new Color(0x6fa3d8) }, horizon: { value: new Color(0xf3e3c6) } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
          void main(){ float h = max(vDir.y, 0.0); gl_FragColor = vec4(mix(horizon, top, pow(min(1.0, h * 1.8), 0.75)), 1.0); }`,
      }),
    );
    this.sky.name = 'studio-sky';
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.sky.visible = false;
    this.scene.add(this.sky);
    const ground = new Mesh(new PlaneGeometry(20000, 20000), new ShadowMaterial({ opacity: 0.17 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'studio-floor';
    this.scene.add(ground);
  }

  /**
   * Put an object in the next free slot, standing on the floor (its lowest
   * point at y = 0), centred on its slot. `local` = its bounds before placing.
   */
  addSubject(object: Object3D, local: Box3): Subject {
    const size = local.getSize(new Vector3());
    const centre = local.getCenter(new Vector3());
    const x = this.slotX + size.x / 2;
    object.position.set(x - centre.x, -local.min.y, -centre.z + this.subjects.length * 7.3);
    this.slotX += size.x + SLOT_GAP + Math.max(size.y, size.z);
    this.scene.add(object);
    object.updateMatrixWorld(true);
    const bounds = local.clone().translate(object.position);
    const s: Subject = { object, bounds };
    this.subjects.push(s);
    this.dirty = true;
    return s;
  }

  addView(el: HTMLElement, subject: Subject, view: KitView, o: { bg?: string; pad?: number; orbit?: boolean; after?: StageView['after'] } = {}): StageView {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    const v: StageView = { el, subject, camera, view, bg: new Color(o.bg ?? '#fbf7ef'), pad: o.pad ?? 0.08, after: o.after };
    this.aim(v);
    if (o.orbit) {
      const controls = new OrbitControls(camera, el);
      controls.target.copy(subject.bounds.getCenter(new Vector3()));
      controls.enableDamping = false;
      controls.zoomToCursor = true;
      controls.addEventListener('change', () => (this.dirty = true));
      v.controls = controls;
    }
    this.views.push(v);
    this.dirty = true;
    return v;
  }

  /**
   * A perspective view of a diorama: camera at azimuth / elevation (degrees) and
   * distance (metres) around a target in the subject's local space.
   */
  addPerspectiveView(el: HTMLElement, subject: Subject, cam: { az: number; el: number; dist: number; target?: [number, number, number]; fov?: number }, o: { bg?: string; orbit?: boolean } = {}): StageView {
    const camera = new PerspectiveCamera(cam.fov ?? 35, 1, 0.1, 2000);
    const t = new Vector3(...(cam.target ?? [0, 0, 0])).add(subject.object.position);
    const a = (cam.az * Math.PI) / 180;
    const e = (cam.el * Math.PI) / 180;
    camera.position.copy(t).add(new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(cam.dist));
    camera.lookAt(t);
    const v: StageView = { el, subject, camera, view: 'iso', bg: new Color(o.bg ?? '#dfe7ea'), pad: 0 };
    if (o.orbit) {
      const controls = new OrbitControls(camera, el);
      controls.target.copy(t);
      controls.addEventListener('change', () => (this.dirty = true));
      v.controls = controls;
    }
    this.views.push(v);
    this.dirty = true;
    return v;
  }

  /** Point a view's camera from its preset direction and fit the subject. */
  aim(v: StageView): void {
    if (!(v.camera instanceof OrthographicCamera)) return;
    const { az, el } = VIEW_PRESETS[v.view];
    const a = (az * Math.PI) / 180;
    const e = (Math.min(89.9, el) * Math.PI) / 180;
    const dir = new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const b = v.subject.bounds;
    const centre = b.getCenter(new Vector3());
    const R = b.getSize(new Vector3()).length() / 2 + 0.01;
    const D = R * 3 + 5;
    v.camera.position.copy(centre).addScaledVector(dir, D);
    v.camera.up.set(0, 1, 0);
    if (el >= 89.9) v.camera.up.set(0, 0, -1);
    v.camera.lookAt(centre);
    v.camera.near = D - R * 1.15;
    v.camera.far = D + R * 1.15;
    v.camera.zoom = 1;
    v.camera.updateMatrixWorld(true);
    // Extents of the bounds seen from this direction.
    const inv = v.camera.matrixWorldInverse;
    const p = new Vector3();
    let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const cx of [b.min.x, b.max.x])
      for (const cy of [b.min.y, b.max.y])
        for (const cz of [b.min.z, b.max.z]) {
          p.set(cx, cy, cz).applyMatrix4(inv);
          x0 = Math.min(x0, p.x);
          x1 = Math.max(x1, p.x);
          y0 = Math.min(y0, p.y);
          y1 = Math.max(y1, p.y);
        }
    v.camera.userData.fit = { x0, x1, y0, y1 };
    this.frame(v);
  }

  /**
   * Keep the fitted extents inside the element, whatever its aspect ratio
   * (orbiting ortho views zoom through `camera.zoom`, so this stays valid).
   */
  private frame(v: StageView, rect = v.el.getBoundingClientRect()): void {
    if (v.camera instanceof PerspectiveCamera) {
      const aspect = Math.max(1e-3, rect.width / Math.max(1, rect.height));
      if (v.camera.aspect !== aspect) {
        v.camera.aspect = aspect;
        v.camera.updateProjectionMatrix();
      }
      return;
    }
    const f = v.camera.userData.fit as { x0: number; x1: number; y0: number; y1: number };
    const w = (f.x1 - f.x0) * (1 + v.pad * 2);
    const h = (f.y1 - f.y0) * (1 + v.pad * 2);
    const aspect = Math.max(1e-3, rect.width / Math.max(1, rect.height));
    const hw = Math.max(w, h * aspect) / 2;
    const hh = hw / aspect;
    const cx = (f.x0 + f.x1) / 2;
    const cy = (f.y0 + f.y1) / 2;
    if (v.camera.left === cx - hw && v.camera.top === cy + hh) return;
    Object.assign(v.camera, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
    v.camera.updateProjectionMatrix();
  }

  invalidate(): void {
    this.dirty = true;
  }

  /** Draw every view that is on screen (only when something changed, unless forced). */
  render(force = false): void {
    if (!this.dirty && !force) return;
    this.dirty = false;
    const r = this.renderer;
    const canvas = r.domElement;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const crect = canvas.getBoundingClientRect();
    r.setScissorTest(false);
    r.setClearColor(this.pageBg);
    r.clear();
    r.setScissorTest(true);
    for (const v of this.views) {
      const rect = v.el.getBoundingClientRect();
      const left = rect.left - crect.left;
      const top = rect.top - crect.top;
      if (rect.width < 2 || rect.height < 2 || top > ch || top + rect.height < 0 || left > cw || left + rect.width < 0) continue;
      const bottom = ch - top - rect.height;
      r.setViewport(left, bottom, rect.width, rect.height);
      r.setScissor(left, bottom, rect.width, rect.height);
      r.setClearColor(v.bg);
      r.clear();
      this.frame(v, rect);
      this.fitShadow(v.subject);
      for (const s of this.subjects) s.object.visible = s === v.subject;
      this.sky.visible = v.camera instanceof PerspectiveCamera;
      this.sky.position.copy(v.camera.position);
      r.render(this.scene, v.camera);
      v.after?.(v, rect);
    }
    for (const s of this.subjects) s.object.visible = true;
    this.sky.visible = false;
    r.setScissorTest(false);
  }

  /** Aim the key light's shadow camera at one subject. */
  private fitShadow(s: Subject): void {
    const c = s.bounds.getCenter(new Vector3());
    const R = s.bounds.getSize(new Vector3()).length() / 2 + 0.5;
    this.key.target.position.copy(c);
    this.key.position.copy(c).addScaledVector(this.keyDir, R * 3);
    const cam = this.key.shadow.camera;
    Object.assign(cam, { left: -R, right: R, top: R, bottom: -R, near: R * 1.5, far: R * 4.6 });
    cam.updateProjectionMatrix();
    this.key.target.updateMatrixWorld();
    this.key.updateMatrixWorld();
  }

  /** The view under a client point. */
  viewAt(x: number, y: number): StageView | null {
    for (const v of this.views) {
      const r = v.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return v;
    }
    return null;
  }

  /** The first (main) view of the subject a world point belongs to. */
  viewOf(p: Vector3): StageView | null {
    for (const v of this.views) if (v.subject.bounds.clone().expandByScalar(0.5).containsPoint(p)) return v;
    return null;
  }

  /** Client position of a world point in a view (null if outside it). */
  screenIn(v: StageView, p: Vector3): { x: number; y: number } | null {
    const r = v.el.getBoundingClientRect();
    const s = p.clone().project(v.camera);
    if (Math.abs(s.x) > 1 || Math.abs(s.y) > 1) return null;
    return { x: r.left + ((s.x + 1) / 2) * r.width, y: r.top + ((1 - s.y) / 2) * r.height };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.dirty = true;
  }

  /** Every subject's objects, for picking. */
  pickables(): Group[] {
    return this.subjects.map((s) => s.object as Group);
  }
}
