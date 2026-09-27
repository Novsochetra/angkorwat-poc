import { BufferAttribute, BufferGeometry, Color, CubeTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { SKY } from '../sky/palette';
import { buddhaStatue } from './buddha';
import { FIGURES, figureTextures, GABLE, GABLE_NICHE, gableTextures, type GableArt, type GableArtSpec, type GableFigure } from './kbach';

/**
 * A pagoda's gable: the triangle under the roof's end as a painted panel,
 * gold kbach on red lacquer (kbach.ts: carved and gilded, no glass mosaic),
 * lit like the rest of the map (fog, shadows, the sun and the sky) with its
 * gold a little metallic and raised (bump), and softly lit by lamps at
 * night. In its middle (`figure`): a deep niche with a sculpted gilt Buddha
 * in meditation in high relief (buddha.ts, pressed to a third of his depth),
 * or Brahma's four faces under a broad tiered crown between two kneeling
 * tep prânâm, painted on a sharper panel of their own just before it.
 *
 * The panel follows the roof's stepped outline: `steps` lists, from the
 * outside in, where each step of the roof starts (|x| from the axis) and
 * how high the panel reaches under it, and the panel runs `tuck` m further
 * up into the roof so no gap shows under the barge boards.
 */

export interface GableSpec {
  /** From the outside in: [|x| from the axis where a step starts (m), top of the panel under it (m over the foot)]. The last runs to the axis. */
  steps: readonly (readonly [number, number])[];
  /** The painted triangle (m over the foot): its sides from (±half, foot) up to (0, apex). */
  half: number;
  foot: number;
  apex: number;
  /** How far the panel runs up into the roof (m, default 0.25). */
  tuck?: number;
}

export interface GablePlace {
  /** The middle of the panel's foot (world m). */
  x: number;
  y: number;
  z: number;
  /** The way the painted face looks along z. */
  facing: 1 | -1;
}

/** How bright the gold's lamps are at night (emissive), and how much of the sky the gold mirrors by day. */
const LAMPS = 0.45;
const MIRROR = 0.9;
/** The sky's fill light by day (linear luminance × intensity), to scale the mirrored sky by. */
const DAY_FILL = 0.64;

/** The mirrored sky's colour and strength now (the sky's fill light, as a share of the day's). */
const envTint = { value: new Color(1, 1, 1) };
const _c = new Color();

const materials = new Map<string, MeshStandardMaterial>();

let env: CubeTexture | null = null;

/**
 * What the gold mirrors out of doors (six 32 px canvases): a pale warm sky
 * above, a sunlit haze at the horizon, the warm stone of the terrace below.
 * Three blurs it for the rough gold (PMREM) on first use.
 */
function outdoorEnv(): CubeTexture {
  if (env) return env;
  const S = 32;
  const faces: HTMLCanvasElement[] = [];
  // Order: +x, −x, +y, −y, +z, −z.
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d')!;
    if (f === 2 || f === 3) {
      g.fillStyle = f === 2 ? '#f6eee0' : '#7a6a56';
      g.fillRect(0, 0, S, S);
    } else {
      const v = g.createLinearGradient(0, 0, 0, S);
      v.addColorStop(0, '#eee8dc');
      v.addColorStop(0.47, '#f2dcb4');
      v.addColorStop(0.53, '#c4b294');
      v.addColorStop(1, '#8a7860');
      g.fillStyle = v;
      g.fillRect(0, 0, S, S);
    }
    faces.push(c);
  }
  env = new CubeTexture(faces);
  env.colorSpace = SRGBColorSpace;
  env.needsUpdate = true;
  env.name = 'gable sky';
  return env;
}

/** The canvas extent and the triangle for a spec, and the figure in its middle. */
function artSpec(spec: GableSpec, figure: GableFigure = 'buddha'): GableArtSpec {
  const tuck = spec.tuck ?? 0.25;
  const top = Math.max(...spec.steps.map((s) => s[1])) + tuck;
  const width = spec.steps[0][0] * 2;
  // (the canvas as tall as half its width, if that covers the panel: square pixels in 1024 × 512)
  return { width, height: Math.max(top, width / 2), half: spec.half, foot: spec.foot, apex: spec.apex, ...(figure === 'buddha' ? {} : { figure }) };
}

/** The lit material for a gable (one per spec and figure). */
export function gableMaterial(spec: GableSpec, figure: GableFigure = 'buddha'): MeshStandardMaterial {
  const art = artSpec(spec, figure);
  const key = JSON.stringify(art);
  const had = materials.get(key);
  if (had) return had;
  const m = giltMaterial(gableTextures(art), 'gable', false);
  materials.set(key, m);
  return m;
}

/** The lit material of a `brahma` gable's figures (a cut-out over the gable; one for all). */
function figureMaterial(): MeshStandardMaterial {
  const had = materials.get('figures');
  if (had) return had;
  const m = giltMaterial(figureTextures(), 'gable figures', true);
  materials.set('figures', m);
  return m;
}

/** Gold on lacquer from painted maps, lit out of doors (see the file's note); `cut`: clear where nothing is painted. */
function giltMaterial(t: GableArt, name: string, cut: boolean): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    map: t.map,
    bumpMap: t.relief,
    bumpScale: 2.2,
    roughnessMap: t.relief,
    metalnessMap: t.relief,
    roughness: 1,
    metalness: 1,
    envMap: outdoorEnv(),
    envMapIntensity: MIRROR,
    emissiveMap: t.glow,
    emissive: new Color(1, 0.62, 0.3),
    emissiveIntensity: 0,
    alphaTest: cut ? 0.5 : 0,
  });
  m.name = name;
  // The mirrored sky follows the sky's own light (dim and blue at night); it lights the lacquer only a little (the sky light already does).
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uEnvTint = envTint;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uEnvTint;').replace(
      '#include <lights_fragment_maps>',
      `#include <lights_fragment_maps>
#if defined( RE_IndirectSpecular )
radiance *= uEnvTint;
#endif
iblIrradiance *= 0.2 * uEnvTint;`,
    );
  };
  m.customProgramCacheKey = () => (cut ? 'gable-cut-1' : 'gable-1');
  return m;
}

/** Sets the material for the time of day: the mirrored sky as bright as the sky's light (a little of its hue), the lamps on at night. */
function light(m: MeshStandardMaterial): void {
  const n = SKY.night;
  if (SKY.fillIntensity > 0) {
    // (the fill's hue, a third of the way from white, at its brightness)
    _c.copy(SKY.fillSky);
    const lum = 0.2126 * _c.r + 0.7152 * _c.g + 0.0722 * _c.b;
    const k = (lum * SKY.fillIntensity) / DAY_FILL;
    _c.multiplyScalar(1 / Math.max(lum, 1e-4));
    envTint.value.setRGB(1, 1, 1).lerp(_c, 0.33).multiplyScalar(Math.min(1.3, k));
  } else envTint.value.setScalar(1 - 0.8 * n);
  m.emissiveIntensity = LAMPS * n * n;
}

export interface GableOptions {
  /**
   * What the gable shows in its middle: `buddha` (default) a niche under a
   * flame arch with a sculpted gilt Buddha in high relief; `brahma` Brahma's
   * four faces (three seen) under a broad tiered crown, in a halo of flames,
   * on a lotus — the Bayon's faces, painted in raised gold (kbach.ts).
   */
  figure?: GableFigure;
  /** The relief Buddha's height (m, from his throne's foot to the top of his head; default: to fit the niche; none with `brahma`), 0 for none. */
  buddha?: number;
  /** How deep he is pressed (share of a statue's depth, default 0.32). */
  depth?: number;
  /** Sculpt him now rather than in a worker (for the preview). */
  sync?: boolean;
}

/**
 * A gable for `spec`, its foot's middle at `at`, looking toward `at.facing`
 * (z): the painted panel and its figure (the relief Buddha in its niche, or
 * Brahma's panel). Casts and takes shadows.
 */
export function gable(spec: GableSpec, at: GablePlace, o: GableOptions = {}): Group {
  const g = new Group();
  g.name = 'gable';
  g.position.set(at.x, at.y, at.z);
  g.rotation.y = at.facing > 0 ? 0 : Math.PI;
  const figure = o.figure ?? 'buddha';
  g.add(gablePanel(spec, { x: 0, y: 0, z: 0, facing: 1 }, figure));
  // The niche's foot and size on this panel.
  const sy = (spec.apex - spec.foot) / GABLE.height;
  if (figure === 'brahma') {
    // The figures: their own sharper panel just before the gable's (a cut-out), on its lotus band.
    const sx = spec.half / GABLE.half;
    const fig = new Mesh(new PlaneGeometry(FIGURES.w * sx, FIGURES.h * sy), figureMaterial());
    fig.name = 'gable figures';
    fig.position.set(0, spec.foot + (FIGURES.y + FIGURES.h / 2) * sy, 0.012);
    fig.receiveShadow = true;
    fig.onBeforeRender = () => light(fig.material as MeshStandardMaterial);
    g.add(fig);
  }
  // (the top of his head reaching four fifths of the way up the niche)
  const height = o.buddha ?? (figure === 'buddha' ? GABLE_NICHE.tip * sy * GABLE_NICHE.figure : 0);
  if (height > 0) {
    const depth = o.depth ?? 0.32;
    const b = buddhaStatue({ kind: 'meditate', look: 'gilt', height, near: 30, hide: 250, sync: o.sync });
    b.scale.z = depth;
    // (a statue is ≈ 0.67 of its height deep, half of it behind its axis: his back sunk 6 cm into the panel)
    b.position.set(0, spec.foot + GABLE_NICHE.y * sy, height * 0.335 * depth - 0.06);
    g.add(b);
  }
  g.updateMatrixWorld(true);
  return g;
}

/**
 * The painted panel alone for `spec`, its foot's middle at `at`, painted
 * face toward `at.facing` (z), `figure` in its middle. Casts and takes shadows.
 */
export function gablePanel(spec: GableSpec, at: GablePlace, figure: GableFigure = 'buddha'): Mesh {
  const art = artSpec(spec, figure);
  const tuck = spec.tuck ?? 0.25;
  // Columns: each step of the roof on each side, and the middle.
  const cols: [number, number, number][] = [];
  const s = spec.steps;
  for (let i = 0; i < s.length; i++) {
    const outer = s[i][0];
    const inner = i + 1 < s.length ? s[i + 1][0] : 0;
    const top = s[i][1] + tuck;
    if (inner > 0) {
      cols.push([-outer, -inner, top]);
      cols.push([inner, outer, top]);
    } else cols.push([-outer, outer, top]);
  }
  const pos = new Float32Array(cols.length * 12);
  const uv = new Float32Array(cols.length * 8);
  const nor = new Float32Array(cols.length * 12);
  const idx: number[] = [];
  cols.forEach(([x0, x1, top], c) => {
    const corners = [
      [x0, 0],
      [x1, 0],
      [x1, top],
      [x0, top],
    ];
    corners.forEach(([x, y], k) => {
      pos.set([x, y, 0], (c * 4 + k) * 3);
      nor.set([0, 0, 1], (c * 4 + k) * 3);
      uv.set([x / art.width + 0.5, y / art.height], (c * 4 + k) * 2);
    });
    const b = c * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const m = gableMaterial(spec, figure);
  const mesh = new Mesh(g, m);
  mesh.name = 'gable';
  mesh.position.set(at.x, at.y, at.z);
  // (turned half round to face −z: its left is then the viewer's left still)
  mesh.rotation.y = at.facing > 0 ? 0 : Math.PI;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.onBeforeRender = () => light(m);
  mesh.updateMatrixWorld();
  return mesh;
}
