/**
 * The boat race's rules (roam/_raceRow.ts): the drum's beat, his timing, the
 * two boats' speeds. Plain numbers, no three.js, no page: the add-on steps it
 * (`step`, seconds of the race's own clock: the same at 30 and 144 frames a
 * second) and hands it his presses (`press`, at the moment the key went
 * down), then draws what it says.
 *
 * - **The beat**: the drummer's, a stroke a beat. Three beats count down
 *   (`t` < 0), the fourth is the start (`t` = 0, the whistle) and the first
 *   stroke. It quickens with his boat's way down the course (`STAGES`:
 *   1.15 beats a second, 1.32 from half way, 1.55 for the last fifth), easing
 *   over a few beats; the caller shouts as it does (`onStage`).
 * - **His timing**: a press within `WINDOW.ok` of a beat strokes on it
 *   (perfect within 60 ms, good within 120, early or late within 200); a beat
 *   with no press is missed, a press with no beat near (or a second one on a
 *   beat) is off the beat. Each beat's mark moves the crew's form (`q`, 0‥1:
 *   an average over the last few beats); a stroke on the beat pushes the boat
 *   on at once (a surge); off the beat drags it back.
 * - **The speeds**: his boat goes as fast as the crew's form and the beat
 *   allow (`vMax`: 1.7 m/s all out of time … 4.1 at the first beat, 4.8 at the
 *   last stretch's, all perfect); the other boat keeps a steady pace that
 *   varies a little (`RIVAL`: 3.52, 3.71, 4.04 m/s by its own way down the
 *   course), so a good crew (most strokes good or perfect) wins by a few boat
 *   lengths and a careless one (beats missed, presses at random) loses.
 * - **The crews' strokes**: his crew's stroke clock (`crew`, strokes) runs at
 *   the beat and is pulled onto his presses (they row when he does); how hard
 *   they pull (`crewRow`) follows the form. The other crew rows to its own
 *   beat.
 * - **The finish**: a boat over the line (`LENGTH` m) coasts on, slowing; the
 *   race is over once both are over it (or the other has been over it
 *   `GIVE_UP` s); `won`, `margin` (m, how far apart they were as the first
 *   crossed).
 */

export type Judgement = 'perfect' | 'good' | 'early' | 'late' | 'miss';

/** Timing windows (s either side of a beat). */
export const WINDOW = { perfect: 0.06, good: 0.12, ok: 0.2 } as const;
/** A judged press counts this late on purpose (s): what is seen on screen comes a frame after the frame that made it. */
const LAG = 0.012;
/** The beat by his way down the course (0‥1): beats a second. */
export const STAGES: readonly { from: number; hz: number }[] = [
  { from: 0, hz: 1.15 },
  { from: 0.5, hz: 1.32 },
  { from: 0.8, hz: 1.55 },
];
/** The other boat's pace by its own way down the course (m/s), as `STAGES`. */
const RIVAL = [3.52, 3.71, 4.04];
/** His boat: speed all out of time, and what the form adds at the first beat and per beat a second more (m/s). */
const V0 = 1.7;
const V1 = 2.42;
const V2 = 1.6;
/** How fast the speeds follow (s), and the surge of a stroke on the beat (m/s at a perfect one). */
const TAU = 1.05;
const TAU_RIVAL = 1.4;
const SURGE = 0.16;
/** Off the beat: the form lost, the speed lost (m/s). */
const WILD_Q = 0.1;
const WILD_V = 0.14;
/** The form's average: each beat's mark weighs this much. */
const Q_RATE = 0.3;
/** Coasting over the line: speed halves in about this (s). */
const TAU_COAST = 2.6;
/** After the other boat is over the line, the race ends this long after (s) even if his is not. */
const GIVE_UP = 8;
/** Marks of a beat (0‥1). */
const SCORE: Record<Judgement, number> = { perfect: 1, good: 0.8, early: 0.45, late: 0.45, miss: 0 };

export interface RaceEvents {
  /** A beat to schedule (race time `t`, number `n`: −3‥−1 the count, 0 the start, then the race's). */
  onBeat?(t: number, n: number): void;
  /** His press or a missed beat, judged (`err`: s off its beat; NaN for a miss or a press off the beat). */
  onJudge?(j: Judgement, err: number, wild: boolean): void;
  /** The beat quickens (stage 1, 2) at race time `t`. */
  onStage?(stage: number, t: number): void;
  /** Boat `k` (0 his, 1 the other) crossed the line at `t`. */
  onFinish?(k: 0 | 1, t: number): void;
}

export class RaceGame {
  /** The race's clock (s): < 0 the count, 0 the start. */
  t = 0;
  phase: 'count' | 'race' | 'over' = 'count';
  /** Metres from the start line and speeds (m/s): his boat, then the other. */
  readonly x = [0, 0];
  readonly v = [0, 0];
  /** The crew's form (0‥1). */
  q = 0.62;
  /** Beats a second now, and the stage. */
  hz = STAGES[0].hz;
  stage = 0;
  /** The next beat (race time) and its number; the last beats (time, judged). */
  next = 0;
  n = -3;
  private readonly past: { t: number; judged: boolean }[] = [];
  /** The next beat was handed to `onBeat`; it was taken already (a press a little early). */
  private told = false;
  private nextTaken = false;
  /** His crew's stroke clock (strokes; the catch on whole numbers) and the pull still to take up; the other crew's. */
  crew = 0;
  private pull = 0;
  rivalCrew = 0;
  /** How hard his crew rows (0‥1). */
  crewRow = 0;
  /** Over the line (race time; NaN: not yet), and the result once over. */
  readonly finish = [Number.NaN, Number.NaN];
  won: boolean | null = null;
  margin = 0;
  /** Counts of his beats, his best run of beats on time and the run now. */
  readonly counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
  streak = 0;
  best = 0;
  /** The other boat's sway (a seed): a different steady pace each race. */
  private sway = 0;

  constructor(
    readonly length: number,
    private readonly ev: RaceEvents = {},
  ) {}

  /** A new race: the count begins `lead` s before its first beat. */
  start(seed: number, lead = 1.2): void {
    const p = 1 / STAGES[0].hz;
    this.t = -3 * p - lead;
    this.phase = 'count';
    this.x[0] = this.x[1] = 0;
    this.v[0] = this.v[1] = 0;
    this.q = 0.62;
    this.hz = STAGES[0].hz;
    this.stage = 0;
    this.next = -3 * p;
    this.n = -3;
    this.past.length = 0;
    this.told = false;
    this.nextTaken = false;
    this.crew = this.next * this.hz;
    this.pull = 0;
    this.rivalCrew = this.crew + 0.08;
    this.crewRow = 0.25;
    this.finish[0] = this.finish[1] = Number.NaN;
    this.won = null;
    this.margin = 0;
    this.counts.perfect = this.counts.good = this.counts.ok = this.counts.miss = 0;
    this.streak = this.best = 0;
    this.sway = seed;
  }

  /** His way down the course (0‥1). */
  get progress(): number {
    return Math.min(1, Math.max(0, this.x[0] / this.length));
  }

  /** The beat before now (race time), for the drum's ring; and the one after (`next`). */
  get last(): number {
    return this.past.length ? this.past[this.past.length - 1].t : this.next - 1 / this.hz;
  }

  /** One step of `dt` s. */
  step(dt: number): void {
    if (dt <= 0) return;
    this.t += dt;
    const t = this.t;
    // ── The beat: hand the next one to the drum a little ahead, then go on to the one after ──
    if (this.phase !== 'over' || !this.overBoth()) {
      if (!this.told && t >= this.next - 0.2 && this.drumming()) {
        this.told = true;
        this.ev.onBeat?.(this.next, this.n);
      }
      while (t >= this.next) {
        this.past.push({ t: this.next, judged: this.n < 0 || this.nextTaken });
        this.nextTaken = false;
        if (this.past.length > 4) this.past.shift();
        if (this.n === -1) this.phase = 'race';
        // (the beat quickens with his way down the course: the stage's beat, eased over two or three beats)
        let s = 0;
        for (let i = 0; i < STAGES.length; i++) if (this.progress >= STAGES[i].from) s = i;
        if (this.n >= 0 && s > this.stage) {
          this.stage = s;
          this.ev.onStage?.(s, this.next);
        }
        if (this.n >= 0) this.hz += (STAGES[this.stage].hz - this.hz) * 0.45;
        this.next += 1 / this.hz;
        this.n++;
        this.told = false;
      }
    }
    // ── Beats gone by with no press: missed ──
    if (this.phase === 'race' && Number.isNaN(this.finish[0]))
      for (const b of this.past)
        if (!b.judged && t > b.t + WINDOW.ok + LAG) {
          b.judged = true;
          this.mark('miss', Number.NaN, false);
        }
    // ── The boats ──
    const racing = this.phase !== 'count';
    for (let k = 0; k < 2; k++) {
      if (!racing) break;
      const over = !Number.isNaN(this.finish[k]);
      let goal: number;
      if (over) goal = 0;
      else if (k === 0) goal = V0 + this.q * (V1 + V2 * (this.hz - STAGES[0].hz));
      else {
        const p = this.x[1] / this.length;
        const st = p >= STAGES[2].from ? 2 : p >= STAGES[1].from ? 1 : 0;
        goal = RIVAL[st] * (1 + 0.026 * Math.sin(t * 0.55 + this.sway * 6.28) + 0.012 * Math.sin(t * 1.9 + this.sway * 17));
      }
      const tau = over ? TAU_COAST : k === 0 ? TAU : TAU_RIVAL;
      this.v[k] += (goal - this.v[k]) * (1 - Math.exp(-dt / tau));
      if (this.v[k] < 0) this.v[k] = 0;
      this.x[k] += this.v[k] * dt;
      if (!over && this.x[k] >= this.length) {
        const ft = t - (this.x[k] - this.length) / Math.max(0.1, this.v[k]);
        this.finish[k] = ft;
        if (this.won === null) {
          this.won = k === 0;
          // (how far the other boat was behind as the first crossed)
          const other = this.x[1 - k] - this.v[1 - k] * (t - ft);
          this.margin = Math.max(0.5, this.length - other);
        }
        this.ev.onFinish?.(k as 0 | 1, ft);
      }
    }
    if (racing && this.won !== null && this.phase === 'race') {
      const first = Number.isNaN(this.finish[0]) ? this.finish[1] : Number.isNaN(this.finish[1]) ? this.finish[0] : Math.min(this.finish[0], this.finish[1]);
      if (this.overBoth() || t - first > GIVE_UP) this.phase = 'over';
    }
    // ── The crews' strokes: his at the beat, pulled onto his presses; the other's at its own ──
    const hzNow = this.drumming() ? this.hz : 0.35 * this.hz;
    const take = this.pull * Math.min(1, dt * 7);
    this.pull -= take;
    this.crew += hzNow * dt + take;
    this.rivalCrew += (Number.isNaN(this.finish[1]) && racing ? STAGES[Math.min(2, this.rivalStage())].hz : this.phase === 'count' ? 0 : 0.3) * dt;
    const want = this.phase === 'count' ? 0.25 : !Number.isNaN(this.finish[0]) ? 0.08 : 0.42 + 0.58 * this.q;
    this.crewRow += (want - this.crewRow) * (1 - Math.exp(-dt * 2.5));
  }

  /** Both boats are over the line. */
  private overBoth(): boolean {
    return !Number.isNaN(this.finish[0]) && !Number.isNaN(this.finish[1]);
  }

  /** The drum beats: the count, and until his boat is over the line. */
  drumming(): boolean {
    return Number.isNaN(this.finish[0]) && this.phase !== 'over';
  }

  private rivalStage(): number {
    const p = this.x[1] / this.length;
    return p >= STAGES[2].from ? 2 : p >= STAGES[1].from ? 1 : 0;
  }

  /** The other crew's beat now (strokes a second). */
  get rivalHz(): number {
    return STAGES[Math.min(2, this.rivalStage())].hz;
  }

  /** How hard the other crew rows (0‥1). */
  get rivalRow(): number {
    return this.phase === 'count' ? 0.25 : Number.isNaN(this.finish[1]) ? 0.95 : 0.08;
  }

  /** He pressed at race time `p` (the key's own moment); returns its mark (null: not one to mark, tapping along with the count). */
  press(p: number): Judgement | null {
    if (this.phase === 'over' || !Number.isNaN(this.finish[0])) return null;
    const at = p - LAG;
    // (the count's beats are not his: tapping along with "3, 2, 1" costs nothing)
    if (at < -WINDOW.ok) return null;
    // The nearest beat not judged yet within the window: one gone by, or the next (a press a little early).
    let best: { t: number; judged: boolean } | null = null;
    let err = Infinity;
    for (const b of this.past) {
      const e = at - b.t;
      if (!b.judged && Math.abs(e) <= WINDOW.ok && Math.abs(e) < Math.abs(err)) {
        best = b;
        err = e;
      }
    }
    const early = this.n >= 0 && !this.nextTaken && Math.abs(at - this.next) <= WINDOW.ok && Math.abs(at - this.next) < Math.abs(err);
    if (early) err = at - this.next;
    if (!best && !early) {
      this.mark('miss', Number.NaN, true);
      return 'miss';
    }
    if (early) this.nextTaken = true;
    else best!.judged = true;
    const a = Math.abs(err);
    const j: Judgement = a <= WINDOW.perfect ? 'perfect' : a <= WINDOW.good ? 'good' : err < 0 ? 'early' : 'late';
    this.mark(j, err, false);
    // (his crew catches with him: their stroke clock onto a whole number at his press)
    const c = this.crew + (p - this.t) * this.hz;
    this.pull += Math.round(c) - c;
    return j;
  }

  private mark(j: Judgement, err: number, wild: boolean): void {
    if (wild) {
      this.q = Math.max(0, this.q - WILD_Q);
      if (this.phase === 'race') this.v[0] = Math.max(0, this.v[0] - WILD_V);
      this.streak = 0;
      this.counts.miss++;
    } else {
      this.q += Q_RATE * (SCORE[j] - this.q);
      if (this.phase === 'race' || this.n <= 1) this.v[0] += SURGE * SCORE[j];
      if (j === 'perfect') this.counts.perfect++;
      else if (j === 'good') this.counts.good++;
      else if (j === 'miss') this.counts.miss++;
      else this.counts.ok++;
      if (j === 'perfect' || j === 'good') this.best = Math.max(this.best, ++this.streak);
      else this.streak = 0;
    }
    this.ev.onJudge?.(j, err, wild);
  }

  /**
   * Put the race at `progress` (0‥1 of his way) as if it had gone well so far (checks: `race=row:<p>`): the other
   * boat `gap` m behind (− ahead), the beat and the form of that stretch.
   */
  setProgress(progress: number, gap = 2): void {
    const p = Math.min(0.999, Math.max(0, progress));
    this.phase = 'race';
    this.x[0] = p * this.length;
    this.x[1] = Math.max(0, this.x[0] - gap);
    this.q = 0.82;
    this.stage = 0;
    for (let i = 0; i < STAGES.length; i++) if (p >= STAGES[i].from) this.stage = i;
    this.hz = STAGES[this.stage].hz;
    this.v[0] = V0 + this.q * (V1 + V2 * (this.hz - STAGES[0].hz));
    this.v[1] = RIVAL[this.stage];
    this.t = this.x[0] / 3.7 + 1.2;
    this.n = Math.floor(this.t * this.hz);
    this.next = (this.n + 1) / this.hz;
    this.past.length = 0;
    this.nextTaken = false;
    this.past.push({ t: this.next - 1 / this.hz, judged: true });
    this.crew = this.t * this.hz;
    this.rivalCrew = this.crew + 0.1;
    this.crewRow = 0.42 + 0.58 * this.q;
    this.counts.perfect = Math.round(this.n * 0.5);
    this.counts.good = Math.round(this.n * 0.4);
    this.counts.ok = this.n - this.counts.perfect - this.counts.good;
    this.streak = this.best = 9;
  }

  /** Put the race over (checks: `race=win|lose`): his boat `won`, by `margin` m, both coasted past the line. */
  setOver(won: boolean, margin: number): void {
    this.phase = 'over';
    this.won = won;
    this.margin = margin;
    const lead = won ? 0 : 1;
    this.x[lead] = this.length + 9.5;
    this.x[1 - lead] = this.length + 9.5 - margin * 0.6;
    this.v[0] = this.v[1] = 0.3;
    this.t = this.length / (won ? 3.95 : 3.3) + 4;
    this.finish[lead] = this.t - 4;
    this.finish[1 - lead] = this.t - 4 + margin / 3.6;
    this.crewRow = 0.05;
    this.counts.perfect = won ? 21 : 6;
    this.counts.good = won ? 13 : 9;
    this.counts.ok = won ? 3 : 8;
    this.counts.miss = won ? 1 : 12;
    this.best = won ? 17 : 5;
  }
}
