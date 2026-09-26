import { BufferAttribute, BufferGeometry, Group, LOD, Mesh, Object3D, Vector3 } from 'three';
import { addBody } from './_buddhaBody';
import type { HeadStyle, Mudra, Throne } from './_buddhaFrame';
import { addHead } from './_buddhaHead';
import { addThrone } from './_buddhaThrone';
import { dress, PALETTES, statueMaterial, type Palette } from './finish';
import { trackSacred } from './pending';
import { meshSculpt, Sculpt, type SculptMesh } from './sculpt';
import type { SculptJob, SculptResult } from './sculptWorker';

/**
 * Seated Buddha statues, sculpted (not blocks): a smooth figure with a face,
 * hands in the mudra, a robe and a throne, in gilt, sandstone or bronze
 * (finish.ts). The head, body and throne are sculpted apart
 * (_buddhaHead.ts, _buddhaBody.ts, _buddhaThrone.ts) on the measures of
 * _buddhaFrame.ts.
 *
 *   buddhaStatue({ kind: 'pagoda', look: 'gilt', height: 2.4 })
 *
 * gives an Object3D standing on y = 0 at its origin, facing +z, `height` m
 * tall from the throne's foot to the flame's tip: turn and place it. Its
 * shape is sculpted once per kind and detail and shared.
 */

export interface BuddhaKind {
  mudra: Mudra;
  head: HeadStyle;
  throne: Throne;
  /** A saffron cloth the people draped over his left shoulder. */
  sash?: boolean;
}

export const BUDDHA_KINDS = {
  /** The pagoda's main Buddha: calling the earth to witness, flame on the head, on a lotus. */
  pagoda: { mudra: 'earth', head: 'pagoda', throne: 'lotus' },
  /** A pagoda Buddha in meditation (the smaller ones on the altar's steps). */
  meditate: { mudra: 'meditate', head: 'pagoda', throne: 'lotus' },
  /** A small shrine's Buddha, a saffron cloth over his shoulder. */
  shrine: { mudra: 'earth', head: 'pagoda', throne: 'lotus', sash: true },
  /** The Angkor naga Buddha: meditating on the serpent's coils under its seven heads. */
  naga: { mudra: 'meditate', head: 'angkor', throne: 'naga' },
  /** The naga Buddha with a saffron cloth (the forest Buddha the people keep). */
  nagaSash: { mudra: 'meditate', head: 'angkor', throne: 'naga', sash: true },
} satisfies Record<string, BuddhaKind>;

export type BuddhaKindName = keyof typeof BUDDHA_KINDS;

/**
 * Grid cells (m, at the reference size) for each detail: `near` for up
 * close (inside a pagoda) — the face and hands (the sculpt's fine zones) on
 * the fine grid —, `far` past ~15 m (its face on a finer grid too: on the
 * coarse one the nose turns to a spike and the lips to a blob).
 */
export const BUDDHA_CELLS = { near: { cell: 0.008, fineCell: 0.0035 }, far: { cell: 0.016, fineCell: 0.0055 } };
export type Detail = keyof typeof BUDDHA_CELLS;

interface Sculpted {
  mesh: SculptMesh;
  /** Height from the throne's foot to the top (m, reference size). */
  height: number;
}

const cache = new Map<string, Sculpted>();

/** The Buddha of `kind` as a sculpt, its foot at y = 0 (reference size). */
export function buddhaSculpt(kind: BuddhaKind): { sculpt: Sculpt; foot: number } {
  const s = new Sculpt();
  const foot = addThrone(s, kind.throne);
  addBody(s, { mudra: kind.mudra, sash: !!kind.sash });
  addHead(s, kind.head);
  return { sculpt: s, foot };
}

const keyOf = (kind: BuddhaKind, detail: Detail) => `${kind.mudra}/${kind.head}/${kind.throne}/${kind.sash ? 1 : 0}/${detail}`;

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
    got = { mesh, height: mesh.geometry.boundingBox!.max.y };
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
        const got: Sculpted = { mesh: { geometry, regions: r.regions, ms: r.ms }, height: geometry.boundingBox!.max.y };
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
  /** Height from the throne's foot to the top (m). */
  height: number;
  /** Up to this distance (m) the near mesh shows, the far one beyond it; none past `hide`. */
  near?: number;
  hide?: number;
  /** Only the far mesh (small statues seen from afar, or far corners). */
  farOnly?: boolean;
}

/** Shots sculpt every near mesh at once (the picture is taken as soon as they are ready). */
const EAGER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('shot');

/**
 * A Buddha statue: an Object3D on y = 0, facing +z, `height` m tall (see
 * the file's note). Its meshes are sculpted in a worker and appear when
 * ready: the far one at once, the near one only when the camera first comes
 * within a few times its distance (most statues are only seen from afar);
 * `sync` sculpts both now instead.
 */
export function buddhaStatue(o: StatueOptions & { sync?: boolean }): Object3D {
  const kind = typeof o.kind === 'string' ? BUDDHA_KINDS[o.kind] : o.kind;
  const palette = typeof o.look === 'string' ? PALETTES[o.look] : o.look;
  const lod = new LOD();
  lod.name = 'buddha';
  const nearGroup = new Group();
  const farGroup = new Group();
  const nearDist = o.near ?? Math.max(12, o.height * 8);
  if (!o.farOnly) lod.addLevel(nearGroup, 0);
  lod.addLevel(farGroup, o.farOnly ? 0 : nearDist);
  lod.addLevel(new Object3D(), o.hide ?? 160);
  const make = (s: Sculpted) => {
    const m = new Mesh(dress(s.mesh, palette), statueMaterial());
    m.name = 'buddha';
    m.scale.setScalar(o.height / s.height);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  if (o.sync) {
    farGroup.add(make(buddhaMesh(kind, 'far')));
    if (!o.farOnly) nearGroup.add(make(buddhaMesh(kind, 'near')));
    return lod;
  }
  let asked = false;
  const wantNear = () => {
    if (asked || o.farOnly) return;
    asked = true;
    void buddhaMeshAsync(kind, 'near').then((n) => {
      nearGroup.clear();
      nearGroup.add(make(n));
    });
  };
  const at = new Vector3();
  void buddhaMeshAsync(kind, 'far').then((s) => {
    const far = make(s);
    farGroup.add(far);
    if (o.farOnly) return;
    // (up close, the far mesh stands in until the near one is sculpted)
    const stand = make(s);
    if (!nearGroup.children.length) nearGroup.add(stand);
    if (EAGER) return wantNear();
    const near3 = nearDist * 3;
    far.onBeforeRender = stand.onBeforeRender = (_r, _s, camera) => {
      if (!asked && camera.position.distanceTo(lod.getWorldPosition(at)) < near3) wantNear();
    };
  });
  return lod;
}
