import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from 'three';
import { addBody } from './_buddhaBody';
import type { HeadStyle, Mudra, Throne } from './_buddhaFrame';
import { addHead } from './_buddhaHead';
import { addReclining } from './_buddhaReclining';
import { addThrone } from './_buddhaThrone';
import { SacredLod } from './_detail';
import { dress, PALETTES, statueMaterial, type Palette } from './finish';
import { trackSacred } from './pending';
import { meshSculpt, Sculpt, type MeshOptions, type SculptMesh } from './sculpt';
import type { SculptJob, SculptResult } from './sculptWorker';

/**
 * Seated Buddha statues, sculpted (not blocks): a smooth figure with a face,
 * hands in the mudra, a robe and a throne, in gilt, sandstone or bronze
 * (finish.ts). The head, body and throne are sculpted apart
 * (_buddhaHead.ts, _buddhaBody.ts, _buddhaThrone.ts) on the measures of
 * _buddhaFrame.ts. Every one is Khmer: the Angkorian face, a conical
 * ushnisha with a lotus bud on it (never the Thai flame).
 *
 *   buddhaStatue({ kind: 'pagoda', look: 'gilt', height: 2.4 })
 *
 * gives an Object3D standing on y = 0 at its origin, facing +z, `height` m
 * tall from the throne's foot to the tip of the lotus bud: turn and place
 * it. Its shape is sculpted once per kind and detail and shared.
 *
 * The reclining Buddha (kind `reclining`, _buddhaReclining.ts: Preah Ang
 * Thom of Phnom Kulen) lies along x on his right side, his head at −x, on
 * y = 0, facing +z, his middle at the origin; size him by `length` (the
 * bud on his head to his soles) instead of `height`.
 */

/** A seated Buddha: the hands in a mudra, on a throne. */
export interface SeatedKind {
  pose?: undefined;
  mudra: Mudra;
  head: HeadStyle;
  throne: Throne;
  /** A saffron cloth the people draped over his left shoulder. */
  sash?: boolean;
}

/** A reclining Buddha (_buddhaReclining.ts): on his right side, the head on his right hand. */
export interface RecliningKind {
  pose: 'reclining';
  head: HeadStyle;
  /** The people's saffron cloth across his chest. */
  sash?: boolean;
  /** Gold leaf the pilgrims pressed onto his soles (region `leaf`). */
  leaf?: boolean;
}

export type BuddhaKind = SeatedKind | RecliningKind;

export const BUDDHA_KINDS = {
  /** The pagoda's main Buddha: calling the earth to witness, on a lotus. */
  pagoda: { mudra: 'earth', head: 'pagoda', throne: 'lotus' },
  /** A pagoda Buddha in meditation (the smaller ones on the altar's steps). */
  meditate: { mudra: 'meditate', head: 'pagoda', throne: 'lotus' },
  /** A small shrine's Buddha, a saffron cloth over his shoulder. */
  shrine: { mudra: 'earth', head: 'pagoda', throne: 'lotus', sash: true },
  /** The Angkor naga Buddha: meditating on the serpent's coils under its seven heads. */
  naga: { mudra: 'meditate', head: 'angkor', throne: 'naga' },
  /** The naga Buddha with a saffron cloth (the forest Buddha the people keep). */
  nagaSash: { mudra: 'meditate', head: 'angkor', throne: 'naga', sash: true },
  /** The reclining Buddha of Phnom Kulen (Preah Ang Thom): a saffron cloth across his chest, gold leaf on his soles. */
  reclining: { pose: 'reclining', head: 'pagoda', sash: true, leaf: true },
} satisfies Record<string, BuddhaKind>;

export type BuddhaKindName = keyof typeof BUDDHA_KINDS;

/**
 * The reclining Buddha of Phnom Kulen's look: sandstone, as carved out of
 * the boulder — the skin a little paler (smoothed by the pilgrims' hands),
 * the robe a little darker and its hems darker still, so the robe reads —,
 * the gold leaf the pilgrims pressed onto his soles, and the saffron cloth
 * (`sash`).
 */
export const KULEN_STONE: Palette = {
  ...PALETTES.sandstone,
  skin: { color: 0xc2a687, metal: 0, rough: 0.86, grain: 0.8 },
  robe: { color: 0xa98c6c, metal: 0, rough: 0.93, grain: 0.9 },
  hem: { color: 0x9a7e60, metal: 0, rough: 0.93, grain: 0.9 },
  leaf: { color: 0xe3b24e, metal: 0.9, rough: 0.28, grain: 0.35 },
};

/**
 * Grid cells (m, at the reference size, about 1 m tall) for each detail:
 * `near` for up close (inside a pagoda) — the face and hands (the sculpt's
 * fine zones) on the fine grid —, `far` past ~15 m (its face on a finer
 * grid too: on the coarse one the nose turns to a spike and the lips to a
 * blob), then by its size on screen past 30 m (_detail.ts): `mid` (≈ 11 k
 * triangles, not 50 k) once its cells span under 1.2 px (under ≈ 40 px
 * tall), `coarse` (≈ 2–3 k, no fine zones; it also casts the still
 * shadows) once its cells do (under ≈ 25 px).
 */
const FAR = { cell: 0.016, fineCell: 0.0055 };
export const BUDDHA_CELLS: Record<'near' | 'far' | 'mid' | 'coarse', MeshOptions> = {
  near: { cell: 0.008, fineCell: 0.0035 },
  far: FAR,
  // (shaded as the far one is: sculpt.ts `occlusionAs`)
  mid: { cell: 0.03, fineCell: 0.011, occlusionAs: FAR },
  coarse: { cell: 0.05, occlusionAs: FAR },
};
export type Detail = keyof typeof BUDDHA_CELLS;

interface Sculpted {
  mesh: SculptMesh;
  /** Height from the throne's foot to the top (m, reference size). */
  height: number;
  /** Length along x (m, reference size): a reclining Buddha's, head to soles. */
  length: number;
}

const cache = new Map<string, Sculpted>();

/** The Buddha of `kind` as a sculpt, its foot at y = 0 (reference size). */
export function buddhaSculpt(kind: BuddhaKind): { sculpt: Sculpt; foot: number } {
  const s = new Sculpt();
  if (kind.pose === 'reclining') {
    addReclining(s, { head: kind.head, sash: !!kind.sash, leaf: !!kind.leaf });
    return { sculpt: s, foot: 0 };
  }
  const foot = addThrone(s, kind.throne);
  addBody(s, { mudra: kind.mudra, sash: !!kind.sash });
  addHead(s, kind.head);
  return { sculpt: s, foot };
}

const keyOf = (kind: BuddhaKind, detail: Detail) =>
  kind.pose === 'reclining' ? `reclining/${kind.head}/${kind.sash ? 1 : 0}/${kind.leaf ? 1 : 0}/${detail}` : `${kind.mudra}/${kind.head}/${kind.throne}/${kind.sash ? 1 : 0}/${detail}`;

/** The mesh's height and length (m, reference size) from its bounding box. */
const sizeOf = (g: BufferGeometry) => ({ height: g.boundingBox!.max.y, length: g.boundingBox!.max.x - g.boundingBox!.min.x });

/** The Buddha's mesh at a detail (sculpted on first use, then shared). */
export function buddhaMesh(kind: BuddhaKind, detail: Detail = 'near'): Sculpted {
  const key = keyOf(kind, detail);
  let got = cache.get(key);
  if (!got) {
    const { sculpt, foot } = buddhaSculpt(kind);
    const mesh = meshSculpt(sculpt, BUDDHA_CELLS[detail]);
    mesh.geometry.translate(0, foot, 0);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    got = { mesh, ...sizeOf(mesh.geometry) };
    cache.set(key, got);
    console.info(`[sacred] buddha ${key}: ${(mesh.geometry.getIndex()!.count / 3) | 0} triangles in ${mesh.ms.toFixed(0)} ms`);
  }
  return got;
}

// ── Sculpting off the main thread ─────────────────────────────────────────

const workers: { w: Worker; jobs: number }[] = [];
const waiting = new Map<number, (r: SculptResult) => void>();
let nextJob = 1;
const later = new Map<string, Promise<Sculpted>>();

/** The least busy of a few sculpting workers (made on first use). */
function sculptor(): { w: Worker; jobs: number } | null {
  if (typeof Worker === 'undefined') return null;
  const max = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 2));
  if (workers.length < max) {
    try {
      const w = new Worker(new URL('./sculptWorker.ts', import.meta.url), { type: 'module' });
      const it = { w, jobs: 0 };
      w.onmessage = (e: MessageEvent<SculptResult>) => {
        it.jobs--;
        waiting.get(e.data.id)?.(e.data);
        waiting.delete(e.data.id);
      };
      workers.push(it);
    } catch {
      if (!workers.length) return null;
    }
  }
  return workers.reduce((a, b) => (b.jobs < a.jobs ? b : a));
}

/**
 * The Buddha's mesh at a detail, sculpted in a worker (the main thread
 * keeps drawing). Falls back to `buddhaMesh` where workers are missing.
 */
export function buddhaMeshAsync(kind: BuddhaKind, detail: Detail): Promise<Sculpted> {
  const key = keyOf(kind, detail);
  const done = cache.get(key);
  if (done) return Promise.resolve(done);
  let p = later.get(key);
  if (p) return p;
  const it = sculptor();
  if (!it) p = Promise.resolve().then(() => buddhaMesh(kind, detail));
  else {
    const id = nextJob++;
    it.jobs++;
    p = new Promise<Sculpted>((resolve) => {
      waiting.set(id, (r) => {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(r.position, 3));
        geometry.setAttribute('normal', new BufferAttribute(r.normal, 3));
        geometry.setAttribute('region', new BufferAttribute(r.region, 1));
        geometry.setAttribute('paint', new BufferAttribute(r.paint, 1));
        geometry.setAttribute('paintW', new BufferAttribute(r.paintW, 1));
        geometry.setAttribute('occlusion', new BufferAttribute(r.occlusion, 1));
        geometry.setIndex(new BufferAttribute(r.index, 1));
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const got: Sculpted = { mesh: { geometry, regions: r.regions, ms: r.ms }, ...sizeOf(geometry) };
        cache.set(key, got);
        console.info(`[sacred] buddha ${key}: ${(r.index.length / 3) | 0} triangles in ${r.ms.toFixed(0)} ms (worker)`);
        resolve(got);
      });
      it.w.postMessage({ id, kind, detail } satisfies SculptJob);
    });
  }
  later.set(key, p);
  return trackSacred(p);
}

export interface StatueOptions {
  kind: BuddhaKindName | BuddhaKind;
  /** A palette or one of finish.ts `PALETTES`. */
  look: keyof typeof PALETTES | Palette;
  /** Height from the throne's foot to the top of the lotus bud (m). */
  height?: number;
  /** Length along x (m) instead of the height: a reclining Buddha's, head to soles. */
  length?: number;
  /** Up to this distance (m) the near mesh shows, the far one beyond it (then by its size on screen: _detail.ts); none past `hide`. */
  near?: number;
  hide?: number;
  /** Never the near mesh (small statues seen from afar, or far corners). */
  farOnly?: boolean;
}

/**
 * A Buddha statue: an Object3D on y = 0, facing +z, `height` m tall (see
 * the file's note). Its meshes are sculpted in a worker and appear when
 * ready: the coarse one at once (it also casts the still shadows), each
 * finer one when the camera first comes near enough to want it (most
 * statues are only seen from afar: _detail.ts); `sync` sculpts each here,
 * all now (the preview).
 */
export function buddhaStatue(o: StatueOptions & { sync?: boolean }): Object3D {
  const kind = typeof o.kind === 'string' ? BUDDHA_KINDS[o.kind] : o.kind;
  const palette = typeof o.look === 'string' ? PALETTES[o.look] : o.look;
  /** Sculpt units to metres: the statue's size over its sculpt's (the same for every level, to a cell). */
  const unitOf = (s: Sculpted) => (o.length !== undefined ? o.length / s.length : (o.height ?? 1) / s.height);
  const make = (lod: SacredLod, s: Sculpted) => {
    const m = new Mesh(dress(s.mesh, palette), statueMaterial());
    m.name = 'buddha';
    m.scale.setScalar(unitOf(s));
    m.castShadow = true;
    m.receiveShadow = true;
    if (lod.unit === 1) lod.unit = unitOf(s);
    return m;
  };
  const details: Detail[] = o.farOnly ? ['far', 'mid', 'coarse'] : ['near', 'far', 'mid', 'coarse'];
  return new SacredLod(
    'buddha',
    details.map((detail) => ({
      name: detail,
      // (the far mesh takes over from the near one past `near` m, as it always did)
      cell: detail === 'far' || detail === 'near' ? 0 : BUDDHA_CELLS[detail].cell,
      load: (lod: SacredLod) => (o.sync ? make(lod, buddhaMesh(kind, detail)) : buddhaMeshAsync(kind, detail).then((s) => make(lod, s))),
    })),
    {
      near: o.farOnly ? 0 : (o.near ?? Math.max(12, (o.height ?? o.length ?? 1) * 8)),
      hide: o.hide ?? 160,
      size: o.length ?? o.height ?? 1,
      // (the preview draws its shadows live: no stand-in)
      caster: o.sync ? undefined : details.length - 1,
      eager: o.sync,
    },
  );
}
