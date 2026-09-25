import { Group } from 'three';
import type { HeightField } from '../heightfield';
import { PLACES, type PlaceDef } from '../layout';
import type { LaunchSpot } from '../roam/launchSpots';
import type { MapRoam } from '../roam/roam';
import { RAMP } from '../roam/_launchRamp';
import { ROAM_AREA } from '../terrain/views';
import type { MapFrame, MapPart, PlaceId, RoamMode, UISound } from '../types';
import { ICON } from './icons';
import { num, onLang, placeText, t, type WordKey } from './lang';
import { steppedRing, steppedShape } from './shape';
import { ARROW_PATH, ARROW_SVG, BEACON_PATH, BOAT_PATH, RIM_PATH, rampSprite, templeSprite, templeSvg, TEMPLE_SIZE, wingSvg } from './_minimapArt';
import { LandBuilder, MIST, type LandPicture } from './_minimapLand';

/**
 * The mini-map while roaming, and the big map (M).
 *
 * - Mini-map (top right, under the mute and gear buttons): the land round
 *   the explorer, turning with the view (the top is where the camera looks,
 *   an "N" (ជ) on the rim shows north), the six temples, the hang glider ramps
 *   (a glider on a round badge; while he walks, a soft ring pings round the
 *   nearest), the explorer's arrow and view, the boat when he paddles. With
 *   a target: a gold arrow on the rim points the way while it is off the
 *   mini-map, a gold beacon (a ramp: its badge turns gold) when it is on
 *   it, and the distance under the map ("Angkor Wat · 240 m"). Reaching
 *   the target clears it ("You have arrived"): a place's beacon, a ramp's
 *   deck (where the walker offers "E  Fly the hang glider").
 * - Big map (M, or a click / tap on the mini-map): the whole roaming area,
 *   north up, the places by name, the ramps, "You are here"; a click on a
 *   place or a ramp sets or clears the target (a ramp's distance shows on
 *   hover). While it is open the roaming keys are held back (keydown in the
 *   capture phase); M, Esc or the close button shut it.
 * - N, or "Nearest glider ramp" on the big map: the nearest ramp (not the
 *   one he stands on) becomes the target, and a banner says how far it is.
 *
 * Words: lang.ts (`data-t` / `data-t-aria` name the word an element shows;
 * `fillWords` fills them in the language).
 *
 * The land is a picture made once (_minimapLand.ts) the first time roaming
 * starts; each redraw (30 a second at most, only while shown) only draws
 * part of it turned round the explorer, and a few markers.
 *
 * URL: `bigmap=1` opens the big map (roaming) · `target=<place id>` sets a
 * place as the target, `target=ramp:<i>` a ramp (`roam.launchSpots[i]`),
 * `target=ramp` the nearest one (as N does, with its banner).
 */
export interface MinimapDeps {
  /** The picker's root (`#ui`): the maps follow its size (`--u`) and time of day (`--mu-n`); hidden with `ui=0`. */
  root: HTMLElement;
  field: HeightField;
  /** The built parts: the temples, the road and the jungle are drawn from their blocks. */
  parts: readonly MapPart[];
  roam: MapRoam;
  sound?(s: UISound): void;
}

/** Where the mini-map shows the way to: a place (its beacon) or a hang glider ramp (the back of its deck, where he steps on). */
export type MapTarget = { kind: 'place'; id: PlaceId } | { kind: 'ramp'; spot: LaunchSpot };

export interface Minimap extends MapPart {
  /** Where to head for (null: nowhere). */
  readonly target: MapTarget | null;
  setTarget(to: MapTarget | null): void;
  /** Head for the nearest ramp and say how far it is (N). */
  findRamp(): void;
  /** The big map is open. */
  readonly bigOpen: boolean;
  openBig(on: boolean): void;
}

/** Metres across the mini-map, per mode (high up under the parachute: further). */
const SPAN: Record<RoamMode, number> = { overview: 240, leap: 420, glide: 420, walk: 240, boat: 300, hang: 520 };
/** The big map's area: the roaming area and a margin (m). */
const BIG = { x0: ROAM_AREA.x0 - 30, x1: ROAM_AREA.x1 + 30, z0: ROAM_AREA.z0 - 30, z1: ROAM_AREA.z1 + 10 };
const BIG_W = BIG.x1 - BIG.x0;
const BIG_H = BIG.z1 - BIG.z0;
/** Mini-map redraws a second, at most. */
const FPS = 30;
/** CSS size of the mini-map's face at `--u` = 1 (the overlays scale with it). */
const FACE = 190;
/** The canvas reaches this far past the face on every side (the "N" sits on the face's edge). */
const BEZEL = 7;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
/** A distance in the language: "240 m", "១.២ គ.ម" (as the roaming pins, ui.ts). */
const distText = (d: number) => (d < 1000 ? `${num(Math.max(10, Math.round(d / 10) * 10))} ${t('m')}` : `${num((d / 1000).toFixed(1))} ${t('km')}`);
const mix = (a: number, b: number, t: number) => {
  const c = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
};

export function createMinimap(d: MinimapDeps): Minimap {
  injectStyle();
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') === '1';
  const { roam } = d;
  const off = d.root.style.display === 'none';
  const placeIds = PLACES.map((p) => p.id);
  const asPlace = (v: string | null) => (placeIds.includes(v as PlaceId) ? (v as PlaceId) : null);
  const placeById = (id: PlaceId) => PLACES.find((p) => p.id === id)!;
  /** The hang glider ramps (launchSpots.ts), read as they are: others may add more. */
  const ramps = roam.launchSpots;

  // ── Mini-map and the banner (arrived; the nearest ramp) ─────────────────
  const wrap = el('div', 'map-ui mm');
  wrap.innerHTML = `
    <button type="button" class="mm-mini mu-frame" data-t-aria="mmOpen">
      <span class="mu-bg"></span>
      <span class="mm-face"><canvas class="mm-canvas"></canvas></span>
      <span class="mm-cap">
        <span class="mm-cap-to">${ICON.pin}<b></b><em></em></span>
        <span class="mm-cap-map"><kbd>M</kbd><span data-t="map"></span></span>
        ${ramps.length ? '<span class="mm-cap-ramp"><kbd>N</kbd><span data-t="mmRamp"></span></span>' : ''}
      </span>
      <span class="mm-tip" aria-hidden="true"></span>
    </button>
    <div class="mm-toast mu-frame mu-sm" role="status">
      <span class="mu-bg"></span><span class="mu-glow"></span>${templeSvg('mm-toast-icon')}${wingSvg('mm-toast-wing')}
      <span class="mm-toast-text"><em></em><b></b></span>
    </div>`;

  // ── Big map ──────────────────────────────────────────────────────────────
  const bigWrap = el('div', 'map-ui mm-bigwrap');
  // (under the places: a temple's name stays on top where they meet)
  const rampButtons = ramps
    .map(
      (s, i) => `<button type="button" class="mm-ramp" data-i="${i}" style="left:${pct(s.x - BIG.x0, BIG_W)};top:${pct(s.z - BIG.z0, BIG_H)}">
      <span class="mm-ramp-badge">${wingSvg('mm-ramp-icon')}</span><span class="mm-place-label"><b data-t="mmRamp"></b><em></em></span></button>`,
    )
    .join('');
  const placeButtons = PLACES.map(
    (p) => `<button type="button" class="mm-place" data-id="${p.id}" style="left:${pct(p.x - BIG.x0, BIG_W)};top:${pct(p.z - BIG.z0, BIG_H)}">
      ${templeSvg('mm-place-icon')}<span class="mm-place-label"><b></b><em></em></span></button>
      <span class="mm-beacon" data-id="${p.id}" style="left:${pct(p.anchor[0] - BIG.x0, BIG_W)};top:${pct(p.anchor[2] - BIG.z0, BIG_H)}"></span>`,
  ).join('');
  bigWrap.innerHTML = `
    <div class="mm-shade"></div>
    <section class="mm-big mu-frame mu-lg" role="dialog" aria-modal="true" aria-labelledby="mm-big-title" tabindex="-1">
      <span class="mu-bg"></span>
      <header class="mm-head">
        <span class="mm-head-icon">${ICON.temple}</span>
        <div class="mm-head-text"><h2 id="mm-big-title" data-t="mmTitle"></h2><p data-t="mmSub"></p></div>
        <button type="button" class="mm-find mu-frame mu-sm" data-t-aria="mmNearest"${ramps.length ? '' : ' hidden'}><span class="mu-bg"></span><span class="mu-glow"></span>${wingSvg('mm-find-icon')}<span class="mm-find-text" data-t="mmNearest"></span><kbd>N</kbd></button>
        <button type="button" class="mm-x mu-frame mu-sm" data-t-aria="mmClose"><span class="mu-bg"></span>${ICON.close}<kbd>M</kbd></button>
      </header>
      <div class="mm-view">
        <canvas class="mm-land"></canvas>
        <div class="mm-marks">
          ${rampButtons}${placeButtons}
          <div class="mm-you"><span class="mm-you-ring"></span><span class="mm-you-arrow">${ARROW_SVG}</span><span class="mm-you-label" data-t="mmHere"></span></div>
        </div>
        <div class="mm-compass" aria-hidden="true"><svg viewBox="-12 -12 24 24"><path d="M0 -11.5L3 -7.5H-3Z" fill="#ffe07c"/></svg><b data-t="mmNorth"></b></div>
        <div class="mm-scale" aria-hidden="true"><span></span><em></em></div>
      </div>
      <footer class="mm-foot">
        <span class="mm-legend" aria-hidden="true">
          <span>${templeSvg('mm-legend-temple')}<span data-t="mmTemple"></span></span>
          ${ramps.length ? `<span>${wingSvg('mm-legend-wing')}<span data-t="mmRamp"></span></span>` : ''}
          <span><i class="mm-sw-road"></i><span data-t="mmRoad"></span></span>
          <span><i class="mm-sw-river"></i><span data-t="mmRiver"></span></span>
          <span><i class="mm-sw-you">${ARROW_SVG}</i><span data-t="mmYou"></span></span>
        </span>
        <span class="mm-status" aria-live="polite"></span>
      </footer>
    </section>`;

  for (const w of [wrap, bigWrap]) {
    if (shot) w.classList.add('mu-shot');
    if (off) w.style.display = 'none';
    w.style.setProperty('--mu-shape-sm', steppedShape(8, 4));
    w.style.setProperty('--mu-ring-sm', steppedRing(8, 4, 1.25));
    w.style.setProperty('--mu-shape-lg', steppedShape(12, 4));
    w.style.setProperty('--mu-ring-lg', steppedRing(12, 4, 1.5));
    w.style.setProperty('--mm-shape', steppedShape(12, 4));
    w.style.setProperty('--mm-ring', steppedRing(12, 4, 1.5));
    w.style.setProperty('--mm-face', steppedShape(8, 4));
    w.style.setProperty('--mm-tag', steppedShape(4, 2));
  }
  bigWrap.style.setProperty('--mm-aspect', (BIG_W / BIG_H).toFixed(4));
  d.root.after(wrap, bigWrap);

  const q = <T extends Element>(root: Element, s: string) => root.querySelector<T & HTMLElement>(s)! as T & HTMLElement;
  const mini = q<HTMLButtonElement>(wrap, '.mm-mini');
  const canvas = q<HTMLCanvasElement>(wrap, '.mm-canvas');
  const g = canvas.getContext('2d')!;
  const capName = q(wrap, '.mm-cap-to b');
  const capDist = q(wrap, '.mm-cap-to em');
  const tip = q(wrap, '.mm-tip');
  const toastEl = q(wrap, '.mm-toast');
  const toastLine = q(wrap, '.mm-toast-text em');
  const toastName = q(wrap, '.mm-toast-text b');
  const big = q(bigWrap, '.mm-big');
  const view = q(bigWrap, '.mm-view');
  const landCanvas = q<HTMLCanvasElement>(bigWrap, '.mm-land');
  const g2 = landCanvas.getContext('2d')!;
  const you = q(bigWrap, '.mm-you');
  const scaleBar = q(bigWrap, '.mm-scale span');
  const scaleText = q(bigWrap, '.mm-scale em');
  const status = q(bigWrap, '.mm-status');
  const buttons = new Map<PlaceId, HTMLButtonElement>();
  for (const b of bigWrap.querySelectorAll<HTMLButtonElement>('.mm-place')) buttons.set(b.dataset.id as PlaceId, b);
  const beacons = new Map<PlaceId, HTMLElement>();
  for (const b of bigWrap.querySelectorAll<HTMLElement>('.mm-beacon')) beacons.set(b.dataset.id as PlaceId, b);
  const rampEls = [...bigWrap.querySelectorAll<HTMLButtonElement>('.mm-ramp')];
  const rampEms = rampEls.map((b) => b.querySelector('em')!);

  // ── State ────────────────────────────────────────────────────────────────
  let target: MapTarget | null = null;
  /** The target's place (null: a ramp), its ramp (−1: a place), and where it is (m). */
  let targetPlace: PlaceDef | null = null;
  let targetRamp = -1;
  let tx = 0;
  let tz = 0;
  /** Each ramp's tag on the big map, as last written. */
  const tagText = ramps.map(() => '');
  let north = 'N';
  let land: LandPicture | null = null;
  let landFailed = false;
  let builder: LandBuilder | null = null;
  let shown = false;
  let bigOpen = false;
  let span = SPAN.walk;
  let acc = 1;
  let night = 0;
  let toastLeft = 0;
  let u = '';
  let n = '';
  /** Distance shown (m, rounded as shown), and the big map's status line. */
  let shownDist = -1;
  let statusText = '';
  // Mini-map canvas: CSS and device px (the face is `face` device px inside it), device px per
  // overlay unit, and the face's outline, vignette, sprites and view cone for that size.
  let cssSize = 0;
  let size = 0;
  let face = 0;
  let facePath: Path2D | null = null;
  let vignette: CanvasGradient | null = null;
  let ks = 1;
  let sprite: HTMLCanvasElement | null = null;
  let spriteGold: HTMLCanvasElement | null = null;
  let rampSpr: HTMLCanvasElement | null = null;
  let rampGold: HTMLCanvasElement | null = null;
  let cone: CanvasGradient | null = null;
  let bg = '';
  let bgNight = -1;
  // Big map: drawn at this night value; "you are here" where last put.
  let bigNight = -1;
  let youX = NaN;
  let youY = NaN;
  let youR = NaN;
  /** Where each temple, then each ramp, was drawn on the mini-map (CSS px; NaN = off it), for the hover names. */
  const iconX = new Float32Array(PLACES.length + ramps.length).fill(NaN);
  const iconY = new Float32Array(PLACES.length + ramps.length).fill(NaN);
  const arrowPath = new Path2D(ARROW_PATH);
  const boatPath = new Path2D(BOAT_PATH);
  const rimPath = new Path2D(RIM_PATH);
  const beaconPath = new Path2D(BEACON_PATH);

  /** Make the land picture, working about `ms` now (Infinity: all of it); it is ready once it returns it. */
  function makeLand(ms: number): LandPicture | null {
    if (land || landFailed) return land;
    try {
      builder ??= new LandBuilder(d.field, d.parts);
      land = builder.step(ms);
      if (land) {
        builder = null;
        console.info(`[map] minimap: land ${land.w}×${land.h} m in ${land.ms} ms (${land.blocks} blocks drawn)`);
      }
    } catch (e) {
      landFailed = true;
      builder = null;
      console.error('[map] minimap land failed:', e);
    }
    return land;
  }

  /** Part of the land picture (texels from sx, sz, sw × sh) at dx, dz (dw × dh), in the light of the time of day. */
  function drawLand(c2: CanvasRenderingContext2D, L: LandPicture, sx: number, sz: number, sw: number, sh: number, dx: number, dz: number, dw: number, dh: number, ms: number): void {
    const moon = night > 0.01 ? (L.night ?? (L.moonlight(ms) ? L.night : null)) : null;
    if (night < 0.99 || !moon) c2.drawImage(L.day, sx, sz, sw, sh, dx, dz, dw, dh);
    if (moon) {
      c2.globalAlpha = night < 0.99 ? night : 1;
      c2.drawImage(moon, sx, sz, sw, sh, dx, dz, dw, dh);
      c2.globalAlpha = 1;
    } else if (night > 0.01) {
      // (the moonlit picture is still being made: the day one, dimmed)
      c2.globalAlpha = night * 0.75;
      c2.fillStyle = '#0b1426';
      c2.fillRect(dx, dz, dw, dh);
      c2.globalAlpha = 1;
    }
  }

  // ── Sizes (the face follows --u; the canvas its CSS size × the pixel ratio) ─
  function resize(): void {
    const css = canvas.clientWidth;
    if (!css) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const s = Math.round(css * dpr);
    cssSize = css;
    if (s === size) return;
    size = canvas.width = canvas.height = s;
    face = (s * FACE) / (FACE + 2 * BEZEL);
    ks = face / FACE;
    const k = Math.max(1, Math.round(ks * 1.3));
    sprite = templeSprite(k);
    spriteGold = templeSprite(k, true);
    // (the glider is wider than a temple: a little smaller, about as big on its badge)
    const kr = Math.max(1, Math.round(ks));
    rampSpr = rampSprite(kr);
    rampGold = rampSprite(kr, true);
    const c = s / 2;
    facePath = steppedPath(c - face / 2, face, 8 * dpr, 4);
    vignette = g.createRadialGradient(c, c, face * 0.3, c, c, face * 0.74);
    vignette.addColorStop(0, 'rgba(4, 8, 16, 0)');
    vignette.addColorStop(1, 'rgba(4, 8, 16, 0.5)');
    cone = g.createLinearGradient(c, c, c, c - face * 0.44);
    cone.addColorStop(0, 'rgba(255, 244, 222, 0.42)');
    cone.addColorStop(1, 'rgba(255, 244, 222, 0)');
    g.font = `700 ${Math.round(11 * ks)}px 'Pixelify Sans', 'Kantumruy Pro', 'Nunito Sans', sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'low';
    g.lineJoin = 'round';
    acc = 1;
  }
  new ResizeObserver(resize).observe(canvas);
  /** Size the big map's canvas to its box (true when it changed). */
  function sizeBig(): boolean {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(view.clientWidth * dpr);
    const h = Math.round(view.clientHeight * dpr);
    if (!w || !h || (w === landCanvas.width && h === landCanvas.height)) return false;
    landCanvas.width = w;
    landCanvas.height = h;
    scaleBar.style.width = `${((100 / BIG_W) * view.clientWidth).toFixed(1)}px`;
    return true;
  }
  new ResizeObserver(() => {
    if (!sizeBig() || !bigOpen) return;
    drawBig();
    placeLabels();
  }).observe(view);

  // ── Target ───────────────────────────────────────────────────────────────
  function setTarget(to: MapTarget | null): void {
    targetPlace = to?.kind === 'place' ? (PLACES.find((p) => p.id === to.id) ?? null) : null;
    targetRamp = to?.kind === 'ramp' ? ramps.indexOf(to.spot) : -1;
    target = targetPlace || targetRamp >= 0 ? to : null;
    if (targetPlace) [tx, , tz] = targetPlace.anchor;
    else if (targetRamp >= 0) ({ x: tx, z: tz } = ramps[targetRamp]);
    wrap.classList.toggle('has-target', !!target);
    for (const [pid, b] of buttons) {
      const on = pid === targetPlace?.id;
      b.classList.toggle('is-target', on);
      b.setAttribute('aria-pressed', String(on));
      beacons.get(pid)!.classList.toggle('is-on', on);
      b.querySelector('em')!.textContent = '';
    }
    rampEls.forEach((b, i) => {
      b.classList.toggle('is-target', i === targetRamp);
      b.setAttribute('aria-pressed', String(i === targetRamp));
    });
    targetWords();
    if (bigOpen) {
      writeRampTags();
      // (the target's name is a line taller)
      placeLabels();
    }
    acc = 1;
  }

  /** The target's name in the language (a ramp: "Glider ramp"). */
  const targetName = () => (targetPlace ? placeText(targetPlace).name : targetRamp >= 0 ? t('mmRamp') : '');

  /** The words that name the target: under the mini-map, the buttons' labels for screen readers, the distance. */
  function targetWords(): void {
    capName.textContent = targetName();
    for (const [pid, b] of buttons) {
      const name = placeText(placeById(pid)).name;
      b.setAttribute('aria-label', pid === targetPlace?.id ? t('mmIsTarget', { name }) : t('mmHeadFor', { name }));
    }
    rampEls.forEach((b, i) => b.setAttribute('aria-label', i === targetRamp ? t('mmIsTarget', { name: t('mmRamp') }) : t('mmHeadFor', { name: t('mmTheRamp') })));
    shownDist = -1;
    updateDistance();
  }

  function setStatus(text: string): void {
    if (text !== statusText) status.textContent = statusText = text;
  }
  /** The distance to the target, under the mini-map and on the big map (written only when it changes). */
  function updateDistance(): void {
    if (!target) {
      setStatus(t('mmPick'));
      return;
    }
    const p = roam.body.pos;
    const m = Math.hypot(tx - p.x, tz - p.z);
    const shown = m < 1000 ? Math.max(10, Math.round(m / 10) * 10) : Math.round(m / 100) * 100;
    if (shown === shownDist) return;
    shownDist = shown;
    const text = distText(shown);
    capDist.textContent = text;
    if (targetPlace) buttons.get(targetPlace.id)!.querySelector('em')!.textContent = `${t('mmTarget')} · ${text}`;
    setStatus(t('mmHeading', { name: targetPlace ? placeText(targetPlace).name : t('mmTheRamp'), d: text }));
  }

  /** He stands on (or at the back of) this ramp. */
  function onRamp(s: LaunchSpot): boolean {
    const p = roam.body.pos;
    return Math.hypot(s.x - p.x, s.z - p.z) < RAMP.length + 4 && !!roam.world.launchNear?.(p.x, p.z, p.y);
  }
  /** The ramp nearest him, not counting the one he stands on (−1: none). */
  function nearestRamp(): number {
    const p = roam.body.pos;
    let best = -1;
    let bestM = Infinity;
    ramps.forEach((s, i) => {
      const m = Math.hypot(s.x - p.x, s.z - p.z);
      if (m < bestM && !onRamp(s)) {
        best = i;
        bestM = m;
      }
    });
    return best;
  }

  /** The banner at the top centre: a small line over a big one (a name, or a distance: `dist`), by the temple or the glider. */
  function toast(ramp: boolean, line: string, name: string, dist = false): void {
    toastEl.classList.toggle('is-ramp', ramp);
    toastLine.textContent = line;
    toastName.textContent = name;
    toastName.classList.toggle('is-dist', dist);
    toastEl.classList.add('is-on');
    toastLeft = 3.4;
  }

  /** At the target (a place's beacon, a ramp's deck): clear it and say so. */
  function checkArrival(): void {
    if (!target) return;
    const p = roam.body.pos;
    if (targetPlace ? roam.world.placeNear(p.x, p.z, p.y)?.id !== targetPlace.id : !onRamp(ramps[targetRamp])) return;
    toast(!targetPlace, t('mmArrived'), targetName());
    d.sound?.('select');
    setTarget(null);
  }

  /** N: head for the nearest ramp, and say how far it is (on the big map, its status line says it). */
  function findRamp(): void {
    const i = nearestRamp();
    if (i < 0) return;
    const s = ramps[i];
    setTarget({ kind: 'ramp', spot: s });
    if (!bigOpen) toast(true, t('mmNearest'), distText(Math.hypot(s.x - roam.body.pos.x, s.z - roam.body.pos.z)), true);
    d.sound?.('select');
  }

  /** The ramps' tags on the big map: the target's and the nearest one's distance (the others show theirs on hover); written only when they change. */
  function writeRampTags(): void {
    const p = roam.body.pos;
    const near = nearestRamp();
    let moved = false;
    ramps.forEach((s, i) => {
      const dist = distText(Math.hypot(s.x - p.x, s.z - p.z));
      const text = i === targetRamp ? `${t('mmTarget')} · ${dist}` : i === near ? `${t('mmNear')} · ${dist}` : dist;
      if (rampEls[i].classList.contains('is-near') !== (i === near)) {
        rampEls[i].classList.toggle('is-near', i === near);
        moved = true;
      }
      if (text !== tagText[i]) {
        rampEms[i].textContent = tagText[i] = text;
        moved = true;
      }
    });
    if (moved) placeLabels();
  }

  /**
   * Names on the big map go over their icon where under it they would
   * cover something: a temple's name a ramp's badge, then a ramp's name a
   * temple or a temple's name (and none goes under "You are here").
   */
  function placeLabels(): void {
    const rectsOf = (sel: string) => [...bigWrap.querySelectorAll(sel)].map((e) => e.getBoundingClientRect());
    /** Its name over it (`is-up`) if under it hits one of `rects` and over it does not. */
    const flip = (b: HTMLElement, rects: DOMRect[]) => {
      const label = b.querySelector('.mm-place-label')!;
      const hits = () => {
        const r = label.getBoundingClientRect();
        return rects.some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top);
      };
      b.classList.remove('is-up');
      if (!hits()) return;
      b.classList.add('is-up');
      if (hits()) b.classList.remove('is-up');
    };
    const you = rectsOf('.mm-you-label');
    const badges = [...rectsOf('.mm-ramp-badge'), ...you];
    for (const b of buttons.values()) flip(b, badges);
    const temples = [...rectsOf('.mm-place-icon, .mm-place .mm-place-label'), ...you];
    for (const b of rampEls) flip(b, temples);
  }

  // ── Big map ──────────────────────────────────────────────────────────────
  function openBig(on: boolean): void {
    if (on && (!shown || bigOpen)) return;
    if (!on && !bigOpen) return;
    bigOpen = on;
    bigWrap.classList.toggle('is-open', on);
    d.sound?.(on ? 'open' : 'close');
    if (on) {
      makeLand(Infinity);
      sizeBig();
      bigNight = -1;
      youX = youY = youR = NaN;
      updateDistance();
      writeRampTags();
      // (where he is first: the names keep clear of it)
      placeYou();
      placeLabels();
      drawBig();
      if (!shot) big.focus({ preventScroll: true });
    } else {
      (document.activeElement as HTMLElement | null)?.blur?.();
      acc = 1;
    }
  }

  /** The land on the big map, north up, with a faint 100 m grid. */
  function drawBig(): void {
    const w = landCanvas.width;
    const h = landCanvas.height;
    if (!w || !h) return;
    bigNight = night;
    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.globalAlpha = 1;
    g2.fillStyle = mix(MIST.day, MIST.night, night);
    g2.fillRect(0, 0, w, h);
    const L = land;
    const sc = w / BIG_W;
    if (L) {
      g2.imageSmoothingEnabled = true;
      g2.imageSmoothingQuality = 'high';
      const sx0 = Math.max(0, Math.floor((BIG.x0 - L.x0) / L.res));
      const sz0 = Math.max(0, Math.floor((BIG.z0 - L.z0) / L.res));
      const sx1 = Math.min(L.w, Math.ceil((BIG.x1 - L.x0) / L.res));
      const sz1 = Math.min(L.h, Math.ceil((BIG.z1 - L.z0) / L.res));
      const dx = (L.x0 + sx0 * L.res - BIG.x0) * sc;
      const dz = (L.z0 + sz0 * L.res - BIG.z0) * sc;
      const dw = (sx1 - sx0) * L.res * sc;
      const dh = (sz1 - sz0) * L.res * sc;
      drawLand(g2, L, sx0, sz0, sx1 - sx0, sz1 - sz0, dx, dz, dw, dh, Infinity);
    }
    g2.strokeStyle = night > 0.5 ? 'rgba(190, 210, 255, 0.07)' : 'rgba(255, 240, 210, 0.09)';
    g2.lineWidth = Math.max(1, w / 900);
    g2.beginPath();
    for (let x = Math.ceil(BIG.x0 / 100) * 100; x < BIG.x1; x += 100) {
      const X = Math.round((x - BIG.x0) * sc) + 0.5;
      g2.moveTo(X, 0);
      g2.lineTo(X, h);
    }
    for (let z = Math.ceil(BIG.z0 / 100) * 100; z < BIG.z1; z += 100) {
      const Z = Math.round((z - BIG.z0) * sc) + 0.5;
      g2.moveTo(0, Z);
      g2.lineTo(w, Z);
    }
    g2.stroke();
  }

  /** "You are here" on the big map (moved only when it changed). */
  function placeYou(): void {
    const p = roam.body.pos;
    const x = Math.min(100, Math.max(0, ((p.x - BIG.x0) / BIG_W) * 100));
    const y = Math.min(100, Math.max(0, ((p.z - BIG.z0) / BIG_H) * 100));
    const r = ((Math.PI - roam.body.yaw) * 180) / Math.PI;
    if (!(Math.abs(x - youX) <= 0.02 && Math.abs(y - youY) <= 0.02)) {
      youX = x;
      youY = y;
      you.style.left = `${x.toFixed(2)}%`;
      you.style.top = `${y.toFixed(2)}%`;
    }
    if (!(Math.abs(r - youR) < 0.5)) {
      youR = r;
      you.style.setProperty('--r', `${r.toFixed(1)}deg`);
    }
  }

  // ── Mini-map drawing ─────────────────────────────────────────────────────
  function drawMini(t: number, aspect: number): void {
    // (shots draw before the resize observer has run)
    if (!size) resize();
    if (!size || !sprite || !spriteGold || !rampSpr || !rampGold || !cone || !facePath || !vignette) return;
    const S = size;
    const C = S / 2;
    /** Half the face (device px). */
    const F = face / 2;
    const p = roam.body.pos;
    const cy = roam.cam.yaw;
    const sc = face / span;
    const cs = Math.cos(cy);
    const sn = Math.sin(cy);
    // Map (dx, dz) from the explorer → face: the camera's forward is up.
    const a = -cs * sc;
    const b = -sn * sc;
    const c = sn * sc;
    const e = -cs * sc;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.clearRect(0, 0, S, S);
    g.save();
    g.clip(facePath);
    if (Math.abs(night - bgNight) > 0.01) {
      bgNight = night;
      bg = mix(MIST.day, MIST.night, night);
    }
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);

    // The land round him (only the part that can show: the face's diagonal).
    const L = land;
    if (L) {
      const R = span * 0.72;
      const sx0 = Math.max(0, Math.floor((p.x - R - L.x0) / L.res));
      const sz0 = Math.max(0, Math.floor((p.z - R - L.z0) / L.res));
      const sx1 = Math.min(L.w, Math.ceil((p.x + R - L.x0) / L.res));
      const sz1 = Math.min(L.h, Math.ceil((p.z + R - L.z0) / L.res));
      if (sx1 > sx0 && sz1 > sz0) {
        g.setTransform(a, b, c, e, C, C);
        const dx = L.x0 + sx0 * L.res - p.x;
        const dz = L.z0 + sz0 * L.res - p.z;
        const dw = (sx1 - sx0) * L.res;
        const dh = (sz1 - sz0) * L.res;
        drawLand(g, L, sx0, sz0, sx1 - sx0, sz1 - sz0, dx, dz, dw, dh, shot ? Infinity : 4);
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
    }

    g.fillStyle = vignette;
    g.fillRect(0, 0, S, S);

    // The camera's view: a faint wedge up from him.
    const half = Math.atan(Math.tan((roam.cam.fov * Math.PI) / 360) * aspect);
    g.fillStyle = cone;
    g.beginPath();
    g.moveTo(C, C);
    g.arc(C, C, face * 0.44, -Math.PI / 2 - half, -Math.PI / 2 + half);
    g.closePath();
    g.fill();

    // Hang glider ramps: a glider on a badge (gold: the target). While he walks, a soft ring pings
    // out from the nearest one every two seconds or so (the one N heads for).
    const dpr = S / cssSize;
    const near = roam.mode === 'walk' ? nearestRamp() : -1;
    const rEdge = F + rampSpr.width;
    for (let i = 0; i < ramps.length; i++) {
      const j = PLACES.length + i;
      const dx = ramps[i].x - p.x;
      const dz = ramps[i].z - p.z;
      const x = C + a * dx + c * dz;
      const y = C + b * dx + e * dz;
      if (Math.abs(x - C) > rEdge || Math.abs(y - C) > rEdge) {
        iconX[j] = iconY[j] = NaN;
        continue;
      }
      const spr = i === targetRamp ? rampGold : rampSpr;
      if (i === near && i !== targetRamp) {
        const ph = (t * 0.5) % 1;
        g.beginPath();
        g.arc(x, y, spr.width / 2 + ph * 10 * ks, 0, Math.PI * 2);
        g.lineWidth = 1.6 * ks;
        g.strokeStyle = `rgba(255, 244, 222, ${(0.8 * (1 - ph) * (1 - ph)).toFixed(3)})`;
        g.stroke();
      }
      g.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
      iconX[j] = x / dpr;
      iconY[j] = y / dpr;
    }

    // The temples (over the ramps where they meet).
    const edge = F + sprite.width;
    for (let j = 0; j < PLACES.length; j++) {
      const pl = PLACES[j];
      const dx = pl.x - p.x;
      const dz = pl.z - p.z;
      const x = a * dx + c * dz;
      const y = b * dx + e * dz;
      if (Math.abs(x) > edge || Math.abs(y) > edge) {
        iconX[j] = iconY[j] = NaN;
        continue;
      }
      const spr = pl === targetPlace ? spriteGold : sprite;
      g.drawImage(spr, Math.round(C + x - spr.width / 2), Math.round(C + y - spr.height / 2));
      iconX[j] = (C + x) / dpr;
      iconY[j] = (C + y) / dpr;
    }

    // The target: its beacon on the map (a ramp: a ring round its gold badge), or a gold arrow on the rim towards it.
    if (target) {
      const dx = tx - p.x;
      const dz = tz - p.z;
      const x = a * dx + c * dz;
      const y = b * dx + e * dz;
      // (the rim arrow sits inside the "N" on the edge: they may point the same way)
      const lim = F - 5 * ks;
      const rim = F - 18 * ks;
      const r = Math.hypot(x, y);
      const norm = Math.pow(Math.pow(Math.abs(x), 4) + Math.pow(Math.abs(y), 4), 0.25);
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      g.lineWidth = 1.4 * ks;
      g.strokeStyle = 'rgba(40, 22, 4, 0.9)';
      g.fillStyle = '#ffd54a';
      if (norm < lim) {
        g.beginPath();
        g.arc(C + x, C + y, targetPlace ? (7 + 4 * pulse) * ks : rampGold.width / 2 + (2 + 4 * pulse) * ks, 0, Math.PI * 2);
        g.strokeStyle = '#ffd54a';
        g.lineWidth = 2 * ks;
        g.globalAlpha = 0.85 - 0.6 * pulse;
        g.stroke();
        g.globalAlpha = 1;
        if (targetPlace) {
          g.setTransform(ks, 0, 0, ks, C + x, C + y);
          g.lineWidth = 1.4;
          g.strokeStyle = 'rgba(40, 22, 4, 0.9)';
          g.fill(beaconPath);
          g.stroke(beaconPath);
        }
      } else if (r > 0) {
        const ux = x / r;
        const uy = y / r;
        const k = rim / Math.pow(Math.pow(Math.abs(ux), 4) + Math.pow(Math.abs(uy), 4), 0.25) + pulse * 2 * ks;
        g.setTransform(uy * -ks, ux * ks, -ux * ks, -uy * ks, C + ux * k, C + uy * k);
        g.shadowColor = 'rgba(255, 180, 40, 0.8)';
        g.shadowBlur = 6 * ks;
        g.fill(rimPath);
        g.shadowBlur = 0;
        g.lineWidth = 1.4;
        g.stroke(rimPath);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.restore();

    // The face's edge, and north on it.
    g.lineWidth = 1.5 * (S / cssSize);
    g.strokeStyle = 'rgba(255, 224, 124, 0.34)';
    g.stroke(facePath);
    {
      const ux = -sn;
      const uy = cs;
      const k = (F - 1.5 * ks) / Math.pow(Math.pow(Math.abs(ux), 4) + Math.pow(Math.abs(uy), 4), 0.25);
      const x = C + ux * k;
      const y = C + uy * k;
      g.beginPath();
      g.arc(x, y, 7.5 * ks, 0, Math.PI * 2);
      g.fillStyle = 'rgba(10, 18, 30, 0.94)';
      g.fill();
      g.lineWidth = 1.3 * ks;
      g.strokeStyle = 'rgba(255, 224, 124, 0.8)';
      g.stroke();
      g.fillStyle = '#ffe07c';
      g.fillText(north, x, y + 0.5 * ks);
    }

    // The explorer (on his boat), turned to his facing.
    const th = cy - roam.body.yaw;
    const ct = Math.cos(th) * ks;
    const st = Math.sin(th) * ks;
    g.setTransform(ct, st, -st, ct, C, C);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(20, 13, 8, 0.95)';
    if (roam.mode === 'boat') {
      g.fillStyle = '#9a6a40';
      g.fill(boatPath);
      g.stroke(boatPath);
    }
    g.shadowColor = 'rgba(0, 0, 0, 0.5)';
    g.shadowBlur = 3 * ks;
    g.shadowOffsetY = 1 * ks;
    g.fillStyle = '#fff6e4';
    g.fill(arrowPath);
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    g.stroke(arrowPath);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  mini.addEventListener('click', () => {
    mini.blur();
    openBig(true);
  });
  // Hover a temple on the mini-map: its name; a ramp: how far it is.
  let tipFor = -1;
  mini.addEventListener('pointermove', (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    let best = -1;
    let bestD = 12;
    for (let j = 0; j < iconX.length; j++) {
      const dd = Math.hypot(iconX[j] - x, iconY[j] - y);
      if (dd < bestD) {
        bestD = dd;
        best = j;
      }
    }
    if (best === tipFor) return;
    tipFor = best;
    tip.classList.toggle('is-on', best >= 0);
    if (best < 0) return;
    const s = ramps[best - PLACES.length];
    tip.textContent = s ? `${t('mmRamp')} · ${distText(Math.hypot(s.x - roam.body.pos.x, s.z - roam.body.pos.z))}` : placeText(PLACES[best]).name;
    tip.style.left = `${r.left - mini.getBoundingClientRect().left + iconX[best]}px`;
    tip.style.top = `${r.top - mini.getBoundingClientRect().top + iconY[best] - 10}px`;
  });
  mini.addEventListener('pointerleave', () => {
    tipFor = -1;
    tip.classList.remove('is-on');
  });

  for (const [id, b] of buttons)
    b.addEventListener('click', () => {
      const next = targetPlace?.id === id ? null : id;
      setTarget(next && { kind: 'place', id: next });
      d.sound?.(next ? 'select' : 'back');
    });
  rampEls.forEach((b, i) =>
    b.addEventListener('click', () => {
      const next = targetRamp === i ? null : ramps[i];
      setTarget(next && { kind: 'ramp', spot: next });
      d.sound?.(next ? 'select' : 'back');
    }),
  );
  q(bigWrap, '.mm-find').addEventListener('click', findRamp);
  q(bigWrap, '.mm-x').addEventListener('click', () => openBig(false));
  q(bigWrap, '.mm-shade').addEventListener('click', () => openBig(false));

  // M opens and shuts the big map, N heads for the nearest ramp; while the big map is open the
  // other keys stay here (capture phase, before the roaming controls), except B (bug reports) and Tab.
  addEventListener(
    'keydown',
    (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || document.body.classList.contains('reporting')) return;
      if (bigOpen) {
        if (ev.code === 'KeyB' || ev.key === 'Tab') return;
        ev.stopPropagation();
        if (ev.code === 'KeyM' || ev.key === 'Escape') {
          ev.preventDefault();
          if (!ev.repeat) openBig(false);
          return;
        }
        if (ev.code === 'KeyN') {
          ev.preventDefault();
          if (!ev.repeat) findRamp();
          return;
        }
        // (Enter and Space still press the focused button)
        const press = (ev.key === 'Enter' || ev.key === ' ') && ev.target instanceof HTMLButtonElement && bigWrap.contains(ev.target);
        if (!press) ev.preventDefault();
        return;
      }
      if ((ev.code !== 'KeyM' && ev.code !== 'KeyN') || ev.repeat || !shown) return;
      const tg = ev.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      // (N: not while the mini-map is put away for a photo)
      const cls = document.body.classList;
      if (ev.code === 'KeyN' && (!ramps.length || cls.contains('photo-mode') || cls.contains('selfie-mode'))) return;
      ev.preventDefault();
      if (ev.code === 'KeyM') openBig(true);
      else findRamp();
    },
    { capture: true },
  );

  // ── Words (lang.ts) ──────────────────────────────────────────────────────
  /** Every word in the language in use: the marked elements, the places' names, the target's words. */
  function fillWords(): void {
    for (const root of [wrap, bigWrap]) {
      for (const e of root.querySelectorAll<HTMLElement>('[data-t]')) e.textContent = t(e.dataset.t as WordKey);
      for (const e of root.querySelectorAll<HTMLElement>('[data-t-aria]')) e.setAttribute('aria-label', t(e.dataset.tAria as WordKey));
    }
    for (const [id, b] of buttons) b.querySelector('b')!.textContent = placeText(placeById(id)).name;
    scaleText.textContent = `${num(100)} ${t('m')}`;
    north = t('mmNorth');
    tagText.fill('');
    tipFor = -1;
    tip.classList.remove('is-on');
    targetWords();
    if (bigOpen) writeRampTags();
    acc = 1;
  }
  fillWords();
  onLang(fillWords);

  // ── Frame ────────────────────────────────────────────────────────────────
  // (the target from the URL once roaming shows: `target=ramp` looks from where he is then)
  let wantTarget = params.get('target');
  let wantBig = params.get('bigmap') === '1';
  let modeShown: RoamMode | null = null;

  const api: Minimap = {
    name: 'minimap',
    object: new Group(),
    get target() {
      return target;
    },
    setTarget,
    findRamp,
    get bigOpen() {
      return bigOpen;
    },
    openBig,
    update(f: MapFrame) {
      // Follow the picker's size and time of day.
      const nu = d.root.style.getPropertyValue('--u');
      if (nu !== u) {
        u = nu;
        wrap.style.setProperty('--u', nu || '1');
        bigWrap.style.setProperty('--u', nu || '1');
      }
      const nn = d.root.style.getPropertyValue('--mu-n');
      if (nn !== n) {
        n = nn;
        wrap.style.setProperty('--mu-n', nn || '0');
        bigWrap.style.setProperty('--mu-n', nn || '0');
      }
      if (toastLeft > 0 && (toastLeft -= f.dt) <= 0) toastEl.classList.remove('is-on');
      night = f.night;
      const on = roam.active && !off;
      if (on !== shown) {
        shown = on;
        wrap.classList.toggle('is-on', on);
        if (!on) openBig(false);
        acc = 1;
      }
      if (!on) {
        // (made in small slices while the overview is on, so roaming starts with it)
        if (!land && !shot && f.t > 3) makeLand(3);
        return;
      }
      if (!land) makeLand(shot ? Infinity : 8);
      if (roam.mode !== modeShown) {
        // (the "N  Glider ramp" hint under the mini-map shows while he walks)
        modeShown = roam.mode;
        wrap.dataset.mode = modeShown;
      }
      if (wantTarget !== null) {
        const w = wantTarget;
        wantTarget = null;
        const id = asPlace(w);
        const spot = w.startsWith('ramp:') ? ramps[Number(w.slice(5))] : undefined;
        if (id) setTarget({ kind: 'place', id });
        else if (spot) setTarget({ kind: 'ramp', spot });
        else if (w === 'ramp') findRamp();
      }
      if (wantBig) {
        wantBig = false;
        openBig(true);
      }
      const want = SPAN[roam.mode];
      span = shot ? want : span + (want - span) * (1 - Math.exp(-f.dt * 1.5));
      acc += f.dt;
      if (!shot && acc < 1 / FPS) return;
      acc = 0;
      checkArrival();
      updateDistance();
      if (bigOpen) {
        if (Math.abs(night - bigNight) > 0.03) drawBig();
        placeYou();
        writeRampTags();
      }
      const cls = document.body.classList;
      if (cls.contains('photo-mode') || cls.contains('selfie-mode')) return;
      drawMini(f.t, f.camera.aspect);
    },
  };
  return api;
}

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;

/** A square (x0, x0) of `size` with its corners cut in `steps` pixel steps over `cut` (like shape.ts `steppedShape`), as a canvas path. */
function steppedPath(x0: number, size: number, cut: number, steps: number): Path2D {
  const p = new Path2D();
  const s = cut / steps;
  const x1 = x0 + size;
  // Corner by corner, clockwise from the top left: (dx, dy) steps along each side.
  const corners: [number, number, number, number][] = [
    [x0, x0, 1, 1],
    [x1, x0, -1, 1],
    [x1, x1, -1, -1],
    [x0, x1, 1, -1],
  ];
  corners.forEach(([cx, cy, sx, sy], n) => {
    // (the top-left and bottom-right corners run from the side up; the others the other way)
    const pts: [number, number][] = [[0, cut]];
    for (let i = 0; i < steps; i++) pts.push([i * s, cut - (i + 1) * s], [(i + 1) * s, cut - (i + 1) * s]);
    const run = n % 2 === 0 ? pts : pts.map(([a, b]): [number, number] => [b, a]);
    for (const [a, b] of run) {
      const x = cx + sx * a;
      const y = cy + sy * b;
      if (n === 0 && a === 0 && b === cut) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
  });
  p.closePath();
  return p;
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .map-ui.mm { z-index: 19; }
    .map-ui.mm-bigwrap { z-index: 30; }
    .mm kbd, .mm-bigwrap kbd { display: inline-grid; place-items: center; min-width: calc(18 * var(--px)); height: calc(18 * var(--px)); padding: 0 calc(4 * var(--px));
      box-sizing: border-box; font: 600 calc(11 * var(--px)) / 1 var(--mu-display); color: var(--mu-ink); background: rgba(255, 244, 222, 0.1);
      border: 1px solid var(--mu-line-hi); border-bottom-width: 2px; border-radius: calc(3 * var(--px)); }

    /* Mini-map: top right, under the mute and gear buttons. */
    .mm-mini { position: absolute; right: calc(22 * var(--px)); top: calc(96 * var(--px)); display: flex; flex-direction: column; align-items: center;
      gap: calc(5 * var(--px)); padding: calc(6 * var(--px)) calc(6 * var(--px)) calc(5 * var(--px)); border: 0; background: none; cursor: pointer;
      pointer-events: auto; outline: none; touch-action: manipulation; --mu-shape: var(--mm-shape); --mu-ring: var(--mm-ring);
      --mu-edge: color-mix(in srgb, rgba(255, 226, 180, 0.3), rgba(180, 204, 255, 0.28) var(--mu-night));
      opacity: 0; visibility: hidden; transition: opacity 0.4s, visibility 0s 0.4s; }
    .mm.is-on .mm-mini { opacity: 1; visibility: visible; transition: opacity 0.6s 0.4s, visibility 0s; }
    .mm-mini > .mu-bg { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
    .mm-mini:hover, .mm-mini:focus-visible { --mu-edge: var(--mu-line-hi); }
    .mm-mini:focus-visible { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 3px; border-radius: calc(8 * var(--px)); }
    .mm-face { position: relative; display: block; width: calc(${FACE} * var(--px)); height: calc(${FACE} * var(--px)); }
    .mm-canvas { position: absolute; left: calc(-${BEZEL} * var(--px)); top: calc(-${BEZEL} * var(--px));
      width: calc(${FACE + 2 * BEZEL} * var(--px)); height: calc(${FACE + 2 * BEZEL} * var(--px)); }
    .mm-cap { display: flex; align-items: center; justify-content: center; max-width: calc(${FACE} * var(--px)); height: calc(20 * var(--px));
      font-size: calc(13 * var(--px)); font-weight: 700; color: var(--mu-ink2); white-space: nowrap; }
    .mm-cap-to { display: none; align-items: center; gap: calc(4 * var(--px)); min-width: 0; }
    .mm-cap-to .mu-icon { width: calc(14 * var(--px)); height: calc(14 * var(--px)); color: var(--mu-gold); flex: none; }
    .mm-cap-to b { color: var(--mu-ink); overflow: hidden; text-overflow: ellipsis; }
    .mm-cap-to em { font-style: normal; color: var(--mu-gold-hi); }
    .mm-cap-to em::before { content: '·'; margin: 0 calc(4 * var(--px)); color: var(--mu-dim); }
    .mm-cap-map { display: inline-flex; align-items: center; gap: calc(6 * var(--px)); font-weight: 600; }
    .mm.has-target .mm-cap-to { display: inline-flex; }
    .mm.has-target .mm-cap-map { display: none; }
    .mm-cap-ramp { display: none; align-items: center; gap: calc(6 * var(--px)); margin-left: calc(14 * var(--px)); font-weight: 600; }
    body:not(.roam-touch) .mm[data-mode='walk']:not(.has-target) .mm-cap-ramp { display: inline-flex; }
    body.roam-touch .mm-cap kbd { display: none; }
    .mm-tip { position: absolute; left: 0; top: 0; z-index: 2; transform: translate(-50%, -100%); padding: calc(3 * var(--px)) calc(8 * var(--px));
      font-size: calc(12 * var(--px)); font-weight: 700; color: var(--mu-ink); white-space: nowrap; background: var(--mu-panel-strong);
      clip-path: var(--mm-tag); opacity: 0; transition: opacity 0.15s; pointer-events: none; }
    .mm-tip.is-on { opacity: 1; }

    /* Arrival: a banner at the top centre. */
    .mm-toast { position: absolute; left: 50%; top: 13vh; display: flex; align-items: center; gap: calc(12 * var(--px));
      padding: calc(10 * var(--px)) calc(22 * var(--px)) calc(10 * var(--px)) calc(14 * var(--px)); transform: translate(-50%, -6px);
      opacity: 0; visibility: hidden; transition: opacity 0.6s, transform 0.6s var(--mu-ease), visibility 0s 0.6s; --mu-edge: rgba(255, 208, 112, 0.8); }
    .mm-toast.is-on { opacity: 1; visibility: visible; transform: translate(-50%, 0); transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .mm-toast .mu-glow { opacity: 0.6; }
    .mm-toast-icon { width: calc(34 * var(--px)); height: auto; flex: none; filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3)); }
    .mm-toast-icon .is-stone { display: none; }
    .mm-toast-wing { display: none; width: calc(34 * var(--px)); height: auto; flex: none; filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3)); }
    .mm-toast.is-ramp .mm-toast-icon { display: none; }
    .mm-toast.is-ramp .mm-toast-wing { display: block; }
    .mm-toast-text { display: flex; flex-direction: column; gap: calc(2 * var(--px)); white-space: nowrap; }
    .mm-toast-text em { font-style: normal; font-size: calc(13 * var(--px)); font-weight: 600; color: var(--mu-ink2); }
    .mm-toast-text b { font: 700 calc(22 * var(--px)) / 1.05 var(--mu-display); color: var(--mu-ink); letter-spacing: 0.01em; }
    /* (the pixel font's 5 reads as an 8) */
    .mm-toast-text b.is-dist { font-family: var(--mu-font); font-weight: 800; letter-spacing: 0; }

    /* Big map. */
    .mm-shade { position: absolute; inset: 0; background: color-mix(in srgb, rgba(6, 10, 18, 0.5), rgba(2, 6, 16, 0.58) var(--mu-night));
      opacity: 0; visibility: hidden; transition: opacity 0.3s, visibility 0s 0.3s; }
    .mm-big { position: absolute; left: 50%; top: 50%; display: flex; flex-direction: column; gap: calc(12 * var(--px)); box-sizing: border-box;
      max-width: calc(100vw - 24px); padding: calc(14 * var(--px)) calc(18 * var(--px)) calc(14 * var(--px)); outline: none;
      transform: translate(-50%, calc(-50% + 10px)) scale(0.985); opacity: 0; visibility: hidden;
      transition: opacity 0.3s, transform 0.35s var(--mu-ease), visibility 0s 0.35s;
      --mu-edge: color-mix(in srgb, rgba(255, 226, 180, 0.3), rgba(180, 204, 255, 0.28) var(--mu-night)); }
    .mm-big > .mu-bg { background: var(--mu-panel-strong); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
    .mm-bigwrap.is-open .mm-shade, .mm-bigwrap.is-open .mm-big { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 0.3s, transform 0.35s var(--mu-ease); }
    .mm-bigwrap.is-open .mm-big { transform: translate(-50%, -50%); }
    .mm-head { display: flex; align-items: center; gap: calc(14 * var(--px)); }
    .mm-head-icon .mu-icon { width: calc(54 * var(--px)); height: auto; filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .mm-head h2 { margin: 0; font: 700 calc(28 * var(--px)) / 1 var(--mu-display); letter-spacing: 0.01em; text-shadow: 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.3); }
    .mm-head p { margin: calc(5 * var(--px)) 0 0; font-size: calc(15 * var(--px)); color: var(--mu-ink2); }
    .mm-head-text { margin-right: auto; }
    .mm-find { align-self: flex-start; display: flex; align-items: center; gap: calc(9 * var(--px)); padding: calc(7 * var(--px)) calc(10 * var(--px)) calc(7 * var(--px)) calc(12 * var(--px));
      border: 0; background: none; color: var(--mu-ink); font: inherit; font-size: calc(14 * var(--px)); font-weight: 700; white-space: nowrap; cursor: pointer; outline: none;
      --mu-edge: rgba(255, 208, 112, 0.62); transition: transform 0.25s var(--mu-ease); }
    .mm-find[hidden] { display: none; }
    .mm-find-icon { width: calc(34 * var(--px)); height: auto; flex: none; filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .mm-find:hover { --mu-edge: rgba(255, 224, 150, 0.95); transform: translateY(var(--mu-lift)); }
    .mm-find:hover > .mu-glow { opacity: 0.55; }
    .mm-find:active { transform: scale(0.98); transition-duration: 0.08s; }
    .mm-x { align-self: flex-start; display: flex; align-items: center; gap: calc(8 * var(--px)); padding: calc(8 * var(--px)) calc(10 * var(--px));
      border: 0; background: none; color: var(--mu-ink); cursor: pointer; outline: none; }
    .mm-x .mu-icon { width: calc(18 * var(--px)); height: calc(18 * var(--px)); }
    .mm-x:hover { --mu-edge: var(--mu-line-hi); }
    .mm-x:focus-visible, .mm-find:focus-visible, :is(.mm-place, .mm-ramp):focus-visible .mm-place-label { outline: 2px solid rgba(255, 244, 214, 0.95); outline-offset: 2px; }
    .mm-view { position: relative; width: min(calc(100vw - 60px), calc((100vh - 170 * var(--px) - 40px) * var(--mm-aspect)), calc(1060 * var(--px)));
      aspect-ratio: var(--mm-aspect); clip-path: var(--mm-face); }
    .mm-view::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 calc(40 * var(--px)) rgba(4, 8, 16, 0.5); }
    .mm-land { position: absolute; inset: 0; width: 100%; height: 100%; }
    .mm-marks { position: absolute; inset: 0; }
    .mm-place { position: absolute; z-index: 1; width: calc(30 * var(--px)); height: calc(${(30 * TEMPLE_SIZE.h) / TEMPLE_SIZE.w} * var(--px)); padding: 0; margin: 0; border: 0;
      background: none; color: var(--mu-ink); cursor: pointer; pointer-events: auto; outline: none; transform: translate(-50%, -50%); touch-action: manipulation; }
    .mm-place-icon { display: block; width: 100%; height: 100%; filter: drop-shadow(0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35)); transition: transform 0.25s var(--mu-ease); }
    .mm-place-icon .is-gold, .mm-place.is-target .mm-place-icon .is-stone { display: none; }
    .mm-place.is-target .mm-place-icon .is-gold { display: inline; }
    .mm-place-label { position: absolute; left: 50%; top: 100%; margin-top: calc(4 * var(--px)); transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;
      padding: calc(3 * var(--px)) calc(8 * var(--px)); white-space: nowrap; background: rgba(10, 18, 30, 0.8); clip-path: var(--mm-tag); transition: background 0.2s; }
    .mm-place-label b { font-size: calc(13 * var(--px)); font-weight: 700; line-height: 1.2; }
    .mm-place-label em { font-style: normal; font-size: calc(11.5 * var(--px)); font-weight: 700; color: var(--mu-gold-hi); line-height: 1.2; }
    .mm-place-label em:empty { display: none; }
    .mm-place:hover .mm-place-icon, .mm-place:focus-visible .mm-place-icon { transform: translateY(calc(-2 * var(--px))); }
    .mm-place:hover .mm-place-label { background: rgba(38, 44, 58, 0.92); }
    .mm-place.is-target { z-index: 2; }
    .mm-place.is-target .mm-place-label { background: rgba(58, 38, 8, 0.9); box-shadow: inset 0 0 0 1.5px rgba(255, 213, 74, 0.8); }
    .mm-place.is-target::before { content: ''; position: absolute; left: 50%; top: 50%; width: 170%; aspect-ratio: 1; border-radius: 50%;
      transform: translate(-50%, -50%); border: calc(2 * var(--px)) solid rgba(255, 213, 74, 0.8); animation: mm-ping 1.8s ease-out infinite; pointer-events: none; }
    .mm-ramp { position: absolute; z-index: 1; width: calc(29 * var(--px)); height: calc(29 * var(--px)); padding: 0; margin: 0; border: 0; background: none;
      color: var(--mu-ink); cursor: pointer; pointer-events: auto; outline: none; transform: translate(-50%, -50%); touch-action: manipulation; }
    .mm-ramp-badge { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; background: rgba(10, 18, 30, 0.84);
      box-shadow: inset 0 0 0 calc(1.5 * var(--px)) rgba(255, 236, 200, 0.72), 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35); transition: transform 0.25s var(--mu-ease); }
    .mm-ramp-icon { display: block; width: calc(21 * var(--px)); height: auto; }
    .mm-ramp .mm-place-label { margin-top: calc(3 * var(--px)); padding: calc(2 * var(--px)) calc(7 * var(--px)); }
    .mm-ramp .mm-place-label b { font-size: calc(11.5 * var(--px)); color: var(--mu-ink2); }
    .mm-ramp:not(:hover, :focus-visible, .is-target, .is-near) .mm-place-label em { display: none; }
    :is(.mm-place, .mm-ramp).is-up .mm-place-label { top: auto; bottom: 100%; margin: 0 0 calc(3 * var(--px)); }
    .mm-ramp:hover .mm-ramp-badge, .mm-ramp:focus-visible .mm-ramp-badge { transform: translateY(calc(-2 * var(--px))); }
    .mm-ramp:hover { z-index: 3; }
    .mm-ramp:hover .mm-place-label { background: rgba(38, 44, 58, 0.92); }
    .mm-ramp:hover .mm-place-label b { color: var(--mu-ink); }
    .mm-ramp.is-target { z-index: 2; }
    .mm-ramp.is-target .mm-ramp-badge { background: rgba(58, 38, 8, 0.94);
      box-shadow: inset 0 0 0 calc(2 * var(--px)) #ffd54a, 0 0 calc(10 * var(--px)) rgba(255, 180, 40, 0.7), 0 calc(2 * var(--px)) 0 rgba(0, 0, 0, 0.35); }
    .mm-ramp.is-target .mm-place-label { background: rgba(58, 38, 8, 0.9); box-shadow: inset 0 0 0 1.5px rgba(255, 213, 74, 0.8); }
    .mm-ramp.is-target .mm-place-label b { color: var(--mu-ink); }
    .mm-ramp:is(.is-target, .is-near)::before { content: ''; position: absolute; left: 50%; top: 50%; width: 150%; aspect-ratio: 1; border-radius: 50%;
      transform: translate(-50%, -50%); border: calc(2 * var(--px)) solid rgba(255, 213, 74, 0.8); animation: mm-ping 1.8s ease-out infinite; pointer-events: none; }
    .mm-ramp.is-near:not(.is-target)::before { border-color: rgba(255, 244, 222, 0.6); animation-duration: 2.2s; }
    .mm-beacon { position: absolute; width: calc(10 * var(--px)); height: calc(10 * var(--px)); transform: translate(-50%, -50%) rotate(45deg); display: none;
      background: #ffd54a; box-shadow: 0 0 0 calc(1.5 * var(--px)) rgba(40, 22, 4, 0.9), 0 0 calc(10 * var(--px)) rgba(255, 180, 40, 0.9); }
    .mm-beacon.is-on { display: block; }
    .mm-you { position: absolute; z-index: 3; width: 0; height: 0; pointer-events: none; }
    .mm-you-arrow { position: absolute; left: 0; top: 0; width: calc(22 * var(--px)); transform: translate(-50%, -52%) rotate(var(--r, 0deg));
      filter: drop-shadow(0 calc(1.5 * var(--px)) calc(1.5 * var(--px)) rgba(0, 0, 0, 0.55)); }
    .mm-you-arrow svg { display: block; width: 100%; }
    .mm-you-ring { position: absolute; left: 0; top: 0; width: calc(36 * var(--px)); height: calc(36 * var(--px)); border-radius: 50%; transform: translate(-50%, -50%);
      background: radial-gradient(circle, rgba(255, 246, 228, 0.28), rgba(255, 246, 228, 0) 70%); border: 1.5px solid rgba(255, 246, 228, 0.7); animation: mm-ping 2.2s ease-out infinite; }
    .mm-you-label { position: absolute; left: 0; bottom: calc(18 * var(--px)); transform: translateX(-50%); padding: calc(2 * var(--px)) calc(7 * var(--px));
      font-size: calc(12 * var(--px)); font-weight: 800; white-space: nowrap; color: #1b130d; background: #fff6e4; clip-path: var(--mm-tag); }
    @keyframes mm-ping { 0% { opacity: 0.9; scale: 0.7; } 100% { opacity: 0; scale: 1.25; } }
    .mm-compass { position: absolute; right: calc(12 * var(--px)); top: calc(12 * var(--px)); width: calc(38 * var(--px)); height: calc(38 * var(--px)); display: grid; place-items: center;
      border-radius: 50%; background: rgba(10, 18, 30, 0.72); box-shadow: inset 0 0 0 1.5px rgba(255, 224, 124, 0.5); }
    .mm-compass svg { position: absolute; inset: 0; }
    .mm-compass b { font: 700 calc(15 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); margin-top: calc(3 * var(--px)); }
    .mm-scale { position: absolute; left: calc(14 * var(--px)); bottom: calc(12 * var(--px)); display: flex; flex-direction: column; gap: calc(3 * var(--px));
      font-size: calc(11.5 * var(--px)); font-weight: 700; color: var(--mu-ink); text-shadow: 0 1px 2px #000c; }
    .mm-scale span { display: block; height: calc(5 * var(--px)); box-sizing: border-box; border: 1.5px solid var(--mu-ink); border-top: 0; box-shadow: 0 1px 2px #0008; }
    .mm-scale em { font-style: normal; }
    .mm-foot { display: flex; align-items: center; justify-content: space-between; gap: calc(18 * var(--px)); min-height: calc(20 * var(--px));
      font-size: calc(13 * var(--px)); color: var(--mu-ink2); }
    .mm-legend { display: flex; align-items: center; gap: calc(14 * var(--px)); white-space: nowrap; }
    .mm-legend > span { display: inline-flex; align-items: center; gap: calc(6 * var(--px)); }
    .mm-legend-temple { width: calc(18 * var(--px)); height: auto; }
    .mm-legend-temple .is-gold { display: none; }
    .mm-legend-wing { width: calc(17 * var(--px)); height: auto; }
    .mm-legend i { display: inline-block; flex: none; }
    .mm-sw-road { width: calc(18 * var(--px)); height: calc(4 * var(--px)); background: #f2b64a; box-shadow: 0 0 0 1px rgba(58, 34, 12, 0.6); }
    .mm-sw-river { width: calc(18 * var(--px)); height: calc(7 * var(--px)); background: linear-gradient(#4cc2b4, #1d7d93 50%, #4cc2b4); }
    .mm-sw-you { width: calc(12 * var(--px)); }
    .mm-sw-you svg { display: block; width: 100%; }
    .mm-status { text-align: right; color: var(--mu-ink); font-weight: 600; }

    body.photo-mode .mm, body.selfie-mode .mm { display: none; }

    /* Khmer (lang.ts): its letters look smaller than Latin ones at the same size, and stack signs above and below. */
    :lang(km) .mm-cap { font-size: calc(14 * var(--px)); }
    :lang(km) .mm-tip { font-size: calc(13 * var(--px)); }
    :lang(km) .mm-toast-text em { font-size: calc(14 * var(--px)); }
    :lang(km) .mm-head p { font-size: calc(16 * var(--px)); }
    :lang(km) .mm-find { font-size: calc(15 * var(--px)); }
    :lang(km) .mm-place-label b { font-size: calc(14.5 * var(--px)); line-height: 1.3; }
    :lang(km) .mm-place-label em { font-size: calc(12.5 * var(--px)); line-height: 1.3; }
    :lang(km) .mm-ramp .mm-place-label b { font-size: calc(12.5 * var(--px)); }
    :lang(km) .mm-you-label { font-size: calc(13 * var(--px)); }
    :lang(km) .mm-foot { font-size: calc(14 * var(--px)); }
    .mu-calm ~ .mm-bigwrap :is(.mm-place, .mm-ramp)::before, .mu-calm ~ .mm-bigwrap .mm-you-ring { animation: none; }

    @media (max-width: 639px) {
      .mm-mini { right: 10px; top: 62px; padding: 4px 4px 3px; gap: 3px; }
      .mm-face { width: 118px; height: 118px; }
      .mm-canvas { left: -5px; top: -5px; width: 128px; height: 128px; }
      .mm-cap { max-width: 118px; height: 16px; font-size: 11px; }
      .mm-cap-to .mu-icon { width: 11px; height: 11px; }
      .mm-cap kbd { display: none; }
      /* (under the mini-map) */
      .mm-toast { top: 218px; }
      .mm-big { padding: 10px 10px 12px; gap: 8px; }
      .mm-head-icon { display: none; }
      .mm-head h2 { font-size: 21px; }
      .mm-head p { font-size: 12.5px; margin-top: 3px; }
      .mm-x kbd, .mm-find kbd, .mm-find-text { display: none; }
      .mm-find { padding: 7px 9px; }
      .mm-view { width: calc(100vw - 44px); }
      .mm-legend { display: none; }
      .mm-status { text-align: left; font-size: 12px; }
      .mm-place { width: 22px; height: ${(22 * TEMPLE_SIZE.h) / TEMPLE_SIZE.w}px; }
      .mm-place-label { padding: 2px 5px; }
      .mm-place-label b { font-size: 10.5px; }
      .mm-place-label em { font-size: 9.5px; }
      :lang(km) .mm-cap { font-size: 12px; }
      :lang(km) .mm-head p { font-size: 13.5px; }
      :lang(km) .mm-place-label b { font-size: 11.5px; }
      :lang(km) .mm-place-label em { font-size: 10.5px; }
      .mm-you-label { display: none; }
      .mm-ramp { width: 20px; height: 20px; }
      .mm-ramp-icon { width: 14px; }
      .mm-ramp:not(.is-target) .mm-place-label { display: none; }
      body:not(.roam-touch) .mm[data-mode='walk']:not(.has-target) .mm-cap-ramp { display: none; }
      /* (Preah Khan is just north of the River Gate: its name above it) */
      .mm-place[data-id='shrine'] .mm-place-label { top: auto; bottom: 100%; margin: 0 0 3px; }
      .mm-compass { transform: scale(0.8); transform-origin: top right; }
    }
    @media (max-height: 500px) and (min-width: 640px) {
      .mm-face { width: 120px; height: 120px; }
      .mm-canvas { left: -5px; top: -5px; width: 130px; height: 130px; }
      .mm-cap { max-width: 120px; }
      body:not(.roam-touch) .mm[data-mode='walk']:not(.has-target) .mm-cap-ramp { display: none; }
    }`;
  document.head.append(style);
}
