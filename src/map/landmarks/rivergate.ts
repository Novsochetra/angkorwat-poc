import { Color, Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { PATHS, type PlaceDef } from '../layout';
import type { MapContext, MapFrame, MapPart } from '../types';
import { gopura, LATERITE, Mason, naga, pick, prasat, SIDE, STONE, STONE_DARK, STONE_LIGHT, stupa } from './_prasat';
import { Frame, grassOverPad, Lamps } from './_prasatKit';

/**
 * River Gate — "The Eastern Crossing": where the valley road crosses the
 * river on an old stone bridge, between two gate towers (gopura).
 *
 * Everything follows the road (layout.ts `PATHS`, "valley road") inside the
 * place's pad. The bridge spans every stretch where the road is over water
 * (the height field's water, not layout guesses): a deck at road height on
 * piers standing in the river, cutwaters up- and downstream, naga
 * balustrades with a raised fan of heads at each end. The road pass leaves
 * the crossing bare, so the bridge carries the road's paving (0.25 m proud
 * of the road height) and its 1.1 m line of light across. A gate tower
 * stands at each end of the crossing; when
 * the pad has no room for one before the bridge, the second gate stands
 * further along the road with a naga causeway between the two, as at the
 * gates of Angkor Thom. Pieces are built square to the road on 1 m and
 * 0.5 m grids and then turned into place, so their edges stay straight.
 *
 * The anchor (the road pass's beacon, a 5.3 m disc on the road) stays
 * clear: rails and gates stop 3.4 m short of it along the road.
 * Open pad around the gates is laid with grass, and the part behind the road
 * is handed back to the vegetation pass (surface grass, not occupied).
 */

const ROAD = 'valley road';
/** Half the depth of a gate along the road (porches included), m. */
const GATE_HALF = 4.5;
/** Balustrade centre line off the road's centre (m); the deck is ±3.5 m. */
const RAIL_Z = 3.25;
/** Length of the naga causeway between the gates when the second gate has to stand apart (m). */
const CAUSEWAY = 38;
/** The road's paving stands this far above the road height (road/line.ts `LIFT`). */
const PAVE_TOP = 0.25;
/** Road paving tones (as road/stone.ts), for the bridge deck the road pass leaves bare. */
const PAVE = [0xd4bb96, 0xc9ae88, 0xdcc4a0, 0xbfa27e, 0xcfb38e];
/** Rails and towers keep this far from the beacon at the anchor, along the road (m): its disc is 2.65 m round. */
const BEACON_CLEAR = 3.4;

interface Seg {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  len: number;
  /** Arc length at the segment start (m). */
  s0: number;
}

/** Something built, as a rectangle in a road frame (for grass and trees). */
interface Footprint {
  fr: Frame;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export function buildRivergate(ctx: MapContext, place: PlaceDef): MapPart {
  const f = ctx.field;
  const g = place.y;
  const [hx, hz] = place.pad;
  const inPad = (x: number, z: number) => Math.abs(x - place.x) <= hx + 1 && Math.abs(z - place.z) <= hz + 1;

  // ── The road as segments with arc length ─────────────────────────────────
  const pts = (PATHS.find((p) => p.name === ROAD) ?? PATHS[0]).points;
  const segs: Seg[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, s0: total });
    total += len;
  }
  const segAt = (s: number) => segs.find((q) => s < q.s0 + q.len) ?? segs[segs.length - 1];
  const pointAt = (s: number): [number, number] => {
    const q = segAt(s);
    const t = s - q.s0;
    return [q.ax + q.dx * t, q.az + q.dz * t];
  };
  const wetAt = (x: number, z: number) => {
    const w = f.waterAt(x, z);
    return w !== null && w > f.heightAt(x, z);
  };
  /** Arc length of the road point nearest to a map point. */
  const project = (x: number, z: number): number => {
    let best = 0;
    let bd = Infinity;
    for (const q of segs) {
      const t = Math.min(q.len, Math.max(0, (x - q.ax) * q.dx + (z - q.az) * q.dz));
      const d = Math.hypot(q.ax + q.dx * t - x, q.az + q.dz * t - z);
      if (d < bd) {
        bd = d;
        best = q.s0 + t;
      }
    }
    return best;
  };

  // Where the road is on the pad, and where it is over water.
  let padIn = Infinity;
  let padOut = -Infinity;
  const wetRuns: [number, number][] = [];
  for (let s = 0; s <= total; s += 0.5) {
    const [x, z] = pointAt(s);
    if (!inPad(x, z)) continue;
    padIn = Math.min(padIn, s);
    padOut = Math.max(padOut, s);
    if (!wetAt(x, z)) continue;
    const last = wetRuns[wetRuns.length - 1];
    if (last && s - last[1] < 4) last[1] = s;
    else wetRuns.push([s, s]);
  }
  const sAnchor = project(place.anchor[0], place.anchor[2]);

  // ── Plan: bridges, gates, causeway (arc lengths) ─────────────────────────
  const bridges = wetRuns.map(([a, b]): [number, number] => [Math.max(padIn + 0.5, a - 2.5), Math.min(padOut - 0.5, b + 2.5)]);
  const gateFits = (s: number) => {
    if (s - GATE_HALF < padIn + 0.5 || s + GATE_HALF > padOut - 0.5) return false;
    if (Math.abs(s - sAnchor) < GATE_HALF + BEACON_CLEAR) return false;
    if (segAt(s - GATE_HALF) !== segAt(s + GATE_HALF)) return false;
    for (const [a, b] of bridges) if (s + GATE_HALF > a && s - GATE_HALF < b) return false;
    return true;
  };
  const gates: number[] = [];
  const main = bridges.reduce<[number, number] | null>((m, r) => (!m || r[1] - r[0] > m[1] - m[0] ? r : m), null);
  if (main) {
    // One gate at each end of the crossing, as close as the pad and the beacon allow.
    for (let s = main[0] - GATE_HALF - 0.5; s > main[0] - 16; s -= 0.5)
      if (gateFits(s)) {
        gates.push(s);
        break;
      }
    for (let s = main[1] + GATE_HALF + 0.5; s < main[1] + 16; s += 0.5)
      if (gateFits(s)) {
        gates.push(s);
        break;
      }
  }
  if (gates.length < 2) {
    // A second gate further along the road, away from the crossing.
    const from = gates[0] ?? (padIn + padOut) / 2 - CAUSEWAY / 2;
    const away = main && from < main[0] ? -1 : 1;
    for (let d = CAUSEWAY; d > 14; d -= 0.5) {
      const s = from + away * d;
      if (gateFits(s)) {
        gates.push(s);
        break;
      }
    }
  }
  gates.sort((a, b) => a - b);
  const causeways: [number, number][] = [];
  if (gates.length === 2) {
    const [a, b] = [gates[0] + GATE_HALF, gates[1] - GATE_HALF];
    // Only the stretch not already a bridge.
    const covered = bridges.some(([p, q]) => p <= a + 1 && q >= b - 1);
    if (!covered && b - a > 4) causeways.push([a, b]);
  }

  // ── Build, one local builder per road segment ────────────────────────────
  const world = new VoxelBuilder();
  const lamps = new Lamps();
  // The road's line of light over the bridge (as path.ts: a 1.1 m warm strip,
  // soft gold by day, brighter and whiter at night).
  const line = new Lamps(2.5, 2.85);
  line.base.set(0xffc474).multiply(new Color(1, 0.8, 0.55));
  line.nightBase = new Color(0xffc474);
  const footprints: Footprint[] = [];
  const perSeg = new Map<Seg, { fr: Frame; b: VoxelBuilder; m: Mason; d: Mason }>();
  const local = (q: Seg) => {
    let e = perSeg.get(q);
    if (!e) {
      const b = new VoxelBuilder();
      e = { fr: Frame.along(q.ax, 0, q.az, q.dx, q.dz), b, m: new Mason(b, 1, { seed: 3 }), d: new Mason(b, 0.5, { seed: 4 }) };
      perSeg.set(q, e);
    }
    return e;
  };
  const snapH = (v: number) => Math.round(v * 2) / 2;

  /**
   * Deck, paving, light line, piers and balustrades along the road from s0 to
   * s1 (split at bends). On a bridge the whole span is paved and lit (the road
   * pass leaves it bare); on a causeway only where the ground dips under the
   * road. The rails keep clear of the beacon's landing.
   */
  const run = (s0: number, s1: number, bridge: boolean) => {
    const src = traceSource();
    for (const q of segs) {
      const a = Math.max(s0, q.s0);
      const b = Math.min(s1, q.s0 + q.len);
      if (b - a < 1) continue;
      const { fr, d, b: lb } = local(q);
      const x0 = snapH(a - q.s0);
      const x1 = snapH(b - q.s0);
      footprints.push({ fr, x0, z0: -4.5, x1, z1: 4.5 });
      let wa = Infinity;
      let wb = -Infinity;
      let glow0 = NaN;
      const glow = (x: number) => {
        if (!Number.isNaN(glow0) && x - glow0 >= 0.5) line.strip(fr.world((glow0 + x) / 2, g + PAVE_TOP - 0.02, 0), x - glow0, 1.1, 0.12, fr.theta);
        glow0 = NaN;
      };
      for (let x = x0; x < x1; x += 0.5) {
        const xm = x + 0.25;
        let low = Infinity;
        let wet = false;
        for (const z of [-3.25, -1.75, 0, 1.75, 3.25]) {
          const wx = fr.wx(xm, z);
          const wz = fr.wz(xm, z);
          low = Math.min(low, f.heightAt(wx, wz));
          wet ||= wetAt(wx, wz);
        }
        const bare = bridge || wetAt(fr.wx(xm, 0), fr.wz(xm, 0)) || f.heightAt(fr.wx(xm, 0), fr.wz(xm, 0)) < g - 0.25;
        if (bare && Number.isNaN(glow0)) glow0 = x;
        if (!bare) glow(x);
        if (wet) {
          wa = Math.min(wa, x);
          wb = Math.max(wb, x + 0.5);
        }
        // Paving at the road's height where the road pass leaves the deck bare.
        if (bare)
          for (let z = -3; z < 3; z++) lb.box(xm, g + PAVE_TOP / 2, z + 0.5, 0.5, PAVE_TOP, 1, pick(PAVE, hash3(Math.round(x * 2), z, 3, 17)), 'mapStone', { src, open: 4 });
        if (low >= g - 0.25) continue;
        // Deck slab with a moulded edge; over dry dips (river banks) it is solid.
        d.fill(x, g - 0.5, -3.5, x + 0.5, g, 3.5, STONE, { src });
        d.fill(x, g - 1, 3.5, x + 0.5, g - 0.5, 4, STONE_LIGHT, { src });
        d.fill(x, g - 1, -4, x + 0.5, g - 0.5, -3.5, STONE_LIGHT, { src });
        if (!wet) d.fill(x, Math.max(low, g - 6), -3.5, x + 0.5, g - 0.5, 3.5, STONE_DARK, { src });
      }
      glow(x1);
      // Piers in the water, evenly spaced, each with cutwaters on both sides.
      if (wb > wa) {
        const n = Math.max(1, Math.round((wb - wa) / 3));
        for (let i = 0; i < n; i++) {
          const p = snapH(wa + ((i + 0.5) * (wb - wa)) / n);
          let bed = g;
          let water = -Infinity;
          for (const z of [-4.5, 0, 4.5]) {
            bed = Math.min(bed, f.heightAt(fr.wx(p, z), fr.wz(p, z)));
            water = Math.max(water, f.waterAt(fr.wx(p, z), fr.wz(p, z)) ?? -Infinity);
          }
          const top = Number.isFinite(water) ? snapH(water + 0.5) : g - 1;
          d.fill(p - 0.5, bed, -4.5, p + 0.5, g - 0.5, 4.5, STONE_DARK, { src });
          d.fill(p - 0.5, bed, -4.5, p + 0.5, Math.min(top, g - 0.5), 4.5, LATERITE, { src });
          d.fill(p - 0.5, bed, 4.5, p + 0.5, top, 5.5, LATERITE, { src });
          d.fill(p - 0.5, bed, -5.5, p + 0.5, top, -4.5, LATERITE, { src });
          d.fill(p, bed, 5.5, p + 0.5, top - 0.5, 6, STONE_DARK, { src });
          d.fill(p - 0.5, bed, -6, p, top - 0.5, -5.5, STONE_DARK, { src });
        }
      }
      // Balustrades, stopping short of the beacon; a fan head at each end.
      const ranges: [number, number][] = [];
      const [ba, bb] = [sAnchor - BEACON_CLEAR, sAnchor + BEACON_CLEAR];
      if (bb <= a || ba >= b) ranges.push([a, b]);
      else {
        if (ba - a >= 3) ranges.push([a, ba]);
        if (b - bb >= 3) ranges.push([bb, b]);
      }
      for (const [ra, rb] of ranges) {
        const heads: [boolean, boolean] = [Math.abs(ra - s0) < 0.01 || ra !== a, Math.abs(rb - s1) < 0.01 || rb !== b];
        for (const side of [1, -1] as const)
          for (const p of naga(d, snapH(ra - q.s0), snapH(rb - q.s0), { g, side, z: RAIL_Z, heads, src })) lamps.add(fr.world(...p), 0.45);
      }
    }
  };

  for (const [a, b] of bridges) run(a, b, true);
  for (const [a, b] of causeways) run(a, b, false);

  // Gates.
  for (const s of gates) {
    const q = segAt(s);
    const { fr } = local(q);
    const cx = Math.round(s - q.s0);
    const ground =(lx: number, lz: number) => f.heightAt(fr.wx(cx + lx, lz), fr.wz(cx + lx, lz));
    const dry = (lx: number, lz: number) => !wetAt(fr.wx(cx + lx, lz), fr.wz(cx + lx, lz)) && ground(lx, lz) >= g - 2.5 && inPad(fr.wx(cx + lx, lz), fr.wz(cx + lx, lz));
    const wing = (side: 1 | -1) => {
      for (let len = 5; len >= 2; len--) {
        let ok = true;
        for (let z = 5; z <= 5 + len && ok; z += 1) for (const x of [-3, 0, 3]) ok &&= dry(x, side * z);
        if (ok) return len;
      }
      return 0;
    };
    const wings: [number, number] = [wing(-1), wing(1)];
    // Build square in a frame centred on the gate, then shift into the segment frame.
    const gb = new VoxelBuilder();
    const gm = new Mason(gb, 1, { seed: 7 + cx });
    const gd = new Mason(gb, 0.5, { seed: 8 + cx });
    const spots = gopura(gm, gd, {
      g,
      wings,
      footing: (x, z) => Math.max(0, g - Math.min(ground(x, z), g)),
      src: traceSource(),
    });
    gm.weather(0.14);
    gd.weather(0.1);
    gm.commit();
    gd.commit();
    gb.translate(cx, 0, 0);
    local(q).b.append(gb);
    for (const p of spots) lamps.add(fr.world(cx + p[0], p[1], p[2]), 0.5);
    footprints.push({ fr, x0: cx - GATE_HALF, z0: -5 - wings[0] - 1, x1: cx + GATE_HALF, z1: 5 + wings[1] + 1 });
  }

  // A riverside shrine behind the first gate, and two stupas by the second.
  if (gates.length) {
    const s = gates[0];
    const q = segAt(s);
    const { fr } = local(q);
    const cx = Math.round(s - q.s0) - 2;
    const lz = -16;
    const wx = fr.wx(cx, lz);
    const wz = fr.wz(cx, lz);
    if (inPad(wx, wz) && f.heightAt(wx, wz) === g && !wetAt(wx, wz)) {
      const sb = new VoxelBuilder();
      const sm = new Mason(sb, 0.5, { seed: 21 });
      const src = traceSource();
      sm.fill(-3.5, g, -3.5, 3.5, g + 1, 3.5, LATERITE, { src });
      sm.fill(-4, g, -1, -3.5, g + 0.5, 1, STONE_DARK, { src });
      prasat(sm, 0, 0, g + 1, { h: 10, w: 4, tiers: 4, doors: SIDE.px | SIDE.pz, src });
      sm.weather(0.12);
      sm.commit();
      sb.translate(cx, 0, lz);
      local(q).b.append(sb);
      footprints.push({ fr, x0: cx - 4, z0: lz - 4, x1: cx + 4, z1: lz + 4 });
      lamps.add(fr.world(cx + 3, g + 1.5, lz + 3), 0.4, 0.8);
    }
  }
  if (gates.length === 2) {
    const s = gates[1];
    const q = segAt(s);
    const { fr, d } = local(q);
    const cx = Math.round(s - q.s0);
    for (const lz of [-11, 11]) {
      const x = cx - 6;
      const wx = fr.wx(x, lz);
      const wz = fr.wz(x, lz);
      if (!inPad(wx, wz) || f.heightAt(wx, wz) !== g || wetAt(wx, wz)) continue;
      stupa(d, x, lz, g, 5, traceSource());
      footprints.push({ fr, x0: x - 2.5, z0: lz - 2.5, x1: x + 2.5, z1: lz + 2.5 });
    }
  }

  // Commit the segment builders and turn them into place.
  for (const { fr, b, m, d } of perSeg.values()) {
    m.weather(0.12);
    d.weather(0.08);
    m.commit();
    d.commit();
    fr.place(b, world);
  }

  // ── Grass on the open pad; trees may come back behind the road ───────────
  const near = (x: number, z: number, margin: number) =>
    footprints.some(({ fr, x0, z0, x1, z1 }) => {
      const [lx, lz] = fr.local(x, z);
      return lx > x0 - margin && lx < x1 + margin && lz > z0 - margin && lz < z1 + margin;
    });
  const roadDist = (x: number, z: number): [number, number] => {
    let bd = Infinity;
    let side = 0;
    for (const q of segs) {
      const t = Math.min(q.len, Math.max(0, (x - q.ax) * q.dx + (z - q.az) * q.dz));
      const d = Math.hypot(q.ax + q.dx * t - x, q.az + q.dz * t - z);
      if (d < bd) {
        bd = d;
        // Left of the direction of travel = north-west here (behind the road from the camera).
        side = (x - q.ax) * -q.dz + (z - q.az) * q.dx;
      }
    }
    return [bd, side];
  };
  grassOverPad(
    f,
    world,
    { x0: place.x - hx - 2, z0: place.z - hz - 2, x1: place.x + hx + 2, z1: place.z + hz + 2, y: g },
    (x, z) => roadDist(x, z)[0] < 4.6 || near(x, z, 0.8),
    (x, z) => {
      const [dist, side] = roadDist(x, z);
      return dist > 10 && side < 0 && !near(x, z, 7);
    },
  );

  // Occupy what was built (the pad already is; the footprints can reach past it).
  for (const { fr, x0, z0, x1, z1 } of footprints) {
    const cs = [fr.world(x0, 0, z0), fr.world(x1, 0, z0), fr.world(x0, 0, z1), fr.world(x1, 0, z1)];
    const xs = cs.map((c) => c[0]);
    const zs = cs.map((c) => c[2]);
    // (a turned rectangle: occupy its cells one by one)
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2)
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) if (near(x, z, 0.5)) f.occupy(x, z, x, z);
  }

  // ── Meshes ───────────────────────────────────────────────────────────────
  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(world, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: `landmark:${place.id}` }));
  // One warm light over the causeway at night.
  const lightAt = gates.length === 2 ? (gates[0] + gates[1]) / 2 : main ? (main[0] + main[1]) / 2 : (padIn + padOut) / 2;
  const [lx, lz] = pointAt(lightAt);
  object.add(lamps.addLight([lx, g + 7, lz], 900, 60));
  const lampMesh = lamps.build(`landmark:${place.id}:lamps`);
  if (lampMesh) object.add(lampMesh);
  const lineMesh = line.build(`landmark:${place.id}:road-light`);
  if (lineMesh) object.add(lineMesh);
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: world.boxes.length,
    update(fr: MapFrame) {
      lamps.update(fr.night, fr.t);
      line.update(fr.night, fr.t);
    },
  };
}
