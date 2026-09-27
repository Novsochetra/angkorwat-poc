import type { SubjectKind } from '../types';
import { FISH_KINDS, fishModel, shade, type FishKind } from './_fishKinds';

/**
 * The nature book's picture of a fish he caught (its page fills with the
 * catch, not a photo): a naturalist's plate in pixel art — the fish from its
 * left flank, cell by cell from its own voxel model (_fishKinds.ts), lit from
 * above, outlined in ink, over a wash of lake water on the album's paper.
 * Drawn on a canvas the first time it is asked for (a JPEG data URL, the
 * size of the book's pictures), then kept.
 */

/** The picture's size (px, 4:3, as the book's photos: _book.ts). */
const W = 240;
const H = 180;
const plates = new Map<FishKind, string>();

/** The drawn picture of a caught fish's page (a data URL), or '' for anything that is not one of the fish. */
export function fishPlate(kind: SubjectKind): string {
  if (!(FISH_KINDS as readonly string[]).includes(kind)) return '';
  const k = kind as FishKind;
  let url = plates.get(k);
  if (url === undefined) plates.set(k, (url = draw(k)));
  return url;
}

function draw(kind: FishKind): string {
  try {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    if (!g) return '';
    // Paper, then the water: a soft band of wash with a wavy top, darker down, a few ripple strokes.
    g.fillStyle = '#efe5cf';
    g.fillRect(0, 0, W, H);
    const top = H * 0.5;
    const wash = g.createLinearGradient(0, top, 0, H);
    wash.addColorStop(0, 'rgba(126, 170, 176, 0.55)');
    wash.addColorStop(1, 'rgba(62, 112, 128, 0.75)');
    g.fillStyle = wash;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, top + Math.sin(x * 0.07) * 3 + Math.sin(x * 0.19 + 1) * 1.5);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(240, 248, 246, 0.55)';
    g.lineWidth = 1;
    for (const [x, y, w] of RIPPLES) {
      g.beginPath();
      g.moveTo(x * W, y * H);
      g.lineTo(x * W + w, y * H);
      g.stroke();
    }

    // The fish from its left flank (the outermost cell of each column and row), snout to the left.
    const m = fishModel(kind);
    const seen = new Map<number, { k: number; color: number }>();
    for (const cl of m.cells) {
      const id = (cl.i + 2) * 64 + (cl.j + 32);
      const o = seen.get(id);
      if (!o || cl.k > o.k) seen.set(id, { k: cl.k, color: cl.color });
    }
    const cols = m.n + 3;
    const rows = m.jMax - m.jMin + 1;
    const p = Math.max(3, Math.floor(Math.min((W - 30) / cols, (H * 0.62) / rows)));
    // (cell i, j at x0 + i·p, y0 + (jMax − j)·p; the barbels stand at i = −1)
    const x0 = Math.round((W - cols * p) / 2) + p;
    const y0 = Math.round(H * 0.47 - (rows * p) / 2);
    const has = (i: number, j: number) => seen.has((i + 2) * 64 + (j + 32));
    // (its shadow on the water)
    g.fillStyle = 'rgba(28, 52, 60, 0.28)';
    g.beginPath();
    g.ellipse(W / 2, y0 + rows * p + p * 1.4, cols * p * 0.36, p * 1.3, 0, 0, Math.PI * 2);
    g.fill();
    // (ink outline: a cell's width round the fish)
    g.fillStyle = '#2b2622';
    for (const id of seen.keys()) {
      const i = Math.floor(id / 64) - 2;
      const j = (id % 64) - 32;
      g.fillRect(x0 + i * p - 1, y0 + (m.jMax - j) * p - 1, p + 2, p + 2);
    }
    for (const [id, cl] of seen) {
      const i = Math.floor(id / 64) - 2;
      const j = (id % 64) - 32;
      // Lit from above: the cells on the top edge lighter, those on the bottom edge darker.
      const k = !has(i, j + 1) ? 1.12 : !has(i, j - 1) ? 0.84 : 1;
      g.fillStyle = hex(shade(cl.color, k));
      g.fillRect(x0 + i * p, y0 + (m.jMax - j) * p, p, p);
    }
    // A glint on the wet back.
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    for (const [id] of seen) {
      const i = Math.floor(id / 64) - 2;
      const j = (id % 64) - 32;
      if (!has(i, j + 1) && i > m.n * 0.2 && i < m.n * 0.55 && i % 3 === 0) g.fillRect(x0 + i * p + 1, y0 + (m.jMax - j) * p + 1, Math.max(1, p - 3), Math.max(1, Math.floor(p / 3)));
    }
    return c.toDataURL('image/jpeg', 0.86);
  } catch {
    return '';
  }
}

/** Short ripple strokes on the wash (share of the width, of the height; px long). */
const RIPPLES: readonly [number, number, number][] = [
  [0.08, 0.84, 18],
  [0.3, 0.92, 26],
  [0.62, 0.86, 20],
  [0.8, 0.95, 16],
  [0.45, 0.78, 12],
];

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
