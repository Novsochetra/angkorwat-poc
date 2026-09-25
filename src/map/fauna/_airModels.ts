import { J, Shape } from './_waterAirKit';
import { CRITTER } from './_waterModels';

/**
 * Blocky models of the air animals (see _waterAirKit.ts for the rig).
 */

/** Left shoulder of the bat's wings (model frame, m). */
export const BAT_SHOULDER: [number, number, number] = [0.035, 0.01, 0.03];

/**
 * A flying fox (Lyle's flying fox roosts at Angkor): dark body with a
 * golden mantle, fox face with small ears, membrane wings about 1 m across.
 * Origin at the middle of the body. (Small bats use it scaled down.)
 */
export function batShape(): Shape {
  const [sx, sy, sz] = BAT_SHOULDER;
  return (
    new Shape(0)
      .box({ at: [0, 0, -0.02], size: [0.07, 0.065, 0.18], color: 0x2b2220 })
      .box({ at: [0, 0.008, 0.07], size: [0.08, 0.075, 0.07], color: 0x6a4a2c })
      .box({ at: [0, 0.01, 0.13], size: [0.055, 0.05, 0.06], color: 0x2e2522 })
      .box({ at: [0, 0.0, 0.17], size: [0.03, 0.03, 0.035], color: 0x241d1b })
      .pair({ at: [0.018, 0.045, 0.125], size: [0.015, 0.03, 0.015], color: 0x241d1b })
      // Arm and membrane, then the hand; the leading edge a shade darker.
      .pair({ at: [0.17, sy, -0.02], size: [0.27, 0.012, 0.19], color: 0x2a211f, joint: J.wingL, pivot: [sx, sy, sz] })
      .pair({ at: [0.17, sy + 0.008, 0.07], size: [0.27, 0.014, 0.025], color: 0x1a1414, joint: J.wingL, pivot: [sx, sy, sz] })
      .pair({ at: [0.42, sy, -0.01], size: [0.24, 0.01, 0.16], color: 0x2a211f, joint: J.tipL, pivot: [0.3, sy, 0.05] })
      .pair({ at: [0.42, sy + 0.008, 0.065], size: [0.24, 0.012, 0.02], color: 0x1a1414, joint: J.tipL, pivot: [0.3, sy, 0.05] })
      // Feet tucked under the tail.
      .pair({ at: [0.02, -0.02, -0.12], size: [0.012, 0.012, 0.05], color: 0x1a1414, tone: 0 })
  );
}

/**
 * A dragonfly: long thin abdomen in its colour (the tint: blue or red),
 * big eyes, two pairs of glassy wings that flicker. Origin at the thorax;
 * about 0.14 m long.
 */
export function dragonflyShape(): Shape {
  const pivot: [number, number, number] = [0.01, 0.012, 0.0];
  return new Shape(CRITTER.dragonfly)
    .box({ at: [0, 0, 0.005], size: [0.028, 0.03, 0.045], color: 0xffffff })
    .box({ at: [0, 0, -0.065], size: [0.016, 0.016, 0.1], color: 0xf0f0f0 })
    .box({ at: [0, -0.002, -0.12], size: [0.012, 0.012, 0.02], color: 0x303030, tone: 0 })
    .box({ at: [0, 0.004, 0.04], size: [0.036, 0.03, 0.026], color: 0x9a9aa0 })
    .pair({ at: [0.07, 0.013, 0.012], size: [0.12, 0.004, 0.026], color: 0xe4ecf0, joint: J.wingL, pivot, tone: 0 })
    .pair({ at: [0.065, 0.011, -0.02], size: [0.11, 0.004, 0.03], color: 0xdce6ec, joint: J.wingL, pivot, tone: 0 });
}
