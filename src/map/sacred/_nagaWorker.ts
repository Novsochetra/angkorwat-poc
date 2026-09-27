import { FAN_CELL, fanSculpt, type FanKind, type NagaSculpted } from './naga';
import { meshSculpt } from './sculpt';

/**
 * Sculpts a naga fan off the main thread (naga.ts `nagaFanReady`): the
 * mesh of a kind, sent back as plain arrays.
 */
self.onmessage = (e: MessageEvent<{ kind: FanKind }>) => {
  const m = meshSculpt(fanSculpt(e.data.kind), FAN_CELL[e.data.kind]);
  const g = m.geometry;
  const out: NagaSculpted = {
    position: g.getAttribute('position').array as Float32Array,
    normal: g.getAttribute('normal').array as Float32Array,
    region: g.getAttribute('region').array as Float32Array,
    paint: g.getAttribute('paint').array as Float32Array,
    paintW: g.getAttribute('paintW').array as Float32Array,
    occlusion: g.getAttribute('occlusion').array as Float32Array,
    index: g.getIndex()!.array as Uint16Array | Uint32Array,
    regions: m.regions,
    ms: m.ms,
  };
  (self as unknown as Worker).postMessage(out, [out.position.buffer, out.normal.buffer, out.region.buffer, out.paint.buffer, out.paintW.buffer, out.occlusion.buffer, out.index.buffer]);
};
