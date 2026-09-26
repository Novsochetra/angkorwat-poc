/**
 * The golden figures as small voxel sketches (cells of `CELL` m): each a
 * Khmer motif on a round lotus plinth, facing +z, about a metre tall (the
 * roaming explorer is 2.4 m). Tones: `G` gold, `B` bright (tops, jewels),
 * `D` deep (recesses, patterns), `K` dark (eyes, mouths), `P` pale gold
 * (tusks, highlights). index.ts bakes them into one mesh.
 */

/** Cell size (m). */
export const CELL = 0.06;

export const G = 0;
export const B = 1;
export const D = 2;
export const K = 3;
export const P = 4;

type V3 = readonly [number, number, number];

/** A sparse grid of tone-coloured cells; x across (0 = the middle column), y up from the plinth's foot, z forward. */
export class Sketch {
  readonly cells = new Map<string, number>();

  set(x: number, y: number, z: number, tone = G): void {
    this.cells.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`, tone);
  }
  del(x: number, y: number, z: number): void {
    this.cells.delete(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
  }
  has(x: number, y: number, z: number): boolean {
    return this.cells.has(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`);
  }
  /** Recolour a cell that is there. */
  paint(x: number, y: number, z: number, tone: number): void {
    if (this.has(x, y, z)) this.set(x, y, z, tone);
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tone = G): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, tone);
  }

  /** An ellipsoid round (cx, cy, cz) (cell centres inside it). `yMin`: only the part at or above that row. */
  ell(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, tone = G, yMin = -Infinity): void {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.max(Math.floor(cy - ry), Math.ceil(yMin)); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
          if (d <= 1.0001) this.set(x, y, z, tone);
        }
  }

  /** An upright disc of radius r from row y0 to y1. */
  cyl(cx: number, cz: number, y0: number, y1: number, r: number, tone = G): void {
    for (let y = y0; y <= y1; y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.01) this.set(x, y, z, tone);
  }

  /** A thick line through points (a limb, a trunk, a tail): balls of radius r0 → r1 along it. */
  seg(pts: readonly V3[], r0: number, r1 = r0, tone = G): void {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, az] = pts[i - 1];
      const [bx, by, bz] = pts[i];
      const len = Math.hypot(bx - ax, by - ay, bz - az);
      const n = Math.max(1, Math.ceil(len * 3));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const r = r0 + (r1 - r0) * ((run + len * t) / Math.max(1e-6, total));
        this.ball(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, r, tone);
      }
      run += len;
    }
  }

  ball(cx: number, cy: number, cz: number, r: number, tone = G): void {
    if (r < 0.6) {
      this.set(cx, cy, cz, tone);
      return;
    }
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r + 0.01) this.set(x, y, z, tone);
  }

  /** Mirror every cell with x > 0 onto −x (and back): a figure drawn on its right side only. */
  mirror(): void {
    for (const [k, tone] of [...this.cells]) {
      const [x, y, z] = k.split(',').map(Number);
      if (x !== 0 && !this.has(-x, y, z)) this.set(-x, y, z, tone);
    }
  }

  /** Mirror a drawing made in `fn`: run it once as is and once with x flipped. */
  both(fn: (s: number) => void): void {
    fn(1);
    fn(-1);
  }
}

/** The lotus plinth every figure stands on (2 rows: petals round a flat top). */
function plinth(s: Sketch, r = 4.2): void {
  s.cyl(0, 0, 0, 0, r, D);
  s.cyl(0, 0, 1, 1, r - 0.7, G);
  // Petal tips round the rim.
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    s.set(Math.round(Math.sin(t) * (r - 0.2)), 1, Math.round(Math.cos(t) * (r - 0.2)), B);
  }
}

/** A tall pointed Khmer crown (mukuta) from row y. */
function crown(s: Sketch, x: number, y: number, z: number, h = 4): void {
  s.cyl(x, z, y, y, 1.3, B);
  for (let i = 1; i < h; i++) s.cyl(x, z, y + i, y + i, Math.max(0, 1.1 - (i * 1.1) / h), i % 2 ? G : B);
  s.set(x, y + h, z, P);
}

// ── The figures ─────────────────────────────────────────────────────────────

/** A celestial dancer (apsara) of Angkor Wat's walls: knees bent out, one hand raised, fingers bent back, a tall crown. */
function apsara(s: Sketch): void {
  plinth(s);
  // Legs in the plié of Khmer dance, feet turned out.
  s.both((m) => {
    s.seg([[m * 1, 8, 0], [m * 3, 5, 0.5], [m * 2, 2, 0]], 0.7, 0.6);
    s.seg([[m * 2, 2, 0], [m * 3.5, 2, 1]], 0.5);
  });
  // The sampot skirt, its front fold, a belt.
  s.ell(0, 8, 0, 2.6, 1.6, 1.6);
  s.seg([[0, 7, 1.5], [0, 4, 1.8]], 0.6, 0.8, D);
  s.cyl(0, 0, 9, 9, 1.6, B);
  // Slender waist and torso, a jewelled collar.
  s.ell(0, 11, 0, 1.6, 1.8, 1.1);
  s.cyl(0, 0, 12, 12, 1.5, B);
  s.set(0, 13, 0);
  // Head, eyes, the crown.
  s.ell(0, 14.6, 0, 1.2, 1.4, 1.2);
  s.set(-1, 15, 1, K);
  s.set(1, 15, 1, K);
  crown(s, 0, 16, 0, 4);
  // Arms: the right raised, the hand bent back; the left out and down, the hand flicked up.
  s.seg([[1.5, 12, 0], [3.5, 13, 0.3], [4, 16, 0.5]], 0.55);
  s.seg([[4, 16, 0.5], [5, 16.8, 0.2]], 0.45, 0.45, B);
  s.seg([[-1.5, 12, 0], [-3.5, 11, 0.4], [-5, 9.5, 0.6]], 0.55);
  s.seg([[-5, 9.5, 0.6], [-6, 10.5, 0.4]], 0.45, 0.45, B);
}

/** The seven-headed naga of the causeways: coils on the plinth, a hood of seven heads fanned out. */
function naga(s: Sketch): void {
  plinth(s);
  // Coils.
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    s.ball(Math.sin(t) * 2.7, 2.5 + (a / 48) * 1.6, Math.cos(t) * 2.7, 1, a % 6 ? G : D);
  }
  // The body rising, scaled belly in front.
  s.seg([[0, 4, -0.6], [0, 7, -0.8], [0, 9, -0.4]], 1.7, 1.5);
  for (let y = 5; y <= 8; y++) s.paint(0, y, 1, B);
  // The hood: a broad fan behind seven heads, the middle one highest.
  for (let r = 1.5; r <= 5.2; r += 0.5)
    for (let a = -1.35; a <= 1.35; a += 0.07) s.set(Math.sin(a) * r, 8.5 + Math.cos(a) * r * 0.9, -0.6, r > 4.6 ? B : D);
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.45;
    const hx = Math.sin(a) * 5.6;
    const hy = 8.5 + Math.cos(a) * 5.2;
    s.seg([[hx * 0.5, 8.5 + (hy - 8.5) * 0.5, -0.2], [hx, hy, 0.2]], 0.8, 0.7);
    // Head: a snout forward, eyes, a small crest.
    s.ell(hx, hy, 0.9, 1, 0.9, 1.4, B);
    s.set(hx, hy - 0.2, 2.3, G);
    s.set(hx - 0.7, hy + 0.5, 1.6, K);
    s.set(hx + 0.7, hy + 0.5, 1.6, K);
    s.set(hx, hy + 1.1, 0.4, P);
  }
}

/** Garuda (krut), the bird-man who holds up the walls of Preah Khan: talons, raised arms, wings spread behind, a beak and crown. */
function garuda(s: Sketch): void {
  plinth(s);
  s.both((m) => {
    // Bird legs, knees out, talons gripping the plinth.
    s.seg([[m * 1.2, 7, 0], [m * 2.8, 5, 0.6], [m * 2, 2.5, 0.5]], 0.75, 0.55);
    s.seg([[m * 2, 2, 0.5], [m * 2.3, 2, 2]], 0.45, 0.45, D);
    s.seg([[m * 2, 2, 0.5], [m * 3, 2, 1.4]], 0.45, 0.45, D);
    // Arms up, holding the sky.
    s.seg([[m * 1.8, 11.5, 0], [m * 4, 12.5, 0.4], [m * 4, 15.5, 0.6]], 0.6);
    s.ball(m * 4, 16, 0.6, 0.6, B);
    // Wings: feathers fanned up and out behind the shoulders.
    for (let f = 0; f < 5; f++) s.seg([[m * 1.5, 10.5, -1.2], [m * (3.5 + f * 0.9), 9 + f * 1.5, -1.8]], 0.6, 0.45, f % 2 ? G : D);
  });
  // Body and chest, a jewelled belt and collar.
  s.ell(0, 9.5, 0, 1.9, 2.5, 1.3);
  s.cyl(0, 0, 8, 8, 1.8, B);
  s.cyl(0, 0, 11.6, 11.6, 1.6, B);
  // Bird head with a hooked beak, round eyes, a crown.
  s.ell(0, 13.6, 0.2, 1.3, 1.3, 1.3);
  s.seg([[0, 13.6, 1.2], [0, 13, 2.6], [0, 12.2, 2.8]], 0.55, 0.45, B);
  s.set(-1, 14, 1, K);
  s.set(1, 14, 1, K);
  crown(s, 0, 15, 0, 3);
}

/** One of the Bayon's calm smiling faces, on a small tower with a face on every side and a lotus-bud top. */
function bayonFace(s: Sketch): void {
  plinth(s);
  s.box(-3, 3, 2, 2, -3, 3, D);
  s.box(-3, 3, 3, 11, -3, 3, G);
  // A face on each side: closed eyes under arched brows, a broad nose, full lips in the Angkor smile, long ears.
  for (let side = 0; side < 4; side++) {
    const put = (u: number, y: number, out: number, tone: number) => {
      // (u across the face, `out` from the middle: 3 is the surface row, 4 stands out)
      const [x, z] = side === 0 ? [u, out] : side === 1 ? [out, -u] : side === 2 ? [-u, -out] : [-out, u];
      s.set(x, y, z, tone);
    };
    for (const u of [-2, -1, 1, 2]) put(u, 9, 3, K);
    for (const u of [-2, -1, 1, 2]) put(u, 10, 4, B);
    put(0, 8, 4, G);
    put(0, 7, 4, B);
    for (const u of [-1, 0, 1]) put(u, 5, 4, B);
    put(-2, 6, 3, D);
    put(2, 6, 3, D);
    // The headband.
    for (let u = -3; u <= 3; u++) put(u, 11, 4, B);
  }
  // Crown tiers and the lotus bud.
  s.box(-2, 2, 12, 12, -2, 2, B);
  s.box(-2, 2, 13, 13, -2, 2, G);
  s.cyl(0, 0, 14, 14, 1.5, B);
  s.cyl(0, 0, 15, 16, 1, G);
  s.set(0, 17, 0, P);
}

/** A singha, the temple lion guarding a stair: seated, chest out, mane curled, mouth open. */
function singha(s: Sketch): void {
  plinth(s);
  s.ell(0, 5, -1.3, 2.8, 2.6, 2.4);
  s.ell(0, 8.4, 0.5, 2.1, 3, 1.8);
  s.both((m) => {
    s.seg([[m * 1.4, 7, 1.4], [m * 1.5, 2.5, 2]], 0.8);
    s.box(m * 1.5 - 0.5, m * 1.5 + 0.5, 2, 2, 2, 3, B);
    // Hind feet.
    s.box(m * 2 - 1, m * 2 + 1, 2, 3, -1, 1, G);
  });
  // Mane (curls) and head.
  s.ell(0, 12, 0.3, 2.9, 2.9, 1.5, D);
  for (let a = 0; a < 14; a++) {
    const t = (a / 14) * Math.PI * 2;
    s.set(Math.sin(t) * 2.9, 12 + Math.cos(t) * 2.9, 0.8, B);
  }
  s.ell(0, 12, 1.6, 1.9, 1.9, 1.5);
  s.set(-1, 13, 3, B);
  s.set(1, 13, 3, B);
  s.set(-1, 13, 3.2, K);
  s.set(1, 13, 3.2, K);
  s.box(-1, 1, 10, 11, 3, 3, K);
  s.set(0, 12, 3.4, B);
  // Tail curled up behind.
  s.seg([[0, 4, -3.5], [0, 7, -5], [0, 10, -4.5], [0, 10.5, -3.2]], 0.55, 0.5, D);
}

/** Nandi, Shiva's bull of the holy mountain: lying down, legs folded, hump, horns, a bell at the neck. */
function nandi(s: Sketch): void {
  plinth(s, 4.8);
  s.ell(0, 4.8, -0.8, 2.9, 2.5, 4.6);
  s.both((m) => {
    s.box(m * 2.5 - 1, m * 2.5 + 1, 2, 2, 1, 3, D);
    s.box(m * 2.5 - 1, m * 2.5 + 1, 2, 2, -4, -2, D);
    s.seg([[m * 1, 10.3, 3.8], [m * 2, 11.5, 3.6], [m * 2.4, 12.6, 3]], 0.45, 0.4, P);
    s.set(m * 2, 9.6, 3.6, D);
  });
  // Hump, neck, head, muzzle.
  s.ell(0, 7.8, 1, 1.4, 1.3, 1.5, B);
  s.seg([[0, 7, 2], [0, 8.6, 3.6]], 1.3, 1.1);
  s.ell(0, 9, 4.6, 1.3, 1.5, 1.6);
  s.ell(0, 8, 5.9, 1.05, 0.9, 0.9, B);
  s.set(-1, 9.6, 5.4, K);
  s.set(1, 9.6, 5.4, K);
  // Bell collar.
  s.cyl(0, 3, 7, 7, 1.3, B);
  s.set(0, 6, 4.3, P);
  // Tail.
  s.seg([[1.5, 5, -5.2], [2.6, 3.5, -4], [3, 2.2, -2.5]], 0.4, 0.4, D);
}

/** A lotus in bloom on its stem, a bud beside it and a round leaf. */
function lotus(s: Sketch): void {
  plinth(s);
  s.seg([[0, 2, 0], [0, 9, 0]], 0.5, 0.5, D);
  // Outer and inner petals, the seed pod.
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    s.seg([[Math.sin(t) * 1.2, 9.5, Math.cos(t) * 1.2], [Math.sin(t) * 3.2, 11, Math.cos(t) * 3.2], [Math.sin(t) * 3.7, 12.8, Math.cos(t) * 3.7]], 0.6, 0.45, a % 2 ? G : B);
  }
  for (let a = 0; a < 7; a++) {
    const t = (a / 7) * Math.PI * 2 + 0.3;
    s.seg([[Math.sin(t) * 0.8, 10.5, Math.cos(t) * 0.8], [Math.sin(t) * 2, 13, Math.cos(t) * 2], [Math.sin(t) * 1.7, 14.2, Math.cos(t) * 1.7]], 0.55, 0.45, B);
  }
  s.cyl(0, 0, 11, 12, 1.1, P);
  // The bud on its own stem.
  s.seg([[0.5, 2, 0], [2.5, 6, -1.5], [3.3, 8, -2]], 0.4, 0.4, D);
  s.ell(3.3, 9.5, -2, 0.9, 1.7, 0.9, B);
  s.set(3.3, 11.3, -2, P);
  // A leaf, tipped up toward the front.
  for (let x = -6; x <= -1; x++)
    for (let z = -2; z <= 4; z++) {
      const d = Math.hypot(x + 3.5, z - 1);
      if (d <= 2.8 && !(x > -3 && Math.abs(z - 1) < 0.6)) s.set(x, 3 + Math.round((z - 1) * 0.35), z, d > 2.1 ? B : G);
    }
}

/** A kinnari: half woman, half bird, palms together, wings and a swept tail of feathers. */
function kinnari(s: Sketch): void {
  plinth(s);
  s.both((m) => {
    s.seg([[m * 1.1, 6, 0], [m * 1.5, 4, 0.8], [m * 1.3, 2, 0.6]], 0.55, 0.45, D);
    s.seg([[m * 1.3, 2, 0.6], [m * 1.5, 2, 2]], 0.4, 0.4, D);
    // Arms: the palms together at the chest (sampeah).
    s.seg([[m * 1.6, 11.5, 0], [m * 2, 10, 1], [m * 0.4, 10.8, 1.8]], 0.5);
    // Wings from the shoulders, back and up.
    for (let f = 0; f < 4; f++) s.seg([[m * 1.3, 11, -0.8], [m * (3.8 + f * 0.6), 13 - f * 1.4, -2.2 - f * 0.3]], 0.55, 0.4, f % 2 ? G : D);
  });
  s.ell(0, 6.8, -0.6, 2, 1.8, 2.5);
  // Tail feathers swept up behind.
  for (let f = -2; f <= 2; f++) s.seg([[0, 6.5, -2.5], [f * 1.1, 8.5, -5], [f * 1.5, 11, -5.8]], 0.55, 0.4, f % 2 ? B : G);
  // The woman: waist, torso, collar, head, crown.
  s.ell(0, 9.8, 0, 1.4, 1.8, 1);
  s.cyl(0, 0, 11.2, 11.2, 1.3, B);
  s.ell(0, 13, 0, 1.1, 1.3, 1.1);
  s.set(-1, 13.4, 1, K);
  s.set(1, 13.4, 1, K);
  crown(s, 0, 14.3, 0, 4);
}

/** Kurma, the turtle of the Churning of the Ocean of Milk (Angkor Wat's long relief): a patterned shell, head out. */
function turtle(s: Sketch): void {
  plinth(s, 5);
  s.ell(0, 3.4, -0.2, 4.4, 3.4, 5.2, G, 3);
  // Shell plates.
  for (const [x, y, z] of [...s.cells.keys()].map((k) => k.split(',').map(Number)))
    if (y >= 4 && (x + 20) % 3 === 0 && (z + 20) % 3 === 0) s.paint(x, y, z, D);
  s.cyl(0, -0.2, 3, 3, 4.6, B);
  s.both((m) => {
    s.ell(m * 3.8, 2.5, 3, 1.4, 0.6, 1, D);
    s.ell(m * 3.8, 2.5, -3.2, 1.2, 0.6, 0.9, D);
  });
  s.seg([[0, 4, 4.5], [0, 5.5, 6.5]], 0.9, 0.8);
  s.ell(0, 6, 7, 1.1, 1, 1.3, B);
  s.set(-1, 6.4, 7.6, K);
  s.set(1, 6.4, 7.6, K);
  s.seg([[0, 3, -5.2], [0, 2.5, -6.4]], 0.4, 0.4, D);
  // (a lotus bud on its shell: Mount Mandara of the churning rested on it)
  s.cyl(0, -0.2, 7, 7, 1.2, B);
  s.ell(0, 8.4, -0.2, 0.9, 1.3, 0.9, G);
  s.set(0, 10, -0.2, P);
}

/** A makara, the sea monster curling out of lintels: open jaws, a snout curled up like a trunk, a leafy tail. */
function makara(s: Sketch): void {
  plinth(s, 4.6);
  s.ell(0, 5, -1, 2, 2.2, 3.8);
  s.both((m) => {
    s.seg([[m * 1.6, 4, 1.5], [m * 2, 2, 2]], 0.6, 0.6, D);
    s.seg([[m * 1.6, 4, -3], [m * 2, 2, -3.5]], 0.6, 0.6, D);
    s.set(m * 1.4, 8.6, 3.8, P);
    s.set(m * 1.5, 8.6, 4.1, K);
  });
  s.ell(0, 7, 3.2, 1.9, 1.9, 1.9);
  // Upper jaw and the curled snout, lower jaw, teeth.
  s.seg([[0, 7.8, 4.5], [0, 8.6, 6.2], [0, 10.5, 7], [0, 12, 6.2], [0, 11.8, 5]], 0.8, 0.5, B);
  s.seg([[0, 5.8, 4.5], [0, 5.3, 6.4]], 0.7, 0.6);
  s.set(-1, 6.6, 5.6, P);
  s.set(1, 6.6, 5.6, P);
  s.set(0, 6.5, 6.2, K);
  // Crest along the back.
  for (let z = -4; z <= 2; z += 2) s.set(0, 7.5 + (z > 0 ? 1 : 0), z, B);
  // Tail curling up like a flame of foliage.
  s.seg([[0, 5, -4.5], [0, 7.5, -6.5], [0, 11, -6], [0, 12.5, -4], [0, 11.5, -2.8]], 0.9, 0.5, D);
  s.seg([[0, 9, -6.8], [1.5, 10.5, -7.5]], 0.45, 0.4, B);
  s.seg([[0, 9, -6.8], [-1.5, 10.5, -7.5]], 0.45, 0.4, B);
}

/** Judge Rabbit (Sopheak the rabbit) of Khmer folk tales: sitting up, long ears, paws together. */
function rabbit(s: Sketch): void {
  plinth(s);
  s.ell(0, 4.8, -0.6, 2.6, 2.6, 3);
  s.ell(0, 8, 0.6, 1.9, 2.4, 1.7);
  s.both((m) => {
    s.box(m * 2 - 1, m * 2 + 1, 2, 2, 0, 3, D);
    s.seg([[m * 1.2, 8, 1.8], [m * 0.8, 6.2, 2.4]], 0.5, 0.45, B);
    s.seg([[m * 0.8, 12.6, 0.4], [m * 1.1, 15, 0.1], [m * 1.3, 17.6, -0.3]], 0.6, 0.5);
    s.set(m * 1.1, 15.5, 0.8, D);
    s.set(m * 1.2, 16.6, 0.6, D);
    s.set(m * 1.2, 11.9, 2.3, K);
  });
  s.ell(0, 11.2, 1, 1.8, 1.7, 1.8);
  s.ell(0, 10.5, 2.5, 1, 0.8, 0.8, B);
  s.set(0, 10.9, 3.3, K);
  s.ball(0, 4, -3.8, 1, P);
}

/** Hanuman, the monkey general of the Reamker: crouched to leap, one hand raised, crown, tail curled high. */
function hanuman(s: Sketch): void {
  plinth(s);
  s.both((m) => {
    s.seg([[m * 1.3, 6, 0], [m * 3, 6.8, 1.6], [m * 2.4, 2.2, 1]], 0.7, 0.6);
    s.box(m * 2.4 - 1, m * 2.4 + 1, 2, 2, 1, 2, D);
  });
  s.ell(0, 8.3, 0.2, 1.9, 2.3, 1.5);
  s.cyl(0, 0.3, 10, 10, 1.6, B);
  s.ell(0, 12, 0.8, 1.5, 1.5, 1.4);
  s.ell(0, 11.4, 2, 1, 0.8, 0.7, B);
  s.set(-1, 12.4, 2, K);
  s.set(1, 12.4, 2, K);
  s.set(0, 11, 2.6, K);
  crown(s, 0, 13.3, 0.8, 3);
  // The right arm raised with a small mace; the left forward, open-handed.
  s.seg([[1.6, 10, 0], [3.3, 11.8, 0.4], [3.4, 14, 0.4]], 0.55);
  s.seg([[3.4, 13.4, 0.4], [3.4, 17, 0.4]], 0.4, 0.4, D);
  s.ball(3.4, 17.2, 0.4, 0.8, B);
  s.seg([[-1.6, 10, 0.2], [-3.3, 9, 1.5], [-3, 8.5, 3.2]], 0.55);
  // Tail.
  s.seg([[0, 6, -1.5], [0, 6.5, -4.5], [-1, 10, -5.5], [-0.5, 13, -4.2], [0.5, 13.5, -2.8]], 0.55, 0.45, D);
}

/** An elephant greeting with its trunk raised, tusks, big ears and a patterned saddle cloth. */
function elephant(s: Sketch): void {
  plinth(s, 5);
  s.ell(0, 7.4, -0.6, 3.3, 3.2, 4.6);
  s.both((m) => {
    s.cyl(m * 2, 2.6, 2, 6, 1.1, G);
    s.cyl(m * 2, -3.6, 2, 6, 1.1, G);
    s.set(m * 2, 2, 3.6, P);
    s.set(m * 2, 2, -2.6, P);
    // Ears.
    s.ell(m * 2.9, 8.8, 3, 0.6, 2.4, 1.7, D);
    // Tusks.
    s.seg([[m * 1, 7.6, 5.6], [m * 1.3, 8, 7.2], [m * 1.1, 9, 8]], 0.4, 0.35, P);
    s.set(m * 1.2, 10.2, 5.8, K);
  });
  s.ell(0, 9.4, 4.4, 2.3, 2.4, 1.8);
  s.seg([[0, 8.6, 6], [0, 9.8, 7.8], [0, 12.5, 8.6], [0, 14.3, 7.9], [0, 14.5, 6.8]], 0.85, 0.5);
  // Saddle cloth.
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 1; z++) {
      let y = 11;
      while (y > 4 && !s.has(x, y, z)) y--;
      if (s.has(x, y, z)) s.paint(x, y, z, (x + z) % 2 ? B : D);
    }
  s.seg([[0, 7, -5.2], [0, 5, -6]], 0.4, 0.4, D);
}

/** A peacock (Skanda's mount in Khmer carvings) with its tail spread in a fan of eyes. */
function peacock(s: Sketch): void {
  plinth(s);
  // The fan: a half disc leaning back behind the bird, eyes in two rows.
  for (let x = -7; x <= 7; x++)
    for (let y = 3; y <= 12; y++) {
      const d = Math.hypot(x, (y - 3) * 0.85);
      if (d > 7.4) continue;
      const z = -2 - Math.round((y - 3) * 0.25);
      const eye = (Math.abs(d - 6.3) < 0.6 || Math.abs(d - 4) < 0.6) && (x + y) % 3 === 0;
      s.set(x, y, z, eye ? K : d > 6.6 ? B : (x + y) % 2 ? G : D);
    }
  s.both((m) => s.seg([[m * 0.8, 4, 0.5], [m * 0.9, 2, 0.8]], 0.4, 0.4, D));
  s.ell(0, 5.8, 0.4, 1.6, 2, 1.9);
  s.seg([[0, 7, 1], [0, 9.5, 1.6], [0, 11.3, 1.8]], 0.8, 0.6, B);
  s.ball(0, 12, 1.9, 1);
  s.set(0, 11.8, 3.1, D);
  s.set(-1, 12.3, 2.4, K);
  s.set(1, 12.3, 2.4, K);
  for (const x of [-1, 0, 1]) s.seg([[x * 0.4, 12.8, 1.7], [x * 1, 14.8, 1.4]], 0.35, 0.35, B);
}

/** The hamsa (hong), the sacred goose on royal barges: arched neck, a crest and a tail curled up like flame. */
function hamsa(s: Sketch): void {
  plinth(s);
  s.ell(0, 5.3, 0, 2.2, 2, 3.3);
  s.both((m) => {
    // Folded wings, their tips raised.
    for (let z = -2; z <= 2; z++) s.seg([[m * 2.1, 5, z], [m * 2.2, 7 + (2 - z) * 0.4, z - 0.5]], 0.45, 0.4, z % 2 ? B : D);
    s.set(m * 0.7, 12.9, 3.6, K);
  });
  s.seg([[0, 6.4, 2.6], [0, 8.6, 3.8], [0, 10.6, 3.4], [0, 12, 3]], 0.85, 0.7);
  s.ell(0, 12.6, 3.3, 0.9, 0.9, 1.2, B);
  s.seg([[0, 12.3, 4.4], [0, 11.9, 5.3]], 0.45, 0.4, P);
  s.seg([[0, 13.4, 2.8], [0, 14.6, 1.8], [0, 14.4, 0.8]], 0.45, 0.4, B);
  s.seg([[0, 5.5, -3.2], [0, 8, -4.8], [0, 11, -4.4], [0, 12.3, -2.6], [0, 11.3, -1.6]], 0.8, 0.45, D);
  s.seg([[0, 9.5, -5], [1.2, 11, -5.6]], 0.4, 0.4, B);
  s.seg([[0, 9.5, -5], [-1.2, 11, -5.6]], 0.4, 0.4, B);
}

export type GoldModel = 'apsara' | 'naga' | 'garuda' | 'bayonFace' | 'singha' | 'nandi' | 'lotus' | 'kinnari' | 'turtle' | 'makara' | 'rabbit' | 'hanuman' | 'elephant' | 'peacock' | 'hamsa';

const MODELS: Record<GoldModel, (s: Sketch) => void> = { apsara, naga, garuda, bayonFace, singha, nandi, lotus, kinnari, turtle, makara, rabbit, hanuman, elephant, peacock, hamsa };

/** The cells of a figure. */
export function sketchOf(model: GoldModel): Sketch {
  const s = new Sketch();
  MODELS[model](s);
  // (nothing under the plinth)
  for (const k of [...s.cells.keys()]) if (Number(k.split(',')[1]) < 0) s.cells.delete(k);
  return s;
}
