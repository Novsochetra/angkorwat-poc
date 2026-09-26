import { BufferGeometry, CanvasTexture, Group, Mesh, MeshBasicMaterial, SphereGeometry, Sprite, SpriteMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { traceSource } from '../../feedback/sourceTrace';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { MapFrame } from '../types';
import { buddhaStatue, type BuddhaKindName } from '../sacred/buddha';
import { SACRED_LAMPS, type PALETTES } from '../sacred/finish';
import { candleLamp, offering, type OfferingKind, type OfferingOptionsByKind } from '../sacred/offerings';
import { trackSacred } from '../sacred/pending';
import type { SacredSet } from '../sacred/set';
import { CandleGlow } from './_ruin';
import type { Mason } from './_sanctuaryMason';

/**
 * The Buddha shrines people keep in the old temples today: a seated Buddha
 * (gilt, sandstone or bronze, a saffron cloth over his shoulder) on a stone
 * pedestal, a low step before him with candles, an urn of incense sticks
 * and lotus in brass vases, sometimes a marigold garland, bay sei and a
 * pair of tiered parasols. The statue and the offerings are sculpted
 * (sacred/); the pedestal and its step are blocks of the temple's own
 * stone (solid: walked round, never through), built by each temple in
 * world metres. Used at Angkor Wat's main gate (below), in the Bayon's
 * central sanctum (overlook.ts) and in Preah Khan's gate (shrine.ts),
 * where the explorer kneels (roam/_worship.ts).
 *
 * Hidden blocks (never drawn, `hiddenSolid`) round the statue keep the
 * explorer from climbing the pedestal and walking into him.
 */

type V3 = [number, number, number];

/** One offering: its kind, where it stands in the shrine's frame (m), its options; `turn` about y (radians). */
export type Offer = { [K in OfferingKind]: { kind: K; at: V3; opts?: OfferingOptionsByKind[K]; turn?: number } }[OfferingKind];

export interface ShrineSpec {
  /**
   * The middle of the pedestal's top under the Buddha (m, world): the
   * shrine's frame starts here, +z toward the worshipper, y up.
   */
  at: V3;
  /** Which way he faces (radians about y; 0 = +z). */
  facing?: number;
  buddha: { kind: BuddhaKindName; look: keyof typeof PALETTES; height: number };
  /** Sizes the offerings (1 = true size; the roaming explorer is 1.4 × his). Parasols go by their `height`, garlands by their ends. */
  scale: number;
  offerings: Offer[];
}

/** What a shrine lights: its candle flames and the tips of its incense (m, world). */
export interface ShrineOut {
  flames: Vector3[];
  embers: Vector3[];
}

/** Runs `make` just after the build (a task of its own); shots wait for it (sacred/pending.ts). */
function later(make: () => void): void {
  void trackSacred(
    new Promise<void>((done) =>
      setTimeout(() => {
        try {
          make();
        } finally {
          done();
        }
      }, 0),
    ),
  );
}

/**
 * Places the Buddha (sculpted in a worker) and, just after the build, the
 * offerings one by one (the first of each kind is sculpted then, off the
 * part's build time), each candle's lamp on the statues (SACRED_LAMPS);
 * then lights `glow` with their flames and incense tips.
 */
export function peoplesShrine(sacred: SacredSet, s: ShrineSpec, glow: AltarGlow): void {
  const turn = s.facing ?? 0;
  const [c, n] = [Math.cos(turn), Math.sin(turn)];
  const world = (x: number, y: number, z: number) => new Vector3(s.at[0] + x * c + z * n, s.at[1] + y, s.at[2] - x * n + z * c);
  const out: ShrineOut = { flames: [], embers: [] };

  const buddha = sacred.add(buddhaStatue({ kind: s.buddha.kind, look: s.buddha.look, height: s.buddha.height, hide: 120 }));
  buddha.position.copy(world(0, 0, 0));
  buddha.rotation.y = turn;

  for (const o of s.offerings)
    later(() => {
      const own = o.kind === 'parasol' || o.kind === 'marigold';
      const opts = { ...o.opts, scale: (o.opts?.scale ?? 1) * (own ? 1 : s.scale) };
      const p = offering(o.kind, opts as never);
      p.object.position.copy(world(...o.at));
      p.object.rotation.y = turn + (o.turn ?? 0);
      sacred.add(p.object);
      p.object.updateMatrixWorld(true);
      for (const f of p.flames) {
        const w = p.object.localToWorld(f.clone());
        SACRED_LAMPS.push(candleLamp(w));
        out.flames.push(w);
      }
      for (const e of p.embers) out.embers.push(p.object.localToWorld(e.clone()));
    });
  later(() => glow.light(out));
}

/** Puffs in the thread of smoke over an urn of incense, and how long each lives (s). */
const PUFFS = 7;
const PUFF_LIFE = 6.5;

/** A soft round spot (the smoke's puffs). */
function softDot(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}
let dot: CanvasTexture | null = null;

/**
 * The shrine's small lights and its smoke: a bright core in every candle
 * flame and on every incense tip, brighter than white at night so they
 * bloom (by day the sculpted flame shows as it is), a soft halo over the
 * candles at night (`CandleGlow`, no flames of its own), and a thin thread
 * of incense smoke rising from the sticks, swaying and fading. Lit once
 * the offerings are placed (`peoplesShrine`).
 */
export class AltarGlow {
  readonly object = new Group();
  private readonly flame = new MeshBasicMaterial({ color: 0xffffff });
  private readonly ember = new MeshBasicMaterial({ color: 0xffffff });
  private readonly puffs: { s: Sprite; m: SpriteMaterial; from: Vector3; phase: number }[] = [];
  private halos: CandleGlow | null = null;

  constructor(
    private readonly o: {
      seed: number;
      /** The offerings' scale (sizes the flames' cores). */
      scale: number;
      /** The halo: its middle from the candles' middle (m, world axes), its size (m). */
      halo: { off: V3; size: number };
    },
  ) {
    this.object.name = 'shrine:glow';
  }

  /** Adds the cores and the halo, at the flames and tips the offerings have (world m). */
  light(lit: ShrineOut): void {
    const k = this.o.scale;
    const dots = (at: Vector3[], r: number, stretch: number): BufferGeometry | null =>
      at.length ? mergeGeometries(at.map((p) => new SphereGeometry(r, 8, 6).scale(1, stretch, 1).translate(p.x, p.y, p.z))) : null;
    for (const [g, m, name] of [
      [dots(lit.flames, 0.006 * k, 1.9), this.flame, 'shrine:flames'],
      [dots(lit.embers, 0.0035 * k, 1), this.ember, 'shrine:embers'],
    ] as const) {
      if (!g) continue;
      const mesh = new Mesh(g, m);
      mesh.name = name;
      mesh.raycast = () => {};
      this.object.add(mesh);
    }
    // The smoke rises from the middle of the sticks' tips.
    if (lit.embers.length) {
      const map = (dot ??= softDot());
      const from = lit.embers.reduce((a, p) => a.add(p), new Vector3()).divideScalar(lit.embers.length);
      for (let i = 0; i < PUFFS; i++) {
        const m = new SpriteMaterial({ map, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0 });
        const s = new Sprite(m);
        s.name = 'shrine:smoke';
        s.raycast = () => {};
        s.renderOrder = 3;
        this.puffs.push({ s, m, from, phase: i / PUFFS });
        this.object.add(s);
      }
    }
    if (!lit.flames.length) return;
    const mid = lit.flames.reduce((a, p) => a.add(p), new Vector3()).divideScalar(lit.flames.length);
    const [dx, dy, dz] = this.o.halo.off;
    this.halos = new CandleGlow([], [{ at: [mid.x + dx, mid.y + dy, mid.z + dz], size: this.o.halo.size }], { day: 0.2, night: 1.6, halo: 0.22, seed: this.o.seed });
    this.object.add(this.halos.object);
  }

  update(f: MapFrame): void {
    const n = f.night;
    const seed = this.o.seed;
    const flicker = 1 + 0.07 * Math.sin(f.t * 1.9 + seed) + 0.04 * Math.sin(f.t * 3.3 + seed * 1.7);
    this.flame.color.setRGB(1, 0.8, 0.5).multiplyScalar((0.8 + 2.6 * n) * flicker);
    this.ember.color.setRGB(1, 0.3, 0.08).multiplyScalar(0.9 + 3 * n);
    this.halos?.update(f);
    // Each puff rises 1.4 m over its life, sways, spreads and fades; pale grey by day, dim at night.
    const w = f.weather.wind;
    for (const { s, m, from, phase } of this.puffs) {
      const a = (f.t / PUFF_LIFE + phase) % 1;
      const sway = Math.sin(f.t * 0.8 + phase * 9 + seed) * 0.08 + Math.sin(f.t * 2.1 + phase * 5) * 0.025;
      s.position.set(from.x + sway * a + w * 0.6 * a * a, from.y + 0.02 + 1.4 * a, from.z + Math.cos(f.t * 0.6 + phase * 7) * 0.05 * a);
      s.scale.setScalar(0.04 + 0.34 * a);
      m.opacity = 0.42 * Math.min(1, a / 0.1) * (1 - a) * (1 - a);
      m.color.setRGB(0.78 - 0.62 * n, 0.76 - 0.62 * n, 0.74 - 0.6 * n);
    }
  }
}

/**
 * A cloth laid over an offering step (world metres, the step facing +z):
 * over its top from `z0` to its front `z1`, down the front to a hand
 * above the floor `floor`, a gold hem along its foot. Returns the cloth's
 * top (the offerings stand on it).
 */
export function stepCloth(b: VoxelBuilder, src: ReturnType<typeof traceSource>, x: number, half: number, z0: number, z1: number, top: number, floor: number, color: number): number {
  const t = 0.02;
  b.span(x - half, top, z0, x + half, top + t, z1 + t, color, 'mapStone', { src });
  b.span(x - half, floor + 0.06, z1, x + half, top, z1 + t, color, 'mapStone', { src, shade: 0.92 });
  b.span(x - half, floor + 0.04, z1 - 0.002, x + half, floor + 0.09, z1 + t + 0.006, 0xc9993c, 'brass', { src });
  return top + t;
}

/** Hidden blocks: in the walk map (roam/walkmap.ts), never drawn, never picked. */
export function hiddenSolid(b: VoxelBuilder, name: string): Group {
  const solid = buildVoxelMesh(b, { quality: 'low', name, castShadow: false, receiveShadow: false });
  solid.visible = false;
  solid.traverse((o) => (o.raycast = () => {}));
  return solid;
}

// ── Angkor Wat: the Buddha in the main gate ──────────────────────────────

/** The main gate's lit door (sanctuary.ts `gopura` at z −174), and where it moves to: the alcove before it is the shrine's. */
const GATE = { floor: 58, doorZ: -169, wallZ: -170, newWall: -173, rows: 5 };

/**
 * Angkor Wat's main gate: a gilt Buddha on a sandstone pedestal in the
 * passage mouth, where the explorer kneels on the road's axis, the lit
 * doorway moved three blocks back so it glows behind him; candles,
 * incense and lotus on the step before him (a red cloth over it), bay sei
 * either side of him, two white parasols. Call after the gate is built, before the mason's
 * commit; `glow` lights its candles.
 */
export function mainGateShrine(m: Mason, b: VoxelBuilder, hidden: VoxelBuilder, sacred: SacredSet, glow: AltarGlow): void {
  m.src = traceSource();
  const src = m.src;
  const F = GATE.floor;
  // The lit door three blocks further in, the dark wall behind it with it.
  for (let x = -1; x <= 1; x++)
    for (let r = 0; r < GATE.rows; r++) {
      m.clear(x, F + r, GATE.wallZ);
      m.put(x, F + r, GATE.newWall, 'void');
    }
  const door = m.glows.find((g) => g.kind === 'door' && g.x === 0 && g.z === GATE.doorZ);
  if (door) Object.assign(door, { z: GATE.newWall + 0.7, kind: 'shrine' });

  // The pedestal: a moulded base, the block, a slab on top; the offering step before it.
  const zb = -170.6;
  const top = F + 0.85;
  const stone = (x: number, y: number, z: number, t: 'face' | 'ledge') => m.color(t, x, y, z);
  const span = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t: 'face' | 'ledge', shade = 1) =>
    b.span(x0, y0, z0, x1, y1, z1, stone(Math.round(x0 * 4), Math.round(y0 * 4), Math.round(z0 * 4), t), 'mapStone', { src, shade });
  span(-0.92, F, zb - 0.58, 0.92, F + 0.14, zb + 0.58, 'ledge', 0.95);
  span(-0.86, F + 0.14, zb - 0.52, 0.86, top - 0.1, zb + 0.52, 'face');
  span(-0.9, top - 0.1, zb - 0.56, 0.9, top, zb + 0.56, 'ledge');
  const stepZ = zb + 0.52;
  span(-0.8, F, stepZ, 0.8, F + 0.34, stepZ + 0.5, 'ledge', 0.97);
  const stepTop = stepCloth(b, src, 0, 0.74, stepZ + 0.02, stepZ + 0.5, F + 0.34, F, 0x8e2218);

  // Hidden: the alcove from the step's front back to the lit door, wall to wall (he kneels
  // before the shrine, never climbs it or squeezes by the parasols).
  hidden.span(-1.5, F, GATE.newWall + 0.5, 1.5, F + 3, stepZ + 0.5, 0x808080, 'mapStone', { src });

  const S = 1.3;
  const low = stepTop - top;
  const front = stepZ + 0.26 - zb;
  const shrine: ShrineSpec = {
    at: [0, top, zb],
    buddha: { kind: 'shrine', look: 'gilt', height: 1.5 },
    scale: S,
    offerings: [
      { kind: 'lotusVase', at: [-0.52, low, front], turn: 0.8 },
      { kind: 'candle', at: [-0.24, low, front + 0.08] },
      { kind: 'incense', at: [0, low, front] },
      { kind: 'candle', at: [0.24, low, front + 0.08] },
      { kind: 'lotusVase', at: [0.52, low, front], turn: -0.8 },
      { kind: 'baySei', at: [-0.72, 0, 0.26] },
      { kind: 'baySei', at: [0.72, 0, 0.26], turn: 1.3 },
      { kind: 'marigold', at: [0, -0.03, 0.57], opts: { from: [-0.86, 0, 0], to: [0.86, 0, 0], sag: 0.16 } },
      { kind: 'parasol', at: [-1.02, F - top, -0.78], opts: { height: 2.5 } },
      { kind: 'parasol', at: [1.02, F - top, -0.78], opts: { height: 2.5 } },
    ],
  };
  peoplesShrine(sacred, shrine, glow);
}
