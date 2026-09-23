import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { PALETTE } from '../palette';
import { FACE_COLUMNS, FACE_LAYER, FACE_ROWS, HEAD, HEAD_GRID } from './head';

/**
 * Face: the 4 × 4 block patch of the head front that holds eyes, blush and lids,
 * plus thin "decal" blocks for brows, nose and mouth. Expressions follow the
 * "3.4 Facial Expressions" row of the character sheet.
 */
export const EXPRESSIONS = ['neutral', 'happy', 'determined', 'surprised', 'curious', 'focused'] as const;
export type ExpressionName = (typeof EXPRESSIONS)[number];

type MouthShape = 'smile' | 'grin' | 'flat' | 'o' | 'smallO';
type LidDecal = 'none' | 'arc' | 'lash';

interface ExpressionDef {
  /**
   * Block codes for rows y = 24.4–25.4, 23.4–24.4, 22.4–23.4, 21.4–22.4 (top → bottom).
   * Each row lists the columns x = −3, −2, 2, 3 (character's right eye first).
   * s skin · w eye white · k pupil · b blush · l eyelid
   */
  cells: readonly [string, string, string, string];
  browRight: { dy: number; tilt: number };
  browLeft: { dy: number; tilt: number };
  mouth: MouthShape;
  lids: LidDecal;
}

const DEFS: Record<ExpressionName, ExpressionDef> = {
  neutral: {
    cells: ['ssss', 'wkkw', 'wkkw', 'bssb'],
    browRight: { dy: 0, tilt: 0.04 },
    browLeft: { dy: 0, tilt: 0.04 },
    mouth: 'smile',
    lids: 'none',
  },
  happy: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: 0.2, tilt: -0.1 },
    browLeft: { dy: 0.2, tilt: -0.1 },
    mouth: 'grin',
    lids: 'arc',
  },
  determined: {
    cells: ['ssss', 'wkkw', 'wkkw', 'ssss'],
    browRight: { dy: -0.22, tilt: 0.3 },
    browLeft: { dy: -0.22, tilt: 0.3 },
    mouth: 'flat',
    lids: 'none',
  },
  surprised: {
    cells: ['wkkw', 'wkkw', 'wkkw', 'ssss'],
    browRight: { dy: 0.95, tilt: -0.12 },
    browLeft: { dy: 0.95, tilt: -0.12 },
    mouth: 'o',
    lids: 'none',
  },
  curious: {
    cells: ['ssss', 'wkwk', 'wkwk', 'bssb'],
    browRight: { dy: 0, tilt: 0.06 },
    browLeft: { dy: 0.45, tilt: -0.28 },
    mouth: 'smallO',
    lids: 'none',
  },
  focused: {
    cells: ['ssss', 'llll', 'wkkw', 'ssss'],
    browRight: { dy: -0.32, tilt: 0.16 },
    browLeft: { dy: -0.32, tilt: 0.16 },
    mouth: 'flat',
    lids: 'lash',
  },
};

const FRONT = HEAD.maxZ; // z of the face plane
const EYE_X = [-2.5, 2.5] as const;

export function buildFace(expression: ExpressionName, blink = false): VoxelBuilder {
  const def = DEFS[expression];
  const b = new VoxelBuilder();
  const P = PALETTE;
  const g = b.grid({ ...HEAD_GRID, mat: 'skin', jitter: 0.02, ao: 0, seed: 11 });
  // A blink closes whatever eye cells are open, keeping blush and lids.
  const closeRow = (row: string) => (blink ? row.replace(/[wk]/g, 's') : row);
  const rows = [...FACE_ROWS].reverse(); // top → bottom
  rows.forEach((j, r) => {
    const code = closeRow(def.cells[r]);
    FACE_COLUMNS.forEach((i, c) => {
      switch (code[c]) {
        case 'w':
          g.set(i, j, FACE_LAYER, P.eyeWhite, 'eye');
          break;
        case 'k':
          g.set(i, j, FACE_LAYER, P.eyeDark, 'eye');
          break;
        case 'b':
          g.set(i, j, FACE_LAYER, P.blush, 'skin');
          break;
        case 'l':
          g.set(i, j, FACE_LAYER, P.skin.shade, 'skin', 1.08);
          break;
        default:
          g.set(i, j, FACE_LAYER, P.skin.base, 'skin');
      }
    });
  });
  g.commit();

  const decal = (x: number, y: number, w: number, h: number, color: number, depth = 0.08, rz = 0, lift = 0) =>
    b.box(x, y, FRONT + depth / 2 - 0.012 + lift, w, h, depth, color, 'eye', { rz });

  // Closed-eye marks.
  const lids: LidDecal = blink && def.lids === 'none' ? 'lash' : def.lids;
  for (const cx of EYE_X) {
    if (lids === 'arc') {
      decal(cx - 0.52, 22.86, 0.72, 0.24, P.eyeDark, 0.08, 0.6);
      decal(cx + 0.52, 22.86, 0.72, 0.24, P.eyeDark, 0.08, -0.6);
      decal(cx, 23.1, 0.52, 0.24, P.eyeDark);
    } else if (lids === 'lash') {
      const y = blink && !def.cells[1].includes('l') ? 22.95 : 23.42;
      decal(cx, y, 1.9, 0.2, P.eyeDark);
      decal(cx + Math.sign(cx) * 1.05, y - 0.08, 0.32, 0.18, P.eyeDark, 0.08, Math.sign(cx) * -0.5);
    }
  }

  // Brows (thick, dark, sitting on the forehead; the bangs overlap them).
  const brow = (side: -1 | 1, dy: number, tilt: number) =>
    b.box(side * 2.5, 24.88 + dy, FRONT + 0.15, 2.1, 0.52, 0.3, P.brow, 'hair', { rz: side * tilt });
  brow(-1, def.browRight.dy, def.browRight.tilt);
  brow(1, def.browLeft.dy, def.browLeft.tilt);

  // Nose: a tiny raised block at eye-bottom height.
  b.box(0, 22.28, FRONT + 0.08, 0.46, 0.3, 0.18, P.skin.base, 'skin', { shade: 1.05 });

  // Mouth.
  const M = P.mouth;
  switch (def.mouth) {
    case 'smile':
      decal(0, 21.1, 0.8, 0.15, M);
      decal(-0.52, 21.16, 0.32, 0.15, M, 0.08, -0.42);
      decal(0.52, 21.16, 0.32, 0.15, M, 0.08, 0.42);
      break;
    case 'grin':
      decal(0, 21.02, 1.0, 0.2, M);
      decal(-0.64, 21.13, 0.4, 0.2, M, 0.08, -0.5);
      decal(0.64, 21.13, 0.4, 0.2, M, 0.08, 0.5);
      decal(0, 20.92, 0.62, 0.14, P.mouthDark, 0.06);
      break;
    case 'flat':
      decal(0, 21.1, 0.95, 0.14, M);
      break;
    case 'o':
      decal(0, 21.0, 0.64, 0.56, M);
      decal(0, 21.0, 0.36, 0.3, P.mouthDark, 0.08, 0, 0.02);
      break;
    case 'smallO':
      decal(0, 21.06, 0.42, 0.38, M);
      decal(0, 21.06, 0.2, 0.17, P.mouthDark, 0.08, 0, 0.02);
      break;
  }
  return b;
}
