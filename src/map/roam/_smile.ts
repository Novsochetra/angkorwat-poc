import { Quaternion, Vector3 } from 'three';
import { SELFIE_CENTER } from '../../character/Animator';
import { LENS } from '../smile';
import { registerAddon, type AddonEnv } from './_addons';

/**
 * People smile for his camera (the people's side: people/_smileBack.ts).
 * While his camera (4) or his selfie phone (5) is up, this writes the
 * picture's bus each frame (map/smile.ts `LENS`): where the picture is seen
 * from, the way it looks and how wide (the camera's shot and zoom, or the
 * phone's front camera), where he stands, and a count of the photos taken
 * (the shutter: a click, Space, the touch shutter). Nothing else here: no
 * keys of its own, no prompt; it works in every mode he can take photos in
 * (on foot, in the boat, under the hang glider, in the balloon's basket).
 *
 * URL (checks): `smile=1` with `tool=camera&pview=…` (or `tool=selfie`)
 * counts the camera up at once, so a shot shows them posed even from the
 * follow camera (no `sim=` needed); `smile=<how>` (`peace`, `thumb`, `wave`,
 * `cheer`, `sampeah`, `smile`, `nod`, `calm`, `photo`, `look`) poses
 * everyone who can that way (people/_smileBack.ts); `smile=0` turns it off
 * (the before picture).
 */

/** The view is this far into the lens (0‥1, photo.ts `view`) when people count the camera as up. */
const UP_VIEW = 0.6;
/** His camera's view stands this far ahead of his face (m, true size: photo.ts `AHEAD`). */
const AHEAD = 0.32;
/** The selfie's view stands this far behind the phone (m, true size, from no reach to the full arm: photo.ts `SELFIE_BACK`), on the stick at the lens. */
const SELFIE_BACK = [0.3, 0.75] as const;
/** The phone's front camera (vertical field of view, degrees: photo.ts), at arm's length (+ up to 10 held close) and on the stick. */
const SELFIE_FOV = 64;
const STICK_FOV = 70;

let env: AddonEnv | null = null;
/** `smile=0`: off; `smile=<anything else>`: the camera counts as up at once (checks). */
let off = false;
let forced = false;
const _v = new Vector3();
const _q = new Quaternion();
const _d = new Vector3();

registerAddon({
  id: 'smile',
  init(e) {
    env = e;
    const q = e.params.get('smile');
    off = q === '0';
    forced = q !== null && q !== '0';
  },
  input(ctx) {
    // The shutter (photo.ts takes it the same way this step: a click, Space or the touch shutter, the view in the lens).
    const p = env?.photo;
    if (p?.kind && p.view > 0.95 && (ctx.input.click || ctx.input.jump)) LENS.shots++;
    return false;
  },
  frame(f, mode) {
    const e = env;
    if (!e) return;
    const p = e.photo;
    const up = !off && !!p.kind && mode !== 'overview' && !p.albumOpen && (p.view >= UP_VIEW || forced) && aim(e, p.kind);
    LENS.up = up;
    if (!up) return;
    LENS.kind = p.kind!;
    const b = e.body.pos;
    LENS.hx = b.x;
    LENS.hy = b.y;
    LENS.hz = b.z;
    const fov = p.kind === 'camera' ? p.shot.fov : e.explorer.selfieStick ? STICK_FOV : SELFIE_FOV + (1 - e.explorer.selfieAim.reach) * 10;
    LENS.tanV = Math.tan((fov * Math.PI) / 360);
    LENS.tanH = LENS.tanV * (f.camera.aspect || 1.6);
  },
  setMode(next) {
    if (next === 'overview') LENS.up = false;
  },
  report() {
    return LENS.up ? { smile: '1' } : null;
  },
});

/** Where the picture is seen from and the way it looks, into `LENS` (false: the phone is not out yet). */
function aim(e: AddonEnv, kind: 'camera' | 'selfie'): boolean {
  const s = e.body.scale;
  if (kind === 'camera') {
    // (his camera at his eye, looking along the shot: photo.ts `eye`)
    const { yaw, pitch } = e.photo.shot;
    const c = Math.cos(pitch);
    _d.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c);
    const head = e.explorer.rig.joints.head;
    head.updateWorldMatrix(true, false);
    head.localToWorld(_v.copy(SELFIE_CENTER));
    _v.addScaledVector(_d, AHEAD * s);
  } else {
    // (the phone's front camera looks back at his face; the view stands a little behind it at arm's length)
    if (!e.explorer.phoneLens(_v, _q)) return false;
    _d.set(0, 0, -1).applyQuaternion(_q);
    const back = e.explorer.selfieStick ? 0 : (SELFIE_BACK[0] + (SELFIE_BACK[1] - SELFIE_BACK[0]) * e.explorer.selfieAim.reach) * s;
    _v.addScaledVector(_d, -back);
  }
  LENS.x = _v.x;
  LENS.y = _v.y;
  LENS.z = _v.z;
  LENS.dx = _d.x;
  LENS.dy = _d.y;
  LENS.dz = _d.z;
  return true;
}
