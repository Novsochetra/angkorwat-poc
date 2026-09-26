import { TouchControls } from './touch';
import type { RoamInput } from './types';

/** Q / R turn the camera round him at this speed (radians/s, as on the game page), easing in and out at this rate (1/s). */
const ORBIT_SPEED = 1.8;
const ORBIT_EASE = 10;
/**
 * A mouse drag turns the view this much per pixel (radians; across, up and
 * down), as on the game page: round him, through the camera, the selfie
 * phone round his head.
 */
const DRAG = { orbit: [0.005, 0.004], camera: [0.0035, 0.0035], selfie: [0.004, 0.003] } as const;

/**
 * Input while roaming, all mapped onto one `RoamInput`:
 *
 * - keys: WASD / arrows move (relative to the camera), Shift runs, Space
 *   jumps (and opens or closes the parachute), E / Enter uses, Esc goes back
 *   to the overview, Q / R held turn the camera round him (as a drag does);
 *   the explorer's tools and emotes (`TOOL_KEYS`: 1–5, Z, Y, O, F, C, U, P,
 *   J, L, H, G, X, I, V, ?) come as `taps` for tools.ts, and so do the
 *   explorer menu's buttons (`press`);
 * - mouse: drag the view (either button) to turn the camera, wheel to zoom,
 *   a click (no drag) is `click`, and where it points is `pointer`;
 * - touch: a joystick, Jump and Use buttons, drag to look, pinch to zoom
 *   (touch.ts);
 * - a gamepad: left stick moves (pushed in: run), right stick looks, A jumps,
 *   X uses, B or Start goes back.
 *
 * `script` replaces the real input with a list of timed steps, for headless
 * shots (`sim=` in the URL, see `parseScript`).
 */
export class RoamControls {
  private readonly taps = new Set<string>();
  private readonly mouse = { x: 0, y: 0 };
  readonly state: RoamInput = { move: { x: 0, y: 0 }, run: false, jump: false, jumpHeld: false, use: false, exit: false, lookYaw: 0, lookPitch: 0, zoom: 0, taps: this.taps, click: false, pointer: null };
  private on = false;
  private readonly keys = new Set<string>();
  private readonly hits = new Set<string>();
  /** Keys pressed from the interface (`press`), for the next poll's taps. */
  private readonly pressed = new Set<string>();
  private drag: { id: number; x: number; y: number; moved: number; t: number } | null = null;
  private clicked = false;
  private readonly look = { yaw: 0, pitch: 0, zoom: 0 };
  /** Q / R turn speed now (radians/s, + = left), eased. */
  private orbit = 0;
  /** The camera or the selfie phone is up (the drag moves that instead). */
  private photo: 'camera' | 'selfie' | null = null;
  private readonly touch: TouchControls;
  private pad = { jump: false, use: false, exit: false };
  private script: ScriptStep[] | null = null;
  private scriptT = 0;
  private scriptStep: ScriptStep | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.touch = new TouchControls(canvas);
    addEventListener('keydown', (e) => {
      // (not a key the page already used, e.g. Esc closing the settings)
      if (!this.on || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      // ("?" is Shift + / on most keyboards, elsewhere on some)
      const code = e.key === '?' ? 'Slash' : e.code;
      if (TOOL_KEYS.has(code)) {
        if (!e.repeat) this.hits.add(code);
        e.preventDefault();
        return;
      }
      if (!ROAM_KEYS.has(code)) return;
      // (the album open: Enter and Space press its buttons — the tabs, the nature book's cards —
      // not his; closed, they are his again even if one of its buttons kept the focus)
      if ((code === 'Enter' || code === 'Space') && albumOpen()) return;
      if (!e.repeat) this.hits.add(code);
      this.keys.add(code);
      e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    // Mouse and pen: drag to look (touch: touch.ts).
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.on || this.drag || e.pointerType === 'touch' || e.button > 2) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.state.pointer = this.mouse;
      }
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const [kx, ky] = DRAG[this.photo ?? 'orbit'];
      this.look.yaw -= (e.clientX - this.drag.x) * kx;
      this.look.pitch += (e.clientY - this.drag.y) * ky;
      this.drag.moved += Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'touch' && !this.drag) this.state.pointer = null;
    });
    const end = (e: PointerEvent) => {
      if (this.drag && e.pointerId === this.drag.id) {
        // (a press and release in place is a click, not a drag)
        if (e.type === 'pointerup' && this.drag.moved < 6 && performance.now() - this.drag.t < 500) this.clicked = true;
        this.drag = null;
        canvas.style.cursor = this.on ? 'grab' : '';
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // (a right-drag looks too: no menu)
    canvas.addEventListener('contextmenu', (e) => {
      if (this.on) e.preventDefault();
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.on) return;
        // (trackpads send many small steps, a wheel a few big ones)
        this.look.zoom += Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  /** Listen to the keys, mouse, touch and pads (off in the overview, so the picker keeps its keys). */
  get enabled(): boolean {
    return this.on;
  }
  set enabled(on: boolean) {
    if (on === this.on) return;
    this.on = on;
    this.canvas.style.cursor = on ? 'grab' : '';
    this.touch.setEnabled(on);
    if (!on) this.releaseAll();
  }

  /** Drive the input from a script (headless shots) instead of the keys. */
  runScript(steps: ScriptStep[]): void {
    this.script = steps;
    this.scriptT = 0;
    this.scriptStep = null;
  }

  /** Total length of the script (s). */
  get scriptLength(): number {
    return this.script?.reduce((s, st) => s + st.seconds, 0) ?? 0;
  }

  /** Read this frame's input (call once per frame, before the modes update). */
  poll(dt: number): RoamInput {
    const s = this.state;
    if (this.script) return this.pollScript(dt);
    const on = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const hit = (...codes: string[]) => codes.some((c) => this.hits.has(c));
    const t = this.touch;
    s.move.x = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0) + t.stick.x;
    s.move.y = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0) + t.stick.y;
    s.run = on('ShiftLeft', 'ShiftRight') || t.stick.run;
    s.jump = hit('Space') || t.jumpHit;
    s.jumpHeld = on('Space') || t.jumpHeld;
    s.use = hit('KeyE', 'Enter') || t.useHit;
    s.exit = hit('Escape') || t.closeHit;
    s.lookYaw = this.look.yaw + t.look.yaw + this.orbitTurn((on('KeyQ') ? 1 : 0) - (on('KeyR') ? 1 : 0), dt);
    s.lookPitch = this.look.pitch + t.look.pitch;
    s.zoom = this.look.zoom + t.look.zoom;
    this.taps.clear();
    for (const c of this.hits) if (TOOL_KEYS.has(c)) this.taps.add(c);
    this.takePressed();
    s.click = this.clicked || t.shutterHit;
    this.pollPad(dt);
    const len = Math.hypot(s.move.x, s.move.y);
    if (len > 1) {
      s.move.x /= len;
      s.move.y /= len;
    }
    this.look.yaw = this.look.pitch = this.look.zoom = 0;
    t.look.yaw = t.look.pitch = t.look.zoom = 0;
    t.jumpHit = t.useHit = t.shutterHit = t.closeHit = false;
    this.clicked = false;
    this.hits.clear();
    return s;
  }

  /**
   * Forget presses and turns not read yet (switching modes). Held keys and
   * the stick stay held: walking on after a landing needs no new press.
   */
  clear(): void {
    this.hits.clear();
    this.pressed.clear();
    this.taps.clear();
    this.clicked = false;
    this.look.yaw = this.look.pitch = this.look.zoom = 0;
    const t = this.touch;
    t.jumpHit = t.useHit = t.shutterHit = t.closeHit = false;
    t.look.yaw = t.look.pitch = t.look.zoom = 0;
  }

  /**
   * A tool or emote key pressed from the interface (the explorer menu,
   * tools.ts): one of `TOOL_KEYS`, in the next poll's `taps` as if hit on
   * the keyboard (also while a script drives the input).
   */
  press(code: string): void {
    if (this.on && TOOL_KEYS.has(code)) this.pressed.add(code);
  }

  /** The interface's presses into this poll's taps. */
  private takePressed(): void {
    for (const c of this.pressed) this.taps.add(c);
    this.pressed.clear();
  }

  /** Photo mode (tools.ts): the drag moves the camera or the phone, and on touch a put-away button and a shutter for the camera (the selfie frame has its own) take the place of the stick and Jump. */
  setShutter(kind: 'camera' | 'selfie' | null): void {
    this.photo = kind;
    this.touch.setShutter(kind);
  }

  /** Let go of everything (leaving, the window lost focus). */
  private releaseAll(): void {
    this.clear();
    this.keys.clear();
    this.drag = null;
    this.orbit = 0;
    this.touch.release();
  }

  /**
   * The camera's turn this frame from Q / R held (`dir`: +1 Q, −1 R, 0
   * neither). The speed eases to `dir` × ORBIT_SPEED; the turn is its exact
   * sum over the frame, so any frame rate turns alike, and a press of t
   * seconds turns ORBIT_SPEED × t in all (as on the game page, only smooth).
   */
  private orbitTurn(dir: number, dt: number): number {
    const goal = dir * ORBIT_SPEED;
    const k = 1 - Math.exp(-ORBIT_EASE * dt);
    const turn = goal * dt + ((this.orbit - goal) * k) / ORBIT_EASE;
    this.orbit += (goal - this.orbit) * k;
    // (stopped: no turn at all, so the camera's auto-follow comes back)
    if (!dir && Math.abs(this.orbit) < 0.02) this.orbit = 0;
    return turn;
  }

  /** The first connected gamepad, added onto the state (standard mapping). */
  private pollPad(dt: number): void {
    const pad = navigator.getGamepads?.().find((p) => p?.connected && p.mapping === 'standard');
    if (!pad) return;
    const s = this.state;
    const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    s.move.x += dead(pad.axes[0] ?? 0);
    s.move.y -= dead(pad.axes[1] ?? 0);
    s.lookYaw -= dead(pad.axes[2] ?? 0) * 2.6 * dt;
    s.lookPitch += dead(pad.axes[3] ?? 0) * 1.8 * dt;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    s.run ||= b(10) || b(7);
    s.jumpHeld ||= b(0);
    s.jump ||= b(0) && !this.pad.jump;
    s.use ||= b(2) && !this.pad.use;
    s.exit ||= (b(1) || b(9)) && !this.pad.exit;
    s.zoom += (b(4) ? 1 : 0) * dt * 4 - (b(5) ? 1 : 0) * dt * 4;
    this.pad = { jump: b(0), use: b(2), exit: b(1) || b(9) };
  }

  private pollScript(dt: number): RoamInput {
    const s = this.state;
    let at = 0;
    let step: ScriptStep | null = null;
    for (const st of this.script!) {
      if (this.scriptT >= at && this.scriptT < at + st.seconds) {
        step = st;
        break;
      }
      at += st.seconds;
    }
    this.scriptT += dt;
    // "Pressed" on the first frame of a step (by step, not by time: steps don't start on frame edges).
    const fresh = step !== null && step !== this.scriptStep;
    this.scriptStep = step;
    const k = step?.keys ?? '';
    s.move.x = (k.includes('d') ? 1 : 0) - (k.includes('a') ? 1 : 0);
    s.move.y = (k.includes('w') ? 1 : 0) - (k.includes('s') ? 1 : 0);
    const len = Math.hypot(s.move.x, s.move.y);
    if (len > 1) {
      s.move.x /= len;
      s.move.y /= len;
    }
    s.run = k.includes('r');
    s.jumpHeld = k.includes('j');
    s.jump = fresh && s.jumpHeld;
    s.use = fresh && k.includes('e');
    s.exit = fresh && k.includes('x');
    s.lookYaw = (step?.turn ?? 0) * dt + this.orbitTurn(step?.orbit ?? 0, dt);
    s.lookPitch = (step?.tilt ?? 0) * dt;
    s.zoom = 0;
    this.taps.clear();
    this.takePressed();
    s.click = fresh && k.includes('c');
    return s;
  }
}

const ROAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'Enter', 'Escape', 'KeyQ', 'KeyR']);

/** The photo album is open (the game's album, src/game/Photos.ts; roaming waits behind it: tools.ts). */
function albumOpen(): boolean {
  const a = document.querySelector<HTMLElement>('.photo-album');
  return !!a && !a.hidden;
}

/**
 * The explorer's tools and emotes (tools.ts): 1 lantern · 2 torch ·
 * 3 flashlight (O: beam ahead ↔ mouse) · 4 / Z camera · 5 / Y selfie (T: stick) ·
 * F wave · C cheer · U look up · P peek · H hat · G outfit · X face ·
 * J sit · L lie down · I the explorer menu (_explorerMenu.ts) ·
 * V album · ? all keys. (Not M, N, B or K: the mini-map and its nearest
 * glider ramp, the bug report and the block look panel have them; J is
 * "Jump in" only in the overview, where these are off; Q and R turn the camera.)
 */
export const TOOL_KEYS: ReadonlySet<string> = new Set([
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5',
  'KeyZ', 'KeyY', 'KeyO', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'KeyH', 'KeyG', 'KeyX', 'KeyV', 'KeyT', 'Slash',
  'KeyJ', 'KeyL', 'KeyI',
]);

/**
 * One step of a scripted input: keys held for some seconds. Keys: w a s d
 * (move), r (run), j (jump: pressed at the start of the step, held through
 * it), e (use), x (exit), c (a click on the view: in photo mode, a photo);
 * `turn` turns the camera (radians/s, + = left),
 * `tilt` tilts it (radians/s, + = look down more),
 * `orbit` holds Q (+1) or R (−1): the camera's eased turn round him.
 */
export interface ScriptStep {
  keys: string;
  seconds: number;
  turn?: number;
  tilt?: number;
  orbit?: number;
}

/**
 * `sim=w:2,wr:3,j:0.5,_:1,e:0.2,a<0.6:1,_^0.4:1,w<:1.5` → steps. `_` = no
 * keys; after the keys, `<` alone holds Q and `>` alone R (the camera goes
 * round him, eased, as with the keys), `<rate` / `>rate` turn it left /
 * right at a steady rate (radians/s), `^rate` tilts it (+ = down).
 */
export function parseScript(spec: string): ScriptStep[] {
  return spec
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [head, secs] = part.split(':');
      const m = /^([^<>^]*)(?:([<>])(-?[\d.]+)?)?(?:\^(-?[\d.]+))?$/.exec(head);
      const keys = m?.[1] ?? head;
      const side = m?.[2] === '>' ? -1 : 1;
      return {
        keys: keys === '_' ? '' : keys,
        seconds: Number(secs ?? 1) || 1,
        turn: m?.[3] ? side * Number(m[3]) : undefined,
        tilt: m?.[4] ? Number(m[4]) : undefined,
        orbit: m?.[2] && !m[3] ? side : undefined,
      };
    });
}
