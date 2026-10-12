import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, SRGBColorSpace, Vector3 } from 'three';
import { BIKE, bikePose, bikeState, STOP_LEAN, WHEELBASE } from '../../character/bike';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_bike';
import { SFX } from '../audio/addonSfx';
import { Things } from '../people/_things';
import { pad } from '../pad/pad';
import { SEY, SEY_R, SEY_SPOT } from '../sey';
import type { MapFrame, RoamMode } from '../types';
import { lang, t } from '../ui/lang';
import { registerAddon, touchJump, type AddonEnv, type AddonKey } from './_addons';
import { buildCanopies, canopyAt } from './_bikeCanopy';
import { BikeModel, type BikeLook, type BikeTurns } from './_bikeModel';
import { BIKE_KINDS, BIKE_OWN, bikeOwnFromUrl, HIRE_PRICE, kindOf, leaveBike, onBikeOwn, ridingBike } from './_bikeOwn';
import { SHOP_DISPLAY, SHOP_DISPLAY_TURN, shopToWorld, shopYaw } from './_bikeShopPlan';
import { BIKE_SPOTS, type BikeSpot } from './_bikeSpots';
import { bagNotify } from './_shopBag';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import { setTouchBell, takeTouchFish } from './touch';
import type { RoamCtx, RoamWorld } from './types';
import { stepSound } from './walker';

/**
 * Bicycles to ride (ជិះកង់): black Khmer town bicycles stand on their side
 * stands at four places in the roaming area (_bikeSpots.ts: by the head of
 * Angkor Wat's road, at the morning market, at the sugar-palm village's west
 * end, at the little market behind Angkor Wat).
 *
 * Whose they are: the one by Angkor Wat's road is hired out (E "Hire a
 * bicycle (2,000 ៛)": paid once, he rides it as long as he likes; once he has
 * left it and walked 30 m off, or gone back to the map, it goes back to its
 * place); the other three are the neighbours' (by one, a line with no key,
 * "A neighbour's bicycle · buy your own at the market"; E anyway: the
 * neighbour calls out). His own (bought at the morning market's bicycle shop:
 * roam/_bikeShop.ts, kept in roam/_bikeOwn.ts `BIKE_OWN`) is a fifth, in its
 * kind's look and colour, standing where he last left it (saved, kept across
 * Esc back to the map); the shop's three for sale stand in its stall (not to
 * ride). All of them are one `Things`.
 * On foot beside one he may ride, E ("E  Ride the bicycle"): he steps over,
 * flips the stand up and sits on, his left foot down.
 *
 * Riding (a walk-mode add-on that holds him, as the rope swing does): W
 * pedals (the speed builds up), Shift pedals hard, S brakes, and held once
 * stopped walks it back slowly; A / D steer the front wheel (a real turning
 * circle: tight at a walking pace, wide at speed) and he leans into the turn
 * with the bicycle; Space hops it (both wheels off the ground: over a low
 * wall, a log, a kerb too tall to roll); F rings the bell (kring-kring: on
 * foot F greets, on a bicycle the bell is the greeting); E gets off (braking
 * first if it rolls): he steps off to the side and the bicycle stays on its
 * stand where he left it. Back to the map, the hire and the neighbours'
 * bicycles go back to their places; his own stays where it is.
 *
 * It follows the walk map (`world.standAt`) as a game bicycle should, each
 * wheel with its own height (`wheelStep`): the tyres ease over small steps (up
 * to `BUMP`: a kerb, a root); a stair's risers and a terrace's edge (up to
 * `STAIR`, the walker's stairs) the wheels roll up one after the other, and a
 * land step (up to `LIFT`: the walker hops one) it lifts onto, the front wheel
 * then the back, waiting a moment at the step's face while each lifts (`test`:
 * only what carries the bicycle — a stair, a terrace, a land step; not a post,
 * a rail, a low wall, a log or a counter); it rides off a drop (a short fall
 * and a bounce; deeper than `FALL` it stops at the brink), up and down stairs
 * (bumpy), slower up a rise and faster down one; against a wall it slides
 * along it, keeping the speed that goes along it. A step he could climb only
 * on foot, a cliff and deep water stop it with a message; it never goes
 * through a wall, into deep water or under anything lower than his hat, and
 * keeps inside the roaming area as he does walking (the mist's edge slows it).
 * The people step aside for him as for him on foot (people/_routes.ts reads
 * him in walk mode).
 *
 * His posture (character/bike.ts): seated, the fists on the grips, the boots
 * on the pedals (both by IK), pedalling in time with the cranks, a foot down
 * when stopped, leaning with the bicycle, standing on the pedals in a hop or
 * a lift. The wheels and the cranks turn by the way rolled; the follow camera
 * rides behind, a little further back at speed. His lantern goes away while
 * he rides (`handsBusy`); at night the bicycle's dynamo lamp lights the road
 * ahead while it rolls. Sounds
 * (audio/_bike.ts): the chain as he pedals, the freewheel ticking as he
 * coasts, the tyres on earth, grass or stone, a bump (a step, a landing), the
 * hop, the brake, the stand, the bell.
 *
 * URL (checks): `bike=ride` starts him on a bicycle at `at=` (facing
 * `yaw=`; his own if he has one, else the nearest), `bike=ride:<m/s>` already
 * rolling; `bikeleft=<spot>:x:z:yaw,…` a bicycle left away from its place;
 * `bikeown=<kind>[:<colour>]`, `bikeownat=x:z:yaw°[:y]` his own and where it stands
 * (roam/_bikeOwn.ts); `bikehire=1` the hire bicycle is his for now (bug
 * reports give them all). Its keys in a shot's `sim=`: `w` pedals, `j` hops,
 * `f` rings the bell, `e` gets off.
 */

/** Speeds (m/s, at his roaming size): pedalling, pedalling hard, walking it back; the most it ever goes. */
const V_EASY = 9;
const V_HARD = 13;
const V_BACK = 1.1;
const V_MAX = 16;
/** Pedalling's push (m/s² from a standstill), hard; the brakes; getting off (gentler). */
const PUSH = 4.2;
const PUSH_HARD = 6;
const BRAKE = 7;
const BRAKE_OFF = 4.5;
/** How much of gravity's pull along a slope slows it uphill and speeds it down (a game bicycle's: he climbs what he walks up). */
const SLOPE = 0.6;
/** Rolling resistance on each ground (m/s²), the air's (per (m/s)²). */
const ROLL = { dirt: 0.2, grass: 0.45, stone: 0.12, sand: 0.9, water: 1.6 } as const;
type Ground = keyof typeof ROLL;
const AIR = 0.0055;
/** Hardest sideways pull in a turn (m/s²): the tightest turn at a speed (a real turning circle), and the most it leans (rad). */
const LAT = 6.5;
const STEER_MAX = 0.62;
/** Stopped, A / D shuffle it round with his foot down (rad/s). */
const PIVOT = 0.9;
const LEAN_MAX = 0.6;
/**
 * Up a step (m): what the tyres ease straight over (a kerb, a root, a small step), what they roll up one after the other
 * (a stair's riser, a terrace's edge: the walker's stairs, 1.1, and a little more), and the highest step it gets up onto,
 * the front wheel lifted onto it, then the back (a land step: the walker hops one, 2.2; a little more). A step up to
 * `CLIMB` (he jumps that high on foot) it stops at, "get off to climb up"; taller ones are walls.
 */
const BUMP = 0.42;
const STAIR = 1.15;
const LIFT = 2.45;
const CLIMB = 2.8;
/** Down (m): what the wheels roll down on the ground (deeper, they fly off it and land), and the deepest drop it rides off (a short fall and a bounce; deeper, it stops at the brink: "get off to climb down"). */
const SNAP = 0.22;
const FALL = 4.6;
/** The most water the wheels roll through (m). */
const DEEP = 0.38;
/** A wheel rolls on over what stands no higher than this over its tyre (m); a higher step stops it at the step's face while it lifts. */
const GATE = 0.3;
/** Gravity on the wheels off the ground (m/s²: lively, as the walker's). */
const GRAVITY = 28;
/**
 * The frame's steepest pitch (rad): up a stair or with the front up a step, the back wheel comes up with the front past
 * it (he pulls it up). Off an edge, in the air, the front dips no more than `DIP` (m) under the back: he holds it up.
 */
const PITCH_MAX = 0.8;
const DIP = 0.3;
/** A landing harder than this (m/s down) bounces back this share of it; one harder than `SHAKE` shakes the pad. */
const BOUNCE = 3.2;
const BOUNCE_BACK = 0.22;
const SHAKE = 8;
/**
 * The hop (Space): how high the wheels leave the ground (m), the front this much higher (the nose up), how soon another
 * (s); pedalling, it goes forward at least this fast (m/s: from a standstill at a low wall, over it).
 */
const HOP = 1.35;
const HOP_NOSE = 1.15;
const HOP_AGAIN = 0.3;
const HOP_KICK = 3.2;
/** Held at a step's face while a wheel lifts, it goes on no faster than this (m/s): up a riser or a terrace's edge, onto a land step. */
const HELD_V = [5, 3];
/** A step up over `STAIR` it lifts onto only when he pedals or it rolls this fast (m/s). */
const LIFT_V = 1.5;
/**
 * What a step must be to be ridden up (round the point where it is met, m): it carries the bicycle if 3 of 8 points
 * this far round stand that high, on its far side (not a post, a jar or a rail beside him), and it goes on ahead this
 * far along the way he goes (`CARRY_AHEAD`: a stair, a terrace, a land step; not a low wall, a log or a counter).
 */
const RING_R = 0.45;
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);
const CARRY_AHEAD = [0.5, 1.1];
/** As high as the step, give or take (m): its treads, a stair going on up. */
const LEVEL = 0.35;
/** Room he needs over the ground riding (m, his head at the roaming size). */
const ROOM = 2.3;
/** A move's longest step (m). */
const SUBSTEP = 0.15;
/** The roaming area's edge slows him from this far in (m), as on foot. */
const EDGE_SOFT = 8;
/** Seconds to get on and off; how near the bicycle's middle he must stand to get on (m) and how level with it. */
const MOUNT = 0.6;
const DISMOUNT = 0.55;
const REACH = 1.7;
const RISE = 1.2;
/** A hired bicycle he has left goes back to its place once he is this far from it (m). */
const HIRE_BACK = 30;
/** A bicycle he may ride wins over a neighbour's this much nearer (m: the market's, by the shop's delivery spot). */
const PREFER = 0.8;
/** A parked bicycle leans on its stand this far (rad, to its left), its bars turned a little that way. */
const PARK_LEAN = 0.1;
const PARK_STEER = 0.28;
/** Stopped, the pedals come round to here (the right pedal up and forward, ready to push off). */
const PARK_CRANK = -2.25;
/** How far ahead of the saddle point the lamp's pool of light lies on the ground, and its size (m). */
const POOL_AHEAD = 6.5;
const POOL = { w: 2.6, l: 9.5 };

/**
 * Probes of the frame and him between the wheels (m at the roaming size: along from the saddle point, + ahead; across,
 * + to his left): the rack, the pedals, the bars and his shoulders (the wheels have their own in `test`: under the
 * hub and the tyre's leading edge). Each must have `ROOM` over it and ground no higher than `BUMP` under the frame there (the line between the
 * wheels); a step they meet that the wheels are getting up lifts the trailing wheel (the frame rests on its edge).
 */
const PROBES: readonly (readonly [number, number])[] = [
  [-0.38, 0.22],
  [-0.38, -0.22],
  [0.12, 0.34],
  [0.12, -0.34],
  [0.62, 0.32],
  [0.62, -0.32],
];
/**
 * Turns tried to slide along a wall (rad from the way it goes: the first that is free is about the wall's run, and it
 * keeps the part of its speed along it), and how fast the bicycle turns to run along it (rad/s).
 */
const SLIDES = [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.45, -1.45];
const SLIDE_TURN = 3;
/** Along a wall it loses the speed that went into it over this far (m): once, as it turns to run along it. */
const SLIDE_LEN = 0.5;
const LOOPS = ['bikeChain', 'bikeFree', 'bikeDirt', 'bikeGrass', 'bikeStone'];
/**
 * His head's height riding (m over the wheels' ground at his roaming size): under the hat's brim, and its crown;
 * across, the middle of his head and its sides (his head is wide). What hangs ahead of him there stops the bicycle
 * before it: a stall's umbrella, an awning, cloth on a line, vines hanging from a wall (_bikeCanopy.ts: as they are
 * now — a market folds its umbrellas away at closing), or a lintel or a beam lower than his hat (the walk map).
 */
const HEAD_Y = [2.1, 2.45];
const HEAD_SIDE = [0, 0.38, -0.38];
const HAT_TOP = 2.55;
const CHEST_Y = 1.2;
/** Its look ahead goes in steps this long (m: the walk maps' half column). */
const LOOK_STEP = 0.25;
/** His head's middle ahead of the saddle point, and how far the hat's brim reaches in front of it with a little room (m). */
const HEAD_AHEAD = 0.25;
const BRIM = 0.45;
/** The children's sey circle (sey.ts): he keeps this far from its middle (m: the children, their kicks, a little room). */
const SEY_KEEP = SEY_R + 1.5;
/** The bicycle's front tyre ahead of the saddle point (m). */
const NOSE = 1.1;
/**
 * The key help (bottom left) while he rides: the keys, their words, the pad's buttons. Space (✕) hops; F rings the
 * bell (on foot F greets: on a bicycle the bell is the greeting; the pad's d-pad ↓, F's button on foot too).
 */
const KEYS: readonly AddonKey[] = [
  ['W S', 'bikePedal', 'lstick'],
  ['A D', 'bikeSteer', 'lstick'],
  ['Shift', 'bikeFast', 'r2'],
  ['Space', 'bikeHop', 'south'],
  ['F', 'bikeBell', 'down'],
  ['E', 'bikeOff', 'west'],
  ['Q R', 'rLook', 'rstick'],
];

/** Whose a bicycle is: hired out at Angkor Wat, a neighbour's, his own. */
type Role = 'hire' | 'neighbour' | 'own';

/** What a neighbour calls out when he presses E at their bicycle (in turn). */
const NEIGHBOUR_SAYS = ['bikeNeighbourSay0', 'bikeNeighbourSay1', 'bikeNeighbourSay2'] as const;

interface Bike {
  /** `wat`, `market`, `village`, `hamlet` (its place's), `own`. */
  readonly id: string;
  readonly role: Role;
  /** Its place (null: his own, which stands where he left it). */
  readonly spot: BikeSpot | null;
  readonly model: BikeModel;
  /** On the map (his own: while he has one). */
  shown: boolean;
  /** The point on the ground under its saddle (m) and its heading. */
  readonly pos: Vector3;
  yaw: number;
  /** As drawn: its lean (+ its left side down), pitch (+ front down) and turns. */
  lean: number;
  pitch: number;
  readonly turns: BikeTurns;
  /** Not where its place has it (he rode it off). */
  moved: boolean;
}

type Phase = 'off' | 'mount' | 'ride' | 'dismount';
/**
 * What a move meets: nothing in the way, a step the wheels are getting up (it waits at its face while they lift), a
 * wall (a post, a rail, a low wall: it slides along it, or hops over it), a step too tall for the bicycle that he could
 * climb on foot, a drop too deep to ride off, deep water.
 */
type Block = 'ok' | 'lift' | 'wall' | 'up' | 'down' | 'deep';

let env: AddonEnv | null = null;
/** The roaming mode now (a URL's `bike=ride` only on foot). */
let roamMode: RoamMode = 'overview';
let things: Things | null = null;
/**
 * The bicycles' boxes, a `Things` (one draw) for each place they stand: Angkor Wat's hire bicycle, the morning market's
 * (the neighbour's at its row, the village's west end's, the shop's three for sale), the little market's behind Angkor
 * Wat, and his own (wherever it is). Each is culled by the view (its bounds follow its bicycles) and past `DRAW_FAR`
 * from the camera, and not drawn while none of its bicycles stands: one shared mesh, never culled, drew all ≈ 540 boxes
 * on every view of the map.
 */
interface BikeGroup {
  readonly things: Things;
  readonly bikes: Bike[];
  /** The shop's three for sale (standing still: where each stands, m). */
  readonly sale: { m: BikeModel; x: number; y: number; z: number }[];
}
const groups: BikeGroup[] = [];
/** Its bicycles are drawn while the camera is within this of them (m): a few pixels from there. */
const DRAW_FAR = 260;
const _gc = new Vector3();
/** A group's bounds being gathered this frame (no allocation). */
const box = { n: 0, x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
function take(x: number, y: number, z: number): void {
  box.n++;
  box.x0 = Math.min(box.x0, x);
  box.x1 = Math.max(box.x1, x);
  box.y0 = Math.min(box.y0, y);
  box.y1 = Math.max(box.y1, y);
  box.z0 = Math.min(box.z0, z);
  box.z1 = Math.max(box.z1, z);
}
const bikes: Bike[] = [];
/** His own (null until built), the one hired out (by Angkor Wat's road), the shop's three for sale (not to ride). */
let own: Bike | null = null;
let hireBike: Bike | null = null;
const forSale: BikeModel[] = [];
/** The hire bicycle is his for now (paid); he has left it (got off: it goes back once he is `HIRE_BACK` m off). */
let hired = false;
/** The neighbours' words when he presses E at theirs (in turn). */
let neighbourSay = 0;
let ride: Bike | null = null;
let phase: Phase = 'off';
/** Getting on or off: 0‥1. */
let u = 0;
const from = new Vector3();
const to = new Vector3();
let fromYaw = 0;
/** Getting off: how far he turns toward where he steps (rad, + to his left). */
let offTurn = 0;
const _side = new Vector3();
/** Along the heading (m/s, − backwards). */
let v = 0;
let steer = 0;
let lean = 0;
let pitch = 0;
let crank = 0;
let wheel = 0;
/** The wheels (`rear`, `front`). */
interface Wheel {
  /** The tyre's bottom (m), how fast it goes up or down (m/s, + up), on the ground or not; the hardest landing this step (m/s down). */
  h: number;
  vy: number;
  on: boolean;
  landed: number;
  /**
   * What holds it up where the bicycle is (m: the ground under its tyre, the frame resting on a step's edge; at a
   * step's face it waits at, the step), and the ground alone under its hub (a step's height is measured from there).
   */
  hold: number;
  ground: number;
  /** Held up by the frame off what is under it (the other wheel up a step past `PITCH_MAX`, or he holds the front up off an edge). */
  hung: boolean;
}
const rear: Wheel = { h: 0, vy: 0, on: true, landed: 0, hold: 0, ground: 0, hung: false };
const front: Wheel = { h: 0, vy: 0, on: true, landed: 0, hold: 0, ground: 0, hung: false };
/** A wheel that bears the bicycle: on the ground, or hung from the frame (he can pedal, brake, walk it back, get off). */
const settled = (wh: Wheel) => wh.on || wh.hung;
/** 0 riding ‥ 1 a foot down; walking it back (0‥1) and its steps; how long S has been held at a stop (s). */
let down = 1;
let back = 0;
let walk = 0;
let backWait = 0;
let effort = 0;
let bump = 0;
/** 0 seated ‥ 1 standing on the pedals (a hop, a lift onto a step, in the air). */
let rise = 0;
/** Held at a step's face this step while a wheel lifts; when the next hop may come (`clock`). */
let waiting = false;
let hopAt = 0;
/** Checks: what the last move met (`Block`). */
let lastBlock = '';
/** E pressed while rolling: braking to get off. */
let leaving = false;
let braked = false;
/** The ride's own clock (s: shots run their steps with the frame's time standing still). */
let clock = 0;
/** When the next bell, message and bump sound may come (`clock`). */
let bellAt = 0;
let toastAt = 0;
let bumpAt = 0;
let edgeToast = 0;
/** When he got on (`clock`): the keys show over him a few seconds. */
let onAt = 0;
/** When the touch buttons' "Hop" and "Bell" are set again (`clock`: the touch controls may appear later), and the bell is shown. */
let jumpAt = 0;
let bellShown = false;
/** The ground under the wheels (`stepSound` asked a few times a second) and the tyres' sound on it. */
let ground: Ground = 'dirt';
let groundAt = 0;
let lastSound = '';
/** The player's camera distance (the speed's extra goes on top) and the extra now; how strongly it followed before (put back after). */
let camBase = 9;
let camExtra = 0;
let followWas = 0.6;
/** The lamp's light on the ground ahead (at night while he rides). */
let pool: Mesh | null = null;
let poolMat: MeshBasicMaterial | null = null;
/** The prompts in the language in use (made again when it changes). */
let words = '';
let offerText = '';
let rideText = '';
let hireText = '';
let neighbourText = '';

const ps = bikeState();
const posture = () => bikePose(ps);

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const ease = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};
const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

/** Metres at the roaming size → at his size now. */
const sc = (ctx: RoamCtx) => ctx.body.scale / 1.4;
/** A body unit in metres at his size now. */
const buM = (ctx: RoamCtx) => BODY_UNIT_M * ctx.body.scale;

function prompts(): void {
  if (words === lang()) return;
  words = lang();
  offerText = `E  ${t('bikeRide')}`;
  rideText = `E  ${t('bikeOff')}  ·  Space  ${t('bikeHop')}  ·  F  ${t('bikeBell')}`;
  hireText = `E  ${t('bikeHire', { riel: riel(HIRE_PRICE) })}`;
  // (no key: it is not his to ride)
  neighbourText = t('bikeNeighbour');
}

// ── The bicycles on the map ────────────────────────────────────────────────

function build(e: AddonEnv): void {
  if (things) return;
  // (what hangs at his head's height: made now, before the parts' first update fold any stall's umbrella away)
  const t0 = performance.now();
  // (and the bicycle shop's stall in roaming's own scene: its add-on comes first, `order` 30)
  const shop = e.scene.getObjectByName('bikeShop');
  const hanging = buildCanopies(e.parts, e.world.field, shop ? [shop] : []);
  console.info(`[map] bicycles: ${BIKE_SPOTS.length} · ${hanging} things hanging at head height (umbrellas, awnings, vines) indexed in ${(performance.now() - t0).toFixed(1)} ms`);
  // (the four at their places, his own — room for the biggest look the shop sells —, the shop's three for sale)
  const looks = BIKE_KINDS.map((k) => lookOf(k.id));
  const ownSlots = BikeModel.most(OWN_SEED, looks);
  // (a group for each place: its boxes' room, its mesh in roaming's scene; `things` is the market's, the shop's three in it)
  const groupOf = (id: string): string => (id === 'wat' || id === 'hamlet' || id === 'own' ? id : 'east');
  const room = new Map<string, number>([['own', ownSlots], ['east', looks.reduce((n, l) => n + BikeModel.boxes(SALE_SEED, l), 0)]]);
  for (const s of BIKE_SPOTS) room.set(groupOf(s.id.slice(5)), (room.get(groupOf(s.id.slice(5))) ?? 0) + BikeModel.boxes(s.seed));
  const byName = new Map<string, BikeGroup>();
  for (const [name, n] of room) {
    const t = new Things(n);
    t.mesh.name = `roam:bikes:${name}`;
    // (culled: its bounds are set each frame from where its bicycles stand)
    t.mesh.frustumCulled = true;
    t.mesh.boundingSphere = new Sphere(new Vector3(), 1);
    e.scene.add(t.mesh);
    const g: BikeGroup = { things: t, bikes: [], sale: [] };
    byName.set(name, g);
    groups.push(g);
  }
  const group = (id: string) => byName.get(groupOf(id))!;
  things = group('market').things;
  const turns = (): BikeTurns => ({ steer: 0, front: 0, rear: 0, crank: PARK_CRANK, stand: 1, lamp: 0 });
  for (const spot of BIKE_SPOTS) {
    const g = group(spot.id.slice(5));
    const model = new BikeModel(g.things, spot.seed);
    const b: Bike = { id: spot.id.slice(5), role: spot.role, spot, model, shown: true, pos: new Vector3(), yaw: 0, lean: 0, pitch: 0, turns: turns(), moved: false };
    bikes.push(b);
    g.bikes.push(b);
    if (spot.role === 'hire') hireBike = b;
    home(b, e.world);
  }
  own = { id: 'own', role: 'own', spot: null, model: new BikeModel(group('own').things, OWN_SEED, lookOf(BIKE_OWN.kind ?? 'town'), ownSlots), shown: false, pos: new Vector3(), yaw: 0, lean: 0, pitch: 0, turns: turns(), moved: false };
  bikes.push(own);
  group('own').bikes.push(own);
  ownChanged(e);
  onBikeOwn(() => env && ownChanged(env));
  // The shop's three for sale: side by side in its stall, on their stands, pointing out to the street (written once).
  BIKE_KINDS.forEach((k, i) => {
    const m = new BikeModel(group('east').things, SALE_SEED, lookOf(k.id));
    const [lx, lz] = SHOP_DISPLAY[i];
    const [x, z] = shopToWorld(lx, lz);
    const t = turns();
    t.crank = PARK_CRANK;
    m.place(x, e.world.field.heightAt(x, z), z, shopYaw(SHOP_DISPLAY_TURN), PARK_LEAN, 0, 1.4, t);
    m.write();
    forSale.push(m);
    group('east').sale.push({ m, x, y: e.world.field.heightAt(x, z), z });
  });
  // The dynamo lamp's pool of light on the ground ahead: a soft warm oval (long along the road, nothing at
  // the canvas's edges), added to the ground's light.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.scale(1, 2);
  const grad = g.createRadialGradient(32, 34, 2, 32, 34, 29);
  grad.addColorStop(0, 'rgba(255, 228, 176, 1)');
  grad.addColorStop(0.4, 'rgba(255, 214, 156, 0.6)');
  grad.addColorStop(0.75, 'rgba(255, 204, 144, 0.18)');
  grad.addColorStop(1, 'rgba(255, 200, 140, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  poolMat = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, color: 0xffd9a0 });
  poolMat.name = 'roam:bike lamp';
  pool = new Mesh(new PlaneGeometry(1, 1), poolMat);
  pool.name = 'roam:bike lamp';
  pool.rotation.order = 'YXZ';
  pool.visible = false;
  pool.renderOrder = 2;
  pool.raycast = () => {};
  e.scene.add(pool);
}

/** His own bicycle's and the shop's: their small differences' seed (they carry nothing: a new bicycle). */
const OWN_SEED = 5;
const SALE_SEED = 6;

/** How a bicycle of `kind` looks, new from the shop (its colour, nothing carried). */
const lookOf = (kind: (typeof BIKE_KINDS)[number]['id']): BikeLook => ({ kind, colour: kind === BIKE_OWN.kind ? BIKE_OWN.colour : kindOf(kind).colour, cargo: false });

/** Back to its place, on its stand (his own: where he left it, on the floor he left it on). */
function home(b: Bike, world: RoamWorld): void {
  const s = b.spot;
  const x = s ? s.x : BIKE_OWN.x;
  const z = s ? s.z : BIKE_OWN.z;
  b.pos.set(x, s ? groundUnder(world, x, z) : floorAt(world, x, BIKE_OWN.y, z), z);
  b.yaw = s ? s.yaw : BIKE_OWN.yaw;
  park(b);
  b.turns.crank = PARK_CRANK;
  b.moved = false;
}

/** His bicycle changed (bought, traded in, a URL's): its look, where it stands, shown or not. Not while he rides it. */
function ownChanged(e: AddonEnv): void {
  const b = own;
  if (!b || (ride === b && phase !== 'off')) return;
  b.shown = BIKE_OWN.kind !== null;
  if (!BIKE_OWN.kind) {
    b.model.hide();
    return;
  }
  b.model.restyle({ kind: BIKE_OWN.kind, colour: BIKE_OWN.colour, cargo: false });
  home(b, e.world);
}

/** His own bicycle stands where it is now (he got off it, or the ride stopped): kept between visits. */
function ownLeft(b: Bike): void {
  if (b.role === 'own') leaveBike(b.pos.x, b.pos.z, b.yaw, b.pos.y);
}

/** On its stand where it is: leaning on it, the bars turned a little, the lamp off (the pedals as he left them). */
function park(b: Bike): void {
  b.lean = PARK_LEAN;
  b.pitch = 0;
  b.turns.steer = PARK_STEER;
  b.turns.stand = 1;
  b.turns.lamp = 0;
}

/** The ground at (x, z) for a bicycle standing on the land (a low floor on it too: not a rail, a roof or a bridge over it). */
function groundUnder(world: RoamWorld, x: number, z: number): number {
  const land = world.field.heightAt(x, z);
  const g = world.standAt?.(x, z, land + 0.1, 0.4, ROOM);
  return g !== undefined && !Number.isNaN(g) ? g : land;
}

/**
 * The floor at (x, z) about `y` (m: where he left his bicycle, a terrace's, a deck's or a bridge's over the land), or
 * the ground there when `y` is not known or nothing stands there now (`groundUnder`: from the land up, so a bicycle
 * left on a terrace no longer stands inside its stone after a reload).
 */
function floorAt(world: RoamWorld, x: number, y: number, z: number): number {
  if (Number.isFinite(y) && world.standAt) {
    const g = world.standAt(x, z, y + 0.3, 0.6, ROOM);
    if (!Number.isNaN(g) && Math.abs(g - y) < 1) return g;
  }
  return groundUnder(world, x, z);
}

/** The bicycle he is by at (x, y, z) (one he may ride before a neighbour's a little nearer), or null. */
function near(x: number, y: number, z: number, s: number): Bike | null {
  let best: Bike | null = null;
  let bd = Infinity;
  for (const b of bikes) {
    if (!b.shown) continue;
    // (from its middle, between the wheels)
    const mx = b.pos.x + Math.sin(b.yaw) * 0.17 * s;
    const mz = b.pos.z + Math.cos(b.yaw) * 0.17 * s;
    const d = Math.hypot(x - mx, z - mz);
    if (d >= REACH * s || Math.abs(y - b.pos.y) >= RISE) continue;
    const score = d + (b.role === 'neighbour' ? PREFER : 0);
    if (score < bd) {
      bd = score;
      best = b;
    }
  }
  return best;
}

/** He may ride it now: his own, or the hire bicycle he has paid for. */
const his = (b: Bike): boolean => b.role === 'own' || (b.role === 'hire' && hired);

// ── Where it can go ────────────────────────────────────────────────────────

/** Checks: the ground under the frame's probes last tested, over the frame there (m; NaN: a wall). */
const probeY = new Float64Array(PROBES.length);
/** What a test found (`test`): what would hold each wheel up there and the ground under each (m); the step it waits at, over the ground (m). */
let tr = 0;
let tf = 0;
let ur = 0;
let uf = 0;
let stepRise = 0;
/** He pedals into a step, or rolls at it fast enough (`LIFT_V`), so the bicycle lifts onto one taller than `STAIR` (set for each move). */
let lifting = false;

/** The ground a tyre touches at (x, z) seen from its bottom at `from` (up to `LIFT` over it, with room for him; NaN: a wall). */
function tyreGround(w: RoamWorld, x: number, z: number, from: number, k: number, up = LIFT): number {
  return w.standAt ? w.standAt(x, z, from, up * k, ROOM * k) : w.groundAt(x, z);
}

/**
 * Can the bicycle be at (x, z) heading `yaw`, going `dir` (+ ahead, − back), its wheels as they are now? Fills `tr` /
 * `tf` (what would hold each wheel up there) and `ur` / `uf` (the ground under each), and says what is in the way:
 * - a tyre (under its hub and its leading edge, which meets a step first) on ground higher than `GATE` over it: a step
 *   it is getting up (`lift`: the move waits at its face while the wheel lifts) if the step carries the bicycle
 *   (`carries`) and is no higher than `LIFT` over the ground the wheel is on (`STAIR` unless he pedals or it rolls
 *   fast: `lifting`), going ahead; else a wall, or a step he could climb on foot (`up`);
 * - the frame's probes: room over each; ground under the frame higher than `BUMP` there is the step being climbed (the
 *   nearer wheel comes up, so the frame rests on its edge; `lift` while it is still far below it) or a wall (a post, a
 *   rail, a low wall: it slides along it);
 * - a wheel over a drop deeper than `FALL` (`down`; walking it back, the back wheel off one deeper than `STAIR`), or
 *   in deep water (`deep`).
 * `loose`: it is caught in something already (put there by a URL): only the wheels count, any way out but over a cliff.
 */
function test(ctx: RoamCtx, x: number, z: number, yaw: number, dir: number, loose = false): Block {
  const w = ctx.world;
  const k = sc(ctx);
  const bu = buM(ctx);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  // (his left: +x of his own space)
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const go = dir < 0 ? -1 : 1;
  const hx = fx * go;
  const hz = fz * go;
  const ar = BIKE.rear * bu;
  const af = BIKE.front * bu;
  // (a tyre's leading edge: its radius ahead of its hub, the way it goes; standing still, only what is under the hub
  // holds it up: a front wheel lifted at a step's face comes back down)
  const edge = dir ? BIKE.wheel * bu : 0;
  stepRise = 0;
  let wait = false;
  // ── The wheels: the leading one first ──
  for (let i = 0; i < 2; i++) {
    const isFront = (i === 0) === go > 0;
    const wh = isFront ? front : rear;
    const a = isFront ? af : ar;
    const cx = x + fx * a;
    const cz = z + fz * a;
    const ex = cx + hx * edge;
    const ez = cz + hz * edge;
    const hub = tyreGround(w, cx, cz, wh.h, k);
    const lead = tyreGround(w, ex, ez, wh.h, k);
    const at = lead > hub ? 1 : 0;
    const s = Math.max(hub, lead);
    if (isFront) {
      tf = s;
      uf = hub;
    } else {
      tr = s;
      ur = hub;
    }
    if (loose) {
      // (caught in something, a wheel comes up onto the ground under its hub as up a stair, no higher: it may be
      // inside a counter or a wall)
      const up = hub > wh.h + STAIR * k ? wh.h : hub;
      if (isFront) tf = up;
      else tr = up;
      continue;
    }
    // (NaN: a wall, a step too tall for the bicycle — one he could climb on foot says so — or no room for him)
    if (Number.isNaN(s)) {
      const px = Number.isNaN(lead) ? ex : cx;
      const pz = Number.isNaN(lead) ? ez : cz;
      const top = tyreGround(w, px, pz, wh.ground, k, CLIMB);
      return go > 0 && top > wh.ground + LIFT * k && carries(w, px, pz, top, hx, hz, k) ? 'up' : 'wall';
    }
    const water = w.waterAt(cx, cz);
    if (water !== null && water > s + DEEP * k) return 'deep';
    if (s < wh.ground - (go < 0 && i === 0 ? STAIR : FALL) * k) return 'down';
    if (s <= wh.h + GATE * k) continue;
    // A step at the tyre: up it (front first), if it carries the bicycle; else a wall.
    const rise = s - wh.ground;
    if (go < 0 || rise > (lifting ? LIFT : STAIR) * k || !carries(w, at ? ex : cx, at ? ez : cz, s, hx, hz, k)) return 'wall';
    stepRise = Math.max(stepRise, rise);
    wait = true;
  }
  if (loose) return Number.isNaN(tr) || Number.isNaN(tf) || Math.min(tr, tf) < Math.min(rear.h, front.h) - 2.5 * k ? 'wall' : 'ok';
  // ── The frame and him between the wheels ──
  for (let i = 0; i < PROBES.length; i++) {
    const [a, c] = PROBES[i];
    const px = x + (fx * a + lx * c) * k;
    const pz = z + (fz * a + lz * c) * k;
    // (the frame there: on the line between the tyres' bottoms)
    const u = clamp((a * k - ar) / (af - ar), 0, 1);
    const base = rear.h + (front.h - rear.h) * u;
    const g = tyreGround(w, px, pz, base, k);
    probeY[i] = g - base;
    if (Number.isNaN(g)) return 'wall';
    if (g <= base + BUMP * k) continue;
    // The step the wheels are getting up, under the frame: the nearer wheel comes up so that the frame rests on its edge.
    const near = u > 0.5 ? front : rear;
    if (go < 0 || g - near.ground > (lifting ? LIFT : STAIR) * k || !carries(w, px, pz, g, hx, hz, k)) return 'wall';
    const need = u > 0.5 ? (g - BUMP * k - rear.h * (1 - u)) / u : (g - BUMP * k - front.h * u) / (1 - u);
    if (u > 0.5) tf = Math.max(tf, need);
    else tr = Math.max(tr, need);
    if (need > near.h + GATE * k) {
      stepRise = Math.max(stepRise, g - near.ground);
      wait = true;
    }
  }
  if (!w.inBounds(x + fx * 1.1 * k * go, z + fz * 1.1 * k * go) && w.inBounds(ctx.body.pos.x, ctx.body.pos.z)) return 'wall';
  return wait ? 'lift' : 'ok';
}

/**
 * Does a step with its top at `top` where it is met, (x, z), carry the bicycle going (hx, hz)? 3 of the 8 points round
 * it stand that high (or as a stair's next tread), most of them on its far side (a step beside him, that he rides
 * along, is a wall), and it goes on ahead (`CARRY_AHEAD`): a stair, a terrace, a land step; not a post, a jar, a rail,
 * a low wall, a log or a counter.
 */
function carries(w: RoamWorld, x: number, z: number, top: number, hx: number, hz: number, k: number): boolean {
  if (!w.standAt) return false;
  const lo = top - LEVEL * k;
  let n = 0;
  let ax = 0;
  let az = 0;
  for (const [cx, cz] of RING) {
    if (!(tyreGround(w, x + cx * RING_R * k, z + cz * RING_R * k, top, k, STAIR) >= lo)) continue;
    n++;
    ax += cx;
    az += cz;
  }
  if (n < 3 || ax * hx + az * hz < 0.3 * Math.hypot(ax, az)) return false;
  for (const d of CARRY_AHEAD) if (!(tyreGround(w, x + hx * d * k, z + hz * d * k, top, k, STAIR) >= lo)) return false;
  return true;
}

/** A short message (not again for a few seconds). */
function say(ctx: RoamCtx, key: 'bikeUp' | 'bikeDown' | 'bikeDeep' | 'bikeLow' | 'bikeSey'): void {
  if (clock < toastAt) return;
  toastAt = clock + 4;
  ctx.hud.toast(t(key));
}

/** Checks: the room ahead last found (m). */
let lastRoom = Infinity;
/** What `roomAhead` last found in the way: something low at his head's height, or the sey circle. */
let aheadIs: 'bikeLow' | 'bikeSey' = 'bikeLow';

/**
 * Something hangs at his head's height at (x, z) over ground at `y` (his head's middle there, heading (fx, fz)): a
 * box of _bikeCanopy.ts at his head, or a gap in the walk map under something lower than his hat.
 */
function lowAt(w: RoamWorld, x: number, y: number, z: number, fx: number, fz: number, k: number): boolean {
  if (w.ceilingAt && w.ceilingAt(x, z, y + CHEST_Y * k) < y + HAT_TOP * k) return true;
  for (const side of HEAD_SIDE) {
    const sx = x + fz * side * k;
    const sz = z - fx * side * k;
    for (const h of HEAD_Y) if (canopyAt(sx, y + h * k, sz)) return true;
  }
  return false;
}

/**
 * How far (m) he can still ride straight on before something hangs in the way at his head's height (`lowAt`) or the
 * children's sey circle is, looking `look` m ahead; Infinity: nothing there.
 */
function roomAhead(ctx: RoamCtx, look: number): number {
  const w = ctx.world;
  const k = sc(ctx);
  const p = ctx.body.pos;
  const fx = Math.sin(ctx.body.yaw);
  const fz = Math.cos(ctx.body.yaw);
  let room = Infinity;
  // From his head's middle on; what hangs over him already does not count (he rides on out from under it). His head
  // goes up and down the stairs and terraces ahead with the ground (a doorway at the top of a stair counts from there).
  let clear = false;
  let y = p.y;
  for (let d = 0; d <= look; d += LOOK_STEP * k) {
    const x = p.x + fx * (HEAD_AHEAD * k + d);
    const z = p.z + fz * (HEAD_AHEAD * k + d);
    const g = tyreGround(w, x, z, y, k, STAIR);
    if (!Number.isNaN(g)) y = g;
    const low = lowAt(w, x, y, z, fx, fz, k);
    if (!low) clear = true;
    else if (clear) {
      room = d - BRIM * k;
      aheadIs = 'bikeLow';
      break;
    }
  }
  // The sey circle while the children play: its edge, along the way he goes (from the front tyre).
  if (SEY.out) {
    const dx = p.x - SEY_SPOT.x;
    const dz = p.z - SEY_SPOT.z;
    const along = dx * fx + dz * fz;
    const c = dx * dx + dz * dz - SEY_KEEP * SEY_KEEP;
    const disc = along * along - c;
    // (inside it already: only going in further is in the way)
    const s = c < 0 ? (along < 0 ? 0 : Infinity) : along < 0 && disc > 0 ? -along - Math.sqrt(disc) - NOSE * k : Infinity;
    if (s < room) {
      room = s;
      aheadIs = 'bikeSey';
    }
  }
  return room;
}

/** A knock against something (a sound and the pad's shake for a hard one). */
function knock(speed: number): void {
  if (speed < 1.2 || clock < bumpAt) return;
  bumpAt = clock + 0.35;
  SFX.play('bikeBump', clamp(speed / 6, 0.3, 1));
  if (speed > 4) pad.rumble('land', clamp(speed / 10, 0.3, 0.8));
}

/**
 * Move along the heading by `d` m (− backwards), turning `turn` rad on the way, in short steps: up a step the wheels
 * are getting up it waits at its face while they lift (front then back; `waiting`), it rides off a drop (the wheels fly
 * off it), and against a wall, a step too tall, a drop too deep or deep water it slides along it, keeping the part of
 * its speed along it (the bicycle turning to run along it); met head on, it stops. Then what holds the wheels up is
 * that of where it is (`front.hold`, `rear.hold`).
 */
function move(ctx: RoamCtx, d: number, turn: number, dt: number): void {
  const body = ctx.body;
  const pos = body.pos;
  const k = sc(ctx);
  const n = Math.max(1, Math.ceil(Math.abs(d) / (SUBSTEP * k)));
  // (the most it turns to run along a wall each step)
  const most = (SLIDE_TURN * dt) / n;
  waiting = false;
  // Where it is: what holds the wheels up here (a step that does not move still has them); caught in something
  // already (e.g. put there by a URL), only the wheels count and any way out is fine.
  const here = test(ctx, pos.x, pos.z, body.yaw, d);
  const loose = here === 'wall';
  keep(true);
  for (let i = 0; i < n; i++) {
    let ds = d / n;
    const yaw = body.yaw + turn / n;
    // The soft edge of the roaming area: slower and slower towards it (as on foot).
    if (ctx.world.edgeDistance) {
      const fx = Math.sin(yaw) * Math.sign(ds);
      const fz = Math.cos(yaw) * Math.sign(ds);
      const d0 = ctx.world.edgeDistance(pos.x, pos.z);
      const d1 = ctx.world.edgeDistance(pos.x + fx * Math.abs(ds) * 4, pos.z + fz * Math.abs(ds) * 4);
      if (d1 < EDGE_SOFT && d1 < d0) {
        const slow = Math.max(0, d1 / EDGE_SOFT) ** 1.5;
        ds *= slow;
        v *= 1 - (1 - slow) * 0.2;
        if (slow < 0.15 && clock > edgeToast) {
          ctx.hud.toast(t('rMist'));
          edgeToast = clock + 8;
        }
      }
    }
    const nx = pos.x + Math.sin(yaw) * ds;
    const nz = pos.z + Math.cos(yaw) * ds;
    const b = test(ctx, nx, nz, yaw, ds, loose);
    lastBlock = b;
    if (b === 'ok') {
      pos.x = nx;
      pos.z = nz;
      body.yaw = yaw;
      keep(true);
      continue;
    }
    if (b === 'lift') {
      // A step the wheels are getting up: it waits at its face while they lift (what would hold them there lifts
      // them), going on no faster than it can (a riser, a terrace's edge; a land step slower).
      waiting = true;
      keep(false);
      v = Math.min(v, HELD_V[stepRise > STAIR * k ? 1 : 0] * k);
      return;
    }
    // (rising in a hop: it waits at what it meets in the air, which it may yet clear: a low wall, a log)
    if (b === 'wall' && !rear.on && !front.on && Math.max(rear.vy, front.vy) > 0) return;
    // A wall, a step too tall, a drop too deep, deep water: slide along it (the first turn that is free is about its
    // run; the bicycle turns to run along it, keeping the part of its speed that goes along it).
    let slid = false;
    for (const a of SLIDES) {
      const sy = yaw + a;
      const step = ds * Math.cos(a);
      const sx = pos.x + Math.sin(sy) * step;
      const sz = pos.z + Math.cos(sy) * step;
      const turnTo = clamp(a, -most, most);
      if (test(ctx, sx, sz, body.yaw + turnTo, ds, loose) !== 'ok') continue;
      pos.x = sx;
      pos.z = sz;
      body.yaw += turnTo;
      keep(true);
      if (Math.abs(a) > 0.5) knock(Math.abs(v) * Math.sin(Math.abs(a)));
      // (the speed that went into it is lost as it turns along it: over `SLIDE_LEN`, not again at every step)
      v *= 1 - (1 - Math.cos(a)) * Math.min(1, Math.abs(ds) / (SLIDE_LEN * k));
      slid = true;
      break;
    }
    if (slid) continue;
    // Head on: it stops (a step he could climb on foot, a drop, deep water: he hears why).
    if (ds > 0 && b !== 'wall') say(ctx, b === 'up' ? 'bikeUp' : b === 'down' ? 'bikeDown' : 'bikeDeep');
    knock(Math.abs(v));
    v = 0;
    return;
  }
}

/** What the last test found holds the wheels up from now on (`ground`: the bicycle is there, so is the ground under them). */
function keep(ground: boolean): void {
  if (!Number.isNaN(tr)) rear.hold = tr;
  if (!Number.isNaN(tf)) front.hold = tf;
  if (!ground) return;
  if (!Number.isNaN(ur)) rear.ground = ur;
  if (!Number.isNaN(uf)) front.ground = uf;
}

/**
 * A wheel this step: up a small step eased, onto a bigger one with a pop, down a small one eased, off a bigger one into
 * the air; true as it starts a pop. It lands with `landed` (m/s down), bouncing off a hard landing.
 */
function wheelStep(wh: Wheel, dt: number, k: number): boolean {
  const target = wh.hold;
  const g = GRAVITY * k;
  let popped = false;
  if (wh.h < target) {
    const up = target - wh.h;
    // (a kerb, a root: eased up it, on the ground)
    if (wh.on && up <= BUMP * k) wh.h += up * damp(24, dt);
    else {
      // (a step: it pops up onto it, coming down onto it from a little over it)
      const pop = Math.sqrt(2 * g * (up + 0.06 * k));
      if (wh.vy < pop) {
        popped = wh.on;
        wh.vy = pop;
      }
      wh.on = false;
    }
  }
  if (!wh.on) {
    wh.vy -= g * dt;
    wh.h += wh.vy * dt;
    if (wh.vy <= 0 && wh.h <= target) {
      const impact = -wh.vy;
      wh.h = target;
      wh.landed = Math.max(wh.landed, impact);
      // (a hard landing bounces a little; then it rolls on)
      if (impact > BOUNCE * k) wh.vy = impact * BOUNCE_BACK;
      else {
        wh.vy = 0;
        wh.on = true;
      }
    }
    return popped;
  }
  wh.vy = 0;
  // On the ground: down a small step eased (it rolls down it), off a bigger one into the air.
  if (wh.h > target) {
    const down = wh.h - target;
    if (down <= SNAP * k) wh.h -= down * damp(20, dt);
    else wh.on = false;
  }
  return false;
}

// ── Getting on, riding, getting off ────────────────────────────────────────

function start(ctx: RoamCtx, b: Bike, at = false): void {
  const e = env!;
  ride = b;
  // (his own: its badge on the maps goes while he rides it)
  if (b.role === 'own') ridingBike(true);
  phase = at ? 'ride' : 'mount';
  u = 0;
  from.copy(ctx.body.pos);
  fromYaw = ctx.body.yaw;
  if (at) {
    // (a check: the bicycle comes to him)
    b.pos.copy(ctx.body.pos);
    b.yaw = ctx.body.yaw;
    b.moved = true;
  }
  v = 0;
  // (getting on, the bars come straight as he sits; a check's bicycle starts with them straight)
  steer = at ? 0 : b.turns.steer;
  lean = at ? STOP_LEAN : b.lean;
  // (getting on, the stand flips up as he sits; a check's bicycle has it up already)
  b.turns.stand = at ? 0 : 1;
  pitch = 0;
  crank = PARK_CRANK;
  down = 1;
  back = walk = backWait = effort = bump = rise = 0;
  leaving = braked = waiting = false;
  for (const wh of [rear, front]) {
    wh.h = wh.hold = wh.ground = b.pos.y;
    wh.vy = wh.landed = 0;
    wh.hung = false;
    wh.on = true;
  }
  onAt = clock;
  ctx.body.vel.set(0, 0, 0);
  e.explorer.animator.posture = posture;
  e.explorer.animator.postureFeet = false;
  // (from a shot's `rcam=`: the camera stays where it puts it)
  camBase = ctx.cam.distance;
  camExtra = 0;
  followWas = ctx.cam.follow;
  if (followWas > 0) ctx.cam.follow = 0.95;
  writePose(ctx, at);
  if (!at) SFX.play('bikeStand', 0.8);
  // (on a touch screen the jump button hops while he rides, and F's button — the boat's Fish — rings the bell)
  touchButtons();
}

/** The touch controls while he rides: the jump button hops, F's button (the boat's Fish) rings the bell (again now and then: they may appear later, the language may change). */
function touchButtons(): void {
  jumpAt = clock + 0.5;
  touchJump('bikeHopBtn');
  setTouchBell(t('bikeBellBtn'));
  bellShown = true;
}

/** Off at once (back to the map, the mode changed): the bicycle stays on its stand where it is. */
function stop(ctx: RoamCtx | null): void {
  if (phase === 'off') return;
  const e = env!;
  if (phase === 'mount' || phase === 'ride') e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  if (ride) {
    // (stopped in the air, it stands on the ground under it)
    if (!settled(rear) || !settled(front)) ride.pos.y = Math.min(rear.ground, front.ground);
    park(ride);
    ride.model.place(ride.pos.x, ride.pos.y, ride.pos.z, ride.yaw, ride.lean, ride.pitch, ctx?.body.scale ?? 1.4, ride.turns);
    ownLeft(ride);
  }
  ride = null;
  phase = 'off';
  quiet();
  touchOff();
  if (ctx) {
    ctx.cam.distance = camBase;
    ctx.cam.follow = followWas;
    ctx.cam.fov = 50;
  }
}

function quiet(): void {
  for (const s of LOOPS) SFX.level(s, 0);
  lastSound = '';
}

/** Off the bicycle: the touch jump button jumps again, F's button goes. */
function touchOff(): void {
  touchJump(null);
  if (bellShown) setTouchBell(null);
  bellShown = false;
}

/** Where he steps off to: beside the bicycle on his left, else his right, else behind it (where he fits); his feet there. */
function stepOffSpot(ctx: RoamCtx, b: Bike, out: Vector3): Vector3 {
  const w = ctx.world;
  const k = sc(ctx);
  const lx = Math.cos(b.yaw);
  const lz = -Math.sin(b.yaw);
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  for (const [across, along] of [[0.82, 0.15], [-0.82, 0.15], [0.82, -0.4], [-0.82, -0.4], [0, -1.25]] as const) {
    const x = b.pos.x + (lx * across + fx * along) * k;
    const z = b.pos.z + (lz * across + fz * along) * k;
    if (!w.inBounds(x, z)) continue;
    let ok = true;
    let top = -Infinity;
    // (his body, a circle of 0.42 m: as the walker's)
    for (let i = 0; i < 5 && ok; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r = i === 4 ? 0 : 0.42 * k;
      const g = w.standAt ? w.standAt(x + Math.cos(a) * r, z + Math.sin(a) * r, b.pos.y, 0.6 * k, ROOM * k) : w.groundAt(x, z);
      if (Number.isNaN(g) || g < b.pos.y - 1.2 * k) ok = false;
      else top = Math.max(top, g);
    }
    const water = w.waterAt(x, z);
    if (ok && (water === null || water < top + 0.3)) return out.set(x, top, z);
  }
  return out.copy(b.pos);
}

function hold(ctx: RoamCtx, dt: number): { prompt: string | null } {
  const b = ride;
  const e = env!;
  const { body, input, cam } = ctx;
  clock += dt;
  prompts();
  if (!b) {
    stop(ctx);
    return { prompt: null };
  }
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  if (input.zoom) camBase = clamp(cam.distance - camExtra, cam.minDistance, cam.maxDistance);
  const k = sc(ctx);
  const bu = buM(ctx);

  // ── Getting on: he steps over to the saddle, the stand flips up ──
  if (phase === 'mount') {
    u = Math.min(1, u + dt / MOUNT);
    const s = ease(u);
    body.pos.lerpVectors(from, b.pos, s);
    body.pos.y = from.y + (b.pos.y - from.y) * s + Math.sin(Math.PI * u) * 0.12 * k;
    body.yaw = fromYaw + angleDiff(b.yaw, fromYaw) * s;
    b.turns.stand = 1 - ease(u * 1.6);
    lean = PARK_LEAN + (STOP_LEAN - PARK_LEAN) * s;
    steer = PARK_STEER * (1 - s);
    if (u >= 1) {
      phase = 'ride';
      body.pos.copy(b.pos);
      body.yaw = b.yaw;
    }
    writePose(ctx, u >= 1);
    focus(ctx, dt);
    return { prompt: null };
  }

  // ── Getting off: he steps off to the side, the stand goes down, it leans on it ──
  if (phase === 'dismount') {
    u = Math.min(1, u + dt / DISMOUNT);
    const s = ease(u);
    body.pos.lerpVectors(from, to, s);
    body.pos.y += Math.sin(Math.PI * u) * 0.1 * k;
    // (he turns a little toward where he steps, and back as he stands by it)
    body.yaw = b.yaw + offTurn * Math.sin(Math.PI * Math.min(1, u * 1.15));
    b.turns.stand = ease(u * 1.4 - 0.2);
    b.lean = STOP_LEAN + (PARK_LEAN - STOP_LEAN) * ease(u * 1.3 - 0.3);
    b.turns.steer = steer + (PARK_STEER - steer) * s;
    b.turns.crank = crank;
    b.turns.lamp = 0;
    body.explorer.setMotion(u < 0.85 ? 1.2 : 0, true, 0);
    cam.focus.set(body.pos.x, body.pos.y + 1.94 * k, body.pos.z);
    cam.behindYaw = body.yaw;
    if (u >= 1) {
      park(b);
      ownLeft(b);
      ride = null;
      phase = 'off';
      cam.distance = camBase;
      cam.follow = followWas;
      cam.fov = 50;
      body.vel.set(0, 0, 0);
    }
    return { prompt: null };
  }

  // ── Riding ──
  // (a card or a menu has roaming paused — "Back to the map?", the calendar, the explorer menu, the name, clothes or
  // dog cards, the big map, the settings: whatever takes the game pad, or asks — so nobody steers: he brakes to a stop)
  const paused = pad.inMenu || document.body.classList.contains('mu-asking');
  const fwd = paused ? 0 : clamp(input.move.y, -1, 1);
  const side = paused ? 0 : clamp(input.move.x, -1, 1);
  if (clock >= jumpAt) touchButtons();
  if (input.use && !paused) leaving = true;
  // The bell (F; the pad's d-pad ↓, the touch controls' Bell): kring-kring.
  const ring = !!input.taps?.has('KeyF') || takeTouchFish();
  if (ring && !paused && clock >= bellAt) {
    bellAt = clock + 0.85;
    SFX.play('bikeBell', 1);
  }
  const vf = Math.abs(v);
  // Getting off: once it has stopped (braking first) on the ground.
  if (leaving && vf < 0.6 && settled(rear) && settled(front)) {
    phase = 'dismount';
    u = 0;
    from.copy(body.pos);
    stepOffSpot(ctx, b, to);
    // (stepping off to his left he turns that way a little, to his right the other)
    _side.subVectors(to, from);
    offTurn = clamp(0.5 * (_side.x * Math.cos(body.yaw) - _side.z * Math.sin(body.yaw)), -0.5, 0.5);
    e.explorer.animator.posture = null;
    e.explorer.animator.postureFeet = true;
    b.pos.copy(body.pos);
    b.yaw = body.yaw;
    b.lean = lean;
    b.pitch = 0;
    v = 0;
    quiet();
    touchOff();
    SFX.play('bikeStand', 0.7);
    return { prompt: null };
  }

  // The ground under the wheels (a few times a second): how it rolls, how it sounds.
  if (clock >= groundAt || clock < groundAt - 1) {
    groundAt = clock + 0.15;
    ground = groundKind(ctx.world, body.pos.x, body.pos.y, body.pos.z);
  }

  // ── The hop (Space; the pad's ✕, the touch controls' Hop): both wheels off the ground, the front a little higher ──
  // (his camera or phone up, the album open: no hands on the bars, so he brakes to a stop and puts a foot down)
  const handsOff = !!e.photo.kind || e.photo.albumOpen || paused;
  if (input.jump && !handsOff && !leaving && settled(rear) && settled(front) && clock >= hopAt) {
    hopAt = clock + HOP_AGAIN;
    const up = Math.sqrt(2 * GRAVITY * HOP) * k;
    rear.vy = up;
    front.vy = up * Math.sqrt(HOP_NOSE);
    rear.on = front.on = rear.hung = front.hung = false;
    down = Math.min(down, 0.3);
    // (pedalling, slow or stopped at a low wall: he throws it forward as he hops, over it)
    if (fwd > 0.08 && !leaving) v = Math.max(v, HOP_KICK * k * fwd);
    SFX.play('bikeHop', clamp(0.55 + vf / (12 * k), 0.55, 1));
  }
  /** A wheel on the ground: he can pedal and brake (in the air, neither; with the back wheel hanging off a step's edge, he still pushes on). */
  const onGround = settled(rear) || settled(front);

  // ── Speed: pedalling builds it up, the brakes and the ground take it, a rise slows it, a fall speeds it ──
  const pedal = !leaving && !handsOff && fwd > 0.08 ? fwd : 0;
  const hard = pedal > 0 && input.run;
  let a = 0;
  if (pedal > 0 && v >= -0.05 && onGround) {
    const top = (hard ? V_HARD : V_EASY) * k * (0.35 + 0.65 * pedal);
    a += (hard ? PUSH_HARD : PUSH) * k * Math.max(0, 1 - Math.max(0, v) / top);
  }
  // (the slope of the ground under the hubs, not of a wheel lifting at a step; a game bicycle's: he climbs what he
  // walks up, slower, and runs down it faster)
  const slope = clamp((front.ground - rear.ground) / (WHEELBASE * bu), -0.35, 0.35);
  // (stopped, his foot down holds it on a slope; in the air, nothing does)
  a -= 9.8 * k * slope * SLOPE * (down < 0.5 && settled(rear) && settled(front) ? 1 : 0);
  a -= AIR * v * vf / k;
  v += a * dt;
  // Rolling resistance (never past a standstill).
  const roll = onGround ? ROLL[ground] * k * dt : 0;
  v = v > 0 ? Math.max(0, v - roll) : Math.min(0, v + roll);
  // (paused by a card: a firm stop where he is; getting off, the camera or the phone up: a gentle one)
  const brake = !onGround ? 0 : paused ? 1 : leaving || handsOff ? BRAKE_OFF / BRAKE : fwd < -0.08 && v > 0.05 ? -fwd : 0;
  if (brake > 0 && v > 0) {
    if (!braked && v > 4.5 * k && !leaving && !paused) SFX.play('bikeBrake', clamp((v / k - 4) / 6, 0.2, 1));
    v = Math.max(0, v - BRAKE * k * brake * dt);
  }
  braked = brake > 0.4 && v > 0.3;
  // S held once stopped: walking it back slowly.
  backWait = !leaving && fwd < -0.25 && v <= 0.3 * k && settled(rear) && settled(front) ? backWait + dt : 0;
  if (backWait > 0.35) v += (-V_BACK * k * clamp(-fwd, 0, 1) - v) * damp(4, dt);
  else if (v < 0) v += (0 - v) * damp(6, dt);
  v = clamp(v, -V_BACK * k, V_MAX * k);

  // ── Steering: the front wheel turns, the heading follows (tight slowly, wide fast); the lean comes with it ──
  const sp = Math.abs(v);
  const most = sp < 0.3 ? STEER_MAX : Math.min(STEER_MAX, Math.atan((WHEELBASE * bu * LAT * k) / (sp * sp)));
  steer += (-side * most - steer) * damp(8, dt);
  const L = WHEELBASE * bu;
  // (in the air the bars turn it only half as well: no ground to turn on)
  let yawRate = ((v * Math.tan(steer)) / L) * (settled(front) ? 1 : 0.5);
  // Stopped (or held against something), A / D shuffle it round with his foot down: out of a corner.
  if (sp < 0.3 * k && Math.abs(side) > 0.3 && !handsOff && onGround) yawRate = -side * PIVOT;
  // Something low at his head's height ahead, or the children's sey circle: he slows to stop short of it.
  /** Held where he is by what is in the way (he puts his foot down, pedalling or not). */
  let held = false;
  if (v > 0.05 * k) {
    const room = roomAhead(ctx, Math.min(10 * k, (v * v) / (2 * BRAKE * k) + 2 * k));
    lastRoom = room;
    if (room < Infinity) {
      const cap = Math.sqrt(2 * BRAKE * k * Math.max(0, room - 0.1 * k));
      if (v > cap) v = cap;
      // (right up to it: he stops there and puts his foot down)
      if (cap < 0.35 * k) {
        v = 0;
        held = true;
        if (pedal > 0) say(ctx, aheadIs);
      }
    }
  }
  // (a step taller than a stair's riser it lifts onto only when he pedals or it rolls at it fast)
  lifting = pedal > 0 || v > LIFT_V * k;
  // (pushed back by a wall meanwhile: the step's turn is undone with it)
  const going = v;
  move(ctx, v * dt, yawRate * dt, dt);
  if (going > 0.05 && v === 0) held = true;

  // ── The wheels: up a step (eased, or a pop: the front, then the back), down one, off an edge, landing ──
  const popR = wheelStep(rear, dt, k);
  const popF = wheelStep(front, dt, k);
  if (popR || popF) {
    // (a pop up onto a step: the tyre's knock on its edge)
    if (clock >= bumpAt) {
      bumpAt = clock + 0.12;
      SFX.play('bikeBump', 0.35);
    }
    bump = Math.max(bump, 0.3);
  }
  // (the frame is stiff: up a stair or a step the back wheel comes up with the front past `PITCH_MAX`; off an edge in
  // the air he holds the front up, `DIP` under the back at most)
  const steep = L * Math.sin(PITCH_MAX);
  rear.hung = front.h - rear.h > steep;
  if (rear.hung) {
    rear.h = front.h - steep;
    rear.vy = Math.max(rear.vy, front.vy);
  }
  const dip = front.on ? steep : DIP * k;
  front.hung = rear.h - front.h > dip;
  if (front.hung) {
    front.h = rear.h - dip;
    front.vy = Math.max(front.vy, rear.vy);
  }
  // (in the air, his hat against a roof or a branch: the bicycle comes no higher, as he does jumping on foot)
  if ((!rear.on || !front.on) && ctx.world.ceilingAt) {
    const y = rear.h + (front.h - rear.h) * (-BIKE.rear / WHEELBASE);
    const over = y + HAT_TOP * k - ctx.world.ceilingAt(body.pos.x, body.pos.z, Math.min(rear.ground, front.ground) + CHEST_Y * k);
    if (over > 0) {
      rear.h = Math.max(rear.hold, rear.h - over);
      front.h = Math.max(front.hold, front.h - over);
      rear.vy = Math.min(rear.vy, 0);
      front.vy = Math.min(front.vy, 0);
    }
  }
  // A landing: a thud by how hard (the basket rattling, he sinks a little); a hard one shakes the pad, and costs a little speed.
  const landed = Math.max(rear.landed, front.landed);
  rear.landed = front.landed = 0;
  if (landed > 0.5 * k) {
    const hit = clamp(landed / (7 * k), 0.15, 1);
    if (clock >= bumpAt) {
      bumpAt = clock + 0.12;
      SFX.play('bikeBump', hit);
    }
    if (landed > SHAKE * k) {
      pad.rumble('land', clamp(landed / (16 * k), 0.3, 0.8));
      v *= 1 - clamp((landed / k - SHAKE) * 0.02, 0, 0.2);
    } else if (hit > 0.6) pad.rumble('tick', hit * 0.6);
    bump = Math.max(bump, hit);
  }
  body.pos.y = rear.h + (front.h - rear.h) * (-BIKE.rear / WHEELBASE);
  pitch += (Math.atan2(rear.h - front.h, L) - pitch) * damp(30, dt);
  bump *= Math.exp(-dt * 7);
  // (standing on the pedals: in the air, lifting onto a step)
  rise += ((!settled(rear) || !settled(front) || waiting ? 1 : 0) - rise) * damp(10, dt);
  body.grounded = true;
  body.vel.set(Math.sin(body.yaw) * v, 0, Math.cos(body.yaw) * v);

  // ── The foot down when stopped, walking it back, the lean ──
  const stopped = Math.abs(v) < 0.45 * k && (pedal === 0 || v < 0 || held) && settled(rear) && settled(front) && !waiting;
  down += ((stopped ? 1 : 0) - down) * damp(stopped ? 5 : 8, dt);
  // (walking it back, or shuffling it round: his left foot steps)
  const pivoting = sp < 0.3 * k && Math.abs(yawRate) > 0.1;
  back += ((v < -0.05 || pivoting ? 1 : 0) - back) * damp(5, dt);
  walk += ((Math.abs(Math.min(0, v)) + (pivoting ? 0.5 * k : 0)) * dt * Math.PI * 2) / (0.75 * k);
  const turnLean = clamp(Math.atan((v * yawRate) / (9.8 * k)), -LEAN_MAX, LEAN_MAX);
  // (his foot down — stopped, or walking it back — leans it to that side)
  const foot = Math.max(down, back);
  lean += (turnLean * (1 - foot) + STOP_LEAN * foot - lean) * damp(7, dt);
  effort += ((hard ? 1 : 0) - effort) * damp(4, dt);

  // ── The cranks turn with his pedalling; coasting (or standing on the pedals) they rest level; stopped, the right pedal comes up to push off ──
  const gear = BIKE.gear * bu;
  if (pedal > 0 && v > 0 && onGround) crank += (v / gear) * Math.PI * 2 * dt;
  else if (down > 0.5) crank += angleDiff(PARK_CRANK, crank) * damp(3, dt);
  else {
    const level = Math.round((crank - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
    crank += (level - crank) * damp(rise > 0.5 ? 8 : 3, dt);
  }
  wheel += (v * dt) / (BIKE.wheel * bu);

  // ── Sounds: the chain while he pedals, the freewheel while it coasts, the tyres on the ground ──
  const speed = Math.abs(v) / k;
  const cadence = pedal > 0 && v > 0.2 && onGround ? speed / (BIKE.gear * BODY_UNIT_M * 1.4) : 0;
  SFX.level('bikeChain', clamp(cadence / 2.4, 0, 1));
  SFX.level('bikeFree', cadence === 0 && v > 0.8 * k ? clamp(speed / 14, 0.05, 1) : 0);
  const tyres = ground === 'grass' ? 'bikeGrass' : ground === 'stone' ? 'bikeStone' : 'bikeDirt';
  if (lastSound && lastSound !== tyres) SFX.level(lastSound, 0);
  lastSound = tyres;
  SFX.level(tyres, onGround ? clamp(speed / 10, 0, 1) * (ground === 'water' ? 0.5 : 1) : 0);

  writePose(ctx, true);
  focus(ctx, dt);
  // (the keys: a few seconds after getting on, and whenever it stands)
  return { prompt: leaving || (clock - onAt > 5 && Math.abs(v) > 1.2 * k) ? null : rideText };
}

/** What the tyres roll on at the saddle point. */
function groundKind(w: RoamWorld, x: number, y: number, z: number): Ground {
  switch (stepSound(w, x, y, z)) {
    case 'stepGrass':
    case 'stepSnow':
      return 'grass';
    case 'stepStone':
    case 'stepWood':
      return 'stone';
    case 'stepSand':
      return 'sand';
    case 'stepWater':
      return 'water';
    default:
      return 'dirt';
  }
}

/** The posture's numbers and the bicycle's, from the ride (`carry`: the bicycle is where he is). */
function writePose(ctx: RoamCtx, carry: boolean): void {
  const b = ride!;
  ps.crank = crank;
  ps.steer = steer;
  ps.lean = lean;
  ps.pitch = pitch;
  ps.down = down;
  ps.back = back;
  ps.walk = walk;
  ps.effort = effort;
  ps.bump = bump;
  ps.rise = rise;
  ps.look = clamp(steer * 1.1, -0.45, 0.45);
  ps.t = clock;
  if (carry) {
    b.pos.copy(ctx.body.pos);
    b.yaw = ctx.body.yaw;
    b.moved = true;
  }
  b.lean = lean;
  b.pitch = pitch;
  b.turns.steer = steer;
  b.turns.crank = crank;
  b.turns.front = b.turns.rear = wheel;
  ctx.body.explorer.setMotion(0, true, 0);
}

/** The follow camera: behind the bicycle, a little further back and wider at speed. */
function focus(ctx: RoamCtx, dt: number): void {
  const { cam, body } = ctx;
  const k = sc(ctx);
  const fast = ease((Math.abs(v) / k - 3) / 8);
  camExtra += (2.6 * fast * k - camExtra) * damp(1.5, dt);
  cam.distance = clamp(camBase + camExtra, cam.minDistance, cam.maxDistance + 3);
  cam.focus.set(body.pos.x, body.pos.y + 1.9 * k, body.pos.z);
  cam.behindYaw = body.yaw;
  cam.fov = 50 + 5 * fast;
}

// ── Every frame: the bicycles drawn, the lamp ──────────────────────────────

function frame(f: MapFrame, mode: RoamMode): void {
  if (!things || !env) return;
  // (all of them, wherever the camera is — the free camera too: four bicycles are one draw, only the one moving is written)
  const scale = mode === 'overview' ? 1.4 : env.body.scale;
  for (const b of bikes) {
    if (!b.shown) continue;
    const ridden = b === ride;
    // (the dynamo: as bright as it turns, seen at dusk and night)
    if (ridden) b.turns.lamp = phase === 'ride' ? clamp(Math.abs(v) / 2.5, 0, 1) * clamp(f.night * 1.6 - 0.25, 0, 1) : 0;
    b.model.place(b.pos.x, b.pos.y, b.pos.z, b.yaw, b.lean, b.pitch, ridden ? scale : 1.4, b.turns);
    b.model.write();
  }
  // Each place's bicycles: drawn while one of them stands there, near enough; its bounds round them (no allocation).
  const cam = f.camera.position;
  for (const g of groups) {
    box.n = 0;
    box.x0 = box.y0 = box.z0 = Infinity;
    box.x1 = box.y1 = box.z1 = -Infinity;
    for (const b of g.bikes) if (b.shown) take(b.pos.x, b.pos.y, b.pos.z);
    for (const s of g.sale) if (s.m.shown) take(s.x, s.y, s.z);
    const mesh = g.things.mesh;
    const sphere = mesh.boundingSphere!;
    if (box.n) {
      sphere.center.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2 + 0.8, (box.z0 + box.z1) / 2);
      // (half its bounds' diagonal, and a bicycle's length and height round each one)
      sphere.radius = Math.sqrt((box.x1 - box.x0) ** 2 + (box.y1 - box.y0) ** 2 + (box.z1 - box.z0) ** 2) / 2 + 2.2;
    }
    mesh.visible = box.n > 0 && _gc.copy(sphere.center).distanceTo(cam) - sphere.radius < DRAW_FAR;
    g.things.flush(f.night);
  }
  // The lamp's pool of light on the road ahead.
  if (pool && poolMat) {
    const b = ride;
    const lit = b && phase === 'ride' ? b.turns.lamp : 0;
    pool.visible = lit > 0.02;
    if (b && pool.visible) {
      const k = scale / 1.4;
      const ahead = POOL_AHEAD * k;
      pool.position.set(b.pos.x + Math.sin(b.yaw) * ahead, b.pos.y + 0.06, b.pos.z + Math.cos(b.yaw) * ahead);
      pool.rotation.set(-Math.PI / 2, b.yaw + Math.PI + steer * 0.5, 0);
      pool.scale.set(POOL.w * k, POOL.l * k, 1);
      poolMat.opacity = 0.5 * lit;
    }
  }
}

// ── The add-on ─────────────────────────────────────────────────────────────

registerAddon({
  id: 'bike',
  get holding() {
    return phase !== 'off';
  },
  get handsBusy() {
    return phase !== 'off';
  },
  init(e) {
    env = e;
    // (his own bicycle from the page's URL, a check's: in the overview too)
    bikeOwnFromUrl(e.params);
    build(e);
  },
  offer(ctx, mode) {
    if (mode !== 'walk' || phase !== 'off' || !env || env.busy()) return null;
    const p = ctx.body.pos;
    const b = near(p.x, p.y, p.z, sc(ctx));
    if (!b) return null;
    prompts();
    return his(b) ? offerText : b.role === 'hire' ? hireText : neighbourText;
  },
  use(ctx) {
    const e = env;
    const p = ctx.body.pos;
    const b = near(p.x, p.y, p.z, sc(ctx));
    if (!b || !e) return;
    if (b.role === 'neighbour') {
      // (not his: the neighbour calls out, a different line each time)
      ctx.hud.toast(t(NEIGHBOUR_SAYS[neighbourSay]));
      neighbourSay = (neighbourSay + 1) % NEIGHBOUR_SAYS.length;
      return;
    }
    if (b.role === 'hire' && !hired) {
      if (!e.purse.pay(HIRE_PRICE)) {
        ctx.hud.toast(t('bikeHireShort', { riel: riel(HIRE_PRICE) }));
        return;
      }
      hired = true;
      ctx.sound('coin', 1);
      pad.rumble('tick');
      bagNotify.update('purse');
      ctx.hud.toast(t('bikeHired'));
    }
    start(ctx, b);
  },
  hold,
  keys: () => KEYS,
  frame,
  after(ctx) {
    // A hired bicycle he has left (and walked off from) goes back to its place: the hire is over.
    const b = hireBike;
    if (!hired || !b || !env || ride === b) return;
    const p = ctx.body.pos;
    if ((p.x - b.pos.x) ** 2 + (p.z - b.pos.z) ** 2 < HIRE_BACK * HIRE_BACK) return;
    hired = false;
    if (b.moved) ctx.hud.toast(t('bikeHireBack'));
    home(b, env.world);
  },
  setMode(next, _prev, ctx) {
    roamMode = next;
    if (next !== 'walk') stop(ctx);
    // Back to the map: the hire and the neighbours' bicycles go back to their places (his own stays where it is), the hire is over.
    if (next === 'overview' && env) {
      for (const b of bikes) if (b.role !== 'own') home(b, env.world);
      hired = false;
    }
  },
  fromUrl(q, ctx) {
    if (!env) return;
    // His own bicycle and where it stands (`bikeown=`, `bikeownat=`: _bikeOwn.ts; the change comes back through `ownChanged`).
    bikeOwnFromUrl(q);
    if (q.get('bikehire') === '1') hired = true;
    // A bicycle left away from its place: `bikeleft=<spot>:x:z:yaw(deg),…`.
    for (const part of (q.get('bikeleft') ?? '').split(',').filter(Boolean)) {
      const [id, x, z, yaw] = part.split(':');
      const b = bikes.find((o) => o.spot && o.id === id);
      if (!b || ![x, z, yaw].every((s) => Number.isFinite(Number(s)))) continue;
      b.pos.set(Number(x), groundUnder(env.world, Number(x), Number(z)), Number(z));
      b.yaw = (Number(yaw) * Math.PI) / 180;
      park(b);
      b.moved = true;
    }
    // On a bicycle at `at=` (his own comes to him if he has one, else the nearest), rolling at `bike=ride:<m/s>`.
    const m = /^ride(?::(-?[\d.]+))?$/.exec(q.get('bike') ?? '');
    if (m && phase === 'off' && roamMode === 'walk') {
      const p = ctx.body.pos;
      let best = bikes[0];
      for (const b of bikes) if (b.shown && b.pos.distanceToSquared(p) < best.pos.distanceToSquared(p)) best = b;
      if (own?.shown) best = own;
      // (a check's ride on the hire bicycle: it is hired)
      if (best.role === 'hire') hired = true;
      start(ctx, best, true);
      v = Number(m[1] ?? 0) * sc(ctx);
      if (Math.abs(v) > 0.45) down = 0;
      writePose(ctx, true);
    }
  },
  report() {
    const out: Record<string, string> = {};
    if (phase === 'ride' || phase === 'mount') out.bike = Math.abs(v) > 0.05 ? `ride:${v.toFixed(1)}` : 'ride';
    const deg = (y: number) => (((y * 180) / Math.PI) % 360).toFixed(0);
    const left = bikes
      // (the one he is getting off is on its stand already; his own goes by `bikeownat`)
      .filter((b) => b.spot && b.moved && (b !== ride || phase === 'dismount'))
      .map((b) => `${b.id}:${b.pos.x.toFixed(1)}:${b.pos.z.toFixed(1)}:${deg(b.yaw)}`);
    if (left.length) out.bikeleft = left.join(',');
    if (BIKE_OWN.kind && own) {
      out.bikeown = BIKE_OWN.colour === kindOf(BIKE_OWN.kind).colour ? BIKE_OWN.kind : `${BIKE_OWN.kind}:${BIKE_OWN.colour}`;
      // (ridden now: where it is, and `bike=ride` puts him back on it)
      out.bikeownat = `${own.pos.x.toFixed(1)}:${own.pos.z.toFixed(1)}:${deg(own.yaw)}:${own.pos.y.toFixed(2)}`;
    }
    if (hired) out.bikehire = '1';
    return Object.keys(out).length ? out : null;
  },
});

/** Checks (the console, a probe): where each bicycle is, and the ride. */
export function bikeDebug(): unknown {
  return {
    phase,
    ahead: lastRoom === Infinity ? null : { room: +lastRoom.toFixed(2), what: aheadIs },
    v: +v.toFixed(2),
    steer: +steer.toFixed(3),
    lean: +lean.toFixed(3),
    down: +down.toFixed(2),
    lamp: ride ? +ride.turns.lamp.toFixed(2) : 0,
    pool: pool ? { shown: pool.visible, opacity: +(poolMat?.opacity ?? 0).toFixed(2), at: [pool.position.x, pool.position.y, pool.position.z].map((n) => +n.toFixed(1)) } : null,
    probes: [...probeY].map((g) => +g.toFixed(2)),
    // (each wheel: the tyre's bottom, what holds it up, the ground under its hub, on the ground; the frame's pitch)
    wheels: [rear, front].map((wh) => ({ h: +wh.h.toFixed(3), hold: +wh.hold.toFixed(3), ground: +wh.ground.toFixed(3), on: wh.on })),
    pitch: +pitch.toFixed(3),
    air: !rear.on && !front.on,
    rise: +rise.toFixed(2),
    waiting,
    block: lastBlock,
    riding: ride?.id ?? null,
    hired,
    own: BIKE_OWN.kind ? { kind: BIKE_OWN.kind, colour: BIKE_OWN.colour, at: [+BIKE_OWN.x.toFixed(2), +BIKE_OWN.z.toFixed(2), +((BIKE_OWN.yaw * 180) / Math.PI).toFixed(1)] } : null,
    bikes: bikes.map((b) => ({ id: b.id, role: b.role, x: +b.pos.x.toFixed(2), y: +b.pos.y.toFixed(2), z: +b.pos.z.toFixed(2), yaw: +((b.yaw * 180) / Math.PI).toFixed(1), shown: b.model.shown, look: `${b.model.look.kind}:${b.model.look.colour}` })),
    forSale: forSale.map((m) => `${m.look.kind}:${m.look.colour}`),
  };
}
