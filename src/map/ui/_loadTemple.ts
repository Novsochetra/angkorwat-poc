/**
 * The loading screen's Angkor Wat (map.html, main.ts): the west front in pixel
 * art on a grid of `cols` × `rows` cells. It rises row by row while the map
 * builds.
 *
 * Back to front: the five lotus-bud towers (the rear pair peeking between the
 * front pair and the centre), the top gallery with its gate over the Bakan's
 * high base and steep stairs, the second gallery with its low corner towers,
 * then the long outer gallery with its colonnade, corner pavilions and the
 * three-portal west gate. Weathered sandstone lit by the setting sun from the
 * left.
 */

const W = 93;
const H = 70;
/** The axis (the grid is odd, so every spire ends in a one-cell tip). */
const CX = 46;

/** Sandstone at sunset, dark to light: violet in the shade, warm in the light. */
const STONE = ['#1c1420', '#2e2236', '#46333f', '#624648', '#835c4f', '#a8765a', '#cf9867', '#efbd7b', '#ffe1a0'];
const TOP = STONE.length - 1;

const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(''));

const put = (x: number, y: number, c: string) => {
  if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = c;
};
/** A stone tone, 0 (dark) … 8 (sunlit). */
const tone = (level: number) => STONE[Math.max(0, Math.min(TOP, Math.round(level)))];
/** Light across a body of half-width w: +2 at its lit left edge … -2 at its shaded right. */
const lit = (dx: number, w: number) => {
  const f = w ? dx / w : 0;
  return f < -0.7 ? 2 : f < -0.2 ? 1 : f < 0.25 ? 0 : f < 0.7 ? -1 : -2;
};
/** A row of a body w wide around cx, at base tone `level`, shaded left to right. */
const band = (cx: number, y: number, w: number, level: number) => {
  for (let dx = -w; dx <= w; dx++) put(cx + dx, y, tone(level + lit(dx, w)));
};
const hline = (x0: number, x1: number, y: number, level: number) => {
  for (let x = x0; x <= x1; x++) put(x, y, tone(level));
};
const fill = (x0: number, y0: number, x1: number, y1: number, level: number) => {
  for (let y = y0; y <= y1; y++) hline(x0, x1, y, level);
};
/** Darken what is already drawn (a cast shadow). */
const darken = (x0: number, y0: number, x1: number, y1: number, by: number) => {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = STONE.indexOf(grid[y][x]);
      if (i >= 0) grid[y][x] = tone(i - by);
    }
};

/**
 * A Khmer pediment: a steep pointed gable framed by a naga, flames along its
 * slopes, the heads curling up at the two lower ends, a carved field inside.
 */
const pediment = (cx: number, base: number, hw: number) => {
  const rows = hw + (hw >= 4 ? 1 : 0);
  for (let k = 0; k <= rows; k++) {
    const w = Math.round(hw * (1 - k / rows));
    const y = base - k;
    for (let dx = -w; dx <= w; dx++) {
      const frame = Math.abs(dx) === w || k === 0;
      put(cx + dx, y, frame ? tone(dx < 0 ? 7 : dx === 0 ? 6 : 4) : tone(dx < 0 ? 3 : 2));
    }
    if (k % 2 === 1 && w > 0 && k < rows) put(cx - w - 1, y, tone(6)), put(cx + w + 1, y, tone(3));
  }
  if (hw >= 4) put(cx, base - 2, tone(5)), put(cx, base - 1, tone(4));
  put(cx, base - rows - 1, tone(6));
  put(cx - hw - 1, base - 1, tone(8));
  put(cx + hw + 1, base - 1, tone(4));
};

/**
 * A lotus-bud spire from its tip down to `bottom`: tiers along a bullet-shaped
 * profile, each a sunlit ledge with leaf antefixes (staggered, like the grains
 * of a corncob) and a horn at each end that notches the outline. `part` < 1
 * draws only the lower part of the bud, capped flat (a truncated tower).
 */
const bud = (cx: number, tip: number, bottom: number, r: number, part = 1) => {
  const n = bottom - tip;
  let y = bottom;
  let i = 0;
  let w = r;
  while (y > tip + 1) {
    const s = ((bottom - y) / n) * part;
    w = Math.max(1, Math.round(r * (1 - Math.pow(s, 2.6))));
    const h = w >= 3 ? 4 : 2;
    band(cx, y, w, 6);
    for (let k = 1; k < h && y - k > tip; k++) {
      const fw = w - 1;
      for (let dx = -fw; dx <= fw; dx++) {
        const grain = (dx + i + 64) % 2 === 0;
        put(cx + dx, y - k, tone((grain ? 5 : 3) + lit(dx, fw) - (k === h - 1 ? 1 : 0)));
      }
    }
    if (w >= 3) {
      put(cx, y - 3, tone(6));
      put(cx - 1, y - 2, tone(7)), put(cx, y - 2, tone(2)), put(cx + 1, y - 2, tone(4));
      put(cx, y - 1, tone(1));
    }
    if (w >= 2) {
      put(cx - w, y - 1, tone(8));
      put(cx + w, y - 1, tone(4));
      put(cx - w + 1, y - 1, tone(2));
      put(cx + w - 1, y - 1, tone(1));
    }
    y -= h;
    i++;
  }
  if (part < 1) {
    band(cx, y + 1, w - 1, 6);
    put(cx, y, tone(6));
    return;
  }
  // The lotus finial.
  for (let yy = tip; yy <= y; yy++) put(cx, yy, tone(yy === tip ? 6 : 7));
};

/**
 * A tower's body: the sanctuary with its dark door under a pediment, a cornice
 * over it, and the roofs of its side porches sloping away on both sides.
 */
const sanctuary = (cx: number, top: number, base: number, r: number) => {
  for (let k = 1; k <= 3 && top + k <= base; k++) {
    for (let dx = r + 1; dx <= r + k; dx++) {
      put(cx - dx, top + k, tone(dx === r + k ? 7 : 5));
      put(cx + dx, top + k, tone(dx === r + k ? 3 : 2));
    }
  }
  band(cx, top, r + 1, 6);
  for (let y = top + 1; y <= base; y++) band(cx, y, r, y === top + 1 ? 2 : 4);
  for (let y = top + 2; y <= base; y++) put(cx - r + 1, y, tone(3)), put(cx + r - 1, y, tone(1));
  fill(cx - 1, base - 2, cx + 1, base, 0);
  pediment(cx, base - 3, 3);
};

/** A whole tower: bud, body, and its shadow on what stands right of it. */
const tower = (cx: number, tip: number, bodyTop: number, base: number, r: number) => {
  darken(cx + r + 2, tip + 4, cx + r + 3, base, 2);
  bud(cx, tip, bodyTop - 1, r);
  sanctuary(cx, bodyTop, base, r);
};

/**
 * A gallery roof seen from the front: a sunlit ridge, the tiled slope (stone
 * ribs) widening to the eave, then (`lean`) the lower roof over the outer
 * half-gallery, and a dark shadow under the eave.
 */
const roof = (x0: number, x1: number, ridge: number, slope: number, lean = 0) => {
  hline(x0, x1, ridge, 7);
  let y = ridge;
  for (let k = 1; k <= slope + lean; k++) {
    y++;
    const low = k > slope;
    for (let x = x0 - k; x <= x1 + k; x++) put(x, y, tone(low && k === slope + 1 ? 6 : x % 2 ? 5 : 4));
  }
  hline(x0 - slope - lean, x1 + slope + lean, y + 1, 1);
};

/** A colonnade: square pillars (lit left face, shaded right) on the dark gallery behind. */
const colonnade = (x0: number, x1: number, top: number, bot: number) => {
  hline(x0, x1, top, 6);
  for (let y = top + 1; y <= bot; y++)
    for (let x = x0; x <= x1; x++) {
      const p = (x - x0) % 4;
      put(x, y, p === 0 ? tone(7) : p === 1 ? tone(4) : tone(y === top + 1 ? 0 : 1));
    }
};

/** A wall with balustered windows. */
const windowWall = (x0: number, x1: number, top: number, bot: number) => {
  for (let y = top; y <= bot; y++)
    for (let x = x0; x <= x1; x++) {
      const p = (x - x0) % 5;
      const win = y > top && y < bot && p >= 2;
      put(x, y, win ? (p === 3 ? tone(4) : tone(2)) : tone(y === bot ? 4 : 5));
    }
};

/** A blind wall: courses of stone between pilasters, false windows here and there. */
const blindWall = (x0: number, x1: number, top: number, bot: number) => {
  for (let y = top; y <= bot; y++)
    for (let x = x0; x <= x1; x++) {
      const p = (x - x0) % 8;
      const win = y > top && y < bot && (p === 3 || p === 5);
      put(x, y, win ? tone(2) : p === 4 && y > top && y < bot ? tone(4) : tone(p === 0 ? 6 : y === top ? 3 : y === bot ? 4 : 5));
    }
};

/** A molded base: a sunlit top edge over shadowed bands. */
const plinth = (x0: number, x1: number, y: number, rows: number) => {
  for (let k = 0; k < rows; k++) hline(x0 - k, x1 + k, y + k, k === 0 ? 7 : k % 2 ? 4 : 5);
};

/** Steep stairs: sunlit treads, shadowed risers, between two side walls. */
const stairs = (cx: number, top: number, bot: number, hw: number) => {
  for (let y = top; y <= bot; y++) {
    for (let dx = -hw; dx <= hw; dx++) put(cx + dx, y, tone((bot - y) % 2 ? 2 : 6 + lit(dx, hw) / 2));
    put(cx - hw - 1, y, tone(6));
    put(cx + hw + 1, y, tone(2));
  }
};

/** A gate pavilion: stacked pediments (the back ones higher, narrower) over a front with a dark door. */
const gate = (cx: number, roofY: number, base: number, hw: number, tiers: number) => {
  darken(cx + hw + 1, roofY - tiers * 2, cx + hw + 2, base, 2);
  for (let i = tiers - 1; i >= 0; i--) {
    const y = roofY - i * 3;
    const w = hw - 1 - i * 2;
    if (i > 0) band(cx, y + 1, w + 1, 4);
    pediment(cx, y, w);
  }
  for (let y = roofY + 1; y <= base; y++) band(cx, y, hw, 5);
  const doorTop = Math.max(roofY + 2, base - 4);
  fill(cx - 1, doorTop, cx + 1, base, 0);
  for (let y = doorTop; y <= base; y++) put(cx - 2, y, tone(8)), put(cx + 2, y, tone(3));
};

/** The Bakan's high base: stepped courses widening downwards, in the shade of the gallery above. */
const bakan = (top: number, bot: number, hw: number) => {
  for (let y = top; y <= bot; y++) {
    const w = hw + Math.floor((y - top) / 2);
    band(CX, y, w, (y - top) % 2 ? 3 : 4);
    put(CX - w, y, tone((y - top) % 2 ? 5 : 7));
  }
};

// The five towers: the rear pair peeks between the front pair and the centre.
tower(CX - 13, 8, 33, 40, 5);
tower(CX + 13, 8, 33, 40, 5);
tower(CX, 0, 31, 39, 7);
// The top gallery (Bakan) with its gate before the central tower, over the
// Bakan's high base and its three steep stairs.
roof(CX - 22, CX + 22, 36, 1);
windowWall(CX - 24, CX + 24, 39, 42);
pediment(CX, 33, 3);
gate(CX, 37, 42, 5, 1);
tower(CX - 22, 13, 35, 42, 5);
tower(CX + 22, 13, 35, 42, 5);
bakan(43, 48, 26);
for (const x of [CX - 22, CX, CX + 22]) stairs(x, 43, 48, x === CX ? 2 : 1);
// The second gallery and its corner towers (lower, cut short).
bud(CX - 34, 38, 47, 3, 0.75);
bud(CX + 34, 38, 47, 3, 0.75);
roof(CX - 34, CX + 34, 47, 2);
blindWall(CX - 37, CX + 37, 51, 54);
// The outer gallery: roof over the half-gallery, colonnade, corner pavilions
// and the three-portal west gate.
roof(3, W - 4, 55, 1, 2);
colonnade(1, W - 2, 60, 64);
plinth(1, W - 2, 65, 2);
gate(5, 57, 64, 4, 2);
gate(W - 6, 57, 64, 4, 2);
gate(CX - 9, 59, 65, 4, 1);
gate(CX + 9, 59, 65, 4, 1);
gate(CX, 57, 65, 7, 3);
plinth(0, W - 1, 67, 3);
stairs(CX, 66, H - 1, 3);

// The last sun still on the tower tops (dithered into the dusk below).
for (let y = 0; y < 20; y++)
  for (let x = 0; x < W; x++) {
    const i = STONE.indexOf(grid[y][x]);
    if (i >= 2 && i < TOP && (y < 14 || (y < 18 && (x + y) % 2 === 0))) grid[y][x] = tone(i + 1);
  }

/**
 * Weathering: some mid-tone stones turn grey-brown in short vertical streaks
 * (rain and lichen), more on the old lower galleries; moss on the lowest courses.
 */
const WORN: Record<number, string> = { 3: '#5b4a4d', 4: '#76655f', 5: '#958070' };
const MOSS = '#56603a';
const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = STONE.indexOf(grid[y][x]);
    if (!WORN[i]) continue;
    const streak = hash(x, Math.floor((y + (x % 3)) / 3));
    if (y > 16 && streak < (y / H) * 0.18) grid[y][x] = WORN[i];
    else if (y > H - 16 && i === 3 && hash(x + 7, y) < 0.12) grid[y][x] = MOSS;
  }

/**
 * The grid as an SVG: one path per colour, a unit-high rectangle per run of
 * same-colour cells (a few nodes, not thousands: main.ts shows three copies).
 */
function toSvg(): string {
  const runs = new Map<string, string>();
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      let e = x + 1;
      while (e < W && grid[y][e] === c) e++;
      if (c) runs.set(c, `${runs.get(c) ?? ''}M${x} ${y}h${e - x}v1h-${e - x}z`);
      x = e;
    }
  }
  const body = [...runs].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${body}</svg>`;
}

export const LOAD_TEMPLE = { svg: toSvg(), cols: W, rows: H };
