import { LOAD_TEMPLE } from './_loadTemple';

/**
 * Inline SVG icons of the map interface. All use `currentColor` unless they
 * carry their own palette (the temple), so CSS colours them per state.
 */

const svg = (body: string, view = '0 0 24 24', extra = '') => `<svg class="mu-icon" viewBox="${view}" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;

/** A cloud of three puffs (x 4.3–19.9, y 4.2–14.7), for the weather icons: fill it. */
const CLOUD = '<circle cx="7.6" cy="11.4" r="3.3"/><circle cx="12.2" cy="8.8" r="4.6"/><circle cx="16.8" cy="11.6" r="3.1"/><rect x="7.6" y="10.6" width="9.2" height="4.1"/>';

/**
 * A graphics level: four bars rising to the right, on a 16 grid (one cell a
 * pixel at the interface's 1× size), the first `lit` of them full and the
 * rest faint, so the level reads at a glance (`extra`: more cells on the
 * same grid, drawn full).
 */
const bars = (lit: number, extra = '') =>
  svg(
    [0, 1, 2, 3].map((i) => `<rect x="${1 + i * 4}" y="${11 - i * 3}" width="2" height="${3 + i * 3}" fill="currentColor"${i < lit ? '' : ' fill-opacity=".3"'}/>`).join('') + extra,
    '0 0 16 16',
    ' shape-rendering="crispEdges"',
  );

/** A four-point sparkle, 7 × 7 cells in the bars' empty top-left corner (x 0–6, y 0–6). */
const SPARKLE = '<path fill="currentColor" d="M3 0h1v2h1v1h2v1h-2v1h-1v2h-1v-2h-1v-1h-2v-1h2v-1h1z"/>';

export const ICON = {
  /** The game's logo: the loading screen's Angkor Wat (_loadTemple.ts), on the title card, the cards that ask and the big map. */
  temple: LOAD_TEMPLE.svg.replace('<svg ', '<svg class="mu-icon mu-temple" '),
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
  heart: svg('<path fill="currentColor" d="M12 20.6 10.6 19.3C5.6 14.8 2.4 11.9 2.4 8.3 2.4 5.4 4.7 3.2 7.5 3.2c1.7 0 3.3.8 4.5 2 1.2-1.2 2.8-2 4.5-2 2.8 0 5.1 2.2 5.1 5.1 0 3.6-3.2 6.5-8.2 11L12 20.6Z"/>'),
  /**
   * The settings' tabs (ui.ts; sound is `speaker`): General (three sliders), Graphics (a picture
   * with a sun and hills), Play (a game pad), About (the heart, outlined).
   */
  sliders: svg(
    '<path d="M4 7h8M18 7h2M4 12h2M12 12h8M4 17h9M19 17h1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="15" cy="7" r="2.6" fill="currentColor"/><circle cx="9" cy="12" r="2.6" fill="currentColor"/><circle cx="16" cy="17" r="2.6" fill="currentColor"/>',
  ),
  picture: svg(
    '<rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="16.2" cy="9.6" r="1.7" fill="currentColor"/>' +
      '<path d="M5.4 17l4-5 3.2 3.6 2.2-2.4 3.8 3.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  gamepad: svg(
    '<path d="M7.6 7.4h8.8a4.6 4.6 0 0 1 4.5 5.4l-.7 3.6a2.6 2.6 0 0 1-4.3 1.5L14.2 15.6H9.8l-1.7 2.3a2.6 2.6 0 0 1-4.3-1.5l-.7-3.6a4.6 4.6 0 0 1 4.5-5.4Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path d="M8.4 10.2v3.4M6.7 11.9h3.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="15.6" cy="11" r="1.15" fill="currentColor"/><circle cx="17.9" cy="13.2" r="1.15" fill="currentColor"/>',
  ),
  heartLine: svg('<path d="M12 20.6 10.6 19.3C5.6 14.8 2.4 11.9 2.4 8.3 2.4 5.4 4.7 3.2 7.5 3.2c1.7 0 3.3.8 4.5 2 1.2-1.2 2.8-2 4.5-2 2.8 0 5.1 2.2 5.1 5.1 0 3.6-3.2 6.5-8.2 11L12 20.6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>'),
  /** The mini-map setting: shown (a folded map), the button only (a small bar), hidden (an eye struck through). */
  mapShow: svg('<path d="M3.5 6.2 9 4.2l6 2 5.5-2v13.6l-5.5 2-6-2-5.5 2z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M9 4.2v13.6M15 6.2v13.6" stroke="currentColor" stroke-width="1.9"/>'),
  mapButton: svg('<rect x="3.2" y="8.2" width="17.6" height="7.6" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M7.2 12h9.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  mapHide: svg(
    '<mask id="mu-eye-cut"><rect width="24" height="24" fill="#fff"/><path d="M4.2 20.4 19.8 3.6" stroke="#000" stroke-width="5"/></mask>' +
      '<g mask="url(#mu-eye-cut)"><path d="M2.6 12s3.5-6 9.4-6 9.4 6 9.4 6-3.5 6-9.4 6-9.4-6-9.4-6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.7" fill="currentColor"/></g>' +
      '<path d="M5 19.6 19 4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ),
  /** A cup of coffee, steaming, on a saucer (the support button): pixel cells on a 16 grid. */
  coffee: svg(
    '<g fill="currentColor"><path d="M5 1h1v1H5zM4 2h1v1H4zM5 3h1v1H5zM9 1h1v1H9zM8 2h1v1H8zM9 3h1v1H9z" fill-opacity=".6"/>' +
      '<path d="M2 5h10v6h-1v1H3v-1H2zM12 6h2v1h-2zM14 7h1v2h-1zM12 9h2v1h-2zM1 13h14v1H1z"/><path d="M3 6h8v1H3z" fill="#000" fill-opacity=".28"/></g>',
    '0 0 16 16',
    ' shape-rendering="crispEdges"',
  ),
  close: svg('<path d="m6.5 6.5 11 11m0-11-11 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  /** Hourglass: "coming soon". */
  hourglass: svg('<path d="M7 3.5h10M7 20.5h10M8 3.5c0 5 8 5 8 8.5s-8 3.5-8 8.5m8-17c0 5-8 5-8 8.5s8 3.5 8 8.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  /** Small diamond ornament. */
  diamond: svg('<path fill="currentColor" d="m12 5 7 7-7 7-7-7z"/>'),
  play: svg('<path fill="currentColor" d="M8 5.2v13.6c0 .8.9 1.3 1.6.8l10-6.8c.6-.4.6-1.2 0-1.6l-10-6.8C8.9 3.9 8 4.4 8 5.2Z"/>'),
  /** The weather setting: follow the season (the sun behind a cloud), rainy (drops), stormy (a bolt); clear is the sun. */
  season: svg(
    `<mask id="mu-wx-behind"><rect width="24" height="24" fill="#fff"/><g transform="translate(4.4 8) scale(.82)" stroke="#000" stroke-width="3.4">${CLOUD}</g></mask>` +
      `<g mask="url(#mu-wx-behind)"><circle cx="8.6" cy="9.6" r="3.4" fill="currentColor"/><g stroke="currentColor" stroke-width="1.9" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => `<path d="M8.6 3.3v1.6" transform="rotate(${i * 45} 8.6 9.6)"/>`).join('')}</g></g>` +
      `<g transform="translate(4.4 8) scale(.82)" fill="currentColor">${CLOUD}</g>`,
  ),
  rain: svg(`<g transform="translate(-1.2 -1.8) scale(1.1)" fill="currentColor">${CLOUD}</g><path d="M8.3 16.9 6.9 21M12.7 16.9 11.3 21M17.1 16.9 15.7 21" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>`),
  storm: svg(`<g transform="translate(-1.2 -1.8) scale(1.1)" fill="currentColor">${CLOUD}</g><path fill="currentColor" d="M14.2 13.4 8.6 19.9h3.9l-1.7 4.1 6.2-7.2h-3.9l2.3-3.4Z"/>`),
  /** The graphics setting: one bar lit (low) to all four (max); Auto: none lit, a sparkle picks. */
  auto: bars(0, SPARKLE),
  bars1: bars(1),
  bars2: bars(2),
  bars3: bars(3),
  bars4: bars(4),
  /** The resolution's whole steps (crisp: each pixel a square of screen dots): the sparkle alone, on its 7 × 7 cells. */
  sharp: svg(SPARKLE, '0 0 7 7', ' shape-rendering="crispEdges"'),
};
