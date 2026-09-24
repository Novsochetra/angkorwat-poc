import type { HeightField } from '../heightfield';
import { PLACES, type PlaceDef } from '../layout';

/**
 * The road as a line of "stations" every half metre: a smoothed centre line
 * over the land, with the height the road is built at. That height is the
 * ground, raised where needed so the road never climbs more than one 0.5 m
 * step per 0.5 m — so at a cliff the road becomes a straight staircase built
 * out from the cliff face on the low side, and small 2 m terrain steps become
 * short flights of four steps. Over water the road is a bridge deck.
 */

/** Paved width (m). */
export const ROAD_W = 4;
/** Station spacing along the road, and the rise of one stair step (m). */
export const STEP = 0.5;
/** Paving top above the road height (the stones stand a little proud of the ground). */
export const LIFT = 0.25;

export const KIND = {
  /** On the ground (or raised on a stone bed). */
  ground: 0,
  /** Over a river: a small stone footbridge. */
  bridge: 1,
  /** Over the river inside the River Gate's pad: its own big bridge is there. */
  gate: 2,
} as const;
export type StationKind = (typeof KIND)[keyof typeof KIND];

export interface Station {
  x: number;
  z: number;
  /** Unit direction of travel on the map. */
  tx: number;
  tz: number;
  /** Distance along the road network from the River Gate end (m): the light pulses run along it. */
  s: number;
  /** Ground under the centre (m). */
  ground: number;
  /** Road height (m): paving top is h + LIFT. */
  h: number;
  kind: StationKind;
  /** Water under it (bridge stations). */
  wet: boolean;
  /** On a flight of steps (the height changes next to it). */
  stair: boolean;
  /** On a beacon's landing (flat, no lamps, no missing stones). */
  landing: boolean;
}

export interface RoadLine {
  name: string;
  stations: Station[];
}

export interface BeaconSpot {
  place: PlaceDef;
  road: number;
  station: number;
}

export interface RoadNetwork {
  roads: RoadLine[];
  beacons: BeaconSpot[];
}

/** Smoothing radius of the centre line (samples of 1 m): rounds the corners of layout.ts's polylines. */
const SMOOTH = 6;
/** Half length of the flat landing round a beacon (m). */
const LANDING = 3.5;

const RIVER_GATE = PLACES.find((p) => p.id === 'rivergate')!;
function inGatePad(x: number, z: number): boolean {
  return Math.abs(x - RIVER_GATE.x) <= RIVER_GATE.pad[0] + 2 && Math.abs(z - RIVER_GATE.z) <= RIVER_GATE.pad[1] + 2;
}

export function buildRoadNetwork(field: HeightField): RoadNetwork {
  const roads: RoadLine[] = [];
  for (const path of field.paths) {
    const pts = smoothLine(path.samples.map((s) => [s.x, s.z] as [number, number]));
    roads.push({ name: path.name, stations: resample(pts, field) });
  }
  // Distance along the network: the first road starts at the River Gate; every
  // other road carries on from the nearest station of the roads before it, so
  // the pulses flow outwards from the start of the journey.
  for (let r = 0; r < roads.length; r++) {
    const st = roads[r].stations;
    let offset = 0;
    if (r > 0) {
      let best = Infinity;
      for (let q = 0; q < r; q++)
        for (const o of roads[q].stations) {
          const d = Math.hypot(o.x - st[0].x, o.z - st[0].z);
          if (d < best) {
            best = d;
            offset = o.s + d;
          }
        }
    }
    let s = offset;
    for (let i = 0; i < st.length; i++) {
      if (i > 0) s += Math.hypot(st[i].x - st[i - 1].x, st[i].z - st[i - 1].z);
      st[i].s = s;
    }
  }
  for (const road of roads) crossings(road.stations, field);
  const beacons = landings(roads);
  for (const road of roads) profile(road.stations);
  return { roads, beacons };
}

/** Moving average of the 1 m samples; the window shrinks at the ends so they stay put. */
function smoothLine(pts: [number, number][]): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.min(SMOOTH, i, n - 1 - i);
    let x = 0;
    let z = 0;
    for (let j = i - r; j <= i + r; j++) {
      x += pts[j][0];
      z += pts[j][1];
    }
    out.push([x / (2 * r + 1), z / (2 * r + 1)]);
  }
  return out;
}

/** Stations every STEP metres along the smoothed line, with the ground under them. */
function resample(pts: [number, number][], field: HeightField): Station[] {
  const out: Station[] = [];
  let seg = 0;
  let segT = 0;
  const len = (i: number) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (;;) {
    while (seg < pts.length - 1 && segT > len(seg)) {
      segT -= len(seg);
      seg++;
    }
    if (seg >= pts.length - 1) break;
    const L = len(seg) || 1;
    const [ax, az] = pts[seg];
    const [bx, bz] = pts[seg + 1];
    const x = ax + ((bx - ax) * segT) / L;
    const z = az + ((bz - az) * segT) / L;
    out.push({ x, z, tx: 0, tz: 0, s: 0, ground: 0, h: 0, kind: KIND.ground, wet: false, stair: false, landing: false });
    segT += STEP;
  }
  const [lx, lz] = pts[pts.length - 1];
  const last = out[out.length - 1];
  if (!last || Math.hypot(last.x - lx, last.z - lz) > STEP * 0.4)
    out.push({ x: lx, z: lz, tx: 0, tz: 0, s: 0, ground: 0, h: 0, kind: KIND.ground, wet: false, stair: false, landing: false });
  // Directions: over a few metres, so the stones of a bend fan out smoothly.
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 3)];
    const b = out[Math.min(out.length - 1, i + 3)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / l;
    out[i].tz = (b.z - a.z) / l;
  }
  // Ground: the highest of the centre and two points across the road, so the
  // paving is never buried where the road runs along a terrain step.
  for (const st of out) {
    const nx = st.tz;
    const nz = -st.tx;
    const c = field.heightAt(st.x, st.z);
    const w = field.waterAt(st.x, st.z);
    st.wet = w !== null && w > c;
    st.ground = st.wet ? c : Math.max(c, dryHeight(field, st.x + nx * 1.2, st.z + nz * 1.2, c), dryHeight(field, st.x - nx * 1.2, st.z - nz * 1.2, c));
  }
  return out;
}

/** Height at a point, or `fallback` where it is under water. */
function dryHeight(field: HeightField, x: number, z: number, fallback: number): number {
  const w = field.waterAt(x, z);
  const h = field.heightAt(x, z);
  return w !== null && w > h ? fallback : h;
}

/** Bridges: every run of wet stations (plus a metre of abutment each side). */
function crossings(st: Station[], field: HeightField): void {
  for (let i = 0; i < st.length; i++) {
    if (!st[i].wet) continue;
    let e = i;
    while (e + 1 < st.length && st[e + 1].wet) e++;
    const a = Math.max(0, i - 2);
    const b = Math.min(st.length - 1, e + 2);
    const mid = st[(i + e) >> 1];
    let level = -Infinity;
    for (let j = i; j <= e; j++) level = Math.max(level, field.waterAt(st[j].x, st[j].z) ?? st[j].ground);
    if (inGatePad(mid.x, mid.z)) {
      for (let j = a; j <= b; j++) {
        st[j].kind = KIND.gate;
        st[j].ground = Math.max(st[j].wet ? level + 1 : st[j].ground, level + 1);
      }
    } else {
      // Deck: over the lower bank (steps lead down to it from the higher one), and
      // at least 1.5 m over the water.
      const bankA = st[Math.max(0, i - 6)].ground;
      const bankB = st[Math.min(st.length - 1, e + 6)].ground;
      const deck = Math.ceil(Math.max(level + 1.5, Math.min(bankA, bankB)) / STEP) * STEP;
      for (let j = a; j <= b; j++) {
        st[j].kind = KIND.bridge;
        st[j].ground = st[j].wet ? deck : Math.max(st[j].ground, deck);
      }
    }
    i = e;
  }
}

/** A flat landing on the road at every place's beacon. */
function landings(roads: RoadLine[]): BeaconSpot[] {
  const out: BeaconSpot[] = [];
  for (const place of PLACES) {
    const [ax, , az] = place.anchor;
    let best = { d: Infinity, road: 0, station: 0 };
    roads.forEach((road, r) =>
      road.stations.forEach((st, i) => {
        const d = Math.hypot(st.x - ax, st.z - az);
        if (d < best.d && st.kind !== KIND.gate) best = { d, road: r, station: i };
      }),
    );
    if (best.d > 8) continue;
    const st = roads[best.road].stations;
    const n = Math.round(LANDING / STEP);
    const a = Math.max(0, best.station - n);
    const b = Math.min(st.length - 1, best.station + n);
    let top = -Infinity;
    for (let j = a; j <= b; j++) top = Math.max(top, st[j].ground);
    for (let j = a; j <= b; j++) {
      st[j].ground = top;
      st[j].landing = true;
    }
    out.push({ place, road: best.road, station: best.station });
  }
  return out;
}

/**
 * Road heights: the ground, raised so the road climbs at most one step (0.5 m)
 * per station both ways — the stairs are built out from the cliff on its low
 * side — then snapped to whole steps.
 */
function profile(st: Station[]): void {
  const n = st.length;
  for (let i = 0; i < n; i++) st[i].h = st[i].ground;
  for (let i = 1; i < n; i++) st[i].h = Math.max(st[i].h, st[i - 1].h - STEP);
  for (let i = n - 2; i >= 0; i--) st[i].h = Math.max(st[i].h, st[i + 1].h - STEP);
  for (const s of st) s.h = Math.ceil(s.h / STEP - 1e-6) * STEP;
  for (let i = 0; i < n; i++) st[i].stair = (i > 0 && st[i - 1].h !== st[i].h) || (i < n - 1 && st[i + 1].h !== st[i].h);
}
