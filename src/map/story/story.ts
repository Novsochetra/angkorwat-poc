import type { Lang, PlaceId, UISound } from '../types';
import { ICON } from '../ui/icons';
import { lang, onLang, t, type WordKey } from '../ui/lang';
import { steppedShape } from '../ui/shape';
import { BEATS, SCENE_PLACE, type Scene, type StoryLine } from './beats';
import mapSvg from './empire-900.svg?raw';
import './story.css';
import { createDotTemple } from './temple';

/**
 * The story before the map: "To the young people of Cambodia" (beats.ts),
 * a beat at a time over its picture — the Khmer Empire around 900 CE
 * spreading out from Angkor (empire-900.svg: Jembezmamy, Wikimedia Commons,
 * CC0), the map's own camera on Angkor Wat, the map in grey, a sunrise, one
 * gold block and then thousands building Angkor Wat (temple.ts), the map in
 * colour again. Styles: story.css (classes start with `st-`).
 *
 * Its words come in word by word (Khmer: phrase by phrase); a beat moves on
 * by itself once there has been time to read it. A click / tap / Space / →
 * shows the whole beat, then the next one; ← goes back, a swipe too; Esc or
 * "Skip" closes it. The ខ្មែរ / EN switch at the top changes the saved
 * language (`hooks.setLang`). The last beat waits for "Start playing".
 *
 * Shots (`?shot=1&story=<n>`): beat n (1‥) with everything already in place.
 */
export interface StoryHooks {
  /** Fly the map's camera to a place, or back to the overview (null). */
  focus(id: PlaceId | null, instant: boolean): void;
  /** The ខ្មែរ / EN switch: change (and keep) the language. */
  setLang(l: Lang): void;
  sound(s: UISound): void;
  onOpen(): void;
  /** Closed: seen to the end, or skipped. */
  onClose(): void;
}

export interface Story {
  /** Show it from a beat (0‥). */
  play(from?: number): void;
  readonly open: boolean;
  /** The story hides the whole map (and has for a moment): the map need not be drawn. */
  readonly covered: boolean;
}

/** What each scene shows behind the words. */
interface Look {
  /** Darkness over the 3D map, 0‥1. */
  veil: number;
  grey?: boolean;
  dawn?: boolean;
  map?: boolean;
  dots?: 'one' | 'all';
  /** Words at the bottom, clear of the picture (else in the middle). */
  low?: boolean;
}
const SCENES: Record<Scene, Look> = {
  title: { veil: 1 },
  dark: { veil: 1 },
  map: { veil: 1, map: true },
  temple: { veil: 0.12, low: true },
  grey: { veil: 0.55, grey: true },
  dawn: { veil: 0.94, dawn: true },
  one: { veil: 1, dots: 'one', low: true },
  hands: { veil: 1, dots: 'all', low: true },
  world: { veil: 0.08, low: true },
  dawnWorld: { veil: 0.64, dawn: true },
};

/** Seconds between words (English) or phrases (Khmer) coming in. */
const STEP: Record<Lang, number> = { km: 0.13, en: 0.065 };
/** Reading time per letter (s): Khmer letters carry vowel and subscript signs, so there are more per word. */
const READ: Record<Lang, number> = { km: 0.085, en: 0.06 };
/** How long a beat stays at most (s), unless clicked on. */
const HOLD_MAX = 17;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/**
 * A line cut into the pieces that come in one after the other, each with the
 * space after it (they join back into the line exactly): English words,
 * Khmer phrases (a line breaks only between them, as Khmer is set: never
 * inside a word), the list's fields, the title whole.
 */
function pieces(line: StoryLine, l: Lang): { text: string; gap: string }[] {
  const text = line[l];
  if (line.kind === 'title') return [{ text, gap: '' }];
  const parts = text.split(/(\s+)/);
  const out: { text: string; gap: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const piece = { text: parts[i], gap: parts[i + 1] ?? '' };
    const last = out[out.length - 1];
    // (a field of the list keeps its words together, up to its comma)
    if (line.kind === 'list' && last && !last.text.endsWith(',')) {
      last.text += last.gap + piece.text;
      last.gap = piece.gap;
    } else out.push(piece);
  }
  return out;
}

export function createStory(hooks: StoryHooks, opts: { shot: boolean }): Story {
  const shot = opts.shot;
  const root = el('div', 'st');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  root.dataset.tAria = 'stStory';
  if (shot) root.classList.add('st-instant');
  root.style.setProperty('--st-shape', steppedShape(10, 5));

  const temple = createDotTemple();
  const map = el('figure', 'st-map', `${mapSvg}<figcaption><span data-t="stYear"></span><small data-t="stCredit"></small></figcaption>`);
  const stage = el('div', 'st-stage');
  stage.setAttribute('aria-live', 'polite');
  const langBtns = (['km', 'en'] as Lang[]).map((l) => {
    const b = el('button', 'st-lang', l === 'km' ? 'ខ្មែរ' : 'EN');
    b.type = 'button';
    b.lang = l;
    b.addEventListener('click', () => {
      if (l !== lang()) hooks.setLang(l);
      hooks.sound('toggle');
    });
    return b;
  });
  const skip = el('button', 'st-skip', `<span data-t="stSkip"></span>${ICON.chevron}`);
  skip.type = 'button';
  skip.addEventListener('click', () => close('close'));
  const top = el('div', 'st-top');
  const langGroup = el('div', 'st-langs');
  langGroup.setAttribute('role', 'group');
  langGroup.dataset.tAria = 'language';
  langGroup.append(...langBtns);
  top.append(langGroup, skip);

  const prevBtn = el('button', 'st-arrow', ICON.back);
  prevBtn.type = 'button';
  prevBtn.dataset.tAria = 'stPrev';
  prevBtn.addEventListener('click', () => prev(true));
  const nextBtn = el('button', 'st-arrow', ICON.chevron);
  nextBtn.type = 'button';
  nextBtn.dataset.tAria = 'stNext';
  nextBtn.addEventListener('click', () => next(true));
  const progress = el('div', 'st-progress');
  progress.setAttribute('aria-hidden', 'true');
  const marks = BEATS.map(() => progress.appendChild(el('i')));
  const hint = el('p', 'st-hint');
  const foot = el('div', 'st-foot');
  const row = el('div', 'st-foot-row');
  row.append(prevBtn, progress, nextBtn);
  foot.append(row, hint);

  root.append(el('div', 'st-grey'), el('div', 'st-veil'), el('div', 'st-dawn'), el('div', 'st-shade'), map, temple.canvas, stage, top, foot);

  let open = false;
  let index = 0;
  /** Seconds into the beat; its words are all in at `revealEnd`; it moves on at `hold`. */
  let clock = 0;
  let revealEnd = 0;
  let hold = 0;
  let text: HTMLElement | null = null;
  let scene: Scene | null = null;
  /** When the scene last changed (ms). */
  let sceneAt = 0;
  let place: PlaceId | 'overview' = 'overview';
  const touchFirst = matchMedia('(pointer: coarse)').matches;

  // ── Words ─────────────────────────────────────────────────────────────────
  function fillWords(): void {
    for (const e of root.querySelectorAll<HTMLElement | SVGElement>('[data-t]')) e.textContent = t(e.dataset.t as WordKey);
    for (const e of root.querySelectorAll<HTMLElement>('[data-t-aria]')) e.setAttribute('aria-label', t(e.dataset.tAria as WordKey));
    for (const b of langBtns) b.setAttribute('aria-pressed', String(b.lang === lang()));
    hint.textContent = t(touchFirst ? 'stHintTouch' : 'stHint');
  }
  fillWords();
  onLang(() => {
    fillWords();
    // The beat again in the new language, all at once.
    if (open) render(true);
  });

  /** The beat's words (and the Start button on the last one); `whole`: all in at once. */
  function render(whole: boolean): void {
    const l = lang();
    const beat = BEATS[index];
    const box = el('div', `st-text${whole ? ' is-done' : ''}`);
    box.lang = l;
    let at = 0.5;
    let letters = 0;
    if (beat.scene === 'title') box.append(el('div', 'st-temple', ICON.temple));
    for (const line of beat.lines) {
      const kind = line.kind ?? 'body';
      if (kind === 'sign') box.append(el('div', 'st-orn', `<i></i>${ICON.diamond}<i></i>`));
      const p = el('p', `st-line st-${kind}`);
      const step = kind === 'list' ? 0.3 : STEP[l] * (kind === 'big' ? 1.4 : 1);
      const words = pieces(line, l);
      words.forEach((w, i) => {
        const s = p.appendChild(el('span', 'st-w'));
        s.textContent = w.text;
        s.style.setProperty('--d', `${(at + i * step).toFixed(2)}s`);
        if (w.gap) p.append(w.gap);
      });
      box.append(p);
      if (kind === 'title') box.append(el('div', 'st-orn', `<i></i>${ICON.diamond}<i></i>`));
      at += (words.length - 1) * step + (kind === 'title' ? 1.4 : 0.8) + 0.3;
      letters += line[l].length;
    }
    if (index === BEATS.length - 1) {
      const start = el('button', 'st-start st-w', `<span>${t('stStart')}</span>${ICON.arrow}`);
      start.type = 'button';
      start.style.setProperty('--d', `${at.toFixed(2)}s`);
      start.addEventListener('click', () => close('begin'));
      box.append(start);
      at += 0.8;
    }
    revealEnd = whole ? 0 : at;
    hold = Math.min(HOLD_MAX, Math.max(at + 2.2, 2.4 + letters * READ[l]));
    if (text) {
      const old = text;
      old.classList.add('is-out');
      setTimeout(() => old.remove(), shot ? 0 : 700);
    }
    text = box;
    stage.append(box);
  }

  // ── Scenes ────────────────────────────────────────────────────────────────
  function setScene(s: Scene, instant: boolean): void {
    const look = SCENES[s];
    root.style.setProperty('--st-veil', String(look.veil));
    root.classList.toggle('is-grey', !!look.grey);
    root.classList.toggle('is-dawn', !!look.dawn);
    root.classList.toggle('is-low', !!look.low);
    root.classList.toggle('is-dots', !!look.dots);
    root.classList.toggle('is-map', !!look.map);
    // The empire spreads out again each time the map comes back.
    if (look.map && scene !== s) {
      map.classList.remove('is-on');
      void map.getBoundingClientRect();
      map.classList.add('is-on');
    } else if (!look.map) map.classList.remove('is-on');
    if (look.dots) temple.show(look.dots, instant);
    const want = SCENE_PLACE[s];
    if (want && want !== place) {
      place = want;
      hooks.focus(want === 'overview' ? null : want, instant);
    }
    if (s !== scene) sceneAt = performance.now();
    scene = s;
  }

  function go(i: number, whole = false): void {
    index = Math.max(0, Math.min(BEATS.length - 1, i));
    clock = 0;
    render(whole || shot);
    setScene(BEATS[index].scene, shot);
    marks.forEach((m, k) => {
      m.classList.toggle('is-past', k < index);
      m.classList.toggle('is-now', k === index);
    });
    prevBtn.disabled = index === 0;
    nextBtn.hidden = index === BEATS.length - 1;
    root.classList.toggle('is-first', index < 3);
  }

  /** Show the whole beat if its words are still coming in, else the next beat. */
  function next(byHand: boolean): void {
    if (!open) return;
    if (byHand && clock < revealEnd && text && !text.classList.contains('is-done')) {
      text.classList.add('is-done');
      clock = Math.max(clock, revealEnd);
      return;
    }
    if (index >= BEATS.length - 1) return;
    if (byHand) hooks.sound('hover');
    go(index + 1);
  }

  function prev(byHand: boolean): void {
    if (!open || index === 0) return;
    if (byHand) hooks.sound('hover');
    go(index - 1, true);
  }

  function close(sound: UISound): void {
    if (!open) return;
    open = false;
    hooks.sound(sound);
    if (place !== 'overview') hooks.focus(null, false);
    place = 'overview';
    root.classList.add('is-closing');
    document.body.classList.remove('st-on');
    // (the map's interface fades back in: story.css)
    document.body.classList.add('st-after');
    setTimeout(() => document.body.classList.remove('st-after'), 1300);
    setTimeout(() => {
      if (!open) root.remove();
    }, 1100);
    hooks.onClose();
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  // While open, every key is the story's (the map's and the roaming's keys wait),
  // but for browser shortcuts and the bug report (B) and block look (K) tools.
  addEventListener(
    'keydown',
    (e) => {
      if (!open || e.ctrlKey || e.metaKey || e.altKey || /^[bk]$/i.test(e.key)) return;
      e.stopImmediatePropagation();
      const onButton = e.target instanceof HTMLButtonElement && root.contains(e.target);
      if ((e.key === ' ' || e.key === 'Enter') && onButton) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'PageDown') next(true);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') prev(true);
      else if (e.key === 'Escape') close('close');
      else return;
      e.preventDefault();
    },
    true,
  );
  let down: { x: number; y: number } | null = null;
  let swiped = false;
  root.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    swiped = false;
  });
  root.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    if (dx < 0) next(true);
    else prev(true);
  });
  root.addEventListener('click', (e) => {
    if (swiped || (e.target as Element).closest('button')) return;
    next(true);
  });
  addEventListener('resize', () => {
    if (open) temple.resize();
  });

  // ── Frame ─────────────────────────────────────────────────────────────────
  let last = 0;
  function tick(now: number): void {
    if (!open) return;
    // (real time, so a slow machine does not slow the story; a hidden tab pauses it)
    const dt = last ? Math.min(0.5, (now - last) / 1000) : 0;
    last = now;
    clock += dt;
    if (SCENES[BEATS[index].scene].dots) temple.frame(dt);
    if (clock > hold && index < BEATS.length - 1) next(false);
    requestAnimationFrame(tick);
  }

  return {
    play(from = 0) {
      if (!open) {
        open = true;
        scene = null;
        text?.remove();
        text = null;
        root.classList.remove('is-closing');
        document.body.append(root);
        document.body.classList.add('st-on');
        hooks.onOpen();
        root.focus({ preventScroll: true });
        last = 0;
        if (!shot) requestAnimationFrame(tick);
      }
      go(from);
    },
    get open() {
      return open;
    },
    get covered() {
      const look = scene && SCENES[scene];
      // (the veil takes 1.8 s to close: story.css)
      return open && !!look && look.veil >= 1 && performance.now() - sceneAt > 2000;
    },
  };
}
