import { pad } from '../pad/pad';
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
 * The game pad's right stick pushed all the way turns the view this fast
 * (radians/s; across, up and down), as `DRAG`: round him, through the camera
 * (slower zoomed in: photo.ts), the selfie phone round his head.
 */
const PAD_LOOK = { orbit: [3.2, 2.0], camera: [1.5, 1.1], selfie: [2.4, 1.8] } as const;
/** The right stick's push is taken to this power: a small push turns slowly (aiming a photo), a full one at full speed. */
const PAD_CURVE = 1.6;
/** The right stick's turn eases to its push at this rate (1/s): no jolt as it starts or stops. */
const PAD_EASE = 14;
/** L1 / R1 held zoom out / in this many wheel steps a second (the view round him, the camera's lens, the phone's reach). */
const PAD_ZOOM = { orbit: 4, camera: 6, selfie: 5 } as const;
/** A click of L3 keeps him running until the left stick comes back under this push. */
const SPRINT_STOP = 0.3;
/** The d-pad's ↑ (tools.ts): the next light (lantern → torch → flashlight → put away → lantern…), a tap of its own among the keys'. */
export const PAD_LIGHT = 'PadLight';

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
 * - a game pad (the core src/map/pad/pad.ts reads it; nothing while a menu
 *   has it), as its button map says: the left stick moves (as far as it is
 *   pushed: a half push walks slowly), R2 or L3 held runs (a click of L3
 *   runs until the stick comes back), the right stick looks, L1 / R1 zoom
 *   out / in, ✕ jumps (Space), □ uses (E), ○ goes back (Esc), △ the explorer
 *   menu (I), the d-pad ↑ the next light (`PAD_LIGHT`), ← the camera (4),
 *   → the selfie phone (5), ↓ greets (F; in the boat F fishes). With the
 *   camera or the phone up: ✕ or R2 takes the photo, △ the album (V), and
 *   the selfie's □ gesture (G), ↓ face (X), L3 stick (T). The pad's own key
 *   events (menus: `isTrusted` false) are not his.
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
  /** The right stick's turn speed now (radians/s, eased: `padTurn`), and L3's run (on until the left stick comes back). */
  private readonly padLook = { yaw: 0, pitch: 0 };
  private sprint = false;
  private script: ScriptStep[] | null = null;
  private scriptT = 0;
  private scriptStep: ScriptStep | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.touch = new TouchControls(canvas);
    addEventListener('keydown', (e) => {
      // (not a key the page already used, e.g. Esc closing the settings; nor the game pad's own
      // arrows, Enter and Esc in a menu, pad.ts: made by the page, not the keyboard)
      if (!this.on || !e.isTrusted || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
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
    addEventListener('keyup', (e) => {
      if (e.isTrusted) this.keys.delete(e.code);
    });
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

  /** Drive the input from a script (headless shots; a saved view put back: roam.ts `placeFrom`) instead of the keys; null: the keys again. */
  runScript(steps: ScriptStep[] | null): void {
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
    // (L3's run is for the way he was going: a new mode (a leap off a cliff into the parachute) starts without it)
    this.sprint = false;
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
    this.padLook.yaw = this.padLook.pitch = 0;
    this.sprint = false;
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

  /**
   * The game pad, added onto the state (pad.ts reads it: sticks with their dead middle taken
   * out, presses kept until taken; nothing at all while a menu, card or panel has it, the
   * free camera is open or a bug report is being written). Every press read here is taken
   * each frame, used or not, so none waits to fire in another mode (R2 on foot is no photo later).
   */
  private pollPad(dt: number): void {
    const s = this.state;
    if (!pad.connected) {
      this.padLook.yaw = this.padLook.pitch = 0;
      this.sprint = false;
      return;
    }
    const photo = this.photo;
    const tap = (code: string) => this.taps.add(code);
    // The left stick walks (as far as it is pushed), steers, paddles.
    const l = pad.stick('left');
    s.move.x += l.x;
    s.move.y += l.y;
    // Run (Shift): R2 or L3 held; a click of L3 runs on until the stick comes back (as games sprint).
    const l3 = pad.take('l3');
    if (l3 && !photo) this.sprint = true;
    if (photo || Math.hypot(l.x, l.y) < SPRINT_STOP) this.sprint = false;
    s.run ||= pad.held('r2') || pad.held('l3') || this.sprint;
    // The right stick turns the view (round him, through the camera, the phone round his head): push up, look up.
    const r = pad.stick('right');
    const len = Math.hypot(r.x, r.y);
    const curve = len > 1e-4 ? Math.pow(Math.min(1, len), PAD_CURVE) / len : 0;
    const [kYaw, kPitch] = PAD_LOOK[photo ?? 'orbit'];
    s.lookYaw += this.padTurn('yaw', -r.x * curve * kYaw, dt);
    s.lookPitch += this.padTurn('pitch', -r.y * curve * kPitch, dt);
    // L1 / R1 held: out / in (the lens; the phone further / closer).
    s.zoom += ((pad.held('l1') ? 1 : 0) - (pad.held('r1') ? 1 : 0)) * PAD_ZOOM[photo ?? 'orbit'] * dt;
    // ✕ jumps (Space: opens the parachute, lets go, the burner; with the camera up it takes the photo), ○ back (Esc).
    // (each taken whatever the keys did: `||=` would leave a press for the next frame)
    const south = pad.take('south');
    const east = pad.take('east');
    s.jump ||= south;
    s.jumpHeld ||= pad.held('south');
    s.exit ||= east;
    const west = pad.take('west');
    const north = pad.take('north');
    const down = pad.take('down');
    // (R2 is the shutter too with the camera or the phone up)
    if (pad.take('r2') && photo) s.click = true;
    if (pad.take('up')) tap(PAD_LIGHT);
    if (pad.take('left')) tap('Digit4');
    if (pad.take('right')) tap('Digit5');
    if (!photo) {
      // □ uses (E), △ the explorer menu (I), ↓ greets (F; in the boat: fish).
      s.use ||= west;
      if (north) tap('KeyI');
      if (down) tap('KeyF');
      return;
    }
    // The camera or the phone up: △ the album (V); the selfie's □ gesture (G), ↓ face (X), L3 stick (T).
    if (north) tap('KeyV');
    if (photo !== 'selfie') return;
    if (west) tap('KeyG');
    if (down) tap('KeyX');
    if (l3) tap('KeyT');
  }

  /**
   * The right stick's turn this frame on one axis: its speed eases to `goal` (radians/s),
   * and the turn is the exact sum over the frame, so any frame rate turns alike (as `orbitTurn`).
   * Let go, it stops at zero: the follow camera's own swing comes back.
   */
  private padTurn(axis: 'yaw' | 'pitch', goal: number, dt: number): number {
    const v = this.padLook[axis];
    const k = 1 - Math.exp(-PAD_EASE * dt);
    const turn = goal * dt + ((v - goal) * k) / PAD_EASE;
    const next = v + (goal - v) * k;
    this.padLook[axis] = !goal && Math.abs(next) < 0.01 ? 0 : next;
    return turn;
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
    // (f: F tapped at the step's start — the greeting, tools.ts; 6: eat or drink what he keeps, _shop.ts)
    if (fresh && k.includes('f')) this.taps.add('KeyF');
    if (fresh && k.includes('6')) this.taps.add('Digit6');
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
 * F greet (a sampeah or a wave) · C cheer · U look up · P peek · H hat · G outfit · X face ·
 * J sit · L lie down · I the explorer menu (_explorerMenu.ts) ·
 * 6 eat or drink what he keeps (_shop.ts) · V album · ? all keys. (Not M, N, B or K: the mini-map and its nearest
 * glider ramp, the bug report and the block look panel have them; J is
 * "Jump in" only in the overview, where these are off; Q and R turn the camera.)
 */
export const TOOL_KEYS: ReadonlySet<string> = new Set([
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5',
  'KeyZ', 'KeyY', 'KeyO', 'KeyF', 'KeyC', 'KeyU', 'KeyP', 'KeyH', 'KeyG', 'KeyX', 'KeyV', 'KeyT', 'Slash',
  'KeyJ', 'KeyL', 'KeyI',
  // (6: eat or drink what he keeps in his bag, roam/_shop.ts)
  'Digit6', 'Numpad6',
]);

/**
 * One step of a scripted input: keys held for some seconds. Keys: w a s d
 * (move), r (run), j (jump: pressed at the start of the step, held through
 * it), e (use), x (exit), c (a click on the view: in photo mode, a photo),
 * f (F tapped: the greeting), 6 (6 tapped: eat or drink what he keeps);
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
