import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder, VoxelGrid } from '../../voxel/VoxelBuilder';
import type { HeightField } from '../heightfield';

/**
 * Angkor Wat's mason: one 1 m block grid for the whole temple, in
 * map metres. Cells sit on whole metres: cell (x, y, z) is centred on x and z
 * and spans y … y + 1, so the temple's axis (x = 0) runs through the middle of
 * a row of blocks and every symmetric piece is an odd number of blocks wide
 * (a tower ends in one block). Buried cells are dropped on commit, so pieces
 * are filled solid and only their shells become blocks.
 */

/** Ground of the sanctuary's pad (m). */
export const PAD_Y = 56;

/** What a block is: picks the family and a few close colours. */
export type Tone =
  /** Dressed sandstone: walls, towers, terrace faces. */
  | 'face'
  /** Cornices, lintels, stair treads: a lighter stone that catches the light. */
  | 'ledge'
  /** Inner walls seen through the colonnades (in the gallery's shade). */
  | 'inner'
  /** Gallery roofs: weathered, greyer stone. */
  | 'roof'
  | 'ridge'
  /** False doors and deep niches. */
  | 'shadow'
  /** Open doorways and windows: dark. */
  | 'void'
  /** Lotus-bud tips of the towers. */
  | 'bud'
  | 'moss'
  | 'leaf'
  | 'bark';

interface ToneDef {
  mat: VoxelMaterialKey;
  colors: readonly number[];
  /** Warmer and brighter high up (the tower tops catch the low sun). */
  warm?: boolean;
}

// Weathered grey-brown sandstone (sRGB): the low sun and the soft rim of
// mapStone add the gold on the lit faces.
const TONES: Record<Tone, ToneDef> = {
  face: { mat: 'mapStone', colors: [0x847667, 0x7b6e60, 0x8c7d6d, 0x726659, 0x887969], warm: true },
  ledge: { mat: 'mapStone', colors: [0x9f8e79, 0x978772, 0xa69580], warm: true },
  inner: { mat: 'mapStone', colors: [0x4e443b, 0x483f37, 0x544940] },
  roof: { mat: 'mapStone', colors: [0x6f6357, 0x675b50, 0x76695c, 0x61564b], warm: true },
  ridge: { mat: 'mapStone', colors: [0x7e7163, 0x786b5e], warm: true },
  shadow: { mat: 'mapStone', colors: [0x3a322b, 0x352e28] },
  void: { mat: 'mapStone', colors: [0x17130f, 0x1c1713] },
  bud: { mat: 'mapStone', colors: [0xa8937a, 0xae997f, 0xa28d74], warm: true },
  moss: { mat: 'mapGrass', colors: [0x6c8634, 0x5f7d2e, 0x77913e, 0x587329] },
  leaf: { mat: 'mapLeaf', colors: [0x4c7628, 0x5a862e, 0x436a24, 0x669232] },
  bark: { mat: 'mapBark', colors: [0x6b4f36, 0x5f452f, 0x735640] },
};

/** Warmer stone high up (the tower tops catch the low sun): +0 at the galleries, full at the central tower's top. */
function warmUp(c: number, y: number): number {
  const t = Math.min(1, Math.max(0, (y - 70) / 42));
  if (t === 0) return c;
  const r = Math.min(255, Math.round(((c >> 16) & 255) * (1 + 0.1 * t)));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * (1 + 0.03 * t)));
  const b = Math.round((c & 255) * (1 - 0.1 * t));
  return (r << 16) | (g << 8) | b;
}

/** A glowing box (lamp, lit doorway, flame): built by the glow pass, not as a voxel. */
export interface GlowBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: number;
  /** door: warm by day too · window: dark by day, lit at night · flame: small, flickers · shrine: a door behind a Buddha, softer at night (he stays in view) */
  kind: 'door' | 'window' | 'flame' | 'shrine';
}

export class Mason {
  readonly g: VoxelGrid;
  readonly glows: GlowBox[] = [];
  /** The code building now (set once per builder function: stack traces are slow). */
  src: SourceTrace | undefined;

  constructor(
    b: VoxelBuilder,
    readonly field: HeightField,
  ) {
    this.g = b.grid({ cell: 1, origin: [-0.5, PAD_Y, -0.5], mat: 'mapStone', jitter: 0.045, ao: 0.4, seed: 23 });
  }

  /** Colour of a tone at a cell (seeded: the same every build). */
  color(tone: Tone, x: number, y: number, z: number): number {
    const t = TONES[tone];
    const c = t.colors[Math.floor(hash3(x, y, z, 41) * t.colors.length)];
    return t.warm ? warmUp(c, y) : c;
  }

  put(x: number, y: number, z: number, tone: Tone): void {
    this.g.put(x, y - PAD_Y, z, { color: this.color(tone, x, y, z), mat: TONES[tone].mat, src: this.src });
  }

  has(x: number, y: number, z: number): boolean {
    return this.g.has(x, y - PAD_Y, z);
  }

  clear(x: number, y: number, z: number): void {
    this.g.delete(x, y - PAD_Y, z);
  }

  /** One layer of a square plan with stepped (redented) corners, half size `h`, `n` corner steps. */
  layer(cx: number, y: number, cz: number, h: number, n: number, tone: Tone | ((dx: number, dz: number) => Tone | null)): void {
    for (let dz = -h; dz <= h; dz++)
      for (let dx = -h; dx <= h; dx++) {
        if (!inPlan(dx, dz, h, h, n)) continue;
        const t = typeof tone === 'string' ? tone : tone(dx, dz);
        if (t) this.put(cx + dx, y, cz + dz, t);
      }
  }

  /** A rectangle layer (half sizes hx, hz) with `n` corner steps. */
  rect(cx: number, y: number, cz: number, hx: number, hz: number, n: number, tone: Tone | ((dx: number, dz: number) => Tone | null)): void {
    for (let dz = -hz; dz <= hz; dz++)
      for (let dx = -hx; dx <= hx; dx++) {
        if (!inPlan(dx, dz, hx, hz, n)) continue;
        const t = typeof tone === 'string' ? tone : tone(dx, dz);
        if (t) this.put(cx + dx, y, cz + dz, t);
      }
  }

  /** Ground under a column is lower than the pad (a stream crosses it). */
  wet(x: number, z: number): boolean {
    return this.field.heightAt(x, z) < PAD_Y - 0.5;
  }

  /** A glowing box (drawn by the lights pass, not as a block). */
  glow(box: GlowBox): void {
    this.glows.push(box);
  }

  /** Last touches, then emit the blocks: moss on low ledges, hidden undersides dropped. */
  commit(moss: (x: number, y: number, z: number) => number): void {
    const ground: [number, number, number][] = [];
    const g = this.g;
    g.forEach((i, j, k, cell) => {
      if (j === 0) ground.push([i, -1, k]);
      if (cell.mat !== 'mapStone' || g.has(i, j + 1, k)) return;
      const y = j + PAD_Y;
      if (hash3(i, j, k, 57) < moss(i, y, k)) {
        cell.color = this.color('moss', i, y, k);
        cell.mat = 'mapGrass';
      }
    });
    // Blocks resting on the pad: the ground below counts as solid (no hidden undersides).
    for (const [i, j, k] of ground) if (!g.has(i, j, k)) g.ghost(i, j, k);
    g.commit();
  }
}

/** A cell (dx, dz) inside a rectangle of half sizes hx, hz whose corners step in `n` times. */
export function inPlan(dx: number, dz: number, hx: number, hz: number, n: number): boolean {
  const a = hx - Math.abs(dx);
  const b = hz - Math.abs(dz);
  return a >= 0 && b >= 0 && a + b >= n;
}
