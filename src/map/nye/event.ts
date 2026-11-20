import { registerEvent, type RealSpan } from '../calendar';
import type { MapFrame } from '../types';
import { num, t } from '../ui/lang';
import { inTestRoom, nightHeld, nyeAsked, nyePhase, nyeSeconds, NYE_MIDNIGHT, NYE_TIMES, NYE_YEAR, squareShown } from './clock';
import { createNyeOverlay, type NyeOverlay, type NyeView } from './overlay';
import { RING } from './plan';

/**
 * New Year's Eve online (AWP-35), ticket 4 "the night": everything about it on screen but the sky (main.ts holds
 * the night: clock.ts `nightHeld`) and the square (index.ts):
 *
 * - **the calendar's entry** (map/calendar.ts, the card on 9): "Fireworks at Phnom Kulen", where the gathering
 *   ring is; on from the night-time hold (22:30 ICT) until it ends (00:45), so the maps put their gold badge on
 *   the square meanwhile (`ON_NOW`); its real-life dates and its line from clock.ts only (never a date here); on
 *   the real clock (`realClock`): the card shows the real countdown and no "Wait for it" (the map's time
 *   cannot move real time);
 * - **the countdown overlay** (overlay.ts): the chip from the hold, the huge numerals of the last ten seconds, the
 *   greeting at midnight;
 * - **its toasts**: as the night falls by itself at 22:30, or on opening the map during it, why the time changed;
 *   after 00:45, that the player's own time comes back.
 *
 * main.ts calls `installNye` once (after the interface is made) and its `update` every frame. Far from the night
 * it looks at the clock once a second and builds nothing; with no square (`nye=0`, or the night long past) it is
 * nothing at all. Shots: `countdown=<s>`, `fireworks=<s>`, `nye=…` (clock.ts) show that moment; the toasts come in
 * a shot only when asked (`nyetoast=night|over`).
 */

/** The greeting's length on screen (s after midnight), and its fade at the end (s). */
export const GREET = 12;
const FADE = 2.4;
/** The toasts' time on screen (s). */
const TOAST = 9;
/** From this many seconds before the night (and through it) the overlay looks every frame; else once a second. */
const NEAR = 120;

/** Cambodia's clock time `s` seconds from midnight ("22:30", "00:45"; digits as said). */
export function nyeClockAt(s: number): string {
  const d = new Date(NYE_MIDNIGHT + s * 1000 + 7 * 3600_000);
  return num(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
}

/** "01:29:59" (digits as said); with days ahead, "41 days 06:12:33". */
export function nyeLeft(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const d = Math.floor(s / 86400);
  const two = (n: number) => String(n).padStart(2, '0');
  const hms = num(`${two(Math.floor(s / 3600) % 24)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`);
  if (d < 1) return hms;
  return `${d === 1 ? t('nyeDay1') : t('nyeDays', { n: num(d) })} ${hms}`;
}

const year = (): string => num(NYE_YEAR);

/** The real days of the night in Cambodia (31 December → 1 January), from clock.ts's midnight: local dates at noon. */
function realSpan(from: Date): RealSpan | null {
  const day = (ms: number) => {
    const d = new Date(ms + 7 * 3600_000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  };
  const first = day(NYE_MIDNIGHT - 1000);
  const last = day(NYE_MIDNIGHT);
  const end = new Date(last);
  end.setHours(23, 59, 59, 999);
  return from.getTime() > end.getTime() ? null : { first, last };
}

// ── The calendar's entry (only while the square stands: from the day it ships to the day after the night) ──
if (squareShown())
  registerEvent({
    id: 'nye',
    kind: 'festival',
    name: 'nyeName',
    note: 'nyeNote',
    place: 'nyePlace',
    begins: 'nyeBegins',
    where: { x: RING.x, z: RING.z },
    // (the real clock, not the map's moment)
    on: () => nightHeld(),
    shown: () => nightHeld(),
    real: realSpan,
    realClock() {
      const s = nyeSeconds();
      if (s >= NYE_TIMES.nightTo) return null;
      if (s < NYE_TIMES.nightFrom || !nightHeld()) {
        if (s >= 0) return null;
        return { on: false, in: -s, when: `${t('nyeAt', { time: nyeClockAt(-60) })} · ${t('nyeIn', { left: nyeLeft(-s) })}` };
      }
      const when = s < 0 ? t('nyeCountNow', { left: nyeLeft(-s) }) : s < NYE_TIMES.show ? t('nyeShowNow', { left: nyeLeft(NYE_TIMES.show - s) }) : t('nyeAfterNow', { to: nyeClockAt(NYE_TIMES.nightTo) });
      return { on: true, in: 0, when };
    },
  });

export interface NyeOptions {
  /** The interface's root (#ui), after the interface is made (createMapUI empties it). */
  uiRoot: HTMLElement;
  /** The map is entered (the loading screen's button pressed, the story closed): the toasts wait for it. */
  ready?: () => boolean;
}

export interface NyeUi {
  /** Every frame (main.ts `step`, after the frame's time is set). */
  update(f: MapFrame): void;
}

/** New Year's Eve's overlay and toasts (nothing with no square: `nye=0`, or the night long past). */
export function installNye(o: NyeOptions): NyeUi {
  if (!squareShown()) return { update() {} };
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') === '1';
  // (joining the New Year online: the setting, the test link, the card; nothing connects until the player says so)
  void import('../ui/_join').then((j) => j.installJoin({ uiRoot: o.uiRoot })).catch((e) => console.error('[map] New Year online failed:', e));
  /** `nyetest=1`: the test room's tag in a shot (the room itself comes from the server: clock.ts `inTestRoom`). */
  const testTag = shot && params.get('nyetest') === '1';
  /** `nyetoast=night|over`: that toast in a shot (shots stay calm otherwise). */
  const askToast = params.get('nyetoast');
  let ov: NyeOverlay | null = null;
  let since = Infinity;
  /** The night toast was said (this visit), the night was held at the last look. */
  let toldNight = false;
  let wasHeld = false;
  const view: NyeView = { chip: null, numeral: null, greet: false, test: false };

  const overlay = (): NyeOverlay => {
    if (!ov) {
      ov = createNyeOverlay(o.uiRoot);
      ov.words(year());
    }
    return ov;
  };

  const toastNight = () =>
    overlay().toast(t('nyeToastKick'), t('nyeToastNight'), t('nyeToastNightNote', { to: nyeClockAt(NYE_TIMES.nightTo) }), TOAST);
  const toastOver = () => overlay().toast(t('nyeToastKick'), t('nyeToastOver'), t('nyeToastOverNote'), TOAST);

  return {
    update(f) {
      ov?.tick();
      const s = nyeSeconds();
      // (far from the night: a look once a second)
      const near = s >= NYE_TIMES.nightFrom - NEAR && s < NYE_TIMES.nightTo + NEAR;
      since += f.dt;
      if (!near && since < 1 && !shot) return;
      since = 0;
      const held = nightHeld();
      const ready = o.ready?.() ?? true;
      if (shot) {
        if (askToast && !toldNight && ready) {
          toldNight = true;
          if (askToast === 'over') toastOver();
          else toastNight();
        }
      } else {
        // (the night falls, or the map opens during it: once a visit; it ends: once)
        if (held && !toldNight && ready) {
          toldNight = true;
          toastNight();
        }
        if (!held && wasHeld && s >= NYE_TIMES.nightTo) toastOver();
      }
      wasHeld = held;
      // The overlay: the chip from the hold, the numerals, the greeting.
      const phase = nyePhase();
      view.chip = held && phase === 'night' ? nyeLeft(-s) : null;
      view.numeral = held && phase === 'last10' ? num(Math.min(10, Math.max(1, Math.ceil(-s)))) : null;
      view.greet = held && s >= 0 && s < GREET;
      view.test = testTag || inTestRoom();
      if (!ov && !view.chip && !view.numeral && !view.greet && !view.test) return;
      const v = overlay();
      v.set(view);
      v.fade(view.greet && s >= GREET - FADE && !shot);
    },
  };
}

// (checks, on the dev server: what the overlay and the calendar say now)
if (import.meta.env.DEV && typeof window !== 'undefined')
  Object.assign(window, { __nye: { asked: nyeAsked, seconds: () => nyeSeconds(), phase: () => nyePhase(), held: () => nightHeld(), left: (s: number) => nyeLeft(s), at: nyeClockAt } });
