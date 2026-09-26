/**
 * The loading screen's explorer (map.html, main.ts): pixel-art frames of the
 * main character side by side in one SVG strip, which map.html steps through
 * (`.ld-hero`): standing, a six-frame walk to the right, then facing us to
 * wave when the map is built. Colours from src/character/palette.ts.
 */

/** Cells per frame (3 px each on screen, map.html); the soles stand on row 26. */
const W = 24;
const H = 29;

/** Palette letters; `.` is empty. `1` / `2` are dust, not outlined. */
const PAL: Record<string, string> = {
  o: '#1d1219',
  // hair: rim-lit by the temple glow, light, base, dark
  r: '#8a5b3d',
  j: '#5c4131',
  h: '#3b2c25',
  H: '#261b18',
  // skin, blush, eye and its white, mouth
  s: '#fbcb9c',
  S: '#fab57c',
  d: '#c98252',
  b: '#f5906a',
  e: '#1e1613',
  i: '#f5f0ea',
  m: '#c9503f',
  // shirt: light, base, shade, rolled cuff
  C: '#e1d3be',
  c: '#d8c4ab',
  x: '#bd9f7d',
  y: '#efe4d2',
  // krama: red, light check, dark check, fringe
  K: '#bc3242',
  L: '#e46d50',
  k: '#822333',
  f: '#a22c38',
  // leather and its brass buckle
  P: '#8c5836',
  p: '#7c4c2f',
  q: '#5c3824',
  g: '#c8922e',
  // shorts, socks, boots (near side lit, far side dark)
  N: '#5c5f62',
  n: '#505356',
  v: '#45484b',
  W: '#e9dccb',
  w: '#c4b4a1',
  u: '#6a4228',
  B: '#8a5732',
  U: '#4d301d',
  z: '#2a1c14',
  1: '#e8d2b0',
  2: '#e8d2b0',
};
const DUST: Record<string, number> = { 1: 0.55, 2: 0.3 };

/** The far leg: the same art in shade. */
const FAR: Record<string, string> = { n: 'v', N: 'v', S: 'd', W: 'w', u: 'U', B: 'U' };

type Art = readonly string[];
/** Art placed at a cell; `far` shades it. */
type Layer = [Art, number, number, boolean?];

// --- Side view (facing right) ---

/** Curly hair lit from above, the face and nose to the right, looking ahead. */
const HEAD = [
  '....rr.rrr....',
  '..rrjjrjjhrr..',
  '.rjjhhhhHjjhr.',
  '.jhhHjjhhhhhhr',
  'rjhhhhhHjjhhhh',
  'jhHjjhhhhhhHh.',
  '.hhhhHhjjHhSh.',
  'jjhhhhhdSieSS.',
  'hhHhjjhdSieSSS',
  '.hhhhhhdSSbSm.',
  '..HhHh.hddSS..',
];

/** Shirt, the pack's strap down his chest, belt and buckle. */
const TORSO = [
  'xccCqC',
  'xccCqC',
  'xcccqc',
  'xcccqc',
  'xxccqx',
  'qqqpgq',
];

/** The leather backpack, its flap and buckle. */
const PACK = ['.pPP', 'pPPP', 'qqgq', 'qpPp', 'qpPp', '.qqq'];

/** The krama wrapped round his neck. */
const WRAP = ['KLKKLKk', 'kKkKKkK'];

/** Krama tails hanging down his chest (standing), or flying back, three flutters. */
const HANG: Art = ['K', 'L', 'K', 'f'];
const TAILS: Art[] = [
  ['...KKLKK', 'KLKkK...', 'f.f.....'],
  ['....KLKK', '.KKkKK..', 'f.fK....', '...f....'],
  ['..KKLKKK', 'fKLkK...', '.f.f....'],
];

/** The near arm from the shoulder (column 13): back, hanging, forward. */
const ARM_BACK = ['..CC', '..CC', '.yy.', '.SS.', 'Sd..'];
const ARM_MID = ['CC', 'CC', 'yy', 'SS', 'Sd'];
const ARM_FWD = ['CC..', 'CC..', '.yy.', '.SS.', '..Sd'];

/**
 * One leg from the shorts' hem (row 20) to the ground (row 26), near-side
 * colours, from column 7 (the far leg sits one cell back).
 */
const LEG = {
  stand: ['.....nnn...', '.....nNn...', '......SS...', '......WW...', '.....uuu...', '.....uuuB..', '.....zzzz..'],
  front: ['......nnn..', '.......nNn.', '........SS.', '........WW.', '.......uuuB', '.......uuuu', '.......zzz.'],
  under: ['.....nnn...', '......nNn..', '.......SS..', '.......WW..', '......uuu..', '......uuuB.', '......zzzz.'],
  back: ['....nnn....', '...nNn.....', '..SS.......', '..WW.......', '.uuu.......', '..uuuB.....', '....zz.....'],
  lift: ['....nnn....', '...nNn.....', '..SS.......', '.WW........', '.uuu.......', '.uuuB......', '...........'],
  pass: ['....nnn....', '.....nNn...', '.....SS....', '....uuu....', '....uuuB...', '....zzzz...', '...........'],
};
type Leg = keyof typeof LEG;

/** The shorts' seat, above the legs. */
const SEAT = ['nnnNNn'];

/** A side frame: the legs, how far the body drops (the pack follows a frame late), the near arm, the krama. */
function sideFrame(near: Leg, far: Leg, bob: number, pack: number, arm: Art, tail: Art | null, extra: Layer[] = []): Layer[] {
  const armX = arm === ARM_BACK ? 11 : 13;
  return [
    [LEG[far], 6, 20, true],
    ...extra,
    [PACK, 7, 13 + pack],
    [SEAT, 11, 19],
    [LEG[near], 7, 20],
    [TORSO, 11, 13 + bob],
    tail ? [tail, 3, 12 + bob] : [HANG, 16, 14 + bob],
    [HEAD, 6, 1 + bob],
    [WRAP, 11, 12 + bob],
    [arm, armX, 14 + bob],
  ];
}

// --- Front view (facing us) ---

/** Facing us, his left arm left out (it waves). */
const FRONT = [
  '.....rr.rrrr....',
  '...rrjjrjjhjr...',
  '.rrjhhhHhhjjhrr.',
  'rjjhHjjhhhhhHjhr',
  'jhhhhhhhHjjhhhhj',
  'hhhjjhhhhhhhHhhh',
  'hhhhhhhSSHhhShhh',
  'hjhSieSSSSeiShjh',
  'hhhSieSSSSeiShhh',
  '.hhSbSSmmSSbShh.',
  '..hdSSSSSSSSdh..',
  '...KLKKLKKLKKK..',
  '..CkKKKLKKKkKC..',
  '.CCCqCCCCCKqCC..',
  '.CCCqCCCCCLqCC..',
  '.yyxqcccccKqx...',
  '.SS.qcccccfq....',
  '.Sd.qqppgppq....',
  '....nnnnnnnn....',
  '....nnnvvnnn....',
  '....nNn..nNn....',
  '.....SS..SS.....',
  '.....WW..WW.....',
  '....uuu..uuu....',
  '....uuuBBuuu....',
  '....zzzzzzzz....',
];

/** His left arm raised to wave (from column 18, row 4): the hand out, then in. */
const WAVE: Art[] = [
  ['..sss', '.ssss', '..sSs', '..SS.', '.SS..', '.yy..', '.CC..', 'CC...', 'CC...'],
  ['.....', '.sss.', 'ssss.', '.sSs.', '.SS..', '.yy..', '.CC..', 'CC...', 'CC...'],
];

// --- Drawing ---

/** The layers on a W × H grid of palette letters, outlined. */
function paint(layers: Layer[]): string[][] {
  const g = Array.from({ length: H }, () => Array<string>(W).fill('.'));
  for (const [art, x, y, far] of layers)
    art.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        const gx = x + i;
        const gy = y + j;
        if (c !== '.' && gx >= 0 && gx < W && gy >= 0 && gy < H) g[gy][gx] = far ? (FAR[c] ?? c) : c;
      }
    });
  // A one-cell dark outline around the figure (not the dust).
  const solid = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && g[y][x] !== '.' && g[y][x] !== 'o' && !(g[y][x] in DUST);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (g[y][x] === '.' && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g[y][x] = 'o';
  return g;
}

/** One rect per run of same-colour cells, the frame at column `ox` of the strip. */
function rects(g: string[][], ox: number): string {
  let out = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = g[y][x];
      let e = x + 1;
      while (e < W && g[y][e] === c) e++;
      if (c !== '.') out += `<rect x="${ox + x}" y="${y}" width="${e - x}" height="1" fill="${PAL[c]}"${c in DUST ? ` opacity="${DUST[c]}"` : ''}/>`;
      x = e;
    }
  }
  return out;
}

/** The frames, in strip order (map.html's keyframes count on it). */
function frames(): Layer[][] {
  const puff: Art = ['.1.', '111'];
  const fade: Art = ['2..', '..2'];
  return [
    // 0: standing
    sideFrame('stand', 'stand', 0, 0, ARM_MID, null),
    // 1–6: the walk
    sideFrame('front', 'back', 0, 0, ARM_BACK, TAILS[0], [[puff, 4, 25]]),
    sideFrame('under', 'lift', 1, 0, ARM_BACK, TAILS[1], [[fade, 3, 24]]),
    sideFrame('stand', 'pass', 0, 1, ARM_MID, TAILS[2]),
    sideFrame('back', 'front', 0, 0, ARM_FWD, TAILS[0], [[puff, 5, 25]]),
    sideFrame('lift', 'under', 1, 0, ARM_FWD, TAILS[1], [[fade, 3, 24]]),
    sideFrame('pass', 'stand', 0, 1, ARM_MID, TAILS[2]),
    // 7–8: facing us, waving
    [[FRONT, 5, 1], [WAVE[0], 18, 4]],
    [[FRONT, 5, 1], [WAVE[1], 18, 4]],
  ];
}

/** A soft shadow on the ground under the boots (rows 26–28), wider as he strides. */
function shadow(g: string[][], ox: number): string {
  let a = W;
  let b = -1;
  for (const row of g) row.forEach((c, x) => 'uBUz'.includes(c) && ((a = Math.min(a, x)), (b = Math.max(b, x))));
  return [
    [26, a - 1, b + 1],
    [27, a - 2, b + 2],
    [28, a - 1, b + 1],
  ]
    .map(([y, l, r]) => `<rect x="${ox + l}" y="${y}" width="${r - l + 1}" height="1"/>`)
    .join('');
}

/**
 * The strip: every frame side by side, W × H cells each. The figure is its
 * own group (`.ld-hero-fig`) so it can hop off its shadow.
 */
export function loadingHero(): string {
  const all = frames().map(paint);
  const shade = all.map((g, i) => shadow(g, i * W)).join('');
  const fig = all.map((g, i) => rects(g, i * W)).join('');
  return (
    `<svg viewBox="0 0 ${all.length * W} ${H}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">` +
    `<g fill="#07040a" opacity=".38">${shade}</g><g class="ld-hero-fig">${fig}</g></svg>`
  );
}
