import { Vector3, type PerspectiveCamera } from 'three';
import { t, type WordKey } from '../ui/lang';
import type { Point } from './_routes';

/**
 * A small speech bubble over someone's head while roaming (the guide's
 * "ជម្រាបសួរ / Hello!"): the map interface's dark panel with its stepped
 * corners, a little tail pointing down at the speaker, fading in and out.
 * It lives in the picker's interface root (`#ui`: `ui=0` hides it), made the
 * first time someone speaks. One bubble at a time: a new one replaces it.
 */
export class Bubble {
  private el: HTMLElement | null = null;
  private text: HTMLElement | null = null;
  private left = 0;
  private who: (() => Point) | null = null;
  private opacity = 0;
  private readonly v = new Vector3();

  /** Say `key` (ui/lang.ts) over the point `head()` returns, for `seconds`. */
  say(key: WordKey, head: () => Point, seconds = 3.2): void {
    if (!this.make()) return;
    this.text!.textContent = t(key);
    this.who = head;
    this.left = seconds;
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
    const x = ((this.v.x + 1) / 2) * innerWidth;
    const y = ((1 - this.v.y) / 2) * innerHeight;
    this.el.style.visibility = 'visible';
    this.el.style.opacity = this.opacity.toFixed(3);
    this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, calc(-100% - ${(10 * (1 - this.opacity)).toFixed(1)}px))`;
  }
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .pp-bubble { position: absolute; left: 0; top: 0; padding: calc(7 * var(--px)) calc(14 * var(--px)) calc(8 * var(--px));
      font-weight: 600; font-size: calc(16 * var(--px)); white-space: nowrap; opacity: 0; visibility: hidden; pointer-events: none;
      will-change: transform, opacity; }
    .pp-bubble::after { content: ''; position: absolute; left: 50%; bottom: calc(-7 * var(--px)); width: calc(14 * var(--px)); height: calc(8 * var(--px));
      transform: translateX(-50%); background: var(--mu-panel); clip-path: polygon(0 0, 100% 0, 50% 100%); }
  `;
  document.head.append(s);
}
