/**
 * Little pictures of the mini-map and the big map: the temple icon (pixel
 * art, as a canvas sprite and as SVG), the explorer's arrow, the boat, the
 * rim arrow and the beacon, as paths drawn round (0, 0) pointing up.
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

/** The temple with a one-pixel dark outline: rows of colour keys (`.` empty, `o` outline). */
function outlined(): string[] {
  const h = TEMPLE.length + 2;
  const w = TEMPLE[0].length + 2;
  const at = (x: number, y: number) => TEMPLE[y - 1]?.[x - 1] ?? '.';
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c !== '.') row += c;
      else {
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy) !== '.') near = true;
        row += near ? 'o' : '.';
      }
    }
    rows.push(row);
  }
  return rows;
}
const ICON_ROWS = outlined();
/** Size of the temple icon in its pixels. */
export const TEMPLE_SIZE = { w: ICON_ROWS[0].length, h: ICON_ROWS.length };

/** The temple icon as a canvas, `k` device px per icon pixel (gold: the target). */
export function templeSprite(k: number, gold = false): HTMLCanvasElement {
  const pal = gold ? GOLD : STONE;
  const cv = document.createElement('canvas');
  cv.width = TEMPLE_SIZE.w * k;
  cv.height = TEMPLE_SIZE.h * k;
  const g = cv.getContext('2d')!;
  ICON_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      g.fillStyle = pal[row[x]];
      g.fillRect(x * k, y * k, k, k);
    }
  });
  return cv;
}

/** The temple icon as SVG (for the big map's place buttons). */
export function templeSvg(cls: string): string {
  const rects = (pal: Record<string, string>, extra: string) => {
    let s = '';
    ICON_ROWS.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let e = x + 1;
        while (e < row.length && row[e] === c) e++;
        if (c !== '.') s += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${pal[c]}"/>`;
        x = e;
      }
    });
    return `<g class="${extra}">${s}</g>`;
  };
  return `<svg class="${cls}" viewBox="0 0 ${TEMPLE_SIZE.w} ${TEMPLE_SIZE.h}" aria-hidden="true" shape-rendering="crispEdges">${rects(STONE, 'is-stone')}${rects(GOLD, 'is-gold')}</svg>`;
}

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
