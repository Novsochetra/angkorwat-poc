import { mulberry32 } from '../../voxel/random';
import { FIT } from './_personModel';
import { Rig, RigDef, type Things } from './_things';

/**
 * The village bicycle (a rider in `POSE.ride` fits it: `FIT.bike`): an old
 * black or green step-through frame, a wide saddle, upright bars with a
 * bell, a rear rack (now and then a basket on it, or a sack of rice), mud
 * guards; its wheels and crank turn. Boxes of the people's things
 * (`_things.ts`), built in the rider's model metres, placed at the rider's
 * scale:
 *
 *   const bike = new Bicycle(env.things, seed);
 *   // each frame the rider rides (crowd.pose(i, POSE.ride), gait(i, 1, speed / (FIT.bike.gear · k))):
 *   bike.put(x, y, z, yaw, crowd.scale(i), crowd.phaseOf(i, now), rolled / (BIKE_WHEEL · k));
 *
 * `put` takes the rider's feet point and heading (the bicycle stands under
 * them), the pedals' turn (`phaseOf`: they turn with the rider's feet) and
 * the wheels' turn (rad: the distance rolled over the wheel's radius).
 * `hide()` folds it away. ≈ 40 boxes.
 */

/** Wheel radius and hubs (model metres, z ahead of the rider's feet point). */
const WHEEL = 0.24;
const HUB_BACK = -0.34;
const HUB_FRONT = 0.56;

export class Bicycle {
  readonly rig: Rig;
  private readonly front: number;
  private readonly back: number;
  private readonly crank: number;

  constructor(things: Things, seed: number, opts: { load?: 'basket' | 'sack' | 'none' } = {}) {
    const rnd = mulberry32(0xb1c + seed * 7717);
    const frame = [0x1c1c1e, 0x2a3a2c, 0x23304a, 0x5a1e1e][Math.floor(rnd() * 4) % 4];
    const steel = 0x9a9a9e;
    const tyre = 0x1a1818;
    const d = new RigDef();
    const [cy, cz] = FIT.bike.crank;
    const [bx, by, bz] = FIT.bike.bars;
    this.back = d.part([0, WHEEL, HUB_BACK]);
    this.front = d.part([0, WHEEL, HUB_FRONT]);
    this.crank = d.part([0, cy, cz]);
    // Wheels: a tyre ring of eight boxes round each hub, the hub, two spokes across (they show the turn).
    for (const [p, z] of [[this.back, HUB_BACK], [this.front, HUB_FRONT]] as const) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        d.box([0, WHEEL + Math.sin(a) * (WHEEL - 0.02), z + Math.cos(a) * (WHEEL - 0.02)], [0.05, 0.045, 0.2], tyre, { part: p, rot: [-a + Math.PI / 2, 0, 0] });
      }
      d.box([0, WHEEL, z], [0.07, 0.06, 0.06], steel, { part: p })
        .box([0, WHEEL, z], [0.012, 0.012, WHEEL * 2 - 0.06], steel, { part: p })
        .box([0, WHEEL, z], [0.012, WHEEL * 2 - 0.06, 0.012], steel, { part: p });
    }
    // The frame (step-through): the down tube from the head to the crank, the seat tube up to the saddle, stays back to the rear hub, the fork.
    const tube = (a: [number, number], b: [number, number], w = 0.035, color = frame) => {
      const dy = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.sqrt(dy * dy + dz * dz);
      d.box([0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [w, w, len], color, { rot: [-Math.atan2(dy, dz), 0, 0] });
    };
    const head: [number, number] = [by - 0.14, bz - 0.04];
    tube(head, [cy, cz]);
    tube([cy, cz], [FIT.bike.saddle - 0.05, -0.04]);
    tube([cy, cz], [WHEEL, HUB_BACK], 0.025);
    tube([FIT.bike.saddle - 0.08, -0.05], [WHEEL, HUB_BACK], 0.025);
    tube([head[0] + 0.06, head[1] - 0.02], [WHEEL, HUB_FRONT], 0.03);
    tube([head[0] + 0.06, head[1] - 0.02], [by - 0.02, bz - 0.06], 0.03, steel);
    // Saddle (wide, black), the bars across with grips, a bell by the left grip.
    d.box([0, FIT.bike.saddle - 0.02, -0.02], [0.13, 0.04, 0.2], 0x2a2220)
      .box([0, by - 0.02, bz - 0.02], [bx * 2 + 0.06, 0.025, 0.025], steel)
      .box([bx, by - 0.02, bz - 0.02], [0.05, 0.035, 0.035], 0x2a2a2a)
      .box([-bx, by - 0.02, bz - 0.02], [0.05, 0.035, 0.035], 0x2a2a2a)
      .box([bx - 0.08, by + 0.01, bz - 0.02], [0.035, 0.03, 0.035], 0xc8b060);
    // Mud guards over both wheels, a rack over the back one.
    d.box([0, WHEEL * 2 + 0.02, HUB_BACK], [0.07, 0.015, 0.34], frame).box([0, WHEEL * 2 + 0.02, HUB_FRONT], [0.07, 0.015, 0.3], frame);
    d.box([0, WHEEL * 2 + 0.05, HUB_BACK - 0.02], [0.2, 0.02, 0.3], steel);
    const load = opts.load ?? (rnd() < 0.35 ? 'basket' : rnd() < 0.4 ? 'sack' : 'none');
    if (load === 'basket') d.box([0, WHEEL * 2 + 0.16, HUB_BACK - 0.02], [0.3, 0.2, 0.3], 0xb89a5a).box([0, WHEEL * 2 + 0.265, HUB_BACK - 0.02], [0.31, 0.02, 0.31], 0x7a5a30);
    else if (load === 'sack') d.box([0, WHEEL * 2 + 0.14, HUB_BACK - 0.02], [0.34, 0.16, 0.26], 0xe8e0c8);
    // The crank: the axle's sprocket, two arms (the left one forward at turn 0) and the pedals.
    d.box([0.05, cy, cz], [0.02, 0.12, 0.12], steel, { part: this.crank });
    for (const [x, k] of [[0.08, 1], [-0.08, -1]] as const) {
      d.box([x, cy, cz + (k * FIT.bike.arm) / 2], [0.02, 0.025, FIT.bike.arm], steel, { part: this.crank })
        .box([x * 1.6, cy, cz + k * FIT.bike.arm], [0.1, 0.02, 0.05], 0x2a2a2a, { part: this.crank });
    }
    this.rig = new Rig(things, d);
  }

  /**
   * Stand it under a rider: their feet point and heading, their size (`crowd.scale`), the
   * pedals' turn (`crowd.phaseOf`) and the wheels' turn (rad).
   */
  put(x: number, y: number, z: number, yaw: number, k: number, crank: number, wheels: number): void {
    this.rig.place(x, y, z, yaw, 0, 0, k).turn(this.crank, crank).turn(this.front, wheels).turn(this.back, wheels);
    this.rig.write();
  }

  hide(): void {
    this.rig.hide();
  }
}

/** Metres a wheel's turn carries the bicycle, over the rider's scale (for the wheels' turn: rolled / (WHEEL · k) rad). */
export const BIKE_WHEEL = WHEEL;
