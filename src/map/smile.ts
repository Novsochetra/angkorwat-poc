/**
 * His camera, for the people who smile for it: the roaming explorer
 * (roam/_smile.ts) writes each frame where his camera or his selfie phone
 * is and what it looks at while it is up, and the people part
 * (people/_smileBack.ts) reads it: those in the picture notice, turn to it
 * and pose in their own way, and go back to what they did once it is
 * lowered, turned away or the photo is taken. No three.js.
 */
export interface Lens {
  /** Up and looking now (false: lowered, or he is not roaming). */
  up: boolean;
  /** His camera, or the phone's front camera (a selfie: he is in the picture, the people behind him photobomb). */
  kind: 'camera' | 'selfie';
  /** Where the picture is seen from (m). */
  x: number;
  y: number;
  z: number;
  /** The way it looks (a unit vector). */
  dx: number;
  dy: number;
  dz: number;
  /** Half the picture's height and width over the distance ahead (tangents of half the field of view, up and across). */
  tanV: number;
  tanH: number;
  /** Where he stands (m, his feet). */
  hx: number;
  hy: number;
  hz: number;
  /** Counts up with each photo taken (a reader keeps the last it saw). */
  shots: number;
}

export const LENS: Lens = { up: false, kind: 'camera', x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, tanV: 0.4, tanH: 0.6, hx: 0, hy: 0, hz: 0, shots: 0 };
