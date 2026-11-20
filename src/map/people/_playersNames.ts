import { Vector3, type PerspectiveCamera } from 'three';
import { isKhmer, toKhmer } from '../khmerName';

/**
 * Other players' names over their heads (people/_scenePlayers.ts) while they are close: the name as they chose it and,
 * for a name in Latin letters, the same in Khmer letters (khmerName.ts `toKhmer`), a gold ◆ before a party member's.
 * A small pool of DOM tags in the interface's root (`#ui`: `ui=0` hides them, as it hides the speech bubbles), each
 * moved with a transform once a frame; the words are written only when the tag goes to another player. Readable on a
 * phone: never under 13 px, white with a dark outline.
 */

/** Tags at most (the nearest players get them). */
export const NAME_TAGS = 12;
/** A name shows within this distance of the camera (m), fading out over its last `NAME_FADE` m. */
export const NAME_NEAR = 25;
const NAME_FADE = 6;

/** Latin names in Khmer letters, made once a name. */
const KHMER = new Map<string, string>();
function khmerOf(name: string): string {
  let k = KHMER.get(name);
  if (k === undefined) {
    k = isKhmer(name) ? '' : toKhmer(name);
    KHMER.set(name, k);
  }
  return k;
}

interface Tag {
  el: HTMLElement;
  latin: HTMLElement;
  km: HTMLElement;
  /** Whose name it shows (server id), and as what (name, party). */
  sid: number;
  name: string;
  party: boolean;
  shown: boolean;
  /** Its size on the screen (px). */
  w: number;
  h: number;
}

export class NameTags {
  private readonly tags: Tag[] = [];
  private made = false;
  private readonly v = new Vector3();
  /** Tags placed this frame, and their rectangles on the screen (x0, x1, y0, y1 each). */
  private used = 0;
  private readonly rects = new Float32Array(NAME_TAGS * 4);

  private make(): boolean {
    if (this.made) return this.tags.length > 0;
    this.made = true;
    const root = document.getElementById('ui');
    if (!root) return false;
    injectStyle();
    for (let k = 0; k < NAME_TAGS; k++) {
      const el = document.createElement('div');
      el.className = 'pl-name';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<span class="pl-latin"></span><span class="pl-km"></span>';
      root.append(el);
      this.tags.push({ el, latin: el.firstElementChild as HTMLElement, km: el.lastElementChild as HTMLElement, sid: -1, name: '', party: false, shown: false, w: 0, h: 0 });
    }
    return true;
  }

  /** A frame's names begin (then `add` the nearest first, then `end`). */
  begin(): void {
    this.used = 0;
  }

  /**
   * Player `sid`'s name over the head point (x, y, z), `d` m from the camera (the nearest first: a name that would
   * cover one already shown this frame is left out, so a bunch of players far off show only the nearest's names).
   */
  add(camera: PerspectiveCamera, sid: number, name: string, party: boolean, x: number, y: number, z: number, d: number): void {
    if (this.used >= NAME_TAGS || !this.make()) return;
    this.v.set(x, y, z).project(camera);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) return;
    const sx = ((this.v.x + 1) / 2) * innerWidth;
    const sy = ((1 - this.v.y) / 2) * innerHeight;
    const t = this.tags[this.used];
    if (t.sid !== sid || t.name !== name || t.party !== party) {
      t.sid = sid;
      t.name = name;
      t.party = party;
      const km = khmerOf(name);
      t.latin.textContent = (party ? '◆ ' : '') + name;
      t.latin.classList.toggle('pl-kh', isKhmer(name));
      t.km.textContent = km;
      t.km.style.display = km ? '' : 'none';
      t.el.classList.toggle('pl-party', party);
      // (its size: measured once a name)
      t.w = t.el.offsetWidth;
      t.h = t.el.offsetHeight;
    }
    const r = this.rects;
    const x0 = sx - t.w / 2;
    const x1 = sx + t.w / 2;
    const y0 = sy - t.h;
    for (let k = 0; k < this.used; k++) if (x0 < r[k * 4 + 1] && r[k * 4] < x1 && y0 < r[k * 4 + 3] && r[k * 4 + 2] < sy) return;
    r[this.used * 4] = x0;
    r[this.used * 4 + 1] = x1;
    r[this.used * 4 + 2] = y0;
    r[this.used * 4 + 3] = sy;
    this.used++;
    const o = Math.max(0, Math.min(1, (NAME_NEAR - d) / NAME_FADE));
    t.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    t.el.style.opacity = o.toFixed(2);
    if (!t.shown) {
      t.shown = true;
      t.el.style.visibility = 'visible';
    }
  }

  /** Hide the tags not used this frame. */
  end(): void {
    for (let k = this.used; k < this.tags.length; k++) this.hide(this.tags[k]);
  }

  private hide(t: Tag): void {
    if (!t.shown) return;
    t.shown = false;
    t.el.style.visibility = 'hidden';
  }
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
    .pl-name { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 0;
      visibility: hidden; pointer-events: none; white-space: nowrap; will-change: transform, opacity; color: #fff; line-height: 1.15;
      text-shadow: 0 0 3px rgba(0, 0, 0, 0.9), 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 1px #000; }
    .pl-latin { font: 500 max(13px, calc(15 * var(--px))) 'Pixelify Sans', 'Nunito Sans', system-ui, sans-serif; }
    .pl-latin.pl-kh, .pl-km { font-family: Koulen, 'Kantumruy Pro', system-ui, sans-serif; font-weight: 400; }
    .pl-km { font-size: max(12px, calc(13 * var(--px))); opacity: 0.92; }
    .pl-party .pl-latin { color: #ffd76a; }
  `;
  document.head.append(s);
}
