/**
 * The panels' outline: a rectangle whose corners are cut in small pixel
 * steps, like the concept art's cards (a voxel game's "rounded" corner).
 * Made as CSS `clip-path` polygons: the filled shape, and a ring (the
 * border) of a given thickness that follows the steps inside it.
 */

type Pt = [number, number];

/** The top-left corner's steps, from the left edge up to the top edge (local px). */
function cornerSteps(cut: number, steps: number): Pt[] {
  const s = cut / steps;
  const pts: Pt[] = [[0, cut]];
  for (let i = 0; i < steps; i++) pts.push([i * s, cut - (i + 1) * s], [(i + 1) * s, cut - (i + 1) * s]);
  return pts;
}

const px = (v: number) => `${+v.toFixed(2)}px`;
const far = (v: number) => `calc(100% - ${px(v)})`;

/** The outline, clockwise, grown in by `inset` px on every side. */
function outline(cut: number, steps: number, inset: number): string[] {
  const tl = cornerSteps(cut, steps).map(([x, y]): Pt => [x + inset, y + inset]);
  const rev = [...tl].reverse();
  return [
    ...tl.map(([x, y]) => `${px(x)} ${px(y)}`),
    ...rev.map(([x, y]) => `${far(x)} ${px(y)}`),
    ...tl.map(([x, y]) => `${far(x)} ${far(y)}`),
    ...rev.map(([x, y]) => `${px(x)} ${far(y)}`),
  ];
}

/** The filled shape. */
export function steppedShape(cut: number, steps: number): string {
  return `polygon(${outline(cut, steps, 0).join(',')})`;
}

/** A ring `width` px thick along the inside of the shape (for the border). */
export function steppedRing(cut: number, steps: number, width: number): string {
  const o = outline(cut, steps, 0);
  const i = outline(cut, steps, width);
  return `polygon(evenodd,${[...o, o[0], ...i, i[0]].join(',')})`;
}

/** Everything outside the shape, `pad` px out (where a glow around its edge shows). */
export function steppedOutside(cut: number, steps: number, pad = 64): string {
  const o = outline(cut, steps, 0);
  const lo = px(-pad);
  const hi = `calc(100% + ${px(pad)})`;
  const box = [`${lo} ${lo}`, `${hi} ${lo}`, `${hi} ${hi}`, `${lo} ${hi}`];
  return `polygon(evenodd,${[...box, box[0], ...o, o[0]].join(',')})`;
}

/** The frame sizes (map.css `.mu-xs` … `.mu-lg`): corner cut (px), steps, edge (px). */
const SIZES: Record<string, [number, number, number]> = {
  xs: [6, 3, 1.5],
  sm: [8, 4, 1.25],
  md: [10, 5, 1.25],
  lg: [12, 4, 1.5],
};

/** Sets each size's shape, edge ring and glow area (`--mu-shape-sm`, `--mu-ring-sm`, `--mu-halo-sm`, …) on `host`. */
export function setSteppedVars(host: HTMLElement): void {
  for (const [k, [cut, steps, edge]] of Object.entries(SIZES)) {
    host.style.setProperty(`--mu-shape-${k}`, steppedShape(cut, steps));
    host.style.setProperty(`--mu-ring-${k}`, steppedRing(cut, steps, edge));
    host.style.setProperty(`--mu-halo-${k}`, steppedOutside(cut, steps));
  }
  // (the picked card's thicker edge)
  host.style.setProperty('--mu-ring-sm-b', steppedRing(8, 4, 2.5));
}
