/**
 * What lies over the 3D picture on the screen and belongs in a photo too (roam/photo.ts): the other players' name
 * tags (people/_playersNames.ts) are DOM over the canvas, so a photo of the canvas alone had none. A layer registers
 * a painter; the photo copies the canvas and lets each paint itself on the copy, in the canvas's pixels.
 */

/** Paints onto `g` (the photo, `w` × `h` px); `sx`, `sy` turn CSS px into the photo's px. True when it drew. */
export type PhotoLayer = (g: CanvasRenderingContext2D, w: number, h: number, sx: number, sy: number) => boolean;

const LAYERS = new Set<PhotoLayer>();

export function addPhotoLayer(layer: PhotoLayer): () => void {
  LAYERS.add(layer);
  return () => LAYERS.delete(layer);
}

/** The canvas with every layer over it (a copy), or the canvas itself when none has anything to draw. */
export function withPhotoLayers(src: HTMLCanvasElement): HTMLCanvasElement {
  if (LAYERS.size === 0) return src;
  const box = src.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return src;
  const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
  const g = c.getContext('2d');
  if (!g) return src;
  g.drawImage(src, 0, 0);
  const sx = src.width / box.width;
  const sy = src.height / box.height;
  let drew = false;
  for (const layer of LAYERS) {
    g.save();
    // (the layers place things in the window's CSS px: from the canvas's own corner)
    g.translate(-box.left * sx, -box.top * sy);
    if (layer(g, c.width, c.height, sx, sy)) drew = true;
    g.restore();
  }
  return drew ? c : src;
}
