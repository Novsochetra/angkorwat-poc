import { onLang, t } from '../ui/lang';

/**
 * New Year's Eve's countdown over the map (AWP-35, docs/discussion/new-year-online.md "The countdown"): HTML over
 * the canvas, in the interface's root (#ui: `ui=0` hides it with the rest), never in the way of a click
 * (`pointer-events: none` throughout); the chip and the toast go down below the interface's controls they would
 * cover (the title card, the corner's buttons, the roaming bars: measured as they show and once a second, `place`),
 * the place cards on the map (they move with it) aside. nye/event.ts drives it from
 * nye/clock.ts once a frame (`set`), so a shot (`countdown=<s>`, `fireworks=<s>`) shows that moment:
 *
 * - **the chip** at the top in the middle, from the night-time hold (22:30 ICT) to the last ten seconds:
 *   "ឆ្នាំថ្មី ២០២៧ · ០១:២៩:៥៩" (Khmer numerals in Khmer, `num`), "New Year 2027 · 01:29:59" in English;
 * - **the last ten seconds**: one huge numeral at a time in the middle (១០ … ១), each a gold pulse;
 * - **midnight**: "សួស្តីឆ្នាំថ្មី ២០២៧" / "Happy New Year 2027" big and golden, fading out after `GREET` s;
 * - **its toast** (event.ts says when): why the time changed, under the chip.
 *
 * Reduce motion (the setting or the system: `.mu-calm` on the root) keeps the numerals still (a soft fade, no
 * scale) and the greeting without its rise; a shot (`.mu-shot`) draws every one at rest. Khmer display text in
 * Koulen (`--mu-display` falls back to it per letter), as the interface's titles.
 */

/** What the overlay shows now. */
export interface NyeView {
  /** The chip's time left ("01:29:59", digits as said: `num`), or null: no chip. */
  chip: string | null;
  /** The huge numeral (10‥1, as said), or null. */
  numeral: string | null;
  /** The greeting shows (0 ≤ s < GREET), and fades (s ≥ GREET − FADE). */
  greet: boolean;
}

export interface NyeOverlay {
  set(v: NyeView): void;
  /** A toast under the chip for `seconds` (its kicker, its line, a note under it). */
  toast(kick: string, line: string, note: string, seconds: number): void;
  /** Every frame: the toast's time. */
  tick(dt: number): void;
  /** Its words again (the language changed): `year` the year that begins. */
  words(year: string): void;
  /** The greeting fades out (its last seconds), or not. */
  fade(on: boolean): void;
}

const STYLE = `
.nye-ov { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 4; }
/* (z-index 4: over the place cards (1‥3), under the place card opened (6), the settings and every other panel) */
.nye-ov * { pointer-events: none; }
/* The chip: top middle, the interface's small panel, gold. */
.nye-chip { position: absolute; left: 50%; top: calc(16 * var(--px)); display: flex; align-items: center; gap: calc(9 * var(--px));
  padding: calc(6 * var(--px)) calc(16 * var(--px)) calc(7 * var(--px)) calc(12 * var(--px)); white-space: nowrap;
  transform: translate(-50%, calc(-8 * var(--px))); opacity: 0; transition: opacity 0.6s, transform 0.6s var(--mu-ease);
  --mu-edge: rgba(255, 208, 112, 0.7); color: var(--mu-gold-hi); font: 400 calc(17 * var(--px)) / 1.2 var(--mu-display); }
.nye-chip.is-on { opacity: 1; transform: translate(-50%, 0); }
.nye-chip > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.86), rgba(4, 15, 32, 0.86) var(--mu-night)); }
.nye-chip-star { flex: none; width: calc(16 * var(--px)); height: calc(16 * var(--px)); color: #ffd54a; filter: drop-shadow(0 0 calc(4 * var(--px)) rgba(255, 190, 60, 0.9)); }
.nye-chip-y { color: var(--mu-ink); }
.nye-chip-sep { color: var(--mu-gold); opacity: 0.8; }
.nye-chip-t { font-variant-numeric: tabular-nums; min-width: 4.6em; text-align: left; color: var(--mu-gold-hi); text-shadow: 0 0 calc(8 * var(--px)) rgba(255, 180, 50, 0.45); }
:lang(km) .nye-chip { font-size: calc(18 * var(--px)); line-height: 1.35; }
:lang(km) .nye-chip-t { min-width: 5.2em; }

/* The last ten seconds: one huge numeral, a gold pulse each second. */
.nye-num { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); opacity: 0; white-space: nowrap;
  font: 400 min(42vh, 46vw) / 1 var(--mu-display); color: #ffd76a; letter-spacing: 0;
  background: linear-gradient(180deg, #fff6c8 0%, #ffd76a 38%, #f2a531 72%, #c97a1c 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 min(2.4vh, 2.6vw) rgba(255, 176, 48, 0.75)) drop-shadow(0 min(0.8vh, 0.9vw) 0 rgba(60, 28, 0, 0.55)); }
.nye-num.is-on { opacity: 1; animation: nye-pulse 1s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
:lang(km) .nye-num { font-size: min(36vh, 40vw); line-height: 1.25; }
@keyframes nye-pulse {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(1.45); filter: drop-shadow(0 0 min(6vh, 6vw) rgba(255, 210, 90, 1)) drop-shadow(0 min(0.8vh, 0.9vw) 0 rgba(60, 28, 0, 0.55)); }
  14% { opacity: 1; }
  30% { transform: translate(-50%, -50%) scale(0.97); }
  45% { transform: translate(-50%, -50%) scale(1); }
  82% { opacity: 1; }
  100% { opacity: 0.12; transform: translate(-50%, -50%) scale(0.92); }
}
@keyframes nye-pulse-calm { 0% { opacity: 0.2; } 18% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0.35; } }
.mu-calm .nye-num.is-on { animation-name: nye-pulse-calm; }

/* Midnight: the greeting, big and golden, then it fades. */
.nye-greet { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); width: max-content; max-width: calc(100vw - 32px); text-align: center; opacity: 0;
  font: 400 min(12vh, 9vw) / 1.15 var(--mu-display); color: #ffd76a;
  background: linear-gradient(180deg, #fff6c8 0%, #ffd76a 45%, #e99a2a 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 min(2vh, 1.6vw) rgba(255, 176, 48, 0.7)) drop-shadow(0 min(0.5vh, 0.4vw) 0 rgba(60, 28, 0, 0.55));
  transition: opacity 2.4s ease-in; }
:lang(km) .nye-greet { font-size: min(10.5vh, 8vw); line-height: 1.45; }
.nye-greet.is-on { opacity: 1; transition: opacity 0.5s ease-out; animation: nye-greet 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.nye-greet.is-on.is-fading { opacity: 0; transition: opacity 2.4s ease-in; }
@keyframes nye-greet { 0% { transform: translate(-50%, -38%) scale(0.86); } 100% { transform: translate(-50%, -50%) scale(1); } }
.mu-calm .nye-greet.is-on { animation: none; }

/* Its toast: why the time changed (under the chip). */
.nye-toast { position: absolute; left: 50%; top: calc(64 * var(--px)); display: flex; align-items: center; gap: calc(12 * var(--px)); width: max-content;
  max-width: calc(100vw - 40px); box-sizing: border-box; padding: calc(9 * var(--px)) calc(20 * var(--px)) calc(10 * var(--px)) calc(12 * var(--px));
  transform: translate(-50%, -6px); opacity: 0; transition: opacity 0.6s, transform 0.6s var(--mu-ease); --mu-edge: rgba(255, 208, 112, 0.8); }
.nye-toast.is-on { opacity: 1; transform: translate(-50%, 0); transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
.nye-toast .mu-glow { opacity: 0.55; }
.nye-toast-ico { flex: none; display: grid; place-items: center; width: calc(44 * var(--px)); height: calc(44 * var(--px)); border-radius: 50%;
  background: rgba(58, 38, 8, 0.94); box-shadow: inset 0 0 0 calc(2 * var(--px)) #ffd54a, 0 0 calc(12 * var(--px)) rgba(255, 180, 40, 0.55); color: #ffd54a; }
.nye-toast-ico svg { width: calc(28 * var(--px)); height: calc(28 * var(--px)); }
.nye-toast-text { display: flex; flex-direction: column; gap: calc(2 * var(--px)); min-width: 0; }
.nye-toast-text em { font-style: normal; font-size: calc(12.5 * var(--px)); font-weight: 700; color: var(--mu-gold-hi); letter-spacing: 0.04em; }
.nye-toast-text b { font: 700 calc(18 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-ink); }
.nye-toast-text span { font-size: calc(13 * var(--px)); color: var(--mu-ink2); }
:lang(km) .nye-toast-text em { letter-spacing: 0; font-size: calc(13.5 * var(--px)); }
:lang(km) .nye-toast-text b { line-height: 1.45; font-weight: 400; }
:lang(km) .nye-toast-text span { font-size: calc(14 * var(--px)); }
/* (a phone: the chip a little smaller; the toast's line wraps) */
@media (max-width: 639px), (max-height: 500px) {
  .nye-chip { top: 8px; font-size: 14px; padding: 4px 12px 5px 9px; }
  :lang(km) .nye-chip { font-size: 15px; }
  .nye-toast { top: 52px; max-width: min(560px, calc(100vw - 32px)); }
  .nye-toast-text b { font-size: 15px; }
}
/* (photos: the overlay stands aside, as the interface's banners do) */
body.roam-photo .nye-chip, body.roam-photo .nye-toast { opacity: 0 !important; }
`;

/** What the chip and the toast must not cover: the interface's controls and counters near the top. */
const OBSTACLES = '.mu-title, .mu-corner, button, a[href], [role="toolbar"], [role="status"]:not(.nye-toast):not(.nye-greet)';

/** A small four-pointed spark (the chip, the toast). */
const SPARK = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0l1.6 6.4L16 8l-6.4 1.6L8 16l-1.6-6.4L0 8l6.4-1.6z"/></svg>`;
/** A burst over a temple's tower (the toast). */
const BURST = `<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="currentColor"><circle cx="16" cy="9" r="1.8"/><path d="M15.3 1h1.4v4h-1.4zM15.3 13h1.4v3h-1.4zM8 8.3h4v1.4H8zM20 8.3h4v1.4h-4zM10.3 3.3l1-1 2.8 2.8-1 1zM17.9 12.9l1-1 2.8 2.8-1 1zM20.7 2.3l1 1-2.8 2.8-1-1zM11.3 11.9l1 1-2.8 2.8-1-1z"/><path opacity=".75" d="M16 17l1.2 3h-2.4zM14.3 20.6h3.4l.8 2.6h-5zM12.8 23.8h6.4l.9 2.6h-8.2zM10 27h12l1.2 3H8.8z"/></g><circle cx="26" cy="20" r="1.2" fill="#f59ab8"/><circle cx="5" cy="18" r="1" fill="#cfe8ff"/></svg>`;

export function createNyeOverlay(root: HTMLElement): NyeOverlay {
  if (!document.getElementById('nye-ov-style')) {
    const s = document.createElement('style');
    s.id = 'nye-ov-style';
    s.textContent = STYLE;
    document.head.append(s);
  }
  const ov = document.createElement('div');
  ov.className = 'nye-ov';
  ov.innerHTML = `
    <div class="nye-chip mu-frame mu-sm" role="timer" aria-live="off"><span class="mu-bg"></span>${SPARK.replace('<svg ', '<svg class="nye-chip-star" ')}<span class="nye-chip-y"></span><span class="nye-chip-sep">·</span><span class="nye-chip-t"></span></div>
    <div class="nye-toast mu-frame mu-sm" role="status"><span class="mu-bg"></span><span class="mu-glow"></span><span class="nye-toast-ico">${BURST}</span><span class="nye-toast-text"><em></em><b></b><span></span></span></div>
    <div class="nye-num" aria-hidden="true"></div>
    <div class="nye-greet" role="status"></div>`;
  // (last in the root: over the map's name cards, which move with the map; it is never in the way of a click)
  root.append(ov);
  const chip = ov.querySelector<HTMLElement>('.nye-chip')!;
  const chipY = ov.querySelector<HTMLElement>('.nye-chip-y')!;
  const chipT = ov.querySelector<HTMLElement>('.nye-chip-t')!;
  const toastEl = ov.querySelector<HTMLElement>('.nye-toast')!;
  const [kickEl, lineEl, noteEl] = [...toastEl.querySelectorAll<HTMLElement>('.nye-toast-text > *')];
  const numEl = ov.querySelector<HTMLElement>('.nye-num')!;
  const greetEl = ov.querySelector<HTMLElement>('.nye-greet')!;
  let year = '';
  let shown: NyeView = { chip: null, numeral: null, greet: false };
  let toastLeft = 0;
  const shot = root.classList.contains('mu-shot');

  const words = (y: string) => {
    year = y;
    chipY.textContent = t('nyeChip', { year });
    chip.setAttribute('aria-label', t('nyeChipAria'));
    greetEl.textContent = t('nyeHappy', { year });
  };
  onLang(() => words(year));

  /** Down below the controls a box centred at the top would cover (the title card, the corner, roaming's bars). */
  const place = () => {
    const rr = root.getBoundingClientRect();
    const boxes: { l: number; t: number; r: number; b: number }[] = [];
    for (const c of document.querySelectorAll<HTMLElement>(OBSTACLES)) {
      if (ov.contains(c) || c.closest('.mu-pin')) continue;
      const r = c.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.top - rr.top > rr.height * 0.4) continue;
      const cs = getComputedStyle(c);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      boxes.push({ l: r.left - rr.left, t: r.top - rr.top, r: r.right - rr.left, b: r.bottom - rr.top });
    }
    const below = (w: number, h: number, top: number, left = (rr.width - w) / 2) => {
      let y = top;
      for (let pass = 0; pass < 10; pass++) {
        let moved = false;
        for (const o of boxes)
          if (left < o.r + 6 && left + w > o.l - 6 && y < o.b + 6 && y + h > o.t - 6) {
            y = o.b + 8;
            moved = true;
          }
        if (!moved) break;
      }
      return y;
    };
    chip.style.top = '';
    chip.style.left = '';
    const cw = chip.offsetWidth;
    const ch = chip.offsetHeight;
    const c0 = chip.offsetTop;
    // (at the top, in the middle of the room between what stands there — the title card and the corner's buttons —
    // when it fits; else down below them)
    let gl = 0;
    let gr = rr.width;
    for (const o of boxes)
      if (o.t < c0 + ch + 6 && o.b > c0 - 6) {
        if (o.r <= rr.width / 2 + cw / 2) gl = Math.max(gl, o.r);
        if (o.l >= rr.width / 2 - cw / 2) gr = Math.min(gr, o.l);
      }
    const fits = gl < gr && gr - gl >= cw + 20;
    const cl = fits ? (gl + gr - cw) / 2 : (rr.width - cw) / 2;
    const cy = below(cw, ch, c0, cl);
    chip.style.top = `${Math.round(cy)}px`;
    chip.style.left = `${Math.round(cl + cw / 2)}px`;
    toastEl.style.top = '';
    const top = chip.classList.contains('is-on') ? cy + chip.offsetHeight + 8 : toastEl.offsetTop;
    toastEl.style.top = `${Math.round(below(toastEl.offsetWidth, toastEl.offsetHeight, top))}px`;
  };
  let placedAt = -1e9;

  return {
    set(v) {
      const fresh = v.chip !== null && shown.chip === null;
      if (v.chip !== shown.chip) {
        if (v.chip !== null && chipT.textContent !== v.chip) chipT.textContent = v.chip;
        chip.classList.toggle('is-on', v.chip !== null);
      }
      const now = performance.now();
      if (fresh || now - placedAt > 1000) {
        placedAt = now;
        if (v.chip !== null || toastLeft > 0) place();
      }
      if (v.numeral !== shown.numeral) {
        numEl.classList.remove('is-on');
        if (v.numeral !== null) {
          numEl.textContent = v.numeral;
          // (the pulse again for the new numeral)
          void numEl.offsetWidth;
          numEl.classList.add('is-on');
        }
      }
      if (v.greet !== shown.greet) {
        greetEl.classList.toggle('is-on', v.greet);
      }
      shown = { chip: v.chip, numeral: v.numeral, greet: v.greet };
    },
    toast(kick, line, note, seconds) {
      kickEl.textContent = kick;
      lineEl.textContent = line;
      noteEl.textContent = note;
      noteEl.hidden = !note;
      toastEl.classList.remove('is-on');
      void toastEl.offsetWidth;
      toastEl.classList.add('is-on');
      toastLeft = shot ? Infinity : seconds;
      place();
    },
    tick(dt) {
      if (toastLeft > 0 && (toastLeft -= dt) <= 0) toastEl.classList.remove('is-on');
    },
    words,
    fade(on) {
      greetEl.classList.toggle('is-fading', on);
    },
  };
}
