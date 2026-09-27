import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { lang, onLang, t } from '../ui/lang';
import type { MapFrame } from '../types';

/**
 * The words painted on the picnic place's sign (its board is voxels:
 * `_kulenPicnic.ts`): "ទឹកធ្លាក់ភ្នំគូលែន" and "សូមស្វាគមន៍" (Kulen Waterfall,
 * Welcome) in white and gold on the board's blue, in Khmer letters (English
 * on the ខ្មែរ / EN switch: `knSign`, `knSignSub` in ui/lang.ts). A canvas on
 * a thin plane just in front of the board: one small draw, only while the
 * camera is near (`NEAR`), no shadow. Painted again when the fonts have
 * loaded and when the language changes.
 */

/** Beyond this from the camera (m) the words are not drawn (a few pixels: the board's colours say enough). */
const NEAR = 110;
/** The canvas (px) for a board `w` × `h` m. */
const PX = 160;

export function signWords(w: number, h: number): { mesh: Mesh; update(f: MapFrame): void } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
  material.name = 'kulenPicnic:sign';
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.name = 'kulenPicnic:sign';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const paint = () => {
    const g = canvas.getContext('2d');
    if (!g) return;
    const W = canvas.width;
    const H = canvas.height;
    const km = lang() === 'km';
    g.fillStyle = '#3a6a9a';
    g.fillRect(0, 0, W, H);
    // A white rule round the edge, and small gold lotus buds at the corners.
    g.strokeStyle = '#f2eee2';
    g.lineWidth = H * 0.035;
    g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12);
    g.fillStyle = '#e8c050';
    for (const [x, y] of [
      [H * 0.06, H * 0.06],
      [W - H * 0.06, H * 0.06],
      [H * 0.06, H - H * 0.06],
      [W - H * 0.06, H - H * 0.06],
    ]) {
      g.beginPath();
      g.arc(x, y, H * 0.045, 0, Math.PI * 2);
      g.fill();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // (Khmer in Koulen, the titles' face; English in the interface's own)
    const title = km ? `'Koulen', 'Kantumruy Pro', 'Khmer Sangam MN', 'Khmer MN', sans-serif` : `'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif`;
    g.fillStyle = '#f6f2e6';
    g.font = `${km ? 400 : 800} ${Math.round(H * (km ? 0.36 : 0.3))}px ${title}`;
    fit(g, t('knSign'), W * 0.86);
    g.fillText(t('knSign'), W / 2, H * 0.42);
    g.fillStyle = '#e8c050';
    g.font = `${km ? 400 : 700} ${Math.round(H * 0.19)}px ${km ? `'Kantumruy Pro', 'Khmer Sangam MN', sans-serif` : `'Nunito Sans', system-ui, sans-serif`}`;
    g.fillText(t('knSignSub'), W / 2, H * 0.76);
    texture.needsUpdate = true;
  };
  paint();
  // (again once the page's fonts are in: Koulen for the Khmer title)
  document.fonts?.ready.then(paint).catch(() => undefined);
  onLang(paint);
  return {
    mesh,
    update(f) {
      const c = f.camera.position;
      mesh.visible = Math.hypot(c.x - mesh.position.x, c.z - mesh.position.z) < NEAR;
    },
  };
}

/** Shrink the canvas's font until `text` fits in `max` px. */
function fit(g: CanvasRenderingContext2D, text: string, max: number): void {
  const w = g.measureText(text).width;
  if (w <= max) return;
  const m = /(\d+)px/.exec(g.font);
  if (!m) return;
  g.font = g.font.replace(/\d+px/, `${Math.floor((Number(m[1]) * max) / w)}px`);
}
