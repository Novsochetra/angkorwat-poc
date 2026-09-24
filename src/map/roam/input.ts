import { TouchControls } from './touch';
import type { RoamInput } from './types';

/**
 * Input while roaming, all mapped onto one `RoamInput`:
 *
 * - keys: WASD / arrows move (relative to the camera), Shift runs, Space
 *   jumps (and opens or closes the parachute), E / Enter uses, Esc goes back
 *   to the overview;
 * - mouse: drag the view (either button) to turn the camera, wheel to zoom;
 * - touch: a joystick, Jump and Use buttons, drag to look, pinch to zoom
 *   (touch.ts);
 * - a gamepad: left stick moves (pushed in: run), right stick looks, A jumps,
 *   X uses, B or Start goes back.
 *
 * `script` replaces the real input with a list of timed steps, for headless
 * shots (`sim=` in the URL, see `parseScript`).
 */
export class RoamControls {
  readonly state: RoamInput = { move: { x: 0, y: 0 }, run: false, jump: false, jumpHeld: false, use: false, exit: false, lookYaw: 0, lookPitch: 0, zoom: 0 };
  private on = false;
  private readonly keys = new Set<string>();
  private readonly hits = new Set<string>();
  private drag: { id: number; x: number; y: number } | null = null;
  private readonly look = { yaw: 0, pitch: 0, zoom: 0 };
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
      if (!ROAM_KEYS.has(e.code)) return;
      if (!e.repeat) this.hits.add(e.code);
      this.keys.add(e.code);
      e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    // Mouse and pen: drag to look (touch: touch.ts).
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.on || this.drag || e.pointerType === 'touch' || e.button > 2) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const k = 3.2 / Math.max(innerHeight, 1);
      this.look.yaw -= (e.clientX - this.drag.x) * k;
      this.look.pitch += (e.clientY - this.drag.y) * k;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (this.drag && e.pointerId === this.drag.id) {
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
    s.exit = hit('Escape');
    s.lookYaw = this.look.yaw + t.look.yaw;
    s.lookPitch = this.look.pitch + t.look.pitch;
    s.zoom = this.look.zoom + t.look.zoom;
    this.pollPad(dt);
    const len = Math.hypot(s.move.x, s.move.y);
    if (len > 1) {
      s.move.x /= len;
      s.move.y /= len;
    }
    this.look.yaw = this.look.pitch = this.look.zoom = 0;
    t.look.yaw = t.look.pitch = t.look.zoom = 0;
    t.jumpHit = t.useHit = false;
    this.hits.clear();
    return s;
  }

  /**
   * Forget presses and turns not read yet (switching modes). Held keys and
   * the stick stay held: walking on after a landing needs no new press.
   */
  clear(): void {
    this.hits.clear();
    this.look.yaw = this.look.pitch = this.look.zoom = 0;
    const t = this.touch;
    t.jumpHit = t.useHit = false;
    t.look.yaw = t.look.pitch = t.look.zoom = 0;
  }

  /** Let go of everything (leaving, the window lost focus). */
  private releaseAll(): void {
    this.clear();
    this.keys.clear();
    this.drag = null;
    this.touch.release();
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
    s.lookYaw = (step?.turn ?? 0) * dt;
    s.lookPitch = (step?.tilt ?? 0) * dt;
    s.zoom = 0;
    return s;
  }
}

const ROAM_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'Enter', 'Escape']);

/**
 * One step of a scripted input: keys held for some seconds. Keys: w a s d
 * (move), r (run), j (jump: pressed at the start of the step, held through
 * it), e (use), x (exit); `turn` turns the camera (radians/s, + = left),
 * `tilt` tilts it (radians/s, + = look down more).
 */
export interface ScriptStep {
  keys: string;
  seconds: number;
  turn?: number;
  tilt?: number;
}

/**
 * `sim=w:2,wr:3,j:0.5,_:1,e:0.2,a<0.6:1,_^0.4:1` → steps. `_` = no keys;
 * `<rate` after the keys turns the camera (radians/s, + = left), `^rate`
 * tilts it (+ = down).
 */
export function parseScript(spec: string): ScriptStep[] {
  return spec
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [head, secs] = part.split(':');
      const m = /^([^<^]*)(?:<(-?[\d.]+))?(?:\^(-?[\d.]+))?$/.exec(head);
      const keys = m?.[1] ?? head;
      return {
        keys: keys === '_' ? '' : keys,
        seconds: Number(secs ?? 1) || 1,
        turn: m?.[2] ? Number(m[2]) : undefined,
        tilt: m?.[3] ? Number(m[3]) : undefined,
      };
    });
}
