import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import type { WorshipSpot } from './_worship';

/** The square the lotus is drawn on (m across at true size; the explorer's size scales it): the lotus fills 27 / 32 of it, the glow the rest. */
const SIZE = 1.9;
/** Logical pixels across the square, and canvas pixels per logical one. */
const GRID = 32;
const CELL = 8;
/** Brightness by day (gold leaf on the stone) and at night (over the bloom threshold, post.ts: it glows). */
const DAY = 1.05;
const NIGHT = 2.1;
/** The breath: its pace (rad/s), and how much the brightness and the size swell with it. */
const PULSE = 2.4;
const SWELL = 0.18;
const GROW = 0.04;
/** Over the floor (m): clear of what lies on it (the jungle shrines' stepping stones stand 0.14 m), no gap to see from the follow camera. */
const LIFT = 0.16;

/** Palette (sRGB): the petals' edges, their gold, the light gold of the inner petals and the midribs, the pale seed pod, the ring of light. */
const EDGE = '#c4801c';
const GOLD = '#ffcc52';
const LIGHT = '#ffe794';
const POD = '#fff7dc';
const RING = 'rgba(255, 214, 110, 0.85)';

export interface PrayMark {
  readonly object: Mesh;
  /**
   * Lay it on `spot`'s kneeling place (null: nowhere), a petal to the
   * shrine, seen `a` (0‥1: the caller fades it), breathing at `t` (s);
   * `night` 0 day ‥ 1 night, `scale` the explorer's size.
   */
  show(spot: WorshipSpot | null, a: number, t: number, night: number, scale: number): void;
}

/**
 * The sign on the floor where the explorer kneels to pray (_pray.ts): a
 * golden lotus in pixel art, eight wide petals round a pale seed pod and
 * eight smaller ones between them, in a dashed ring of light on a soft
 * glow. One flat square (one draw, no light, nothing rebuilt) shared by
 * every spot; it breathes gently.
 */
export function createPrayMark(): PrayMark {
  const geo = new PlaneGeometry(1, 1);
  // (flat on the floor, the top of the picture towards −z)
  geo.rotateX(-Math.PI / 2);
  const map = new CanvasTexture(paint());
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const mat = new MeshBasicMaterial({ map, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.name = 'roam:pray lotus';
  const mesh = new Mesh(geo, mat);
  mesh.name = 'roam:pray lotus';
  mesh.renderOrder = 1;
  mesh.castShadow = mesh.receiveShadow = false;
  // (in the scene from the start, so its shader is made with the map's: hidden once roaming steps)
  return {
    object: mesh,
    show(spot, a, t, night, scale) {
      mesh.visible = !!spot && a > 0.004;
      if (!spot || !mesh.visible) return;
      const breath = Math.sin(t * PULSE);
      mesh.position.set(spot.x, spot.y + LIFT, spot.z);
      mesh.rotation.y = Math.atan2(spot.x - spot.fx, spot.z - spot.fz);
      mesh.scale.setScalar(SIZE * scale * (1 + GROW * breath));
      mat.color.setScalar((DAY + (NIGHT - DAY) * night) * (1 - SWELL + SWELL * breath));
      mat.opacity = a;
    },
  };
}

/** The lotus on a canvas (`GRID` logical pixels of `CELL`), on a smooth glow. */
function paint(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = GRID * CELL;
  const g = c.getContext('2d')!;
  const half = (GRID * CELL) / 2;
  const glow = g.createRadialGradient(half, half, 0, half, half, half);
  glow.addColorStop(0, 'rgba(255, 196, 80, 0.7)');
  glow.addColorStop(0.5, 'rgba(255, 196, 80, 0.25)');
  glow.addColorStop(1, 'rgba(255, 196, 80, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, c.width, c.height);
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const x = i + 0.5 - GRID / 2;
      const y = j + 0.5 - GRID / 2;
      const r = Math.hypot(x, y);
      let col: string | null = null;
      // The ring of light: sixteen dashes.
      if (Math.abs(r - 15) < 0.55 && ((Math.atan2(x, y) / (2 * Math.PI)) * 16 + 16) % 1 < 0.62) col = RING;
      const outer = petal(x, y, 0, 2.5, 13.6, 5);
      if (outer) col = outer === 'edge' ? EDGE : outer === 'rib' ? LIGHT : GOLD;
      const inner = petal(x, y, 0.5, 1.5, 9.6, 3.8);
      if (inner) col = inner === 'edge' ? EDGE : LIGHT;
      if (r < 3.7) col = EDGE;
      if (r < 2.8) col = POD;
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(i * CELL, j * CELL, CELL, CELL);
    }
  return c;
}

/**
 * Whether (x, y) (logical pixels from the middle, y down) is on one of
 * eight petals turned `turn` eighths from straight up, from `from` to `to`
 * out and `wide` at most across: on its edge, on its midrib or on it.
 */
function petal(x: number, y: number, turn: number, from: number, to: number, wide: number): 'edge' | 'rib' | 'in' | null {
  for (let k = 0; k < 8; k++) {
    const a = ((k + turn) * Math.PI) / 4;
    const along = x * Math.sin(a) - y * Math.cos(a);
    const across = Math.abs(x * Math.cos(a) + y * Math.sin(a));
    if (along < from || along > to) continue;
    const u = (along - from) / (to - from);
    // (round at the base, pointed at the tip)
    const w = wide * Math.sin(Math.PI * u ** 0.8) ** 0.6;
    if (across >= w) continue;
    if (across > w - 1.05 || along > to - 1.1) return 'edge';
    return across < 0.6 && u > 0.25 && u < 0.8 ? 'rib' : 'in';
  }
  return null;
}
