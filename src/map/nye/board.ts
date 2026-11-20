import { CanvasTexture, Frustum, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, SRGBColorSpace, type PerspectiveCamera } from 'three';
import { trackSacred } from '../sacred/pending';
import { boss, flame, flameRow, gild, lotusBand, ribbon, scroll, type KbachPen, type P } from '../sacred/kbach';
import type { MapFrame } from '../types';
import { later } from './_stKit';
import { lang, onLang } from '../ui/lang';
import { boardAt, NYE_YEAR, nyeNow, type BoardShow } from './clock';
import { BOARD, GROUND } from './plan';

/**
 * The countdown board (AWP-35): a screen `BOARD.w` × `BOARD.h` m in the stage gate, facing south, drawn on a
 * canvas (1024 × 512) that is redrawn only when what it shows changes (once a second at most, and only while
 * the camera is near enough to read it or it has never been drawn). An unlit material whose colour goes over
 * 1.0 at night (bloom), plain 1.0 by day (a lit screen reads in the sun).
 *
 * What it shows comes from clock.ts `boardAt()` (`nyeboard=` holds a state):
 * - `days`: the name, "ព្រឹត្តិការណ៍ផ្ទាល់ / LIVE EVENT", days : hours : minutes : seconds and their labels;
 * - `hms`: the last day, hours : minutes : seconds (as the owner's fireworks reference: 00:00:10);
 * - `last10`: one huge numeral;
 * - `midnight`: "សួស្តីឆ្នាំថ្មី ២០២៧" / "Happy New Year 2027";
 * - `after`: "ជួបគ្នាឆ្នាំក្រោយ" / "See you next year".
 * Khmer first (Khmer numerals, ថ្ងៃ ម៉ោង នាទី វិនាទី), English with `lang=en`; the name មរតកអង្គរ is always on
 * top in Koulen pixel letters. The gold frame is carved kbach (sacred/kbach.ts), drawn once.
 *
 * Phase 2's hooks (drawn only when set): `setBoardPlayers(n)` ("players on the square now") and
 * `setBoardTest(true)` (a "សាកល្បង / TEST" tag in the corner); `boardplayers=<n>`, `boardtest=1` in shots.
 */

/** The canvas (px): 2 : 1 as the screen. */
const CW = 1024;
const CH = 512;
/** Metres to canvas pixels. */
const PPM = CW / BOARD.w;

/** The board's own words (Khmer first). The overlay's words are ui/lang.ts's; these are only the screen's. */
const WORDS = {
  live: { km: 'ព្រឹត្តិការណ៍ផ្ទាល់', en: 'LIVE EVENT' },
  sub: { km: `ឆ្នាំថ្មី ${NYE_YEAR}`, en: `NEW YEAR ${NYE_YEAR}` },
  last: { km: 'ថ្ងៃចុងក្រោយ', en: 'THE LAST DAY' },
  d: { km: 'ថ្ងៃ', en: 'DAYS' },
  h: { km: 'ម៉ោង', en: 'HOURS' },
  m: { km: 'នាទី', en: 'MINUTES' },
  s: { km: 'វិនាទី', en: 'SECONDS' },
  happy: { km: 'សួស្តីឆ្នាំថ្មី', en: 'HAPPY NEW YEAR' },
  after: { km: 'ជួបគ្នាឆ្នាំក្រោយ', en: 'SEE YOU NEXT YEAR' },
  players: { km: 'អ្នកលេងនៅលើទីលានឥឡូវនេះ', en: 'PLAYERS ON THE SQUARE NOW' },
  test: { km: 'សាកល្បង', en: 'TEST' },
  latinName: { km: '', en: 'ANGKOR HERITAGE' },
} as const;
type Word = keyof typeof WORDS;
const NAME_KM = 'មរតកអង្គរ';

const KH_DIGITS = '០១២៣៤៥៦៧៨៩';
/** Digits in the board's language. */
const digits = (s: string, km: boolean) => (km ? s.replace(/[0-9]/g, (d) => KH_DIGITS[+d]) : s);
const two = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

// Fonts (index.html loads them from Google Fonts; fallbacks so a page without them still reads).
const KH_DISPLAY = (px: number) => `400 ${px}px Koulen, 'Kantumruy Pro', 'Khmer Sangam MN', 'Khmer MN', sans-serif`;
const KH_TEXT = (px: number) => `700 ${px}px 'Kantumruy Pro', Koulen, 'Khmer Sangam MN', 'Khmer MN', sans-serif`;
const LAT_DIGITS = (px: number) => `700 ${px}px 'Pixelify Sans', 'Nunito Sans', ui-monospace, monospace`;
const LAT_TEXT = (px: number) => `800 ${px}px 'Nunito Sans', system-ui, sans-serif`;

const GOLD = '#ffd27a';
const GOLD_DEEP = '#e2a23a';
const GLOW = 'rgba(255, 178, 64, 0.85)';

// ── Phase 2's hooks ──────────────────────────────────────────────────────────

let players: number | null = null;
let testTag = false;
/** Something the board shows changed outside the clock (a hook, the fonts, the language). */
let dirty = true;

/** Phase 2: how many players are on the square now (null: the line is not drawn). */
export function setBoardPlayers(n: number | null): void {
  const v = n === null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n));
  if (v !== players) {
    players = v;
    dirty = true;
  }
}

/** Phase 2: the test room's "សាកល្បង / TEST" tag in the board's corner. */
export function setBoardTest(on: boolean): void {
  if (on !== testTag) {
    testTag = on;
    dirty = true;
  }
}

// (checks: `boardplayers=<n>` and `boardtest=1` draw the hooks' lines before phase 2 sets them)
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search);
  const n = q.get('boardplayers');
  if (n !== null && Number.isFinite(Number(n))) players = Math.max(0, Math.round(Number(n)));
  if (q.get('boardtest') === '1') testTag = true;
}

// ── The frame (gilt kbach on the dark screen, drawn once) ──────────────────

/** The frame and the screen's dark ground, painted once (gild: relief lit from the upper left). */
function paintFrame(): HTMLCanvasElement | OffscreenCanvas {
  const W = BOARD.w;
  const H = BOARD.h;
  const art = gild(
    CW,
    CH,
    (g) => g.setTransform(PPM, 0, 0, -PPM, 0, CH),
    PPM,
    (pen: KbachPen) => {
      const gr = pen.ground;
      const grad = gr.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, '#1b120d');
      grad.addColorStop(0.5, '#120c09');
      grad.addColorStop(1, '#1d130d');
      gr.fillStyle = grad;
      gr.fillRect(0, 0, W, H);
      // (the screen's faint warm sheen in the middle)
      const rg = gr.createRadialGradient(W / 2, H * 0.48, 0.2, W / 2, H * 0.48, W * 0.5);
      rg.addColorStop(0, 'rgba(90, 44, 18, 0.55)');
      rg.addColorStop(1, 'rgba(90, 44, 18, 0)');
      gr.fillStyle = rg;
      gr.fillRect(0, 0, W, H);
      const rect = (i: number): P[] => [
        [i, i],
        [W - i, i],
        [W - i, H - i],
        [i, H - i],
        [i, i],
      ];
      // Two gold rules round the edge, the outer broad.
      ribbon(pen.gold, rect(0.09), 0.11, 0.11, false);
      ribbon(pen.gold, rect(0.27), 0.035, 0.035, false);
      // Kbach scrolls in the corners, curling in from the rules.
      const r = 0.36;
      const corners: [number, number, 1 | -1, 1 | -1][] = [
        [1, 1, 1, -1],
        [-1, 1, -1, 1],
        [1, -1, -1, 1],
        [-1, -1, 1, -1],
      ];
      for (const [sx, sy, dir] of corners) {
        const cx = sx > 0 ? 0.72 : W - 0.72;
        const cy = sy > 0 ? 0.72 : H - 0.72;
        const at = Math.atan2(-sy, -sx);
        scroll(pen, { cx, cy, r, at, dir, turns: 1.4, from: [cx - sx * 0.42, cy - sy * 0.42], leaf: 0.95, leafStep: 0.62, minUp: -2, eye: true, fat: 0.5 });
        // (a flame leaf off each rule toward the middle)
        flame(pen, cx + sx * 0.05, sy > 0 ? 0.3 : H - 0.3, sx > 0 ? 0 : Math.PI, 0.9, 0.2, sy * (sx > 0 ? 0.9 : -0.9), { tongue: 0.4 });
        flame(pen, sx > 0 ? 0.3 : W - 0.3, cy + sy * 0.05, sy > 0 ? Math.PI / 2 : -Math.PI / 2, 0.75, 0.18, sx * (sy > 0 ? -0.9 : 0.9), { tongue: 0.4 });
      }
      // A crest of flame leaves over the name, a boss in its heart; a lotus band along the foot.
      const crest: P[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI * (i / 24);
        crest.push([W / 2 + Math.cos(a) * 1.0, H - 0.27 + Math.sin(a) * 0.05]);
      }
      flameRow(pen, crest, { len: 0.2, gap: 0.16, side: -1, lean: 0, curl: 0.4 });
      boss(pen, W / 2, H - 0.27, 0.06);
      lotusBand(pen, W / 2 - 2.2, W / 2 + 2.2, 0.23, 0.2, true);
    },
    { gold: ['#ffe08a', '#c98a2a'] },
  );
  return art.color;
}

// ── Pixel letters (the name in Koulen) ─────────────────────────────────────

/**
 * Text in hard pixels: drawn small in its font, every pixel either gold or nothing, then scaled up with
 * nearest pixels by the caller (the map's look: big crisp squares).
 */
function pixelText(text: string, font: string, px: number): HTMLCanvasElement {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 4;
  const h = Math.ceil(px * 1.7);
  const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: h });
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = font;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(text, 2, h * 0.5);
  const img = g.getImageData(0, 0, c.width, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    // (light gold over deep gold, top to bottom)
    const t = y / h;
    const r = 255;
    const gg = Math.round(232 - 70 * t);
    const b = Math.round(140 - 100 * t);
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const on = d[i + 3] > 120;
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = on ? 255 : 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ── The board ────────────────────────────────────────────────────────────────

export interface Board {
  mesh: Mesh;
  /** Once a frame: the brightness from the night; the picture again when what it shows changed (and it can be read). */
  update(f: MapFrame): void;
}

/**
 * Where a board stands (world m): its middle, its screen `w` × `h` (the picture is the same canvas, 2 : 1, whatever
 * the size), turned `yaw` (radians toward (sin, cos) in x, z: 0 faces south, +z), redrawn only within `far` m.
 */
export interface BoardPlace {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  yaw?: number;
  far?: number;
  name?: string;
}

/** The Kulen stage's board (plan.ts `BOARD`): facing south in its gate. */
export const KULEN_BOARD: BoardPlace = { x: BOARD.x, y: GROUND + BOARD.y, z: BOARD.z, w: BOARD.w, h: BOARD.h, yaw: 0, far: 260, name: 'nye:board' };

/** A board's mesh at its place (world m; the Kulen stage's by default), its picture drawn now. Each board has its own canvas. */
export function buildBoard(place: BoardPlace = KULEN_BOARD): Board {
  const yaw = place.yaw ?? 0;
  const far = place.far ?? 260;
  const name = place.name ?? 'nye:board';
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new MeshBasicMaterial({ map: texture, color: 0xffffff });
  material.name = name;
  const mesh = new Mesh(new PlaneGeometry(place.w, place.h), material);
  mesh.name = name;
  mesh.position.set(place.x, place.y, place.z);
  mesh.rotation.y = yaw;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  /** The carved frame, painted just after the build (`later`); till then plain gold rules. */
  let frame: HTMLCanvasElement | OffscreenCanvas | null = null;
  let title: { km: boolean; c: HTMLCanvasElement } | null = null;
  let latin: HTMLCanvasElement | null = null;

  const word = (k: Word, km: boolean) => WORDS[k][km ? 'km' : 'en'];

  /** Text centred at (x, y) in px, shrunk to `max` px wide, with the screen's glow. */
  const text = (s: string, x: number, y: number, font: string, max: number, fill: string | CanvasGradient = GOLD, blur = 18) => {
    g.font = font;
    const w = g.measureText(s).width;
    if (w > max) g.font = font.replace(/(\d+(?:\.\d+)?)px/, (_, n) => `${Math.floor((Number(n) * max) / w)}px`);
    g.shadowColor = GLOW;
    g.shadowBlur = blur;
    g.fillStyle = fill;
    g.fillText(s, x, y);
    g.shadowBlur = 0;
  };
  const goldFill = (y0: number, y1: number) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, '#fff1c2');
    gr.addColorStop(0.45, GOLD);
    gr.addColorStop(1, GOLD_DEEP);
    return gr;
  };

  /** The name on top: មរតកអង្គរ in Koulen pixels (and the English name under it with `lang=en`). */
  const drawTitle = (km: boolean, cy: number, scale: number) => {
    if (!title || title.km !== km) {
      title = { km, c: pixelText(NAME_KM, KH_DISPLAY(22), 22) };
      latin = km ? null : pixelText(WORDS.latinName.en, LAT_DIGITS(12), 12);
    }
    const c = title.c;
    const w = c.width * scale;
    const h = c.height * scale;
    g.imageSmoothingEnabled = false;
    g.shadowColor = 'rgba(255, 170, 60, 0.7)';
    g.shadowBlur = 14;
    g.drawImage(c, CW / 2 - w / 2, cy - h / 2, w, h);
    if (latin) {
      const lw = latin.width * 2;
      const lh = latin.height * 2;
      g.drawImage(latin, CW / 2 - lw / 2, cy + h * 0.36, lw, lh);
    }
    g.shadowBlur = 0;
    g.imageSmoothingEnabled = true;
  };

  /** A gold pill with words in it (the LIVE EVENT badge). */
  const pill = (s: string, cy: number, km: boolean) => {
    g.font = km ? KH_TEXT(25) : LAT_TEXT(23);
    const w = Math.min(420, g.measureText(s).width + 64);
    const h = 40;
    const x = CW / 2 - w / 2;
    g.shadowColor = GLOW;
    g.shadowBlur = 16;
    g.fillStyle = 'rgba(255, 196, 92, 0.16)';
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, cy - h / 2, w, h, h / 2);
    g.fill();
    g.stroke();
    g.shadowBlur = 0;
    // (a red "on air" dot)
    g.fillStyle = '#ff4a36';
    g.shadowColor = 'rgba(255, 60, 40, 0.9)';
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(x + 22, cy, 6.5, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    text(s, CW / 2 + 10, cy + (km ? 2 : 1), km ? KH_TEXT(25) : LAT_TEXT(23), w - 56, GOLD, 8);
  };

  /** Groups of two digits with colons, and their labels under them. */
  const clockRow = (groups: { v: number; label: string }[], km: boolean, cy: number, size: number) => {
    const n = groups.length;
    // (inside the corner scrolls: about 800 px in all)
    const slot = Math.min(232, 800 / (n + (n - 1) * 0.3));
    const colon = slot * 0.3;
    const total = n * slot + (n - 1) * colon;
    let x = CW / 2 - total / 2;
    const font = km ? KH_DISPLAY(size) : LAT_DIGITS(size);
    const fill = goldFill(cy - size * 0.5, cy + size * 0.45);
    groups.forEach((gp, i) => {
      // (a dark sunk panel behind each pair: the screen's segments)
      g.fillStyle = 'rgba(0, 0, 0, 0.35)';
      g.beginPath();
      g.roundRect(x + 6, cy - size * 0.62, slot - 12, size * 1.12, 14);
      g.fill();
      text(digits(two(gp.v), km), x + slot / 2, cy + (km ? size * 0.06 : 0), font, slot - 18, fill, 26);
      text(gp.label, x + slot / 2, cy + size * 0.84, km ? KH_TEXT(34) : LAT_TEXT(28), slot - 4, '#f3d9a0', 8);
      x += slot;
      if (i < n - 1) {
        // The colon: two square dots.
        g.shadowColor = GLOW;
        g.shadowBlur = 14;
        g.fillStyle = GOLD;
        const d = size * 0.1;
        g.fillRect(x + colon / 2 - d / 2, cy - size * 0.26, d, d);
        g.fillRect(x + colon / 2 - d / 2, cy + size * 0.12, d, d);
        g.shadowBlur = 0;
        x += colon;
      }
    });
  };

  const draw = (b: BoardShow, km: boolean) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CW, CH);
    if (frame) g.drawImage(frame, 0, 0, CW, CH);
    else {
      g.fillStyle = '#140d0a';
      g.fillRect(0, 0, CW, CH);
      g.strokeStyle = GOLD_DEEP;
      g.lineWidth = 10;
      g.strokeRect(9, 9, CW - 18, CH - 18);
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    switch (b.state) {
      case 'days':
      case 'hms': {
        drawTitle(km, 78, 3);
        pill(b.state === 'days' ? word('live', km) : word('last', km), 150, km);
        text(word('sub', km).replace(String(NYE_YEAR), digits(String(NYE_YEAR), km)), CW / 2, 196, km ? KH_TEXT(24) : LAT_TEXT(20), 520, '#f0cf8e', 6);
        const groups = [
          { v: b.h, label: word('h', km) },
          { v: b.m, label: word('m', km) },
          { v: b.s, label: word('s', km) },
        ];
        if (b.state === 'days') groups.unshift({ v: b.d, label: word('d', km) });
        clockRow(groups, km, 306, b.state === 'days' ? 140 : 170);
        break;
      }
      case 'last10': {
        drawTitle(km, 62, 2);
        const size = 330;
        const s = digits(String(b.n), km);
        text(s, CW / 2, 290 + (km ? 18 : 0), km ? KH_DISPLAY(size) : LAT_DIGITS(size), 800, goldFill(120, 450), 44);
        break;
      }
      case 'midnight': {
        drawTitle(km, 66, 2);
        sparkles();
        text(word('happy', km), CW / 2, 196, km ? KH_DISPLAY(96) : LAT_DIGITS(84), 860, goldFill(150, 240), 30);
        text(digits(String(NYE_YEAR), km), CW / 2, 340, km ? KH_DISPLAY(190) : LAT_DIGITS(190), 760, goldFill(250, 430), 40);
        break;
      }
      case 'after': {
        drawTitle(km, 78, 3);
        text(word('after', km), CW / 2, 250, km ? KH_DISPLAY(104) : LAT_DIGITS(80), 880, goldFill(200, 300), 30);
        text(`${word('happy', km)} ${digits(String(NYE_YEAR), km)}`, CW / 2, 352, km ? KH_TEXT(38) : LAT_TEXT(32), 700, '#f0cf8e', 10);
        break;
      }
    }
    if (players !== null && b.state !== 'last10') {
      const s = `${digits(String(players), km)} ${word('players', km)}`;
      text(s, CW / 2, CH - 58, km ? KH_TEXT(24) : LAT_TEXT(20), 640, '#f3d9a0', 6);
    }
    if (testTag) {
      // (red, in the top right corner, under the rules)
      const s = word('test', km);
      g.font = km ? KH_TEXT(22) : LAT_TEXT(20);
      const w = g.measureText(s).width + 28;
      g.fillStyle = '#c4211a';
      g.beginPath();
      g.roundRect(CW - 52 - w, 40, w, 36, 6);
      g.fill();
      text(s, CW - 52 - w / 2, 59, km ? KH_TEXT(22) : LAT_TEXT(20), w, '#fff', 0);
    }
    texture.needsUpdate = true;
  };

  /** A few fixed gold sparkles round the greeting. */
  const sparkles = () => {
    const pts: [number, number, number][] = [
      [150, 150, 16],
      [880, 170, 18],
      [210, 400, 12],
      [830, 410, 14],
      [100, 290, 9],
      [930, 300, 10],
      [300, 120, 8],
      [730, 115, 9],
    ];
    g.shadowColor = GLOW;
    g.shadowBlur = 12;
    g.fillStyle = '#ffe9b0';
    for (const [x, y, r] of pts) {
      g.beginPath();
      g.moveTo(x, y - r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.quadraticCurveTo(x, y, x, y + r);
      g.quadraticCurveTo(x, y, x - r, y);
      g.quadraticCurveTo(x, y, x, y - r);
      g.fill();
    }
    g.shadowBlur = 0;
  };

  const frustum = new Frustum();
  const view = new Matrix4();
  const sphere = new Sphere(mesh.position.clone(), Math.hypot(place.w, place.h) / 2);
  const inView = (cam: PerspectiveCamera) => {
    view.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    return frustum.setFromProjectionMatrix(view).intersectsSphere(sphere);
  };

  let lastKey = '';
  let lastSecond = -1;
  let drawn = false;
  const refresh = () => {
    const km = lang() === 'km';
    const b = boardAt();
    const key = `${b.state}|${b.d}|${b.h}|${b.m}|${b.s}|${b.n}|${km}|${players}|${testTag}`;
    if (key === lastKey && !dirty) return;
    lastKey = key;
    dirty = false;
    draw(b, km);
    drawn = true;
  };
  refresh();
  later(() => {
    frame = paintFrame();
    dirty = true;
    refresh();
  });

  // Fonts come late (Google Fonts): draw again once they are in (and the name in pixels again); shots wait for them.
  if (typeof document !== 'undefined' && document.fonts) {
    const again = () => {
      title = null;
      dirty = true;
    };
    const want = Promise.all([
      document.fonts.load(KH_DISPLAY(40), `${NAME_KM}០១២៣៤៥៦៧៨៩${WORDS.happy.km}${WORDS.after.km}`),
      document.fonts.load(KH_TEXT(40), Object.values(WORDS).map((w) => w.km).join('')),
      document.fonts.load(LAT_DIGITS(40), '0123456789 ANGKORHERITAGE HAPPY NEW YEAR SEE YOU NEXT'),
      document.fonts.load(LAT_TEXT(40), Object.values(WORDS).map((w) => w.en).join(' ')),
    ])
      .catch(() => undefined)
      .then(() => {
        again();
        refresh();
      });
    void trackSacred(Promise.race([want, new Promise((r) => setTimeout(r, 6000))]));
    document.fonts.ready.then(again).catch(() => undefined);
    document.fonts.addEventListener?.('loadingdone', again);
  }
  onLang(() => {
    title = null;
    dirty = true;
  });

  return {
    mesh,
    update(f: MapFrame) {
      const n = f.night;
      const k = n * n * (3 - 2 * n);
      // (a lit screen: plain by day, over 1 at night so the gold blooms)
      material.color.setScalar(1 + k * 1.15);
      // The picture again at most once a second, and only while it could be read (or never drawn yet).
      const sec = Math.floor(nyeNow() / 1000);
      if (sec === lastSecond && !dirty) return;
      const cam = f.camera;
      const dx = cam.position.x - place.x;
      const dz = cam.position.z - place.z;
      // (past `far` (≈ 260 m on Kulen) its digits are a few pixels; behind it, its back is the gate's stone; out of view, unseen)
      if (drawn && (dx * dx + dz * dz > far * far || dx * fx + dz * fz < -1 || !inView(cam))) return;
      lastSecond = sec;
      refresh();
    },
  };
}
