import type { PadButton, PadKind } from './pad';

/**
 * The pad's buttons drawn as the pad in hand has them (pad.ts): ✕ ○ □ △ in
 * their colours on a PlayStation pad, A B X Y on an Xbox one (and on others,
 * in plain letters), L1 / LB, the d-pad with the arm to press lit gold, the
 * sticks. Small SVGs, sized in `em`: as big as the text around them.
 *
 * Every `<kbd data-pad="<glyph>">` shows its glyph instead of its key while
 * the pad is in use, and its key again after (`swapKbds`, from pad.ts; new
 * ones are swapped as they appear). Change such a key later with `setKbd`.
 */

/** A button, or a group of them for hints: the whole d-pad, its ← → or ↑ ↓ arms, a stick. */
export type PadGlyph = PadButton | 'dpad' | 'dpadx' | 'dpady' | 'lstick' | 'rstick';

const CREAM = '#f8f0dc';
const DIM = 'rgba(248,240,220,0.42)';
const GOLD = '#f0c46a';
const DISC = '#101c2a';
const RING = 'rgba(248,240,220,0.55)';

/** The PlayStation symbols' own colours. */
const PS_FACE: Record<'south' | 'east' | 'west' | 'north', string> = { south: '#86b4ff', east: '#ff8080', west: '#f3a0dd', north: '#52dcb6' };
/** Xbox letters and colours (A green, B red, X blue, Y yellow). */
const XBOX_FACE: Record<'south' | 'east' | 'west' | 'north', [string, string]> = { south: ['A', '#6fd35a'], east: ['B', '#ff6a5c'], west: ['X', '#5aa6ff'], north: ['Y', '#ffd24a'] };

/** Names for screen readers (and titles). */
const PS_NAME: Partial<Record<PadGlyph, string>> = { south: 'Cross', east: 'Circle', west: 'Square', north: 'Triangle', select: 'Create', start: 'Options', touchpad: 'Touchpad', home: 'PS' };
const XBOX_NAME: Partial<Record<PadGlyph, string>> = { south: 'A', east: 'B', west: 'X', north: 'Y', l1: 'LB', r1: 'RB', l2: 'LT', r2: 'RT', select: 'View', start: 'Menu', l3: 'LS', r3: 'RS', home: 'Xbox' };
const NAME: Record<PadGlyph, string> = {
  south: 'A', east: 'B', west: 'X', north: 'Y', l1: 'L1', r1: 'R1', l2: 'L2', r2: 'R2', select: 'Select', start: 'Start', l3: 'L3', r3: 'R3',
  up: 'D-pad up', down: 'D-pad down', left: 'D-pad left', right: 'D-pad right', home: 'Home', touchpad: 'Touchpad',
  dpad: 'D-pad', dpadx: 'D-pad left and right', dpady: 'D-pad up and down', lstick: 'Left stick', rstick: 'Right stick',
};

/** The button's name as the pad in hand calls it ("Cross", "A", "L1", "LB"…). */
export function padName(g: PadGlyph, kind: PadKind): string {
  return (kind === 'ps' ? PS_NAME[g] : kind === 'xbox' ? XBOX_NAME[g] : undefined) ?? NAME[g];
}

const svg = (w: number, body: string) => `<svg viewBox="0 0 ${w} 20" width="${w}" height="20" aria-hidden="true" focusable="false">${body}</svg>`;
const disc = `<circle cx="10" cy="10" r="9.2" fill="${DISC}" stroke="${RING}" stroke-width="1"/>`;
const pill = (w: number) => `<rect x="0.6" y="2.6" width="${w - 1.2}" height="14.8" rx="5" fill="${DISC}" stroke="${RING}" stroke-width="1"/>`;
const text = (x: number, s: string, size: number, fill = CREAM) =>
  `<text x="${x}" y="${10 + size * 0.36}" text-anchor="middle" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-weight="700" font-size="${size}" fill="${fill}">${s}</text>`;

function face(g: 'south' | 'east' | 'west' | 'north', kind: PadKind): string {
  if (kind === 'ps') {
    const c = PS_FACE[g];
    const st = `fill="none" stroke="${c}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"`;
    const mark = {
      south: `<path d="M6.6 6.6L13.4 13.4M13.4 6.6L6.6 13.4" ${st}/>`,
      east: `<circle cx="10" cy="10" r="4.1" ${st}/>`,
      west: `<rect x="6.2" y="6.2" width="7.6" height="7.6" ${st}/>`,
      north: `<path d="M10 5.4L14.7 13.5H5.3Z" ${st}/>`,
    }[g];
    return svg(20, disc + mark);
  }
  const [letter, colour] = XBOX_FACE[g];
  return svg(20, disc + text(10, letter, 11, kind === 'xbox' ? colour : CREAM));
}

function dpad(lit: readonly ('up' | 'down' | 'left' | 'right')[]): string {
  const arm = (d: 'up' | 'down' | 'left' | 'right', x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.2" fill="${lit.includes(d) ? GOLD : DIM}"/>`;
  return svg(
    20,
    `<rect x="7.4" y="7.4" width="5.2" height="5.2" fill="${DIM}"/>` +
      arm('up', 7.4, 1.4, 5.2, 6.4) +
      arm('down', 7.4, 12.2, 5.2, 6.4) +
      arm('left', 1.4, 7.4, 6.4, 5.2) +
      arm('right', 12.2, 7.4, 6.4, 5.2),
  );
}

const stick = (letter: string) => svg(20, disc + `<circle cx="10" cy="10" r="5.6" fill="none" stroke="${DIM}" stroke-width="1"/>` + text(10, letter, 8.5));

function drawing(g: PadGlyph, kind: PadKind): string {
  switch (g) {
    case 'south':
    case 'east':
    case 'west':
    case 'north':
      return face(g, kind);
    case 'l1':
    case 'r1':
    case 'l2':
    case 'r2': {
      const s = kind === 'xbox' ? XBOX_NAME[g]! : g.toUpperCase();
      return svg(26, pill(26) + text(13, s, 9));
    }
    case 'l3':
    case 'r3':
      return stick(kind === 'xbox' ? XBOX_NAME[g]! : g.toUpperCase());
    case 'lstick':
      return stick('L');
    case 'rstick':
      return stick('R');
    case 'select':
      return kind === 'ps'
        ? // (PlayStation's Create: a small burst)
          svg(20, pill(20) + `<path d="M10 5.6v3M6.4 7.2l1.9 1.9M13.6 7.2l-1.9 1.9M7 12.6h6" fill="none" stroke="${CREAM}" stroke-width="1.5" stroke-linecap="round"/>`)
        : // (View: two windows)
          svg(20, pill(20) + `<rect x="5.6" y="6.4" width="6" height="5" rx="1" fill="none" stroke="${CREAM}" stroke-width="1.3"/><rect x="8.4" y="8.6" width="6" height="5" rx="1" fill="${DISC}" stroke="${CREAM}" stroke-width="1.3"/>`);
    case 'start':
      return svg(20, pill(20) + `<path d="M6 7h8M6 10h8M6 13h8" fill="none" stroke="${CREAM}" stroke-width="1.5" stroke-linecap="round"/>`);
    case 'touchpad':
      return svg(28, `<rect x="0.8" y="3.4" width="26.4" height="13.2" rx="3" fill="${DISC}" stroke="${RING}" stroke-width="1"/><rect x="5" y="6.6" width="18" height="6.8" rx="2" fill="none" stroke="${DIM}" stroke-width="1"/>`);
    case 'home':
      return svg(20, disc + text(10, kind === 'ps' ? 'PS' : '⌂', 7.5));
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return dpad([g]);
    case 'dpad':
      return dpad(['up', 'down', 'left', 'right']);
    case 'dpadx':
      return dpad(['left', 'right']);
    case 'dpady':
      return dpad(['up', 'down']);
  }
}

/** A glyph as HTML (`<span class="pad-g">` with its SVG and its name for screen readers). */
export function padGlyph(g: PadGlyph, kind: PadKind = current.kind): string {
  return `<span class="pad-g pad-g-${g}">${drawing(g, kind)}<span class="pad-sr">${padName(g, kind)}</span></span>`;
}

/** A `<kbd>` that shows `key` (HTML) with the keys and the pad's `g` with the pad (it swaps as the input changes). */
export function padKbd(key: string, g: PadGlyph, cls = ''): string {
  if (!current.on) return `<kbd${cls ? ` class="${cls}"` : ''} data-pad="${g}">${key}</kbd>`;
  return `<kbd class="${cls ? `${cls} ` : ''}is-pad" data-pad="${g}" data-pad-on="1" data-pad-kind="${current.kind}" data-pad-is="${g}" data-key-html="${escAttr(key)}">${padGlyph(g)}</kbd>`;
}

/**
 * The pad button for a key as the prompts and hints name it ("E  Pray"):
 * E □, Space ✕, Esc ○, Enter ✕, M Create (the big map), N R3 (the nearest
 * ramp), I △ (the explorer menu), Shift R2, Q / R the right stick. Null: no
 * button of its own (the hint keeps the key).
 */
export function padForKey(key: string): PadGlyph | null {
  switch (key.trim()) {
    case 'E':
      return 'west';
    case 'Space':
    case 'Enter':
    case '␣':
      return 'south';
    case 'Esc':
    case 'Escape':
      return 'east';
    case 'M':
      return 'select';
    case 'N':
      return 'r3';
    case 'I':
      return 'north';
    case 'Shift':
    case '⇧':
      return 'r2';
    case 'Q':
    case 'R':
      return 'rstick';
    default:
      return null;
  }
}

// ── Swapping the keys ───────────────────────────────────────────────────────

const current = { on: false, kind: 'other' as PadKind };
let watcher: MutationObserver | null = null;

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** One kbd as the pad or the keys have it now. */
function swapOne(k: HTMLElement): void {
  const g = k.dataset.pad as PadGlyph | undefined;
  if (current.on && g && g in NAME) {
    if (k.dataset.padOn === '1' && k.dataset.padKind === current.kind && k.dataset.padIs === g && k.querySelector('.pad-g')) return;
    if (k.dataset.padOn !== '1') k.dataset.keyHtml = k.innerHTML;
    k.innerHTML = padGlyph(g);
    k.dataset.padOn = '1';
    k.dataset.padKind = current.kind;
    k.dataset.padIs = g;
    k.classList.add('is-pad');
  } else if (k.dataset.padOn === '1') {
    k.innerHTML = k.dataset.keyHtml ?? '';
    delete k.dataset.padOn;
    delete k.dataset.padIs;
    k.classList.remove('is-pad');
  }
}

/** All `kbd[data-pad]` to the pad's glyphs (on) or back to their keys (off); pad.ts calls it on every change. */
export function swapKbds(on: boolean, kind: PadKind): void {
  current.on = on;
  current.kind = kind;
  if (!document.body) return;
  watcher?.disconnect();
  for (const k of document.querySelectorAll<HTMLElement>('kbd[data-pad]')) swapOne(k);
  if (!on) return;
  watcher ??= new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      // (a key's text set again by its owner: that is its key now)
      if (t instanceof HTMLElement && t.tagName === 'KBD' && t.dataset.pad !== undefined) {
        if (r.type === 'attributes' || !t.querySelector('.pad-g')) {
          if (r.type === 'childList') delete t.dataset.padOn;
          swapOne(t);
        }
        continue;
      }
      for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.tagName === 'KBD' && n.dataset.pad !== undefined) swapOne(n);
        else if (n.firstElementChild) for (const k of n.querySelectorAll<HTMLElement>('kbd[data-pad]')) swapOne(k);
      }
    }
  });
  watcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pad'] });
}

/** Set a kbd's key (HTML) and its pad button (none: the key shows with the pad too). */
export function setKbd(k: HTMLElement, key: string, g: PadGlyph | null): void {
  k.dataset.keyHtml = key;
  delete k.dataset.padOn;
  if (g) k.dataset.pad = g;
  else delete k.dataset.pad;
  k.classList.remove('is-pad');
  if (current.on && g) swapOne(k);
  else k.innerHTML = key;
}

/** The glyphs' look (once). */
export function injectPadStyle(): void {
  if (document.getElementById('pad-style')) return;
  const s = document.createElement('style');
  s.id = 'pad-style';
  s.textContent = `
.pad-g { display: inline-flex; align-items: center; height: 1.45em; vertical-align: -0.4em; flex: none; line-height: 1; }
.pad-g svg { display: block; height: 100%; width: auto; overflow: visible; }
.pad-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
kbd.is-pad { padding: 0 !important; background: none !important; border-color: transparent !important; box-shadow: none !important; min-width: 0 !important; }
`;
  (document.head ?? document.documentElement).append(s);
}
