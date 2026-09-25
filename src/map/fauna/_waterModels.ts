import { J, Shape } from './_waterAirKit';

/**
 * Blocky models of the water animals, a few boxes each (see _waterAirKit.ts
 * for the rig). Sizes are real, in metres; the herds scale them up a little
 * so they read from the roaming camera.
 */

/** Kinds in the ducks' mesh. */
export const DUCK = { spotbill: 0, duckling: 1, whistler: 2 } as const;

/** Duck models: origin on the waterline under the middle of the body. */
export function duckShapes(): Shape[] {
  // Indian spot-billed duck: scaly grey-brown, dark back and tail, buff face
  // with a dark crown and eye stripe, black bill with a yellow tip, a blue
  // speculum with white tertials.
  const s = new Shape(DUCK.spotbill)
    .box({ at: [0, 0.02, 0], size: [0.26, 0.13, 0.44], color: 0x6f645a })
    .box({ at: [0, 0.105, -0.04], size: [0.22, 0.06, 0.36], color: 0x4a3f36 })
    .box({ at: [0, 0.05, 0.2], size: [0.21, 0.12, 0.1], color: 0x7d7064 })
    .box({ at: [0, 0.12, -0.26], size: [0.12, 0.05, 0.13], color: 0x2e2621, joint: J.tail, pivot: [0, 0.1, -0.2], rot: [-0.45, 0, 0] })
    .pair({ at: [0.125, 0.09, -0.05], size: [0.03, 0.08, 0.3], color: 0x3f352e, joint: J.folded })
    .pair({ at: [0.132, 0.1, -0.08], size: [0.02, 0.035, 0.1], color: 0x2f6e8a, joint: J.folded, tone: 0 })
    .pair({ at: [0.12, 0.145, -0.12], size: [0.03, 0.025, 0.14], color: 0xe8e2d4, joint: J.folded })
    .pair({ at: [0.23, 0.13, 0.0], size: [0.24, 0.025, 0.2], color: 0x5a4838, joint: J.wingL, pivot: [0.11, 0.13, 0.04] })
    .pair({ at: [0.25, 0.145, -0.06], size: [0.14, 0.012, 0.06], color: 0x2f6e8a, joint: J.wingL, pivot: [0.11, 0.13, 0.04], tone: 0 })
    .pair({ at: [0.45, 0.13, -0.02], size: [0.2, 0.02, 0.14], color: 0x4a3a2e, joint: J.tipL, pivot: [0.35, 0.13, 0.02] });
  duckHead(s, { neck: 0xb3a58c, head: 0xc2b598, crown: 0x3e342c, bill: 0x1d1b1a, tip: 0xe8b830, y: 0, stripe: 0x3a2e26 });

  // Duckling: a dark brown ball with a yellow face and flanks.
  const d = new Shape(DUCK.duckling)
    .box({ at: [0, 0.03, 0], size: [0.14, 0.11, 0.2], color: 0x5d4a33 })
    .pair({ at: [0.071, 0.04, 0.02], size: [0.01, 0.05, 0.09], color: 0xd9bc5a })
    .box({ at: [0, 0.07, -0.1], size: [0.06, 0.04, 0.04], color: 0x4f3f2c, joint: J.tail, pivot: [0, 0.07, -0.08] })
    .box({ at: [0, 0.13, 0.08], size: [0.09, 0.085, 0.09], color: 0xd6b95a, joint: J.head, pivot: [0, 0.08, 0.06] })
    .box({ at: [0, 0.177, 0.075], size: [0.085, 0.014, 0.085], color: 0x4f3f2c, joint: J.head, pivot: [0, 0.08, 0.06] })
    .box({ at: [0, 0.12, 0.14], size: [0.035, 0.022, 0.04], color: 0x2a2522, joint: J.head, pivot: [0, 0.08, 0.06], tone: 0 });

  // Lesser whistling duck: chestnut, long buff neck, dark crown and back.
  const w = new Shape(DUCK.whistler)
    .box({ at: [0, 0.03, 0], size: [0.22, 0.14, 0.4], color: 0x9a5a34 })
    .box({ at: [0, 0.115, -0.04], size: [0.2, 0.06, 0.32], color: 0x4a3526 })
    .box({ at: [0, 0.09, -0.23], size: [0.1, 0.05, 0.08], color: 0x2e2420, joint: J.tail, pivot: [0, 0.09, -0.19] })
    .pair({ at: [0.105, 0.09, -0.04], size: [0.03, 0.07, 0.26], color: 0x3a2a20, joint: J.folded })
    .pair({ at: [0.2, 0.12, 0.0], size: [0.2, 0.025, 0.18], color: 0x3a2a20, joint: J.wingL, pivot: [0.1, 0.12, 0.03] })
    .pair({ at: [0.17, 0.135, 0.03], size: [0.1, 0.012, 0.08], color: 0x8a4a2a, joint: J.wingL, pivot: [0.1, 0.12, 0.03] })
    .pair({ at: [0.38, 0.12, -0.01], size: [0.18, 0.02, 0.12], color: 0x2a201a, joint: J.tipL, pivot: [0.3, 0.12, 0.02] });
  duckHead(w, { neck: 0xc7a57c, head: 0xcdb08a, crown: 0x5a4030, bill: 0x2a2826, tip: 0x2a2826, y: 0.03 });
  return [s, d, w];
}

function duckHead(s: Shape, c: { neck: number; head: number; crown: number; bill: number; tip: number; y: number; stripe?: number }): void {
  const pivot: [number, number, number] = [0, 0.14, 0.17];
  const y = c.y;
  s.box({ at: [0, 0.19 + y / 2, 0.2], size: [0.08, 0.12 + y, 0.08], color: c.neck, joint: J.head, pivot })
    .box({ at: [0, 0.27 + y, 0.23], size: [0.095, 0.09, 0.14], color: c.head, joint: J.head, pivot })
    .box({ at: [0, 0.32 + y, 0.22], size: [0.085, 0.018, 0.13], color: c.crown, joint: J.head, pivot })
    .box({ at: [0, 0.255 + y, 0.34], size: [0.055, 0.032, 0.09], color: c.bill, joint: J.head, pivot, tone: 0 })
    .box({ at: [0, 0.257 + y, 0.392], size: [0.053, 0.028, 0.026], color: c.tip, joint: J.head, pivot, tone: 0 })
    .pair({ at: [0.048, 0.278 + y, 0.25], size: [0.012, 0.016, 0.02], color: 0x141210, joint: J.head, pivot, tone: 0 });
  if (c.stripe) s.pair({ at: [0.049, 0.266 + y, 0.23], size: [0.01, 0.012, 0.1], color: c.stripe, joint: J.head, pivot });
}

/** Kinds in the waders' mesh. */
export const WADER = { egret: 0, heron: 1 } as const;
/** Left shoulder of the waders' open wings (model frame, m). */
export const WADER_SHOULDER: [number, number, number] = [0.09, 0.68, 0.02];

interface WaderColors {
  body: number;
  back: number;
  wing: number;
  hand: number;
  neck: number;
  head: number;
  crest: number;
  bill: number;
  legs: number;
}

/** Egrets and herons: origin at the feet; about 1 m tall. */
export function waderShapes(): Shape[] {
  // Great egret: all white, yellow bill, black legs.
  const egret = wader(new Shape(WADER.egret), {
    body: 0xf3f1ea,
    back: 0xeceae2,
    wing: 0xf1efe8,
    hand: 0xe8e6de,
    neck: 0xf3f1ea,
    head: 0xf5f3ec,
    crest: 0xf5f3ec,
    bill: 0xe8b82a,
    legs: 0x1e1c1a,
  });
  // Grey heron: grey back and wings with dark hands, white neck, black crest, yellow bill.
  const heron = wader(new Shape(WADER.heron), {
    body: 0x9aa0a4,
    back: 0x858c92,
    wing: 0x8b9298,
    hand: 0x2d3035,
    neck: 0xdcdcd6,
    head: 0xe6e6e0,
    crest: 0x1f1f22,
    bill: 0xd9a93a,
    legs: 0x8a7a50,
  });
  return [egret, heron];
}

function wader(s: Shape, c: WaderColors): Shape {
  const hip: [number, number, number] = [0.05, 0.52, -0.02];
  const neck: [number, number, number] = [0, 0.7, 0.13];
  const [sx, sy, sz] = WADER_SHOULDER;
  return (
    s
      // Legs (with the feet) swing at the hip.
      .pair({ at: [0.05, 0.27, -0.02], size: [0.035, 0.52, 0.035], color: c.legs, joint: J.legL, pivot: hip, tone: 0 })
      .pair({ at: [0.05, 0.012, 0.03], size: [0.05, 0.024, 0.1], color: c.legs, joint: J.legL, pivot: hip, tone: 0 })
      // Body, slanted a little tail-down, with a drooping tail.
      .box({ at: [0, 0.63, -0.02], size: [0.19, 0.19, 0.4], color: c.body, rot: [-0.25, 0, 0] })
      .box({ at: [0, 0.7, -0.05], size: [0.16, 0.06, 0.3], color: c.back, rot: [-0.25, 0, 0] })
      .box({ at: [0, 0.53, -0.24], size: [0.12, 0.05, 0.16], color: c.back, rot: [-0.55, 0, 0] })
      .pair({ at: [0.1, 0.64, -0.06], size: [0.025, 0.13, 0.34], color: c.wing, joint: J.folded, rot: [-0.25, 0, 0] })
      .pair({ at: [0.1, 0.6, -0.2], size: [0.022, 0.07, 0.12], color: c.hand, joint: J.folded, rot: [-0.3, 0, 0] })
      // S-shaped neck, head and dagger bill: they pitch at the base of the neck.
      .box({ at: [0, 0.79, 0.17], size: [0.07, 0.18, 0.07], color: c.neck, joint: J.head, pivot: neck, rot: [-0.35, 0, 0] })
      .box({ at: [0, 0.93, 0.13], size: [0.06, 0.14, 0.06], color: c.neck, joint: J.head, pivot: neck, rot: [0.35, 0, 0] })
      .box({ at: [0, 1.01, 0.17], size: [0.07, 0.07, 0.13], color: c.head, joint: J.head, pivot: neck })
      .box({ at: [0, 1.04, 0.13], size: [0.03, 0.02, 0.12], color: c.crest, joint: J.head, pivot: neck })
      .box({ at: [0, 1.0, 0.3], size: [0.026, 0.026, 0.16], color: c.bill, joint: J.head, pivot: neck, tone: 0 })
      .pair({ at: [0.036, 1.015, 0.2], size: [0.01, 0.014, 0.018], color: 0xd8b830, joint: J.head, pivot: neck, tone: 0 })
      // Open wings: a broad arm and a hand (about 1.6 m across).
      .pair({ at: [0.27, sy, -0.02], size: [0.36, 0.03, 0.3], color: c.wing, joint: J.wingL, pivot: [sx, sy, sz] })
      .pair({ at: [0.61, sy, -0.06], size: [0.34, 0.025, 0.22], color: c.hand, joint: J.tipL, pivot: [0.45, sy, -0.02] })
  );
}

/** Kinds in the small critters' mesh (with the dragonflies, _airModels.ts). */
export const CRITTER = { fish: 0, dragonfly: 1, frog: 2 } as const;

/** A small silver river fish (barb): origin at its middle; about 0.3 m long. */
export function fishShape(): Shape {
  return new Shape(CRITTER.fish)
    .box({ at: [0, 0, 0], size: [0.07, 0.1, 0.24], color: 0xc9cdc4 })
    .box({ at: [0, 0.042, -0.01], size: [0.058, 0.026, 0.22], color: 0x5b695f })
    .box({ at: [0, -0.005, 0.14], size: [0.06, 0.08, 0.06], color: 0xb8bdb4 })
    .pair({ at: [0.031, 0.008, 0.155], size: [0.006, 0.016, 0.016], color: 0x1a1a18, tone: 0 })
    .box({ at: [0, 0.07, 0.0], size: [0.012, 0.04, 0.08], color: 0x5b695f })
    .box({ at: [0, 0, -0.17], size: [0.018, 0.11, 0.08], color: 0x8f5a3c, joint: J.fin, pivot: [0, 0, -0.12], tone: 0 });
}

/** A frog sitting on the bank: origin under its middle; about 0.12 m long. */
export function frogShape(): Shape {
  return new Shape(CRITTER.frog)
    .box({ at: [0, 0.04, -0.01], size: [0.09, 0.06, 0.11], color: 0x5c7a3a, rot: [-0.25, 0, 0] })
    .box({ at: [0, 0.065, 0.06], size: [0.085, 0.04, 0.05], color: 0x6a8a44 })
    .pair({ at: [0.03, 0.09, 0.065], size: [0.022, 0.02, 0.02], color: 0x2c2a18, tone: 0 })
    .box({ at: [0, 0.035, 0.085], size: [0.06, 0.028, 0.03], color: 0xd6cc9a, joint: J.throat, pivot: [0, 0.035, 0.08], tone: 0 })
    .pair({ at: [0.055, 0.02, -0.02], size: [0.03, 0.035, 0.09], color: 0x4a6630, joint: J.hind, pivot: [0.045, 0.03, -0.045] })
    .pair({ at: [0.04, 0.015, 0.06], size: [0.016, 0.03, 0.016], color: 0x4a6630 });
}
