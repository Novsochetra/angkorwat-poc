import { Vector3, type PerspectiveCamera } from 'three';
import { t, type WordKey } from '../ui/lang';
import type { Point } from './_routes';

/**
 * A small speech bubble over someone's head while roaming (the guide's
 * "ជម្រាបសួរ / Hello!"): the map interface's dark panel with its stepped
 * corners, a little tail pointing down at the speaker, fading in and out.
 * It lives in the picker's interface root (`#ui`: `ui=0` hides it), made the
 * first time someone speaks. One bubble at a time: a new one replaces it.
 * Bubbles shown at once (a scene's and the greetings' answers,
 * people/_greetBack.ts) never cover each other: one that would lands on top
 * of the other on the screen (the later one updated goes up). It stays on
 * the screen (`EDGE` px in from its sides; its tail still points at the
 * speaker), and a long line (a chanted verse on a phone held upright) wraps.
 */
export class Bubble {
  private el: HTMLElement | null = null;
  private text: HTMLElement | null = null;
  private left = 0;
  private who: (() => Point) | null = null;
  private opacity = 0;
  private readonly v = new Vector3();
  /** Its size on the screen (px, measured when it says something), and where it showed last (px) and when (ms). */
  private w = 0;
  private h = 0;
  private readonly rect = { x0: 0, x1: 0, y0: 0, y1: 0, t: -1e9 };
  /** How far it is raised over another (px, eased down). */
  private stack = 0;

  constructor() {
    ALL.push(this);
  }

  /** Say `key` (ui/lang.ts) over the point `head()` returns, for `seconds` (`vars`: its `{x}`, e.g. his name). */
  say(key: WordKey, head: () => Point, seconds = 3.2, vars?: Record<string, string>): void {
    if (!this.make()) return;
    this.text!.textContent = t(key, vars);
    this.who = head;
    this.left = seconds;
    this.w = this.el!.offsetWidth;
    this.h = this.el!.offsetHeight;
    this.stack = 0;
  }

  get showing(): boolean {
    return this.left > 0;
  }

  private make(): boolean {
    if (this.el) return true;
    const root = document.getElementById('ui');
    if (!root) return false;
    injectStyle();
    const el = document.createElement('div');
    el.className = 'pp-bubble mu-frame mu-sm';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="mu-bg"></span><span class="pp-text"></span>';
    root.append(el);
    this.el = el;
    this.text = el.querySelector('.pp-text');
    return true;
  }

  /** Once a frame: follow the speaker on screen, fade. */
  update(dt: number, camera: PerspectiveCamera, roaming: boolean): void {
    if (!this.el) return;
    this.left = roaming ? Math.max(0, this.left - dt) : 0;
    const want = this.left > 0.25 ? 1 : 0;
    this.opacity += (want - this.opacity) * (dt > 0 ? Math.min(1, dt * 6) : 1);
    if (this.opacity < 0.01 || !this.who) {
      this.el.style.opacity = '0';
      this.el.style.visibility = 'hidden';
      return;
    }
    const p = this.who();
    this.v.set(p.x, p.y, p.z).project(camera);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) {
      this.el.style.visibility = 'hidden';
      return;
    }
    const sx = ((this.v.x + 1) / 2) * innerWidth;
    const y = ((1 - this.v.y) / 2) * innerHeight;
    // (kept on the screen, its tail moved along under it to point at the speaker still)
    const half0 = this.w / 2;
    const x = Math.min(Math.max(sx, half0 + EDGE), Math.max(half0 + EDGE, innerWidth - half0 - EDGE));
    const tail = Math.max(-half0 + TAIL_IN, Math.min(half0 - TAIL_IN, sx - x));
    // (another bubble showing where this one would: this one goes up over it, its tail clear of the other; it comes
    // back down gently once the other has gone)
    const now = performance.now();
    const half = this.w / 2;
    const fade = 10 * (1 - this.opacity);
    let need = fade;
    for (let pass = 0; pass < 2; pass++)
      for (const o of ALL) {
        const r = o.rect;
        if (o === this || now - r.t > STALE) continue;
        const bottom = y - need + TAIL;
        if (x - half < r.x1 && r.x0 < x + half && bottom - TAIL - this.h < r.y1 + TAIL && r.y0 < bottom) need = y + TAIL + GAP - r.y0;
      }
    const rise = need - fade;
    this.stack = rise >= this.stack ? rise : this.stack + (rise - this.stack) * (dt > 0 ? Math.min(1, dt * 4) : 1);
    const lift = fade + this.stack;
    this.rect.x0 = x - half;
    this.rect.x1 = x + half;
    this.rect.y1 = y - lift;
    this.rect.y0 = y - lift - this.h;
    this.rect.t = now;
    this.el.style.visibility = 'visible';
    this.el.style.opacity = this.opacity.toFixed(3);
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - ${lift.toFixed(1)}px))`;
    this.el.style.setProperty('--pp-tail', `${tail.toFixed(1)}px`);
  }
}

/** Every bubble (a handful: the people part's own and the greetings' three), to keep them apart on the screen. */
const ALL: Bubble[] = [];
/** A bubble's place counts this long after it last showed (ms: a few frames, even on a slow phone). */
const STALE = 400;
/** The tail under a bubble, and the room between two stacked (px). */
const TAIL = 8;
const GAP = 4;
/** A bubble keeps this far in from the screen's sides, its tail this far in from its own (px). */
const EDGE = 8;
const TAIL_IN = 16;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .pp-bubble { position: absolute; left: 0; top: 0; padding: calc(7 * var(--px)) calc(14 * var(--px)) calc(8 * var(--px));
      font-weight: 600; font-size: calc(16 * var(--px)); white-space: nowrap; opacity: 0; visibility: hidden; pointer-events: none;
      will-change: transform, opacity; max-width: calc(100vw - ${2 * EDGE}px); box-sizing: border-box; }
    @supports (text-wrap: balance) { .pp-bubble { white-space: normal; text-wrap: balance; width: max-content; } }
    .pp-bubble::after { content: ''; position: absolute; left: calc(50% + var(--pp-tail, 0px)); bottom: calc(-7 * var(--px)); width: calc(14 * var(--px)); height: calc(8 * var(--px));
      transform: translateX(-50%); background: var(--mu-panel); clip-path: polygon(0 0, 100% 0, 50% 100%); }
  `;
  document.head.append(s);
}
