import { Vector3, type Group } from 'three';
import { buildGarland, buildRacePaddle, newRaceRowState, raceRowPose } from '../../character/raceRow';
import { raceAudio } from '../audio/_race';
import { registerEvent } from '../calendar';
import { boatToWorld, CH_CREWS, CH_GANGWAY, CH_LANES, CH_LENGTH, CH_SEAT, CH_START, CH_YAW, CHALLENGE, chMoored } from '../festival/_race';
import { FESTIVAL_SCENE, festivalAt, festivalNow } from '../festival/_schedule';
import { pad } from '../pad/pad';
import { num, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { RaceGame, type Judgement } from './_raceRowGame';
import { createRaceUi, type RaceUi } from './_raceRowUi';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import { LAKE_LEVEL } from '../village/_spots';
import type { RoamCtx } from './types';

/**
 * Paddling in the Water Festival's boat race (Bon Om Touk; festival/_race.ts
 * "the challenge"): two more ngo wait at a landing on the great lake's north
 * shore, west of the village beach. By day, the festival on, on foot at the
 * landing's gangway, E "Join a racing boat": he walks down the plank and takes
 * the free place behind the crew's last pair, a paddle in his hands; the boats
 * line up at the start out west (a fade), and race east to the finish by the
 * landing against the other crew.
 *
 * The drummer beats three, the whistle goes on the fourth, and from then the
 * drum keeps the stroke: Space (or E, the pad's ✕ or □, a tap on the drum)
 * on each beat. On the beat the crew pulls with him and the boat surges on;
 * early, late or missed it slows; the beat quickens half way ("Faster!") and
 * for the last stretch ("Push!"). The other crew keeps a steady pace, a little
 * varied: a good crew wins by a few boat lengths, a careless one loses
 * (the rules: _raceRowGame.ts). At the line the officials raise the flag and
 * whistle, the landing and the beach cheer; the boats coast on and the result
 * comes up: won (the crew stands up cheering, the chhing ring, a prize of
 * 10 000 ៛ into his purse and a garland of marigolds round his neck for five
 * minutes) or beaten (heads down, the other crew cheering). Space races again
 * (by day), E steps ashore at the landing (a fade).
 *
 * A ride that holds him on foot (`holding`, as the rope swing): his pose
 * (character/raceRow.ts) on his own thwart in his boat, which the add-on moves
 * (`CHALLENGE`, drawn by the festival part, festival/_water.ts); the camera
 * low over the water on the shore side, alongside and a little ahead of him
 * (his face and his paddle, the other boat beyond: looking down the course
 * would look into the afternoon sun's glare), turned towards the other boat as
 * one pulls ahead, beside him at the result. Timing is by the race's clock
 * (its seconds, any frame rate), a key's own moment, and the drum put on the
 * audio clock where its beat falls (audio/_race.ts). Esc asks to go back to the
 * map as ever (the race waits meanwhile); the map or the festival ending stop
 * it cleanly; after dusk there is no racing again.
 *
 * URL (checks): with `fest=water` (and `roam=walk&at=…` anywhere), `race=join`
 * puts him in his boat at the start (the count about to begin), `race=row:<0‥1>`
 * half way down the course at that point (`racephase=<0‥1>` his stroke there),
 * `race=win|lose` the result; `raceauto=<0‥1>` plays the race by itself (a
 * player that good: 1 every beat dead on, 0.5 careless), `racehold=1` holds the
 * race where the URL puts it (a still's way, on the live page too). Bug reports
 * bring `race=` back.
 */

/** Joining: on foot this near the gangway's foot (m), this far up or down; only while the day is this young at most (`night`). */
const NEAR = 2.8;
const RISE = 1.6;
const JOIN_NIGHT = 0.42;
/** Racing again only while the day lasts (`night` under this). */
const AGAIN_NIGHT = 0.45;
/** The way to the landing is told (a toast) once a visit, this near it (m), by day. */
const TELL_NEAR = 95;
/** Boarding: walking pace to the plank and down it (m/s), stepping down onto his thwart (s), sitting there before the start (s). */
const WALK = 2.4;
const PLANK = 2.2;
const STEP_IN = 0.6;
const SIT = 0.9;
/** The fade to the start and back ashore (s). */
const FADE_OUT = 0.45;
const FADE_IN = 0.6;
/** The prize for a win (riel) and how long the garland stays on (s of roaming). */
const PRIZE = 10_000;
const GARLAND_FOR = 300;
/** The result comes up this long after the race is over (the boats slowing), and its keys wait this long (s). */
const RESULT_AFTER = 1.1;
const RESULT_KEYS = 0.8;
/** A key's own moment counts if it is this recent (ms); else the press is put in the middle of the step. */
const KEY_FRESH = 150;
/**
 * The camera, low over the water on the shore side (his paddle's), turned from looking down the course from behind
 * him by `side` (radians): at the start beside him (the crew and the other boat across the frame), racing alongside
 * and a little ahead of him (his face, his paddle, the other boat beyond), at the result in front of him. (The lake's
 * afternoon sun stands in the south-east: looking that way, behind him down the course, the water's glare washes
 * the boats out.)
 */
const CAM = { side: 1.8, count: 1.62, result: 1.62, pitch: 0.13, countPitch: 0.15, resultPitch: 0.1, dist: 11, countDist: 12, resultDist: 7.5, rise: 0.55, rate: 1.4, hands: 2.4 };

type Stage = 'off' | 'board' | 'seated' | 'fade' | 'count' | 'race' | 'result';

let env: AddonEnv | null = null;
let stage: Stage = 'off';
/** Seconds into the stage (the race's own clock aside). */
let stageT = 0;
/** What the fade leads to: the start ('start') or ashore ('ashore'). */
let fadeTo: 'start' | 'ashore' = 'start';
let ui: RaceUi | null = null;
/** The last marks' timing (s off the beat; NaN off the beat altogether), for checks. */
const errs: number[] = [];
const game = new RaceGame(CH_LENGTH, {
  onBeat: (bt, n) => beat(bt, n),
  onJudge: (j, err, wild) => {
    judged(j, wild);
    // (checks: how far off his last presses were)
    if (errs.length >= 64) errs.shift();
    errs.push(wild ? Number.NaN : err);
  },
  onStage: (s, bt) => {
    ui?.big(t(s === 1 ? 'raceFaster' : 'racePush'), 'call');
    raceAudio.call(bt);
  },
  onFinish: (k, ft) => finished(k, ft),
});
/** His pose's state, its posture, his paddle (built on first use) and the garland's time left. */
const rs = newRaceRowState();
const posture = () => raceRowPose(rs, paddle);
let paddle: Group | null = null;
let garlandLeft = 0;
/** His stroke: catching up to the catch after a press, and the last catch's beat period (s). */
let catching = false;
let period = 1 / 1.15;
/** Presses waiting for the step: `performance.now()` of each (NaN: no time of its own) and which (`again`: Space, `out`: E). */
const presses: { at: number; key: 'space' | 'e' }[] = [];
let keyAt = Number.NaN;
let keyCode: 'space' | 'e' = 'space';
/** The player turned the camera this long ago (s): it is theirs until `CAM.hands`. */
let camIdle = 99;
/** The step's moment on the page's clock (ms) and the race's clock before it. */
let perfNow = 0;
/** Boarding: where he set off from, the plank's ends, his seat (world). */
const from = new Vector3();
const foot = new Vector3(...CH_GANGWAY.foot);
const head = new Vector3(...CH_GANGWAY.head);
const seat = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
/** The result: shown yet, the prize paid for this race; the first boat over the line told. */
let resultShown = false;
let paid = false;
let firstOver = false;
/** The other crew's last drum beat scheduled (its stroke number). */
let rivalBeat = 0;
/** Checks: the race played by itself (a player that good, 0‥1; NaN: by the player), a held stroke, frozen stills. */
let auto = Number.NaN;
let autoBeat = -1;
const autoAt: number[] = [];
let heldU = Number.NaN;
let frozen = false;
/** The festival was seen on while he raced (it ending stops the race), and for how long it has not been (s). */
let sawFestival = false;
let festGone = 0;
/** The way to the landing told this visit. */
let told = false;
/** Boat poses written each step (the festival part draws them). */
const B0 = CHALLENGE.boats[0];
const B1 = CHALLENGE.boats[1];

const holding = () => stage !== 'off';
/** The stage now (read afresh: a press or a fade may have changed it within the step). */
const now = (): Stage => stage;
const racing = () => stage === 'count' || stage === 'race' || stage === 'result';

// ── The calendar: the boat races, by day during the Water Festival (the four crews race heat after heat; the challenge waits) ──

const nightOf = (clock: number) => 0.5 - 0.5 * Math.cos(clock * Math.PI * 2);
registerEvent({
  id: 'boatrace',
  kind: 'festival',
  name: 'raceCalName',
  note: 'raceCalNote',
  place: 'raceCalPlace',
  begins: 'raceCalBegins',
  where: { x: CH_GANGWAY.foot[0], z: CH_GANGWAY.foot[2] },
  on: (m) => festivalAt(m.season, m.day) === 'water' && nightOf(m.clock) < 0.5,
  shown: (m) => festivalNow(m) === 'water' && nightOf(m.clock) < 0.5,
});

// ── Keys: their own moment (a press's timing is the key's, not the frame's) ──

if (typeof addEventListener === 'function')
  addEventListener(
    'keydown',
    (e) => {
      if (!racing() || e.repeat || !e.isTrusted || e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
        keyAt = e.timeStamp;
        keyCode = e.code === 'Space' ? 'space' : 'e';
      }
    },
    true,
  );

// ── The beat, the marks, the finish ──

/** A beat of his crew's drum (scheduled a little ahead): the drum, the start's whistle. */
function beat(bt: number, n: number): void {
  if (frozen) return;
  raceAudio.drum(bt, n < 0 ? 0.8 : 1, n % 4 === 0);
  if (n === 0) raceAudio.whistle(bt, false);
}

function judged(j: Judgement, wild: boolean): void {
  ui?.judge(j, wild, game.streak);
  if (wild || j === 'miss') pad.rumble('tick', 0.15);
  else if (j === 'perfect') pad.rumble('tick', 0.45);
}

function finished(k: 0 | 1, ft: number): void {
  if (firstOver) return;
  // (the first over the line: the officials' long whistle, the flag up, the landing and the beach cheer)
  firstOver = true;
  if (frozen) return;
  raceAudio.whistle(ft, true);
  raceAudio.cheer(k === 0 ? 1 : 0.65, 0.4);
  CHALLENGE.cheer = k === 0 ? 1 : 0.6;
}

// ── Stages ──

function setStage(s: Stage): void {
  stage = s;
  stageT = 0;
}

/** Off the boat at once (the map, the mode changed): nothing left behind. */
function stopNow(ctx: RoamCtx | null): void {
  const e = env;
  if (e) {
    const ex = e.explorer;
    if (ex.animator.posture === posture) {
      ex.animator.posture = null;
      ex.animator.postureFeet = true;
    }
    ex.rig.clearSlot('racePaddle');
    ex.showFace(null);
  }
  if (ctx) ctx.body.grounded = true;
  CHALLENGE.active = false;
  CHALLENGE.aboard = false;
  CHALLENGE.cheer = 0;
  CHALLENGE.flag = 0;
  ui?.show(false);
  presses.length = 0;
  setStage('off');
}

/** Put the two boats and him at the start, the count about to begin. */
function toStart(ctx: RoamCtx | null): void {
  game.start(env?.shot ? 0.37 : Math.random());
  rivalBeat = Math.floor(game.rivalCrew);
  resultShown = false;
  paid = false;
  firstOver = false;
  catching = false;
  rs.u = 0.97;
  rs.poise = 1;
  rs.rest = 1;
  rs.cheer = rs.slump = 0;
  autoBeat = -1;
  autoAt.length = 0;
  B0.mood = B1.mood = 0;
  CHALLENGE.cheer = 0;
  CHALLENGE.flag = 0;
  CHALLENGE.active = true;
  CHALLENGE.aboard = true;
  placeBoats(0);
  ui?.show(true);
  ui?.result(null);
  ui?.drumOn(true);
  ui?.big(t('raceReady'), 'count');
  env?.explorer.showFace('determined');
  if (ctx) {
    seatHim(ctx);
    aimCam(ctx, 1, true);
  }
  setStage('count');
}

/** Ashore at the gangway's foot, the boats back at their moorings (the end of a fade). */
function ashore(ctx: RoamCtx): void {
  const b = ctx.body;
  b.pos.copy(foot);
  b.pos.y = Math.max(foot.y, ctx.world.groundAt(foot.x, foot.z));
  b.vel.set(0, 0, 0);
  // (facing the landing and his boat)
  b.yaw = Math.atan2(head.x - foot.x, head.z - foot.z);
  const ex = env!.explorer;
  ex.animator.posture = null;
  ex.animator.postureFeet = true;
  ex.rig.clearSlot('racePaddle');
  ex.showFace(null);
  ex.setMotion(0, true, 0);
  CHALLENGE.active = false;
  CHALLENGE.aboard = false;
  CHALLENGE.cheer = 0;
  CHALLENGE.flag = 0;
  ui?.show(false);
  ctx.cam.behindYaw = b.yaw + Math.PI;
  ctx.cam.yaw = b.yaw + Math.PI * 0.85;
  ctx.cam.pitch = 0.3;
  ctx.cam.distance = 9;
  ctx.cam.follow = 0.6;
  ctx.cam.blendFrom(0);
  setStage('off');
}

/** A fade (none in a still): out, the change in the dark, back in. */
function fade(to: 'start' | 'ashore'): void {
  fadeTo = to;
  setStage('fade');
  if (!env?.shot) void env?.hud.fade(1, FADE_OUT);
}

// ── Where things are ──

/** The two boats on the course (race metres), bobbing, surging with the strokes. */
function placeBoats(rt: number): void {
  for (let k = 0; k < 2; k++) {
    const b = k === 0 ? B0 : B1;
    // (after the line they coast on a little, never into the shore)
    const x = Math.min(game.x[k], CH_LENGTH + 14);
    const v = game.v[k];
    const stroke = k === 0 ? game.crew : game.rivalCrew;
    const surge = 0.05 * Math.min(1, v / 3) * Math.sin(stroke * Math.PI * 2);
    b.x = CH_START + x + surge;
    b.z = CH_LANES[k];
    b.y = LAKE_LEVEL + Math.sin(rt * 1.1 + k * 1.7) * 0.03 * (1 - Math.min(1, v / 4) * 0.5);
    b.yaw = CH_YAW + 0.004 * Math.sin(rt * 0.7 + k * 2);
    // (the bow lifts a little at speed and rocks with the strokes)
    b.pitch = -0.012 * Math.min(1, v / 4) + 0.006 * Math.sin(stroke * Math.PI * 2) + 0.004 * Math.sin(rt * 0.9 + k);
    b.roll = 0.008 * Math.sin(rt * 0.75 + k * 2.1);
    b.speed = v;
    b.stroke = stroke;
    b.row = k === 0 ? game.crewRow : game.rivalRow;
  }
}

/** His seat in his boat now (world), him on it facing the bow. */
function seatHim(ctx: RoamCtx): void {
  boatToWorld(B0, CH_SEAT.x, CH_SEAT.y, CH_SEAT.z, seat);
  const b = ctx.body;
  b.pos.copy(seat);
  b.yaw = B0.yaw;
  b.vel.set(Math.sin(B0.yaw) * B0.speed, 0, Math.cos(B0.yaw) * B0.speed);
  b.grounded = true;
  rs.pitch = B0.pitch;
  rs.roll = B0.roll;
}

/** The camera (`CAM`): on the shore side, beside him at the start, alongside and a little ahead racing, beside him at the result (he is framed low, under the card). */
function aimCam(ctx: RoamCtx, dt: number, snap = false): void {
  const cam = ctx.cam;
  const b = ctx.body;
  const res = stage === 'result';
  // (between him and the other boat: both in the frame; the other boat's pull ahead or behind turns it)
  const dx = B1.x - B0.x;
  const dz = B1.z - B0.z;
  const lead = Math.max(-9, Math.min(9, dx));
  // (the player's own camera turns round him)
  const k = camIdle < CAM.hands ? 0 : res ? 0.1 : 0.36;
  // (at the result he is framed low, under the card)
  cam.focus.set(b.pos.x + lead * k + (res || !k ? 0 : 0.8), b.pos.y + 1.35 * b.scale + (res ? CAM.rise : 0), b.pos.z + dz * k);
  cam.minDistance = 4;
  cam.maxDistance = 26;
  cam.follow = 0;
  cam.fov = stage === 'race' && game.stage === 2 ? 53 : 50;
  if (camIdle < CAM.hands && !snap) return;
  const beside = stage === 'count' || stage === 'seated';
  const side = res ? CAM.result : beside ? CAM.count : CAM.side;
  const yaw = B0.yaw - side;
  const pitch = res ? CAM.resultPitch : beside ? CAM.countPitch : CAM.pitch;
  const dist = res ? CAM.resultDist : beside ? CAM.countDist : CAM.dist;
  const e = snap ? 1 : 1 - Math.exp(-dt * CAM.rate);
  cam.yaw += angleDiff(yaw, cam.yaw) * e;
  cam.pitch += (pitch - cam.pitch) * e;
  cam.distance += (dist - cam.distance) * e;
}

// ── The add-on ──

registerAddon({
  id: 'race',

  get holding() {
    return stage !== 'off';
  },

  get handsBusy() {
    return stage !== 'off';
  },

  init(e) {
    env = e;
    // (checks: the page's own `raceauto=`, also for a race joined by hand)
    const a = e.params.get('raceauto');
    if (a !== null && Number.isFinite(Number(a))) auto = Math.min(1, Math.max(0, Number(a)));
  },

  offer(ctx, mode) {
    const e = env;
    if (!e || mode !== 'walk' || stage !== 'off' || e.busy() || FESTIVAL_SCENE.kind !== 'water' || ctx.night >= JOIN_NIGHT) return null;
    const p = ctx.body.pos;
    if (Math.hypot(p.x - foot.x, p.z - foot.z) > NEAR || Math.abs(p.y - foot.y) > RISE) return null;
    return `E  ${t('raceJoin')}`;
  },

  use(ctx) {
    board(ctx);
  },

  input(ctx, mode, _tap, dt) {
    if (stage === 'off' || mode !== 'walk') return false;
    const i = ctx.input;
    // (the camera is the player's for a moment after they turn it)
    if (i.lookYaw || i.lookPitch || i.zoom) camIdle = 0;
    else camIdle += dt;
    ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
    // Space and E: a stroke (the count, the race), or at the result race again / step ashore. The key's own moment
    // when it came from the keyboard just now; a pad's, the touch buttons' or a script's in the middle of the step.
    if (i.jump || i.use) {
      const fresh = performance.now() - keyAt < KEY_FRESH;
      const key: 'space' | 'e' = fresh ? keyCode : i.jump ? 'space' : 'e';
      presses.push({ at: fresh ? keyAt : Number.NaN, key });
      keyAt = Number.NaN;
    }
    // (the stick, Space and E are the race's: no tools, emotes or walking meanwhile)
    return true;
  },

  hold(ctx, dt) {
    hold(ctx, dt);
    return { prompt: null };
  },

  after(ctx, mode, dt) {
    const e = env;
    if (!e) return;
    // The garland: on for a while after a win.
    if (garlandLeft > 0 && (garlandLeft -= dt) <= 0) e.explorer.rig.clearSlot('raceGarland');
    // (the way to the landing, once a visit, near it by day while the festival is on)
    if (!told && mode === 'walk' && stage === 'off' && FESTIVAL_SCENE.kind === 'water' && ctx.night < JOIN_NIGHT && !e.shot) {
      const p = ctx.body.pos;
      if (Math.hypot(p.x - foot.x, p.z - foot.z) < TELL_NEAR) {
        told = true;
        ctx.hud.toast(t('raceNear'));
      }
    }
  },

  frame() {
    if (!holding()) return;
    // (the drum and the course on screen, where the race is now)
    if (ui && racing()) {
      const last = game.last;
      const span = Math.max(1e-3, game.next - last);
      ui.drum((game.t - last) / span, game.t - last);
      ui.course(Math.min(1, game.x[0] / CH_LENGTH), Math.min(1, game.x[1] / CH_LENGTH), CH_LENGTH - game.x[0]);
    }
  },

  setMode(next, prev, ctx) {
    if (next === prev) return;
    if (stage !== 'off') {
      // (back to the map: its own fade covers it; the boats go back to their moorings. Any other way out mid-fade: no
      // black left over)
      if (stage === 'fade' && next !== 'overview' && !env?.shot) void env?.hud.fade(0, 0.3);
      stopNow(ctx);
    }
    if (next === 'overview' && env) {
      env.explorer.rig.clearSlot('raceGarland');
      garlandLeft = 0;
      told = false;
    }
  },

  fromUrl(q, ctx) {
    const a = q.get('raceauto');
    if (a !== null && Number.isFinite(Number(a))) auto = Math.min(1, Math.max(0, Number(a)));
    const hu = Number(q.get('racephase'));
    heldU = q.has('racephase') && Number.isFinite(hu) ? hu : Number.NaN;
    const v = q.get('race');
    if (!v || !env) return;
    if (holding()) stopNow(ctx);
    ensure();
    // (a still with no keys, or `racehold=1`: the race stands where the URL puts it)
    frozen = (env.shot && !q.get('sim') && Number.isNaN(auto)) || q.get('racehold') === '1';
    sawFestival = false;
    festGone = 0;
    const ex = env.explorer;
    ex.animator.posture = posture;
    ex.animator.postureFeet = false;
    ex.rig.setSlotObject('racePaddle', 'root', paddle!);
    toStart(ctx);
    const m = /^row:([\d.]+)$/.exec(v);
    if (m) {
      game.setProgress(Number(m[1]), 2.5);
      setStage('race');
      rs.rest = 0;
      rs.poise = 0;
      rs.u = Number.isNaN(heldU) ? 0.18 : heldU;
      ui?.big('');
      ui?.judge('perfect', false, game.streak);
    } else if (v === 'win' || v === 'lose') {
      game.setOver(v === 'win', 9);
      setStage('result');
      stageT = RESULT_AFTER + RESULT_KEYS;
      ui?.big('');
      showResult(ctx);
    }
    placeBoats(game.t);
    seatHim(ctx);
    poseNow(ctx, 0);
    // (a camera from the URL: round his boat's heading as `rcam` says (yaw, pitch degrees, distance), and the player's
    // for a while; else the race's own)
    const rc = q.get('rcam')?.split(',').map(Number);
    if (rc && rc.every(Number.isFinite)) {
      camIdle = 0;
      aimCam(ctx, 1, false);
      ctx.cam.yaw = B0.yaw + ((rc[0] ?? 0) * Math.PI) / 180;
      ctx.cam.pitch = ((rc[1] ?? 15) * Math.PI) / 180;
      if (rc[2]) ctx.cam.distance = rc[2];
    } else aimCam(ctx, 1, true);
  },

  report() {
    if (stage === 'off') return null;
    const r: Record<string, string> = { fest: 'water' };
    if (stage === 'result') r.race = game.won ? 'win' : 'lose';
    else if (stage === 'race') r.race = `row:${game.progress.toFixed(2)}`;
    else r.race = 'join';
    if (!Number.isNaN(auto)) r.raceauto = String(auto);
    return r;
  },
});

/** His paddle (in his crew's paint) and the interface, made on first use. */
function ensure(): void {
  const e = env!;
  if (!paddle) paddle = buildRacePaddle(CH_CREWS[0].hull, CH_CREWS[0].band);
  if (!ui) {
    ui = createRaceUi(e.layer, e.shot);
    ui.onDrum = (at) => {
      if (stage === 'count' || stage === 'race') presses.push({ at, key: 'space' });
    };
    ui.onAgain = () => presses.push({ at: Number.NaN, key: 'space' });
    ui.onOut = () => presses.push({ at: Number.NaN, key: 'e' });
  }
}

/** E at the gangway: down the plank and into his boat. */
function board(ctx: RoamCtx): void {
  ensure();
  from.copy(ctx.body.pos);
  frozen = false;
  sawFestival = FESTIVAL_SCENE.kind === 'water';
  festGone = 0;
  CHALLENGE.active = true;
  CHALLENGE.aboard = false;
  B0.mood = B1.mood = 0;
  B0.row = B1.row = 0;
  B0.speed = B1.speed = 0;
  ctx.body.vel.set(0, 0, 0);
  setStage('board');
}

/** One step while he is held. */
function hold(ctx: RoamCtx, dt: number): void {
  const e = env!;
  stageT += dt;
  perfNow = performance.now();
  rs.t += dt;
  // The festival over (the calendar moved on), or gone dark before the start: back ashore.
  if (FESTIVAL_SCENE.kind === 'water') {
    sawFestival = true;
    festGone = 0;
  } else if (sawFestival && (festGone += dt) > 0.5 && stage !== 'fade') {
    ctx.hud.toast(t('raceOver'));
    fade('ashore');
  }
  if (stage === 'board') return boarding(ctx, dt);
  if (stage === 'seated') {
    // (sitting in the boat at the landing a moment, the paddle across his lap)
    for (let k = 0; k < 2; k++) chMoored(k, FESTIVAL_SCENE.t, k === 0 ? B0 : B1);
    seatHim(ctx);
    poseNow(ctx, dt);
    aimCam(ctx, dt);
    presses.length = 0;
    if (stageT >= SIT) {
      if (e.shot) toStart(ctx);
      else fade('start');
    }
    return;
  }
  if (stage === 'fade') {
    presses.length = 0;
    if (e.shot || stageT >= FADE_OUT + 0.05) {
      if (fadeTo === 'start') toStart(ctx);
      else ashore(ctx);
      // (back in from the dark)
      if (!e.shot) void e.hud.fade(0, FADE_IN);
      return;
    }
    // (in the dark: he stays in his boat, or where he was on the gangway)
    if (CHALLENGE.aboard) {
      seatHim(ctx);
      poseNow(ctx, dt);
    }
    return;
  }
  // ── The count, the race, the result ──
  // (the leave card asking "Back to the map?": the race waits)
  const waiting = typeof document !== 'undefined' && document.body.classList.contains('mu-asking');
  const t0 = game.t;
  if (!frozen && !waiting) {
    const t1 = t0 + dt;
    if (!Number.isNaN(auto) && stage !== 'result') autoPress(t1);
    // Each press at its own moment within the step (a keyboard's), else the step's middle.
    presses.sort((p, q) => (Number.isNaN(p.at) ? 1 : Number.isNaN(q.at) ? -1 : p.at - q.at));
    for (const p of presses) {
      const pt = Number.isNaN(p.at) ? t0 + dt * 0.5 : Math.min(t1, Math.max(game.t, t1 - (perfNow - p.at) / 1000));
      if (now() === 'result') resultKey(ctx, p.key);
      else if (now() === 'count' || now() === 'race') {
        if (pt > game.t) game.step(pt - game.t);
        stroke(ctx, pt);
      }
    }
    presses.length = 0;
    if (t1 > game.t) game.step(t1 - game.t);
    raceAudio.clock(game.t, perfNow);
    rivalDrum(ctx);
  } else presses.length = 0;
  if (now() === 'count' || now() === 'race') countAndRace(t0);
  else if (now() === 'result' && !resultShown && stageT >= RESULT_AFTER) showResult(ctx);
  if (now() !== 'count' && now() !== 'race' && now() !== 'result') return;
  placeBoats(game.t);
  seatHim(ctx);
  poseNow(ctx, waiting || frozen ? 0 : dt);
  aimCam(ctx, dt);
  // (the wash along the hull, as in his own boat)
  ctx.levels.wake = Math.min(1, game.v[0] / 4.5) * 0.85;
  // The landing's cheer dies down, the officials' flag comes down again after the finish.
  if (CHALLENGE.cheer > 0) CHALLENGE.cheer = Math.max(0, CHALLENGE.cheer - dt / 9);
  CHALLENGE.flag = !Number.isNaN(game.finish[0]) || !Number.isNaN(game.finish[1]) ? Math.min(1, CHALLENGE.flag + dt * 3) : 0;
  if (stage === 'result' && CHALLENGE.flag > 0 && stageT > 6) CHALLENGE.flag = 0;
}

/** Walking down the gangway and stepping onto his thwart. */
function boarding(ctx: RoamCtx, dt: number): void {
  const b = ctx.body;
  const ex = env!.explorer;
  for (let k = 0; k < 2; k++) chMoored(k, FESTIVAL_SCENE.t, k === 0 ? B0 : B1);
  presses.length = 0;
  const d1 = from.distanceTo(foot);
  const t1 = Math.min(1.4, d1 / WALK);
  const t2 = foot.distanceTo(head) / PLANK;
  const s = stageT;
  boatToWorld(B0, CH_SEAT.x, CH_SEAT.y, CH_SEAT.z, seat);
  const plankYaw = Math.atan2(head.x - foot.x, head.z - foot.z);
  if (s < t1) {
    const u = s / Math.max(1e-3, t1);
    b.pos.lerpVectors(from, foot, u);
    b.yaw += angleDiff(plankYaw, b.yaw) * (1 - Math.exp(-dt * 10));
    ex.setMotion(d1 / Math.max(1e-3, t1) / b.scale, true, 0);
  } else if (s < t1 + t2) {
    const u = (s - t1) / t2;
    b.pos.lerpVectors(foot, head, u);
    b.yaw += angleDiff(plankYaw, b.yaw) * (1 - Math.exp(-dt * 10));
    ex.setMotion(PLANK / b.scale, true, 0);
    if (ctx.t > 0 && Math.floor(u * 6) !== Math.floor(Math.max(0, u - dt / t2) * 6)) ctx.sound('stepWood', 0.45);
  } else {
    // Down onto his thwart: a little hop, turning to face the bow; the posture takes him (the paddle across his lap).
    const u = Math.min(1, (s - t1 - t2) / STEP_IN);
    if (ex.animator.posture !== posture) {
      ex.animator.posture = posture;
      ex.animator.postureFeet = false;
      ex.rig.setSlotObject('racePaddle', 'root', paddle!);
      rs.rest = 1;
      rs.poise = 1;
      rs.u = 0.97;
      rs.cheer = rs.slump = 0;
      CHALLENGE.aboard = true;
      ctx.sound('stepWood', 0.55);
    }
    const eu = u * u * (3 - 2 * u);
    b.pos.lerpVectors(head, seat, eu);
    b.pos.y += Math.sin(Math.PI * u) * 0.3;
    b.yaw += angleDiff(B0.yaw, b.yaw) * (1 - Math.exp(-dt * 8));
    ex.setMotion(0, true, 0);
    rs.pitch = B0.pitch;
    rs.roll = B0.roll;
    if (u >= 1) {
      b.pos.copy(seat);
      setStage('seated');
    }
  }
  // (the camera behind him going down the plank, then round beside him)
  ctx.cam.focus.set(b.pos.x, b.pos.y + 1.45 * b.scale, b.pos.z);
  ctx.cam.behindYaw = b.yaw;
  ctx.cam.follow = 0.8;
}

/** A stroke pressed at race time `pt`. */
function stroke(ctx: RoamCtx, pt: number): void {
  const j = game.press(pt);
  // (tapping along with the count: nothing yet, the paddle stays poised)
  if (j === null) return;
  // (his paddle: on to the catch, quickly, unless it is still in the water from the last one)
  if (rs.u >= 0.45 || rs.poise > 0.5) catching = true;
  period = 1 / game.hz;
  const good = j === 'perfect' || j === 'good';
  ctx.sound('paddle', good ? 0.85 : 0.55);
  if (good && stage === 'race' && game.n > 0) raceAudio.shout(pt + 0.08, j === 'perfect' ? 1 : 0.75, game.n % 2 === 0);
}

/** Checks: a player of skill `auto` presses on the beats (a little off, sometimes missing one, sometimes a stray press). */
function autoPress(t1: number): void {
  // (each beat's press is planned as the beat comes up: its moment, early or late; then pressed when it comes)
  if (game.n >= 0 && game.n !== autoBeat && game.drumming()) {
    const n = (autoBeat = game.n);
    const r1 = frac(Math.sin(n * 12.9898 + 7.1) * 43758.5453);
    const r2 = frac(Math.sin(n * 78.233 + 1.3) * 12345.678);
    const sigma = 0.012 + 0.16 * (1 - auto);
    if (r2 >= (1 - auto) * 0.45) autoAt.push(game.next + (r1 - 0.5) * 2 * sigma * 1.6);
    // (an engaged but careless player also presses between beats now and then)
    if (r2 > 1 - (1 - auto) * 0.3) autoAt.push(game.next + 0.5 / game.hz);
  }
  for (let i = autoAt.length - 1; i >= 0; i--)
    if (t1 >= autoAt[i]) {
      autoAt.splice(i, 1);
      presses.push({ at: Number.NaN, key: 'space' });
    }
}

const frac = (v: number) => v - Math.floor(v);

/** The count's words, the start, the race's end and the result. */
function countAndRace(t0: number): void {
  if (stage === 'count') {
    // ("3, 2, 1" on the count's beats, "Go!" on the start's)
    for (const [bt, word] of COUNT)
      if (t0 < bt * (1 / 1.15) && game.t >= bt * (1 / 1.15)) ui?.big(word === 'go' ? t('raceGo') : num(word), word === 'go' ? 'go' : 'count');
    if (game.phase === 'race') {
      setStage('race');
      rs.rest = 0;
    }
  }
  if (now() === 'race' && game.phase === 'over') {
    setStage('result');
    ui?.drumOn(false);
  }
}

const COUNT: readonly (readonly [number, string])[] = [
  [-3, '3'],
  [-2, '2'],
  [-1, '1'],
  [0, 'go'],
];

/** The result: the card, the crews' moods, the prize and the garland for a win. */
function showResult(ctx: RoamCtx): void {
  const e = env!;
  resultShown = true;
  const won = !!game.won;
  B0.mood = won ? 1 : -1;
  B1.mood = won ? -1 : 1;
  rs.cheer = won ? 1 : 0;
  rs.slump = won ? 0 : 1;
  rs.rest = won ? 0 : 1;
  e.explorer.showFace(won ? 'happy' : 'neutral');
  ui?.drumOn(false);
  if (won && !paid) {
    paid = true;
    if (!e.shot) e.purse.earn(PRIZE);
    e.explorer.rig.setSlot('raceGarland', 'chest', buildGarland());
    garlandLeft = GARLAND_FOR;
    const at = game.t + 0.05;
    for (let i = 0; i < 5; i++) raceAudio.chhing(at + i * 0.22, i % 2 === 1, i === 4 ? 1 : 0.8);
  }
  ui?.result({
    won,
    margin: game.margin,
    time: game.finish[0],
    counts: game.counts,
    prize: won ? riel(PRIZE) : null,
    again: ctx.night < AGAIN_NIGHT,
  });
}

/** Space or E at the result (after a moment): race again, or step ashore. */
function resultKey(ctx: RoamCtx, key: 'space' | 'e'): void {
  if (!resultShown || stageT < RESULT_AFTER + RESULT_KEYS) return;
  if (key === 'space') {
    if (ctx.night >= AGAIN_NIGHT) {
      ctx.hud.toast(t('raceDusk'));
      return;
    }
    env!.uiSound('select');
    fade('start');
  } else {
    env!.uiSound('back');
    fade('ashore');
  }
}

/** The other crew's drum, put on the audio clock as its strokes come round. */
function rivalDrum(ctx: RoamCtx): void {
  if (frozen || game.phase === 'count' || !Number.isNaN(game.finish[1])) return;
  const next = Math.floor(game.rivalCrew) + 1;
  if (next <= rivalBeat) return;
  const at = game.t + (next - game.rivalCrew) / game.rivalHz;
  if (at - game.t > 0.15) return;
  rivalBeat = next;
  // (across the lane to his right, a little ahead or behind; quieter: the wind between)
  _v.set(B1.x - ctx.body.pos.x, 0, B1.z - ctx.body.pos.z);
  const d = Math.max(4, _v.length());
  _w.set(-Math.cos(ctx.cam.yaw), 0, Math.sin(ctx.cam.yaw));
  const side = (_v.x * _w.x + _v.z * _w.z) / d;
  raceAudio.rival(at, Math.min(1, 7 / d), side);
}

/** His pose this step: the stroke (catching up to the catch after a press), poised, across the lap, the result's. */
function poseNow(ctx: RoamCtx, dt: number): void {
  const b = ctx.body;
  rs.pitch = B0.pitch;
  rs.roll = B0.roll;
  // (looking at the other boat when it is close ahead or beside)
  const ahead = B1.x - B0.x;
  rs.look += ((Math.abs(ahead) < 12 && stage === 'race' ? -0.35 : 0) - rs.look) * (1 - Math.exp(-dt * 2));
  if (!Number.isNaN(heldU)) {
    rs.u = heldU;
    rs.poise = 0;
    rs.rest = 0;
  } else if (stage === 'race' || stage === 'count') {
    const resting = stage === 'count' && game.t < -2.4 / 1.15;
    rs.rest += ((resting ? 1 : 0) - rs.rest) * (1 - Math.exp(-dt * 5));
    if (catching) {
      rs.u += dt / 0.05;
      if (rs.u >= 1) {
        rs.u -= 1;
        catching = false;
      }
      rs.poise += (0 - rs.poise) * (1 - Math.exp(-dt * 20));
    } else if (rs.u < 0.96) {
      rs.u = Math.min(0.96, rs.u + dt / Math.max(0.4, period));
      rs.poise += (0 - rs.poise) * (1 - Math.exp(-dt * 12));
    } else rs.poise += (1 - rs.poise) * (1 - Math.exp(-dt * 6));
  } else if (stage === 'result') {
    rs.u = Math.min(0.96, rs.u + dt / Math.max(0.4, period));
  }
  b.explorer.setMotion(0, true, 0);
}

/** For checks (a test in a browser reads it: the race now). */
export const RACE_CHECK = {
  get stage(): string {
    return stage;
  },
  get t(): number {
    return game.t;
  },
  get next(): number {
    return game.next;
  },
  get n(): number {
    return game.n;
  },
  get phase(): string {
    return game.phase;
  },
  get won(): boolean | null {
    return game.won;
  },
  get x(): readonly number[] {
    return game.x;
  },
  get counts(): Readonly<Record<string, number>> {
    return game.counts;
  },
  get finish(): readonly number[] {
    return game.finish;
  },
  get garland(): number {
    return garlandLeft;
  },
  errs,
};
