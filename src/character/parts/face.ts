import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { PALETTE } from '../palette';
import { FACE_COLUMNS, FACE_LAYER, FACE_ROWS, HEAD, HEAD_GRID, skullHas } from './head';

/**
 * Face: the 4 × 4 block patch of the head front that holds eyes, blush and lids,
 * plus thin "decal" blocks for brows, nose and mouth. Expressions follow the
 * "3.4 Facial Expressions" row of the character sheet.
 */
export const EXPRESSIONS = ['neutral', 'happy', 'determined', 'surprised', 'curious', 'focused'] as const;
export type ExpressionName = (typeof EXPRESSIONS)[number];
/**
 * Faces while eating and drinking (character/meals.ts; not in the X cycle):
 * `bite` the mouth wide open for the food (teeth showing), `chew` / `chew2`
 * chewing with the eyes shut happily (the mouth a squiggle one way then the
 * other, a cheek puffed on alternate sides), `look` / `look2` chewing while
 * looking at what he eats, `sip` lips round the straw, eyes shut, `ahh` the
 * satisfied breath after a drink, `yum` a big grin licking his lips.
 */
export const MEAL_FACES = ['bite', 'chew', 'chew2', 'look', 'look2', 'sip', 'ahh', 'yum'] as const;
export type MealFaceName = (typeof MEAL_FACES)[number];
/**
 * Every face that can be built: the expressions, asleep (eyes closed in
 * soft downward curves, brows relaxed, the mouth a little open; not in the
 * X cycle: `AngkorExplorer.asleep` shows it), and the meals' faces.
 */
export type FaceName = ExpressionName | 'asleep' | MealFaceName;

type MouthShape = 'smile' | 'grin' | 'flat' | 'o' | 'smallO' | 'wide' | 'chewA' | 'chewB' | 'pout' | 'lick';
type LidDecal = 'none' | 'arc' | 'lash' | 'sleep' | 'shut';

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

const DEFS: Record<FaceName, ExpressionDef> = {
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
    cells: ['ssss', 'wkkw', 'wkkw', 'ssss'],
    browRight: { dy: 0.5, tilt: -0.12 },
    browLeft: { dy: 0.5, tilt: -0.12 },
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
  asleep: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: -0.1, tilt: -0.08 },
    browLeft: { dy: -0.1, tilt: -0.08 },
    mouth: 'smallO',
    lids: 'sleep',
  },
  bite: {
    cells: ['ssss', 'wkkw', 'wkkw', 'bssb'],
    browRight: { dy: 0.28, tilt: -0.1 },
    browLeft: { dy: 0.28, tilt: -0.1 },
    mouth: 'wide',
    lids: 'none',
  },
  chew: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: 0.12, tilt: -0.08 },
    browLeft: { dy: 0.12, tilt: -0.08 },
    mouth: 'chewA',
    lids: 'arc',
  },
  chew2: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: 0.16, tilt: -0.1 },
    browLeft: { dy: 0.16, tilt: -0.1 },
    mouth: 'chewB',
    lids: 'arc',
  },
  look: {
    cells: ['ssss', 'wkkw', 'wkkw', 'bssb'],
    browRight: { dy: 0.05, tilt: 0.02 },
    browLeft: { dy: 0.3, tilt: -0.2 },
    mouth: 'chewA',
    lids: 'none',
  },
  look2: {
    cells: ['ssss', 'wkkw', 'wkkw', 'bssb'],
    browRight: { dy: 0.05, tilt: 0.02 },
    browLeft: { dy: 0.3, tilt: -0.2 },
    mouth: 'chewB',
    lids: 'none',
  },
  sip: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: 0.1, tilt: -0.06 },
    browLeft: { dy: 0.1, tilt: -0.06 },
    mouth: 'pout',
    lids: 'shut',
  },
  ahh: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: 0.34, tilt: -0.14 },
    browLeft: { dy: 0.34, tilt: -0.14 },
    mouth: 'o',
    lids: 'arc',
  },
  yum: {
    cells: ['ssss', 'ssss', 'ssss', 'bssb'],
    browRight: { dy: 0.24, tilt: -0.12 },
    browLeft: { dy: 0.24, tilt: -0.12 },
    mouth: 'lick',
    lids: 'arc',
  },
};

const FRONT = HEAD.maxZ; // z of the face plane
const EYE_X = [-2.5, 2.5] as const;

export function buildFace(expression: FaceName, blink = false): VoxelBuilder {
  const def = DEFS[expression];
  const b = new VoxelBuilder();
  const P = PALETTE;
  const g = b.grid({ ...HEAD_GRID, mat: 'face', jitter: 0.008, ao: 0, seed: 11 });
  // A blink closes whatever eye cells are open, keeping blush and lids.
  const closeRow = (row: string) => (blink ? row.replace(/[wk]/g, 's') : row);
  const rows = [...FACE_ROWS].reverse(); // top → bottom
  const seen = new Set<string>(); // columns whose eye has started (upper row done)
  const pupils: { x0: number; x1: number; y: number; color: number }[] = [];
  rows.forEach((j, r) => {
    const code = closeRow(def.cells[r]);
    FACE_COLUMNS.forEach((i, c) => {
      const ch = code[c];
      const upper = (ch === 'w' || ch === 'k') && !seen.has(`${ch}${c}`);
      if (ch === 'w' || ch === 'k') seen.add(`${ch}${c}`);
      switch (ch) {
        case 'w':
          g.set(i, j, FACE_LAYER, upper ? P.eyeWhiteShade : P.eyeWhite, 'eye');
          break;
        case 'k': {
          // Pupils are ~1.4 blocks wide on the sheet: a block that reaches past
          // its cell, away from the white of the same eye.
          const [x, y] = g.center(i, j, FACE_LAYER);
          const partner = code[c ^ 1];
          const dir = partner === 'w' ? Math.sign(x - g.center(FACE_COLUMNS[c ^ 1], j, FACE_LAYER)[0]) : 0;
          pupils.push({ x0: x - 0.5 + Math.min(dir, 0) * 0.38, x1: x + 0.5 + Math.max(dir, 0) * 0.38, y, color: upper ? P.eyeDark : P.eyeDarkLow });
          g.ghost(i, j, FACE_LAYER);
          break;
        }
        case 'b':
          g.set(i, j, FACE_LAYER, P.blush, 'face');
          break;
        case 'l':
          g.set(i, j, FACE_LAYER, P.skin.shade, 'face', 1.08);
          break;
        default:
          g.set(i, j, FACE_LAYER, P.skin.base, 'face');
      }
    });
  });
  // The surrounding head as ghosts, so the face cells know which sides are covered
  // (the seamless face material merges them with the head).
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 8; j++)
      for (let k = 0; k <= 8; k++) {
        if (g.has(i, j, k)) continue;
        const [x, y, z] = g.center(i, j, k);
        if (skullHas(x, y, z)) g.ghost(i, j, k);
      }
  g.commit();

  const decal = (x: number, y: number, w: number, h: number, color: number, depth = 0.08, rz = 0, lift = 0) =>
    b.box(x, y, FRONT + depth / 2 - 0.012 + lift, w, h, depth, color, 'eye', { rz });

  // Pupil blocks sit a hair proud of the face so their overhang covers the skin.
  for (const p of pupils) b.span(p.x0, p.y - 0.5, FRONT - 1, p.x1, p.y + 0.5, FRONT + 0.014, p.color, 'eye');

  // Closed-eye marks.
  const lids: LidDecal = blink && def.lids === 'none' ? 'lash' : def.lids;
  for (const cx of EYE_X) {
    if (lids === 'arc') {
      decal(cx - 0.52, 22.86, 0.72, 0.24, P.eyeDark, 0.08, 0.6);
      decal(cx + 0.52, 22.86, 0.72, 0.24, P.eyeDark, 0.08, -0.6);
      decal(cx, 23.1, 0.52, 0.24, P.eyeDark);
    } else if (lids === 'sleep') {
      // (closed and at rest: a curve bowed down, lashes at the outer end)
      decal(cx - 0.5, 23.0, 0.72, 0.22, P.eyeDark, 0.08, -0.45);
      decal(cx + 0.5, 23.0, 0.72, 0.22, P.eyeDark, 0.08, 0.45);
      decal(cx, 22.78, 0.56, 0.22, P.eyeDark);
      decal(cx + Math.sign(cx) * 1.02, 22.92, 0.3, 0.16, P.eyeDark, 0.08, Math.sign(cx) * 0.6);
    } else if (lids === 'shut') {
      // (shut and at ease: a flat line, a little low, the lashes out at the end)
      decal(cx, 22.9, 1.7, 0.2, P.eyeDark);
      decal(cx + Math.sign(cx) * 0.95, 22.98, 0.3, 0.16, P.eyeDark, 0.08, Math.sign(cx) * 0.5);
    } else if (lids === 'lash') {
      const y = blink && !def.cells[1].includes('l') ? 22.95 : 23.42;
      decal(cx, y, 1.9, 0.2, P.eyeDark);
      decal(cx + Math.sign(cx) * 1.05, y - 0.08, 0.32, 0.18, P.eyeDark, 0.08, Math.sign(cx) * -0.5);
    }
  }

  // Brows: thick bars well above the eyes. The fringe hides the right one, as on
  // the sheet; the left one shows under the high hairline.
  const brow = (side: -1 | 1, dy: number, tilt: number) =>
    b.box(side * 2.5, 25.49 + dy, FRONT + 0.15, 2.2, 0.9, 0.3, P.brow, 'hair', { rz: side * tilt });
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
    case 'wide':
      // (open for a bite: the top teeth showing)
      decal(0, 20.98, 1.02, 0.74, M);
      decal(0, 20.95, 0.76, 0.5, P.mouthDark, 0.08, 0, 0.02);
      decal(0, 21.14, 0.62, 0.14, 0xf6f1ea, 0.08, 0, 0.04);
      break;
    case 'chewA':
    case 'chewB': {
      // (a squiggle, one way then the other, and the cheek on that side puffed out)
      const s = def.mouth === 'chewA' ? 1 : -1;
      decal(s * 0.2, 21.14, 0.46, 0.16, M, 0.08, s * 0.3);
      decal(-s * 0.22, 21.04, 0.46, 0.16, M, 0.08, -s * 0.3);
      b.box(s * 1.95, 21.4, FRONT + 0.06, 1.2, 1.0, 0.16, P.skin.warm, 'skin', { shade: 0.98 });
      decal(s * 1.95, 21.45, 0.8, 0.5, P.blush, 0.08, 0, 0.09);
      break;
    }
    case 'pout':
      // (lips round the straw)
      decal(0, 21.05, 0.5, 0.46, M);
      decal(0, 21.05, 0.24, 0.22, P.mouthDark, 0.08, 0, 0.02);
      break;
    case 'lick':
      // (a big grin, the tongue out at one corner licking his lips)
      decal(0, 21.02, 1.0, 0.2, M);
      decal(-0.64, 21.13, 0.4, 0.2, M, 0.08, -0.5);
      decal(0.64, 21.13, 0.4, 0.2, M, 0.08, 0.5);
      decal(0, 20.92, 0.62, 0.14, P.mouthDark, 0.06);
      decal(0.5, 20.84, 0.42, 0.34, 0xe8747a, 0.1, 0.2, 0.03);
      break;
  }
  return b;
}
