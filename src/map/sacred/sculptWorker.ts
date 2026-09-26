import { buddhaSculpt, BUDDHA_CELLS, type BuddhaKind, type Detail } from './buddha';
import { meshSculpt } from './sculpt';

/**
 * Sculpts statues off the main thread (buddha.ts `buddhaMeshAsync`): a
 * Buddha of a kind at a detail, sent back as plain arrays.
 */

export interface SculptJob {
  id: number;
  kind: BuddhaKind;
  detail: Detail;
}

export interface SculptResult {
  id: number;
  position: Float32Array;
  normal: Float32Array;
  region: Float32Array;
  paint: Float32Array;
  paintW: Float32Array;
  occlusion: Float32Array;
  index: Uint16Array | Uint32Array;
  regions: string[];
  ms: number;
}

self.onmessage = (e: MessageEvent<SculptJob>) => {
  const { id, kind, detail } = e.data;
  const { sculpt, foot } = buddhaSculpt(kind);
  const mesh = meshSculpt(sculpt, BUDDHA_CELLS[detail]);
  const g = mesh.geometry;
  const position = g.getAttribute('position').array as Float32Array;
  for (let i = 1; i < position.length; i += 3) position[i] += foot;
  const out: SculptResult = {
    id,
    position,
    normal: g.getAttribute('normal').array as Float32Array,
    region: g.getAttribute('region').array as Float32Array,
    paint: g.getAttribute('paint').array as Float32Array,
    paintW: g.getAttribute('paintW').array as Float32Array,
    occlusion: g.getAttribute('occlusion').array as Float32Array,
    index: g.getIndex()!.array as Uint16Array | Uint32Array,
    regions: mesh.regions,
    ms: mesh.ms,
  };
  (self as unknown as Worker).postMessage(out, [out.position.buffer, out.normal.buffer, out.region.buffer, out.paint.buffer, out.paintW.buffer, out.occlusion.buffer, out.index.buffer]);
};
