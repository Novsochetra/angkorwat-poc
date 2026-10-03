import { Color, CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import '../audio/_equinox';
import { SFX } from '../audio/addonSfx';
import { CAUSEWAY, equinoxHeld, equinoxMorning, FIRST_LIGHT, GATHER, GONE, haloAt, HALO_END, inWatchArea, ON_TOWER, TOWER_TOP } from '../sky/_equinox';
import { SKY } from '../sky/palette';
import { TIME } from '../time';
import type { MapFrame, RoamMode } from '../types';
import { t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * The equinox sunrise over Angkor Wat, while roaming (the rule and the sun:
 * sky/_equinox.ts; the crowd: people/_sceneEquinox.ts; the sounds:
 * audio/_equinox.ts):
 *
 * - **The halo**: as the sun reaches the central tower's top on an equinox
 *   morning (`haloAt`), a soft gold glow crowns the tower — a billboard just
 *   behind the spire (the stone hides its middle, so the light rings round
 *   it, with slow faint rays), at least 22 m round the tip (≈ 5° of the view
 *   from afar), tinting the sky behind toward gold as it lights it (a bright
 *   dawn sky would swallow light alone); seen wherever the sun is behind the
 *   tower (from the causeway, the overview, the balloon or the glider over the
 *   road; not from the temple's sides or its back). Every mode, the overview too.
 * - **The crowd's "ooh"** and their shutters as the sun gets there, as loud as
 *   the crowd is near (the camera, or him).
 * - **Toasts** while roaming: on the eve (the afternoon, the dusk or the night
 *   before), "Tomorrow at dawn the sun rises over the central tower — watch from
 *   the causeway"; at the moment, if he is near: "It is rising over the
 *   tower!" (on the causeway: "raise your camera").
 * - **The passport**: a photo of it from the causeway or the pools' edge (his
 *   camera aimed at the tower top, or a selfie with his back to it) while the
 *   halo is up gives the "Equinox sunrise" stamp (roam/_bookData.ts, the rare
 *   moments' section: `Journal.award`).
 *
 * Keys: none of its own (the camera: 4, the selfie: 5; raised in the watching
 * area that morning, the camera comes up on the tower top: `aimOnRaise`).
 * URL: `equinox=1` with `clock=0.7` (the crowd waiting), `clock=0.76` (the
 * halo, the moment); on the live page the clock runs on from `clock=` after
 * Start (main.ts), so the morning plays; in a roaming shot
 * `roam=walk&at=0,-161&yaw=180` stands him on the causeway.
 */

/** The halo's colour (sRGB): the low sun's gold. */
const GOLD = 0xffc070;
/** Its radius: this much of the view (rad), at least / at most (m). */
const HALO_ANGLE = 0.085;
const HALO_MIN = 22;
const HALO_MAX = 38;
/** How far behind the spire (m, along the view) its middle is: the stone hides it there, the light rings round. */
const BEHIND = 8;
/** The crowd's middle (for the sounds' distance), and how far they carry (m). */
const CROWD = { x: -6, y: 58, z: -160 };
const HEARD = 240;
/** The moment's toast comes this near (m, him or the camera to the causeway). */
const NEAR = 260;
/** Where his camera aims on the tower (m under its tip: the spire in the frame, the halo round it). */
const AIM_BELOW = 6;
/** A check's URL aims the camera itself (`pview=`). */
const URL_VIEW = typeof location !== 'undefined' && new URLSearchParams(location.search).has('pview');

const _d = new Vector3();
const _v = new Vector3();

function buildHalo(): Mesh {
  const material = new ShaderMaterial({
    name: 'equinox halo',
    transparent: true,
    depthWrite: false,
    // (premultiplied: one × its light + what is behind × (1 − its cover))
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    fog: false,
    uniforms: { uColor: { value: new Color(GOLD) }, uAmount: { value: 0 }, uSize: { value: 20 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vUv;
      void main() {
        vUv = position.xy * 2.0;
        // (a billboard: the quad turned to face the view, uSize metres across)
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAmount;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        // A bright core (the sun's glare round the spire), a wide glow, and slow soft rays fanning out from behind it,
        // fading to nothing at the quad's edge.
        float core = exp(-r * r * 10.0);
        float wide = exp(-r * 4.0);
        float a = atan(vUv.y, vUv.x);
        float rays = pow(abs(sin(a * 6.0 + uTime * 0.04)), 12.0) * 0.6 + pow(abs(sin(a * 9.0 - uTime * 0.03 + 1.3)), 16.0) * 0.4;
        float beam = rays * exp(-r * 2.2) * smoothstep(0.06, 0.25, r);
        float fade = (1.0 - smoothstep(0.7, 1.0, r)) * uAmount;
        // (premultiplied: it tints what is behind toward gold and lights it; a bright dawn sky would swallow light alone)
        float cover = clamp((0.7 * core + 0.38 * wide + 0.32 * beam) * fade, 0.0, 0.88);
        float light = (1.6 * core + 0.55 * wide + 0.5 * beam) * fade;
        gl_FragColor = vec4(uColor * light, cover);
      }`,
  });
  const mesh = new Mesh(new PlaneGeometry(1, 1), material);
  mesh.name = 'equinox halo';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.visible = false;
  mesh.raycast = () => {};
  return mesh;
}

let env: AddonEnv | null = null;
let halo: Mesh | null = null;
/** The frame's time of day and of year (the add-on's steps have no frame). */
let clock = 0;
let season = 0;
let lastClock = NaN;
/** The cycle's day whose eve toast, moment toast, "ooh" were given (one each per equinox). */
let eveDay = NaN;
let nowDay = NaN;
let oohDay = NaN;
/** What he held up at the last step. */
let lastKind: string | null = null;

/** The day of the cycle (the morning's), for the once-a-morning things. */
const cycleDay = () => Math.floor(TIME.days());

/** He photographs it: on foot in the watching area, the halo up, the tower top in the picture (or behind him in a selfie). */
function photographed(ctx: RoamCtx, mode: RoamMode): void {
  if (!env || mode !== 'walk' || !equinoxMorning(season, clock) || haloAt(clock) < 0.3) return;
  const p = ctx.body.pos;
  if (!inWatchArea(p.x, p.y, p.z)) return;
  const ph = env.photo;
  if (ph.kind === 'camera') {
    // (his camera at his eye; the view's yaw and pitch: photo.ts `shot`)
    const s = ph.shot;
    _v.set(Math.sin(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.cos(s.yaw) * Math.cos(s.pitch));
    _d.set(TOWER_TOP.x - p.x, TOWER_TOP.y - AIM_BELOW - (p.y + 1.2 * ctx.body.scale), TOWER_TOP.z - p.z).normalize();
    // (in the frame: within half the view's height, and a little more across)
    if (Math.acos(Math.min(1, _v.dot(_d))) > ((s.fov / 2) * 1.25 * Math.PI) / 180) return;
  } else if (ph.kind === 'selfie') {
    // (his back to the tower: it stands behind him in the picture)
    if (Math.abs(angleDiff(ctx.body.yaw, Math.atan2(p.x - TOWER_TOP.x, p.z - TOWER_TOP.z))) > 1.1) return;
  } else return;
  ph.journal.award('equinox');
}

/**
 * He raises his camera in the watching area on the equinox morning: it comes up aimed at the tower top (it would come
 * up level, on the gallery's wall: the sun is far over the frame there, and the follow camera never sees that high).
 */
function aimOnRaise(ctx: RoamCtx, mode: RoamMode): void {
  const kind = env?.photo.kind ?? null;
  const raised = kind === 'camera' && lastKind !== 'camera';
  lastKind = kind;
  if (!env || !raised || URL_VIEW || mode !== 'walk' || clock < GATHER || clock >= HALO_END || !equinoxMorning(season, clock)) return;
  const p = ctx.body.pos;
  if (!inWatchArea(p.x, p.y, p.z)) return;
  const dx = TOWER_TOP.x - p.x;
  const dz = TOWER_TOP.z - p.z;
  const s = env.photo.shot;
  s.yaw = Math.atan2(dx, dz);
  s.pitch = Math.atan2(TOWER_TOP.y - AIM_BELOW - (p.y + 1.2 * ctx.body.scale), Math.hypot(dx, dz));
}

registerAddon({
  id: 'equinox',
  init(e) {
    env = e;
  },
  input(ctx, mode) {
    // (the shutter this step, as photo.ts takes it: read before its step clears the input)
    const ph = env?.photo;
    if (ph?.kind && ph.view > 0.95 && (ctx.input.click || ctx.input.jump)) photographed(ctx, mode);
    return false;
  },
  after(ctx, mode) {
    aimOnRaise(ctx, mode);
    if (!env || !equinoxMorning(season, clock)) return;
    const day = cycleDay();
    // The eve: the afternoon, the dusk and the night before (the dawn of the same day of the cycle), until they start
    // to gather (then the calendar's own toast says so: calendar.ts `begins`).
    if (day !== eveDay && clock >= 0.08 && clock < GATHER) {
      eveDay = day;
      env.hud.toast(t(clock < 0.5 ? 'equiEve' : 'equiSoon'));
    }
    // The moment, if he is near.
    if (day !== nowDay && clock >= FIRST_LIGHT && clock < HALO_END) {
      const p = ctx.body.pos;
      const c = ctx.cam.camera.position;
      if (Math.min(Math.hypot(p.x - CAUSEWAY.x, p.z - CAUSEWAY.z), Math.hypot(c.x - CAUSEWAY.x, c.z - CAUSEWAY.z)) < NEAR) {
        nowDay = day;
        env.hud.toast(t(inWatchArea(p.x, p.y, p.z) ? 'equiNowHere' : 'equiNow'));
      }
    }
  },
  frame(f: MapFrame) {
    clock = f.clock - Math.floor(f.clock);
    season = f.season;
    const morning = clock >= GATHER && clock < GONE && equinoxMorning(season, clock);
    // The crowd's "ooh" and their shutters as the sun reaches the tower (as loud as they are near).
    if (morning && f.dt > 0 && !env?.shot && lastClock < ON_TOWER && clock >= ON_TOWER && clock - lastClock < 0.02 && oohDay !== cycleDay()) {
      oohDay = cycleDay();
      const d = Math.hypot(f.listener.x - CROWD.x, f.listener.y - CROWD.y, f.listener.z - CROWD.z);
      const g = Math.max(0, 1 - Math.max(0, d - 40) / HEARD);
      if (g > 0.02) {
        SFX.play('equiOoh', g);
        SFX.play('equiShutters', g);
      }
    }
    lastClock = clock;
    // The halo: while the sun is on the tower, wherever the sun stands behind it as the camera sees it.
    let amount = morning ? haloAt(clock) : 0;
    if (amount > 0 && env) {
      const cam = f.camera.position;
      _d.set(TOWER_TOP.x - cam.x, TOWER_TOP.y - cam.y, TOWER_TOP.z - cam.z);
      const dist = _d.length();
      // (the sun's bearing against the view's, across the land: 1 straight behind the tower)
      const h = Math.hypot(_d.x, _d.z) || 1;
      const sh = Math.hypot(SKY.sunDir.x, SKY.sunDir.z) || 1;
      const behind = (_d.x * SKY.sunDir.x + _d.z * SKY.sunDir.z) / (h * sh);
      amount *= Math.min(1, Math.max(0, (behind - 0.55) / 0.4)) * (1 - 0.85 * SKY.cloud) * (1 - SKY.rain);
      if (amount > 0.002) {
        if (!halo) {
          halo = buildHalo();
          env.scene.add(halo);
        }
        _d.multiplyScalar(1 / dist);
        halo.position.set(TOWER_TOP.x, TOWER_TOP.y - 1, TOWER_TOP.z).addScaledVector(_d, BEHIND);
        const u = (halo.material as ShaderMaterial).uniforms;
        u.uAmount.value = amount;
        u.uSize.value = 2 * Math.min(HALO_MAX, Math.max(HALO_MIN, (dist + BEHIND) * HALO_ANGLE));
        u.uTime.value = f.drift;
        halo.visible = true;
        return;
      }
    }
    if (halo) halo.visible = false;
  },
  report() {
    // (a bug report's shot brings the equinox back: held, or this morning's watch)
    return equinoxHeld() || (clock >= GATHER && clock < GONE && equinoxMorning(season, clock)) ? { equinox: '1' } : null;
  },
});
