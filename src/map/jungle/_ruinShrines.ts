import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelGrid } from '../../voxel/VoxelBuilder';
import { bondTone, courseShade, fillBox, tone } from '../landmarks/_faces';
import { CANOPY, chip, growTree, LATERITE, overgrow, pickOf, RUIN_STONE, TREE_BARK } from '../landmarks/_ruin';
import type { ShrineLights } from './_incense';
import { mossOn, plantsAround, steppingStones } from './_ruinBits';
import type { SiteFrame } from './_ruinFrame';
import { BRASS, candle, clothBand, fruitPlate, garland, garlandDrop, incenseBowl, LACQUER, lotusBud, lotusOpen, SAFFRON } from './_ruinOfferings';

/**
 * The jungle's places of worship (site space: +z toward the trail, see
 * _ruinFrame.ts), each kept by the people who pass: incense, candles,
 * flowers, fruit.
 *
 * - the forest Buddha: a lone sandstone Buddha seated in meditation on a
 *   lotus throne under a great bodhi tree, a saffron sash over his left
 *   shoulder, a red offering table before him;
 * - the spirit house (san preah phum) by the village trail: a little
 *   temple-roofed house on a post, garlands, a tray of tiny offerings;
 * - the lake shrine: a small whitewashed stupa with a niche, a brass urn of
 *   incense before it and a frangipani beside it;
 * - the Kulen shrine: a small stone sanctuary tower at the mountain's foot,
 *   a Buddha in saffron inside its doorway, candles, an urn.
 *
 * `KNEEL` (site space) is where the explorer kneels at each and what he
 * faces (roam/_worship.ts holds them in map metres).
 */

export const KNEEL: Record<string, { at: [number, number]; face: [number, number] }> = {
  'forest-buddha': { at: [0, 3.1], face: [0, -2] },
  'spirit-house': { at: [0.5, 1.7], face: [0.5, -1.2] },
  'lake-shrine': { at: [0, 2.95], face: [0, -1.4] },
  'kulen-shrine': { at: [0, 3.35], face: [0, -2.2] },
};

type Put = (i: number, j: number, k: number, color: number, mat?: 'mapStone' | 'krama' | 'brass' | 'mapGrass', shade?: number) => void;
const putter =
  (g: VoxelGrid): Put =>
  (i, j, k, color, mat = 'mapStone', shade = 1) =>
    g.put(i, j, k, { color, mat, shade });

// ── The forest Buddha ────────────────────────────────────────────────────

/** The Buddha's sandstone: warm, lighter than the ruins (the people keep him clean). */
const B = {
  stone: [0xc2aa89, 0xbaa282, 0xc8b190, 0xb39b7c],
  skin: [0xc4b9a3, 0xbeb29c, 0xcabfa9],
  /** The face: brighter and warm, little variation (the features are drawn in tone). */
  face: [0xdec7a0, 0xdac39c, 0xe2cba5],
  dark: [0x3d372f, 0x453e35],
  shade: [0x938875, 0x8b806e],
  hair: [0xa28b6b, 0x9a8466, 0xa89171],
  lotus: [0xa2967f, 0x998d77, 0xab9f88],
  lotusLight: [0xc3b79e, 0xbbaf96],
};
/** A colour made lighter or darker (sRGB multiply). */
const scale = (hex: number, by: number): number => {
  const c = (v: number) => Math.min(255, Math.round(v * by));
  return (c((hex >> 16) & 255) << 16) | (c((hex >> 8) & 255) << 8) | c(hex & 255);
};
/** The throne's centre (site z, m). */
const ZB = -2;

/**
 * The seated Buddha (0.25 m cells, the head 0.125 m): a lotus throne, the
 * legs crossed, hands in the lap (meditation), a straight body, long
 * earlobes, the hair in curls with the ushnisha and a gilded finial; a
 * saffron sash from the left shoulder across the chest to the right hip.
 */
function seatedBuddha(fr: SiteFrame, seed: number): void {
  const bg = fr.grid(0.25, { seed, at: [0, 0, ZB], ao: 0.28, jitter: 0.03 });
  const P = putter(bg);
  const t = (list: readonly number[], i: number, j: number, k: number, s = 0) => tone(list, i, j, k, seed + s);
  for (let i = -8; i <= 8; i++) for (let k = -6; k <= 5; k++) bg.ghost(i, -1, k);
  // Throne: plinth, a narrow waist, the lotus with a rim of upturned petals.
  fillBox(bg, -7, 7, 0, 1, -5, 4, (i, j, k) => t(B.stone, i, j, k));
  fillBox(bg, -6, 6, 2, 2, -4, 3, (i, j, k) => t(B.shade, i, j, k, 1));
  for (let i = -7; i <= 7; i++)
    for (let k = -5; k <= 4; k++) {
      const rim = Math.abs(i) === 7 || k === -5 || k === 4;
      P(i, 3, k, rim ? ((i + k) & 1 ? t(B.lotusLight, i, 3, k, 2) : t(B.lotus, i, 3, k, 3)) : t(B.stone, i, 3, k));
      if (!rim) P(i, 4, k, t(B.stone, i, 4, k, 4));
      else if (!((i + k) & 1)) P(i, 4, k, t(B.lotusLight, i, 4, k, 5), 'mapStone', 1.06);
    }
  // Legs crossed, and the lap.
  const inside = (i: number, k: number, ri: number, rk: number) => (i / ri) ** 2 + ((k + 0.5) / rk) ** 2 <= 1;
  for (let i = -7; i <= 7; i++)
    for (let k = -5; k <= 4; k++) {
      if (inside(i, k, 6.6, 3.7)) for (let j = 5; j <= 6; j++) P(i, j, k, t(B.stone, i, j, k, 6));
      if (inside(i, k, 6, 3.2)) P(i, 7, k, t(B.stone, i, 7, k, 7));
    }
  // The soles, turned up on the thighs.
  for (const s of [-1, 1]) for (const k of [1, 2]) P(s * 3, 7, k, t(B.skin, s, 7, k, 8), 'mapStone', 1.04);
  // Body: waist to shoulders; a cell in from each corner.
  const HW = [3, 3, 3, 3, 4, 4, 4, 3];
  for (let j = 8; j <= 15; j++) {
    const hw = HW[j - 8];
    for (let i = -hw; i <= hw; i++) for (let k = -2; k <= 1; k++) if (!(Math.abs(i) === hw && (k === -2 || k === 1))) P(i, j, k, t(B.stone, i, j, k, 9));
  }
  // Arms: upper arms hanging, elbows out, forearms to the hands in the lap.
  for (const s of [-1, 1]) {
    for (let j = 11; j <= 14; j++) for (let k = -1; k <= 0; k++) P(s * 5, j, k, t(B.stone, s, j, k, 10));
    for (let j = 9; j <= 10; j++) for (const i of [4, 5]) for (let k = -1; k <= 1; k++) P(s * i, j, k, t(B.stone, i, j, k, 11));
    for (const i of [3, 4, 5]) for (let k = 1; k <= 2; k++) P(s * i, 8, k, t(B.stone, i, 8, k, 12));
  }
  // Hands, right over left, thumbs touching.
  for (let i = -2; i <= 2; i++) P(i, 8, 2, t(B.skin, i, 8, 2, 13), 'mapStone', 1.03);
  P(0, 9, 2, t(B.skin, 0, 9, 2, 14), 'mapStone', 1.05);
  // Neck.
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 0; k++) P(i, 16, k, t(B.skin, i, 16, k, 15));
  // The saffron sash: a band from the left shoulder (+x: he faces +z) across the chest to the right hip, over the left arm.
  bg.forEach((i, j, k, c) => {
    if (c.ghost || j < 8 || j > 15) return;
    const d = ((i - 3) * 7 - (j - 15) * 6.5) / 9.55;
    const onArm = i >= 4 && j >= 9;
    if (Math.abs(d) <= 1.35 || (i >= 3 && j >= 12) || onArm) {
      c.color = pickOf(SAFFRON, i, j, k, seed + 16);
      c.mat = 'krama';
      c.shade = 0.9 + 0.14 * ((i + j) % 3 === 0 ? 1 : 0.4);
    }
  });
  // Two marigold swags across the throne's front.
  const zf = ZB + 4 * 0.25 + 0.2;
  garland(fr, [-1.75, 1.05, zf], [0, 1.05, zf], 0.45, seed + 17, 0.09);
  garland(fr, [0, 1.05, zf], [1.75, 1.05, zf], 0.45, seed + 18, 0.09);
  for (const x of [-1.75, 0, 1.75]) garlandDrop(fr, x, 1.0, zf, 0.35, seed + 19 + x, 0.09);
  bg.commit();

  // The head (0.125 m cells) over the neck: an Angkor-period face, broad and
  // serene, the eyes lowered, a faint smile, long lobes, the hair in curls
  // over the ushnisha. The face is flush (k 4) and drawn in tone only, so no
  // feature makes a pit in the shade under the tree; only the nose stands out.
  const hg = fr.grid(0.125, { seed: seed + 20, at: [0, 17 * 0.25, ZB - 0.125], ao: 0.12, jitter: 0.015 });
  const H = putter(hg);
  // Per row from the chin: half width, back and front (cells). The jaw is
  // narrow at r1–r2 so the lobes hang free; the hairline steps back at r11.
  const ROWS: [number, number, number][] = [[3, -1, 3], [4, -2, 4], [4, -3, 4]];
  for (let r = 3; r <= 10; r++) ROWS.push([5, -4, 4]);
  ROWS.push([5, -4, 3], [5, -4, 3], [4, -4, 2], [3, -3, 1]);
  // (then the ushnisha, curls all over)
  ROWS.push([2, -2, 1], [2, -2, 1], [1, -1, 0]);
  ROWS.forEach(([hw, kb, kf], r) => {
    const kc = (kb + kf) / 2;
    const hd = (kf - kb) / 2 + 0.5;
    for (let i = -hw; i <= hw; i++)
      for (let k = kb; k <= kf; k++) {
        if (Math.abs(i / (hw + 0.5)) ** 4 + Math.abs((k - kc) / hd) ** 4 > 1.02) continue;
        const hair = r >= 11 || k <= -2 || (Math.abs(i) >= 5 && r >= 9 && k <= 1);
        // (the curls: a gentle checker, warm stone, never black in the shade)
        if (hair) H(i, r, k, t(B.hair, i, r, k, 21), 'mapStone', (i + k + r) & 1 ? 0.94 : 1.04);
        else H(i, r, k, t(B.face, i, r, k, 23));
      }
  });
  // Features: the face's own stone, lighter or darker (sRGB).
  const f = (i: number, r: number, k: number, by: number) => H(i, r, k, scale(t(B.face, i, r, k, 24), by));
  f(0, 4, 5, 1.02); // the nose, proud
  f(0, 5, 5, 1.04);
  f(0, 6, 4, 1.04); // its bridge
  f(0, 7, 4, 1.04);
  for (const s of [-1, 1]) {
    for (let a = 2; a <= 4; a++) f(s * a, 6, 4, a === 3 ? 0.84 : 0.9); // the eyes, lowered: the lash line
    for (let a = 2; a <= 4; a++) f(s * a, 7, 4, 1.03); // the heavy lids
    for (let a = 1; a <= 4; a++) f(s * a, 8, 4, 0.93); // a faint brow
    f(s * 2, 3, 4, 0.93); // the corners of the smile, turned up
  }
  for (let i = -1; i <= 1; i++) {
    f(i, 2, 4, 0.86); // the mouth, closed
    f(i, 1, 4, 1.04); // the lower lip
  }
  // Ears, their long lobes hanging beside the jaw.
  for (const s of [-1, 1]) {
    for (let r = 5; r <= 9; r++) for (let k = -1; k <= 0; k++) H(s * 6, r, k, scale(t(B.face, s, r, k, 30), k === 0 && (r === 6 || r === 7) ? 0.86 : 0.97));
    for (let r = 1; r <= 4; r++) H(s * 6, r, 0, scale(t(B.face, s, r, 0, 31), 0.96));
  }
  // A lotus-bud finial on the ushnisha, gilded.
  H(0, 18, 0, BRASS[0], 'brass');
  for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) H(di, 18, dk, BRASS[1], 'brass');
  H(0, 19, 0, BRASS[2], 'brass');
  H(0, 20, 0, BRASS[2], 'brass', 1.1);
  hg.commit();
}

/**
 * The forest Buddha (back trail, behind Angkor Wat): the Buddha under a
 * bodhi tree whose trunk is tied with a saffron cloth, laterite paving round
 * the throne, a red offering table with incense, candles, lotus and fruit,
 * stepping stones from the trail, ferns.
 */
export function forestBuddha(fr: SiteFrame, L: ShrineLights): void {
  const src = traceSource();
  // The bodhi tree behind him, its crown over him.
  const tg = fr.grid(1, { seed: 610, mat: 'mapBark' });
  fr.ghostLand(tg, 1, -9, 9, -12, 6);
  growTree(tg, 0, fr.landRow(0, -6, 1), -6, { trunk: 10, radius: 8, squash: 0.5, seed: 611, thick: true, bark: [0x7d7262, 0x74695a, 0x857a69], leaf: CANOPY, lean: [0, -2] });
  tg.commit();
  clothBand(fr, 0.5, -5.5, 1.05, 1.05, 1.5, 0.4, 612);
  // Paving round the throne.
  for (let x = -2; x <= 2; x++)
    for (let z = -4; z <= 0; z++) {
      const px = x + (hash3(x, z, 1, 613) - 0.5) * 0.08;
      const pz = z + (hash3(x, z, 2, 613) - 0.5) * 0.08;
      fr.b.box(px, fr.ground(px, pz) + 0.06, pz, 0.94, 0.14, 0.94, pickOf(PATH_STONE, x, z, 0, 614), 'mapStone', { src, shade: 0.9 + 0.12 * hash3(x, z, 3, 613) });
    }
  seatedBuddha(fr, 620);

  // The offering table: red lacquer, gilt edge.
  const top = 0.78;
  const [tx0, tx1, tz0, tz1] = [-1.1, 1.1, -0.35, 0.45];
  const tzc = (tz0 + tz1) / 2;
  fr.b.box(0, top - 0.04, tzc, tx1 - tx0, 0.08, tz1 - tz0, LACQUER[0], 'wood', { src });
  fr.b.box(0, top - 0.13, tz1 - 0.02, tx1 - tx0 - 0.1, 0.1, 0.04, BRASS[1], 'brass', { src });
  for (const x of [tx0 + 0.08, tx1 - 0.08]) for (const z of [tz0 + 0.08, tz1 - 0.08]) fr.b.box(x, (top - 0.08) / 2, z, 0.1, top - 0.08, 0.1, LACQUER[1], 'wood', { src });
  incenseBowl(fr, L, 0, top, tzc - 0.05, { r: 0.17, h: 0.2, n: 5, stick: 0.62, seed: 630 });
  for (const s of [-1, 1]) candle(fr, L, s * 0.78, top, tzc - 0.1, 0.34, 0.1, 631 + s);
  // Lotus buds in a brass vase, an open lotus, fruit.
  fr.b.box(-0.42, top + 0.12, tzc + 0.12, 0.14, 0.24, 0.14, BRASS[0], 'brass', { src, ry: 0.4 });
  lotusBud(fr, -0.45, top + 0.2, tzc + 0.1, 0.42, 632);
  lotusBud(fr, -0.38, top + 0.2, tzc + 0.15, 0.34, 633);
  lotusBud(fr, -0.44, top + 0.2, tzc + 0.17, 0.28, 634);
  lotusOpen(fr, 0.25, top, tzc + 0.25, 1);
  fruitPlate(fr, 0.52, top, tzc + 0.12, 0.3, 1);
  // A marigold garland along the table's front.
  garland(fr, [tx0 + 0.05, top - 0.06, tz1 + 0.04], [tx1 - 0.05, top - 0.06, tz1 + 0.04], 0.22, 635, 0.08);
  // Night: a soft halo over the table (none on the Buddha: it bleached the stone white).
  L.halos.push({ at: fr.point(0, top + 0.5, tzc), size: 2.2 });

  steppingStones(fr, [0.2, 5.6], [0.1, 1.2], 1.1, 640, PATH_STONE);
  plantsAround(fr, { n: 40, r0: 3, r1: 8.5, seed: 641, flowers: 0.25, keepOut: (x, z) => Math.abs(x) < 2.6 && z > -4.8 && z < 6 });
}

// ── The spirit house ─────────────────────────────────────────────────────

const PLASTER = [0xece3cf, 0xe4dbc6, 0xf1e9d7];
const TILE = [0xb33a26, 0xa5331f, 0xbd4430];
const PAINT_RED = [0x9c2a22, 0x8e241d];

/**
 * The spirit house on the village trail (0.125 m cells for the house): a
 * cream post on a white plinth, a red tray, a little cream house with gold
 * pilasters and a dark doorway (a gilt figure of the guardian spirit
 * within), a two-tiered red roof with gold gables, finials and a gold
 * spire. On the tray: incense, candles, a red soda with a straw, a banana,
 * flowers; marigold garlands hang from its corners.
 */
export function spiritHouse(fr: SiteFrame, L: ShrineLights): void {
  const src = traceSource();
  const [cx, cz] = [0.5, -1.2];
  const gy = fr.ground(cx, cz);
  // Plinth, a step, the post with gold bands.
  fr.b.box(cx, gy + 0.15, cz, 1.3, 0.3, 1.3, 0xdcd5c6, 'mapStone', { src });
  fr.b.box(cx, gy + 0.36, cz, 0.8, 0.12, 0.8, 0xe6dfd0, 'mapStone', { src });
  const postTop = 2.05;
  fr.b.box(cx, (gy + 0.42 + postTop) / 2, cz, 0.24, postTop - gy - 0.42, 0.24, 0xe4d9c1, 'wood', { src });
  for (const y of [gy + 0.5, postTop - 0.1]) fr.b.box(cx, y, cz, 0.3, 0.07, 0.3, BRASS[0], 'brass', { src });
  // Brackets from the post to the tray.
  for (const s of [-1, 1]) {
    fr.b.box(cx + s * 0.28, postTop - 0.2, cz, 0.08, 0.5, 0.08, PAINT_RED[0], 'wood', { src, rz: s * 0.8 });
    fr.b.box(cx, postTop - 0.2, cz + s * 0.26, 0.08, 0.5, 0.08, PAINT_RED[0], 'wood', { src, rx: -s * 0.8 });
  }
  // The tray, red with a gold rim; the house at its back, a porch in front.
  const ty = postTop + 0.06;
  const [trw, trd] = [1.5, 1.3];
  const tcz = cz + 0.1;
  fr.b.box(cx, ty, tcz, trw, 0.1, trd, PAINT_RED[1], 'wood', { src });
  for (const s of [-1, 1]) {
    fr.b.box(cx, ty + 0.07, tcz + (s * trd) / 2, trw, 0.05, 0.04, BRASS[1], 'brass', { src });
    fr.b.box(cx + (s * trw) / 2, ty + 0.07, tcz, 0.04, 0.05, trd, BRASS[1], 'brass', { src });
  }
  const floor = ty + 0.05;

  // The house (0.125 m cells): 9 wide, 7 deep, walls 7 high, then the roof.
  const hz = cz - 0.1;
  const hg = fr.grid(0.125, { seed: 701, at: [cx, floor, hz], ao: 0.22, jitter: 0.03 });
  const H = putter(hg);
  const t = (list: readonly number[], i: number, j: number, k: number, s = 0) => tone(list, i, j, k, 702 + s);
  for (let j = 0; j <= 6; j++)
    for (let i = -4; i <= 4; i++)
      for (let k = -3; k <= 3; k++) {
        const corner = Math.abs(i) === 4 && Math.abs(k) === 3;
        if (j === 0) H(i, j, k, t(PAINT_RED, i, j, k), 'mapStone');
        else if (corner || j === 6) H(i, j, k, BRASS[(i + j + k) & 1], 'brass');
        else H(i, j, k, t(PLASTER, i, j, k, 1));
      }
  // Doorway: dark red within, a gold frame, the guardian's gilt figure.
  for (let j = 1; j <= 4; j++) for (let i = -1; i <= 1; i++) {
    hg.delete(i, j, 3);
    H(i, j, 2, 0x4a1612, 'mapStone', 0.8);
  }
  for (let j = 1; j <= 5; j++) for (const i of [-2, 2]) H(i, j, 3, BRASS[1], 'brass');
  for (let i = -2; i <= 2; i++) H(i, 5, 3, BRASS[0], 'brass');
  H(0, 1, 2, BRASS[2], 'brass');
  H(0, 2, 2, BRASS[2], 'brass', 1.1);
  // Side windows.
  for (const s of [-1, 1]) for (let j = 2; j <= 3; j++) H(s * 4, j, 0, 0x4a1612, 'mapStone', 0.8);
  // Roof: two gabled tiers (ridge front to back), gold gables and edges, then the spire.
  const gable = (j0: number, hw: number, k0: number, k1: number) => {
    for (let r = 0; r <= hw; r++) {
      const w = hw - r;
      for (let i = -w; i <= w; i++)
        for (let k = k0; k <= k1; k++) {
          const end = k === k0 || k === k1;
          const edge = Math.abs(i) === w;
          if (end) H(i, j0 + r, k, edge ? BRASS[0] : r === hw - 2 && i === 0 ? BRASS[2] : t(PAINT_RED, i, r, k, 2), edge || (r === hw - 2 && i === 0) ? 'brass' : 'mapStone');
          else H(i, j0 + r, k, edge ? BRASS[1] : t(TILE, i, r, k, 3), edge ? 'brass' : 'mapStone', r & 1 ? 0.95 : 1.02);
        }
    }
    // Finials: a chofa curling up at each gable's peak, tails at the eaves.
    for (const k of [k0, k1]) {
      H(0, j0 + hw + 1, k, BRASS[2], 'brass');
      for (const s of [-1, 1]) H(s * (hw + 1), j0, k, BRASS[2], 'brass');
    }
  };
  gable(7, 6, -5, 5);
  gable(10, 4, -3, 3);
  // Spire.
  for (let j = 15; j <= 20; j++) {
    const w = j < 17 ? 1 : 0;
    for (let i = -w; i <= w; i++) for (let k = -w; k <= w; k++) H(i, j, k, BRASS[(j + i) & 1], 'brass', 1 + (j - 15) * 0.02);
  }
  hg.commit();

  // Offerings on the porch.
  const pz = hz + 0.62;
  incenseBowl(fr, L, cx, floor, pz, { r: 0.07, h: 0.1, n: 3, stick: 0.34, seed: 710, smoke: 0.6 });
  for (const s of [-1, 1]) candle(fr, L, cx + s * 0.28, floor, pz - 0.02, 0.14, 0.05, 711 + s);
  fr.b.box(cx + 0.55, floor + 0.1, pz - 0.08, 0.07, 0.2, 0.07, 0xd8263a, 'petal', { src }); // the red soda
  fr.b.box(cx + 0.57, floor + 0.25, pz - 0.08, 0.015, 0.14, 0.015, 0xf2f2f2, 'petal', { src, rz: -0.3 }); // its straw
  fr.b.box(cx - 0.5, floor + 0.04, pz, 0.06, 0.05, 0.2, 0xf2cf3a, 'petal', { src, ry: 0.4 }); // a banana
  fr.b.box(cx + 0.45, floor + 0.05, pz + 0.12, 0.09, 0.09, 0.09, 0xe6a52a, 'petal', { src }); // a mango
  lotusOpen(fr, cx - 0.5, floor, pz - 0.28, 0.7);
  // Garlands: along the tray's front, hanging from its corners and the roof's eaves.
  const front = tcz + trd / 2 + 0.04;
  garland(fr, [cx - trw / 2, ty - 0.02, front], [cx + trw / 2, ty - 0.02, front], 0.16, 720, 0.07);
  for (const s of [-1, 1]) garlandDrop(fr, cx + (s * trw) / 2, ty - 0.02, front, 0.5, 721 + s, 0.07);
  for (const s of [-1, 1]) garlandDrop(fr, cx + s * 0.8, floor + 7 * 0.125, hz + 0.68, 0.35, 723 + s, 0.06);
  L.halos.push({ at: fr.point(cx, floor + 0.5, pz + 0.1), size: 2.4 });
}

// ── The lake shrine ──────────────────────────────────────────────────────

/** Laterite stepping stones and paving: warm red-brown and ochre (grey went navy in the shade). */
const PATH_STONE = [0xa86f47, 0x9e6640, 0xb37a50, 0x94603d];

const LIME = [0xeeeadf, 0xe6e1d4, 0xf3efe6, 0xdfd9cb];
const LIME_OLD = [0xc9c4b6, 0xbfbaac, 0xd2cdbf];
/** Frangipani flowers: white with a yellow heart. */
const FRANGIPANI = [0xf6f2e6, 0xf8f0d0, 0xf4e8b8];

/**
 * A small whitewashed stupa on the lake's north shore (0.25 m cells): two
 * steps, a square body with a niche (a little gilt Buddha, candles), a
 * bell, a square harmika and a spire of rings tipped in gold; stains of
 * damp climbing from its foot, moss on its steps, a saffron cloth round
 * its body. A brass urn of incense stands before it, a frangipani beside.
 */
export function lakeShrine(fr: SiteFrame, L: ShrineLights): void {
  const src = traceSource();
  const zc = -1.4;
  const g = fr.grid(0.25, { seed: 801, at: [0, 0, zc], ao: 0.3 });
  const P = putter(g);
  for (let i = -7; i <= 7; i++) for (let k = -7; k <= 7; k++) g.ghost(i, fr.landRow(i * 0.25, zc + k * 0.25, 0.25) - 1, k);
  // Whitewash, greyer toward the foot (damp).
  const lime = (i: number, j: number, k: number) => (hash3(i, j, k, 802) < 0.45 - j * 0.08 ? tone(LIME_OLD, i, j, k, 803) : tone(LIME, i, j, k, 804));
  const sq = (h: number, j0: number, j1: number, notch = false) =>
    fillBox(g, -h, h, j0, j1, -h, h, (i, j, k) => (notch && Math.abs(i) === h && Math.abs(k) === h ? null : lime(i, j, k)));
  // Footing down to the land, two steps, the body with redented corners and a cornice.
  for (let i = -5; i <= 5; i++)
    for (let k = -5; k <= 5; k++) for (let j = Math.min(0, fr.landRow(i * 0.25, zc + k * 0.25, 0.25)); j <= 1; j++) P(i, j, k, lime(i, j, k));
  sq(4, 2, 3);
  sq(3, 4, 7, true);
  sq(4, 8, 8, true);
  // The bell.
  const bell = [3.6, 3.75, 3.55, 3.1, 2.5, 1.6];
  bell.forEach((r, n) => {
    const j = 9 + n;
    for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) if (i * i + k * k <= r * r) P(i, j, k, lime(i, j, k));
  });
  // Harmika, rings, the gold tip.
  sq(1, 15, 16);
  for (let j = 17; j <= 20; j++) for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) if (j % 2 === 1 || Math.abs(i) + Math.abs(k) <= 1) P(i, j, k, lime(i, j, k));
  for (let j = 21; j <= 23; j++) P(0, j, 0, BRASS[j & 1], 'brass', 1.05);
  // The niche on the front, a little gilt Buddha in it.
  for (let j = 4; j <= 6; j++) for (let i = -1; i <= 1; i++) g.delete(i, j, 3);
  for (let j = 4; j <= 6; j++) for (let i = -1; i <= 1; i++) P(i, j, 2, 0x3a352f, 'mapStone', 0.8);
  P(0, 4, 3, BRASS[0], 'brass');
  P(0, 5, 3, BRASS[2], 'brass', 1.1);
  // Saffron cloth round the body.
  for (let i = -3; i <= 3; i++)
    for (let k = -3; k <= 3; k++) {
      if (Math.max(Math.abs(i), Math.abs(k)) !== 3 || (Math.abs(i) === 3 && Math.abs(k) === 3) || (k === 3 && Math.abs(i) <= 1)) continue;
      P(i, 7, k, pickOf(SAFFRON, i, 7, k, 805), 'krama');
    }
  mossOn(g, { seed: 806, amount: 0.35, dirs: [[0, 1, 0]], moss: RUIN_STONE.moss, scale: 2 });
  g.commit();

  // The urn before it, candles on the step, flowers and fruit.
  const uz = zc + 5 * 0.25 + 0.55;
  fr.b.box(0, 0.22, uz, 0.44, 0.44, 0.44, BRASS[1], 'brass', { src, ry: 0.785 });
  fr.b.box(0, 0.08, uz, 0.3, 0.16, 0.3, BRASS[0], 'brass', { src, ry: 0.785 });
  incenseBowl(fr, L, 0, 0.36, uz, { r: 0.2, h: 0.1, n: 6, stick: 0.55, seed: 810 });
  const stepY = 0.5;
  for (const s of [-1, 1]) candle(fr, L, s * 0.62, stepY, zc + 1.25, 0.22, 0.08, 811 + s);
  lotusOpen(fr, -0.3, stepY, zc + 1.25, 0.9);
  fruitPlate(fr, 0.32, stepY, zc + 1.22, -0.2, 0.8);
  garland(fr, [-0.8, 1.95, zc + 0.8], [0.8, 1.95, zc + 0.8], 0.28, 812, 0.07);
  L.halos.push({ at: fr.point(0, 1.3, zc + 1.4), size: 2.2 });

  // The frangipani to its left, flowers in its crown; ferns.
  const tg = fr.grid(1, { seed: 820, mat: 'mapBark' });
  fr.ghostLand(tg, 1, -7, 7, -7, 5);
  growTree(tg, -4, fr.landRow(-4, -2, 1), -2, { trunk: 3, radius: 2.4, squash: 0.6, seed: 821, bark: [0x9a9282, 0x8f8878, 0xa39b8b], leaf: [0x4d7a2e, 0x5a8a34, 0x44702a], lean: [-1, 0] });
  const flowers: [number, number, number][] = [];
  tg.forEach((i, j, k, c) => {
    if (c.mat !== 'mapLeaf' || hash3(i, j, k, 822) > 0.75) return;
    // (on the top, and on the sides of the crown)
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
    ])
      if (!tg.has(i + dx, j + dy, k + dz)) {
        flowers.push([i + dx * 0.55, j + 0.5 + dy * 0.55, k + dz * 0.55]);
        break;
      }
  });
  tg.commit();
  for (const [x, y, z] of flowers) {
    const h = hash3(x * 3, y * 3, z * 3, 823);
    fr.b.box(x + (h - 0.5) * 0.4, y, z + (hash3(x, y, z, 824) - 0.5) * 0.4, 0.3, 0.14, 0.3, pickOf(FRANGIPANI, Math.round(x * 2), Math.round(y * 2), Math.round(z * 2), 825), 'petal', { src, ry: h * 1.5, shade: 1.08 });
  }
  steppingStones(fr, [0.4, 4.6], [0.1, 1.8], 1.1, 830, PATH_STONE);
  plantsAround(fr, { n: 26, r0: 2.4, r1: 6.5, seed: 831, flowers: 0.3, keepOut: (x, z) => (Math.abs(x) < 1.9 && z > -3.2) || (Math.abs(x) < 3.2 && Math.abs(z + 1.4) < 1.8) });
}

// ── The Kulen shrine ─────────────────────────────────────────────────────

/**
 * A small stone sanctuary at the foot of Phnom Kulen (0.5 m cells): a
 * laterite platform with a step, a square cella with a doorway to the
 * trail and false doors on its other sides, three tiers and a lotus bud,
 * weathered and mossy, a small tree behind. In the dark doorway sits a
 * little Buddha wrapped in saffron, candles before him; an urn of incense on
 * the step, marigolds.
 */
export function kulenShrine(fr: SiteFrame, L: ShrineLights): void {
  const src = traceSource();
  const zc = -2.2;
  const g = fr.grid(0.5, { seed: 901, at: [0, 0, zc], ao: 0.34 });
  const R = RUIN_STONE;
  const P = putter(g);
  const wall = (i: number, j: number, k: number) => bondTone(R.wall, i, j, k, 902);
  const ledge = (i: number, j: number, k: number) => tone(R.ledge, i, j, k, 903);
  const deep = (i: number, j: number, k: number) => tone(R.deep, i, j, k, 904);
  fr.ghostLand(g, 0.5, -7, 7, -7, 7, [0, 0, zc]);
  // Platform, with a step to the front.
  for (let i = -5; i <= 5; i++)
    for (let k = -5; k <= 5; k++) for (let j = Math.min(0, fr.landRow(i * 0.5, zc + k * 0.5, 0.5)); j <= 0; j++) P(i, j, k, tone(LATERITE, i >> 1, j, k >> 1, 905), 'mapStone', 0.95);
  for (let i = -2; i <= 2; i++) P(i, 0, 6, ledge(i, 0, 6), 'mapStone', 0.9);
  // Cella: hollow, redented, the doorway (3 × 4) to the front.
  fillBox(g, -3, 3, 1, 7, -3, 3, (i, j, k) => (Math.abs(i) === 3 && Math.abs(k) === 3 ? null : Math.abs(i) < 3 && Math.abs(k) < 3 ? null : j === 7 ? ledge(i, j, k) : wall(i, j, k)), 'mapStone', (_i, j) => courseShade(j));
  fillBox(g, -2, 2, 7, 7, -2, 2, (i, j, k) => ledge(i, j, k));
  for (let j = 1; j <= 4; j++) for (let i = -1; i <= 1; i++) g.delete(i, j, 3);
  // The door frame stands out a little, a small pediment over it.
  for (let j = 1; j <= 5; j++) for (const i of [-2, 2]) P(i, j, 4, tone(R.light, i, j, 4, 906));
  for (let i = -2; i <= 2; i++) P(i, 5, 4, tone(R.light, i, 5, 4, 907));
  for (let i = -1; i <= 1; i++) P(i, 6, 4, tone(R.bright, i, 6, 4, 908));
  // False doors on the other sides.
  for (const [nx, nz] of [
    [1, 0],
    [-1, 0],
    [0, -1],
  ])
    for (let j = 1; j <= 4; j++)
      for (let a = -1; a <= 1; a++) {
        const [i, k] = [nx * 3 + (nz !== 0 ? a : 0), nz * 3 + (nx !== 0 ? a : 0)];
        P(i, j, k, deep(i, j, k), 'mapStone', 0.85);
      }
  // Tiers and the lotus bud.
  let j = 8;
  for (const h of [3, 2, 1]) {
    fillBox(g, -h, h, j, j + 1, -h, h, (i, jj, k) => (Math.abs(i) === h && Math.abs(k) === h ? null : jj === j + 1 ? ledge(i, jj, k) : wall(i, jj, k)));
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      P(sx * h, j + 2, sz * h, tone(R.light, sx, j, sz, 909));
    j += 2;
  }
  P(0, j, 0, tone(R.light, 0, j, 0, 910));
  P(0, j + 1, 0, tone(R.bright, 0, j + 1, 0, 911));
  chip(g, { seed: 912, corner: 0.2, edge: 0.05, from: 8 });
  overgrow(g, { seed: 913, top: (_i, jj) => (jj < 2 ? 0.3 : 0.45), side: (_i, jj) => (jj < 3 ? 0.1 : 0.03), vines: 0.04, vineLen: [2, 4], cushion: 0.12, moss: R.moss });
  // (no vine across the doorway)
  for (let jj = 1; jj <= 5; jj++) for (let i = -1; i <= 1; i++) if (g.get(i, jj, 4)?.mat === 'mapLeaf') g.delete(i, jj, 4);
  g.commit();

  // The little Buddha inside (0.25 m cells): seated, saffron over his shoulder, before the back wall.
  const bg = fr.grid(0.25, { seed: 920, at: [0, 0.5, zc - 0.25] });
  for (let i = -3; i <= 3; i++) for (let k = -1; k <= 1; k++) bg.put(i, 0, k, { color: tone(B.lotus, i, 0, k, 921), mat: 'mapStone' });
  for (let i = -2; i <= 2; i++) for (let k = -1; k <= 1; k++) bg.put(i, 1, k, { color: tone(B.stone, i, 1, k, 922), mat: 'mapStone' });
  // (the sash: over his left shoulder, +x, down across to the right)
  const sash = (i: number, jj: number) => i === 1 || (jj === 3 && i === 0) || (jj === 2 && i === -1);
  for (let jj = 2; jj <= 4; jj++)
    for (let i = -1; i <= 1; i++) bg.put(i, jj, 0, sash(i, jj) ? { color: pickOf(SAFFRON, i, jj, 0, 923), mat: 'krama' } : { color: tone(B.stone, i, jj, 0, 924), mat: 'mapStone' });
  bg.put(0, 5, 0, { color: tone(B.skin, 0, 5, 0, 925), mat: 'mapStone' });
  bg.put(0, 6, 0, { color: BRASS[2], mat: 'brass' });
  bg.commit();
  // Candles before him, on the cella's floor.
  for (const x of [-0.5, 0.5]) candle(fr, L, x, 0.5, zc + 0.35, 0.18, 0.07, 930 + x);
  L.halos.push({ at: fr.point(0, 1.2, zc + 1.2), size: 2.2 });

  // The urn on the step, marigolds on the platform's front edge.
  const uz = zc + 3.1;
  fr.b.box(0, 0.5 + 0.18, uz, 0.36, 0.36, 0.36, BRASS[1], 'brass', { src, ry: 0.785 });
  incenseBowl(fr, L, 0, 0.86, uz, { r: 0.16, h: 0.08, n: 5, stick: 0.5, seed: 931 });
  garland(fr, [-1.25, 0.52, zc + 2.8], [1.25, 0.52, zc + 2.8], 0.02, 932, 0.08);
  for (const s of [-1, 1]) {
    fr.b.box(s * 0.9, 0.62, uz - 0.1, 0.14, 0.2, 0.14, BRASS[0], 'brass', { src });
    lotusBud(fr, s * 0.9, 0.7, uz - 0.1, 0.3, 933 + s);
  }

  // A tree behind, ferns about.
  const tg = fr.grid(1, { seed: 940, mat: 'mapBark' });
  fr.ghostLand(tg, 1, -8, 8, -10, 3);
  growTree(tg, 3, fr.landRow(3, -7, 1), -7, { trunk: 8, radius: 5, squash: 0.55, seed: 941, bark: TREE_BARK, lean: [-1, 1] });
  growTree(tg, -5, fr.landRow(-5, -5, 1), -5, { trunk: 5, radius: 3.5, squash: 0.6, seed: 942, lean: [-1, 0] });
  tg.commit();
  plantsAround(fr, { n: 30, r0: 3.2, r1: 7.5, seed: 943, keepOut: (x, z) => Math.abs(x) < 3.4 && z > -5.6 && z < 1.4 });
}
