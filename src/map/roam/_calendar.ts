import '../audio/_calendar';
import { SFX } from '../audio/addonSfx';
import { CALENDAR, eventById, NEAR, nextOf, ON_NOW, type CalendarEvent, type EventTime } from '../calendar';
import { TIME, type MapMoment } from '../time';
import type { MapFrame, MapPart, RoamMode } from '../types';
import { num, onLang, t } from '../ui/lang';
import type { Minimap } from '../ui/minimap';
import { registerAddon, type AddonEnv } from './_addons';
import { createCalendarCard, createCalendarToast, type CalendarCard, type CalendarToast, type CardModel, type CardRow, type CardSection } from './_calendarCard';
import './_calendarEvents';
import { calendarSvg } from './_calendarIcons';
import { atWords, daysWords, inWords, leftWords, momentWords, realWords, untilWords } from './_calendarText';

/**
 * The calendar of events while roaming ("right now we don't know when each
 * Khmer event is going to happen while we are roaming"): what is on now,
 * what comes today and when, the festivals ahead (and their days in real
 * life), the seasons. The events are map/calendar.ts's (registered with the
 * rules their parts play by: _calendarEvents.ts).
 *
 * - **The card** (_calendarCard.ts): key 9, the button under the mini-map
 *   (its line says what is on, or what comes next: "Morning market · in
 *   3 min"), the explorer menu's Calendar (I; the game pad: △ → Calendar).
 *   **Show on map** makes the event the mini-map's target (ui/minimap.ts:
 *   the gold arrow, "You have arrived"); **Wait for it** fades out, moves the
 *   time on to a few seconds before it (time.ts `skipTo`: first to half a day
 *   before a far one, so a festival's part is built meanwhile), waits for
 *   what is built late (`TIME.building()`, at most a few seconds), fades back
 *   in and says it is about to begin (and heads the mini-map there). Only
 *   while the time runs (the Time setting "Cycle"): while it stands still
 *   the card says so, and where to change it. He stays where he is (in the
 *   boat, the balloon, on a ride: they go on).
 * - **As an event begins** (crossing its start while the time runs, not one
 *   already on at the start): a banner with its picture ("The morning market
 *   is open — Sugar Palm Village") and a soft bell (audio/_calendar.ts), once
 *   for each time it happens: festivals and seasons' first day always, the
 *   day's moments when he is near (`NEAR`, or the event's own) or the first
 *   time in a visit. A jump of the time (waiting, the Time setting) says
 *   nothing of what it jumped over.
 * - **On the maps**: a gold badge where an event is on now (calendar.ts
 *   `ON_NOW`, ui/minimap.ts draws it), on the mini-map and the big map.
 *
 * URL (checks): `calendar=1` the card open · `whendate=YYYY-MM-DD` the real
 * day for the real-life dates · `whenfocus=<id>:show|wait` the ring on a
 * button · `whentoast=<id>` its banner as it begins · `whenskip=<clock>` (a
 * live page, the time running) the time moved on to that clock first ·
 * `whenwait=<id>` (live) waits for it as the button does. `report()`:
 * `calendar=1` while the card is open.
 */

/** Seconds of play to land before an event when waiting for it; a far one first lands this many days before it (the festival is built meanwhile). */
const LEAD = 6;
const PREP = 0.5;
/** Longest wait for what is built late after a jump (ms). */
const BUILD_WAIT = 12_000;
/** The detection's pace (s), and the button's line (s). */
const CHECK = 0.5;
const LABEL = 1;
/** A jump of the time this big (days of the cycle) between two checks is not a crossing. */
const JUMP = 0.05;
/** Waiting for an event this near it (m), the mini-map is not told to head there. */
const HERE = 60;
/** A season's event that did not begin for this long (days of the cycle) begins its season: its banner wherever he is. */
const SEASON_GAP = 1.5;
/** A day's moment far off, said the first time in a visit: one in this many seconds at most (the dawn brings many). */
const FAR_GAP = 40;

let env: AddonEnv | null = null;
let card: CalendarCard | null = null;
let toast: CalendarToast | null = null;
let btn: HTMLButtonElement | null = null;
let btnLabel: HTMLElement | null = null;
let btnHome: 'minimap' | 'layer' | null = null;
let last: MapFrame | null = null;
/** The moment now (written from the frame: no allocation). */
const M: MapMoment = { clock: 0, day: 0, season: 0 };
/** Each event's state at the last check, the time then, how long since the last check, since the button's line. */
const was = new Map<string, boolean>();
let lastDays = NaN;
let lastHeld = true;
let since = CHECK;
let sinceLabel = LABEL;
/** Events said this visit (a day's moment says so the first time anyway); when each last began (days of the cycle). */
const said = new Set<string>();
const began = new Map<string, number>();
/** When the last far one was said (ms). */
let farSaid = -Infinity;
/** Waiting for an event: the view is faded out (null: not waiting); the one waited for (its banner as it begins, wherever he is). */
let waiting: { id: string; cancel: boolean } | null = null;
let awaited: string | null = null;
/** Each event's next time, worked out from `from` (days of the cycle) in the time's era `era` (a jump: a new era). */
const times = new Map<string, { from: number; era: number; t: EventTime }>();
let era = 0;
/** The URL's asks, done on the first frame (main.ts fills TIME after roaming is built). */
let want: { open: boolean; focus: string | null; toast: string | null; skip: number; wait: string | null } | null = null;
let today: Date | null = null;

/** The mini-map part (found once: it is added right after roaming is built). */
let mmPart: Minimap | null = null;
const minimap = (): Minimap | null => (mmPart ??= (env?.parts.find((p: MapPart) => p.name === 'minimap') as Minimap | undefined) ?? null);
const roaming = (mode: RoamMode) => mode !== 'overview' && mode !== 'leap';

/** Days of the cycle now, its fraction the clock as the frame has it (a shot's `clock=` holds the clock, not the days). */
function nowDays(): number {
  const d = TIME.days();
  if (!last) return d;
  let n = Math.floor(d) + last.clock;
  if (n - d > 0.5) n -= 1;
  else if (d - n > 0.5) n += 1;
  return n;
}

/** On now, as the map shows it (the held day's own loop while the clock stands still: `heldDay`). */
function onNow(e: CalendarEvent, held: boolean): boolean {
  if (held && e.heldDay) return e.heldDay().on;
  return e.shown ? e.shown(M) : e.on(M);
}

/** Its next time (kept until it passes, or the time jumps). */
function timeOf(e: CalendarEvent, now: number): EventTime {
  const k = times.get(e.id);
  if (k && k.era === era && now >= k.from) {
    const edge = k.t.now ? k.t.end : k.t.start;
    if (Number.isFinite(edge) ? now < edge : now - k.from < 1) return k.t;
  }
  const tt = nextOf(e, now);
  times.set(e.id, { from: now, era, t: tt });
  return tt;
}

const realToday = (): Date => today ?? new Date();

/** Where an event is, when known. */
const whereOf = (e: CalendarEvent): { x: number; z: number } | null => (e.where && Number.isFinite(e.where.x) && Number.isFinite(e.where.z) ? e.where : null);

/** The card's rows now. */
function model(): CardModel {
  const f = last!;
  const held = !TIME.cycling();
  const now = nowDays();
  const len = TIME.dayLength;
  const mm = minimap();
  const target = mm?.target;
  const nowRows: CardRow[] = [];
  const todayRows: (CardRow & { at: number })[] = [];
  const ahead: (CardRow & { at: number })[] = [];
  const seasons: (CardRow & { at: number })[] = [];
  const real = (e: CalendarEvent) => {
    const r = e.real?.(realToday());
    return r ? realWords(r, realToday()) : '';
  };
  for (const e of CALENDAR) {
    const show: CardRow['show'] = whereOf(e) ? (target?.kind === 'event' && target.id === e.id ? 'on' : 'off') : 'none';
    if (onNow(e, held)) {
      const tt = e.heldDay && held ? null : timeOf(e, now);
      let when = '';
      if (tt?.now && Number.isFinite(tt.end)) {
        const left = tt.end - now;
        when = left > 1 ? t('whenLeftDays', { n: num(Math.round(left)) }) : held ? untilWords(tt.end) : `${untilWords(tt.end)} · ${leftWords(left * len)}`;
      }
      nowRows.push({ e, when, real: real(e), muted: false, show, wait: false });
      continue;
    }
    if (held && e.heldDay) {
      const hd = e.heldDay();
      if (Number.isFinite(hd.next)) todayRows.push({ e, when: inWords(hd.next), real: '', muted: false, show, wait: false, at: -1 + hd.next / 1e6 });
      continue;
    }
    const tt = timeOf(e, now);
    const fest = e.kind === 'festival' || e.kind === 'rare';
    if (!Number.isFinite(tt.start)) {
      if (fest) ahead.push({ e, when: t('whenNoneAhead'), real: real(e), muted: true, show, wait: false, at: Infinity });
      continue;
    }
    const dd = tt.start - now;
    const soon = `${atWords(tt.start)} · ${held ? t('whenRuns') : inWords(dd * len)}`;
    if (fest) ahead.push({ e, when: dd < 1 ? soon : daysWords(dd, len, held), real: real(e), muted: held, show, wait: !held, at: dd });
    else if (dd <= 1.0001) todayRows.push({ e, when: soon, real: '', muted: held, show, wait: !held, at: dd });
    else if (e.kind === 'season') seasons.push({ e, when: daysWords(dd, len, held), real: '', muted: held, show, wait: !held, at: dd });
  }
  const order = (a: { at: number }, b: { at: number }) => a.at - b.at;
  const rank = { festival: 0, rare: 1, season: 2, daily: 3 } as const;
  nowRows.sort((a, b) => rank[a.e.kind] - rank[b.e.kind]);
  const sections: CardSection[] = [
    { key: 'now', title: 'whenNow', empty: 'whenNoneNow', rows: nowRows },
    { key: 'today', title: 'whenToday', empty: 'whenNoneToday', rows: todayRows.sort(order) },
    { key: 'ahead', title: 'whenAhead', empty: null, rows: ahead.sort(order) },
    { key: 'seasons', title: 'whenSeasons', empty: null, rows: seasons.sort(order) },
  ];
  const heldLine = held
    ? t('whenHeld', { mode: t(f.night >= 0.5 ? 'night' : 'day'), path: `${t('settings')} → ${t('tabGeneral')} → ${t('time')}: ${t('cycle')}` })
    : null;
  return { moment: momentWords(f.clock, f.season, f.day), held: heldLine, sections };
}

function openCard(on: boolean): void {
  if (!env) return;
  if (!on) {
    card?.close();
    return;
  }
  if (!last) return;
  card ??= createCalendarCard({ layer: env.layer, onShow: showOnMap, onWait: (id) => void waitFor(id), onClose: () => openCard(false), sound: env.uiSound });
  card.show(model());
}

/** Show on map: the event becomes the mini-map's target (again: none); the card shuts so the mini-map shows. */
function showOnMap(id: string): void {
  const e = eventById(id);
  const mm = minimap();
  if (!e || !mm || !whereOf(e)) return;
  const on = mm.target?.kind === 'event' && mm.target.id === id;
  mm.setTarget(on ? null : { kind: 'event', id });
  env?.uiSound(on ? 'back' : 'select');
  if (!on) openCard(false);
  else card?.update(model());
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** After a jump: two frames (the late parts are asked for), then what is built late, a few seconds at most. */
async function settle(limit: number): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  const t0 = performance.now();
  while (TIME.building() && performance.now() - t0 < limit && !waiting?.cancel) await sleep(80);
}

/** Wait for it: fade out, move the time on to just before it, let what is built late come, fade in, say so. */
async function waitFor(id: string): Promise<void> {
  const e = eventById(id);
  if (!e || !env || waiting) return;
  if (!TIME.cycling()) {
    env.hud.toast(t('whenHeld', { mode: t((last?.night ?? 0) >= 0.5 ? 'night' : 'day'), path: `${t('settings')} → ${t('tabGeneral')} → ${t('time')}: ${t('cycle')}` }));
    return;
  }
  const now = nowDays();
  const tt = nextOf(e, now);
  if (tt.now || !Number.isFinite(tt.start)) return;
  const w = { id, cancel: false };
  waiting = w;
  openCard(false);
  // (what was waiting to be said is old news once the time jumps)
  toast?.hold(true);
  toast?.clear();
  SFX.play('whenWait');
  const lead = LEAD / TIME.dayLength;
  try {
    await env.hud.fade(1, 0.6);
    if (w.cancel) return;
    if (tt.start - now > PREP + lead) {
      TIME.skipTo(tt.start - PREP);
      era++;
      await settle(BUILD_WAIT);
      if (w.cancel) return;
    }
    if (!TIME.skipTo(Math.max(nowDays(), tt.start - lead))) {
      env.hud.toast(t('whenCantWait'));
      return;
    }
    era++;
    await settle(BUILD_WAIT / 2);
    if (w.cancel) return;
    // (heading there, when it is not here: the mini-map's arrow)
    const mm = minimap();
    const at = whereOf(e);
    if (mm && at && Math.hypot(at.x - env.body.pos.x, at.z - env.body.pos.z) > HERE) mm.setTarget({ kind: 'event', id });
    awaited = id;
    say(e, true);
  } finally {
    if (waiting === w) waiting = null;
    // (back to the map meanwhile: roam.ts fades in by itself)
    if (!w.cancel) void env.hud.fade(0, 0.8);
    toast?.hold(false);
  }
}

/** Its banner (and the bell): it begins now, or (after waiting) it is about to. */
function say(e: CalendarEvent, soon = false): void {
  if (!toast) return;
  said.add(e.id);
  const line = soon ? t('whenKickSoon') : t('whenKickNow');
  // (about to begin: gone again by the time it begins, `LEAD` s later)
  toast.show(e, line, t(soon ? e.name : (e.begins ?? e.name)), e.place ? t(e.place) : '', soon ? LEAD - 1.5 : 5);
  SFX.play('whenChime', soon ? 0.7 : 1);
}

/** Every `CHECK` s: what began (a banner when it should), what is on (the maps). */
function check(mode: RoamMode): void {
  const held = !TIME.cycling();
  const now = nowDays();
  // (the time jumped — waiting, the Time setting switched, a shot — or it stands still: nothing crossed)
  const jumped = Number.isNaN(lastDays) || Math.abs(now - lastDays) > JUMP || held !== lastHeld;
  if (jumped) era++;
  lastDays = now;
  lastHeld = held;
  const p = env?.body.pos;
  let changed = false;
  const list = ON_NOW.events;
  for (const e of CALENDAR) {
    const on = onNow(e, held);
    const before = was.get(e.id);
    was.set(e.id, on);
    if (on && before === false && !jumped && roaming(mode) && (!held || e.heldDay)) {
      // (the festivals and rare moments always, and a season's first day; a day's moment, or a season's other days,
      // near him, or the first time in a visit)
      const where = whereOf(e);
      const near = !where || !p || Math.hypot(where.x - p.x, where.z - p.z) <= (e.near ?? NEAR);
      const prev = began.get(e.id);
      const firstDay = e.kind === 'season' && (prev === undefined || now - prev > SEASON_GAP);
      if (e.kind === 'festival' || e.kind === 'rare' || firstDay || near || awaited === e.id) say(e);
      else if (!said.has(e.id) && performance.now() - farSaid > FAR_GAP * 1000) {
        // (far off, the first time in a visit: one at a time, the others another day)
        farSaid = performance.now();
        say(e);
      }
      if (awaited === e.id) awaited = null;
    }
    if (on && before === false) began.set(e.id, now);
    const listed = list.includes(e);
    if (on && whereOf(e) && !listed) {
      list.push(e);
      changed = true;
    } else if ((!on || !whereOf(e)) && listed) {
      list.splice(list.indexOf(e), 1);
      changed = true;
    }
  }
  if (changed) ON_NOW.n++;
}

/** The button's line: what is on now (a festival first), else what comes next today, else "Calendar". */
function label(): void {
  if (!btn || !btnLabel || !last) return;
  const held = !TIME.cycling();
  const now = nowDays();
  let text = t('whenButton');
  let on = false;
  const rank = { festival: 0, rare: 1, season: 2, daily: 3 } as const;
  let best: CalendarEvent | null = null;
  // (on now: a festival first, then the nearest)
  let bestD = Infinity;
  const p = env?.body.pos;
  for (const e of CALENDAR) {
    if (!was.get(e.id)) continue;
    const w = whereOf(e);
    const d = w && p ? Math.hypot(w.x - p.x, w.z - p.z) : 1e9;
    if (!best || rank[e.kind] < rank[best.kind] || (rank[e.kind] === rank[best.kind] && d < bestD)) {
      best = e;
      bestD = d;
    }
  }
  if (best) {
    text = t(best.name);
    on = true;
  } else if (!held) {
    let soonest = Infinity;
    for (const e of CALENDAR) {
      if (e.kind === 'festival' || e.kind === 'rare') continue;
      // (only those already worked out: the rest are, one a frame, by `frame`)
      const k = times.get(e.id);
      if (!k || k.era !== era || k.t.now) continue;
      const dd = k.t.start - now;
      if (dd > 0 && dd < soonest) {
        soonest = dd;
        best = e;
      }
    }
    if (best && soonest <= 1) text = `${t(best.name)} · ${inWords(soonest * TIME.dayLength)}`;
  }
  if (btnLabel.textContent !== text) btnLabel.textContent = text;
  btn.classList.toggle('is-now', on);
}

/** The button under the mini-map (in its column: ui/minimap.ts `under`), else in the roaming layer's top right. */
function placeButton(): void {
  if (!env) return;
  if (!btn) {
    injectStyle();
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wh-btn mu-frame mu-sm';
    btn.innerHTML = `<span class="mu-bg"></span><span class="mu-focus"></span>${calendarSvg('wh-btn-icon')}<span class="wh-btn-t"></span><span class="wh-btn-dot" aria-hidden="true"></span><kbd>9</kbd>`;
    btnLabel = btn.querySelector('.wh-btn-t');
    btn.addEventListener('click', () => {
      btn!.blur();
      openCard(!card?.open);
    });
    const words = () => {
      btn!.setAttribute('aria-label', t('whenOpenAria'));
      btn!.title = t('whenOpenAria');
    };
    words();
    onLang(() => {
      words();
      label();
    });
  }
  const mm = minimap();
  const home = mm?.under ? 'minimap' : 'layer';
  if (home === btnHome) return;
  btnHome = home;
  (mm?.under ?? env.layer).append(btn);
  btn.classList.toggle('is-loose', home === 'layer');
}

registerAddon({
  id: 'calendar',
  init(e) {
    env = e;
    toast = createCalendarToast(e.layer);
    const q = e.params;
    const d = q.get('whendate');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, dd] = d.split('-').map(Number);
      today = new Date(y, m - 1, dd, 12);
    }
  },
  input(ctx, mode, tap) {
    if (waiting) return true;
    if (!env) return false;
    if (tap('Digit9', 'Numpad9') && !env.photo.kind && !env.photo.albumOpen && roaming(mode)) openCard(!card?.open);
    if (!card?.open) return false;
    // (a push of the stick or W A S D walks away: the card shuts)
    if (Math.hypot(ctx.input.move.x, ctx.input.move.y) > 0.5) {
      openCard(false);
      return false;
    }
    return true;
  },
  frame(f, mode) {
    last = f;
    M.clock = f.clock;
    M.day = f.day;
    M.season = f.season;
    toast?.update(f.dt);
    placeButton();
    if (want) {
      const w = want;
      want = null;
      if (w.skip >= 0 && TIME.cycling()) {
        const now = TIME.days();
        let to = Math.floor(now) + w.skip;
        if (to <= now) to += 1;
        TIME.skipTo(to);
      }
      check(mode);
      if (w.open && roaming(mode)) {
        openCard(true);
        if (w.focus) {
          const [id, act] = w.focus.split(':');
          card?.focus(id, act === 'wait' ? 'wait' : 'show');
        }
      }
      if (w.toast) {
        const e = eventById(w.toast);
        if (e) say(e);
      }
      if (w.wait) void waitFor(w.wait);
    }
    since += f.dt;
    sinceLabel += f.dt;
    if (since >= CHECK || env?.shot) {
      since = 0;
      check(mode);
      if (card?.open) card.update(model());
    }
    // (the next times, one event a frame, so the button's line has them without a long first frame)
    if (!card?.open && roaming(mode)) {
      const now = nowDays();
      for (const e of CALENDAR) {
        const k = times.get(e.id);
        if ((k && k.era === era) || (e.kind !== 'daily' && e.kind !== 'season')) continue;
        timeOf(e, now);
        break;
      }
    }
    if (sinceLabel >= LABEL || env?.shot) {
      sinceLabel = 0;
      label();
    }
    if (card?.open && (minimap()?.bigOpen || !roaming(mode))) openCard(false);
  },
  setMode(next) {
    if (next === 'overview') {
      openCard(false);
      if (waiting) waiting.cancel = true;
    }
  },
  fromUrl(q) {
    want = {
      open: q.get('calendar') === '1',
      focus: q.get('whenfocus'),
      toast: q.get('whentoast'),
      skip: q.has('whenskip') ? ((Number(q.get('whenskip')) % 1) + 1) % 1 : -1,
      wait: q.get('whenwait'),
    };
  },
  report() {
    return card?.open ? { calendar: '1' } : null;
  },
});

// (checks: the state, and the same steps as the buttons, for a live page's script)
if (typeof window !== 'undefined')
  Object.assign(window, {
    __calendar: {
      get open() {
        return !!card?.open;
      },
      get waiting() {
        return waiting?.id ?? null;
      },
      get onNow() {
        return ON_NOW.events.map((e) => e.id);
      },
      days: () => nowDays(),
      next: (id: string) => {
        const e = eventById(id);
        return e ? nextOf(e, nowDays()) : null;
      },
      toggle: (on = true) => openCard(on),
      wait: (id: string) => waitFor(id),
      show: (id: string) => showOnMap(id),
    },
  });

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    /* The calendar's button: under the mini-map (its column), its line what is on or comes next. */
    .wh-btn { position: relative; display: flex; align-items: center; gap: calc(7 * var(--px)); max-width: calc(204 * var(--px)); padding: calc(5 * var(--px)) calc(8 * var(--px)) calc(5 * var(--px)) calc(7 * var(--px));
      border: 0; background: none; cursor: pointer; pointer-events: auto; outline: none; touch-action: manipulation; color: var(--mu-ink2);
      font: 700 calc(12.5 * var(--px)) / 1.2 var(--mu-font); --mu-edge: color-mix(in srgb, rgba(255, 226, 180, 0.3), rgba(180, 204, 255, 0.28) var(--mu-night)); }
    .wh-btn > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.62), rgba(4, 15, 32, 0.62) var(--mu-night)); }
    .wh-btn-icon { flex: none; width: calc(19 * var(--px)); height: auto; filter: drop-shadow(0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .wh-btn-t { min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; text-align: left; }
    .wh-btn kbd { flex: none; display: inline-grid; place-items: center; min-width: calc(17 * var(--px)); height: calc(17 * var(--px)); padding: 0 calc(4 * var(--px)); box-sizing: border-box;
      font: 600 calc(10.5 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink2); background: rgba(255, 244, 222, 0.1); border: 1px solid var(--mu-line-hi); border-bottom-width: 2px;
      border-radius: calc(3 * var(--px)); }
    .wh-btn-dot { display: none; flex: none; width: calc(7 * var(--px)); height: calc(7 * var(--px)); border-radius: 50%; background: #ffd54a; box-shadow: 0 0 calc(6 * var(--px)) rgba(255, 190, 60, 0.9);
      animation: wh-dot 2.4s ease-in-out infinite; }
    .wh-btn.is-now { color: var(--mu-gold-hi); --mu-edge: rgba(255, 208, 112, 0.7); }
    .wh-btn.is-now .wh-btn-dot { display: block; }
    .wh-btn:hover, .wh-btn:focus-visible { color: var(--mu-ink); --mu-edge: var(--mu-line-hi); }
    .wh-btn.is-now:hover { color: var(--mu-gold-hi); --mu-edge: var(--mu-gold-hi); }
    @keyframes wh-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    .mu-calm ~ .rh .wh-btn-dot, .mu-calm ~ .mm .wh-btn-dot { animation: none; }
    :lang(km) .wh-btn { font-size: calc(13.5 * var(--px)); line-height: 1.35; }
    body.roam-touch .wh-btn kbd, body.pad-on .wh-btn kbd { display: none; }
    /* (no mini-map part: in the roaming layer's top right, while roaming) */
    .rh > .wh-btn.is-loose { position: absolute; right: calc(22 * var(--px)); top: calc(80 * var(--px)); opacity: 0; visibility: hidden; }
    .rh.is-roam > .wh-btn.is-loose { opacity: 1; visibility: visible; }
    body.photo-mode .wh-btn, body.selfie-mode .wh-btn { display: none; }`;
  document.head.append(style);
}
