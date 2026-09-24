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
