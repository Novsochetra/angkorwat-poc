import { CanvasTexture, MeshStandardMaterial, NearestFilter, SRGBColorSpace } from 'three';

/**
 * The flag of Cambodia, as a colour at any point of it: blue, a red band
 * twice as tall in the middle, and Angkor Wat in white on the red (three
 * towers seen from the front, the middle one tallest, two lower ones at the
 * ends, galleries and a stepped base).
 *
 * `u` runs 0‥1 from the hoist (left) to the fly (right), `v` 0‥1 from top to
 * bottom. The flag is `FLAG_ASPECT` times as wide as it is tall. For voxel
 * grids use `flagCell` (the colour most of a cell shows, the temple kept
 * visible even when it only fills part of a cell); for a flat panel,
 * `flagTexture` or `flagMaterial`.
 *
 * Colours are sRGB hex, the flag's official ones.
 */

export const FLAG_BLUE = 0x032ea1;
export const FLAG_RED = 0xe00025;
export const FLAG_WHITE = 0xffffff;
/** Width : height. */
export const FLAG_ASPECT = 25 / 16;

/** The red band (v). */
const RED = [0.25, 0.75] as const;

/** Spires: centre (u), half width at the foot (u), foot and tip (v). */
const TOWERS: readonly (readonly [number, number, number, number])[] = [
  [0.5, 0.045, 0.56, 0.3],
  [0.415, 0.032, 0.57, 0.39],
  [0.585, 0.032, 0.57, 0.39],
  [0.338, 0.026, 0.59, 0.47],
  [0.662, 0.026, 0.59, 0.47],
];
/** Flat parts: galleries and the stepped base (u0, u1, v0, v1). */
const BLOCKS: readonly (readonly [number, number, number, number])[] = [
  [0.36, 0.64, 0.5, 0.57],
  [0.32, 0.68, 0.57, 0.65],
  [0.3, 0.7, 0.65, 0.7],
];

/** (u, v) is on the white temple. */
export function onTemple(u: number, v: number): boolean {
  for (const [u0, u1, v0, v1] of BLOCKS) if (u >= u0 && u <= u1 && v >= v0 && v <= v1) return true;
  for (const [c, hw, foot, tip] of TOWERS) {
    if (v < tip || v > foot) continue;
    // (a spire: wide and round-shouldered low down, a point at the top)
    const k = (v - tip) / (foot - tip);
    if (Math.abs(u - c) <= hw * Math.pow(k, 0.55)) return true;
  }
  return false;
}

/** The flag's colour at (u, v). */
export function flagColor(u: number, v: number): number {
  if (v < RED[0] || v > RED[1]) return FLAG_BLUE;
  return onTemple(u, v) ? FLAG_WHITE : FLAG_RED;
}

/**
 * The colour a cell of the flag from (u0, v0) to (u1, v1) shows: sampled
 * 4 × 4, the temple wins when it covers at least a third of the cell (so it
 * still reads on a coarse grid), else the band most of the cell is in.
 */
export function flagCell(u0: number, v0: number, u1: number, v1: number): number {
  let white = 0;
  let red = 0;
  let blue = 0;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const c = flagColor(u0 + ((i + 0.5) / 4) * (u1 - u0), v0 + ((j + 0.5) / 4) * (v1 - v0));
      if (c === FLAG_WHITE) white++;
      else if (c === FLAG_RED) red++;
      else blue++;
    }
  }
  if (white >= 6) return FLAG_WHITE;
  return red + white >= blue ? FLAG_RED : FLAG_BLUE;
}

let texture: CanvasTexture | null = null;
let material: MeshStandardMaterial | null = null;

/**
 * The flag as a texture, one for the whole page (made on first use): 125 × 80
 * pixels from `flagColor` (the flag's 25 : 16), crisp pixels up close, smooth
 * far off. Its top row is the flag's top (uv v = 1), its left column the
 * hoist (uv u = 0).
 */
export function flagTexture(): CanvasTexture {
  if (texture) return texture;
  const w = 125;
  const h = 80;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = flagColor((x + 0.5) / w, (y + 0.5) / h);
      img.data.set([c >> 16, (c >> 8) & 255, c & 255, 255], (y * w + x) * 4);
    }
  g.putImageData(img, 0, 0);
  texture = new CanvasTexture(canvas);
  texture.name = 'flag';
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A lit material for a flag panel sewn on cloth (the hang glider's sail, the
 * parachute): the flag texture, as matte as the silk round it, drawn just in
 * front of the face it lies on. One for the whole page.
 */
export function flagMaterial(): MeshStandardMaterial {
  if (material) return material;
  material = new MeshStandardMaterial({ map: flagTexture(), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  material.name = 'flag';
  return material;
}
