import type { Duck, Lang, PlaceId, TypeKey, UISound } from '../types';
import { ICON } from '../ui/icons';
import { lang, onLang, t, type WordKey } from '../ui/lang';
import { steppedShape } from '../ui/shape';
import { BEATS, SCENE_PLACE, type Scene, type StoryLine } from './beats';
import mapSvg from './empire-900.svg?raw';
import { createWavingFlag } from './flag';
import './story.css';
import { createDotTemple } from './temple';

/**
 * The story before the map: "To the young people of Cambodia" (beats.ts)
 * under the flag of Cambodia, waving (flag.ts), then a beat at a time over
 * its picture — the Khmer Empire around 900 CE
 * spreading out from Angkor (empire-900.svg: Jembezmamy, Wikimedia Commons,
 * CC0), the map's own camera on Angkor Wat, the map in grey, a sunrise, one
 * gold block and then thousands building Angkor Wat (temple.ts), the map in
 * colour again. Styles: story.css (classes start with `st-`).
 *
 * Its words come in word by word, each with a typewriter's strike
 * (`hooks.type`, as the word shows), while the map's background sound
 * steps back (`hooks.duck`); a beat moves on by itself once there has
 * been time to read it. A click / tap / Space / → shows the whole beat,
 * then the next one; ← goes back, a swipe too; Esc or "Skip" closes it.
 * The ខ្មែរ / EN switch at the top changes the saved language
 * (`hooks.setLang`). The last beat waits for "Start playing".
 *
 * While the map's sound is still off (a browser plays none before a click
 * or a key), the first beat waits for "Start" in place of the arrows: that
 * click turns the sound on (`hooks.startSound`), so the typing is heard
 * from the next beat on.
 *
 * Shots (`?shot=1&story=<n>`): beat n (1‥) with everything already in place.
 */
export interface StoryHooks {
  /** Fly the map's camera to a place, or back to the overview (null). */
  focus(id: PlaceId | null, instant: boolean): void;
  /** The ខ្មែរ / EN switch: change (and keep) the language. */
  setLang(l: Lang): void;
  sound(s: UISound): void;
  /** The map's sound is on (else the first beat waits for "Start"). */
  soundOn(): boolean;
  /** Turn the map's sound on (from inside the click on "Start"). */
  startSound(): Promise<void>;
  /** A word comes in `delay` s from now: a key of the typing sound, panned −1‥1 by where the word is on the screen. */
  type(k: TypeKey, pan: number, delay: number): void;
  /** The background sound steps back (story open, words typing) or comes back (`none`). */
  duck(d: Duck): void;
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

/** Seconds between words coming in (Khmer words are longer: more letters each). */
const STEP: Record<Lang, number> = { km: 0.09, en: 0.065 };
/** Reading time per letter (s): Khmer letters carry vowel and subscript signs, so there are more per word. */
const READ: Record<Lang, number> = { km: 0.085, en: 0.06 };
/** How long a beat stays at most (s), unless clicked on. */
const HOLD_MAX = 17;
/** After "Start", the first beat moves on this soon (s): it has been seen already. */
const BEGIN_HOLD = 0.7;
/** How far the typing's keys pan (−1‥1) from the middle of the screen to its edge. */
const KEY_PAN = 0.6;
/** The background stays ducked this long (s) after the last key. */
const TYPING_TAIL = 0.35;
/**
 * A word's strike comes this long (s) after it starts to come in: it fades
 * in (story.css `st-word`), and is first seen about then (a sound heard
 * before what makes it is seen feels wrong at once; a little after, not).
 */
const KEY_LAG = 0.12;
/** Keys are handed to the sound this far ahead (s), so they keep their spacing whatever the frame rate. */
const KEY_AHEAD = 0.1;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** Khmer words (Khmer puts no spaces between words; the browser's dictionary finds them), if the browser can. */
const KM_WORDS = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('km', { granularity: 'word' }) : null;

/** A Khmer phrase's words, its signs («, ។, ?) kept with the word beside them; the phrase whole if the browser cannot tell. */
function khmerWords(phrase: string): string[] {
  if (!KM_WORDS) return [phrase];
  const out: string[] = [];
  let lead = '';
  for (const s of KM_WORDS.segment(phrase)) {
    if (s.isWordLike) {
      out.push(lead + s.segment);
      lead = '';
    } else if (out.length) out[out.length - 1] += s.segment;
    else lead += s.segment;
  }
  if (lead) out.push(lead);
  return out;
}

/**
 * A line cut into phrases (the space after each: they join back into the
 * line exactly) and the words in them that come in one after the other.
 * English: a phrase is a word. Khmer: the words between two spaces (a line
 * breaks only at the spaces, as Khmer is set). The list: one field each, up
 * to its comma. The title: whole.
 */
function pieces(line: StoryLine, l: Lang): { words: string[]; gap: string }[] {
  const text = line[l];
  if (line.kind === 'title') return [{ words: [text], gap: '' }];
  const parts = text.split(/(\s+)/);
  const out: { words: string[]; gap: string }[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const gap = parts[i + 1] ?? '';
    const last = out[out.length - 1];
    // (a field of the list keeps its words together, up to its comma)
    if (line.kind === 'list' && last && !last.words[0].endsWith(',')) {
      last.words[0] += last.gap + parts[i];
      last.gap = gap;
    } else out.push({ words: l === 'km' && line.kind !== 'list' ? khmerWords(parts[i]) : [parts[i]], gap });
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
  const flag = createWavingFlag({ shot });
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
  const beginBtn = el('button', 'st-start st-begin', `${ICON.play}<span data-t="stBegin"></span>`);
  beginBtn.type = 'button';
  beginBtn.addEventListener('click', () => begin());
  const soundNote = el('p', 'st-sound', `${ICON.speaker}<span data-t="stSoundOn"></span>`);
  const foot = el('div', 'st-foot');
  const row = el('div', 'st-foot-row');
  row.append(prevBtn, progress, nextBtn);
  foot.append(beginBtn, soundNote, row, hint);

  root.append(el('div', 'st-grey'), el('div', 'st-veil'), el('div', 'st-dawn'), el('div', 'st-shade'), map, temple.canvas, stage, top, foot);

  let open = false;
  /** The first beat waits for "Start" (the sound is not on yet). */
  let gated = false;
  let index = 0;
  /** Seconds into the beat; its words are all in at `revealEnd`; it moves on at `hold`. */
  let clock = 0;
  let revealEnd = 0;
  let hold = 0;
  let text: HTMLElement | null = null;
  /** The beat's keys of the typing sound (when, in the beat's clock), and the next one to play. */
  let keys: { at: number; kind: TypeKey; word: HTMLElement }[] = [];
  let nextKey = 0;
  /** The background stays ducked for the typing until then (the beat's clock). */
  let typedUntil = 0;
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

  /**
   * The beat's words (and the Start button on the last one); `whole`: all in at once.
   * The box is placed by its own scene (`is-low`, `is-map` on it, not on `.st`),
   * so the words of the beat before stay where they were while they fade out.
   */
  function render(whole: boolean): void {
    const l = lang();
    const beat = BEATS[index];
    const look = SCENES[beat.scene];
    const box = el('div', `st-text${whole ? ' is-done' : ''}${look.low ? ' is-low' : ''}${look.map ? ' is-map' : ''}`);
    box.lang = l;
    const copy = box.appendChild(el('div', 'st-copy'));
    let at = 0.5;
    let letters = 0;
    keys = [];
    nextKey = 0;
    typedUntil = 0;
    if (beat.scene === 'title') {
      // (the title again, in the other language: the flag moves to the new box, and a
      // space as tall keeps the old one's words where they were while they fade out)
      if (text?.contains(flag.el)) {
        const gap = el('div', 'st-flag');
        gap.style.height = `${flag.el.offsetHeight}px`;
        flag.el.replaceWith(gap);
      }
      copy.append(flag.el);
    }
    for (const line of beat.lines) {
      const kind = line.kind ?? 'body';
      if (kind === 'sign') copy.append(el('div', 'st-orn', `<i></i>${ICON.diamond}<i></i>`));
      const p = el('p', `st-line st-${kind}`);
      const step = kind === 'list' ? 0.3 : STEP[l] * (kind === 'big' ? 1.4 : 1);
      let n = 0;
      for (const phrase of pieces(line, l)) {
        // (a Khmer phrase's words stay on one line: `st-phrase`)
        const holder = phrase.words.length > 1 ? p.appendChild(el('span', 'st-phrase')) : p;
        for (const w of phrase.words) {
          const s = holder.appendChild(el('span', 'st-w'));
          s.textContent = w;
          const d = Number((at + n++ * step).toFixed(2));
          s.style.setProperty('--d', `${d}s`);
          if (!whole) keys.push({ at: d + KEY_LAG, kind: kind === 'title' ? 'title' : 'key', word: s });
        }
        if (phrase.gap) p.append(phrase.gap);
      }
      copy.append(p);
      if (kind === 'title') copy.append(el('div', 'st-orn', `<i></i>${ICON.diamond}<i></i>`));
      at += (n - 1) * step + (kind === 'title' ? 1.4 : 0.8) + 0.3;
      letters += line[l].length;
    }
    if (index === BEATS.length - 1) {
      const start = el('button', 'st-start st-w', `<span>${t('stStart')}</span>${ICON.arrow}`);
      start.type = 'button';
      start.style.setProperty('--d', `${at.toFixed(2)}s`);
      start.addEventListener('click', () => close('begin'));
      copy.append(start);
      at += 0.8;
    }
    revealEnd = whole ? 0 : at;
    hold = gated ? Infinity : Math.min(HOLD_MAX, Math.max(at + 2.2, 2.4 + letters * READ[l]));
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
    if (s === 'title') flag.start();
    else flag.stop();
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
    if (gated) return begin();
    if (byHand && clock < revealEnd && text && !text.classList.contains('is-done')) {
      text.classList.add('is-done');
      clock = Math.max(clock, revealEnd);
      // (all in at once: the rest of its keys are not typed)
      nextKey = keys.length;
      return;
    }
    if (index >= BEATS.length - 1) return;
    if (byHand) hooks.sound('hover');
    go(index + 1);
  }

  /** "Start" (or a click, a tap, a key anywhere): the sound comes on with a heavy strike, the arrows show, and the story moves on. */
  function begin(): void {
    if (!gated) return;
    gated = false;
    root.classList.remove('is-gated');
    // (its own keys, if any are still to come, would strike twice)
    nextKey = keys.length;
    void hooks.startSound().then(() => hooks.type('title', 0, 0));
    hold = clock + BEGIN_HOLD;
    if (document.activeElement === beginBtn) root.focus({ preventScroll: true });
  }

  function prev(byHand: boolean): void {
    if (!open || index === 0) return;
    if (byHand) hooks.sound('hover');
    go(index - 1, true);
  }

  function close(sound: UISound): void {
    if (!open) return;
    open = false;
    flag.stop();
    hooks.sound(sound);
    hooks.duck('none');
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
    // The keys of the words about to come in (the same clock as their `--d`).
    while (nextKey < keys.length && keys[nextKey].at <= clock + KEY_AHEAD) {
      const k = keys[nextKey++];
      const r = k.word.getBoundingClientRect();
      const pan = ((r.left + r.width / 2) / innerWidth - 0.5) * 2 * KEY_PAN;
      hooks.type(k.kind, Math.max(-KEY_PAN, Math.min(KEY_PAN, pan)), Math.max(0, k.at - clock));
      typedUntil = k.at + TYPING_TAIL;
    }
    hooks.duck(nextKey < keys.length || clock < typedUntil ? 'typing' : 'story');
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
        hooks.duck('story');
        hooks.onOpen();
        root.focus({ preventScroll: true });
        last = 0;
        if (!shot) requestAnimationFrame(tick);
      }
      gated = from === 0 && !hooks.soundOn();
      root.classList.toggle('is-gated', gated);
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
