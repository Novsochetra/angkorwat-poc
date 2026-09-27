import { meshStupa, type StupaDetail, type StupaForm } from './_stupaShape';

/**
 * Sculpts stupas off the main thread (stupa.ts): a stupa of a form, with or
 * without a niche, in stucco or stone, at a detail, sent back as plain
 * arrays (the map keeps drawing meanwhile).
 */

export interface StupaJob {
  id: number;
  form: StupaForm;
  niche: boolean;
  stone: boolean;
  detail: StupaDetail;
}

export interface StupaResult {
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

self.onmessage = (e: MessageEvent<StupaJob>) => {
  const { id, form, niche, stone, detail } = e.data;
  const mesh = meshStupa(form, niche, stone, detail);
  const g = mesh.geometry;
  const arr = (name: string) => g.getAttribute(name).array as Float32Array;
  const out: StupaResult = {
    id,
    position: arr('position'),
    normal: arr('normal'),
    region: arr('region'),
    paint: arr('paint'),
    paintW: arr('paintW'),
    occlusion: arr('occlusion'),
    index: g.getIndex()!.array as Uint16Array | Uint32Array,
    regions: mesh.regions,
    ms: mesh.ms,
  };
  (self as unknown as Worker).postMessage(out, [out.position.buffer, out.normal.buffer, out.region.buffer, out.paint.buffer, out.paintW.buffer, out.occlusion.buffer, out.index.buffer]);
};
