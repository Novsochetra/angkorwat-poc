/**
 * Inline SVG icons of the map interface. All use `currentColor` unless they
 * carry their own palette (the temple), so CSS colours them per state.
 */

const svg = (body: string, view = '0 0 24 24', extra = '') => `<svg class="mu-icon" viewBox="${view}" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

/**
 * The title's temple: a pixel-art Angkor front — five lotus-bud towers over a
 * long gallery with a gate. Drawn on a grid (one rect per run of same-colour
 * cells), sandstone lit from the left.
 */
function templeIcon(): string {
  const W = 36;
  const H = 27;
  const grid: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(''));
  const put = (x: number, y: number, c: string) => {
    if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = c;
  };
  // Sandstone tones: highlight, light, mid, shade, deep shade, dark openings.
  const C = { h: '#fde7c4', l: '#f3cfa3', m: '#e0b387', s: '#bf8d68', d: '#94684c', k: '#3a2a26' };
  /** A lotus-bud tower: stepped tiers every other row, lit left, shaded right. */
  const tower = (cx: number, top: number, base: number, hw: number) => {
    const n = base - top;
    for (let y = top; y <= base; y++) {
      const t = (y - top) / n;
      const ledge = (base - y) % 2 === 0 && y > top + 1;
      const w = Math.round(hw * Math.pow(t, 0.62)) + (ledge ? 1 : 0);
      for (let x = cx - w; x <= cx + w; x++) {
        const side = x - cx;
        let c = side < 0 ? C.l : side === 0 ? C.m : C.s;
        if (ledge) c = side < 0 ? C.h : side === 0 ? C.l : C.m;
        if (side === w && w > 0) c = C.d;
        put(x, y, c);
      }
    }
    put(cx, top - 1, C.m); // finial
  };
  // Back to front: outer pair, inner pair, centre.
  tower(4, 10, 17, 3);
  tower(31, 10, 17, 3);
  tower(10, 6, 17, 3.4);
  tower(25, 6, 17, 3.4);
  // The centre tower is two cells wide at its tip (the grid is even).
  tower(17, 1, 16, 4.6);
  tower(18, 1, 16, 4.6);
  // Gallery roof (two stepped rows), wall, base.
  for (let x = 2; x <= 33; x++) put(x, 17, x < 18 ? C.h : C.l);
  for (let x = 1; x <= 34; x++) put(x, 18, x < 18 ? C.m : C.s);
  for (let y = 19; y <= 23; y++)
    for (let x = 2; x <= 33; x++) {
      const pillar = (x - 2) % 4 === 0;
      put(x, y, pillar ? C.h : x < 18 ? C.l : C.m);
    }
  // Windows between pillars.
  for (const wx of [4, 8, 27, 31]) for (let y = 20; y <= 22; y++) put(wx, y, C.k), put(wx + 1, y, C.k);
  // The gate: a pediment rising above the roof, a dark door.
  for (let y = 14; y <= 18; y++) {
    const w = y - 13;
    for (let x = 17 - w - 1; x <= 18 + w + 1; x++) put(x, y, x <= 17 ? C.h : C.m);
  }
  for (let y = 15; y <= 18; y++) put(17, y, C.l), put(18, y, C.l);
  put(17, 16, C.d), put(18, 16, C.d);
  for (let y = 19; y <= 24; y++) for (let x = 14; x <= 21; x++) put(x, y, x === 14 || x === 21 ? C.h : C.l);
  for (let y = 20; y <= 24; y++) for (let x = 16; x <= 19; x++) put(x, y, C.k);
  // Base platform.
  for (let x = 0; x <= 35; x++) put(x, 24, x >= 16 && x <= 19 ? C.k : C.h), put(x, 25, C.m), put(x, 26, C.d);
  let rects = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      let e = x + 1;
      while (e < W && grid[y][e] === c) e++;
      if (c) rects += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${c}"/>`;
      x = e;
    }
  }
  return svg(rects, `0 0 ${W} ${H}`, ' shape-rendering="crispEdges"');
}

export const ICON = {
  temple: templeIcon(),
  /** Map pin with a hole (evenodd). */
  pin: svg('<path fill="currentColor" fill-rule="evenodd" d="M12 1.6c-4.6 0-8.2 3.5-8.2 8 0 5.4 6.6 11.6 7.4 12.3.46.42 1.14.42 1.6 0 .8-.7 7.4-6.9 7.4-12.3 0-4.5-3.6-8-8.2-8Zm0 4.9a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4Z"/>'),
  chevron: svg('<path d="M9 5.5 15.5 12 9 18.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  back: svg('<path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  arrow: svg('<path d="M4.5 12h14M13 6.5 18.5 12 13 17.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  /** Eight-toothed gear. */
  gear: svg(
    `<g fill="currentColor">${Array.from({ length: 8 }, (_, i) => `<rect x="10.2" y="1.8" width="3.6" height="5" rx=".6" transform="rotate(${i * 45} 12 12)"/>`).join('')}</g>` +
      '<circle cx="12" cy="12" r="6.1" fill="none" stroke="currentColor" stroke-width="3.4"/>',
  ),
  speaker: svg(
    '<path fill="currentColor" d="M3.5 9.2h3.6L12 5.3v13.4l-4.9-3.9H3.5z"/>' +
      '<path d="M15.2 9.2a4 4 0 0 1 0 5.6M17.8 6.7a7.6 7.6 0 0 1 0 10.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ),
  muted: svg(
    '<path fill="currentColor" d="M3.5 9.2h3.6L12 5.3v13.4l-4.9-3.9H3.5z"/>' +
      '<path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ),
  /** Paper plane, outline (the hint line). */
  plane: svg('<path d="M21 3.2 2.8 10.4l7.1 3.1 3.2 7.3L21 3.2Zm-11.1 10.3 5.2-5.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'),
  sun: svg(
    '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>' +
      `<g stroke="currentColor" stroke-width="2" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => `<path d="M12 2.6v2.2" transform="rotate(${i * 45} 12 12)"/>`).join('')}</g>`,
  ),
  moon: svg('<path fill="currentColor" d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2Z"/>'),
  cycle: svg(
    '<path d="M4.6 12a7.4 7.4 0 0 1 12.9-5M19.4 12a7.4 7.4 0 0 1-12.9 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path fill="currentColor" d="m18.6 3.4.3 4.9-4.9-.3zM5.4 20.6l-.3-4.9 4.9.3z"/>',
  ),
  close: svg('<path d="m6.5 6.5 11 11m0-11-11 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  /** Hourglass: "coming soon". */
  hourglass: svg('<path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5m8-17c0 5-8 5-8 8.5s8 3.5 8 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  /** Small diamond ornament. */
  diamond: svg('<path fill="currentColor" d="m12 5 7 7-7 7-7-7z"/>'),
  play: svg('<path fill="currentColor" d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8c.6-.4.6-1.2 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2Z"/>'),
};
