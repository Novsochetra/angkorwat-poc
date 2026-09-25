import { steppedRing, steppedShape } from '../ui/shape';

/**
 * Touch controls while roaming (phones, tablets): a joystick for the left
 * thumb (it appears where the thumb lands, in the lower left of the view;
 * pushed past its ring he runs), Jump and Use buttons for the right thumb,
 * a drag anywhere else on the view to look round, and a pinch to zoom.
 *
 * Shown while roaming once the page has seen a touch (or on a touch-first
 * device; `touch=1` in the URL forces them). While they show,
 * `body.roam-touch` is set (the key help hides). With the camera or the
 * selfie phone up, a shutter button takes the place of the stick and Jump
 * (the selfie phone's screen has its own), and a button to put it away
 * (`setShutter`).
 */
export class TouchControls {
  /** The stick: x right, y forward (−1‥1 each); `run` when pushed past the ring. */
  readonly stick = { x: 0, y: 0, run: false };
  /** Camera orbit and zoom since the last read (radians, pinch steps). */
  readonly look = { yaw: 0, pitch: 0, zoom: 0 };
  /** Buttons: pressed since the last read, and held. */
  jumpHit = false;
  jumpHeld = false;
  useHit = false;
  shutterHit = false;
  /** The put-away button (camera or phone up): read as Esc. */
  closeHit = false;
  private enabled = false;
  private shutter = false;
  /** A touch was seen (or a touch-first device; `touch=1` in the URL shows them for checking). */
  private seen = (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) || new URLSearchParams(location.search).get('touch') === '1';
  private readonly wrap: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly useBtn: HTMLButtonElement;
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
      <button type="button" class="rt-btn rt-use" aria-label="Use"><span class="rt-bg"></span><span class="rt-label"></span></button>
      <button type="button" class="rt-btn rt-jump" aria-label="Jump"><span class="rt-bg"></span>${JUMP_ICON}<span class="rt-label">Jump</span></button>
      <button type="button" class="rt-btn rt-shutter" aria-label="Take a photo"><span class="rt-bg"></span><span class="rt-dot"></span></button>
      <button type="button" class="rt-btn rt-close" aria-label="Put the camera away"><span class="rt-bg"></span>${CLOSE_ICON}</button>`;
    document.body.append(this.wrap);
    this.base = this.wrap.querySelector('.rt-stick')!;
    this.knob = this.wrap.querySelector('.rt-knob')!;
    this.useBtn = this.wrap.querySelector('.rt-use')!;
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
      this.wrap.querySelector<HTMLButtonElement>('.rt-shutter')!,
      () => (this.shutterHit = true),
      () => {},
    );
    hold(
      this.wrap.querySelector<HTMLButtonElement>('.rt-close')!,
      () => (this.closeHit = true),
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
      const k = 3.6 / Math.max(innerHeight, 1);
      this.look.yaw -= (e.clientX - f.x) * k;
      this.look.pitch += (e.clientY - f.y) * k;
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

  /** Let go of everything (switching modes, leaving). */
  release(): void {
    this.stickId = null;
    this.stick.x = this.stick.y = 0;
    this.stick.run = false;
    this.fingers.clear();
    this.jumpHit = this.jumpHeld = this.useHit = this.shutterHit = this.closeHit = false;
    this.look.yaw = this.look.pitch = this.look.zoom = 0;
    this.base.classList.remove('is-on');
    this.rest();
  }

  /** In use: the stick is pushed or a finger is looking. */
  get touching(): boolean {
    return this.stickId !== null || this.fingers.size > 0;
  }

  private show(): void {
    const on = this.enabled && this.seen;
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

/** Radius of the stick's ring (CSS px). */
const stickRadius = () => (Math.min(innerWidth, innerHeight) < 500 ? 52 : 62);

const CLOSE_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M3 3h2v1h1v1h1v1h2V5h1V4h1V3h2v2h-1v1h-1v1h-1v2h1v1h1v1h1v2h-2v-1h-1v-1H9v-1H7v1H6v1H5v1H3v-2h1v-1h1V9h1V7H5V6H4V5H3z"/></svg>`;
const JUMP_ICON = `<svg class="rt-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v1h1v1h1v1h1v1h1v2h-3v6H6V8H3V6h1V5h1V4h1V3h1z"/></svg>`;

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rt { position: fixed; inset: 0; z-index: 21; pointer-events: none; display: none; font: 700 13px/1 'Pixelify Sans', 'Nunito Sans', system-ui, sans-serif; color: #f8f0dc; user-select: none; -webkit-user-select: none; }
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
    .rt-shutter { right: 26px; bottom: 50%; transform: translateY(50%); display: none; }
    .rt-dot { width: 40px; height: 40px; border-radius: 50%; background: #f8f0dc; box-shadow: inset 0 0 0 3px rgba(13, 25, 39, 0.55), 0 0 0 3px rgba(248, 240, 220, 0.5); }
    .rt-shutter.is-down .rt-dot { background: #ffe07c; transform: scale(0.9); }
    .rt.is-camera .rt-shutter { display: grid; }
    .rt-close { left: 24px; top: 24px; width: 52px; height: 52px; display: none; }
    .rt.is-photo .rt-close { display: grid; }
    .rt.is-photo .rt-stick, .rt.is-photo .rt-jump, .rt.is-photo .rt-use { display: none; }
    @media (max-width: 500px), (max-height: 500px) {
      .rt-stick::before { left: -52px; top: -52px; width: 104px; height: 104px; }
      .rt-knob { left: -22px; top: -22px; width: 44px; height: 44px; }
      .rt-btn { width: 64px; height: 64px; }
      .rt-jump { right: 18px; bottom: 22px; }
      .rt-use { right: 92px; bottom: 28px; width: auto; height: 46px; }
      .rt-shutter { right: 18px; }
    }`;
  document.head.append(style);
  document.documentElement.style.setProperty('--rt-shape', steppedShape(10, 5));
  document.documentElement.style.setProperty('--rt-ring', steppedRing(10, 5, 2));
}
