import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial, NearestFilter, SRGBColorSpace } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Mason, prasat, SANDSTONE, SHADOW, SIDE, STONE, STONE_LIGHT } from '../landmarks/_prasat';
import { onTemple } from '../roam/_flag';
import type { MapFrame } from '../types';
import { carvedPanels, type CarveQuad } from './_stCarve';
import { FLAME, later, Mason2, pick, type StageGlow } from './_stKit';
import { BOARD, GROUND, STAGE } from './plan';

/**
 * The stage gate round the countdown board (AWP-35): two sandstone pillars carved with kbach (_stCarve.ts) on
 * moulded bases under capitals, a carved lintel and its cornice, and over it a Khmer temple top — a stepped
 * terrace, an Angkor prasat (lotus-bud tower, landmarks/_prasat.ts) in the middle with a lamp in its door and two
 * small towers at its corners — rising to `BOARD.top`. Under the board a balustered window (the turned stone
 * balusters of Angkor's false windows). Red banners with the white Angkor Wat hang either side (roam/_flag.ts's
 * temple: three towers). Gilt edges along the board's frame, the lintel and the pillars glow at night.
 *
 * Built on a 0.5 m grid in world metres (`Mason`): the board's middle is `BOARD`, the gate's middle line z −291.
 */

export interface Gate {
  /** The carved panels and the banners (two draws). */
  carving: Mesh;
  banners: Mesh;
  /** The tower's tip (world m). */
  top: number;
  update(f: MapFrame): void;
}

export function buildGate(b: VoxelBuilder, glow: StageGlow): Gate {
  const src = traceSource();
  const top = GROUND + STAGE.h;
  const m = new Mason(b, 0.5, { seed: 35, jitter: 0.035, ao: 0.3 });
  const f = new Mason2(b, src);
  const P = SANDSTONE;
  const yb0 = GROUND + BOARD.y - BOARD.h / 2;
  const yb1 = GROUND + BOARD.y + BOARD.h / 2;
  const bx0 = BOARD.x - BOARD.w / 2;
  const bx1 = BOARD.x + BOARD.w / 2;
  const zb = BOARD.z;
  /** The gate's back and its pillars' front (m). */
  const ZB = -293;
  const ZF = -289.5;
  const y0 = top - 0.1;
  /** The gate's structure over the board, on the grid: the board's frame ends there, the lintel begins. */
  const Y1 = Math.round((yb1 + 0.35) * 2) / 2;

  // ── The pillars: a moulded base, the shaft, a capital ───────────────────
  for (const [x0, x1] of [
    [bx0 - 2.5, bx0 - 0.5],
    [bx1 + 0.5, bx1 + 2.5],
  ]) {
    m.fill(x0 - 0.5, y0, ZB - 0.5, x1 + 0.5, y0 + 0.5, ZF + 0.5, P.base, { src });
    m.fill(x0 - 0.5, y0 + 0.5, ZB - 0.5, x1 + 0.5, y0 + 1, ZF + 0.5, P.light, { src });
    m.fill(x0, y0 + 1, ZB, x1, Y1 - 1, ZF, P.stone, { src });
    m.fill(x0 - 0.5, Y1 - 1, ZB - 0.5, x1 + 0.5, Y1, ZF + 0.5, P.light, { src });
  }
  // ── Behind the board, the wall; under it the base with a balustered window ──
  const W0 = bx0 - 0.5;
  const W1 = bx1 + 0.5;
  m.fill(W0, 12, ZB, W1, Y1, -291, P.stone, { src });
  m.fill(W0, y0, ZB, W1, 12, -290, P.stone, { src });
  m.paint(W0, y0, -290.5, W1, y0 + 0.5, -290, P.dark, { src });
  m.clear(BOARD.x - 5, y0 + 0.5, -290.5, BOARD.x + 5, 11.5, -290);
  m.paint(BOARD.x - 5, y0 + 0.5, -291, BOARD.x + 5, 11.5, -290.5, SHADOW, { src });
  for (let i = 0; i < 8; i++) {
    const x = BOARD.x - 4.4 + (i * 8.8) / 7;
    f.span(x - 0.13, y0 + 0.5, -290.43, x + 0.13, 11.5, -290.17, pick(STONE_LIGHT, (i * 0.37) % 1));
    for (const ry of [0.35, 0.8, 1.25]) f.span(x - 0.18, y0 + 0.5 + ry - 0.05, -290.48, x + 0.18, y0 + 0.5 + ry + 0.05, -290.12, pick(STONE_LIGHT, 0.6), 'mapStone', 1.05);
  }
  // The screen's housing and its stone frame, a gilt line round the screen.
  f.span(W0, 12, -291, W1, Y1, zb - 0.05, 0x15100c, 'mapStone', 0.7);
  const zf0 = zb - 0.05;
  const zf1 = zb + 0.35;
  f.span(W0, 12, zf0, bx0, Y1, zf1, pick(STONE_LIGHT, 0.4));
  f.span(bx1, 12, zf0, W1, Y1, zf1, pick(STONE_LIGHT, 0.6));
  f.span(bx0, yb1, zf0, bx1, Y1, zf1, pick(STONE_LIGHT, 0.2));
  f.span(bx0, 12, zf0, bx1, yb0, zf1, pick(STONE_LIGHT, 0.8));
  const ze = zf1 + 0.02;
  glow.edge(bx0 - 0.1, yb0 - 0.1, zf1 - 0.02, bx1 + 0.1, yb0, ze);
  glow.edge(bx0 - 0.1, yb1, zf1 - 0.02, bx1 + 0.1, yb1 + 0.1, ze);
  glow.edge(bx0 - 0.1, yb0, zf1 - 0.02, bx0, yb1, ze);
  glow.edge(bx1, yb0, zf1 - 0.02, bx1 + 0.1, yb1, ze);
  // (the window's sill and lintel, gilt)
  glow.edge(BOARD.x - 5, y0 + 0.44, -289.98, BOARD.x + 5, y0 + 0.5, -289.94);
  glow.edge(BOARD.x - 5, 11.5, -289.98, BOARD.x + 5, 11.56, -289.94);

  // ── The lintel and its cornice ─────────────────────────────────────────
  const L0 = bx0 - 3;
  const L1 = bx1 + 3;
  m.fill(L0, Y1, -293.5, L1, Y1 + 1.5, -289, P.stone, { src });
  m.fill(L0 - 0.5, Y1 + 1.5, -294, L1 + 0.5, Y1 + 2, -288, P.light, { src });
  glow.edge(L0, Y1, -289.01, L1, Y1 + 0.07, -288.96);
  glow.edge(L0 - 0.5, Y1 + 1.93, -288.01, L1 + 0.5, Y1 + 2, -287.96);
  // The pillars' gilt edges, up their fronts.
  for (const x of [bx0 - 2.5, bx0 - 0.5, bx1 + 0.5, bx1 + 2.5]) glow.edge(x - 0.04, y0 + 1, ZF - 0.01, x + 0.04, Y1 - 1, ZF + 0.03);

  // ── The temple top: a stepped terrace, the prasat and its two corner towers ──
  const yt = Y1 + 2;
  m.fill(L0 + 1, yt, -293.5, L1 - 1, yt + 0.5, -288, P.stone, { src });
  m.fill(L0 + 1.5, yt + 0.5, -293, L1 - 1.5, yt + 1, -288, P.light, { src });
  const ty = yt + 1;
  const tipY = GROUND + BOARD.top;
  const main = prasat(m, BOARD.x, -291, ty, { h: (tipY - ty) * 0.56, w: 5, tiers: 5, doors: SIDE.pz | SIDE.px | SIDE.nx, body: 0.3, src });
  for (const s of [-1, 1]) prasat(m, BOARD.x + s * 6, -291, ty, { h: 5.5, w: 3, tiers: 3, doors: SIDE.pz, body: 0.36, src });
  m.weather(0.03, 36);
  m.mottle(0.05, P.dark, 37);
  m.commit('none');
  // (lamps in the doors: the main tower's and the corner towers')
  glow.flame(BOARD.x, ty + 0.62, -288.45, 0.62, 0.95, 0.08, FLAME.lamp, 0.4);
  glow.halo(BOARD.x, ty + 0.75, -288.2, 3.2, 0.4);
  for (const s of [-1, 1]) {
    glow.flame(BOARD.x + s * 6, ty + 0.45, -289.45, 0.6, 0.7, 0.08, FLAME.lamp, 1.1 + s);
    glow.halo(BOARD.x + s * 6, ty + 0.5, -289.2, 2.2, 1.1 + s);
  }
  // (a gilt tip on the tower)
  glow.edge(BOARD.x - 0.08, main.top, -291.08, BOARD.x + 0.08, main.top + 0.5, -290.92);

  // ── The carved panels ──────────────────────────────────────────────────
  const quads: CarveQuad[] = [];
  for (const x0 of [bx0 - 2.5, bx1 + 0.5]) quads.push({ at: [x0 + 0.2, y0 + 1.15, ZF + 0.01], u: [1.6, 0, 0], v: [0, Y1 - 1.15 - (y0 + 1.15), 0], part: 'pillar' });
  quads.push({ at: [L0 + 0.15, Y1 + 0.1, -288.99], u: [L1 - L0 - 0.3, 0, 0], v: [0, 1.3, 0], part: 'lintel' });
  const carving = carvedPanels(quads, later);

  // ── The banners: poles either side, red cloth with the white Angkor Wat ──
  const poleXs = [L0 - 1.1, L1 + 1.1];
  const BAN_W = 1.9;
  const BAN_H = 5.8;
  const barY = Y1 + 0.6;
  for (const x of poleXs) {
    f.span(x - 0.32, top - 0.05, -289.92, x + 0.32, top + 0.35, -289.28, pick(STONE, 0.5));
    f.span(x - 0.09, top + 0.35, -289.69, x + 0.09, barY + 0.55, -289.51, 0x6e2418, 'mapBark');
    f.span(x - 1.05, barY - 0.05, -289.66, x + 1.05, barY + 0.07, -289.54, 0x6e2418, 'mapBark');
    f.span(x - 0.13, barY + 0.55, -289.73, x + 0.13, barY + 0.75, -289.47, 0xe0b040, 'brass');
    f.span(x - 0.07, barY + 0.75, -289.67, x + 0.07, barY + 0.95, -289.53, 0xe0b040, 'brass', 1.08);
    for (const s of [-1, 1]) f.span(x + s * 1.05 - 0.07, barY - 0.08, -289.67, x + s * 1.05 + 0.07, barY + 0.1, -289.53, 0xe0b040, 'brass');
  }
  const banners = bannerMesh(
    poleXs.map((x) => [x, barY - 0.05, -289.47] as [number, number, number]),
    BAN_W,
    BAN_H,
  );

  return {
    carving,
    banners,
    top: main.top,
    update(fr) {
      const n = fr.night;
      const k = n * n * (3 - 2 * n);
      // (the cloth catches the fires' light: a faint glow of its own at night)
      (banners.material as MeshStandardMaterial).emissiveIntensity = 0.06 + 0.32 * k;
    },
  };
}

/** The banner's cloth (px): red, a gold border and fringe, the white Angkor Wat, a pointed foot. */
function bannerTexture(): CanvasTexture {
  const w = 76;
  const h = 232;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d')!;
  const tip = 30;
  const shape = () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(w, 0);
    g.lineTo(w, h - tip);
    g.lineTo(w / 2, h);
    g.lineTo(0, h - tip);
    g.closePath();
  };
  shape();
  g.fillStyle = '#b8141c';
  g.fill();
  g.save();
  shape();
  g.clip();
  g.strokeStyle = '#e6b44a';
  g.lineWidth = 8;
  shape();
  g.stroke();
  g.strokeStyle = '#7a0c12';
  g.lineWidth = 2;
  g.strokeRect(9, 18, w - 18, h - tip - 26);
  g.restore();
  // The gold band where it hangs from the bar.
  g.fillStyle = '#e6b44a';
  g.fillRect(0, 0, w, 12);
  g.fillStyle = '#9a6a1c';
  for (let x = 4; x < w; x += 8) g.fillRect(x, 4, 3, 4);
  // The temple, as the flag draws it (three towers), on a square of the banner.
  const ox = 10;
  const oy = 64;
  const s = w - 20;
  const img = g.getImageData(ox, oy, s, s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const u = 0.27 + ((x + 0.5) / s) * 0.46;
      const v = 0.27 + ((y + 0.5) / s) * 0.46;
      if (!onTemple(u, v)) continue;
      img.data.set([255, 250, 240, 255], (y * s + x) * 4);
    }
  g.putImageData(img, ox, oy);
  // (a small gold lotus under it)
  g.fillStyle = '#e6b44a';
  g.beginPath();
  g.moveTo(w / 2, oy + s + 10);
  g.quadraticCurveTo(w / 2 + 12, oy + s + 22, w / 2, oy + s + 32);
  g.quadraticCurveTo(w / 2 - 12, oy + s + 22, w / 2, oy + s + 10);
  g.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = NearestFilter;
  t.anisotropy = 4;
  t.name = 'nye:banner';
  return t;
}

/** The banners as one mesh: each hangs from its point (world m, the middle of its top edge), facing +z. */
function bannerMesh(at: [number, number, number][], w: number, h: number): Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const [x, y, z] of at) {
    const base = pos.length / 3;
    // (a gentle sway in the cloth: the lower corners a little forward)
    pos.push(x - w / 2, y, z, x + w / 2, y, z, x + w / 2, y - h, z + 0.12, x - w / 2, y - h, z + 0.12);
    for (let i = 0; i < 4; i++) nor.push(0, 0.02, 1);
    uv.push(0, 1, 1, 1, 1, 0, 0, 0);
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const map = bannerTexture();
  const material = new MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.06, roughness: 0.9, side: DoubleSide, alphaTest: 0.5 });
  material.name = 'nye:banners';
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:banners';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
