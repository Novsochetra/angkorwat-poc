import { Euler, MathUtils, Quaternion, Spherical, Vector3, type PerspectiveCamera } from 'three';
import type { AngkorExplorer, SelfieGesture } from '../../character/AngkorExplorer';
import { PHOTO_FOV, PhotoAlbum } from '../../game/Photos';
import { PLACES, PLATEAUS } from '../layout';
import type { RoamMode } from '../types';
import { angleDiff } from './followCam';
import type { RoamBody, RoamCtx, RoamWorld } from './types';

/** What the explorer holds up to take photos: his camera, or his phone (a selfie). */
export type PhotoKind = 'camera' | 'selfie';

/** Seconds to raise the camera to the eye / take it down (the phone takes a little longer: it goes round). */
const RAISE = 0.45;
const RAISE_SELFIE = 0.6;
/** His camera in front of his eyes (true size): height and how far forward (m), as in the game. */
const EYE = 1.7 * 0.722;
const AHEAD = 0.32;
/** Zoom range of his camera (vertical field of view, degrees). */
const FOV_MIN = 8;
const FOV_MAX = 75;
/** The phone's front camera (degrees): wide, as phones are (a little wider held close). */
const SELFIE_FOV = 64;
/**
 * The selfie view stands this far behind the phone (m, true size, from no
 * reach to the full arm; the phone and his fist hide meanwhile), as in the
 * game: his arm is shorter than his head is wide, so from the lens itself
 * only his face would show.
 */
const SELFIE_BACK = [0.3, 0.75] as const;
/** Near plane while the phone's view is up (m): his arm comes closer than the map camera's 0.5 m. */
const SELFIE_NEAR = 0.25;
const GESTURES: readonly SelfieGesture[] = ['peace', 'wave', 'thumbsUp', 'none'];
const GESTURE_NAME: Record<SelfieGesture, string> = { peace: 'peace sign', wave: 'wave', thumbsUp: 'thumbs up', none: 'no gesture' };

/** The map's keys under the viewfinder and the selfie shutter (M is the mini-map here). */
const CAMERA_HINT = '<kbd>Click</kbd> / <kbd>Space</kbd> take · drag to look · wheel to zoom · <kbd>4</kbd> / <kbd>Esc</kbd> put away · <kbd>V</kbd> album';
const SELFIE_HINT =
  '<kbd>Space</kbd> / click take · drag to move the phone · wheel closer / further · <kbd>G</kbd> gesture · <kbd>X</kbd> face · <kbd>5</kbd> / <kbd>Esc</kbd> put away · <kbd>V</kbd> album';

const _e = new Euler(0, 0, 0, 'YXZ');
const _q = new Quaternion();
const _v = new Vector3();
const _v2 = new Vector3();
const _back = new Vector3();
const _look = new Vector3();
const _from = new Spherical();
const _to = new Spherical();

export interface RoamPhoto {
  /** What is up now (null: nothing). */
  readonly kind: PhotoKind | null;
  /** 0 = the follow camera ‥ 1 = the view through the lens (eases between). */
  readonly view: number;
  /** The album is open (roaming pauses behind it). */
  readonly albumOpen: boolean;
  /** Where the view looks (radians; pitch + = up) and its field of view (degrees), for bug reports. */
  readonly shot: { yaw: number; pitch: number; fov: number };
  /** Raise the camera or the phone (false, with a message, when he can't). */
  raise(kind: PhotoKind, ctx: RoamCtx): boolean;
  /** Put it away (the view glides back out). */
  lower(): void;
  /** Photo mode's input, one step: look, zoom, the shutter. Turns him to where the photo looks. */
  step(ctx: RoamCtx, dt: number): void;
  /** New blocks came in (an outfit change): hide them too while his body is hidden. */
  refreshBody(): void;
  /** Cycle the selfie's hand gesture (G with the phone up); returns its name. */
  nextGesture(): string;
  setGesture(g: SelfieGesture): void;
  /**
   * After the follow camera: glide the view into the lens (the selfie's
   * swings round `pivot`, his chest, not through his head); hide his body
   * while the view is inside his head.
   */
  place(camera: PerspectiveCamera, pivot: Vector3): void;
  /** Right after the frame is drawn: take the photo asked for. */
  afterRender(): void;
  openAlbum(): void;
  /** Esc in the album: one photo → all of them → closed. */
  albumBack(): void;
  closeAlbum(): void;
}

export interface PhotoDeps {
  explorer: AngkorExplorer;
  body: RoamBody;
  world: RoamWorld;
  canvas: HTMLCanvasElement;
  /** The mode now (for the photo's place: on a river in the boat). */
  mode(): RoamMode;
  toast(text: string): void;
  /** The view went through the lens or back (hide the roaming interface). */
  onFinder(on: boolean): void;
}

/**
 * Photos on the map, as in the game: the camera comes up to his eye and the
 * view glides into it (drag to look, wheel to zoom, click or Space to take
 * a photo); or the selfie phone comes out at arm's length and the view
 * glides to its front camera (drag moves the phone round his head, wheel
 * holds it nearer or further). Photos go into the game's album (the same
 * IndexedDB album, src/game/Photos.ts), named by where they were taken.
 */
export function createRoamPhoto(d: PhotoDeps): RoamPhoto {
  const { explorer, body } = d;
  let album: PhotoAlbum | null = null;
  let kind: PhotoKind | null = null;
  /** The last kind up (the view glides back out of it). */
  let last: PhotoKind = 'camera';
  let view = 0;
  let snap = false;
  let finder = false;
  /** The game's viewfinder shows, and the zoom it reads out. */
  let finderFov = 0;
  /** The selfie frame shows, and the gesture and face it reads out. */
  let selfieFrame = false;
  let selfieInfo = '';
  let hidden = false;
  /** The map camera's own near plane (put back after a selfie). */
  let near = 0;
  /** The phone's lens (kept while the phone goes away and the view glides out). */
  const lens = new Vector3();
  const lensQ = new Quaternion();
  let hasLens = false;
  let gesture: SelfieGesture = 'peace';
  const shot = { yaw: 0, pitch: 0, fov: PHOTO_FOV };
  const aim = new Vector3();

  /** The album, made when first needed (its viewfinder, flash and print too). */
  function getAlbum(): PhotoAlbum {
    if (album) return album;
    album = new PhotoAlbum();
    // The selfie frame's shutter button (the view is ready: take it).
    album.onShutter = () => {
      if (kind && view > 0.95) snap = true;
    };
    const hint = document.querySelector('.photo-finder .hint');
    if (hint) hint.innerHTML = CAMERA_HINT;
    return album;
  }

  /** The camera at his eye, looking along the shot (world). */
  function eye(out: Vector3): Vector3 {
    const s = body.scale;
    return out.set(Math.sin(shot.yaw) * AHEAD * s, EYE * s, Math.cos(shot.yaw) * AHEAD * s).add(body.pos);
  }

  function setFinder(on: boolean): void {
    if (on === finder) return;
    finder = on;
    d.onFinder(on);
  }

  const api: RoamPhoto = {
    get kind() {
      return kind;
    },
    get view() {
      return view;
    },
    get albumOpen() {
      return !!album?.isOpen;
    },
    shot,
    raise(k, ctx) {
      if (k === kind) return true;
      if (k === 'camera' && !explorer.currentOutfit.camera) {
        d.toast('No camera with this outfit (G changes the outfit)');
        return false;
      }
      if (!body.grounded) return false;
      if (kind) api.lower();
      kind = last = k;
      getAlbum();
      if (k === 'camera') {
        // Look the way the view looks (he turns round to it), a little down.
        shot.yaw = ctx.cam.yaw;
        shot.pitch = -0.04;
        shot.fov = PHOTO_FOV;
        explorer.play('photo');
      } else {
        // (the phone to his right, a little above the eyes; he smiles by himself)
        Object.assign(explorer.selfieAim, { yaw: -0.5, pitch: 0.15, reach: 1 });
        explorer.selfieGesture = gesture;
        explorer.play('selfie');
      }
      return true;
    },
    lower() {
      if (!kind) return;
      explorer.stop(kind === 'camera' ? 'photo' : 'selfie');
      kind = null;
      snap = false;
      explorer.aimPoint = null;
      setFinder(false);
    },
    step(ctx, dt) {
      const input = ctx.input;
      if (kind === 'camera') {
        // Drag to look, wheel to zoom; slower when zoomed in.
        const k = shot.fov / PHOTO_FOV;
        shot.yaw += input.lookYaw * k;
        shot.pitch = MathUtils.clamp(shot.pitch - input.lookPitch * k, -1.2, 1.3);
        shot.fov = MathUtils.clamp(shot.fov * (1 + input.zoom * 0.1), FOV_MIN, FOV_MAX);
        body.yaw += angleDiff(shot.yaw, body.yaw) * Math.min(1, 12 * dt);
        // Head and hands follow the shot.
        explorer.aimPoint = aim.set(Math.sin(shot.yaw) * Math.cos(shot.pitch), Math.sin(shot.pitch), Math.cos(shot.yaw) * Math.cos(shot.pitch)).multiplyScalar(30).add(eye(_v));
      } else if (kind === 'selfie') {
        // Drag moves the phone round his head (the way the drag goes on the
        // screen: right = to his left), the wheel nearer or further. (The
        // explorer keeps it where his arm reaches.)
        const a = explorer.selfieAim;
        a.yaw -= input.lookYaw;
        a.pitch -= input.lookPitch;
        a.reach = MathUtils.clamp(a.reach + input.zoom * 0.12, 0, 1);
      }
      if (kind && view > 0.95 && (input.click || input.jump)) snap = true;
      view = MathUtils.clamp(view + (kind ? dt : -dt) / (last === 'selfie' ? RAISE_SELFIE : RAISE), 0, 1);
    },
    refreshBody() {
      if (hidden) explorer.setBodyVisible(false);
    },
    setGesture(g) {
      gesture = explorer.selfieGesture = g;
    },
    nextGesture() {
      gesture = GESTURES[(GESTURES.indexOf(gesture) + 1) % GESTURES.length];
      explorer.selfieGesture = gesture;
      return GESTURE_NAME[gesture];
    },
    place(camera, pivot) {
      const k = view * view * (3 - 2 * view);
      let fov = camera.fov;
      near ||= camera.near;
      const want = last === 'selfie' && view > 0 ? SELFIE_NEAR : near;
      if (camera.near !== want) {
        camera.near = want;
        camera.updateProjectionMatrix();
      }
      if (k > 0) {
        if (last === 'selfie' && explorer.phoneLens(lens, lensQ)) hasLens = true;
        if (last === 'selfie' && hasLens) {
          // Back from the phone along its view (further with more reach), short of a wall behind it.
          const reach = explorer.selfieAim.reach;
          const back = (SELFIE_BACK[0] + (SELFIE_BACK[1] - SELFIE_BACK[0]) * reach) * body.scale;
          const dir = _back.set(0, 0, 1).applyQuaternion(lensQ);
          const w = d.world;
          const room = back + 0.3;
          const free = w.clearance ? w.clearance(lens.x, lens.y, lens.z, lens.x + dir.x * room, lens.y + dir.y * room, lens.z + dir.z * room) : 1;
          _v.copy(lens).addScaledVector(dir, MathUtils.clamp(free * room - 0.3, 0, back));
          // Swing round him from the follow camera to there, looking at him on the way.
          _from.setFromVector3(_v2.subVectors(camera.position, pivot));
          _to.setFromVector3(_v2.subVectors(_v, pivot));
          _from.theta += angleDiff(_to.theta, _from.theta) * k;
          _from.phi += (_to.phi - _from.phi) * k;
          _from.radius += (_to.radius - _from.radius) * k;
          camera.position.setFromSpherical(_from).add(pivot);
          // His face: where the lens's line of sight passes closest to his chest.
          dir.set(0, 0, -1).applyQuaternion(lensQ);
          _look.copy(lens).addScaledVector(dir, Math.max(0, _v2.subVectors(pivot, lens).dot(dir)));
          camera.lookAt(_look.lerp(pivot, 1 - k));
          camera.quaternion.slerp(lensQ, k * k * k);
          fov += (SELFIE_FOV + (1 - reach) * 10 - fov) * k;
        } else if (last === 'camera') {
          camera.position.lerp(eye(_v), k);
          camera.quaternion.slerp(_q.setFromEuler(_e.set(shot.pitch, shot.yaw + Math.PI, 0)), k);
          fov += (shot.fov - fov) * k;
        }
        if (Math.abs(camera.fov - fov) > 1e-3) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      camera.updateMatrixWorld();
      setFinder(!!kind && view > 0.9);
      if (k <= 0) hasLens = false;
      const phoneHidden = last === 'selfie' && k > 0.8;
      if (explorer.hidePhone !== phoneHidden) explorer.hidePhone = phoneHidden;
      if (album) {
        const fov = kind === 'camera' && view > 0.9 ? Math.round(shot.fov * 10) / 10 : 0;
        if (fov !== finderFov) album.setViewfinder(fov > 0, shot.fov);
        finderFov = fov;
        // The phone's screen round the selfie, with the gesture and face on it.
        const phone = kind === 'selfie' && view > 0.9;
        // (a hand holding the lantern or torch makes no gesture)
        const hand = explorer.currentOutfit.held === 'none' ? GESTURE_NAME[explorer.selfieGesture] : `holding the ${explorer.currentOutfit.held}`;
        const info = phone ? `${hand} · ${explorer.currentExpression}` : '';
        if (phone !== selfieFrame || info !== selfieInfo) album.setSelfieFrame(phone, info, SELFIE_HINT);
        selfieFrame = phone;
        selfieInfo = info;
      }
      // His body hides while the view is inside or next to his head (the camera on the way in and out).
      const hide = last === 'camera' && view > 0 && camera.position.distanceTo(explorer.rig.joints.head.getWorldPosition(_v2)) < 0.95 * body.scale;
      if (hide !== hidden) explorer.setBodyVisible(!hide);
      hidden = hide;
    },
    afterRender() {
      if (!snap || !album) return;
      snap = false;
      album.capture(d.canvas, placeName(d.world, body.pos, d.mode()));
    },
    openAlbum() {
      getAlbum().openAlbum();
    },
    albumBack() {
      album?.back();
    },
    closeAlbum() {
      album?.closeAlbum();
    },
  };
  return api;
}

/**
 * Where a photo was taken, in words: at a place ("Near Angkor Wat"), on a
 * road ("On the valley road"), by or on a river, else on the mesa or hills
 * round him ("On the western cliffs"), else in the highlands.
 */
export function placeName(world: RoamWorld, at: Vector3, mode: RoamMode): string {
  let near: (typeof PLACES)[number] | null = null;
  let nd = Infinity;
  for (const p of PLACES) {
    // (inside the pad, or within 60 m of its beacon)
    const dx = Math.max(0, Math.abs(at.x - p.x) - p.pad[0]);
    const dz = Math.max(0, Math.abs(at.z - p.z) - p.pad[1]);
    const d = Math.min(Math.hypot(dx, dz), Math.hypot(at.x - p.anchor[0], at.z - p.anchor[2]) - 20);
    if (d < nd) [near, nd] = [p, d];
  }
  if (near && nd <= 0) return near.id === 'rivergate' ? 'At the River Gate' : `At ${near.name}`;
  if (near && nd < 45) return near.id === 'rivergate' ? 'By the River Gate' : `Near ${near.name}`;
  const f = world.field;
  for (const r of f.rivers)
    for (const s of r.samples)
      if (Math.hypot(s.x - at.x, s.z - at.z) < s.w / 2 + (mode === 'boat' ? 4 : 8)) return `${mode === 'boat' ? 'On' : 'By'} the ${lower(r.name)}`;
  for (const p of f.paths) for (const s of p.samples) if (Math.hypot(s.x - at.x, s.z - at.z) < 6) return `On the ${p.name}`;
  // The highest mesa or hill he is on (their tiers overlap).
  let hill: string | null = null;
  let top = -Infinity;
  for (const p of PLATEAUS) {
    const u = (at.x - p.x) / p.rx;
    const v = (at.z - p.z) / p.rz;
    if (u * u + v * v < 1 && p.top > top) [hill, top] = [p.name, p.top];
  }
  if (hill) return hill === 'Phnom Kulen' ? 'On Phnom Kulen' : `On the ${lower(hill).replace(/ (low|mid) tier$| top$/, '')}`;
  return 'In the Angkor highlands';
}

/** "Summit river" → "summit river" (names keep their capitals: "Phnom Kulen"). */
const lower = (s: string) => (/^[A-Z][a-z]+ [A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
