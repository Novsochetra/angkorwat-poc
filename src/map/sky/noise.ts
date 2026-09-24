import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';
import { hash3 } from '../../voxel/random';

/**
 * A tiling noise texture for mist and sky clouds: four channels of smooth
 * fractal value noise (different seeds and sizes), all repeating every
 * `size` texels. Built once (seeded: the same every run).
 *  - r: soft big shapes (4 cells across), g: medium (8), b: fine (16),
 *  - a: billowy (|noise| folded, 6 cells) for puffy edges.
 */
let cached: DataTexture | null = null;

export function mistNoiseTexture(): DataTexture {
  if (cached) return cached;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const layer = (cells: number, seed: number, octaves: number, billow: boolean) => {
    const out = new Float32Array(size * size);
    let norm = 0;
    let amp = 1;
    for (let o = 0; o < octaves; o++) {
      const period = cells << o;
      const step = size / period;
      for (let y = 0; y < size; y++) {
        const fy = y / step;
        const y0 = Math.floor(fy);
        const ty = fy - y0;
        const sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < size; x++) {
          const fx = x / step;
          const x0 = Math.floor(fx);
          const tx = fx - x0;
          const sx = tx * tx * (3 - 2 * tx);
          const v = (i: number, k: number) => hash3(((x0 + i) % period + period) % period, ((y0 + k) % period + period) % period, o, seed);
          const a = v(0, 0) + (v(1, 0) - v(0, 0)) * sx;
          const b = v(0, 1) + (v(1, 1) - v(0, 1)) * sx;
          let n = a + (b - a) * sy;
          if (billow) n = 1 - Math.abs(n * 2 - 1);
          out[x + y * size] += n * amp;
        }
      }
      norm += amp;
      amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    // Stretch to 0‥1 (fractal noise bunches around the middle).
    let lo = 1;
    let hi = 0;
    for (const v of out) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo || 1);
    return out;
  };
  const channels = [layer(4, 11, 4, false), layer(8, 23, 4, false), layer(16, 37, 3, false), layer(6, 51, 4, true)];
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(channels[c][i] * 255);
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.name = 'mist noise';
  cached = tex;
  return tex;
}
