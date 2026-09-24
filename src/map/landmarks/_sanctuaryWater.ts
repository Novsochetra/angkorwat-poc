import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshStandardMaterial } from 'three';
import type { MapFrame } from '../types';

/**
 * Angkor Wat's moat and reflecting pools: flat water in stone basins on the
 * pad (the kerbs are voxels, see sanctuary.ts). One mesh, one material; the
 * colour follows the time of day.
 */

export interface Pool {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// Between the shallow and deep tones of the rivers (water.ts), so the pools match them.
const DAY = new Color(0x2f9aa3);
const NIGHT = new Color(0x1a3f6c);

export function buildPools(pools: Pool[], y: number): { mesh: Mesh; update(f: MapFrame): void } {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const p of pools) {
    const n = pos.length / 3;
    pos.push(p.x0, y, p.z0, p.x1, y, p.z0, p.x1, y, p.z1, p.x0, y, p.z1);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const mat = new MeshStandardMaterial({ color: DAY.clone(), roughness: 0.18, metalness: 0 });
  const mesh = new Mesh(geo, mat);
  mesh.name = 'angkor:pools';
  mesh.receiveShadow = true;
  return {
    mesh,
    update(f: MapFrame) {
      mat.color.copy(DAY).lerp(NIGHT, f.night);
    },
  };
}
