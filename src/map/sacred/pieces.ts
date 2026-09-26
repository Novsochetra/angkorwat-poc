import type { Object3D } from 'three';

/**
 * What the preview page (`sacred.html?piece=<name>`, preview.ts) can show.
 * Each `*.pieces.ts` file under `src/map/sacred/` exports `PIECES`: a name
 * → a maker of the piece standing on y = 0 at the origin, facing +z.
 */
export interface Piece {
  object: Object3D;
  /** Width and height (m), to frame it. */
  size: [number, number];
  /** Shown under the name (block or triangle counts, build time…). */
  note?: string;
}

export type PieceMaker = () => Piece;

const modules = import.meta.glob<{ PIECES: Record<string, PieceMaker> }>('./**/*.pieces.ts', { eager: true });

export const PIECES: Record<string, PieceMaker> = Object.assign({}, ...Object.values(modules).map((m) => m.PIECES));
