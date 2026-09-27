import { BufferAttribute, BufferGeometry, Group, LOD, Mesh, Object3D, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dress, PALETTES, statueMaterial, type Finish, type Palette } from './finish';
import { plainAttributes } from './offerings';
import { trackSacred } from './pending';
import type { SculptMesh } from './sculpt';
import { meshStupa, NICHE, stupaOrnaments, stupaSculpt, stupaTop, type StupaDetail, type StupaForm, type StupaLook } from './_stupaShape';
import type { StupaJob, StupaResult } from './_stupaWorker';

export type { StupaForm, StupaLook } from './_stupaShape';

/**
 * Khmer stupas (chetdei, ចេតិយ), sculpted smooth like the Buddhas
 * (sculpt.ts), in the Cambodian forms — never the Thai / Sri Lankan round
 * bell under a spire of rings. A tall square base stepped in three and
 * moulded, on the Khmer redented plan (each corner stepped in twice),
 * with bands of lotus petals; the cella with a false door on each side
 * (or a niche on the front for a small Buddha); then (_stupaShape.ts):
 *
 * - `tower` (the default): a tower like Angkor Wat's, seven tiers drawing
 *   in upward in a lotus bud's (a corn cob's) outline, leaf-shaped
 *   antefixes at every corner of every tier and along its sides, a small
 *   pediment in the middle of each side, as on the Angkor-style family
 *   stupas of Cambodian pagodas (Wat Bo, Wat Damnak) and the "chedi trong
 *   kreoung" of Oudong;
 * - `faces`: a stage with four Bayon faces looking to the four directions
 *   under four tiers (_stupaFace.ts), as on the royal stupas of Oudong
 *   (King Ang Duong's, King Monivong's) and the Bayon's towers: for the
 *   grander stupas (the village pagoda's, Ta Prohm's by the road);
 *
 * and over either the lotus crown: two rows of petals, the closed lotus
 * bud, a short gold tip. Looks: whitewashed with gold trim, the antefixes
 * white with gilt points, the faces gilt, ochre doors (`white`, a
 * pagoda's), gilded (`gold`), or weathered grey-green sandstone
 * on laterite steps with moss, lichen and rain stains, an antefix fallen
 * here and there, no tip (`stone`, the old ones in the jungle and the
 * temples' gardens). With `niche`, a niche under a pointed arch opens in
 * the cella's front (`stupaNiche` says where a Buddha sits in it).
 *
 *   const s = stupa({ height: 4, look: 'white', form: 'faces' });   // on y = 0, front +z
 *
 * Its shape is sculpted once per form, niche and stucco or stone, at a 4 m
 * reference, and shared, in a worker (the map keeps drawing): the far mesh
 * at once, the near one when the camera first comes near (shots: at once;
 * `sync`: both now). Shots wait for them (pending.ts).
 *
 * Based on: Stupas in Cambodia (https://en.wikipedia.org/wiki/Stupas_in_Cambodia:
 * "many Cambodian stupas are constructed in the style of temple shrine");
 * Oudong's royal stupas (https://helloangkor.com/attractions/phnom-preah-reach-troap/,
 * https://en.wikipedia.org/wiki/Oudong_Me_Chey: the square, multi-level
 * "chedi trong kreoung", Ang Duong's and Monivong's spires with four faces);
 * the Angkor-era style stupas of Siem Reap's pagodas
 * (https://helloangkor.com/the-pagodas-of-siem-reap/); Angkor Wat's towers,
 * graduated tiers in a lotus bud's profile, antefixes in the redented corners
 * (https://factsanddetails.com/southeast-asia/Cambodia/sub5_2f/entry-6643.html);
 * the Bayon's face towers (https://en.wikipedia.org/wiki/Bayon).
 */

export interface StupaOptions {
  /** Height from the foot to the tip (m; the stone one's to its bud). */
  height: number;
  look: StupaLook;
  /** `tower` (default): Angkor Wat's lotus-bud tower; `faces`: four Bayon faces under three tiers. */
  form?: StupaForm;
  /** A niche in the cella's front (for a small Buddha). */
  niche?: boolean;
  /** Up to this distance (m) the near mesh shows, the far one beyond (default 7 × height). */
  near?: number;
  /** Hidden past this distance (m; default 120 × height). */
  hide?: number;
  /** Sculpt both meshes now, on this thread (the preview). */
  sync?: boolean;
}

/**
 * Where a stupa's niche is, in the stupa's space (m): its floor's middle,
 * and its opening. A seated Buddha about 0.7 × `height` tall fits.
 */
export interface StupaNiche {
  /** The middle of the niche's floor (a Buddha's foot goes here, facing +z). */
  at: Vector3;
  /** The opening's width and height to the arch's point, and the niche's depth (m). */
  width: number;
  height: number;
  depth: number;
}

/** Where the niche is for a stupa of these options (see `StupaNiche`; the same for both forms). */
export function stupaNiche(o: Pick<StupaOptions, 'height' | 'look'>): StupaNiche {
  const k = o.height / stupaTop(true, o.look);
  return {
    at: new Vector3(0, NICHE.floor * k, (NICHE.face - NICHE.depth / 2) * k),
    width: NICHE.halfWidth * 2 * k,
    height: (NICHE.point - NICHE.floor) * k,
    depth: NICHE.depth * k,
  };
}

// ── Looks ─────────────────────────────────────────────────────────────────────

const WHITE: Finish = { color: 0xf5f2ea, metal: 0, rough: 0.88, grain: 0.5 };
const G = PALETTES.gilt;
const GOLD = G.skin;
const LACQUER: Finish = { color: 0x7a1f1a, metal: 0.05, rough: 0.5, grain: 0.3 };
/** Grey-green sandstone, as Angkor's weathers. */
const SANDSTONE: Finish = { color: 0x938f82, metal: 0, rough: 0.95, grain: 1 };
const stoneTone = (color: number): Finish => ({ color, metal: 0, rough: 0.95, grain: 1 });

/**
 * Region → finish for each look (the sculpt's regions, _stupaShape.ts, and
 * the plaques': `antefix` and its point `antefixTip`, `fronton`, `crown`,
 * `bud`, `tip`).
 */
export const STUPA_PALETTES: Record<StupaLook, Palette> = {
  white: {
    '*': WHITE,
    wall: WHITE,
    plinth: { color: 0xdcd6c8, metal: 0, rough: 0.92, grain: 0.7 },
    band: GOLD,
    petal: GOLD,
    crown: GOLD,
    bud: GOLD,
    tip: GOLD,
    // (the antefixes whitewashed, their points gilt)
    antefix: WHITE,
    antefixTip: GOLD,
    fronton: GOLD,
    nicheFrame: GOLD,
    // (the doors' panels painted ochre, as on the pagodas' stupas)
    door: { color: 0xd4a044, metal: 0.1, rough: 0.6, grain: 0.4 },
    niche: LACQUER,
    face: GOLD,
    diadem: G.hem,
    eye: { color: 0x4a3016, metal: 0.4, rough: 0.5, grain: 0.1 },
    brow: { color: 0x6a4620, metal: 0.5, rough: 0.45, grain: 0.2 },
    lip: G.lip,
    streak: { color: 0xdedacd, metal: 0, rough: 0.92, grain: 0.7 },
    grime: { color: 0xcdc6b4, metal: 0, rough: 0.95, grain: 0.9 },
  },
  gold: {
    '*': GOLD,
    wall: G.robe,
    plinth: { color: 0xe8e2d4, metal: 0, rough: 0.9, grain: 0.6 },
    band: G.hem,
    petal: G.hem,
    crown: G.hem,
    bud: G.flame,
    tip: G.flame,
    antefix: G.hem,
    fronton: G.hem,
    nicheFrame: G.hem,
    door: G.hair,
    niche: LACQUER,
    face: GOLD,
    diadem: G.hem,
    eye: G.eye,
    brow: G.brow,
    lip: G.lip,
    streak: { color: 0xb88a3a, metal: 0.8, rough: 0.45, grain: 0.5 },
    grime: { color: 0xcfc6b2, metal: 0, rough: 0.95, grain: 0.9 },
  },
  stone: {
    '*': SANDSTONE,
    wall: SANDSTONE,
    plinth: stoneTone(0x8a5a40),
    band: stoneTone(0x8d897c),
    petal: stoneTone(0x908b7e),
    crown: stoneTone(0x8c887b),
    bud: stoneTone(0x8c887b),
    antefix: stoneTone(0x928e81),
    fronton: stoneTone(0x8e8a7d),
    nicheFrame: stoneTone(0x8e8a7d),
    door: stoneTone(0x838073),
    niche: stoneTone(0x5f5c52),
    face: stoneTone(0x9a9689),
    diadem: stoneTone(0x908c7f),
    eye: stoneTone(0x6c695e),
    brow: stoneTone(0x8f8b7e),
    lip: stoneTone(0x959184),
    moss: stoneTone(0x5a6634),
    stain: stoneTone(0x66645a),
    lichen: stoneTone(0xb4b3a3),
  },
};

// ── Made once, shared ─────────────────────────────────────────────────────────

/** A shape: its form, a niche or not, stucco or stone. */
interface Kind {
  form: StupaForm;
  niche: boolean;
  stone: boolean;
}
const kindKey = (k: Kind) => `${k.form}/${k.niche ? 'niche' : 'plain'}/${k.stone ? 'stone' : 'stucco'}`;

const meshes = new Map<string, SculptMesh>();
const geometries = new Map<string, BufferGeometry>();
const asked = new Map<string, Promise<SculptMesh>>();

/** The kind's mesh at a detail, sculpted here and now (the preview; where workers are missing). */
function meshNow(kind: Kind, detail: StupaDetail): SculptMesh {
  const key = `${kindKey(kind)}/${detail}`;
  let m = meshes.get(key);
  if (!m) {
    m = meshStupa(kind.form, kind.niche, kind.stone, detail, stupaSculpt(kind.form, kind.niche, kind.stone));
    meshes.set(key, m);
    console.info(`[sacred] stupa ${key}: ${(m.geometry.getIndex()!.count / 3) | 0} triangles in ${m.ms.toFixed(0)} ms`);
  }
  return m;
}

const workers: { w: Worker; jobs: number }[] = [];
const waiting = new Map<number, (r: StupaResult) => void>();
let nextJob = 1;

/** The sculpting worker (one: the Buddhas have theirs; made on first use), or none where workers are missing. */
function sculptor(): { w: Worker; jobs: number } | null {
  if (typeof Worker === 'undefined') return null;
  if (!workers.length) {
    try {
      const w = new Worker(new URL('./_stupaWorker.ts', import.meta.url), { type: 'module' });
      const it = { w, jobs: 0 };
      w.onmessage = (e: MessageEvent<StupaResult>) => {
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

/** The kind's mesh at a detail, sculpted in a worker (at once where there is none). */
function meshLater(kind: Kind, detail: StupaDetail): Promise<SculptMesh> {
  const key = `${kindKey(kind)}/${detail}`;
  const done = meshes.get(key);
  if (done) return Promise.resolve(done);
  let p = asked.get(key);
  if (p) return p;
  const it = sculptor();
  if (!it) p = Promise.resolve().then(() => meshNow(kind, detail));
  else {
    const id = nextJob++;
    it.jobs++;
    p = new Promise<SculptMesh>((resolve) => {
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
        const m: SculptMesh = { geometry, regions: r.regions, ms: r.ms };
        meshes.set(key, m);
        console.info(`[sacred] stupa ${key}: ${(r.index.length / 3) | 0} triangles in ${r.ms.toFixed(0)} ms (worker)`);
        resolve(m);
      });
      it.w.postMessage({ id, ...kind, detail } satisfies StupaJob);
    });
  }
  asked.set(key, p);
  return trackSacred(p);
}

/** The stupa's mesh in a look, its plaques merged in (made once per kind, look and detail). */
function stupaGeometry(kind: Kind, look: StupaLook, detail: StupaDetail, mesh: SculptMesh): BufferGeometry {
  const key = `${kindKey(kind)}/${look}/${detail}`;
  let g = geometries.get(key);
  if (!g) {
    const pal = STUPA_PALETTES[look];
    const body = plainAttributes(dress(mesh, pal).clone());
    g = mergeGeometries([body, ...stupaOrnaments(kind.form, kind.niche, look, detail, pal).map(plainAttributes)]);
    geometries.set(key, g);
  }
  return g;
}

/** Sculpt stats for checks: each stupa mesh so far, its triangles and time (ms). */
export function stupaStats(): { key: string; triangles: number; ms: number }[] {
  return [...meshes].map(([key, m]) => ({ key, triangles: (m.geometry.getIndex()!.count / 3) | 0, ms: m.ms }));
}

/** Shots sculpt every near mesh at once (the picture is taken as soon as they are ready). */
const EAGER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('shot');

/**
 * A Khmer stupa (see the file's note): an Object3D on y = 0, front +z,
 * `height` m to its tip; with `niche`, `object.userData.niche` is its
 * `StupaNiche`. Its meshes appear when sculpted (at once with `sync`).
 */
export function stupa(o: StupaOptions): Object3D {
  const niche = !!o.niche;
  const kind: Kind = { form: o.form ?? 'tower', niche, stone: o.look === 'stone' };
  const lod = new LOD();
  lod.name = 'stupa';
  const nearGroup = new Group();
  const farGroup = new Group();
  const nearAt = o.near ?? 7 * o.height;
  lod.addLevel(nearGroup, 0);
  lod.addLevel(farGroup, nearAt);
  lod.addLevel(new Object3D(), o.hide ?? 120 * o.height);
  lod.scale.setScalar(o.height / stupaTop(niche, o.look));
  const make = (detail: StupaDetail, m: SculptMesh) => {
    const mesh = new Mesh(stupaGeometry(kind, o.look, detail, m), statueMaterial());
    mesh.name = 'stupa';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // (it may come after the part was marked still, graphics.ts `markStill`: the stupa's layers)
    mesh.layers.mask = lod.layers.mask;
    return mesh;
  };
  if (o.sync) {
    farGroup.add(make('far', meshNow(kind, 'far')));
    nearGroup.add(make('near', meshNow(kind, 'near')));
  } else {
    let wanted = false;
    const wantNear = () => {
      if (wanted) return;
      wanted = true;
      void meshLater(kind, 'near').then((m) => {
        nearGroup.clear();
        nearGroup.add(make('near', m));
      });
    };
    const at = new Vector3();
    void meshLater(kind, 'far').then((m) => {
      const far = make('far', m);
      farGroup.add(far);
      // (up close, the far mesh stands in until the near one is sculpted)
      const stand = make('far', m);
      if (!nearGroup.children.length) nearGroup.add(stand);
      if (EAGER) return wantNear();
      const reach = nearAt * 3;
      far.onBeforeRender = stand.onBeforeRender = (_r, _s, camera) => {
        if (!wanted && camera.position.distanceTo(lod.getWorldPosition(at)) < reach) wantNear();
      };
    });
  }
  const object = new Group();
  object.name = `stupa:${o.look}`;
  object.add(lod);
  if (niche) object.userData.niche = stupaNiche(o);
  return object;
}
