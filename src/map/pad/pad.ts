import { injectPadStyle, swapKbds } from './glyphs';
import { clearMark, focusFirst, focusables, markFocus, moveFocusIn, watchFocusRules } from './nav';

/**
 * Game controllers for the whole map: a PS5 DualSense, a PS4 pad, an Xbox pad
 * and most others (the browser's "standard" layout: Chrome, Edge, Safari).
 * One module reads the pad once a frame (its own animation frame, only while
 * a pad is connected: nothing at all without one) and hands it on:
 *
 * - **Roaming** (`setRoaming(true)`, no menu open): the roaming input reads
 *   it (roam/input.ts): `stick`, `held`, `value`, and `take` for a press
 *   (latched until taken, so a slow frame never loses one).
 * - **Menus and the map screen** (a layer open, or not roaming): the pad
 *   works the page the way the keys do. The d-pad and the left stick send
 *   the arrow keys (held: again and again), ✕ sends Enter and presses the
 *   button in focus, ○ sends Esc (then the layer's `back`), L1 / R1 the
 *   layer's `tabs`. The page's own key handlers see them first (synthetic
 *   `keydown` / `keyup`, `isTrusted` false: the roaming keys ignore those);
 *   an arrow nobody used moves the focus to the nearest control that way
 *   (nav.ts), and left / right change a slider in focus.
 * - **A button's own job**: `onPress(button, fn)` (Options: the settings), with
 *   no layer open (`always`: also over one); a layer's own `buttons` come first.
 *
 * A menu, card or panel that takes the pad while it is open calls
 * `openPadLayer(root, …)` when it opens and the returned `close()` when it
 * shuts. While any is open, roaming reads nothing (the explorer stands).
 * A press used by a menu stays swallowed until its button is let go
 * (✕ pressed on "Jump" does not also jump).
 *
 * **Buttons** are named by where they sit (`PadButton`), so one map fits
 * every pad; `glyphs.ts` draws them as the pad in hand has them (✕ ○ □ △ on
 * a PlayStation pad, A B X Y on an Xbox one). While the last input was the
 * pad the body has `pad-on` and `pad-ps` / `pad-xbox` / `pad-other`, and every
 * `<kbd data-pad="…">` shows the pad's button instead of its key (glyphs.ts
 * `setKbd` for one set later). A key, a click or a touch turns it off again.
 *
 * **The map of buttons** (PS names; Xbox: ✕ A, ○ B, □ X, △ Y, L1 LB, R1 RB,
 * L2 LT, R2 RT, Create View, Options Menu; the touchpad is PS only):
 *
 * - Map screen: left stick / d-pad between the places · ✕ pick · ○ back ·
 *   △ Jump in (the card: ← → or the stick, ✕ jumps, ○ shuts) · Options
 *   settings · the loading screen's Start and the story: ✕.
 * - On foot: left stick walks (L3 or R2 held: run) · right stick turns the
 *   camera · L1 / R1 zoom out / in · ✕ jump · □ use (E) · ○ back to the map ·
 *   △ Explorer menu · d-pad ↑ a light (lantern → torch → flashlight → away),
 *   ← camera, → selfie, ↓ greet (in the boat: fish) · R3 nearest glider
 *   ramp (N) · Create or the touchpad: the big map (M) · Options settings ·
 *   the album (V): a button in the Explorer menu.
 * - Photo mode, boat, parachute, hang glider, balloon: as their keys (✕ is
 *   Space, □ is E, R2 is Shift; photo mode: R2 or ✕ takes it, ○ puts it away).
 * - Menus: left stick / d-pad move · ✕ press · ○ back · L1 / R1 tabs.
 *
 * URL: `pad=ps|xbox|other` draws the buttons as with that pad in hand (shots;
 * no pad needed), `pad=0` ignores pads. Checks: `window.__pad` (the state;
 * `presses[button]` counts the presses seen), scripts/_padFake.mjs (a fake
 * DualSense for Playwright).
 */

/** The standard layout's buttons, in its order (index = `Gamepad.buttons` index). */
export const PAD_BUTTONS = ['south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home', 'touchpad'] as const;
/**
 * A button by where it sits: south ✕ / A, east ○ / B, west □ / X, north △ / Y,
 * select Create / View, start Options / Menu, l3 / r3 the sticks pushed in,
 * home the PS / Xbox button, touchpad the PS pad's touchpad pressed.
 */
export type PadButton = (typeof PAD_BUTTONS)[number];
/** Which pad is in hand (glyphs.ts draws its buttons). */
export type PadKind = 'ps' | 'xbox' | 'other';
export type PadDir = 'up' | 'down' | 'left' | 'right';
/** The shakes (`rumble`), from a light tick to a thunderclap. */
export type PadRumble = 'tick' | 'bump' | 'land' | 'hard' | 'bite' | 'catch' | 'thunder' | 'burner';

export interface PadLayerOpts {
  /** ○ when no key handler took the Esc it sent first: shut it (called at most once a press; may be called when already shut). */
  back?(): void;
  /** L1 (−1) / R1 (+1): the tab before / after. */
  tabs?(dir: -1 | 1): void;
  /** Where the focus goes when the pad first moves in it (default: the first control, top left). */
  first?(): HTMLElement | null;
  /** Buttons it uses itself, before anything else (return false to let the press go on as usual). */
  buttons?: Partial<Record<PadButton, () => boolean | void>>;
  /** The focus moved in it by the pad (a sound). */
  onMove?(): void;
}

/** Choices from the settings (main.ts keeps them in step with `MapSettings`). */
export const padPrefs = {
  /** The pad shakes (landings, a fish biting, thunder…). */
  rumble: true,
};

const params = new URLSearchParams(location.search);
const shot = params.get('shot') === '1';
const forced = params.get('pad');
const off = forced === '0';

/** Sticks: nothing under this (worn sticks drift), full at the rim. */
const DEAD = 0.15;
/** The left stick counts as a d-pad press past this (menus). */
const NAV_AT = 0.55;
/** Menus: a held direction goes again after this (s), then every REPEAT_EVERY. */
const REPEAT_AFTER = 0.38;
const REPEAT_EVERY = 0.11;
/** A press nobody took is forgotten after this (s). */
const LATCH = 0.4;
/** The mouse turns the pad's glyphs off once it has moved this far (px) in a short while (a nudge does not). */
const MOUSE_AWAY = 40;

const RUMBLES: Record<PadRumble, { ms: number; weak: number; strong: number }> = {
  tick: { ms: 40, weak: 0.3, strong: 0 },
  bump: { ms: 90, weak: 0.35, strong: 0.2 },
  land: { ms: 140, weak: 0.4, strong: 0.45 },
  hard: { ms: 260, weak: 0.6, strong: 1 },
  bite: { ms: 180, weak: 0.9, strong: 0.3 },
  catch: { ms: 420, weak: 0.5, strong: 0.8 },
  thunder: { ms: 700, weak: 0.25, strong: 0.6 },
  burner: { ms: 120, weak: 0.15, strong: 0.1 },
};

const N = PAD_BUTTONS.length;
const now = () => performance.now() / 1000;

interface Layer extends PadLayerOpts {
  root: HTMLElement;
}

const state = {
  /** A pad is connected (and has been pressed: browsers show one only then). */
  connected: false,
  /** The last input was the pad (its glyphs show). */
  active: false,
  kind: 'other' as PadKind,
  /** The pad's name as the browser gives it. */
  id: '',
  roaming: false,
  /** Presses seen per button, for checks. */
  presses: Object.fromEntries(PAD_BUTTONS.map((b) => [b, 0])) as Record<PadButton, number>,
};

const down = new Array<boolean>(N).fill(false);
const values = new Array<number>(N).fill(0);
const axes = [0, 0, 0, 0];
/** Presses not taken yet by the roaming input: button → when (s). */
const latched = new Map<PadButton, number>();
/** Pressed while a menu had the pad: ignored by the roaming input until let go. */
const swallowed = new Set<PadButton>();
const layers: Layer[] = [];
let base: PadLayerOpts & { root?: HTMLElement } = {};
const pressHandlers: { button: PadButton; fn: () => boolean | void; always: boolean }[] = [];
/** D-pad buttons held whose press a layer's `buttons` or `onPress` took (navStep does not move for them). */
const handledDirs = new Set<PadDir>();
const changeHandlers = new Set<() => void>();
let raf = 0;
/** The menus' held direction: which, from when, when it goes next. */
let navHeld: { dir: PadDir; next: number } | null = null;
let lastRumble: { kind: PadRumble; until: number } | null = null;
let sounds: { move?(): void } = {};

// ── Reading the pad ─────────────────────────────────────────────────────────

/** The pad in hand: the standard-layout one with the latest input. */
function thePad(): Gamepad | null {
  let best: Gamepad | null = null;
  for (const p of navigator.getGamepads?.() ?? []) if (p?.connected && p.mapping === 'standard' && (!best || p.timestamp > best.timestamp)) best = p;
  return best;
}

function kindOf(id: string): PadKind {
  // (Xbox first: its pads are "Xbox Wireless Controller", a PS4 pad plain "Wireless Controller")
  if (/045e|xbox|xinput/i.test(id)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|wireless controller/i.test(id)) return 'ps';
  return 'other';
}

/** A stick with its dead middle taken out (round, not per axis: diagonals stay full). */
function deadStick(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len < DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (len - DEAD) / (1 - DEAD)) / len;
  return { x: x * k, y: y * k };
}

function frame(): void {
  raf = 0;
  const p = thePad();
  if (!p) {
    if (state.connected) {
      state.connected = false;
      releaseAll();
      changed();
    }
    return;
  }
  if (!state.connected || p.id !== state.id) {
    state.connected = true;
    state.id = p.id;
    state.kind = forced === 'ps' || forced === 'xbox' || forced === 'other' ? forced : kindOf(p.id);
    changed();
  }
  sample(p);
  raf = requestAnimationFrame(frame);
}

function start(): void {
  if (off || shot || raf) return;
  raf = requestAnimationFrame(frame);
}

function sample(p: Gamepad): void {
  const t = now();
  let input = false;
  for (let i = 0; i < 4; i++) {
    const v = p.axes[i] ?? 0;
    axes[i] = v;
    if (Math.abs(v) > NAV_AT) input = true;
  }
  const pressed: PadButton[] = [];
  for (let i = 0; i < N; i++) {
    const b = p.buttons[i];
    const on = !!b?.pressed;
    values[i] = b?.value ?? (on ? 1 : 0);
    if (on && !down[i]) pressed.push(PAD_BUTTONS[i]);
    if (!on && down[i]) {
      swallowed.delete(PAD_BUTTONS[i]);
      handledDirs.delete(PAD_BUTTONS[i] as PadDir);
    }
    down[i] = on;
  }
  if (pressed.length || input) {
    if (!state.active) setActive(true);
    dispatchEvent(new Event('padinput'));
  }
  // (latched presses nobody took go stale)
  for (const [b, at] of latched) if (t - at > LATCH) latched.delete(b);
  for (const b of pressed) {
    state.presses[b]++;
    press(b, t);
  }
  if (uiMode()) navStep(t);
  else navHeld = null;
}

// ── Where a press goes ──────────────────────────────────────────────────────

function uiMode(): boolean {
  return layers.length > 0 || !state.roaming;
}

function blocked(): boolean {
  // (a bug report being written, or the free camera: the pad rests)
  const b = document.body.classList;
  return b.contains('reporting') || b.contains('freecam');
}

function press(b: PadButton, t: number): void {
  if (blocked()) return;
  const layer = layers[layers.length - 1];
  const own = layer?.buttons?.[b] ?? (layers.length ? undefined : base.buttons?.[b]);
  if (own && own() !== false) return used(b);
  for (let i = pressHandlers.length - 1; i >= 0; i--) {
    const h = pressHandlers[i];
    if (h.button === b && (h.always || !layers.length) && h.fn() !== false) return used(b);
  }
  if (!uiMode()) {
    latched.set(b, t);
    return;
  }
  swallow(b);
  const top = layer ?? base;
  if (b === 'south') activate(top);
  else if (b === 'east') back(top);
  else if ((b === 'l1' || b === 'r1') && top.tabs) top.tabs(b === 'l1' ? -1 : 1);
  // (the d-pad: navStep, held or not)
}

function swallow(b: PadButton): void {
  swallowed.add(b);
  latched.delete(b);
}

/** A layer's own button or a handler took the press (a d-pad one is not also a menu move). */
function used(b: PadButton): void {
  swallow(b);
  if (b === 'up' || b === 'down' || b === 'left' || b === 'right') handledDirs.add(b);
}

/** The direction held for the menus: the d-pad, else the left stick past NAV_AT. */
function heldDir(): PadDir | null {
  if (down[12]) return 'up';
  if (down[13]) return 'down';
  if (down[14]) return 'left';
  if (down[15]) return 'right';
  const [x, y] = axes;
  if (Math.max(Math.abs(x), Math.abs(y)) < NAV_AT) return null;
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up';
}

function navStep(t: number): void {
  const dir = blocked() ? null : heldDir();
  if (!dir) {
    navHeld = null;
    return;
  }
  if (navHeld && navHeld.dir === dir) {
    if (t < navHeld.next) return;
    navHeld.next = t + REPEAT_EVERY;
    navigate(dir, true);
    return;
  }
  navHeld = { dir, next: t + REPEAT_AFTER };
  // (a d-pad press a layer's or a handler's own button took: not a move too, held or not)
  if (handledDirs.has(dir)) {
    navHeld.next = Infinity;
    return;
  }
  navigate(dir, false);
}

const ARROW: Record<PadDir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

function scopeOf(top: PadLayerOpts & { root?: HTMLElement }): HTMLElement {
  return top.root ?? document.body;
}

/** An arrow key into the page; if nobody used it, the focus moves (or a slider in focus changes). */
function navigate(dir: PadDir, repeat: boolean): void {
  const top: Layer | (PadLayerOpts & { root?: HTMLElement }) = layers[layers.length - 1] ?? base;
  const scope = scopeOf(top);
  // (the layer's own root in focus, as a card that focuses itself: nothing in focus yet)
  const at = document.activeElement instanceof HTMLElement && scope.contains(document.activeElement) && document.activeElement !== scope ? document.activeElement : null;
  if (!key(ARROW[dir], at, repeat)) return;
  if (at instanceof HTMLInputElement && at.type === 'range' && (dir === 'left' || dir === 'right')) {
    if (dir === 'left') at.stepDown();
    else at.stepUp();
    at.dispatchEvent(new Event('input', { bubbles: true }));
    at.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const to = at ? moveFocusIn(scope, at, dir) : (top.first?.() ?? focusFirst(scope));
  if (to && to !== at) {
    markFocus(to);
    (top.onMove ?? sounds.move)?.();
  }
}

/** ✕: Enter into the page; if nobody used it, the control in focus is pressed (nothing in focus: the first one gets it). */
function activate(top: PadLayerOpts & { root?: HTMLElement }): void {
  const scope = scopeOf(top);
  const at = document.activeElement instanceof HTMLElement && scope.contains(document.activeElement) && document.activeElement !== document.body && document.activeElement !== scope ? document.activeElement : null;
  if (!key('Enter', at, false)) return;
  if (!at) {
    const to = top.first?.() ?? focusFirst(scope);
    if (to) {
      markFocus(to);
      (top.onMove ?? sounds.move)?.();
    }
    return;
  }
  if (at instanceof HTMLInputElement && at.type === 'range') return;
  if (isPressable(at)) at.click();
}

/** ○: Esc into the page; if nobody used it, the layer's `back`. */
function back(top: PadLayerOpts): void {
  const at = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!key('Escape', at, false)) return;
  top.back?.();
}

/** A key down and up on `at` (or the body), as the keyboard would; false if a handler used it (default prevented). */
function key(k: string, at: HTMLElement | null, repeat: boolean): boolean {
  const target = at ?? document.body;
  const init: KeyboardEventInit = { key: k, code: k === 'Escape' ? 'Escape' : k, bubbles: true, cancelable: true, composed: true, repeat };
  const free = target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', { ...init, repeat: false }));
  return free;
}

function isPressable(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  const tag = el.tagName;
  if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'LABEL') return true;
  if (tag === 'INPUT') return ['checkbox', 'radio', 'button', 'submit', 'color', 'file'].includes((el as HTMLInputElement).type);
  const role = el.getAttribute('role');
  return !!role && ['button', 'switch', 'tab', 'radio', 'checkbox', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'link'].includes(role);
}

// ── Pad or keys ─────────────────────────────────────────────────────────────

function setActive(on: boolean): void {
  if (on === state.active) return;
  state.active = on;
  changed();
}

function changed(): void {
  const b = document.body?.classList;
  if (b) {
    const on = state.active;
    b.toggle('pad-on', on);
    for (const k of ['ps', 'xbox', 'other'] as const) b.toggle(`pad-${k}`, on && state.kind === k);
  }
  if (state.active) watchFocusRules();
  else clearMark();
  swapKbds(state.active, state.kind);
  for (const fn of changeHandlers) fn();
}

function releaseAll(): void {
  down.fill(false);
  values.fill(0);
  axes.fill(0);
  latched.clear();
  swallowed.clear();
  navHeld = null;
}

function listen(): void {
  addEventListener('gamepadconnected', start);
  addEventListener('gamepaddisconnected', () => {
    if (!thePad()) {
      state.connected = false;
      releaseAll();
      // (the listeners hear it even when the keys were in use: the settings' Controller group shows "none")
      if (state.active) setActive(false);
      else changed();
    }
  });
  // (a real key, click or touch: the keys' and the mouse's hints again)
  const away = (e: Event) => {
    if (e.isTrusted && state.active && !forced) setActive(false);
  };
  addEventListener('keydown', away, true);
  addEventListener('pointerdown', away, true);
  addEventListener('wheel', away, { capture: true, passive: true });
  addEventListener('touchstart', away, { capture: true, passive: true });
  let moved = 0;
  let since = 0;
  addEventListener(
    'mousemove',
    (e) => {
      if (!state.active || forced || !e.isTrusted) return;
      const t = e.timeStamp;
      if (t - since > 400) moved = 0;
      since = t;
      moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (moved > MOUSE_AWAY) setActive(false);
    },
    { capture: true, passive: true },
  );
  addEventListener('blur', () => {
    latched.clear();
    navHeld = null;
  });
  // (a pad pressed before this page loaded: some browsers list it at once)
  if (thePad()) start();
}

// ── The API ─────────────────────────────────────────────────────────────────

export const pad = {
  /** A pad is connected. */
  get connected(): boolean {
    return state.connected;
  },
  /** The last input was the pad: show its buttons, not the keys. */
  get active(): boolean {
    return state.active;
  },
  get kind(): PadKind {
    return state.kind;
  },
  /** A menu, card or panel has the pad (the explorer's input reads nothing). */
  get inMenu(): boolean {
    return layers.length > 0;
  },

  /** Roaming (roam.ts): with no layer open, the pad is the explorer's. */
  setRoaming(on: boolean): void {
    if (on === state.roaming) return;
    state.roaming = on;
    latched.clear();
    // (what is held now was pressed for the other side: ✕ on "Jump" does not also jump)
    for (let i = 0; i < N; i++) if (down[i]) swallowed.add(PAD_BUTTONS[i]);
  },

  /** A stick, its dead middle taken out: x right, y up (+1 pushed away from you). Zero while a menu has the pad. */
  stick(which: 'left' | 'right'): { x: number; y: number } {
    if (!state.connected || uiMode() || blocked()) return { x: 0, y: 0 };
    const i = which === 'left' ? 0 : 2;
    const s = deadStick(axes[i], axes[i + 1]);
    return { x: s.x, y: -s.y };
  },
  /** A button held now (not one a menu used, until it is let go). False while a menu has the pad. */
  held(b: PadButton): boolean {
    const i = PAD_BUTTONS.indexOf(b);
    return state.connected && !uiMode() && !blocked() && down[i] && !swallowed.has(b);
  },
  /** How far a button is pressed, 0‥1 (the triggers L2 / R2 are analog). */
  value(b: PadButton): number {
    return this.held(b) ? values[PAD_BUTTONS.indexOf(b)] : 0;
  },
  /** A press not taken yet (true once a press). Presses wait a moment for a slow frame, then go. */
  take(b: PadButton): boolean {
    if (!latched.has(b) || uiMode()) return false;
    latched.delete(b);
    return true;
  },

  /**
   * A menu, card or panel takes the pad while it is open (the focus moves in
   * `root`). Returns its `close()` (call it when it shuts; twice is fine).
   * The last opened is on top.
   */
  openLayer(root: HTMLElement, opts: PadLayerOpts = {}): () => void {
    const old = layers.findIndex((l) => l.root === root);
    if (old >= 0) layers.splice(old, 1);
    const layer: Layer = { ...opts, root };
    layers.push(layer);
    latched.clear();
    navHeld = null;
    for (let i = 0; i < N; i++) if (down[i]) swallowed.add(PAD_BUTTONS[i]);
    if (state.active) {
      // (after the opener's own layout: the controls may appear this frame)
      requestAnimationFrame(() => {
        if (layers[layers.length - 1] !== layer) return;
        const at = document.activeElement;
        if (at instanceof HTMLElement && root.contains(at) && at !== root) return markFocus(at);
        const to = opts.first?.() ?? focusFirst(root);
        if (to) markFocus(to);
      });
    }
    return () => {
      const i = layers.indexOf(layer);
      if (i < 0) return;
      layers.splice(i, 1);
      navHeld = null;
      for (let j = 0; j < N; j++) if (down[j]) swallowed.add(PAD_BUTTONS[j]);
    };
  },

  /** The map screen's own "layer" under all the others (ui.ts: the places, the pick, ○ back). */
  setBase(opts: PadLayerOpts & { root?: HTMLElement }): void {
    base = opts;
  },

  /**
   * A button's own job (latest first; after the top layer's `buttons`). Runs
   * only while no layer is open, unless `always`. Return false to let the
   * press go on (roaming: `take`; menus: the usual move, press or back).
   * Returns: stop listening.
   */
  onPress(button: PadButton, fn: () => boolean | void, opts: { always?: boolean } = {}): () => void {
    const h = { button, fn, always: !!opts.always };
    pressHandlers.push(h);
    return () => {
      const i = pressHandlers.indexOf(h);
      if (i >= 0) pressHandlers.splice(i, 1);
    };
  },

  /** The pad connected, went, or became (or stopped being) the input in use. Returns: stop listening. */
  onChange(fn: () => void): () => void {
    changeHandlers.add(fn);
    return () => changeHandlers.delete(fn);
  },

  /** The interface's sounds for the pad's moves (main.ts / ui.ts). */
  setSounds(s: { move?(): void }): void {
    sounds = s;
  },

  /** Shake the pad (if it can, the setting allows it and the pad is in use). `scale` 0‥1 softens it. */
  rumble(kind: PadRumble, scale = 1): void {
    if (!padPrefs.rumble || !state.active || document.hidden || scale <= 0) return;
    const t = performance.now();
    // (the same shake again before it ends: let it run)
    if (lastRumble && lastRumble.kind === kind && t < lastRumble.until) return;
    const r = RUMBLES[kind];
    const p = thePad();
    const act = (p as (Gamepad & { vibrationActuator?: GamepadHapticActuator | null }) | null)?.vibrationActuator;
    if (!act?.playEffect) return;
    lastRumble = { kind, until: t + r.ms };
    const k = Math.min(1, scale);
    act.playEffect('dual-rumble', { startDelay: 0, duration: r.ms, weakMagnitude: r.weak * k, strongMagnitude: r.strong * k }).catch(() => undefined);
  },
};

// ── Start ───────────────────────────────────────────────────────────────────

injectPadStyle();
if (!off) {
  listen();
  if (forced === 'ps' || forced === 'xbox' || forced === 'other') {
    state.kind = forced;
    state.active = true;
    // (the body may not be parsed yet when this module runs in the head)
    if (document.body) changed();
    else addEventListener('DOMContentLoaded', changed, { once: true });
  }
}
Object.assign(window, { __pad: { state, layers, pad, focusables } });
