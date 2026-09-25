/**
 * Little pictures of the mini-map and the big map: the temple icon and the
 * hang glider of a take-off ramp (pixel art, as canvas sprites and as SVG),
 * the explorer's arrow, the boat, the rim arrow and the beacon, as paths
 * drawn round (0, 0) pointing up.
 */

/** A temple (three towers over a gallery with a door), lit from the left. `.` = empty. */
const TEMPLE = [
  '.....l.....',
  '....lms....',
  '.l..lms..s.',
  'lms.lms.lms',
  'lms.lms.lms',
  'hhhhhhhhhhh',
  'lklllmsskss',
  'llllkkkssss',
  'mmmmmmmmmmm',
];
const STONE: Record<string, string> = { h: '#fde7c4', l: '#efc594', m: '#d4a273', s: '#b07c58', k: '#3a2a26', o: 'rgba(24, 16, 12, 0.88)' };
const GOLD: Record<string, string> = { h: '#fff3b8', l: '#ffd54a', m: '#f7b733', s: '#d8901c', k: '#4e2f08', o: 'rgba(40, 22, 4, 0.92)' };

/**
 * A hang glider, as the signs draw it: the wing in the explorer's colours
 * (a gold leading edge, saffron in the middle, red tips; lit from the left)
 * over its pale A-frame, the pilot's head in it and his body under the bar.
 * The frame and the pilot (`l`, `h`, `p`) get no outline: they stay thin.
 */
const WING = [
  '.......G.......',
  '.....GGagg.....',
  '...GGaaabbgg...',
  '.GGrraaabbssgg.',
  'GGrr..l.l..ssgg',
  'rr...l.h.l...ss',
  '....lllllll....',
  '......ppp......',
];
const WING_PAL: Record<string, string> = {
  G: '#ffe07c',
  g: '#e9b84b',
  a: '#f7a531',
  b: '#e2831a',
  r: '#b8322a',
  s: '#8c1e1b',
  l: '#d9d4c8',
  h: '#dcae8f',
  p: '#8a6038',
  o: 'rgba(24, 16, 12, 0.88)',
};

/** Pixel art with a one-pixel dark outline round every colour but the `bare` ones: rows of colour keys (`.` empty, `o` outline). */
function outlined(art: string[], bare = ''): string[] {
  const h = art.length + 2;
  const w = art[0].length + 2;
  const at = (x: number, y: number) => art[y - 1]?.[x - 1] ?? '.';
  const edged = (x: number, y: number) => at(x, y) !== '.' && !bare.includes(at(x, y));
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c !== '.') row += c;
      else {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (edged(x + dx, y + dy)) near = true;
        row += near ? 'o' : '.';
      }
    }
    rows.push(row);
  }
  return rows;
}
const ICON_ROWS = outlined(TEMPLE);
const WING_ROWS = outlined(WING, 'lhp');
/** Size of the temple icon and of the glider in their pixels. */
export const TEMPLE_SIZE = { w: ICON_ROWS[0].length, h: ICON_ROWS.length };
export const WING_SIZE = { w: WING_ROWS[0].length, h: WING_ROWS.length };

/** Pixel art on a canvas, its top left at (x0, y0), `k` device px per pixel. */
function paint(g: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, k: number, x0 = 0, y0 = 0): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      g.fillStyle = pal[row[x]];
      g.fillRect(x0 + x * k, y0 + y * k, k, k);
    }
  });
}

/** The temple icon as a canvas, `k` device px per icon pixel (gold: the target). */
export function templeSprite(k: number, gold = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = TEMPLE_SIZE.w * k;
  cv.height = TEMPLE_SIZE.h * k;
  paint(cv.getContext('2d')!, ICON_ROWS, gold ? GOLD : STONE, k);
  return cv;
}

/**
 * A take-off ramp on the mini-map: the glider on a small dark badge with a
 * cream ring (a gold one and a warm badge: the target), `k` device px per
 * glider pixel.
 */
export function rampSprite(k: number, gold = false): HTMLCanvasElement {
  const w = WING_SIZE.w * k;
  const h = WING_SIZE.h * k;
  const ring = gold ? 1.6 * k : Math.max(1, 0.9 * k);
  const r = w / 2 + k;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(2 * r + ring);
  const c = cv.width / 2;
  const g = cv.getContext('2d')!;
  g.beginPath();
  g.arc(c, c, r, 0, Math.PI * 2);
  g.fillStyle = gold ? 'rgba(58, 38, 8, 0.94)' : 'rgba(10, 18, 30, 0.86)';
  g.fill();
  g.lineWidth = ring;
  g.strokeStyle = gold ? '#ffd54a' : 'rgba(255, 236, 200, 0.72)';
  g.stroke();
  paint(g, WING_ROWS, WING_PAL, k, Math.round(c - w / 2), Math.round(c - h / 2));
  return cv;
}

/** Pixel art as SVG: one rect per run of a colour, a group per palette (with its class). */
function pixelSvg(rows: string[], cls: string, looks: [Record<string, string>, string][]): string {
  const rects = (pal: Record<string, string>, extra: string) => {
    let s = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let e = x + 1;
        while (e < row.length && row[e] === c) e++;
        if (c !== '.') s += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${pal[c]}"/>`;
        x = e;
      }
    });
    return extra ? `<g class="${extra}">${s}</g>` : s;
  };
  return `<svg class="${cls}" viewBox="0 0 ${rows[0].length} ${rows.length}" aria-hidden="true" shape-rendering="crispEdges">${looks.map(([pal, extra]) => rects(pal, extra)).join('')}</svg>`;
}

/** The temple icon as SVG (for the big map's place buttons). */
export const templeSvg = (cls: string) =>
  pixelSvg(ICON_ROWS, cls, [
    [STONE, 'is-stone'],
    [GOLD, 'is-gold'],
  ]);
/** The glider as SVG (the big map's ramps, its legend and button, the toast). */
export const wingSvg = (cls: string) => pixelSvg(WING_ROWS, cls, [[WING_PAL, '']]);

/** The explorer: an arrow pointing up (his facing), about 16 px long. */
export const ARROW_PATH = 'M0 -8.5L6.2 7.5L0 3.6L-6.2 7.5Z';
/** The boat under him: a hull, bow up. */
export const BOAT_PATH = 'M0 -12L3.8 -6.5L3.8 7L0 10.5L-3.8 7L-3.8 -6.5Z';
/** The way to the target, on the rim: a chevron pointing up (out of the map). */
export const RIM_PATH = 'M0 -8L8.5 4.5L0 1L-8.5 4.5Z';
/** A place's beacon (the target's): a small diamond. */
export const BEACON_PATH = 'M0 -4.5L4.5 0L0 4.5L-4.5 0Z';

/** The explorer's arrow as SVG (the big map's "you are here"). */
export const ARROW_SVG = `<svg viewBox="-9 -11 18 21" aria-hidden="true"><path d="${ARROW_PATH}" fill="#fff6e4" stroke="#1b130d" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
