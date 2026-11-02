import { pad } from '../pad/pad';
import { onLang, t, type WordKey } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';

/**
 * Touch controls while roaming (phones, tablets): a joystick for the left
 * thumb (it appears where the thumb lands, in the lower left of the view;
 * pushed past its ring he runs), Jump and Use buttons for the right thumb
 * (and in the boat a Fish button over Use: "Fish", then "Strike!" at a bite,
 * roam/_fishing.ts; on the bicycle the same button, F's, rings its bell:
 * roam/_bike.ts), a button over Use for each other key the prompt names
 * ("J  Kneel and listen", ",/.  another fruit", "Esc  Done": `setKeys`, from
 * hud.ts), on the hang glider and in the balloon a Fast button held as
 * Shift (`setRun`: the stick past its ring always steers or dives too), a
 * drag anywhere else on the view to look round, and a pinch to zoom.
 *
 * Shown while roaming once the page has seen a touch (or on a touch-first
 * device; `touch=1` in the URL forces them). While they show,
 * `body.roam-touch` is set (the key help hides). With the camera or the
 * selfie phone up, a shutter button takes the place of the stick and Jump
 * (the selfie phone's screen has its own), a button to put it away, and
 * under it the keys photo mode has: the album (V), and with the phone up the
 * selfie stick (T), the hand's gesture (G) and his face (X) (`setShutter`). While a game pad is in use (pad.ts: its last input was
 * the pad) they step aside, and `body.roam-touch` goes with them (the key
 * help and the prompts' buttons show the pad's); the next touch brings them
 * back.
 */
export class TouchControls {
  /** The stick: x right, y forward (−1‥1 each); `run` when pushed past the ring. */
  readonly stick = { x: 0, y: 0, run: false };
  /** Camera orbit and zoom since the last read (radians, pinch steps). */
  readonly look = { yaw: 0, pitch: 0, zoom: 0 };
  /** Buttons: pressed since the last read, and held. */
  jumpHit = false;
  jumpHeld = false;
  /** The Fast button held (`setRun`): Shift. */
  runHeld = false;
  useHit = false;
  shutterHit = false;
  /** The put-away button (camera or phone up), or a prompt's Esc button: read as Esc. */
  closeHit = false;
  /** The prompt's other keys' buttons (`setKeys`) pressed since the last read: their codes, for the taps. */
  readonly keyHits: string[] = [];
  private enabled = false;
  private shutter = false;
  /** A touch was seen (or a touch-first device; `touch=1` in the URL shows them for checking). */
  private seen = (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) || new URLSearchParams(location.search).get('touch') === '1';
  private readonly wrap: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly useBtn: HTMLButtonElement;
  /** In the boat: Fish (start fishing), Strike! at a bite (roam/_fishing.ts: `setTouchFish`, `takeTouchFish`). */
  private readonly fishBtn: HTMLButtonElement;
  fishHit = false;
  /** The Fast button (`setRun`). */
  private readonly runBtn: HTMLButtonElement;
  /** The prompt's other keys' buttons (`setKeys`), and what they are now (codes and words). */
  private readonly keysEl: HTMLDivElement;
  private keysNow = '';
  /** Its picture now: the fish, or the bicycle's bell. */
  private fishIcon: 'fish' | 'bell' = 'fish';
  /** A button's press and let-go (the constructor's). */
  private readonly hold: (btn: HTMLButtonElement, down: () => void, up: () => void) => void;
  private stickId: number | null = null;
  private readonly origin = { x: 0, y: 0 };
  /** Look fingers: last point per pointer. */
  private readonly fingers = new Map<number, { x: number; y: number }>();
  private pinch = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    injectStyle();
    active = this;
    this.wrap = document.createElement('div');
    this.wrap.className = 'rt';
    this.wrap.innerHTML = `
      <div class="rt-stick"><div class="rt-knob"></div></div>
      <button type="button" class="rt-btn rt-use" data-t-aria="rtUse"><span class="rt-bg"></span><span class="rt-label"></span></button>
      <button type="button" class="rt-btn rt-fish" data-t-aria="fiFish"><span class="rt-bg"></span>${FISH_ICON}<span class="rt-label"></span></button>
      <button type="button" class="rt-btn rt-jump" data-t-aria="rtJump"><span class="rt-bg"></span>${JUMP_ICON}<span class="rt-label" data-t="rtJump"></span></button>
      <button type="button" class="rt-btn rt-shutter" data-t-aria="rtShutter"><span class="rt-bg"></span><span class="rt-dot"></span></button>
      <button type="button" class="rt-btn rt-close" data-t-aria="rtClose"><span class="rt-bg"></span>${CLOSE_ICON}</button>
      <button type="button" class="rt-btn rt-run"><span class="rt-bg"></span>${FAST_ICON}<span class="rt-label"></span></button>
      <div class="rt-keys"></div>
      <div class="rt-pkeys">${PHOTO_KEYS.map(([code, word, selfie]) => `<button type="button" class="rt-btn rt-key rt-pk${selfie ? ' is-selfie' : ''}" data-code="${code}"><span class="rt-bg"></span><span class="rt-label" data-t="${word}"></span></button>`).join('')}</div>`;
    document.body.append(this.wrap);
    // Words in the language in use (ui/lang.ts; the Use button's comes with the prompt: `setUse`).
    const fillWords = () => {
      for (const e of this.wrap.querySelectorAll<HTMLElement>('[data-t]')) e.textContent = t(e.dataset.t as WordKey);
      for (const e of this.wrap.querySelectorAll<HTMLElement>('[data-t-aria]')) e.setAttribute('aria-label', t(e.dataset.tAria as WordKey));
    };
    fillWords();
    onLang(fillWords);
    // (a game pad taken up: the stick and the buttons step aside, nothing held; a touch turns the pad off and they come back)
    pad.onChange(() => {
      if (pad.active) this.release();
      this.show();
    });
    this.base = this.wrap.querySelector('.rt-stick')!;
    this.knob = this.wrap.querySelector('.rt-knob')!;
    this.useBtn = this.wrap.querySelector('.rt-use')!;
    this.fishBtn = this.wrap.querySelector('.rt-fish')!;
    this.keysEl = this.wrap.querySelector('.rt-keys')!;
    const jump = this.wrap.querySelector<HTMLButtonElement>('.rt-jump')!;
    const hold = (btn: HTMLButtonElement, down: () => void, up: () => void) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('is-down');
        down();
      });
      const end = () => {
        btn.classList.remove('is-down');
        up();
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    this.hold = hold;
    hold(
      jump,
      () => ((this.jumpHit = true), (this.jumpHeld = true)),
      () => (this.jumpHeld = false),
    );
    hold(
      this.useBtn,
      () => (this.useHit = true),
      () => {},
    );
    hold(
      this.fishBtn,
      () => (this.fishHit = true),
      () => {},
    );
    hold(
      this.wrap.querySelector<HTMLButtonElement>('.rt-shutter')!,
      () => (this.shutterHit = true),
      () => {},
    );
    hold(
      this.wrap.querySelector<HTMLButtonElement>('.rt-close')!,
      () => (this.closeHit = true),
      () => {},
    );
    this.runBtn = this.wrap.querySelector('.rt-run')!;
    hold(
      this.runBtn,
      () => (this.runHeld = true),
      () => (this.runHeld = false),
    );
    for (const b of this.wrap.querySelectorAll<HTMLButtonElement>('.rt-pk'))
      hold(
        b,
        () => this.keyHits.push(b.dataset.code!),
        () => {},
      );

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.seen = true;
      this.show();
      if (!this.enabled) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      // Lower left: the stick (not with the camera up); anywhere else: look.
      if (this.stickId === null && !this.shutter && e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.3) {
        this.stickId = e.pointerId;
        const r = stickRadius();
        this.origin.x = Math.max(r + 12, e.clientX);
        this.origin.y = Math.min(innerHeight - r - 12, e.clientY);
        this.base.style.transform = `translate(${this.origin.x}px, ${this.origin.y}px)`;
        this.base.classList.add('is-on');
        this.moveStick(e.clientX, e.clientY);
        return;
      }
      this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = this.spread();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return;
      if (e.pointerId === this.stickId) return this.moveStick(e.clientX, e.clientY);
      const f = this.fingers.get(e.pointerId);
      if (!f) return;
      if (this.fingers.size >= 2) {
        // Two fingers: pinch (apart = closer).
        f.x = e.clientX;
        f.y = e.clientY;
        const d = this.spread();
        if (this.pinch > 0 && d > 0) this.look.zoom -= Math.log(d / this.pinch) / Math.log(1.15);
        this.pinch = d;
        return;
      }
      // (across by the shorter side: on a phone held upright a swipe over its
      // narrow screen turns as far as one held sideways)
      this.look.yaw -= ((e.clientX - f.x) * 3.6) / Math.max(Math.min(innerWidth, innerHeight), 1);
      this.look.pitch += ((e.clientY - f.y) * 3.6) / Math.max(innerHeight, 1);
      f.x = e.clientX;
      f.y = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.stick.x = this.stick.y = 0;
        this.stick.run = false;
        this.base.classList.remove('is-on');
        this.rest();
      }
      this.fingers.delete(e.pointerId);
      this.pinch = this.spread();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Roaming on or off (the controls show only while roaming). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.canvas.style.touchAction = on ? 'none' : '';
    if (!on) this.release();
    this.show();
  }

  /** The camera or the selfie phone is up (null: neither): the put-away button and the camera's shutter show, the stick and Jump hide. */
  setShutter(kind: 'camera' | 'selfie' | null): void {
    const on = kind !== null;
    this.shutter = on;
    this.wrap.classList.toggle('is-photo', on);
    this.wrap.classList.toggle('is-camera', kind === 'camera');
    this.wrap.classList.toggle('is-selfie', kind === 'selfie');
    if (on && this.stickId !== null) {
      this.stickId = null;
      this.stick.x = this.stick.y = 0;
      this.stick.run = false;
      this.base.classList.remove('is-on');
      this.rest();
    }
  }

  /** The Use button: shown with this label ("Enter", "Board"), or hidden (null). */
  setUse(label: string | null): void {
    this.useBtn.classList.toggle('is-on', !!label);
    if (label) this.useBtn.querySelector('.rt-label')!.textContent = label;
  }

  /**
   * The Fish button (in the boat): shown with this label ("Fish", "Strike!"), or hidden (null); `strike` lights it up.
   * F's button: on the bicycle it rings the bell (`icon` 'bell', roam/_bike.ts).
   */
  setFish(label: string | null, strike = false, icon: 'fish' | 'bell' = 'fish'): void {
    this.fishBtn.classList.toggle('is-on', !!label);
    this.fishBtn.classList.toggle('is-strike', strike);
    if (label) this.fishBtn.querySelector('.rt-label')!.textContent = label;
    if (label && icon !== this.fishIcon) {
      this.fishIcon = icon;
      this.fishBtn.querySelector('.rt-icon')!.outerHTML = icon === 'bell' ? BELL_ICON : FISH_ICON;
      const aria: WordKey = icon === 'bell' ? 'bikeBellBtn' : 'fiFish';
      this.fishBtn.dataset.tAria = aria;
      this.fishBtn.setAttribute('aria-label', t(aria));
    }
    if (!label) this.fishHit = false;
  }

  /**
   * The prompt's keys besides E and Space (hud.ts `prompt`): a button each over Use, in the prompt's order from the
   * bottom up, with what it does ("Kneel and listen"); a press goes in as its key (`keyHits`; Esc as `closeHit`).
   * F's button hides while the Fish button (the boat's, the bicycle's bell) shows: that one is F already.
   */
  setKeys(keys: readonly (readonly [code: string, label: string])[]): void {
    const now = keys.map(([c, l]) => `${c} ${l}`).join('\n');
    if (now === this.keysNow) return;
    this.keysNow = now;
    this.keysEl.replaceChildren(
      ...keys.map(([code, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rt-btn rt-key';
        btn.dataset.code = code;
        btn.innerHTML = '<span class="rt-bg"></span><span class="rt-label"></span>';
        btn.querySelector('.rt-label')!.textContent = label;
        this.hold(
          btn,
          () => (code === 'Escape' ? (this.closeHit = true) : this.keyHits.push(code)),
          () => {},
        );
        return btn;
      }),
    );
  }

  /**
   * The Fast button, held as Shift (on the hang glider: fast; in the balloon: fast with easy flying, both burners
   * without): shown with this word, or hidden (null) and let go.
   */
  setRun(word: WordKey | null): void {
    this.runBtn.classList.toggle('is-on', !!word);
    if (!word) {
      this.runHeld = false;
      this.runBtn.classList.remove('is-down');
      return;
    }
    const label = this.runBtn.querySelector<HTMLElement>('.rt-label')!;
    label.dataset.t = word;
    label.textContent = t(word);
    this.runBtn.dataset.tAria = word;
    this.runBtn.setAttribute('aria-label', t(word));
  }

  /** Let go of everything (switching modes, leaving). */
  release(): void {
    this.stickId = null;
    this.stick.x = this.stick.y = 0;
    this.stick.run = false;
    this.fingers.clear();
    this.jumpHit = this.jumpHeld = this.useHit = this.shutterHit = this.closeHit = this.fishHit = this.runHeld = false;
    this.keyHits.length = 0;
    this.look.yaw = this.look.pitch = this.look.zoom = 0;
    this.base.classList.remove('is-on');
    this.rest();
  }

  /** In use: the stick is pushed or a finger is looking. */
  get touching(): boolean {
    return this.stickId !== null || this.fingers.size > 0;
  }

  private show(): void {
    const on = this.enabled && this.seen && !pad.active;
    this.wrap.classList.toggle('is-on', on);
    document.body.classList.toggle('roam-touch', on);
    if (on && this.stickId === null) this.rest();
  }

  /** The stick waits, faint, in the lower left (it jumps to where the thumb lands). */
  private rest(): void {
    const r = stickRadius();
    this.base.style.transform = `translate(${r + 30}px, ${innerHeight - r - 44}px)`;
    this.knob.style.transform = '';
  }

  private moveStick(x: number, y: number): void {
    const r = stickRadius();
    const dx = (x - this.origin.x) / r;
    const dy = (y - this.origin.y) / r;
    const len = Math.hypot(dx, dy);
    // A small dead zone, then full range at the ring; past it: run.
    const k = len < 0.12 ? 0 : Math.min(1, (len - 0.12) / 0.78) / len;
    this.stick.x = dx * k;
    this.stick.y = -dy * k;
    this.stick.run = len > 1.25;
    const c = Math.min(1, len) / Math.max(len, 1e-6);
    this.knob.style.transform = `translate(${dx * c * r}px, ${dy * c * r}px)`;
    this.base.classList.toggle('is-run', this.stick.run);
  }

  /** Distance between the first two look fingers (0 with fewer). */
  private spread(): number {
    if (this.fingers.size < 2) return 0;
    const [a, b] = [...this.fingers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

let active: TouchControls | null = null;

/** The Use button of the touch controls (the HUD's prompt sets it): its label, or null to hide it. */
export function setTouchUse(label: string | null): void {
  active?.setUse(label);
}

/** The prompt's other keys as buttons over Use (hud.ts `prompt`): codes and what each does; none: an empty list. */
export function setTouchKeys(keys: readonly (readonly [code: string, label: string])[]): void {
  active?.setKeys(keys);
}

/** The Fast button (hud.ts, by the mode): its word, or null to hide it. */
export function setTouchRun(word: WordKey | null): void {
  active?.setRun(word);
}

/** The Fish button of the touch controls (the boat sets it: roam/_fishing.ts): its label, or null to hide it; `strike` at a bite. */
export function setTouchFish(label: string | null, strike = false): void {
  active?.setFish(label, strike);
}

/** The same button on the bicycle (roam/_bike.ts): its bell, F as the boat's Fish ("Bell"), or hidden (null). Its press: `takeTouchFish`. */
export function setTouchBell(label: string | null): void {
  active?.setFish(label, false, 'bell');
}

/** The Fish button (or the bicycle's Bell) was pressed since the last call (then forgotten). */
export function takeTouchFish(): boolean {
  if (!active?.fishHit) return false;
  active.fishHit = false;
  return true;
}

/** Photo mode's keys as buttons under the put-away one (`code`, its word, only with the selfie phone up): tools.ts reads them. */
const PHOTO_KEYS: readonly (readonly [code: string, word: WordKey, selfie: boolean])[] = [
  ['KeyT', 'rStick', true],
  ['KeyG', 'rGesture', true],
  ['KeyX', 'rFace', true],
  ['KeyV', 'rAlbum', false],
];

/** Radius of the stick's ring (CSS px). */
const stickRadius = () => (Math.min(innerWidth, innerHeight) < 500 ? 52 : 62);

const CLOSE_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg>`;
/** A small fish (16 × 16 pixel art): the Fish button. */
const FISH_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M5 4h5v1h2v1h1v1h1v2h-1v1h-1v1h-2v1H5v-1H4v-1H3V9H1V8h1V7h1V6h1V5h1zM0 5h2v1H0zM0 10h2v1H0z"/><path fill="#0d1927" d="M11 7h1v1h-1z"/></svg>`;
/** A bicycle's thumb bell (16 × 16 pixel art): the same button on the bicycle. */
const BELL_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M7 1h2v1H7zM6 2h4v1H6zM5 3h6v1H5zM4 4h8v6H4zM3 10h10v1H3zM2 11h12v1H2zM7 13h2v2H7z"/><path fill="#0d1927" d="M6 5h1v3H6z"/></svg>`;
/** Two arrows ahead (16 × 16): the Fast button. */
const FAST_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M1 3h2v1h1v1h1v1h1v1h1v2H6v1H5v1H4v1H3v1H1v-1h1v-1h1v-1h1V9h1V7H4V6H3V5H2V4H1zM8 3h2v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1H8v-1h1v-1h1v-1h1V9h1V7h-1V6h-1V5H9V4H8z"/></svg>`;
const JUMP_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v1h1v1h1v1h1v1h1v2h-3v6H6V8H3V6h1V5h1V4h1V3h1z"/></svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rt { position: fixed; inset: 0; z-index: 21; pointer-events: none; display: none; font: 700 13px/1 'Pixelify Sans', 'Kantumruy Pro', 'Nunito Sans', system-ui, sans-serif; color: #f8f0dc; user-select: none; -webkit-user-select: none; }
    .rt.is-on { display: block; }
    .rt-stick { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0.35; transition: opacity 0.2s; }
    .rt-stick.is-on { opacity: 1; }
    .rt-stick::before { content: ''; position: absolute; left: -62px; top: -62px; width: 124px; height: 124px; border-radius: 50%;
      background: radial-gradient(circle, rgba(13, 25, 39, 0.28) 0%, rgba(13, 25, 39, 0.5) 70%); border: 2px solid rgba(255, 229, 188, 0.35); box-sizing: border-box; }
    .rt-stick.is-run::before { border-color: rgba(255, 208, 112, 0.85); box-shadow: 0 0 14px rgba(255, 176, 40, 0.45); }
    .rt-knob { position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; border-radius: 50%;
      background: radial-gradient(circle at 40% 35%, rgba(255, 238, 212, 0.95), rgba(220, 174, 143, 0.9)); box-shadow: 0 3px 10px rgba(3, 8, 16, 0.4); }
    .rt-btn { position: absolute; display: grid; place-items: center; align-content: center; gap: 2px; width: 76px; height: 76px; padding: 0; border: 0; background: none;
      color: inherit; font: inherit; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; isolation: isolate; }
    .rt-btn .rt-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--rt-shape); background: rgba(13, 25, 39, 0.62); }
    .rt-btn .rt-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--rt-ring); background: rgba(255, 229, 188, 0.4); }
    .rt-btn.is-down .rt-bg { background: rgba(58, 48, 30, 0.8); }
    .rt-btn.is-down .rt-bg::after { background: #ffe07c; }
    .rt-icon { width: 22px; height: 22px; }
    .rt-jump { right: 26px; bottom: 34px; }
    .rt-use { right: 114px; bottom: 46px; width: auto; min-width: 84px; height: 52px; padding: 0 16px; display: none; color: #ffe07c; white-space: nowrap; font-size: 14px; }
    .rt-use.is-on { display: grid; }
    .rt-use .rt-bg::after { background: rgba(255, 208, 112, 0.8); }
    /* (the Fish button, over the Use button; at a bite it glows) */
    .rt-fish { right: 114px; bottom: 112px; width: auto; min-width: 84px; height: 52px; padding: 0 14px; display: none; grid-auto-flow: column; gap: 6px;
      color: #ffe07c; white-space: nowrap; font-size: 14px; }
    .rt-fish.is-on { display: grid; }
    .rt-fish .rt-icon { width: 18px; height: 18px; }
    .rt-fish .rt-bg::after { background: rgba(255, 208, 112, 0.8); }
    .rt-fish.is-strike .rt-bg { background: rgba(120, 72, 16, 0.85); box-shadow: 0 0 16px rgba(255, 176, 40, 0.6); }
    .rt-fish.is-strike .rt-bg::after { background: #ffe07c; }
    /* (the prompt's other keys: a column over Use — over the Fish button while it shows — its first at the bottom) */
    .rt-keys { position: absolute; right: 114px; bottom: 46px; display: flex; flex-direction: column-reverse; align-items: flex-end; gap: 14px; }
    .rt-use.is-on ~ .rt-keys { bottom: 112px; }
    .rt-fish.is-on ~ .rt-keys { bottom: 178px; }
    .rt-fish.is-on ~ .rt-keys .rt-key[data-code='KeyF'] { display: none; }
    .rt-key { position: relative; width: auto; min-width: 84px; height: 52px; padding: 0 16px; color: #ffe07c; white-space: nowrap; font-size: 14px; }
    .rt-key .rt-bg::after { background: rgba(255, 208, 112, 0.8); }
    .rt-key .rt-label::first-letter { text-transform: uppercase; }
    /* (the Fast button: where Use is, over it while Use shows; the prompt's keys over both) */
    .rt-run { right: 114px; bottom: 46px; width: auto; min-width: 84px; height: 52px; padding: 0 14px; display: none; grid-auto-flow: column; gap: 6px;
      color: #ffe07c; white-space: nowrap; font-size: 14px; }
    .rt-run.is-on { display: grid; }
    .rt-run .rt-icon { width: 18px; height: 18px; }
    .rt-run .rt-label::first-letter { text-transform: uppercase; }
    .rt-use.is-on ~ .rt-run { bottom: 112px; }
    .rt-run.is-on ~ .rt-keys { bottom: 112px; }
    .rt-use.is-on ~ .rt-run.is-on ~ .rt-keys { bottom: 178px; }
    .rt-shutter { right: 26px; bottom: 50%; transform: translateY(50%); display: none; }
    .rt-dot { width: 40px; height: 40px; border-radius: 50%; background: #f8f0dc; box-shadow: inset 0 0 0 3px rgba(13, 25, 39, 0.55), 0 0 0 3px rgba(248, 240, 220, 0.5); }
    .rt-shutter.is-down .rt-dot { background: #ffe07c; transform: scale(0.9); }
    .rt.is-camera .rt-shutter { display: grid; }
    .rt-close { left: 24px; top: 24px; width: 52px; height: 52px; display: none; }
    .rt.is-photo .rt-close { display: grid; }
    /* (photo mode's keys: a column under the put-away button; the selfie's only with the phone up) */
    .rt-pkeys { position: absolute; left: 24px; top: 90px; display: none; flex-direction: column; align-items: flex-start; gap: 10px; }
    .rt.is-photo .rt-pkeys { display: flex; }
    .rt-pk { height: 44px; min-width: 0; padding: 0 14px; font-size: 13px; color: #f8f0dc; }
    .rt-pk .rt-bg::after { background: rgba(255, 229, 188, 0.4); }
    .rt:not(.is-selfie) .rt-pk.is-selfie { display: none; }
    .rt.is-photo .rt-stick, .rt.is-photo .rt-jump, .rt.is-photo .rt-use, .rt.is-photo .rt-fish, .rt.is-photo .rt-keys, .rt.is-photo .rt-run { display: none; }
    @media (max-width: 500px), (max-height: 500px) {
      .rt-stick::before { left: -52px; top: -52px; width: 104px; height: 104px; }
      .rt-knob { left: -22px; top: -22px; width: 44px; height: 44px; }
      .rt-btn { width: 64px; height: 64px; }
      .rt-jump { right: 18px; bottom: 22px; }
      .rt-use { right: 92px; bottom: 28px; width: auto; height: 46px; }
      /* (a long pick's words: the button stays clear of the E list beside it, roam/_eChoices.ts) */
      .rt-use .rt-label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
      .rt-fish { right: 92px; bottom: 82px; width: auto; height: 46px; }
      .rt-keys { right: 92px; bottom: 28px; gap: 8px; }
      .rt-use.is-on ~ .rt-keys { bottom: 82px; }
      .rt-fish.is-on ~ .rt-keys { bottom: 136px; }
      .rt-key { width: auto; height: 46px; }
      .rt-pkeys { left: 18px; top: 82px; gap: 8px; }
      .rt-run { right: 92px; bottom: 28px; width: auto; height: 46px; }
      .rt-use.is-on ~ .rt-run { bottom: 82px; }
      .rt-run.is-on ~ .rt-keys { bottom: 82px; }
      .rt-use.is-on ~ .rt-run.is-on ~ .rt-keys { bottom: 136px; }
      .rt-pk { height: 40px; }
      .rt-shutter { right: 18px; }
    }`;
  document.head.append(style);
  document.documentElement.style.setProperty('--rt-shape', steppedShape(10, 5));
  document.documentElement.style.setProperty('--rt-ring', steppedRing(10, 5, 2));
}
