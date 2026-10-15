import { KHMER_PAINT, MAT_BY_ID, type BlockMatKey } from '../blocks/kinds';
import { BLOCKS, rawColor, rawMat } from '../blocks/store';
import type { WordKey } from '../ui/lang';
import type { FootKind, FootPlan, FootStage } from './footPlan';
import { FOOTS, type FootRec } from './footState';

/**
 * Paint (AWP-22, build plan "Colours?": a limited Khmer palette first, no free
 * colour wheel): what painting does to the player's blocks (blocks/store.ts
 * `BLOCKS`), with no three.js. The mode (aiming, keys, the swatches) is the
 * add-on's, roam/_paint*.ts.
 *
 * - **Six colours** (blocks/kinds.ts `KHMER_PAINT`, in this order, keys 1‥6):
 *   lotus pink, saffron (the monks' robes), indigo, temple gold, lacquer red,
 *   coconut brown; and **its own colour** (7): the paint taken off.
 * - **A block keeps its material, shape and turn**: only its colour (store.ts
 *   `Block.color`) changes, so the block layer draws it with the same meshes and
 *   programs (a colour per instance), the walk map builds nothing again
 *   (store.ts `BlockChange.colourOnly`), and the save keeps it with the build
 *   (blocks/save.ts: the colour is part of the block's number).
 * - **Its own colour** is the one it was built with: a footprint building's
 *   block its plan's (build/footPlan.ts: the planks' and the weave's tones,
 *   `ownColour`), any other block its material's (`BLOCK_MATS`).
 * - **A part** (`partAt`, E held): of a footprint building, every block of
 *   the same stage and material that stands now (its woven walls, its wall
 *   plate, its posts, its floor, its thatch, its ridge and gables, its stair; a
 *   fence's posts or its panels); of other blocks, those of the same material
 *   joined to it side to side (at most `PART_MOST`).
 * - **Only his blocks**: the block layer holds nothing else (the world's
 *   blocks are baked meshes, his pieces are models): nothing here can paint
 *   them.
 * - **Kinds of block** (the save keeps at most 4,096: blocks/save.ts
 *   `SAVE_LIMITS.kinds`): every block a footprint plan can make is one of
 *   `KINDS_MOST.plans` kinds unpainted; paint makes at most
 *   `KINDS_MOST.painted` more (7 colours: the six and the materials' own, times
 *   the materials and forms the plans use). A plot fully painted in every
 *   colour stays under `KINDS_MOST.all` (`kindsBound`, checked by
 *   `__paint.kinds()`), far under the limit.
 */

export type PaintId = keyof typeof KHMER_PAINT;
/** A colour of the palette, or the block's own (the paint taken off). */
export type BrushId = PaintId | 'own';

/** The six, in the order of the swatches (keys 1‥6). */
export const PAINT_IDS: readonly PaintId[] = ['lotus', 'saffron', 'indigo', 'gold', 'lacquer', 'coconut'];
/** The swatches: the six, then its own colour (key 7). */
export const BRUSH_IDS: readonly BrushId[] = [...PAINT_IDS, 'own'];

/** Each swatch's name (ui/lang.ts). */
export const BRUSH_WORD: Record<BrushId, WordKey> = {
  lotus: 'paintLotus',
  saffron: 'paintSaffron',
  indigo: 'paintIndigo',
  gold: 'paintGold',
  lacquer: 'paintLacquer',
  coconut: 'paintCoconut',
  own: 'paintOwn',
};

/** A part of other blocks than a footprint building's: at most this many (side by side, one material). */
export const PART_MOST = 4096;

/** A cell as one number (as footPlan.ts keys its cells). */
const cellKey = (i: number, j: number, k: number): number => ((i + 8192) * 16384 + (k + 8192)) * 2048 + (j + 1024);

/** Each plan's cells (its key → the block's index in the plan), made once a plan. */
const indexes = new WeakMap<FootPlan, Map<number, number>>();
function planIndex(plan: FootPlan): Map<number, number> {
  let m = indexes.get(plan);
  if (m) return m;
  m = new Map();
  for (let b = 0; b < plan.n; b++) m.set(cellKey(plan.cells[b * 3], plan.cells[b * 3 + 1], plan.cells[b * 3 + 2]), b);
  indexes.set(plan, m);
  return m;
}

/** The footprint building a block of the layer belongs to, and its index in the plan (null: none: a block of no plan). */
export function ownerOf(i: number, j: number, k: number): { rec: FootRec; plan: FootPlan; b: number } | null {
  for (const rec of FOOTS.list) {
    const plan = FOOTS.plan(rec);
    const box = plan.box;
    if (i < box.i0 || i > box.i1 || k < box.k0 || k > box.k1) continue;
    const b = planIndex(plan).get(cellKey(i, j, k));
    if (b !== undefined && b < rec.written) return { rec, plan, b };
  }
  return null;
}

/** The colour a block was built with (sRGB hex): its plan's, else its material's. `raw`: the block now. */
export function ownColour(i: number, j: number, k: number, raw: number): number {
  const o = ownerOf(i, j, k);
  if (o) return rawColor(o.plan.raws[o.b]);
  return MAT_BY_ID[rawMat(raw)]?.color ?? rawColor(raw);
}

/** A swatch's colour for a block (sRGB hex). */
export function brushColour(brush: BrushId, i: number, j: number, k: number, raw: number): number {
  return brush === 'own' ? ownColour(i, j, k, raw) : KHMER_PAINT[brush];
}

/** The block's colour is one of the six. */
export const isPainted = (raw: number): boolean => raw !== 0 && PAINT_COLOURS.has(rawColor(raw));
const PAINT_COLOURS = new Set<number>(Object.values(KHMER_PAINT));

/** A part's name ("the walls"): by the building's kind, the stage and the material. */
function partWord(kind: FootKind, stage: FootStage, mat: BlockMatKey): WordKey {
  if (stage === 'walls') return mat === 'timber' ? 'paintPartPlate' : kind === 'fence' ? 'footStagePanels' : 'footStageWalls';
  if (stage === 'roof') return mat === 'thatch' ? 'footStageRoof' : mat === 'bamboo' ? 'paintPartGables' : kind === 'house' ? 'paintPartRidgeGables' : 'paintPartRidge';
  if (stage === 'posts') return 'footStagePosts';
  if (stage === 'floor') return 'footStageFloor';
  return 'footStageStair';
}

/** What E held paints: the cells (i, j, k, … flat), the part's name, the building it is of (null: blocks of no plan). */
export interface PaintPart {
  readonly cells: readonly number[];
  readonly word: WordKey;
  readonly uid: string | null;
}

/** The part of the block in cell (i, j, k) (null: no block there). */
export function partAt(i: number, j: number, k: number): PaintPart | null {
  const raw = BLOCKS.raw(i, j, k);
  if (!raw) return null;
  const mat = rawMat(raw);
  const o = ownerOf(i, j, k);
  const cells: number[] = [];
  if (o) {
    const { rec, plan, b } = o;
    let from = 0;
    let to = plan.n;
    let stage: FootStage = 'posts';
    for (let s = 0; s < plan.stages.length; s++)
      if (plan.stages[s].from <= b) {
        from = plan.stages[s].from;
        stage = plan.stages[s].stage;
        to = s + 1 < plan.stages.length ? plan.stages[s + 1].from : plan.n;
      }
    for (let q = from; q < Math.min(to, rec.written); q++) {
      if (rawMat(plan.raws[q]) !== mat) continue;
      const ci = plan.cells[q * 3];
      const cj = plan.cells[q * 3 + 1];
      const ck = plan.cells[q * 3 + 2];
      const now = BLOCKS.raw(ci, cj, ck);
      if (now && rawMat(now) === mat) cells.push(ci, cj, ck);
    }
    return { cells, word: partWord(rec.kind, stage, MAT_BY_ID[mat]!.key), uid: rec.uid };
  }
  // Blocks of no plan: those of its material joined side to side.
  const seen = new Set<number>([cellKey(i, j, k)]);
  const todo: number[] = [i, j, k];
  while (todo.length && cells.length < PART_MOST * 3) {
    const ck = todo.pop()!;
    const cj = todo.pop()!;
    const ci = todo.pop()!;
    cells.push(ci, cj, ck);
    for (const [dx, dy, dz] of SIDES) {
      const x = ci + dx;
      const y = cj + dy;
      const z = ck + dz;
      const key = cellKey(x, y, z);
      if (seen.has(key)) continue;
      seen.add(key);
      const r = BLOCKS.raw(x, y, z);
      if (r && rawMat(r) === mat && ownerOf(x, y, z) === null) todo.push(x, y, z);
    }
  }
  return { cells, word: 'paintPartBlocks', uid: null };
}
const SIDES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Paint cells (i, j, k, … flat) with a swatch: one change of the layer. Returns how many blocks changed colour. */
export function paintCells(cells: ArrayLike<number>, brush: BrushId): number {
  let n = 0;
  BLOCKS.batch(() => {
    for (let c = 0; c + 2 < cells.length; c += 3) {
      const i = cells[c];
      const j = cells[c + 1];
      const k = cells[c + 2];
      const raw = BLOCKS.raw(i, j, k);
      if (!raw) continue;
      const colour = brushColour(brush, i, j, k, raw);
      if (BLOCKS.setRaw(i, j, k, raw - rawColor(raw) + colour)) n++;
    }
  });
  return n;
}

/**
 * A check's paint (`paint=<what>:<colour>,…`; shots and the dev server only: the caller's gate): `<what>` is `all`
 * (every block of the layer), a footprint building's uid (`house-1`: all of it), `<uid>.<stage>` (`house-1.walls`:
 * every block of that stage) or `<uid>.<stage>.<material>` (`house-1.walls.bamboo`: one part); `<colour>` one of
 * `BRUSH_IDS`. Returns the blocks that changed colour.
 */
export function paintFromUrl(v: string): number {
  let n = 0;
  for (const part of v.split(',')) {
    const m = /^([a-z0-9-]+)(?:\.([a-z]+))?(?:\.([a-z]+))?:([a-z]+)$/.exec(part.trim());
    const brush = m?.[4] as BrushId | undefined;
    if (!m || !brush || !BRUSH_IDS.includes(brush)) {
      if (part.trim()) console.warn(`[paint] paint=: "${part}" is not <all|uid[.stage[.material]]>:<${BRUSH_IDS.join('|')}>`);
      continue;
    }
    const cells: number[] = [];
    if (m[1] === 'all') BLOCKS.forEach((i, j, k) => cells.push(i, j, k));
    else {
      const rec = FOOTS.byUid(m[1]);
      if (!rec) {
        console.warn(`[paint] paint=: no building "${m[1]}" (${FOOTS.list.map((r) => r.uid).join(', ') || 'none'})`);
        continue;
      }
      const plan = FOOTS.plan(rec);
      for (let s = 0; s < plan.stages.length; s++) {
        const st = plan.stages[s];
        if (m[2] && st.stage !== m[2]) continue;
        const to = Math.min(rec.written, s + 1 < plan.stages.length ? plan.stages[s + 1].from : plan.n);
        for (let b = st.from; b < to; b++) {
          if (m[3] && MAT_BY_ID[rawMat(plan.raws[b])]?.key !== m[3]) continue;
          cells.push(plan.cells[b * 3], plan.cells[b * 3 + 1], plan.cells[b * 3 + 2]);
        }
      }
    }
    n += paintCells(cells, brush);
  }
  return n;
}

/** The kinds of block in the layer now (as the save counts them: material × colour × shape × turn). */
export function kindsNow(): number {
  const seen = new Set<number>();
  BLOCKS.forEach((_i, _j, _k, raw) => seen.add(raw));
  return seen.size;
}

/**
 * The most kinds of block footprint buildings can make, unpainted and painted (`plans`: every block number a plan of
 * each kind, at its sizes, makes, gathered by the caller as plans are made; the painted: each of their materials and
 * forms in the six colours and the materials' own). For the docs and `__paint.kinds()`.
 */
export function kindsBound(planRaws: Iterable<number>): { plans: number; painted: number; all: number } {
  const plans = new Set<number>();
  const shapes = new Set<number>();
  for (const raw of planRaws) {
    plans.add(raw);
    // (its material and form, the colour taken out)
    shapes.add(raw - rawColor(raw));
  }
  const painted = shapes.size * (PAINT_IDS.length + 1);
  return { plans: plans.size, painted, all: plans.size + painted };
}

/**
 * The paint add-on and the build add-on reach each other here (neither imports the other's module: roam/_addons.ts):
 * the build card's Paint row enters paint mode (`enter`, the paint add-on fills it), paint mode's F / C opens the build
 * card again (`card`, the build add-on fills it), and each leaves its own mode when the other's starts.
 */
export const PAINT_LINK = {
  /** Paint mode is on. */
  on: false,
  enter: (): void => undefined,
  exit: (): void => undefined,
  card: (): void => undefined,
  /** Build mode or footprint mode is on (the paint add-on leaves its own when it is). */
  building: (): boolean => false,
};
