import type { OutfitName } from '../../character/AngkorExplorer';
import { EXPRESSIONS, type ExpressionName } from '../../character/parts/face';
import { onLang, t, type WordKey } from '../ui/lang';
import { FACE_NAME } from './photo';

/**
 * The explorer menu (I, or the button with his face on the tool bar): what
 * the viewer's chips offer, for a mouse or a finger. Three rows of buttons
 * over the tool bar, in the key list's panel:
 *
 * - Moves: wave, cheer, look up, peek, sit, lie down. Each goes in as its
 *   key (`press`: the same path as the keyboard, tools.ts), and the panel
 *   shuts so the move (and the sky, sitting or lying down) shows. On foot
 *   only: off it (boat, hang glider, balloon) they are greyed.
 * - Outfit: the four looks and the hat (H); the one he wears is lit gold.
 * - Face: the six faces; the one he shows is lit gold.
 *
 * On touch it stands left of the bar (up the right edge), or under it with
 * the phone on its side; it scrolls when it is taller than the room, and a
 * tap outside shuts it.
 */
export interface ExplorerMenu {
  /** The panel (tools.ts puts it over the tool bar). */
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Open or shut it (no argument: the other way round). */
  toggle(on?: boolean): void;
  /** Light what he wears and shows now, grey the moves off foot (only what changed; nothing while it is shut). */
  update(): void;
}

export interface ExplorerMenuDeps {
  /** A move or the hat, as its key (RoamControls.press: read as a key hit on the next step). */
  press(code: string): void;
  /** The looks (tools.ts `LOOKS`: outfit and word), the one he wears, and put one on. */
  looks: readonly (readonly [OutfitName, WordKey])[];
  look(): number;
  setLook(i: number): void;
  hat(): boolean;
  /** The face he shows (in `EXPRESSIONS`), and show one. */
  face(): number;
  setFace(i: number): void;
  /** On foot: the moves work (the hands are busy in the boat, on the glider, in the balloon). */
  onFoot(): boolean;
  /** It opened or shut (the tool bar lights its button, shuts the key list). */
  onToggle(on: boolean): void;
}

/** The moves: key code, the key shown, the word. */
const MOVES: readonly [code: string, key: string, word: WordKey][] = [
  ['KeyF', 'F', 'rWave'],
  ['KeyC', 'C', 'rCheer'],
  ['KeyU', 'U', 'rLookUp'],
  ['KeyP', 'P', 'rPeek'],
  ['KeyJ', 'J', 'rSit'],
  ['KeyL', 'L', 'rLieDown'],
];

/** The words in lists are in lower case (the key list): a capital for a button or a title. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function createExplorerMenu(d: ExplorerMenuDeps): ExplorerMenu {
  injectStyle();
  const el = document.createElement('div');
  el.className = 'rxm mu-frame mu-sm';
  el.setAttribute('role', 'dialog');
  const chip = (attrs: string, icon: string, word: WordKey, key = '') =>
    `<button type="button" class="rxm-b" ${attrs} aria-pressed="false"><span class="rxm-bg"></span>${icon}<span class="rxm-t" data-w="${word}"></span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  const head = (word: WordKey, key = '') => `<b class="rxm-h"><span data-w="${word}"></span>${key ? `<kbd>${key}</kbd>` : ''}</b>`;
  el.innerHTML = `<span class="mu-bg"></span>
    <div class="rxm-in">
      <section class="rxm-sec">${head('rMoves')}<span class="rxm-note" data-w="rOnFootOnly"></span>
        <div class="rxm-grid">${MOVES.map(([code, key, w]) => chip(`data-move="${code}"`, MOVE_ICONS[code], w, key)).join('')}</div></section>
      <section class="rxm-sec">${head('rOutfit', 'G')}
        <div class="rxm-grid">${d.looks.map(([o, w], i) => chip(`data-look="${i}"`, lookIcon(o), w)).join('')}${chip('data-hat', HAT_ICON, 'rHat', 'H')}</div></section>
      <section class="rxm-sec">${head('rFace', 'X')}
        <div class="rxm-grid">${EXPRESSIONS.map((e, i) => chip(`data-face="${i}"`, FACE_ICONS[e], FACE_NAME[e])).join('')}</div></section>
    </div>`;
  const all = [...el.querySelectorAll<HTMLButtonElement>('.rxm-b')];
  const moves = all.filter((b) => b.dataset.move);
  const looks = all.filter((b) => b.dataset.look);
  const faces = all.filter((b) => b.dataset.face);
  const hat = all.find((b) => b.hasAttribute('data-hat'))!;

  /** The words in the language in use (ui/lang.ts); a button's name says its key. */
  const fillWords = () => {
    el.setAttribute('aria-label', t('rExplorer'));
    for (const s of el.querySelectorAll<HTMLElement>('[data-w]')) s.textContent = cap(t(s.dataset.w as WordKey));
    for (const b of all) {
      const name = b.querySelector('.rxm-t')!.textContent!;
      const key = b.querySelector('kbd')?.textContent;
      b.title = key ? `${name} (${key})` : name;
    }
  };
  fillWords();
  onLang(fillWords);

  let open = false;
  /** What the buttons show now (to touch them only when it changes). */
  let shown = '';
  const light = (b: HTMLButtonElement, on: boolean) => {
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  };

  const api: ExplorerMenu = {
    el,
    get open() {
      return open;
    },
    toggle(on = !open) {
      if (on === open) return;
      open = on;
      el.classList.toggle('is-on', on);
      shown = '';
      api.update();
      d.onToggle(on);
    },
    update() {
      if (!open) return;
      const foot = d.onFoot();
      const look = d.look();
      const face = d.face();
      const now = `${foot} ${look} ${d.hat()} ${face}`;
      if (now === shown) return;
      shown = now;
      el.classList.toggle('is-busy', !foot);
      for (const b of moves) b.disabled = !foot;
      for (const b of looks) light(b, Number(b.dataset.look) === look);
      for (const b of faces) light(b, Number(b.dataset.face) === face);
      light(hat, d.hat());
    },
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.rxm-b');
    if (!b || b.disabled) return;
    // (let go of the focus: Space is the jump and the shutter)
    b.blur();
    const { move, look, face } = b.dataset;
    if (move) {
      d.press(move);
      // (the panel goes, so the move shows: and the sky, sitting or lying down)
      api.toggle(false);
    } else if (look) d.setLook(Number(look));
    else if (face) d.setFace(Number(face));
    else d.press('KeyH');
    api.update();
  });
  // Touch: a tap outside shuts it (the bar's button toggles it itself).
  addEventListener(
    'pointerdown',
    (e) => {
      if (!open || (e.pointerType !== 'touch' && !document.body.classList.contains('roam-touch'))) return;
      const at = e.target as Element | null;
      if (at && (el.contains(at) || at.closest('.rtb-me'))) return;
      api.toggle(false);
    },
    true,
  );
  return api;
}

// ── Icons ──────────────────────────────────────────────────────────────────

/** 16 × 16 pixel art, like the tool bar's (the figure in currentColor: gold when lit). */
const px = (body: string) => `<svg class="rxm-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
const GOLD = '#ffe07c';

const MOVE_ICONS: Record<string, string> = {
  // (one arm up, waving)
  KeyF: px(`<path fill="currentColor" d="M7 1h3v3H7zM7 5h3v5H7zM7 10h1v6H7zM9 10h1v6H9zM5 5h2v1H5zM5 6h1v4H5zM10 5h2v1h-2zM12 1h1v5h-1z"/>
    <path fill="${GOLD}" d="M14 1h2v1h-2zM14 4h2v1h-2z"/>`),
  // (both arms up, a spark or two)
  KeyC: px(`<path fill="currentColor" d="M7 2h3v3H7zM7 6h3v5H7zM7 11h1v5H7zM9 11h1v5H9zM6 6h1v1H6zM5 5h1v1H5zM4 4h1v1H4zM3 2h1v2H3zM10 6h1v1h-1zM11 5h1v1h-1zM12 4h1v1h-1zM13 2h1v2h-1z"/>
    <path fill="${GOLD}" d="M1 0h1v1H1zM15 0h1v1h-1zM8 0h1v1H8z"/>`),
  // (a star up above, his eyes on it)
  KeyU: px(`<path fill="currentColor" d="M6 3h3v3H6zM6 7h3v5H6zM6 12h1v4H6zM8 12h1v4H8zM4 7h2v1H4zM4 8h1v4H4zM9 7h2v1H9zM10 8h1v4h-1z"/>
    <path fill="${GOLD}" d="M13 0h1v1h-1zM12 1h3v1h-3zM13 2h1v1h-1z"/><path fill="${GOLD}" opacity="0.55" d="M10 3h1v1h-1z"/>`),
  // (his head out from behind a wall)
  KeyP: px(`<path fill="currentColor" opacity="0.4" d="M0 0h7v16H0z"/><path fill="#0d1927" opacity="0.35" d="M0 4h7v1H0zM0 9h7v1H0zM0 14h7v1H0zM3 0h1v4H3zM5 5h1v4H5zM2 10h1v4H2z"/>
    <path fill="currentColor" d="M7 4h3v3H7zM7 8h1v6H7zM6 9h1v2H6z"/><path fill="#0d1927" d="M9 5h1v1H9z"/>`),
  // (on a stone)
  KeyJ: px(`<path fill="currentColor" opacity="0.4" d="M2 12h7v4H2z"/><path fill="currentColor" d="M3 2h3v3H3zM3 6h3v4H3zM3 10h8v2H3zM10 12h2v4h-2zM6 7h2v1H6zM7 8h1v2H7z"/>`),
  // (on his back, a star over him)
  KeyL: px(`<path fill="currentColor" opacity="0.4" d="M0 14h16v1H0z"/><path fill="currentColor" d="M1 9h3v3H1zM4 10h6v3H4zM10 11h5v2h-5z"/>
    <path fill="${GOLD}" d="M9 2h1v1H9zM8 3h3v1H8zM9 4h1v1H9z"/><path fill="${GOLD}" opacity="0.55" d="M4 4h1v1H4zM13 1h1v1h-1z"/>`),
};

/** A look: his shirt with what goes over it (the scarf, the day pack's strap, the big pack's straps; the temple clothes' sash). */
const STRAP = 'M11 3h1v1h-1zM10 4h1v2h-1zM9 6h1v1H9zM8 7h1v2H8zM7 9h1v1H7zM6 10h1v2H6zM5 12h1v1H5z';
const SCARF = '<path fill="#c8453a" d="M6 2h1v1h2V2h1v2H9v1H7V4H6zM9 5h1v2H9z"/>';
const LOOK_OVER: Partial<Record<OutfitName, string>> = {
  explorerGear: `<path fill="#7a5634" d="M5 3h1v8H5zM10 3h1v8h-1zM5 8h6v1H5z"/>${SCARF}`,
  default: `<path fill="#7a5634" d="${STRAP}"/>${SCARF}`,
  withoutScarf: `<path fill="#7a5634" d="${STRAP}"/>`,
  templeOutfit: `<path fill="#e0892f" d="${STRAP}M10 3h1v1h-1zM9 4h1v2H9zM8 6h1v1H8zM7 7h1v2H7zM6 9h1v1H6zM5 10h1v2H5zM4 12h1v1H4z"/>`,
};
const lookIcon = (o: OutfitName) =>
  px(`<path fill="currentColor" d="M4 2h3v1h2V2h3v1h2v1h1v3h-3v7H4V7H1V4h1V3h2z"/><path fill="#0d1927" opacity="0.4" d="M7 2h2v1H7z"/>${LOOK_OVER[o] ?? ''}`);
/** His straw hat with the red band. */
const HAT_ICON = px(`<path fill="#e2b35c" d="M5 4h6v1h1v3H4V5h1z"/><path fill="#c8453a" d="M4 7h8v1H4z"/><path fill="#f0c874" d="M1 8h14v1h-1v1H2V9H1z"/>`);

/** The faces: a round face with the eyes, brows and mouth of each. */
const face = (f: string) => px(`<path fill="#dcae8f" d="M3 2h10v1h1v10h-1v1H3v-1H2V3h1z"/><path fill="#3a2a26" d="${f}"/>`);
const FACE_ICONS: Record<ExpressionName, string> = {
  neutral: face('M5 6h1v2H5zM10 6h1v2h-1zM6 11h4v1H6z'),
  happy: face('M5 6h1v2H5zM10 6h1v2h-1zM5 10h1v1H5zM10 10h1v1h-1zM6 11h4v1H6z'),
  determined: face('M4 4h2v1H4zM6 5h1v1H6zM10 4h2v1h-2zM9 5h1v1H9zM5 6h1v2H5zM10 6h1v2h-1zM6 11h4v1H6z'),
  surprised: face('M4 3h2v1H4zM10 3h2v1h-2zM5 5h1v3H5zM10 5h1v3h-1zM7 9h2v1H7zM6 10h1v2H6zM9 10h1v2H9zM7 12h2v1H7z'),
  curious: face('M4 5h2v1H4zM10 3h2v1h-2zM5 7h1v1H5zM10 5h1v3h-1zM8 11h2v1H8z'),
  focused: face('M4 5h2v1H4zM10 5h2v1h-2zM4 7h2v1H4zM10 7h2v1h-2zM7 11h2v1H7z'),
};

// ── Style ──────────────────────────────────────────────────────────────────

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  // (in the tool bar's wrap: its stepped button shape and ring, --rtb-shape / --rtb-ring, tools.ts)
  style.textContent = `
    .rxm { grid-row: 1; display: none; pointer-events: auto; font-size: calc(13 * var(--px)); color: var(--mu-ink2); }
    .rxm.is-on { display: block; }
    /* (the mode's key help at the bottom left steps aside for it, as for the key list) */
    .rh:has(.rxm.is-on) .rh-help { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0s 0.2s; }
    .rxm-in { display: flex; gap: calc(18 * var(--px)); padding: calc(12 * var(--px)) calc(14 * var(--px)); max-height: calc(100vh - 110 * var(--px) - 40px);
      overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--mu-line) transparent; }
    .rxm-sec { display: grid; gap: calc(6 * var(--px)); align-content: start; min-width: 0; }
    .rxm-h { display: flex; align-items: center; gap: calc(6 * var(--px)); font: 700 calc(14 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .rxm-h kbd { min-width: calc(17 * var(--px)); height: calc(17 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(10.5 * var(--px)); letter-spacing: 0; }
    .rxm-note { display: none; margin-top: calc(-3 * var(--px)); font-size: calc(12 * var(--px)); color: var(--mu-dim); }
    .rxm.is-busy .rxm-note { display: block; }
    .rxm-grid { display: grid; gap: calc(4 * var(--px)); }
    .rxm-b { position: relative; display: flex; align-items: center; gap: calc(8 * var(--px)); min-height: calc(34 * var(--px)); padding: calc(4 * var(--px)) calc(8 * var(--px));
      border: 0; background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; text-align: left; white-space: nowrap;
      transition: color 0.2s, transform 0.2s var(--mu-ease), opacity 0.2s; }
    .rxm-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--rtb-shape); background: rgba(255, 244, 222, 0.04); transition: background 0.2s; }
    .rxm-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--rtb-ring); background: rgba(255, 229, 188, 0.1); transition: background 0.2s; }
    .rxm-icon { flex: none; width: calc(20 * var(--px)); height: calc(20 * var(--px)); filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .rxm-t { flex: 1; }
    .rxm-b kbd { flex: none; min-width: calc(18 * var(--px)); height: calc(18 * var(--px)); padding: 0 calc(4 * var(--px)); font-size: calc(11 * var(--px)); }
    .rxm-b:hover, .rxm-b:focus-visible { color: var(--mu-ink); }
    .rxm-b:hover .rxm-bg { background: rgba(255, 244, 222, 0.1); }
    .rxm-b:hover .rxm-bg::after { background: var(--mu-line-hi); }
    .rxm-b:focus-visible .rxm-bg::after { background: rgba(255, 244, 214, 0.95); }
    .rxm-b:active { transform: scale(0.96); }
    .rxm-b.is-on { color: var(--mu-gold-hi); }
    .rxm-b.is-on .rxm-bg { background: rgba(58, 44, 20, 0.75); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.5); }
    .rxm-b.is-on .rxm-bg::after { background: var(--mu-gold-hi); }
    .rxm-b:disabled { opacity: 0.35; cursor: default; }
    .rxm-b:disabled .rxm-bg { background: rgba(255, 244, 222, 0.04); }
    .rxm-b:disabled .rxm-bg::after { background: rgba(255, 229, 188, 0.1); }
    /* (Khmer letters look smaller at the same size, and take no letter spacing: map.css) */
    :lang(km) .rxm { font-size: calc(14 * var(--px)); }
    :lang(km) .rxm-h { letter-spacing: 0; }

    /* Touch: left of the bar up the right edge, two buttons a row, big enough for a thumb; no keys. */
    body.roam-touch .rxm { position: absolute; right: calc(100% + 8px); bottom: 0; width: min(330px, calc(100vw - 100% - 32px)); font-size: 14px; }
    body.roam-touch .rxm-in { flex-direction: column; gap: 12px; padding: 12px; max-height: calc(100dvh - 128px - 76px); }
    body.roam-touch .rxm-sec { gap: 6px; }
    body.roam-touch .rxm-h { font-size: 15px; }
    body.roam-touch .rxm-note { font-size: 12.5px; margin-top: -2px; }
    body.roam-touch .rxm-grid { grid-template-columns: 1fr 1fr; gap: 5px; }
    body.roam-touch .rxm-b { min-height: 44px; gap: 7px; padding: 4px 8px; white-space: normal; line-height: 1.15; }
    body.roam-touch .rxm-icon { width: 22px; height: 22px; }
    body.roam-touch .rxm kbd { display: none; }
    /* (it reaches up under the mini-map on a phone: the mini-map steps aside while it is open) */
    body.roam-touch:has(.rxm.is-on) .mm { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.2s, visibility 0s 0.2s !important; }
    /* (a phone on its side: the bar is along the top; the panel hangs under it, the three side by side) */
    @media (max-height: 500px) {
      body.roam-touch .rxm { right: auto; bottom: auto; left: 50%; top: calc(100% + 6px); transform: translateX(-50%); width: min(760px, calc(100vw - 24px)); }
      body.roam-touch .rxm-in { flex-direction: row; max-height: calc(100dvh - 82px); }
      body.roam-touch .rxm-sec { flex: 1; }
      body.roam-touch .rxm-b { min-height: 40px; }
    }`;
  document.head.append(style);
}
