import type { Object3D } from 'three';
import { BACK_BUILT, backSpots, type BackSpots } from '../hamlet/_bhSpots';
import { BACK_HAMLET } from '../layout';
import { WalkMap } from '../roam/walkmap';
import type { MapFrame, Subject } from '../types';
import type { Actor } from './_actor';
import { Ground, type Obstacle, type Traffic } from './_routes';
import { Pace, viewDist, type PeopleEnv, type PeopleScene } from './_scene';
import { animalMeshes, Herd, Wallow } from './_sceneBackAnimals';
import { HomeFolk, Riders, Seller } from './_sceneBackFolk';
import { PondKids } from './_sceneBackKids';
import { MarketFolk } from './_sceneBackMarket';
import { SchoolRide } from './_sceneBackSchool';

/**
 * Life behind Angkor Wat: the little hamlet by the lotus pond (layout.ts
 * `BACK_HAMLET`, the hamlet part's `_backHamlet.ts`; where everything is:
 * hamlet/_bhSpots.ts), round the back of the temple where villagers live
 * among the trees:
 *
 * - children swimming in the lotus pond on hot afternoons, jumping off the
 *   jetty, splashing and laughing, running home at dusk (`_sceneBackKids.ts`);
 * - two water buffalo lying in the wallow at the pond's muddy end, the
 *   cattle grazing in the meadow by the trail with their old herder, who
 *   walks them home to the pen in the late afternoon, bells clonking, and
 *   out again at dawn (`_sceneBackAnimals.ts`);
 * - the forest monk riding his bicycle to the hamlet at dawn for alms (the
 *   women kneel and give rice; he blesses them), a villager riding out and
 *   back with her basket, stopping at the juice cart; the coconut seller at
 *   the sala cutting a coconut for whoever comes; the grandfather in his
 *   hammock, a woman sweeping the yard and cooking at dusk, the weaver at
 *   her loom (`_sceneBackFolk.ts`);
 * - the morning market at the lane's foot: its sellers coming in the blue
 *   hour and packing up toward noon, buyers from the hamlet and the trail,
 *   an old man and a boy eating num banh chok at the low table, the monk
 *   stopping there on his round for the sellers' alms; the num krok seller
 *   again in the evening (`_sceneBackMarket.ts`); two schoolchildren on
 *   their bicycles down the lane and east along the trail in the morning,
 *   home in the afternoon (`_sceneBackSchool.ts`);
 * - home at night: the windows lit (the hamlet part), everyone in, the
 *   cattle in the pen, the buffalo lying on the bank.
 *
 * They stand on the hamlet's real floors (its verandas, the jetty, the earth
 * steps on the lane: a walk map of the built hamlet over the land). Far off
 * they step less often; past `HIDE` m they are hidden (nothing runs). The
 * explorer is greeted back by the greeting layer (`_greetBack.ts`). Their
 * things: two bicycles, the hammock, the splashes, the shuttle (the
 * people's things); the buffalo and the cattle are two instanced meshes of
 * the animals' kit (+ their shadows, only near).
 *
 * In the rain the walking grown-ups put umbrellas up (`_sceneBackKit.ts`
 * `raining`), and nobody sweeps.
 *
 * URL: `people=back` (only these), `bhkids=`, `bhherd=`, `bhmonk=`,
 * `bhbike=`, `bhopen=`, `bhschool=` (see the files), with `clock=` for the time of day.
 */

/** Stepping every frame this near, hidden this far (m, the camera from the hamlet's middle; between, every third or sixth frame). */
const NEAR = 100;
const HIDE = 360;

export class BackLife implements PeopleScene {
  readonly name = 'back';
  readonly actors: Actor[] = [];
  readonly object: Object3D;
  private readonly spots: BackSpots;
  private readonly ground: Ground;
  private readonly pace = new Pace(NEAR, HIDE);
  private readonly kids: PondKids;
  private readonly wallow: Wallow;
  private readonly herd: Herd;
  private readonly riders: Riders;
  private readonly seller: Seller;
  private readonly home: HomeFolk;
  private readonly market: MarketFolk;
  private readonly school: SchoolRide;
  private shown = false;
  /** The animals as the people's traffic sees them (they step round them). */
  private readonly obstacles: Obstacle[] = [0, 1, 2, 3, 4, 5].map(() => ({ x: 0, y: 0, z: 0, r: 1, vx: 0, vz: 0, who: 'animal' }));

  constructor(env: PeopleEnv) {
    const field = env.ground.field;
    this.spots = backSpots(field);
    // The hamlet's floors (verandas, the jetty, the steps) over the land: its own walk map.
    const built = BACK_BUILT.object;
    this.ground = built ? new Ground(field, new WalkMap(field, [{ name: 'hamlet', object: built }])) : env.ground;
    const add = (a: Actor) => {
      a.avoid(env.traffic, this.name);
      this.actors.push(a);
      return a;
    };
    this.kids = new PondKids(env, this.spots, this.ground, add);
    this.wallow = new Wallow(this.spots, this.ground);
    this.herd = new Herd(env, this.spots, this.ground, add);
    this.riders = new Riders(env, this.spots, this.ground, add);
    this.seller = new Seller(env, this.ground, add);
    this.home = new HomeFolk(env, this.spots, this.ground, add);
    this.market = new MarketFolk(env, this.ground, add);
    this.school = new SchoolRide(env, this.spots, this.ground, add);
    this.object = animalMeshes(this.wallow, this.herd);
  }

  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const step = this.pace.step(dt, viewDist(f, BACK_HAMLET.x, BACK_HAMLET.z));
    if (step < 0) {
      if (this.shown) this.hideAll();
      return;
    }
    if (step === 0 && this.shown) return;
    dt = step;
    const first = !this.shown;
    this.shown = true;
    this.kids.update(dt, now, f, ex, first);
    this.wallow.update(dt, now, f, ex, first);
    this.herd.update(dt, now, f, ex, first);
    this.riders.update(dt, now, f, ex, first);
    this.seller.update(dt, now, f, ex, first, this.riders);
    this.home.update(dt, now, f, ex, this.riders);
    this.market.update(dt, now, f, ex, first, this.riders.market);
    this.school.update(dt, now, f, ex, first);
  }

  private hideAll(): void {
    this.shown = false;
    this.kids.hide();
    this.wallow.hide();
    this.herd.hide();
    this.riders.hide();
    this.seller.hide();
    this.home.hide();
    this.market.hide();
    this.school.hide();
  }

  report(traffic: Traffic): void {
    if (!this.shown) return;
    for (const a of this.actors) if (a.shown) traffic.add(this.name, a.x, a.y, a.z);
    this.wallow.report(traffic, this.obstacles, 0);
    this.herd.report(traffic, this.obstacles, 2);
  }

  // (the nature book: the buffalo and the cattle; the people come from `actors`)
  subjects(out: Subject[]): void {
    if (!this.shown) return;
    this.wallow.subjects(out);
    this.herd.subjects(out);
  }
}
