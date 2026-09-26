import { Euler, MathUtils, Quaternion, Spherical, Vector3, type PerspectiveCamera } from 'three';
import type { AngkorExplorer, SelfieAim, SelfieGesture } from '../../character/AngkorExplorer';
import { SELFIE_CENTER, STICK_REACH, type HoldKind } from '../../character/Animator';
import type { ExpressionName } from '../../character/parts/face';
import { PHOTO_FOV, PhotoAlbum } from '../../game/Photos';
import { BODY_UNIT_M } from '../../world/scale';
import { PLACES, PLATEAUS } from '../layout';
import type { MapPart, RoamMode } from '../types';
import { lang, onLang, t, type WordKey } from '../ui/lang';
import { createJournal, type Journal } from './_book';
import { SPECIES_BY_KIND } from './_bookData';
import { attachBookUi, type AlbumTab, type BookUi } from './_bookUi';
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
/** On the selfie stick the view is the phone's own lens (the stick holds it far enough out), and a little wider. */
const STICK_BACK = 0.02;
const STICK_FOV = 70;
/** Modes he can take photos in: on foot, sitting in the boat (the paddle laid down), hanging under the hang glider (it flies straight on), standing in the hot air balloon's basket (it floats on). */
export const PHOTO_MODES: readonly RoamMode[] = ['walk', 'boat', 'hang', 'balloon'];
/** Near plane while the phone's view is up (m): his arm comes closer than the map camera's 0.5 m. */
const SELFIE_NEAR = 0.25;
/** On the stick the phone keeps this far (m, true size) above the ground and the water, and short of a wall. */
const LENS_CLEAR = 0.35;
const GESTURES: readonly SelfieGesture[] = ['peace', 'wave', 'thumbsUp', 'none'];
const GESTURE_NAME: Record<SelfieGesture, WordKey> = { peace: 'rPeace', wave: 'rWave', thumbsUp: 'rThumbsUp', none: 'rNoGesture' };
/** The faces' names (X; on the phone's screen too), and what the other hand holds. */
export const FACE_NAME: Record<ExpressionName, WordKey> = {
  neutral: 'rFaceNeutral',
  happy: 'rFaceHappy',
  determined: 'rFaceDetermined',
  surprised: 'rFaceSurprised',
  curious: 'rFaceCurious',
  focused: 'rFaceFocused',
};
const HELD_NAME: Record<Exclude<HoldKind, 'none'>, WordKey> = { lantern: 'rLantern', torch: 'rTorch', flashlight: 'rFlashlight' };

/**
 * The map's keys under the viewfinder and the selfie shutter (M is the
 * mini-map here), in the language in use (ui/lang.ts; in English in lower case).
 */
const kbd = (k: string) => `<kbd>${k}</kbd>`;
const low = (w: WordKey) => t(w).toLowerCase();
const takeKeys = () => `${kbd('Space')} / ${low('rClick')} ${low('rTake')}`;
const cameraHint = () => [takeKeys(), low('rDragLook'), low('rWheelZoom'), `${kbd('4')} / ${kbd('Esc')} ${low('rStow')}`, `${kbd('V')} ${low('rAlbum')}`].join(' · ');
const selfieHint = () =>
  [
    takeKeys(),
    low('rDragPhone'),
    `${low('rWheel')} ${low('rReach')}`,
    `${kbd('T')} ${low('rStick')}`,
    `${kbd('G')} ${low('rGesture')}`,
    `${kbd('X')} ${low('rFace')}`,
    `${kbd('5')} / ${kbd('Esc')} ${low('rStow')}`,
    `${kbd('V')} ${low('rAlbum')}`,
  ].join(' · ');

const _e = new Euler(0, 0, 0, 'YXZ');
const _q = new Quaternion();
const _v = new Vector3();
const _v2 = new Vector3();
const _back = new Vector3();
const _look = new Vector3();
const _from = new Spherical();
const _to = new Spherical();
const _head = new Vector3();
const _lq = new Quaternion();

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
  /** The selfie stick: on (the phone far out on a pole) or off (at arm's length). On by default. */
  stick: boolean;
  /** Checks (`sview=`): hold the view at this blend (0 = the follow camera: see him hold it; 1 = the lens), null as it goes. */
  hold: number | null;
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
  /** Esc in the album: one photo → all of them → closed (a book page → the book → closed). */
  albumBack(): void;
  closeAlbum(): void;
  /** The nature book and the temple passport (roam/_book.ts): the album's other sections. */
  readonly journal: Journal;
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
  /** The map's parts: what is in a photo, for the nature book (their `subjects`). */
  parts?: readonly MapPart[];
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
  let stick = true;
  const shot = { yaw: 0, pitch: 0, fov: PHOTO_FOV };
  const aim = new Vector3();
  /** The view's camera as last placed (a photo is taken through it). */
  let lensCam: PerspectiveCamera | null = null;

  // The nature book and the temple passport (their pages and stamps, kept in this browser).
  const journal = createJournal({
    world: d.world,
    parts: d.parts ?? [],
    toast: (text) => d.toast(text),
    name: (w) => ('kind' in w ? (SPECIES_BY_KIND.get(w.kind)?.name[lang()] ?? w.kind) : w.stamp.name[lang()]),
    words: {
      page: (names) => t('bkNew', { name: names }),
      stamp: (name) => t('bkStamped', { name }),
      lotus: (name) => t('bkLotus', { name }),
    },
  });
  /** The album's tabs (Photos · Nature book · Passport), made with the album. */
  let bookUi: BookUi | null = null;

  /** The album, made when first needed (its viewfinder, flash and print too). */
  function getAlbum(): PhotoAlbum {
    if (album) return album;
    album = new PhotoAlbum();
    // The selfie frame's shutter button (the view is ready: take it).
    album.onShutter = () => {
      if (kind && view > 0.95) snap = true;
    };
    showCameraHint();
    const panels = document.querySelectorAll<HTMLElement>('.photo-album .photo-panel');
    const panel = panels[panels.length - 1];
    if (panel) {
      bookUi = attachBookUi(panel, journal, () => album?.closeAlbum());
      // (the print in the corner opens its photo: the photos' section)
      document.querySelector('.photo-print')?.addEventListener('click', () => bookUi?.setTab('photos'));
    }
    return album;
  }

  /** The viewfinder's keys (the album made; again when the language changes). */
  function showCameraHint(): void {
    const hint = album && document.querySelector('.photo-finder .hint');
    if (hint) hint.innerHTML = cameraHint();
  }
  onLang(showCameraHint);

  /** The camera at his eye, looking along the shot (world). In the boat or the air, from his head wherever it is. */
  function eye(out: Vector3): Vector3 {
    const s = body.scale;
    if (d.mode() !== 'walk') {
      const head = explorer.rig.joints.head;
      head.updateWorldMatrix(true, false);
      head.localToWorld(out.copy(SELFIE_CENTER));
      const c = Math.cos(shot.pitch) * AHEAD * s;
      return out.add(_v2.set(Math.sin(shot.yaw) * c, Math.sin(shot.pitch) * AHEAD * s, Math.cos(shot.yaw) * c));
    }
    return out.set(Math.sin(shot.yaw) * AHEAD * s, EYE * s, Math.cos(shot.yaw) * AHEAD * s).add(body.pos);
  }

  /**
   * On the stick the phone goes far out: keep it above the ground and the
   * water (the lowest the aim may go there) and short of a wall between it
   * and his head (the pole slides in), from where it is now.
   */
  function keepLensClear(a: SelfieAim): void {
    if (!explorer.selfieStick || !explorer.phoneLens(_v, _lq)) return;
    const s = body.scale;
    const w = d.world;
    explorer.rig.joints.head.localToWorld(_head.copy(SELFIE_CENTER));
    const unit = BODY_UNIT_M * s;
    const far = (STICK_REACH[0] + (STICK_REACH[1] - STICK_REACH[0]) * a.reach) * unit;
    const floor = Math.max(w.groundAt(_v.x, _v.z), w.waterAt(_v.x, _v.z) ?? -Infinity) + LENS_CLEAR * s;
    a.pitch = Math.max(a.pitch, Math.asin(MathUtils.clamp((floor - _head.y) / far, -1, 1)));
    if (!w.clearance) return;
    const len = _head.distanceTo(_v);
    const free = w.clearance(_head.x, _head.y, _head.z, _v.x, _v.y, _v.z);
    if (free < 1) a.reach = MathUtils.clamp((free * len - LENS_CLEAR * s - STICK_REACH[0] * unit) / ((STICK_REACH[1] - STICK_REACH[0]) * unit), 0, a.reach);
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
    get stick() {
      return stick;
    },
    set stick(on) {
      stick = on;
      explorer.selfieStick = on;
      // (at arm's length the phone must come back round within the arm's reach: the explorer clamps it)
    },
    hold: null,
    raise(k, ctx) {
      if (k === kind) return true;
      if (k === 'camera' && !explorer.currentOutfit.camera) {
        d.toast(t('rNoCamera'));
        return false;
      }
      const mode = d.mode();
      if (!PHOTO_MODES.includes(mode) || (mode === 'walk' && !body.grounded)) return false;
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
        // (the phone to his right, a little above the eyes; he smiles by himself.
        // Hanging face down under the glider, "above the eyes" is ahead of him:
        // the phone goes out in front, looking back at him in the control
        // frame under the wing, the land beside him; a little to his right
        // on the stick (the down tube passes by his cheek, not over his face),
        // straight ahead at arm's length (level: the phone's up is his chest's).)
        explorer.selfieStick = stick;
        const hang = mode === 'hang';
        const aim = hang ? (stick ? { yaw: -0.3, pitch: 1.25, reach: 0.8 } : { yaw: 0.2, pitch: 0.75, reach: 1 }) : { yaw: -0.5, pitch: stick ? 0.3 : 0.15, reach: stick ? 0.7 : 1 };
        Object.assign(explorer.selfieAim, aim);
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
        // (on foot he turns to the shot; in the boat or the air he looks round from where he is,
        // and so on foot when something holds his body: seated on the rope swing, _swingRide.ts)
        if (d.mode() === 'walk' && !explorer.animator.posture) body.yaw += angleDiff(shot.yaw, body.yaw) * Math.min(1, 12 * dt);
        // Head and hands follow the shot.
        explorer.aimPoint = aim.set(Math.sin(shot.yaw) * Math.cos(shot.pitch), Math.sin(shot.pitch), Math.cos(shot.yaw) * Math.cos(shot.pitch)).multiplyScalar(30).add(eye(_v));
      } else if (kind === 'selfie') {
        // Drag moves the phone round his head (the way the drag goes on the
        // screen: right = to his left), the wheel nearer or further. (The
        // explorer keeps it where his arm reaches.)
        const a = explorer.selfieAim;
        a.yaw -= input.lookYaw;
        a.pitch -= input.lookPitch;
        a.reach = MathUtils.clamp(a.reach + input.zoom * (stick ? 0.08 : 0.12), 0, 1);
        keepLensClear(a);
      }
      if (kind && view > 0.95 && (input.click || input.jump)) snap = true;
      view = MathUtils.clamp(view + (kind ? dt : -dt) / (last === 'selfie' ? RAISE_SELFIE : RAISE), 0, 1);
      if (kind && api.hold !== null) view = MathUtils.clamp(api.hold, 0, 1);
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
      return t(GESTURE_NAME[gesture]);
    },
    place(camera, pivot) {
      lensCam = camera;
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
          // Back from the phone along its view (further with more reach), short of a wall behind it;
          // on the stick, the lens itself.
          const reach = explorer.selfieAim.reach;
          const onStick = explorer.selfieStick;
          const back = (onStick ? STICK_BACK : SELFIE_BACK[0] + (SELFIE_BACK[1] - SELFIE_BACK[0]) * reach) * body.scale;
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
          fov += ((onStick ? STICK_FOV : SELFIE_FOV + (1 - reach) * 10) - fov) * k;
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
        const held = explorer.currentOutfit.held;
        const hand = held === 'none' ? t(GESTURE_NAME[explorer.selfieGesture]) : t('rHolding', { name: low(HELD_NAME[held]) });
        const info = phone ? [hand, t(FACE_NAME[explorer.currentExpression]), ...(explorer.selfieStick ? [t('rStick')] : [])].join(' · ') : '';
        // (new words, a new language: the keys line again too)
        if (phone !== selfieFrame || info !== selfieInfo) album.setSelfieFrame(phone, info, selfieHint());
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
      // (what is in it, for the nature book: before the album's flash and print)
      // (in a selfie he stands in front of what is behind him)
      const s = body.scale;
      if (lensCam) journal.photographed(lensCam, d.canvas, last === 'selfie' ? { kind: 'visitor', x: body.pos.x, y: body.pos.y + 0.9 * s, z: body.pos.z, r: 0.75 * s } : null);
      album.capture(d.canvas, placeName(d.world, body.pos, d.mode()));
    },
    openAlbum() {
      getAlbum().openAlbum();
      // (the section last looked at, up to date)
      bookUi?.setTab(bookUi.tab);
    },
    albumBack() {
      if (bookUi?.back()) return;
      album?.back();
    },
    closeAlbum() {
      album?.closeAlbum();
    },
    journal,
  };
  // Checks: `album=photos|book|passport` opens the album there (`album=book:<kind>`: that page).
  const at = new URLSearchParams(location.search).get('album');
  if (at) {
    const [tab, page] = at.split(':');
    api.openAlbum();
    if (['photos', 'book', 'passport'].includes(tab)) (bookUi as BookUi | null)?.setTab(tab as AlbumTab, page as never);
  }
  return api;
}

/**
 * Where a photo was taken, in words: at a place ("Near Angkor Wat"), on a
 * road ("On the valley road"), by or on a river, else on the mesa or hills
 * round him ("On the western cliffs"), else in the highlands.
 */
export function placeName(world: RoamWorld, at: Vector3, mode: RoamMode): string {
  if (mode !== 'hang' && mode !== 'balloon') return groundName(world, at, mode);
  // Flying: over what is under him ("Above Angkor Wat", "Over the summit river", "Flying near Bayon").
  const n = groundName(world, at, 'walk');
  return n.replace(/^(At|On) /, (_, w) => (w === 'At' ? 'Above ' : 'Over ')).replace(/^By /, 'Over ').replace(/^Near /, 'Flying near ').replace(/^In the /, 'Over the ');
}

function groundName(world: RoamWorld, at: Vector3, mode: RoamMode): string {
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
