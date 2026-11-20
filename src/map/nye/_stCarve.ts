import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace } from 'three';
import { boss, flame, gild, lotusBand, ribbon, scroll, type KbachPen, type P } from '../sacred/kbach';

/**
 * Kbach carved in the stage gate's sandstone (AWP-35): the pillars' fronts (a vine climbing in scrolls of flame
 * leaves between lotus bands, as on Angkor Wat's pilasters) and the lintel's front (a garland of scrolls either
 * side of a boss, as a Khmer lintel), painted once with sacred/kbach.ts's carving (`gild`) in stone colours,
 * not gold, onto one atlas: one mesh, one draw, a bump from the relief.
 */

/** The atlas (m) at `PPM` px a metre: the pillar's panel at x 0‥1.5, the lintel's at x 2.2‥18.2, y 5.6‥7. */
const AW = 18.4;
const AH = 7.0;
const PPM = 55;
const PILLAR = { x0: 0, x1: 1.5, y0: 0, y1: 7.0 } as const;
const LINTEL = { x0: 2.2, x1: 18.2, y0: 5.6, y1: 7.0 } as const;
type Rect = { x0: number; x1: number; y0: number; y1: number };

function border(pen: KbachPen, r: Rect, w: number): void {
  const i = w * 0.8;
  const pts: P[] = [
    [r.x0 + i, r.y0 + i],
    [r.x1 - i, r.y0 + i],
    [r.x1 - i, r.y1 - i],
    [r.x0 + i, r.y1 - i],
    [r.x0 + i, r.y0 + i],
  ];
  ribbon(pen.gold, pts, w, w, false);
}

function paintPillar(pen: KbachPen): void {
  const r = PILLAR;
  const cx = (r.x0 + r.x1) / 2;
  border(pen, r, 0.06);
  lotusBand(pen, r.x0 + 0.12, r.x1 - 0.12, r.y0 + 0.14, 0.32, true);
  // (the top: petals hanging down — the band drawn upside down by a flip)
  pen.gold.save();
  pen.cut.save();
  for (const g of [pen.gold, pen.cut]) {
    g.translate(0, r.y1 * 2);
    g.scale(1, -1);
  }
  lotusBand(pen, r.x0 + 0.12, r.x1 - 0.12, r.y0 + 0.14, 0.32, true);
  pen.gold.restore();
  pen.cut.restore();
  // The vine: a stem up the middle, scrolls off it to either side in turn.
  const y0 = r.y0 + 0.62;
  const y1 = r.y1 - 0.62;
  pen.gold.fillStyle = '#fff';
  ribbon(pen.gold, [
    [cx, y0],
    [cx, y1],
  ], 0.07, 0.07, false);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const y = y0 + ((i + 0.5) * (y1 - y0)) / n;
    const s = i % 2 ? 1 : -1;
    scroll(pen, { cx: cx + s * 0.34, cy: y + 0.06, r: 0.27, at: s > 0 ? Math.PI : 0, dir: s > 0 ? -1 : 1, turns: 1.35, from: [cx, y - 0.32], leaf: 0.9, leafStep: 0.7, minUp: -2, eye: true, fat: 0.52 });
    flame(pen, cx, y + 0.3, Math.PI / 2 - s * 0.6, 0.32, 0.12, -s * 0.8);
  }
}

function paintLintel(pen: KbachPen): void {
  const r = LINTEL;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2;
  border(pen, r, 0.05);
  lotusBand(pen, r.x0 + 0.1, r.x1 - 0.1, r.y0 + 0.1, 0.24, true);
  // The garland: a stem from the middle out to each end, scrolls curling off it, up and down in turn.
  pen.gold.fillStyle = '#fff';
  ribbon(pen.gold, [
    [r.x0 + 0.3, cy + 0.12],
    [r.x1 - 0.3, cy + 0.12],
  ], 0.06, 0.06, false);
  boss(pen, cx, cy + 0.14, 0.2);
  for (const side of [-1, 1] as const) {
    flame(pen, cx + side * 0.25, cy + 0.14, side > 0 ? 0.3 : Math.PI - 0.3, 0.55, 0.2, side * 0.8, { tongue: 0.4 });
    for (let i = 0; i < 6; i++) {
      const x = cx + side * (0.95 + i * 1.18);
      const up = i % 2 ? 1 : -1;
      scroll(pen, { cx: x, cy: cy + 0.12 + up * 0.18, r: 0.24, at: up > 0 ? -Math.PI / 2 : Math.PI / 2, dir: (side * up) as 1 | -1, turns: 1.3, from: [x - side * 0.5, cy + 0.12], leaf: 0.85, leafStep: 0.75, minUp: -2, eye: true, fat: 0.5 });
    }
  }
}

/** One quad: a corner (world m), its two edge vectors, the atlas rectangle (m) it shows. */
export interface CarveQuad {
  at: [number, number, number];
  u: [number, number, number];
  v: [number, number, number];
  part: 'pillar' | 'lintel';
}

/** The carved panels as one mesh (world m). */
export function carvedPanels(quads: CarveQuad[], later: (fn: () => void) => void): Mesh {
  // (the canvases at their size now, painted later: the material's program is the same before and after)
  const w = Math.round(AW * PPM);
  const h = Math.round(AH * PPM);
  const colorC = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const reliefC = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const cg = colorC.getContext('2d')!;
  cg.fillStyle = '#a08a6a';
  cg.fillRect(0, 0, w, h);
  const rg = reliefC.getContext('2d')!;
  rg.fillStyle = 'rgb(0, 128, 0)';
  rg.fillRect(0, 0, w, h);
  const map = new CanvasTexture(colorC);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.name = 'nye:carving';
  const bump = new CanvasTexture(reliefC);
  bump.colorSpace = NoColorSpace;
  bump.name = 'nye:carving-relief';
  later(() => {
    const art = gild(
      w,
      h,
      (g) => g.setTransform(PPM, 0, 0, -PPM, 0, h),
      PPM,
      (pen) => {
        pen.ground.fillStyle = '#a08a6a';
        pen.ground.fillRect(0, 0, AW, AH);
        paintPillar(pen);
        paintLintel(pen);
      },
      { gold: ['#dccaa6', '#b29b76'], light: '#f6ead0', dark: '#3a2c1e', groove: '#4e3c2a' },
    );
    cg.drawImage(art.color, 0, 0, w, h);
    rg.drawImage(art.relief, 0, 0, w, h);
    map.needsUpdate = true;
    bump.needsUpdate = true;
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const q of quads) {
    const r = q.part === 'pillar' ? PILLAR : LINTEL;
    const [ax, ay, az] = q.at;
    const corners: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    // (the normal: u × v)
    const nx = q.u[1] * q.v[2] - q.u[2] * q.v[1];
    const ny = q.u[2] * q.v[0] - q.u[0] * q.v[2];
    const nz = q.u[0] * q.v[1] - q.u[1] * q.v[0];
    const nl = Math.hypot(nx, ny, nz) || 1;
    const base = pos.length / 3;
    for (const [s, t] of corners) {
      pos.push(ax + q.u[0] * s + q.v[0] * t, ay + q.u[1] * s + q.v[1] * t, az + q.u[2] * s + q.v[2] * t);
      nor.push(nx / nl, ny / nl, nz / nl);
      uv.push((r.x0 + (r.x1 - r.x0) * s) / AW, (r.y0 + (r.y1 - r.y0) * t) / AH);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const material = new MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 3, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  material.name = 'nye:carving';
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:carving';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
