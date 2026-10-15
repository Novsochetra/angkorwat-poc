import { GATHER, gatherLeft, gatherTakenAt, type GatherSpot } from '../build/gather';
import { progress } from '../progress';

/**
 * Which parts of a spot are gone (the gathering sources that show it: the bamboo
 * clumps' sides, roam/_gatherBamboo.ts; the young sugar palms' fans,
 * roam/_gatherThatch.ts): each piece taken is one part, the one nearest the side
 * he works from (`from`), then the nearest still there. The core keeps how many
 * pieces are gone and when (build/gather.ts); this keeps which parts, oldest
 * first, saved under `key` (per spot id: the part numbers). A spot the save says
 * less or more of than the core is made to agree with it (parts dropped oldest
 * first, as the core gives the pieces back, or added round from the south); a
 * broken value reads as none.
 */
export class GatherParts {
  private readonly cut: Record<string, number[]> = {};
  private readonly side = new Map<string, number>();

  constructor(
    private readonly key: string,
    /** Parts a spot has (its pieces are fewer or as many). */
    private readonly parts: number,
    /** The way part `n` of `spot` faces out from its middle (rad, `atan2(dz, dx)`). */
    private readonly angleOf: (spot: GatherSpot, n: number) => number,
  ) {
    const ok = (v: unknown): v is Record<string, number[]> => typeof v === 'object' && v !== null && !Array.isArray(v);
    let n = 0;
    for (const [id, list] of Object.entries(progress.get(key, {}, ok))) {
      if (++n > 4000 || id.length > 200 || !Array.isArray(list)) continue;
      const got: number[] = [];
      for (const s of list) if (Number.isInteger(s) && s >= 0 && s < parts && !got.includes(s) && got.length < parts) got.push(s);
      if (got.length) this.cut[id] = got;
    }
  }

  /** He works `spot` from (x, z) (its source's `onWork`). */
  from(spot: GatherSpot, x: number, z: number): void {
    this.side.set(spot.id, Math.atan2(z - spot.z, x - spot.x));
  }

  /** Saved parts for `id` (whatever the core says). */
  saved(id: string): readonly number[] {
    return this.cut[id] ?? [];
  }

  /** The parts gone now, oldest first, as many as the core says are growing back (saved when they change). */
  of(spot: GatherSpot): number[] {
    const n = Math.min(this.parts, spot.pieces - gatherLeft(spot));
    const had = this.cut[spot.id] ?? [];
    let list = had.length > n ? had.slice(had.length - n) : had.slice();
    const want = this.side.get(spot.id) ?? Math.PI / 2;
    while (list.length < n) {
      let best = -1;
      let bd = Infinity;
      for (let s = 0; s < this.parts; s++) {
        if (list.includes(s)) continue;
        const a = this.angleOf(spot, s) - want;
        const d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
        if (d < bd - 1e-6) {
          bd = d;
          best = s;
        }
      }
      if (best < 0) break;
      list = [...list, best];
    }
    if (list.length !== had.length || list.some((s, i) => s !== had[i])) {
      if (list.length) this.cut[spot.id] = list;
      else delete this.cut[spot.id];
      progress.set(this.key, Object.keys(this.cut).length ? this.cut : null);
    }
    return list;
  }

  /** How far each part gone has grown back (0‥1), oldest first (`n` of them). */
  grow(spot: GatherSpot, n: number): number[] {
    const ts = gatherTakenAt(spot);
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const at = ts[ts.length - n + i];
      out.push(at === undefined ? 0 : Math.max(0, Math.min(1, (GATHER.clock - at) / spot.regrowDays)));
    }
    return out;
  }
}
