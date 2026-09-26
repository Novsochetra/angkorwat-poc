import type { HeightField } from '../heightfield';
import { JUNGLE_SITES } from '../layout';
import { VILLAGE_SPOTS } from '../village/_spots';
import type { WordKey } from '../ui/lang';
import type { GoldModel } from './_models';

/**
 * Where the fifteen golden figures are hidden, each at a place its motif
 * belongs to: one in a quiet corner of every temple, the rest at the jungle
 * sites along the trails and in the floating village. All are reachable on
 * foot (checked on the walk map), none is by a shrine where he kneels (the
 * prayer, roam/_pray.ts) or on a take-off ramp.
 *
 * A spot is on the map (`at`: x, z and the floor height y there), or in a
 * jungle site's own frame (`site`: +z the way it faces, +x its left, as the
 * camps and ruins build them), so it moves with the site. `turn`: which way
 * the figure faces at rest (radians, like the sites' facing; it turns
 * slowly anyway).
 */
export interface GoldDef {
  id: GoldModel;
  /** Its name ("golden naga"), ui/lang.ts. */
  name: WordKey;
  at?: readonly [number, number, number];
  site?: { id: string; x: number; z: number; y?: number };
  /** Behind a waterfall: the lowest fall of this river (`field.falls`), at the foot of its cliff, on the pool's bed (index.ts places it). */
  fall?: string;
  turn: number;
  /** Why there (for the report and bug reports). */
  where: string;
}

export const GOLD: readonly GoldDef[] = [
  // ── Temples ────────────────────────────────────────────────────────────
  { id: 'apsara', name: 'tgApsara', at: [-45.3, 56, -239.2], turn: 2.4, where: "Angkor Wat, the north-west corner of the outer courtyard, at the step of the corner pavilion, behind the galleries (its walls are lined with apsaras)" },
  { id: 'bayonFace', name: 'tgBayonFace', at: [-274.5, 43, -256.5], turn: -2.4, where: 'Bayon, the far north-east corner of the upper terrace, behind the face towers' },
  { id: 'garuda', name: 'tgGaruda', at: [-101.5, 24, -63.5], turn: 2.4, where: "Preah Khan, outside the back (north-west) corner of the enclosure wall (its outer walls are held up by garudas)" },
  { id: 'singha', name: 'tgSingha', at: [158.5, 34, -145.5], turn: 0.3, where: "Ta Prohm, at the south-west corner of the temple's base, where lions guard the way up" },
  { id: 'nandi', name: 'tgNandi', at: [387.5, 151, -457.5], turn: -0.8, where: "Phnom Kulen, the back corner of the mountain temple's pad, facing the sanctuary (Shiva's bull on Shiva's mountain)" },
  { id: 'naga', name: 'tgNaga', at: [-67.5, 8, 41.5], turn: 2.2, where: "River Gate, at the foot of the bridge's naga balustrade, on the river bank" },
  // ── Jungle sites ───────────────────────────────────────────────────────
  { id: 'peacock', name: 'tgPeacock', site: { id: 'fallen-face', x: -2.5, z: -5.5 }, turn: 0.7, where: 'The fallen face: behind the giant stone head, in the ferns' },
  { id: 'kinnari', name: 'tgKinnari', site: { id: 'rim-swing', x: 3.5, z: 4.5 }, turn: 0, where: 'The swing over the lake: on the cliff ledge by the rope swing, looking out (a kinnari loves high places)' },
  { id: 'lotus', name: 'tgLotus', fall: 'Bayon stream', turn: 0, where: "The stream pool: behind the waterfall's curtain, at the foot of the cliff, in the shallow water (wade in)" },
  { id: 'turtle', name: 'tgTurtle', site: { id: 'pool-bridge', x: 2.2, z: -1.2 }, turn: 1.6, where: 'Below the pool: under the end of the wooden foot bridge, on the stream bank' },
  { id: 'makara', name: 'tgMakara', site: { id: 'ruin-wall', x: 5.5, z: -2.5 }, turn: -1.7, where: 'The carved lintel: at the end of the fallen wall (makaras curl out of Khmer lintels)' },
  { id: 'rabbit', name: 'tgRabbit', site: { id: 'monk-hut', x: 0.9, z: -1.8 }, turn: 1.2, where: "The monk's hut: under the hut's floor between the stilts (Judge Rabbit, the clever hero of Khmer tales)" },
  { id: 'hanuman', name: 'tgHanuman', site: { id: 'root-gate', x: 3.85, z: 2.93 }, turn: -1.2, where: 'The root gate: in the roots beside the gate (the monkey general among the trees)' },
  { id: 'elephant', name: 'tgElephant', site: { id: 'woodcutters', x: -6, z: -4 }, turn: 1.5, where: "The woodcutters' camp: among the stumps of the trees they felled (elephants hauled the logs)" },
  // ── The floating village ───────────────────────────────────────────────
  { id: 'hamsa', name: 'tgHamsa', at: [VILLAGE_SPOTS.jetty[0], VILLAGE_SPOTS.jetty[1], VILLAGE_SPOTS.jetty[2]], turn: -1.2, where: 'The floating village: at the head of the jetty, over the water among the floating houses (the sacred goose of the royal barges)' },
];

/** Where a figure stands on the map (x, z; y the floor there when known, else NaN: the land). */
export function goldAt(d: GoldDef, field: HeightField): [number, number, number] {
  if (d.at) return [d.at[0], d.at[1], d.at[2]];
  if (d.fall) {
    // (the lowest fall of the river: just out from the foot of its cliff, under the water coming down; on the pool's bed)
    const f = field.falls.filter((x) => x.river === d.fall).sort((a, b) => a.bottom - b.bottom)[0];
    if (!f) return [NaN, NaN, NaN];
    return [f.x + f.dir[0] * 0.45, f.bottom - 0.6, f.z + f.dir[1] * 0.45];
  }
  const s = d.site!;
  const site = JUNGLE_SITES.find((j) => j.id === s.id);
  if (!site) return [NaN, NaN, NaN];
  const c = Math.cos(site.facing);
  const n = Math.sin(site.facing);
  return [site.x + s.x * c + s.z * n, s.y ?? NaN, site.z - s.x * n + s.z * c];
}

/** Its facing at rest on the map (a site's figure turns with the site, one behind a fall faces out through the water). */
export function goldTurn(d: GoldDef, field: HeightField): number {
  const fall = d.fall ? field.falls.find((x) => x.river === d.fall) : null;
  if (fall) return d.turn + Math.atan2(fall.dir[0], fall.dir[1]);
  const site = d.site ? JUNGLE_SITES.find((j) => j.id === d.site!.id) : null;
  return d.turn + (site?.facing ?? 0);
}
