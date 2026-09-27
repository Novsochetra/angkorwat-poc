import { len2 } from '../fauna/_len';
import type { BackSpots } from '../hamlet/_bhSpots';
import type { MapFrame } from '../types';
import { Actor, wrap } from './_actor';
import { Bicycle } from './_bicycle';
import { dress } from './_kinds';
import { FEAT, SLOT, type Look } from './_personModel';
import type { Ground, Obstacle } from './_routes';
import type { PeopleEnv } from './_scene';
import { rideAt, type Ride } from './_sceneBackFolk';
import { since, Way, within, type WayPoint } from './_sceneBackKit';

/**
 * The schoolchildren of the hamlet behind Angkor Wat (`_sceneBack.ts`): a
 * boy and his sister in their school uniforms (white shirts, navy shorts and
 * skirt) ride their bicycles out of the yard in the morning (`clock` 0.86),
 * down the lane past the market and east along the back trail to school,
 * one behind the other, ringing the bell at the explorer in the way
 * (`bikeBell`); they ride home the same way in the afternoon (0.06). Seen
 * part way, they are as far along as the clock says; hidden before and
 * after (their bicycles with them).
 *
 * URL: `bhschool=<s>` in a still: that many seconds into the ride (out in
 * the morning's half of the day, home in the afternoon's).
 */

/** Riding pace (m/s), the gap between the two (s), when they ride out and home (clock). */
const RIDE = 2.9;
const GAP = 1.2;
const OUT = 0.86;
const HOME = 0.06;

export class SchoolRide {
  readonly actors: Actor[] = [];
  private readonly kids: Ride[] = [];
  private readonly out: Way;
  private readonly home: Way;
  private readonly wp: WayPoint = { x: 0, z: 0, yaw: 0 };
  private t = -1;
  private trip: 'out' | 'home' | null = null;

  constructor(
    private readonly env: PeopleEnv,
    spots: BackSpots,
    private readonly ground: Ground,
    add: (a: Actor) => Actor,
  ) {
    this.out = new Way(spots.routes.school);
    this.home = this.out.reversed();
    ([
      ['m', 2851],
      ['f', 2853],
    ] as const).forEach(([sex, seed]) => {
      const a = add(new Actor(env.crowd, uniform(dress('kid', seed, { sex }), sex), ground));
      this.kids.push({ a, bike: new Bicycle(env.things, seed, { load: 'basket' }), rolled: 0, y: 0, bellAt: 0, parked: null });
      this.actors.push(a);
    });
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null, first: boolean): void {
    const trip = within(f.clock, OUT, HOME) ? 'out' : 'home';
    if (trip !== this.trip || first) {
      const q = this.env.params.get('bhschool');
      this.t = q !== null && first ? Number(q) || 0 : since(f.clock, trip === 'out' ? OUT : HOME);
      this.trip = trip;
    } else this.t += dt;
    const way = trip === 'out' ? this.out : this.home;
    const R = way.len / RIDE;
    this.kids.forEach((r, k) => {
      const u = this.t - k * GAP;
      if (u < 0 || u > R) {
        if (r.a.shown) r.a.hide();
        r.bike.hide();
        return;
      }
      rideAt(r, way, u * RIDE, 1, RIDE, dt, now, this.ground, this.wp);
      this.bell(r, f, ex, now);
    });
  }

  /** A ring of the bell for the explorer in the way ahead. */
  private bell(r: Ride, f: MapFrame, ex: Obstacle | null, now: number): void {
    if (!ex || f.dt <= 0 || now < r.bellAt) return;
    const a = r.a;
    const dx = ex.x - a.x;
    const dz = ex.z - a.z;
    if (len2(dx, dz) > 9 || Math.abs(wrap(Math.atan2(dx, dz) - a.yaw)) > 0.6) return;
    r.bellAt = now + 5;
    f.calls.push({ kind: 'bikeBell', x: a.x, y: a.y + 1, z: a.z, gain: 0.55 });
  }

  hide(): void {
    for (const r of this.kids) {
      if (r.a.shown) r.a.hide();
      r.bike.hide();
    }
    this.trip = null;
  }
}

/** A child in the Khmer school uniform: a white shirt with a collar, navy shorts (a boy) or a navy skirt (a girl). */
function uniform(base: Look, sex: 'm' | 'f'): Look {
  const colors = base.colors.slice();
  const skin = colors[SLOT.skin];
  for (const s of [SLOT.top, SLOT.sleeveL, SLOT.sleeveR]) colors[s] = 0xf4f2ec;
  colors[SLOT.foreL] = colors[SLOT.foreR] = skin;
  colors[SLOT.hips] = colors[SLOT.thigh] = 0x22305a;
  colors[SLOT.shin] = sex === 'f' ? 0x22305a : skin;
  colors[SLOT.accent] = 0xf8f6f0;
  const feats = new Set(base.feats);
  feats.add(FEAT.collar);
  if (sex === 'f') feats.add(FEAT.skirt);
  return { ...base, colors, feats: [...feats] };
}
