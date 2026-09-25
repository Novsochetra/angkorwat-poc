import { Group, PerspectiveCamera, PointLight, Quaternion, Raycaster, SpotLight, Vector2, Vector3 } from 'three';
import { OUTFITS, type AngkorExplorer, type OutfitName, type SelfieGesture } from '../../character/AngkorExplorer';
import type { HoldKind } from '../../character/Animator';
import { ACTIONS, type ActionName } from '../../character/clips';
import { EXPRESSIONS, type ExpressionName } from '../../character/parts/face';
import type { MapFrame, RoamMode } from '../types';
import { onLang, t, type WordKey } from '../ui/lang';
import { steppedRing, steppedShape } from '../ui/shape';
import { angleDiff } from './followCam';
import type { RoamControls } from './input';
import { createRoamPhoto, FACE_NAME, PHOTO_MODES, type PhotoKind, type RoamPhoto } from './photo';
import type { FollowCam, RoamBody, RoamCtx, RoamHud, RoamWorld } from './types';

/** What the tool bar holds: three lights for the left hand, the camera and the selfie phone. */
export type ToolName = 'lantern' | 'torch' | 'flashlight' | 'camera' | 'selfie';
const TOOLS: readonly ToolName[] = ['lantern', 'torch', 'flashlight', 'camera', 'selfie'];
/** The tools' names (words: ui/lang.ts). */
const TOOL_NAME: Record<ToolName, WordKey> = { lantern: 'rLantern', torch: 'rTorch', flashlight: 'rFlashlight', camera: 'rCamera', selfie: 'rSelfie' };

/** Looks the outfit key (G) steps through (the hat and what he holds stay as they are). */
const LOOKS: readonly [OutfitName, WordKey][] = [
  ['explorerGear', 'rLookGear'],
  ['default', 'rLookPack'],
  ['withoutScarf', 'rLookNoScarf'],
  ['templeOutfit', 'rLookTemple'],
];

/** Light of the lantern and the torch (candela at true size: a little over the game's, for the open map), and how far it reaches (m). */
const LANTERN_CD = 0.8;
const TORCH_CD = 1.2;
const GLOW_RANGE = 16;
/** Flashlight: the game's beam (candela, reach, cone). */
const FLASH_CD = 18;
const FLASH_RANGE = 45;
const FLASH_ANGLE = 0.36;
/** Longest visible beam (m, true size) and how far the mouse aim looks (m). */
const BEAM_MAX = 9;
const AIM_RANGE = 220;
/** How far from his head the phone's face light is as bright as it is in his hand (m, true size). */
const PHONE_FILL_AT = 0.55;
/** After dark (night over this) he takes a lantern, until the player picks a tool. */
const DUSK = 0.55;

const _o = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();
const _ndc = new Vector2();
const _ray = new Raycaster();

export interface RoamTools {
  /** The two lights (in the scene from the start, so the light count never changes). */
  readonly object: Group;
  /** The camera and the selfie phone. */
  readonly photo: RoamPhoto;
  /**
   * Before the mode's step: the tool and emote keys, the album, and photo
   * mode's input (it takes what it uses: no walking with the camera up,
   * Esc puts it away instead of leaving).
   */
  input(ctx: RoamCtx, mode: RoamMode, dt: number): void;
  /** After the mode's step: what he holds (a lantern after dark by default), the flashlight's aim. */
  after(ctx: RoamCtx, mode: RoamMode, dt: number): void;
  /** Every frame in every mode, after the follow camera: the view into the lens, the lights onto the props. */
  frame(f: MapFrame): void;
  /** The roaming mode changed: the lights are for walking; the camera and the phone work on foot, in the boat and on the hang glider (put away at each change). */
  setMode(next: RoamMode, prev: RoamMode): void;
  /** Right after a frame is drawn (the photo). */
  afterRender(): void;
  /**
   * URL (checks): `tool=…` start with a tool out · `act=…` play an action ·
   * `beam=mouse` + `mouse=x,y` (0‥1 of the view) · `look=<outfit>` · `hat=0|1` ·
   * `face=<expression>` · `pview=yaw,pitch,fov` the camera's shot · `gesture=peace|wave|thumbsUp|none`
   * and `saim=yaw,pitch,reach` the selfie (degrees round his head, 0‥1) · `stick=0|1` the selfie stick ·
   * `sview=0‥1` hold the view there (0: the follow camera, to see him hold the camera or the phone) · `keys=1` the key list.
   */
  fromUrl(params: URLSearchParams, ctx: RoamCtx): void;
  /** URL params that put the tools back as they are (bug reports). */
  report(): Record<string, string>;
}

export interface ToolDeps {
  explorer: AngkorExplorer;
  body: RoamBody;
  cam: FollowCam;
  world: RoamWorld;
  hud: RoamHud;
  controls: RoamControls;
  canvas: HTMLCanvasElement;
}

/**
 * The explorer's tools while roaming, as in the game and the viewer: a
 * lantern, a torch or a flashlight in his left hand, his camera and his
 * selfie phone (photos into the game's album), his hat, outfits, faces and
 * emotes. A small bar at the bottom shows them while he walks (1–5; click
 * or tap to use, again to put away).
 *
 * Lights: three.js recompiles every material when the number of lights in
 * the scene changes (a freeze on this big map), so the explorer's props
 * have no lights of their own; this module keeps one warm point light for
 * the lantern and the torch and one spot light for the flashlight (no
 * shadow: that would draw the whole map again), always in the scene, dark
 * while unused, moved onto the prop every frame. The ledge explorer's
 * lantern in the overview uses the same point light.
 */
export function createRoamTools(d: ToolDeps): RoamTools {
  const { explorer, body, cam, hud } = d;
  const object = new Group();
  object.name = 'roam:tools';
  const glow = new PointLight(0xffb347, 0, GLOW_RANGE, 2);
  glow.name = 'explorer lantern';
  const flash = new SpotLight(0xfff1dc, 0, FLASH_RANGE, FLASH_ANGLE, 0.5, 2);
  flash.name = 'explorer flashlight';
  glow.castShadow = flash.castShadow = false;
  object.add(glow, flash, flash.target);

  let mode: RoamMode = 'overview';
  /** What the player picked for his left hand (null: not yet — a lantern after dark). */
  let chosen: HoldKind | null = null;
  let beamMouse = false;
  /** A mouse for headless checks (`mouse=x,y`), else the real one. */
  let fakePointer: { x: number; y: number } | null = null;
  let look = LOOKS.findIndex(([n]) => sameLook(explorer, n));
  if (look < 0) look = 0;
  let face = EXPRESSIONS.indexOf(explorer.currentExpression);
  const aim = new Vector3();
  let night = 0;
  /** The last step's context (for the bar's clicks), and the touch shutter shown. */
  let lastCtx: RoamCtx | null = null;
  let shutter: PhotoKind | null = null;

  const photo = createRoamPhoto({
    explorer,
    body,
    world: d.world,
    canvas: d.canvas,
    mode: () => mode,
    toast: (text) => hud.toast(text),
    onFinder: (on) => document.body.classList.toggle('roam-finder', on),
  });
  const bar = createToolBar(hud.layer ?? document.body, {
    onTool: (tool) => useTool(tool, lastCtx),
    onAlbum: () => photo.openAlbum(),
    held: () => explorer.currentOutfit.held,
    up: () => photo.kind,
    camera: () => explorer.currentOutfit.camera,
  });

  // ── Actions ──────────────────────────────────────────────────────────────

  /** What his left hand should hold now. */
  function wantHeld(): HoldKind {
    if (mode !== 'walk') return 'none';
    return chosen ?? (night > DUSK ? 'lantern' : 'none');
  }

  function setHeld(h: HoldKind): void {
    if (explorer.currentOutfit.held === h) return;
    explorer.setOutfit({ held: h });
    photo.refreshBody();
    bar.update();
  }

  /** A tool key or a click on the bar. */
  function useTool(tool: ToolName, ctx: RoamCtx | null): void {
    const device = tool === 'camera' || tool === 'selfie';
    if (mode !== 'walk' && !(device && PHOTO_MODES.includes(mode))) {
      if (mode === 'boat') hud.toast(t('rHandsPaddle'));
      else if (mode === 'hang') hud.toast(t('rHandsBar'));
      return;
    }
    if (device) {
      if (photo.kind === tool) photo.lower();
      else if (ctx) photo.raise(tool, ctx);
      bar.update();
      return;
    }
    const on = explorer.currentOutfit.held !== tool;
    chosen = on ? tool : 'none';
    setHeld(chosen);
    hud.toast(on ? (tool === 'flashlight' ? t('rBeamOn', { beam: beamLabel() }) : t(TOOL_NAME[tool])) : t('rPutAway', { name: t(TOOL_NAME[tool]) }));
    bar.update();
  }

  const beamLabel = () => t(beamMouse ? 'rBeamMouse' : 'rBeamAhead');

  function play(a: ActionName): void {
    // (the looping ones stop on a second press)
    if (ACTIONS[a].loop && explorer.currentAction === a) explorer.stop(a);
    else explorer.play(a);
  }

  function nextLook(): void {
    look = (look + 1) % LOOKS.length;
    const [name, label] = LOOKS[look];
    const o = explorer.currentOutfit;
    explorer.setOutfit({ ...OUTFITS[name], hat: o.hat, held: o.held });
    photo.refreshBody();
    hud.toast(t('rOutfitIs', { name: t(label) }));
    // (no camera in temple clothes)
    if (photo.kind === 'camera' && !explorer.currentOutfit.camera) photo.lower();
    bar.update();
  }

  function setFace(i: number): void {
    face = (i + EXPRESSIONS.length) % EXPRESSIONS.length;
    explorer.setExpression(EXPRESSIONS[face]);
  }

  // ── Flashlight aim ───────────────────────────────────────────────────────

  /** Where the mouse points on the map (ground, walls, water), or null (sky, too far). */
  function mouseHit(camera: PerspectiveCamera, px: number, py: number, out: Vector3): Vector3 | null {
    const r = d.canvas.getBoundingClientRect();
    _ndc.set(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const { origin: o, direction: dir } = _ray.ray;
    const w = d.world;
    const under = (t: number) => {
      const x = o.x + dir.x * t;
      const z = o.z + dir.z * t;
      return o.y + dir.y * t - Math.max(w.groundAt(x, z), w.waterAt(x, z) ?? -Infinity);
    };
    // March out (longer steps further off), then close in on the surface.
    let a = 0.5;
    let t = a;
    while (t < AIM_RANGE) {
      if (under(t) <= 0) {
        let b = t;
        for (let i = 0; i < 6; i++) {
          const m = (a + b) / 2;
          if (under(m) <= 0) b = m;
          else a = m;
        }
        return out.copy(o).addScaledVector(dir, b);
      }
      a = t;
      t += Math.max(0.6, t * 0.03);
    }
    return null;
  }

  /** How far the beam goes from the lens before it hits something (m). */
  function beamReach(): number {
    if (!explorer.flashlightRay(_o, _d)) return BEAM_MAX;
    const far = BEAM_MAX * body.scale;
    const w = d.world;
    const free = w.clearance ? w.clearance(_o.x, _o.y, _o.z, _o.x + _d.x * far, _o.y + _d.y * far, _o.z + _d.z * far) : 1;
    return (free * far) / body.scale;
  }

  // ── Lights on the props ──────────────────────────────────────────────────

  /** Where the prop's light is (lantern glass, torch flame, flashlight lens), world. */
  function lights(t: number): void {
    const held = explorer.currentOutfit.held;
    const s = explorer.object.scale.y;
    const boost = 1 + night * 5;
    if (photo.kind === 'selfie' && explorer.phoneLens(glow.position, _q)) {
      // A soft fill on his face from the phone (the sun is often behind him), warm with a flame in hand;
      // as bright on his face from the end of the selfie stick as from his hand.
      glow.color.setHex(held === 'lantern' || held === 'torch' ? 0xffc78a : 0xffe6cc);
      const far = glow.position.distanceTo(explorer.rig.joints.head.getWorldPosition(_o)) / (PHONE_FILL_AT * s);
      glow.intensity = (0.06 + 0.1 * night) * s * s * photo.view * Math.max(1, far * far);
      glow.distance = 3 * s * Math.max(1, far);
    } else if (held === 'lantern' || held === 'torch') {
      explorer.propGlowPoint(glow.position);
      glow.color.setHex(held === 'torch' ? 0xff9a3c : 0xffb347);
      // A gentle flicker (a flame: livelier in the torch). The light grows with him (it reaches as far on his size).
      const f = held === 'torch' ? 0.84 + Math.sin(t * 17.3) * 0.08 + Math.sin(t * 29.7 + 2) * 0.06 + Math.sin(t * 7.1) * 0.03 : 0.9 + Math.sin(t * 11.3) * 0.04 + Math.sin(t * 23.9 + 1) * 0.03;
      glow.intensity = (held === 'torch' ? TORCH_CD : LANTERN_CD) * s * s * boost * f;
      glow.distance = GLOW_RANGE * (held === 'torch' ? 1.2 : 1) * (s / 1.4);
    } else glow.intensity = 0;
    if (held === 'flashlight' && explorer.flashlightRay(_o, _d)) {
      flash.position.copy(_o);
      flash.target.position.copy(_o).addScaledVector(_d, 10);
      flash.target.updateMatrixWorld();
      flash.intensity = FLASH_CD * s * s * (1 + (boost - 1) * 0.5);
    } else flash.intensity = 0;
  }

  // ── The API ──────────────────────────────────────────────────────────────

  const api: RoamTools = {
    object,
    photo,
    input(ctx, m, dt) {
      lastCtx = ctx;
      const input = ctx.input;
      const taps = input.taps;
      const tap = (...codes: string[]) => !!taps && codes.some((c) => taps.has(c));

      // The album open: roaming waits; Esc goes back through it, V closes it.
      if (photo.albumOpen) {
        if (input.exit) photo.albumBack();
        else if (tap('KeyV')) photo.closeAlbum();
        stillInput(ctx);
        input.exit = false;
        return;
      }
      if (tap('Slash')) bar.toggleKeys();
      if (input.exit && bar.keysOpen) {
        bar.toggleKeys(false);
        input.exit = false;
      }
      if (tap('KeyV')) {
        photo.openAlbum();
        stillInput(ctx);
        return;
      }

      // Tools (on foot).
      if (tap('Digit1', 'Numpad1')) useTool('lantern', ctx);
      if (tap('Digit2', 'Numpad2')) useTool('torch', ctx);
      if (tap('Digit3', 'Numpad3')) useTool('flashlight', ctx);
      if (tap('Digit4', 'Numpad4', 'KeyZ')) useTool('camera', ctx);
      if (tap('Digit5', 'Numpad5', 'KeyY')) useTool('selfie', ctx);
      if (tap('KeyT')) {
        photo.stick = !photo.stick;
        hud.toast(t(photo.stick ? 'rStickOn' : 'rStickOff'));
      }
      if (tap('KeyO') && m === 'walk') {
        if (explorer.currentOutfit.held === 'flashlight') beamMouse = !beamMouse;
        else {
          chosen = 'flashlight';
          setHeld('flashlight');
        }
        hud.toast(t('rBeam', { beam: beamLabel() }));
        bar.update();
      }
      // His look: in any roaming mode.
      if (tap('KeyH')) {
        explorer.setOutfit({ hat: !explorer.currentOutfit.hat });
        photo.refreshBody();
        hud.toast(t(explorer.currentOutfit.hat ? 'rHatOn' : 'rHatOff'));
      }
      if (tap('KeyG')) {
        if (photo.kind === 'selfie') hud.toast(t('rGestureIs', { name: photo.nextGesture() }));
        else nextLook();
      }
      if (tap('KeyX')) {
        // (from the face he shows: the selfie makes him smile)
        setFace(EXPRESSIONS.indexOf(explorer.currentExpression) + 1);
        hud.toast(t('rFaceIs', { name: t(FACE_NAME[EXPRESSIONS[face]]) }));
      }

      if (photo.kind) {
        // Esc puts the camera away (not back to the map); no walking, jumping or entering
        // (in the boat it drifts, the hang glider flies on straight).
        if (input.exit || !PHOTO_MODES.includes(m)) {
          photo.lower();
          bar.update();
          input.exit = false;
        }
        photo.step(ctx, dt);
        stillInput(ctx);
        return;
      }
      photo.step(ctx, dt);

      // Emotes (on foot, hands free of the camera).
      if (m === 'walk') {
        if (tap('KeyF')) play('wave');
        if (tap('KeyC')) play('cheer');
        if (tap('KeyU')) play('lookUp');
        if (tap('KeyP')) play('peek');
        // A whole-body action holds him still; pushing the stick ends the looping one (peek).
        if (explorer.busy) {
          const a = explorer.currentAction;
          if (a && ACTIONS[a].loop && Math.hypot(input.move.x, input.move.y) > 0.3) explorer.stop(a);
          else {
            input.move.x = input.move.y = 0;
            input.jump = false;
          }
        }
      }
    },
    after(ctx, m, dt) {
      night = ctx.night;
      if (m === 'walk') setHeld(wantHeld());
      // Flashlight: straight ahead, or at what the mouse points to.
      const held = explorer.currentOutfit.held === 'flashlight';
      if (!photo.kind) {
        const pointer = fakePointer ?? ctx.input.pointer ?? null;
        const hit = held && beamMouse && pointer && m === 'walk' ? mouseHit(cam.camera, pointer.x, pointer.y, aim) : null;
        explorer.aimPoint = hit;
        // Standing still: turn once the aim is past what his arm reaches.
        if (hit && Math.hypot(body.vel.x, body.vel.z) < 0.3) {
          const want = Math.atan2(hit.x - body.pos.x, hit.z - body.pos.z);
          const dYaw = angleDiff(want, body.yaw);
          if (Math.abs(dYaw) > 0.9) body.yaw += (dYaw - Math.sign(dYaw) * 0.3) * Math.min(1, 6 * dt);
        }
      }
      if (held) explorer.beamReach = beamReach();
      explorer.propLightBoost = 1 + ctx.night * 5;
    },
    frame(f) {
      night = f.night;
      if (mode !== 'overview' || photo.view > 0) photo.place(cam.camera, cam.focus);
      lights(f.t);
      // Photo mode: the touch shutter and put-away instead of the stick, no roaming interface.
      const up = photo.kind;
      if (up !== shutter) {
        d.controls.setShutter(up);
        document.body.classList.toggle('roam-photo', !!up);
        bar.update();
      }
      shutter = up;
    },
    setMode(next, prev) {
      mode = next;
      // (a new mode, a new pose: the camera or the phone goes away)
      if (next !== prev) photo.lower();
      if (next !== 'walk') bar.toggleKeys(false);
      // (in the overview the ledge drives him: a lantern after dark)
      if (next === 'overview') setHeld('none');
      else setHeld(wantHeld());
      if (prev === 'overview') explorer.aimPoint = null;
      bar.update();
    },
    afterRender() {
      photo.afterRender();
    },
    fromUrl(params, ctx) {
      lastCtx = ctx;
      night = ctx.night;
      beamMouse = params.get('beam') === 'mouse';
      const mouse = params.get('mouse')?.split(',').map(Number);
      if (mouse?.length === 2) fakePointer = { x: mouse[0] * innerWidth, y: mouse[1] * innerHeight };
      if (params.has('stick')) photo.stick = params.get('stick') !== '0';
      if (params.has('sview')) photo.hold = Number(params.get('sview')) || 0;
      const tool = params.get('tool') as ToolName | null;
      if (tool && TOOLS.includes(tool) && (mode === 'walk' || ((tool === 'camera' || tool === 'selfie') && PHOTO_MODES.includes(mode)))) {
        if (tool === 'camera' || tool === 'selfie') photo.raise(tool, ctx);
        else setHeld((chosen = tool));
      }
      const a = params.get('act') as ActionName | null;
      if (a && a in ACTIONS && a !== 'photo' && a !== 'selfie') explorer.play(a);
      const lk = LOOKS.findIndex(([n]) => n === params.get('look'));
      if (lk >= 0) {
        look = lk;
        explorer.setOutfit({ ...OUTFITS[LOOKS[lk][0]], hat: explorer.currentOutfit.hat, held: explorer.currentOutfit.held });
      }
      if (params.has('hat')) explorer.setOutfit({ hat: params.get('hat') === '1' });
      const fc = EXPRESSIONS.indexOf(params.get('face') as ExpressionName);
      if (fc >= 0) setFace(fc);
      if (params.get('keys') === '1') bar.toggleKeys(true);
      // The selfie: the hand's gesture, where the phone is (degrees round his head, reach 0‥1).
      const g = params.get('gesture') as SelfieGesture | null;
      if (g && ['peace', 'wave', 'thumbsUp', 'none'].includes(g)) photo.setGesture(g);
      const sa = params.get('saim')?.split(',').map(Number);
      if (sa) Object.assign(explorer.selfieAim, { yaw: ((sa[0] ?? 0) * Math.PI) / 180, pitch: ((sa[1] ?? 0) * Math.PI) / 180, reach: sa[2] ?? 1 });
      const pv = params.get('pview')?.split(',').map(Number);
      if (pv && photo.kind === 'camera') {
        photo.shot.yaw = ((pv[0] ?? 0) * Math.PI) / 180;
        photo.shot.pitch = ((pv[1] ?? 0) * Math.PI) / 180;
        if (pv[2]) photo.shot.fov = pv[2];
        // (on foot he turns to it; the boat and the glider keep their heading)
        if (mode === 'walk') body.yaw = photo.shot.yaw;
      }
      bar.update();
    },
    report() {
      const out: Record<string, string> = {};
      const o = explorer.currentOutfit;
      const tool = photo.kind ?? (o.held !== 'none' ? o.held : null);
      if (tool) out.tool = tool;
      if (o.held === 'flashlight' && beamMouse) out.beam = 'mouse';
      const a = explorer.currentAction;
      if (a && a !== 'photo' && a !== 'selfie') out.act = a;
      if (look !== 0) out.look = LOOKS[look][0];
      out.hat = o.hat ? '1' : '0';
      if (explorer.currentExpression !== 'neutral') out.face = explorer.currentExpression;
      const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0);
      if (photo.kind === 'camera') out.pview = `${deg(photo.shot.yaw)},${deg(photo.shot.pitch)},${photo.shot.fov.toFixed(0)}`;
      if (photo.kind === 'selfie') {
        const a = explorer.selfieAim;
        out.gesture = explorer.selfieGesture;
        out.saim = `${deg(a.yaw)},${deg(a.pitch)},${a.reach.toFixed(2)}`;
        out.stick = photo.stick ? '1' : '0';
      }
      return out;
    },
  };

  /** No walking, jumping, entering or turning the follow camera (photo mode, the album). */
  function stillInput(ctx: RoamCtx): void {
    const i = ctx.input;
    i.move.x = i.move.y = 0;
    i.run = i.jump = i.jumpHeld = i.use = false;
    i.lookYaw = i.lookPitch = i.zoom = 0;
    i.click = false;
  }
  return api;
}

/** The explorer wears this look now (the hat and what he holds aside). */
function sameLook(ex: AngkorExplorer, name: OutfitName): boolean {
  const o = ex.currentOutfit;
  const l = OUTFITS[name];
  return o.scarf === l.scarf && o.camera === l.camera && o.pack === l.pack && o.legs === l.legs;
}

// ── The tool bar ───────────────────────────────────────────────────────────

interface ToolBar {
  /** Light the slots of what is out now. */
  update(): void;
  toggleKeys(on?: boolean): void;
  readonly keysOpen: boolean;
}

/**
 * A small bar at the bottom centre while he walks: 1 lantern, 2 torch,
 * 3 flashlight, 4 camera, 5 selfie phone, then the album (V) and the key
 * list (?). Pixel-art icons with their key; the one in use is lit gold.
 * On touch it stands at the right edge, above the Jump button.
 */
function createToolBar(
  layer: HTMLElement,
  h: { onTool(t: ToolName): void; onAlbum(): void; held(): HoldKind; up(): ToolName | null; camera(): boolean },
): ToolBar {
  injectStyle();
  const wrap = document.createElement('div');
  wrap.className = 'rtb-wrap';
  const slot = (tool: ToolName, key: string) =>
    `<button type="button" class="rtb-slot" data-tool="${tool}" data-key="${key}" aria-pressed="false"><span class="rtb-bg"></span>${ICONS[tool]}<kbd>${key}</kbd></button>`;
  wrap.innerHTML = `
    <div class="rtb mu-frame mu-sm" role="toolbar">
      <span class="mu-bg"></span>
      ${slot('lantern', '1')}${slot('torch', '2')}${slot('flashlight', '3')}${slot('camera', '4')}${slot('selfie', '5')}
      <span class="rtb-sep" aria-hidden="true"></span>
      <button type="button" class="rtb-slot rtb-album"><span class="rtb-bg"></span>${ICONS.album}<kbd>V</kbd></button>
      <button type="button" class="rtb-slot rtb-more" aria-expanded="false"><span class="rtb-bg"></span><span class="rtb-q">?</span></button>
    </div>
    <div class="rtb-keys mu-frame mu-sm" role="dialog"></div>`;
  layer.append(wrap);
  const keysEl = wrap.querySelector<HTMLElement>('.rtb-keys')!;
  const more = wrap.querySelector<HTMLButtonElement>('.rtb-more')!;
  const slots = [...wrap.querySelectorAll<HTMLButtonElement>('.rtb-slot[data-tool]')];
  const albumBtn = wrap.querySelector<HTMLButtonElement>('.rtb-album')!;
  /** The names on the buttons (shown on hover) and the key list, in the language in use (ui/lang.ts). */
  const fillWords = () => {
    wrap.querySelector('.rtb')!.setAttribute('aria-label', t('rToolsAria'));
    for (const b of slots) b.title = `${t(TOOL_NAME[b.dataset.tool as ToolName])} (${b.dataset.key})`;
    albumBtn.title = `${t('rAlbum')} (V)`;
    more.title = `${t('rAllKeys')} (?)`;
    keysEl.setAttribute('aria-label', t('rKeys'));
    keysEl.innerHTML = `<span class="mu-bg"></span>${keyList()}`;
  };
  fillWords();
  onLang(fillWords);
  // (let go of the focus: Space is the jump and the shutter)
  for (const b of slots)
    b.addEventListener('click', () => {
      b.blur();
      h.onTool(b.dataset.tool as ToolName);
    });
  albumBtn.addEventListener('click', () => {
    albumBtn.blur();
    h.onAlbum();
  });
  let open = false;
  const bar: ToolBar = {
    get keysOpen() {
      return open;
    },
    update() {
      const held = h.held();
      const up = h.up();
      for (const b of slots) {
        const tool = b.dataset.tool as ToolName;
        const on = tool === held || tool === up;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      }
      const cam = slots.find((b) => b.dataset.tool === 'camera');
      cam?.classList.toggle('is-off', !h.camera());
    },
    toggleKeys(on = !open) {
      open = on;
      keysEl.classList.toggle('is-on', on);
      more.classList.toggle('is-on', on);
      more.setAttribute('aria-expanded', String(on));
    },
  };
  more.addEventListener('click', () => {
    more.blur();
    bar.toggleKeys();
  });
  return bar;
}

const k = (s: string) => `<kbd>${s}</kbd>`;
/** A mouse action, as a key: drag, wheel, click. */
const mouse = (w: WordKey) => `<i>${t(w)}</i>`;
/** Keys and what they do (in English in lower case, as a list). */
const row = (keys: string, what: WordKey) => `<span class="rtb-k">${keys}</span><span>${t(what).toLowerCase()}</span>`;
/** All the keys (?), in the language in use. */
const keyList = () => `
  <div class="rtb-col"><b>${t('rTools')}</b>
    ${row(k('1'), 'rLantern')}${row(k('2'), 'rTorch')}${row(k('3'), 'rFlashlight')}${row(k('O'), 'rBeamKeys')}
    ${row(k('4') + k('Z'), 'rCamera')}${row(k('5') + k('Y'), 'rSelfie')}${row(k('V'), 'rAlbum')}</div>
  <div class="rtb-col"><b>${t('rExplorer')}</b>
    ${row(k('F'), 'rWave')}${row(k('C'), 'rCheer')}${row(k('U'), 'rLookUp')}${row(k('P'), 'rPeek')}
    ${row(k('H'), 'rHat')}${row(k('G'), 'rOutfit')}${row(k('X'), 'rFace')}
    <b class="rtb-sub">${t('rView')}</b>${row(mouse('rDrag') + k('Q') + k('R'), 'rLookRound')}${row(mouse('rWheel'), 'rZoom')}
    <b class="rtb-sub">${t('map')}</b>${row(k('M'), 'rBigMap')}${row(k('N'), 'mmNearest')}</div>
  <div class="rtb-col"><b>${t('rCamera')}</b>
    ${row(mouse('rClick') + k('Space'), 'rTakePhoto')}${row(mouse('rDrag') + k('Q') + k('R'), 'rLook')}${row(mouse('rWheel'), 'rZoom')}${row(k('Esc'), 'rStow')}
    <b class="rtb-sub">${t('rSelfieHead')}</b>${row(mouse('rDrag'), 'rMovePhone')}${row(mouse('rWheel'), 'rReach')}${row(k('T'), 'rStick')}${row(k('G'), 'rGesture')}</div>`;

/** 16 × 16 pixel-art icons (currentColor, with their own glow colours). */
const px = (body: string) => `<svg class="rtb-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
const ICONS: Record<ToolName | 'album', string> = {
  lantern: px(`<path fill="currentColor" d="M6 0h4v1h1v2h-1V1H6v2H5V1h1zM4 3h8v2H4zM4 5h1v7H4zM11 5h1v7h-1zM3 12h10v2H3zM5 14h6v1H5z"/>
    <path class="rtb-lit" fill="#ffc45a" d="M5 5h6v7H5z"/><path class="rtb-lit" fill="#fff0b8" d="M7 7h2v3H7z"/>`),
  torch: px(`<path class="rtb-lit" fill="#ff9a3c" d="M8 0h1v2h1v1h1v4h-1v1H6V7H5V4h1V3h1V1h1z"/><path class="rtb-lit" fill="#ffe07c" d="M7 4h2v3H7zM8 3h1v1H8z"/>
    <path fill="currentColor" d="M5 8h6v2H5zM7 10h2v6H7z"/>`),
  flashlight: px(`<path fill="currentColor" d="M1 6h8v4H1zM9 5h3v6H9zM4 5h2v1H4z"/><path class="rtb-lit" fill="#fff1c8" d="M12 5h1v6h-1z"/>
    <path class="rtb-lit" fill="#ffe07c" opacity="0.8" d="M14 7h2v2h-2zM14 4h1v1h-1zM15 3h1v1h-1zM14 11h1v1h-1zM15 12h1v1h-1z"/>`),
  camera: px(`<path fill="currentColor" d="M3 2h4v2H3zM1 4h14v10H1z"/><path class="rtb-lit" fill="#ffe07c" d="M11 2h3v2h-3z"/>
    <path fill="#0d1927" d="M6 6h4v1h1v1h1v4h-1v1h-1v1H6v-1H5v-1H4V8h1V7h1z"/><path fill="#9fc3e6" d="M7 8h2v1h1v2H9v1H7v-1H6V9h1z"/>`),
  selfie: px(`<path fill="currentColor" d="M4 0h8v16H4z"/><path fill="#0d1927" d="M5 2h6v12H5z"/><path fill="#0d1927" d="M7 1h2v1H7z"/>
    <path class="rtb-lit" fill="#dcae8f" d="M6 5h4v4H6zM6 11h4v3H6z"/><path fill="#3a2a26" d="M7 6h1v1H7zM9 6h1v1H9zM7 8h2v1H7z"/><path class="rtb-lit" fill="#f7b733" d="M6 10h4v1H6z"/>`),
  album: px(`<path fill="currentColor" opacity="0.55" d="M4 1h11v10H4z"/><path fill="currentColor" d="M1 4h11v11H1z"/><path fill="#0d1927" d="M2 5h9v7H2z"/>
    <path class="rtb-lit" fill="#ffe07c" d="M8 6h2v2H8z"/><path fill="#7fa36a" d="M2 11h2V9h1V8h1v1h1v1h1v1h1v-1h1v1h1v1H2z"/>`),
};

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .rtb-wrap { position: absolute; left: 50%; bottom: calc(18 * var(--px)); transform: translateX(-50%); display: grid; justify-items: center;
      gap: calc(8 * var(--px)); opacity: 0; visibility: hidden; transition: opacity 0.5s, visibility 0s 0.5s; --rtb-shape: ${steppedShape(6, 3)}; --rtb-ring: ${steppedRing(6, 3, 1.5)}; }
    .rh[data-mode='walk'] .rtb-wrap, .rh[data-mode='boat'] .rtb-wrap, .rh[data-mode='hang'] .rtb-wrap { opacity: 1; visibility: visible; transition: opacity 0.6s 0.3s, visibility 0s; }
    /* (in the boat and on the glider the hands are busy: only the camera and the phone) */
    .rh:not([data-mode='walk']) .rtb-slot:is([data-tool='lantern'], [data-tool='torch'], [data-tool='flashlight']) { opacity: 0.32; }
    .rtb { display: flex; align-items: center; gap: calc(4 * var(--px)); padding: calc(5 * var(--px)); pointer-events: auto; grid-row: 2;
      --mu-edge: rgba(255, 229, 188, 0.16); }
    .rtb > .mu-bg { background: color-mix(in srgb, rgba(13, 25, 39, 0.62), rgba(4, 15, 32, 0.62) var(--mu-night)); }
    .rtb-slot { position: relative; display: grid; place-items: center; width: calc(42 * var(--px)); height: calc(42 * var(--px)); padding: 0; border: 0;
      background: none; cursor: pointer; outline: none; color: var(--mu-ink2); isolation: isolate; transition: color 0.2s, transform 0.2s var(--mu-ease); }
    .rtb-bg { position: absolute; inset: 0; z-index: -1; clip-path: var(--rtb-shape); background: rgba(255, 244, 222, 0.04); transition: background 0.2s; }
    .rtb-bg::after { content: ''; position: absolute; inset: 0; clip-path: var(--rtb-ring); background: rgba(255, 229, 188, 0.1); transition: background 0.2s; }
    .rtb-icon { width: calc(24 * var(--px)); height: calc(24 * var(--px)); filter: drop-shadow(0 calc(1.5 * var(--px)) 0 rgba(0, 0, 0, 0.35)); }
    .rtb-slot:not(.is-on) .rtb-lit { filter: saturate(0.35) brightness(0.8); }
    .rtb-slot kbd { position: absolute; left: calc(3 * var(--px)); top: calc(2 * var(--px)); min-width: 0; height: auto; padding: 0; border: 0; background: none;
      font: 600 calc(11 * var(--px)) / 1 var(--mu-display); color: var(--mu-dim); }
    .rtb-slot:hover, .rtb-slot:focus-visible { color: var(--mu-ink); transform: translateY(var(--mu-lift)); }
    .rtb-slot:hover .rtb-bg { background: rgba(255, 244, 222, 0.1); }
    .rtb-slot:hover .rtb-bg::after { background: var(--mu-line-hi); }
    .rtb-slot:focus-visible .rtb-bg::after { background: rgba(255, 244, 214, 0.95); }
    .rtb-slot:active { transform: scale(0.94); }
    .rtb-slot.is-on { color: var(--mu-gold-hi); }
    .rtb-slot.is-on .rtb-bg { background: rgba(58, 44, 20, 0.75); box-shadow: 0 0 calc(10 * var(--px)) rgba(255, 176, 40, 0.5); }
    .rtb-slot.is-on .rtb-bg::after { background: var(--mu-gold-hi); }
    .rtb-slot.is-on kbd { color: var(--mu-gold-hi); }
    .rtb-slot.is-off { opacity: 0.4; }
    .rtb-sep { width: 1px; height: calc(24 * var(--px)); margin: 0 calc(3 * var(--px)); background: var(--mu-line); }
    .rtb-more { width: calc(28 * var(--px)); }
    /* (the key help at the bottom left stops short of the bar) */
    .rh:is([data-mode='walk'], [data-mode='boat'], [data-mode='hang']) .rh-help { max-width: calc(50% - 210 * var(--px) - 24px); }
    .rtb-q { font: 700 calc(15 * var(--px)) / 1 var(--mu-display); }

    /* All the keys (?): a small panel over the bar. */
    .rtb-keys { grid-row: 1; display: none; gap: calc(22 * var(--px)); padding: calc(12 * var(--px)) calc(16 * var(--px)); pointer-events: auto;
      font-size: calc(13 * var(--px)); color: var(--mu-ink2); }
    .rtb-keys.is-on { display: flex; }
    /* (it has every key: the mode's key help at the bottom left steps aside for it) */
    .rh:has(.rtb-keys.is-on) .rh-help { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0s 0.2s; }
    .rtb-col { display: grid; grid-template-columns: auto auto; gap: calc(5 * var(--px)) calc(8 * var(--px)); align-content: start; align-items: center; }
    .rtb-col b { grid-column: 1 / -1; font: 700 calc(14 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .rtb-col b.rtb-sub { margin-top: calc(6 * var(--px)); }
    .rtb-k { display: flex; gap: calc(3 * var(--px)); justify-content: flex-end; align-items: center; }
    .rtb-k i { font-style: normal; font-weight: 700; color: var(--mu-ink); margin-right: calc(3 * var(--px)); }
    /* (Khmer letters look smaller at the same size, and take no letter spacing: map.css) */
    :lang(km) .rtb-keys { font-size: calc(14 * var(--px)); }
    :lang(km) .rtb-col b { letter-spacing: 0; }

    /* The camera or the phone up: only the viewfinder. */
    body.roam-photo .rtb-wrap, body.roam-photo .rh-help, body.roam-photo .rh-back, body.roam-photo .rh-prompt,
    body.roam-finder .map-ui:not(.rh) { opacity: 0 !important; visibility: hidden !important; transition: opacity 0.3s, visibility 0s 0.3s !important; }
    /* (the map has its own album button: the tool bar's V) */
    body.map .photo-album-button { display: none; }
    body.map .photo-print { bottom: calc(80px + 2vh); }

    /* Touch: the bar stands up at the right edge, over the Jump button (under the mini-map). */
    body.roam-touch .rtb-wrap { left: auto; right: 12px; bottom: 128px; transform: none; }
    body.roam-touch .rtb { flex-direction: column; }
    body.roam-touch .rtb-sep { width: calc(24 * var(--px)); height: 1px; margin: calc(3 * var(--px)) 0; }
    body.roam-touch .rtb-slot kbd, body.roam-touch .rtb-more, body.roam-touch .rtb-keys { display: none; }
    body.roam-touch .rtb-slot { width: 44px; height: 44px; }
    body.roam-touch .rtb-icon { width: 24px; height: 24px; }
    @media (max-width: 639px) {
      .rtb-wrap { bottom: 10px; }
      .rtb-slot { width: 36px; height: 36px; }
      /* (no room beside the bar: the key help goes over it, as wide as the screen) */
      .rh:is([data-mode='walk'], [data-mode='boat'], [data-mode='hang']) .rh-help { max-width: calc(100% - 20px); bottom: 62px; }
    }
    /* (a phone on its side: no room up the edge, so along the top) */
    @media (max-height: 500px) {
      body.roam-touch .rtb-wrap { top: 8px; bottom: auto; left: 50%; right: auto; transform: translateX(-50%); }
      body.roam-touch .rtb { flex-direction: row; }
      body.roam-touch .rtb-sep { width: 1px; height: 24px; margin: 0 3px; }
      body.roam-touch .rtb-slot { width: 40px; height: 40px; }
    }`;
  document.head.append(style);
}
