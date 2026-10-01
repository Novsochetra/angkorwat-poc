import type { Crowd, Look, Pose } from '../people/_personModel';

/**
 * The people who stay put at the pagoda's festivals (Pchum Ben, Visak
 * Bochea): monks seated on the porch, families kneeling before them, people
 * on mats on the terrace. Each has a place, a pose and the hours they are
 * there (`when(clock)`, the time of day 0‥1: 0 afternoon, 0.25 dusk, 0.5
 * night, 0.75 dawn).
 */
export interface Sitter {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pose: Pose;
  /** There at this time of day. */
  when(clock: number): boolean;
  /** Holds what it carries the carry way (a tray). */
  carry?: boolean;
  /** Only on the festival's big day (Pchum). */
  bigDay?: boolean;
}

/** The time of day `c` (0‥1) is within [a, b), the span wrapping past 1. */
export const between = (c: number, a: number, b: number): boolean => (a <= b ? c >= a && c < b : c >= a || c < b);

/** Places the sitters (indices `first`… in the crowd), hiding those not there now. */
export function placeSitters(sitters: readonly Sitter[], first: number, crowd: Crowd, clock: number, bigDay: boolean, now: number, snap: boolean, posed: Int8Array): void {
  for (let k = 0; k < sitters.length; k++) {
    const p = sitters[k];
    const i = first + k;
    if (!p.when(clock) || (p.bigDay && !bigDay)) {
      if (crowd.isShown(i)) crowd.hide(i);
      posed[k] = -1;
      continue;
    }
    crowd.place(i, p.x, p.y, p.z, p.yaw);
    if (posed[k] !== p.pose || snap) {
      posed[k] = p.pose;
      crowd.pose(i, p.pose, now, true);
      crowd.gait(i, 0, 0, now);
      if (p.carry) crowd.carry(i, 1, now, true);
    }
  }
}

/** A list of looks and sitters being filled (the order is the crowd's). */
export class Cast {
  readonly looks: Look[] = [];
  readonly sitters: Sitter[] = [];
  /** The first sitter's index (sitters come after everyone else). */
  sitFirst = -1;
  add(look: Look): number {
    if (this.sitFirst >= 0) throw new Error('festival: walkers before sitters');
    this.looks.push(look);
    return this.looks.length - 1;
  }
  sit(look: Look, s: Sitter): void {
    if (this.sitFirst < 0) this.sitFirst = this.looks.length;
    this.looks.push(look);
    this.sitters.push(s);
  }
}
