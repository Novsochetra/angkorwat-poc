/**
 * Lengths for per-frame, per-animal code: as `Math.hypot`, which allocates
 * its arguments on every call in V8 (and is slower); a plain square root of
 * the squares is enough for these distances.
 */
export function len2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
export function len3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}
