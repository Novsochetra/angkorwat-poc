import { OUTFITS } from '../../character/AngkorExplorer';
import type { KramaLook, ShirtTones, TrouserTones } from '../../character/clothes';
import { EXPRESSIONS } from '../../character/parts/face';
import { markFocus } from '../pad/nav';
import { pad } from '../pad/pad';
import type { UISound } from '../types';
import { num, onLang, t, type WordKey } from '../ui/lang';
import { LOOK_TOOLS, type MenuPage } from './_addons';
import { riel } from './_shopPurse';
import { wearIcon } from './_wardrobeIcons';
import { itemsOf, wearItem, wearName, type WearItem, type WearKind } from './_wardrobeItems';
import {
  faceIcon,
  figureIcon,
  hatIcon,
  krIcon,
  LOCK_ICON,
  noneIcon,
  noPackIcon,
  OWN_HAT,
  OWN_KRAMA,
  OWN_SHIRT,
  packIcon,
  sampotIcon,
  shirtIcon,
  shortsIcon,
  type Figure,
} from './_wardrobeLookIcons';
import { esc, injectLookStyle } from './_wardrobeStyle';
import { FACE_NAME } from './photo';

/**
 * The explorer menu's Look page (រូបរាង: `MENU_PAGES.look`, _addons.ts; the
 * menu holds its tab and its place, _explorerMenu.ts): what he wears, part by
 * part, like a game's character screen. Down one side the parts, each with
 * the picture of what he has on now (`LOOK_PARTS`): **Outfit** (his explorer
 * clothes or the temple clothes; the four ready looks G steps through; his
 * original look), **Pack** (big, day pack, none), **Krama** (none, his own
 * red one, the market's), **Shirt**, **Legs** (his shorts, the market's
 * trousers; the sampot comes with the temple clothes), **Hat** (none, his
 * palm-leaf hat, the blue band), **Face** (the six of X). Beside them the
 * choices of the part picked: what he wears lit gold; what is not his yet
 * dim with a lock and its price, and where to buy it under the list; what
 * the outfit cannot show (trousers with the sampot) greyed, saying why.
 *
 * A choice is put on at once (_wardrobe.ts `pick`: the explorer, the small
 * turn on foot). Mouse and touch: a click or a tap. Keys and the game pad
 * (the focus in the page): ↑ ↓ along the parts (each shows its choices),
 * → into the choices, ← back to the part; ✕ (Enter, Space) takes the one in
 * focus. A phone on its side (or a page narrower than 300 px): the parts in
 * a row along the top, ← → along them, ↓ into the choices. Words: `look…`
 * (ui/lang.ts). No three.js; nothing per frame but a compare (`update`).
 */

export type LookPart = 'outfit' | 'pack' | 'krama' | 'shirt' | 'legs' | 'hat' | 'face';
export const LOOK_PARTS: readonly LookPart[] = ['outfit', 'pack', 'krama', 'shirt', 'legs', 'hat', 'face'];
const PART_WORD: Record<LookPart, WordKey> = {
  outfit: 'lookOutfit',
  pack: 'lookPack',
  krama: 'lookKrama',
  shirt: 'lookShirt',
  legs: 'lookLegs',
  hat: 'lookHat',
  face: 'lookFace',
};
/** The market's kind for a part (its count in the part's head). */
const PART_KIND: Partial<Record<LookPart, WearKind>> = { krama: 'krama', shirt: 'shirt', legs: 'trousers', hat: 'hat' };
/** A part's own key (shown by its name: H the hat, X the face; G by the ready looks). */
const PART_KEY: Partial<Record<LookPart, string>> = { hat: 'H', face: 'X' };

/** What he has on now, part by part (each the id of its choice), and the ready look it is (or -1). */
export interface LookNow {
  outfit: 'explorer' | 'temple';
  pack: 'big' | 'day' | 'none';
  krama: string;
  shirt: string;
  legs: string;
  hat: string;
  face: number;
  preset: number;
}

export interface LookChoice {
  /** Unique in its part: `explorer`, `big`, `own`, `none`, a market item's id, `look:<i>`, a face's name, `original`. */
  readonly id: string;
  readonly part: LookPart;
  /** Its words (else the market item's name). */
  readonly word?: WordKey;
  /** A line under it. */
  readonly note?: WordKey;
  /** A thing from the market (locked until bought). */
  readonly item?: WearItem;
  /** One of the ready looks (LOOK_TOOLS.looks). */
  readonly preset?: number;
  /** One of the faces (EXPRESSIONS). */
  readonly face?: number;
  readonly icon: string;
}

export interface LookDeps {
  /** What he has on now (the same object each time, filled anew: nothing made per frame). */
  now(): LookNow;
  owned(id: string): boolean;
  /** The outfit he has on cannot show it (shorts or trousers with the sampot, the sampot with the explorer clothes): why. */
  blocked(c: LookChoice): WordKey | null;
  /** A line over a part's choices now (the umbrella up, for the hat), or null. */
  note(part: LookPart): WordKey | null;
  /** A choice taken (not one he has on, nor locked or blocked). */
  pick(c: LookChoice): void;
  /** He looks as he set out (his original look can be taken: false). */
  isOriginal(): boolean;
  sound(s: UISound): void;
  /** The page came into view or went (the menu's `shown`). */
  shown(on: boolean): void;
}

export interface LookPage extends MenuPage {
  readonly part: LookPart;
  /** In view now (the menu open on it). */
  readonly showing: boolean;
  /** Show a part's choices (`focus`: the focus on its tab, as the pad's). */
  setPart(p: LookPart, focus?: boolean): void;
  /** Light what he wears now (only what changed). */
  update(): void;
  /** Checks: the part, its choices with their states, the line under them. */
  state(): { part: LookPart; choices: { id: string; on: boolean; locked: boolean; blocked: boolean }[]; info: string; note: string };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The choices of a part (the pictures made once). */
function choicesOf(part: LookPart): LookChoice[] {
  const market = (kind: WearKind): LookChoice[] => itemsOf(kind).map((it) => ({ id: it.id, part, item: it, icon: wearIcon(it, 'lk-icon') }));
  switch (part) {
    case 'outfit':
      return [
        { id: 'explorer', part, word: 'lookExplorer', note: 'lookExplorerNote', icon: figureIcon({ legs: 'shorts', pack: 'none', scarf: false, camera: true }) },
        { id: 'temple', part, word: 'lookTemple', note: 'lookTempleNote', icon: figureIcon({ legs: 'sampot', pack: 'none', scarf: false, camera: false }) },
        ...LOOK_TOOLS.looks.map(([o, w], i): LookChoice => {
          const f = OUTFITS[o];
          return { id: `look:${i}`, part, word: w, preset: i, icon: figureIcon({ legs: f.legs, pack: f.pack, scarf: f.scarf, camera: f.camera }) };
        }),
        { id: 'original', part, word: 'wearOriginal', note: 'lookOriginalNote', icon: figureIcon({ legs: 'shorts', pack: 'explorer', scarf: true, camera: true }) },
      ];
    case 'pack':
      return [
        { id: 'big', part, word: 'lookPackBig', note: 'lookPackBigNote', icon: packIcon('explorer') },
        { id: 'day', part, word: 'lookPackDay', icon: packIcon('default') },
        { id: 'none', part, word: 'lookPackNone', icon: noPackIcon() },
      ];
    case 'krama':
      return [{ id: 'none', part, word: 'lookKramaNone', icon: noneIcon(krIcon(OWN_KRAMA)) }, { id: 'own', part, word: 'lookKramaOwn', icon: krIcon(OWN_KRAMA) }, ...market('krama')];
    case 'shirt':
      return [{ id: 'own', part, word: 'lookShirtOwn', icon: shirtIcon(OWN_SHIRT) }, ...market('shirt')];
    case 'legs':
      return [{ id: 'shorts', part, word: 'lookShorts', icon: shortsIcon() }, ...market('trousers'), { id: 'sampot', part, word: 'lookSampot', note: 'lookSampotNote', icon: sampotIcon() }];
    case 'hat':
      return [
        { id: 'none', part, word: 'lookHatNone', icon: noneIcon(hatIcon(OWN_HAT)) },
        { id: 'own', part, word: 'lookHatOwn', note: 'lookHatOwnNote', icon: hatIcon(OWN_HAT) },
        ...market('hat'),
      ];
    case 'face':
      return EXPRESSIONS.map((e, i): LookChoice => ({ id: e, part, word: FACE_NAME[e], face: i, icon: faceIcon(e) }));
  }
}

/** The id of the choice a part has on now. */
function onId(part: LookPart, n: LookNow): string {
  return part === 'face' ? EXPRESSIONS[n.face] : part === 'outfit' ? n.outfit : n[part];
}

/** Him as he is (the Outfit part's picture): the outfit's legs and camera, the pack, the krama and the market's colours. */
function figureOf(n: LookNow): Figure {
  const temple = n.outfit === 'temple';
  return {
    legs: temple ? 'sampot' : 'shorts',
    pack: n.pack === 'big' ? 'explorer' : n.pack === 'day' ? 'default' : 'none',
    scarf: n.krama !== 'none',
    camera: !temple,
    krama: (wearItem(n.krama)?.look as KramaLook | undefined) ?? null,
    shirt: (wearItem(n.shirt)?.look as ShirtTones | undefined) ?? null,
    trousers: temple ? null : ((wearItem(n.legs)?.look as TrouserTones | undefined) ?? null),
  };
}

const PARTS_OF_NOW: readonly (keyof LookNow)[] = ['outfit', 'pack', 'krama', 'shirt', 'legs', 'hat', 'face', 'preset'];

export function createLookPage(d: LookDeps): LookPage {
  injectLookStyle();
  const el = document.createElement('div');
  el.className = 'lk';
  el.innerHTML = `<div class="lk-in">
      <div class="lk-parts" role="tablist" aria-orientation="vertical">${LOOK_PARTS.map(
        (p) =>
          `<button type="button" class="lk-part" role="tab" id="lk-tab-${p}" aria-controls="lk-panel" aria-selected="false" tabindex="-1" data-part="${p}"><span class="lk-bg"></span><span class="lk-slot"></span><span class="lk-pt"></span></button>`,
      ).join('')}</div>
      <div class="lk-panel" id="lk-panel" role="tabpanel">
        <div class="lk-head"><b class="lk-h"></b><span class="lk-count"></span><kbd class="lk-key"></kbd></div>
        <p class="lk-note" hidden></p>
        <div class="lk-list"></div>
        <p class="lk-info" aria-live="polite"></p>
      </div>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const rail = q('.lk-parts');
  const panel = q('.lk-panel');
  const head = q('.lk-h');
  const count = q('.lk-count');
  const key = q('.lk-key');
  const noteEl = q('.lk-note');
  const list = q('.lk-list');
  const info = q('.lk-info');
  const tabs = Object.fromEntries(LOOK_PARTS.map((p) => [p, q<HTMLButtonElement>(`#lk-tab-${p}`)])) as Record<LookPart, HTMLButtonElement>;

  let part: LookPart = 'outfit';
  let showing = false;
  /** This part's choices and their buttons. */
  let choices: LookChoice[] = [];
  let rows: HTMLButtonElement[] = [];
  /** What the buttons and the parts' pictures show now (to touch them only when it changes): `fresh` false redoes all. */
  const last: LookNow = { outfit: 'explorer', pack: 'big', krama: '', shirt: '', legs: '', hat: '', face: -1, preset: -2 };
  let lastNote: WordKey | null = null;
  let lastOrig = false;
  let lastTold: LookChoice | null = null;
  let fresh = false;
  const slotKey: Partial<Record<LookPart, string>> = {};
  const same = (n: LookNow) => {
    for (const k of PARTS_OF_NOW) if (n[k] !== last[k]) return false;
    return true;
  };
  /** The choice the line under the list speaks of (hovered, in focus, or just tapped), or null: the part's own line. */
  let told: LookChoice | null = null;
  const cache = new Map<LookPart, LookChoice[]>();
  const of = (p: LookPart) => {
    let c = cache.get(p);
    if (!c) cache.set(p, (c = choicesOf(p)));
    return c;
  };

  const nameOf = (c: LookChoice) => (c.item ? wearName(c.item) : cap(t(c.word!)));

  /** The part's choices into the list (a subheading before the ready looks). */
  function fillList(): void {
    choices = of(part);
    list.innerHTML = choices
      .map((c, i) => {
        const sub = c.preset === 0 ? `<b class="lk-sub"><span>${esc(t('lookReady'))}</span><kbd>G</kbd></b>` : '';
        const note = c.note ? `<small class="lk-cs">${esc(t(c.note))}</small>` : '';
        const price = c.item ? `<span class="lk-lk">${LOCK_ICON}<b class="lk-pr">${riel(c.item.price)}</b></span>` : '';
        return `${sub}<button type="button" class="lk-c" data-i="${i}" data-id="${c.id}"><span class="lk-bg"></span><span class="lk-ic">${c.icon}</span><span class="lk-cn"><span class="lk-cw">${esc(nameOf(c))}</span>${note}</span><span class="lk-st"><span class="lk-on" aria-hidden="true">✓</span>${price}</span></button>`;
      })
      .join('');
    rows = [...list.querySelectorAll<HTMLButtonElement>('.lk-c')];
    fresh = false;
  }

  /** The words that do not change with what he wears (the parts' names, the head). */
  function fillWords(): void {
    rail.setAttribute('aria-label', t('lookParts'));
    for (const p of LOOK_PARTS) {
      const w = t(PART_WORD[p]);
      tabs[p].querySelector('.lk-pt')!.textContent = w;
      tabs[p].title = PART_KEY[p] ? `${w} (${PART_KEY[p]})` : w;
    }
    head.textContent = t(PART_WORD[part]);
    const k = PART_KEY[part];
    key.textContent = k ?? '';
    key.hidden = !k;
    panel.setAttribute('aria-labelledby', `lk-tab-${part}`);
  }

  /** The line under the list: the choice it speaks of, else where the locked ones are sold (none locked: nothing). */
  function fillInfo(): void {
    const c = told;
    let html = '';
    if (c?.item && !d.owned(c.item.id)) html = `${LOCK_ICON}<span><b>${esc(nameOf(c))}</b> · ${esc(t('lookWhere'))} · <b class="lk-pr">${riel(c.item.price)}</b></span>`;
    else if (c && d.blocked(c)) html = `<span>${esc(t(d.blocked(c)!))}</span>`;
    else if (choices.some((x) => x.item && !d.owned(x.item.id))) html = `${LOCK_ICON}<span>${esc(t('lookWhereAll'))}</span>`;
    if (info.innerHTML !== html) info.innerHTML = html;
    info.classList.toggle('is-told', !!c && html !== '');
    info.hidden = html === '';
  }

  /** The parts' pictures: what he has on of each (only those that changed; the Outfit's: him as he is). */
  function fillSlots(n: LookNow): void {
    for (const p of LOOK_PARTS) {
      if (p === 'outfit') {
        const k = `${n.outfit} ${n.pack} ${n.krama} ${n.shirt} ${n.legs}`;
        if (slotKey.outfit === k) continue;
        slotKey.outfit = k;
        tabs.outfit.querySelector('.lk-slot')!.innerHTML = figureIcon(figureOf(n));
        continue;
      }
      const k = onId(p, n);
      if (slotKey[p] === k) continue;
      slotKey[p] = k;
      tabs[p].querySelector('.lk-slot')!.innerHTML = of(p).find((x) => x.id === k)?.icon ?? '';
    }
  }

  /** What he wears lit, what is locked or cannot show now, the notes (`force`: even if nothing changed). */
  function light(force = false): void {
    const n = d.now();
    const note = d.note(part);
    const orig = d.isOriginal();
    if (!force && fresh && note === lastNote && orig === lastOrig && told === lastTold && same(n)) return;
    Object.assign(last, n);
    lastNote = note;
    lastOrig = orig;
    lastTold = told;
    fresh = true;
    fillSlots(n);
    const on = onId(part, n);
    rows.forEach((b, i) => {
      const c = choices[i];
      const lit = c.preset !== undefined ? c.preset === n.preset : c.id === 'original' ? false : c.id === on;
      const locked = !!c.item && !d.owned(c.item.id);
      const blocked = !locked && !!d.blocked(c);
      const dimOrig = c.id === 'original' && d.isOriginal();
      b.classList.toggle('is-on', lit);
      b.classList.toggle('is-locked', locked);
      b.classList.toggle('is-blocked', blocked || dimOrig);
      b.setAttribute('aria-pressed', String(lit));
      const name = nameOf(c);
      const why = locked ? `: ${t('lookLocked')} · ${t('lookWhere')} · ${riel(c.item!.price)}` : blocked ? `: ${t(d.blocked(c)!)}` : '';
      b.setAttribute('aria-label', `${name}${lit ? ` (${t('wearOnNow')})` : ''}${why}`);
    });
    noteEl.hidden = !note;
    noteEl.textContent = note ? t(note) : '';
    const kind = PART_KIND[part];
    if (kind) {
      const all = itemsOf(kind);
      count.textContent = t('lookOwned', { n: num(all.filter((i) => d.owned(i.id)).length), max: num(all.length) });
    } else count.textContent = '';
    count.hidden = !kind;
    for (const p of LOOK_PARTS) {
      const sel = p === part;
      tabs[p].classList.toggle('is-tab', sel);
      tabs[p].setAttribute('aria-selected', String(sel));
      tabs[p].tabIndex = sel ? 0 : -1;
    }
    fillInfo();
  }

  function setPart(p: LookPart, focus = false, sound = false): void {
    if (p !== part) {
      part = p;
      told = null;
      el.dataset.part = p;
      fillList();
      fillWords();
      list.scrollTop = 0;
      if (sound) d.sound('hover');
    }
    light(true);
    if (focus) markFocus(tabs[p]);
  }

  /** A choice taken by a click, a tap, ✕ or Enter. */
  function take(i: number): void {
    const c = choices[i];
    if (!c) return;
    const n = d.now();
    const lit = c.preset !== undefined ? c.preset === n.preset : c.id === onId(part, n);
    if (c.item && !d.owned(c.item.id)) {
      // (not his yet: the line says where it is sold and the price)
      told = c;
      shake(rows[i]);
      d.sound('back');
    } else if (d.blocked(c) || (c.id === 'original' && d.isOriginal())) {
      told = c;
      shake(rows[i]);
      d.sound('back');
    } else if (!lit) {
      told = null;
      d.pick(c);
    }
    light(true);
  }

  function shake(b: HTMLElement | undefined): void {
    if (!b) return;
    b.classList.remove('is-shake');
    void b.offsetWidth;
    b.classList.add('is-shake');
  }

  // ── Mouse and touch ──
  rail.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.lk-part');
    if (!b) return;
    if (!pad.active) b.blur();
    setPart(b.dataset.part as LookPart, false, true);
  });
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.lk-c');
    if (!b) return;
    // (let go of the focus: Space is the jump again; the game pad's stays, it goes on from there)
    if (!pad.active) b.blur();
    take(Number(b.dataset.i));
  });
  // (a mouse over a locked or greyed one: the line says where it is sold, or why; off it: the part's own line)
  list.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.lk-c');
    const c = b ? choices[Number(b.dataset.i)] : null;
    if (c === told) return;
    told = c && (b!.classList.contains('is-locked') || b!.classList.contains('is-blocked')) ? c : null;
    light(true);
  });
  list.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || !told) return;
    told = null;
    light(true);
  });
  // (the focus on a part, the pad's or the keys': its choices show; on a choice: the line speaks of it)
  el.addEventListener('focusin', (e) => {
    const b = e.target as HTMLElement;
    if (b.classList.contains('lk-part')) setPart(b.dataset.part as LookPart);
    else if (b.classList.contains('lk-c')) {
      const c = choices[Number(b.dataset.i)] ?? null;
      const next = c && (b.classList.contains('is-locked') || b.classList.contains('is-blocked')) ? c : null;
      if (next !== told) {
        told = next;
        light(true);
      }
    }
  });

  // ── Keys and the pad's arrows (the focus in the page): along the parts, into the choices and back ──
  /** The parts stand in a row along the top (a phone on its side, a narrow page), not down the side. */
  const across = () => {
    const a = tabs.outfit.getBoundingClientRect();
    const b = tabs.pack.getBoundingClientRect();
    return Math.abs(a.top - b.top) < a.height / 2;
  };
  const go = (to: HTMLElement | undefined) => {
    if (!to) return false;
    markFocus(to);
    d.sound('hover');
    return true;
  };
  /** Into the choices: the one he has on, else the first. */
  const intoList = () => go(rows.find((b) => b.classList.contains('is-on')) ?? rows[0]);
  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const at = e.target as HTMLElement;
    const onPart = at.classList.contains('lk-part');
    const onChoice = at.classList.contains('lk-c');
    if (!onPart && !onChoice) return;
    const row = across();
    const [back, fwd, inKey, outKey] = row ? ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'] : ['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft'];
    let used = false;
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.key === 'Enter') {
      // (Enter and Space are the page's here, not the jump: the pad's ✕ is an Enter too)
      if (!e.repeat) (at as HTMLButtonElement).click();
      used = true;
    } else if (onPart) {
      const i = LOOK_PARTS.indexOf(at.dataset.part as LookPart);
      if (e.key === back || e.code === back) used = i > 0 && (setPart(LOOK_PARTS[i - 1], true), d.sound('hover'), true);
      else if (e.key === fwd || e.code === fwd) used = i < LOOK_PARTS.length - 1 && (setPart(LOOK_PARTS[i + 1], true), d.sound('hover'), true);
      else if (e.key === inKey || e.code === inKey) used = intoList();
    } else {
      const i = rows.indexOf(at as HTMLButtonElement);
      if (e.key === outKey || e.code === outKey) used = go(tabs[part]);
      else if (e.key === 'ArrowDown' || e.code === 'ArrowDown') used = i < rows.length - 1 && go(rows[i + 1]);
      // (from the first choice up: in a row of parts, back to the part; else on to whatever is above, the menu's tabs)
      else if (e.key === 'ArrowUp' || e.code === 'ArrowUp') used = i > 0 ? go(rows[i - 1]) : row && go(tabs[part]);
    }
    if (!used) return;
    e.preventDefault();
    e.stopPropagation();
  });

  onLang(() => {
    for (const p of LOOK_PARTS) cache.delete(p);
    const f = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? rows.indexOf(document.activeElement as HTMLButtonElement) : -1;
    fillList();
    fillWords();
    light(true);
    if (f >= 0 && rows[f]) markFocus(rows[f]);
  });

  fillList();
  fillWords();
  el.dataset.part = part;

  return {
    el,
    get part() {
      return part;
    },
    get showing() {
      return showing;
    },
    shown(on) {
      if (on === showing) return;
      showing = on;
      told = null;
      if (on) {
        light(true);
        rail.setAttribute('aria-orientation', across() ? 'horizontal' : 'vertical');
      }
      d.shown(on);
    },
    update() {
      if (showing) light();
    },
    first() {
      return tabs[part];
    },
    setPart: (p, focus) => setPart(p, focus),
    state() {
      light(true);
      return {
        part,
        choices: rows.map((b, i) => ({ id: choices[i].id, on: b.classList.contains('is-on'), locked: b.classList.contains('is-locked'), blocked: b.classList.contains('is-blocked') })),
        info: info.textContent ?? '',
        note: noteEl.hidden ? '' : (noteEl.textContent ?? ''),
      };
    },
  };
}
