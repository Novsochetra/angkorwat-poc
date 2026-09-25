/**
 * The story's "many hands" picture (beats.ts scenes `one` and `hands`):
 * Angkor Wat's front — five lotus-bud towers over three stepped galleries —
 * drawn with thousands of small gold blocks, one block for one person, over
 * its reflection in the moat.
 *
 * - `show('one')`: only the first block, glowing, at the foot of the temple.
 * - `show('all')`: every other block comes, from the ground up (the towers
 *   last), each dropping into its place; then they shimmer.
 *
 * The temple lives in unit space: x −0.5‥0.5 across, y 0‥0.56 up from the
 * ground line. `frame(dt)` draws it (the story calls it while shown).
 */
export interface DotTemple {
  readonly canvas: HTMLCanvasElement;
  show(mode: 'one' | 'all', instant: boolean): void;
  frame(dt: number): void;
  resize(): void;
}

/** Height of the central tower's tip (units). */
const TOP = 0.56;
/** Gold, dark to light (a block's tone: height, the light from the left, chance). */
const GOLD = ['#a8661c', '#c98026', '#e0992f', '#f2ae33', '#fcc550', '#ffe07c'];

/** Galleries and terraces: [from y, to y, half width]. */
const TIERS: [number, number, number][] = [
  [0, 0.03, 0.5],
  [0.03, 0.085, 0.46],
  [0.085, 0.1, 0.42],
  [0.1, 0.165, 0.35],
  [0.165, 0.205, 0.27],
  [0.205, 0.245, 0.24],
];
/** Lotus-bud towers: [centre x, base y, half width at the base, height]. */
const TOWERS: [number, number, number, number][] = [
  [0, 0.245, 0.058, 0.3],
  [-0.13, 0.245, 0.043, 0.18],
  [0.13, 0.245, 0.043, 0.18],
  [-0.215, 0.225, 0.04, 0.165],
  [0.215, 0.225, 0.04, 0.165],
  // (the west gate's roof over the causeway, in front of it all)
  [0, 0.085, 0.05, 0.07],
];

/** Tiers of a tower (its outline steps in at each). */
const TOWER_TIERS = 7;

/** Half width of a lotus-bud tower `h` (0‥1) up its height: it swells a little, then closes in tier by tier to a point, with a short spike on top. */
function budHalfWidth(h: number): number {
  if (h > 1.07) return -1;
  if (h > 1) return 0.1;
  const q = (Math.floor(h * TOWER_TIERS) + 0.5) / TOWER_TIERS;
  return (1 + 0.22 * Math.sin(Math.PI * q)) * Math.pow(Math.max(0, 1 - Math.pow(q, 1.6)), 0.8);
}

/** Is the point on the ledge between two of a tower's tiers (drawn darker)? */
function onLedge(x: number, y: number): boolean {
  for (const [cx, base, hw, height] of TOWERS) {
    const h = (y - base) / height;
    if (h >= 0 && h < 1 && Math.abs(x - cx) <= hw * 1.3 && (h * TOWER_TIERS) % 1 < 0.14) return true;
  }
  return false;
}

/** Is the point (units) inside the temple? Also leaves the galleries' openings (grid column `i`) empty. */
function inside(x: number, y: number, i: number): boolean {
  const ax = Math.abs(x);
  for (const [cx, base, hw, height] of TOWERS) {
    const h = (y - base) / height;
    if (h >= 0 && Math.abs(x - cx) <= hw * budHalfWidth(h)) return true;
  }
  for (const [y0, y1, hw] of TIERS) {
    if (y < y0 || y >= y1 || ax > hw) continue;
    // Colonnades: a gap every few columns along the outer and the second gallery.
    if (y > 0.04 && y < 0.075 && ax > 0.07 && ax < 0.44 && i % 4 === 1) return false;
    if (y > 0.11 && y < 0.15 && ax > 0.06 && ax < 0.33 && i % 5 === 2) return false;
    return true;
  }
  return false;
}

interface Block {
  /** Units. */
  x: number;
  y: number;
  /** When it arrives (s after `show('all')`). */
  t: number;
  tone: number;
  /** Shimmer phase. */
  ph: number;
}

export function createDotTemple(): DotTemple {
  const canvas = document.createElement('canvas');
  canvas.className = 'st-dots';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d')!;
  let blocks: Block[] = [];
  let byTone: Block[][] = [];
  /** The first block: the one person. */
  let first: Block | null = null;
  let cols = 0;
  let mode: 'one' | 'all' = 'one';
  let clock = 0;
  /** Layout (CSS px): temple width, centre x, ground line y, block pitch and size. */
  const L = { w: 0, cx: 0, base: 0, pitch: 0, size: 0, dpr: 1 };

  // Seeded, so the temple is the same every time (and in shots).
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  function build(n: number): void {
    cols = n;
    seed = 7;
    const u = 1 / n;
    blocks = [];
    for (let j = 0; (j + 0.5) * u < TOP + 0.05; j++)
      for (let i = 0; i < n; i++) {
        const x = -0.5 + (i + 0.5) * u;
        const y = (j + 0.5) * u;
        if (!inside(x, y, i)) continue;
        const light = 0.25 + (y / TOP) * 0.45 + (x < 0 ? 0.12 : 0) + rand() * 0.3 - (onLedge(x, y) ? 0.35 : 0);
        blocks.push({ x, y, t: 0.3 + (y / TOP) * 3.9 + rand() * 0.9, tone: Math.max(0, Math.min(GOLD.length - 1, Math.floor(light * GOLD.length))), ph: rand() * Math.PI * 2 });
      }
    // The first block: on the ground, in the middle (it is there from the start).
    first = blocks.reduce((a, b) => (Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y) ? b : a));
    first.t = -10;
    first.tone = GOLD.length - 1;
    byTone = GOLD.map((_, k) => blocks.filter((b) => b.tone === k));
  }

  function resize(): void {
    const vw = innerWidth;
    const vh = innerHeight;
    L.dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * L.dpr);
    canvas.height = Math.round(vh * L.dpr);
    const phone = vw < 640;
    L.w = Math.min(vw * (phone ? 0.9 : 0.8), (vh * 0.46) / TOP, 980);
    L.cx = vw / 2;
    L.base = vh * (phone ? 0.52 : 0.58);
    const n = Math.round(Math.min(160, Math.max(72, L.w / 5.5)));
    if (n !== cols) build(n);
    L.pitch = L.w / cols;
    L.size = Math.max(2, L.pitch * 0.74);
  }

  function frame(dt: number): void {
    clock += dt;
    const { dpr, size, cx, base, w } = L;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const all = mode === 'all';
    const reflect = w * TOP * 0.42;

    // The water's edge: a thin gold line fading out to the sides.
    const edge = ctx.createLinearGradient(cx - w * 0.7, 0, cx + w * 0.7, 0);
    edge.addColorStop(0, 'rgba(255, 200, 90, 0)');
    edge.addColorStop(0.5, 'rgba(255, 200, 90, 0.4)');
    edge.addColorStop(1, 'rgba(255, 200, 90, 0)');
    ctx.globalAlpha = all ? 1 : Math.min(1, clock / 1.5);
    ctx.fillStyle = edge;
    ctx.fillRect(cx - w * 0.7, base + size * 0.9, w * 1.4, 1);

    for (let k = 0; k < GOLD.length; k++) {
      ctx.fillStyle = GOLD[k];
      for (const b of byTone[k]) {
        if (!all || b === first) continue;
        const age = clock - b.t;
        if (age <= 0) continue;
        const p = Math.min(1, age / 0.45);
        const settled = clock - 5.5;
        const a = p * (settled > 0 ? 0.86 + 0.14 * Math.sin(clock * 1.7 + b.ph) : 1);
        const x = cx + b.x * w;
        const y = base - b.y * w;
        ctx.globalAlpha = a;
        ctx.fillRect(x - size / 2, y - size / 2 - (1 - p) * (1 - p) * 14, size, size);
        // Its reflection: fainter the deeper it is, rippling.
        const depth = b.y * w;
        if (depth < reflect) {
          ctx.globalAlpha = a * 0.2 * (1 - depth / reflect);
          ctx.fillRect(x - size / 2 + Math.sin(depth * 0.22 + clock * 2.1) * 1.4, base + depth + size - size / 2, size, size * 0.7);
        }
      }
    }

    // The one person: a big bright block alone, glowing; it becomes one block among the others as they come.
    if (first) {
      const x = cx + first.x * w;
      const y = base - first.y * w;
      const alone = all ? Math.max(0, 1 - clock / 1.8) : 1;
      const fadeIn = all ? 1 : Math.min(1, clock / 0.8);
      const glow = all ? Math.max(0, 1 - clock / 2.5) : 0.75 + 0.25 * Math.sin(clock * 2.4);
      if (glow > 0) {
        const r = size * 16;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255, 214, 120, 0.6)');
        g.addColorStop(0.35, 'rgba(255, 180, 70, 0.2)');
        g.addColorStop(1, 'rgba(255, 170, 60, 0)');
        ctx.globalAlpha = glow * fadeIn;
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const s = size * (1 + 2.2 * alone);
      ctx.globalAlpha = fadeIn;
      ctx.fillStyle = GOLD[GOLD.length - 1];
      ctx.fillRect(x - s / 2, y - s / 2 - (s - size) / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  resize();
  return {
    canvas,
    show(m, instant) {
      // (the first block is there from the start: from `one` it keeps glowing while the others come)
      if (m !== mode || instant) clock = instant ? 60 : 0;
      mode = m;
      frame(0);
    },
    frame,
    resize() {
      resize();
      frame(0);
    },
  };
}
