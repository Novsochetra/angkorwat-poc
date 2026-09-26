import type { PlaceId } from './types';

/**
 * Where everything is on the world map (metres; +X east, −Z north, +Y up).
 * The numbers come from the concept art (assets/world-map-selection-screen/):
 * spots of the 1672 × 941 picture were un-projected through the overview
 * camera below at the height each thing stands, so the render keeps the
 * picture's composition. Sizes are real-world: the summit temple is about
 * 120 m wide with a 60 m central tower, cliffs are 10–50 m, trees 8–15 m.
 */

/** Overview camera: south of the map, high up, looking north and down. */
export const OVERVIEW = {
  pos: [0, 110, 170] as [number, number, number],
  target: [0, 20, -80] as [number, number, number],
  /** Vertical field of view (degrees). */
  fov: 55,
};

/** A place's words on its card and in the info panel. */
export interface PlaceText {
  name: string;
  subtitle: string;
  /** Two or three sentences for the info panel. */
  blurb: string;
  /** Short facts under the blurb. */
  facts: string[];
}

/** English words in the place itself, Khmer in `km` (the interface picks: ui/lang.ts `placeText`). */
export interface PlaceDef extends PlaceText {
  id: PlaceId;
  km: PlaceText;
  /** Centre of the landmark's flat pad (m); `y` is the pad's ground height. */
  x: number;
  y: number;
  z: number;
  /** Half size of the flat pad the terrain keeps for the landmark (m, x and z). */
  pad: [number, number];
  /**
   * The place's beacon: a glowing lamp on the road in front of the landmark
   * (the road pass builds it here). The pin card is placed from this point.
   */
  anchor: [number, number, number];
  /**
   * Card centre relative to the anchor on screen, in CSS px for a 1280 px
   * wide view (scale with the window width), as in the concept art.
   */
  card: [number, number];
  /** Camera when the place is selected. */
  focus: { pos: [number, number, number]; target: [number, number, number] };
  /** Page to open on "Begin expedition" (none = not built yet: "coming soon"). */
  href?: string;
}

export const PLACES: PlaceDef[] = [
  {
    id: 'sanctuary',
    name: 'Angkor Wat',
    subtitle: 'The Sacred Summit',
    blurb: 'The greatest temple of Angkor crowns the highest mesa: five lotus towers above three galleries, facing the setting sun. Pilgrims have climbed its long stairs for nine hundred years.',
    facts: ['Main expedition', 'Real-scale Angkor Wat'],
    km: {
      name: 'អង្គរវត្ត',
      subtitle: 'កំពូលដ៏ពិសិដ្ឋ',
      blurb: 'ប្រាសាទធំបំផុតនៃអង្គរ ឋិតនៅលើខ្ពង់រាបខ្ពស់បំផុត៖ ប្រាង្គរាងផ្កាឈូកប្រាំ លើថែវបីជាន់ បែរមុខទៅរកព្រះអាទិត្យលិច។ អ្នកធម្មយាត្រាបានឡើងជណ្ដើរវែងរបស់វា អស់រយៈពេលប្រាំបួនរយឆ្នាំមកហើយ។',
      facts: ['ដំណើរសំខាន់', 'អង្គរវត្តទំហំពិត'],
    },
    x: 0,
    y: 56,
    z: -205,
    pad: [62, 44],
    anchor: [0, 58, -165],
    card: [4, -161],
    focus: { pos: [70, 150, -30], target: [0, 80, -200] },
    href: './index.html?spawn=2',
  },
  {
    id: 'kulen',
    name: 'Phnom Kulen',
    subtitle: 'The Mountain Temple',
    blurb: 'A lone temple on the holy mountain, above the clouds. The kings of Angkor were crowned here, and the rivers of the highlands begin on its slopes.',
    facts: ['Long climb', 'Above the clouds'],
    km: {
      name: 'ភ្នំគូលែន',
      subtitle: 'ប្រាសាទលើភ្នំ',
      blurb: 'ប្រាសាទឯកាលើភ្នំដ៏ពិសិដ្ឋ ខ្ពស់ផុតពពក។ ព្រះមហាក្សត្រអង្គរត្រូវបានរាជាភិសេកនៅទីនេះ ហើយស្ទឹងទាំងឡាយនៃខ្ពង់រាប ហូរចេញពីជម្រាលភ្នំនេះ។',
      facts: ['ផ្លូវឡើងវែង', 'ខ្ពស់ផុតពពក'],
    },
    x: 370,
    y: 150,
    z: -440,
    pad: [18, 16],
    anchor: [352, 115, -380],
    card: [86, 49],
    focus: { pos: [330, 230, -220], target: [370, 150, -440] },
  },
  {
    id: 'terrace',
    name: 'Ta Prohm',
    subtitle: 'The Lost Gardens',
    blurb: 'Giant silk-cotton and fig trees grow over the towers of Ta Prohm, their roots pouring over the stones. Water runs from terrace to terrace down to the valley.',
    facts: ['Tree temple', 'Waterfalls'],
    km: {
      name: 'តាព្រហ្ម',
      subtitle: 'សួនច្បារដែលបាត់បង់',
      blurb: 'ដើមស្ពង់ និងដើមជ្រៃដ៏ធំ ដុះគ្របលើប្រាង្គនៃប្រាសាទតាព្រហ្ម ឫសរបស់វាលូនគ្របលើថ្ម។ ទឹកហូរចុះពីថ្នាក់មួយទៅថ្នាក់មួយ រហូតដល់ជ្រលងភ្នំ។',
      facts: ['ប្រាសាទដើមឈើ', 'ទឹកធ្លាក់'],
    },
    x: 200,
    y: 34,
    z: -140,
    pad: [24, 20],
    anchor: [180, 36, -112],
    card: [114, 38],
    focus: { pos: [232, 96, -66], target: [194, 42, -150] },
  },
  {
    id: 'overlook',
    name: 'Bayon',
    subtitle: 'The Stone Faces',
    blurb: 'Calm stone faces smile from every tower of Bayon, high on the western cliffs. From its terrace you can see every temple of the highlands.',
    facts: ['Viewpoint', 'Face towers'],
    km: {
      name: 'បាយ័ន',
      subtitle: 'ព្រះភក្ត្រថ្ម',
      blurb: 'ព្រះភក្ត្រថ្មដ៏ស្ងប់ស្ងាត់ ញញឹមចេញពីគ្រប់ប្រាង្គនៃប្រាសាទបាយ័ន ដែលឋិតនៅខ្ពស់លើច្រាំងថ្មចោទខាងលិច។ ពីទីលានរបស់វា អ្នកអាចមើលឃើញគ្រប់ប្រាសាទនៃខ្ពង់រាប។',
      facts: ['កន្លែងមើលទេសភាព', 'ប្រាង្គព្រះភក្ត្រ'],
    },
    x: -300,
    y: 40,
    z: -230,
    pad: [30, 26],
    anchor: [-232, 41, -142],
    card: [77, -42],
    focus: { pos: [-200, 120, -60], target: [-300, 50, -230] },
  },
  {
    id: 'shrine',
    name: 'Preah Khan',
    subtitle: 'The Silent Ruins',
    blurb: 'Once a city of monks and scholars, now the jungle holds its long broken galleries. Roots hold the stones together, and birds nest in the fallen towers.',
    facts: ['Ruins', 'Short walk'],
    km: {
      name: 'ព្រះខ័ន',
      subtitle: 'ប្រាសាទដ៏ស្ងាត់ស្ងៀម',
      blurb: 'ធ្លាប់ជាទីក្រុងនៃព្រះសង្ឃ និងអ្នកប្រាជ្ញ ឥឡូវនេះព្រៃបានគ្របដណ្ដប់ថែវវែងៗដែលបាក់បែករបស់វា។ ឫសឈើចាប់ថ្មឱ្យនៅជាប់គ្នា ហើយសត្វស្លាបធ្វើសំបុកក្នុងប្រាង្គដែលរលំ។',
      facts: ['ប្រាសាទបាក់បែក', 'ផ្លូវដើរខ្លី'],
    },
    x: -88,
    y: 24,
    z: -30,
    pad: [18, 15],
    anchor: [-70, 26, -12],
    card: [108, -114],
    focus: { pos: [-25, 85, 55], target: [-80, 30, -45] },
    href: './index.html?level=kit',
  },
  {
    id: 'rivergate',
    name: 'River Gate',
    subtitle: 'The Eastern Crossing',
    blurb: 'An old stone bridge and its gate towers, where the valley road crosses the river. Every journey into the highlands starts here.',
    facts: ['Start of the road', 'Stone bridge'],
    km: {
      name: 'ក្លោងទ្វារទន្លេ',
      subtitle: 'ច្រកឆ្លងខាងកើត',
      blurb: 'ស្ពានថ្មចាស់ និងក្លោងទ្វាររបស់វា ជាកន្លែងដែលផ្លូវជ្រលងភ្នំឆ្លងកាត់ទន្លេ។ គ្រប់ដំណើរឆ្ពោះទៅខ្ពង់រាប ចាប់ផ្ដើមនៅទីនេះ។',
      facts: ['ដើមផ្លូវ', 'ស្ពានថ្ម'],
    },
    x: -60,
    y: 8,
    z: 30,
    pad: [34, 22],
    anchor: [-82, 10, 45],
    card: [64, -106],
    focus: { pos: [-10, 55, 120], target: [-60, 10, 30] },
    href: './index.html?spawn=0',
  },
];

export const placeById = (id: PlaceId): PlaceDef => PLACES.find((p) => p.id === id)!;

/**
 * A flat-topped block of land with cliff sides (a mesa): an ellipse whose
 * edge is roughened with noise. `ledges` step the outer ring down, like the
 * layered cliffs of the concept art.
 */
export interface Plateau {
  name: string;
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Turn of the ellipse (radians). */
  rot?: number;
  /** Top height (m). */
  top: number;
  /** Edge noise, 0 = clean ellipse, 0.3 = very ragged. */
  rough?: number;
  /** Outer rings stepped down: `at` = ellipse radius (0‥1) where the step starts, `drop` in metres. */
  ledges?: { at: number; drop: number }[];
  /** A stepped cone (a mountain) instead of a flat top: terraces this many metres high. */
  cone?: number;
}

export const PLATEAUS: Plateau[] = [
  // The sacred summit: three tiers, the temple on the top one.
  { name: 'summit low tier', x: 0, z: -175, rx: 118, rz: 100, top: 32, rough: 0.12 },
  { name: 'summit mid tier', x: 0, z: -195, rx: 98, rz: 75, top: 44, rough: 0.1 },
  { name: 'summit top', x: 0, z: -205, rx: 80, rz: 55, top: 56, rough: 0.06 },
  // East ledge under the summit's waterfalls.
  { name: 'east ledge', x: 82, z: -30, rx: 34, rz: 32, top: 16, rough: 0.18 },
  // The western cliffs (stone faces).
  { name: 'western cliffs', x: -300, z: -220, rx: 140, rz: 125, top: 40, rough: 0.14, ledges: [{ at: 0.85, drop: 10 }] },
  // The shrine's mesa.
  { name: 'shrine mesa', x: -85, z: -28, rx: 52, rz: 40, top: 24, rough: 0.16 },
  // The eastern hills: stepped garden terraces.
  { name: 'terrace hills', x: 190, z: -120, rx: 100, rz: 100, top: 34, rough: 0.08, ledges: [{ at: 0.6, drop: 4 }, { at: 0.72, drop: 8 }, { at: 0.84, drop: 12 }] },
  // Front right table land.
  { name: 'front east mesa', x: 110, z: 35, rx: 55, rz: 30, top: 16, rough: 0.2 },
  // West lowland hill (left of the road, under the explorer's ledge).
  { name: 'west hill', x: -190, z: 10, rx: 70, rz: 45, top: 14, rough: 0.22 },
  // Holy mountain.
  { name: 'Phnom Kulen', x: 380, z: -460, rx: 190, rz: 170, top: 150, rough: 0.1, cone: 8 },
  // Hills behind the summit (fill the back of the view).
  { name: 'north hills', x: -100, z: -420, rx: 160, rz: 80, top: 36, rough: 0.2 },
  { name: 'north-east hills', x: 150, z: -480, rx: 140, rz: 80, top: 48, rough: 0.2 },
  { name: 'far west hills', x: -480, z: -520, rx: 160, rz: 110, top: 70, rough: 0.18, cone: 8 },
];

/**
 * Rivers, drawn downstream as points on the map (m). The water level follows
 * the land: it only goes down, and where the land drops at a cliff the river
 * falls (see heightfield.ts). `w` is the width in metres; a stream 5 m wide
 * or less is 0.6 m deep (waded), wider rivers 1 m (a boat).
 */
export interface River {
  name: string;
  w: number;
  points: [number, number][];
}

export const RIVERS: River[] = [
  {
    // A spring on the summit's mid tier, east of the temple; down in three
    // falls, across the valley, under the River Gate bridge and off the front.
    name: 'Summit river',
    w: 10,
    points: [
      [70, -238],
      [73, -200],
      [78, -145],
      [72, -84],
      [76, -40],
      [76, -12],
      [66, 2],
      [40, 14],
      [13, 20],
      [-25, 30],
      [-49, 38],
      [-40, 52],
      [-24, 62],
      [-18, 90],
      [-14, 118],
    ],
  },
  {
    // A spring on the mid tier west of the temple; off the summit's west
    // side into the gorge by the western cliffs.
    name: 'West fall',
    w: 7,
    points: [
      [-72, -232],
      [-70, -190],
      [-84, -150],
      [-99, -125],
      [-112, -100],
      [-125, -70],
      [-140, -30],
      [-150, 10],
      [-120, 40],
      [-80, 50],
      [-49, 45],
    ],
  },
  {
    // From the garden terraces.
    name: 'Terrace stream',
    w: 6,
    points: [
      [175, -95],
      [150, -70],
      [134, -47],
      [120, -35],
      [118, -5],
      [100, 12],
      [70, 8],
    ],
  },
  {
    // A jungle stream on the western cliffs, west of the Bayon (out of the
    // overview's frame): a spring in the forest on the mesa top, off the
    // rim onto the ledge, off the ledge into the stream pool (a `LAKES`
    // entry: the `pool` site), then south into the great lake.
    name: 'Bayon stream',
    w: 4,
    points: [
      [-358, -190],
      [-368, -176],
      [-380, -162],
      [-390, -150],
      [-397, -136],
      [-400, -122],
      [-401, -110],
      [-402, -96],
      [-404, -80],
      [-406, -62],
      [-408, -40],
    ],
  },
];

/**
 * The glowing road between the places, as points on the map (m); heights
 * come from the land. Stairs are built where it climbs a cliff, bridges
 * where it crosses water.
 */
export const PATHS: { name: string; points: [number, number][] }[] = [
  {
    name: 'valley road',
    points: [
      [-100, 72],
      [-82, 45],
      [-39, 16],
      [-30, 5],
      [-10, -10],
      [5, -40],
      [8, -75],
      [6, -100],
      [5, -122],
      [3, -140],
      [2, -152],
      [0, -167],
    ],
  },
  {
    name: 'shrine and cliffs road',
    points: [
      [-10, -10],
      [-40, -15],
      [-70, -14],
      [-100, -35],
      [-125, -55],
      [-150, -80],
      [-190, -104],
      [-230, -140],
      [-280, -190],
      [-300, -208],
    ],
  },
  {
    name: 'garden and mountain road',
    points: [
      [55, -205],
      [90, -190],
      [110, -170],
      [150, -150],
      [180, -112],
      [230, -160],
      [280, -230],
      [320, -300],
      [352, -380],
      [370, -424],
    ],
  },
];

/**
 * Jungle trails: dirt foot paths about `w` m wide (2 m), as points on the map
 * (m); heights come from the land. They branch off the stone roads (`PATHS`)
 * and lead to the hidden sites (`JUNGLE_SITES`). The land under them is
 * dirt, graded so the explorer can walk them end to end (no step over 2 m),
 * and no trunk stands on them (crowns may meet overhead, so the overview
 * barely sees them). The height field keeps samples every metre
 * (`field.trails`: ground `y`, `wet` where a trail crosses water: a
 * `bridge` site is there).
 */
export interface Trail {
  name: string;
  /** Width (m). */
  w: number;
  points: [number, number][];
}

export const TRAILS: Trail[] = [
  {
    // Off the shrine road between Preah Khan and the Bayon, north up the
    // wooded gap between the western cliffs and the summit, round the back
    // of Angkor Wat (hidden from the overview) and east past Ta Prohm's hills
    // over the mountain road at the foot of Phnom Kulen to a woodcutters'
    // camp east of it. Stations: ruin wall, Buddha, monk's hut, root gate,
    // Kulen shrine, woodcutters' camp.
    name: 'back trail',
    w: 2,
    points: [
      [-180, -98],
      [-160, -124],
      [-149, -160],
      [-142, -196],
      [-134, -222],
      [-131, -248],
      [-118, -276],
      [-88, -296],
      [-54, -304],
      [-10, -308],
      [36, -318],
      [72, -332],
      [108, -318],
      [148, -294],
      [188, -268],
      [226, -244],
      [258, -236],
      [283, -236],
      [318, -236],
      [352, -226],
      [394, -216],
    ],
  },
  {
    // A loop through the forest on the western cliffs round the Bayon's west
    // side: the fallen face, over the stream on a foot bridge, the swing on
    // the rim above the lake, and back to the road.
    name: 'Bayon rim trail',
    w: 2,
    points: [
      [-284, -194],
      [-306, -197],
      [-332, -199],
      [-356, -210],
      [-378, -226],
      [-393, -240],
      [-404, -222],
      [-406, -200],
      [-400, -180],
      [-390, -168],
      [-376, -156],
      [-375, -146],
      [-356, -150],
      [-338, -166],
      [-320, -184],
      [-306, -197],
    ],
  },
  {
    // Off the shrine road at the foot of the western cliffs, west under them
    // to the stream pool, over the stream below it and on to a shrine on the
    // lake's north shore.
    name: 'lake trail',
    w: 2,
    points: [
      [-192, -106],
      [-214, -103],
      [-240, -100],
      [-268, -94],
      [-300, -90],
      [-336, -94],
      [-368, -100],
      [-388, -112],
      [-394, -101],
      [-402, -90],
      [-420, -78],
      [-438, -70],
    ],
  },
  {
    // From the lake trail south along the lake's east shore to the village.
    name: 'east shore trail',
    w: 2,
    points: [
      [-300, -90],
      [-292, -60],
      [-282, -28],
      [-276, 0],
      [-278, 26],
      [-282, 46],
      [-290, 62],
      [-300, 74],
    ],
  },
  {
    // From the south end of the valley road (by the River Gate) west past a
    // spirit shrine and along the dike between the rice paddies to the village.
    name: 'village trail',
    w: 2,
    points: [
      [-100, 72],
      [-110, 82],
      [-128, 84],
      [-150, 85],
      [-164, 83],
      [-200, 83],
      [-240, 83],
      [-284, 83],
      [-300, 74],
    ],
  },
];

/** What stands at a jungle site (the jungle part builds it). */
export type JungleSiteKind =
  /** A giant fallen stone face in the ferns. */
  | 'fallenHead'
  /** A small gate swallowed by strangler-fig roots (the trail passes through it). */
  | 'rootGate'
  /** A lone seated Buddha under a tree, orange cloth, offerings. */
  | 'buddha'
  /** A small spirit shrine or stupa with incense and offerings. */
  | 'shrine'
  /** A forest monk's hut on stilts. */
  | 'monkHut'
  /** A woodcutters' camp: logs, a fire ring. */
  | 'woodcutter'
  /** A rope swing on a big tree by a view. */
  | 'swing'
  /** A small waterfall pool on a jungle stream. */
  | 'pool'
  /** A wooden foot bridge where a trail crosses water (`facing` runs along the bridge). */
  | 'bridge'
  /** A fallen wall with a carved lintel. */
  | 'ruinWall';

export interface JungleSite {
  id: string;
  kind: JungleSiteKind;
  /** Centre of the clearing (m); its height is the land's (`field.heightAt`, flattened within ±2 m over `r`). */
  x: number;
  z: number;
  /**
   * Where its front faces (radians, toward (sin, cos) in x, z): toward the
   * trail that reaches it; a swing faces its view; a bridge and the root gate
   * run along the trail (the trail passes through them).
   */
  facing: number;
  /** Clear radius (m): no trees, flat, marked occupied in the height field. */
  r: number;
  /** Words for later (a nature book / hidden gold). */
  name?: string;
}

/**
 * Hidden places along the trails, each in a small clearing, most out of the
 * overview's sight (behind the summit, west of the Bayon, round the lake).
 */
export const JUNGLE_SITES: JungleSite[] = [
  // Western cliffs (Bayon).
  { id: 'fallen-face', kind: 'fallenHead', x: -398, z: -246, facing: 0.69, r: 9, name: 'The fallen face' },
  { id: 'rim-bridge', kind: 'bridge', x: -383, z: -162, facing: 0.86, r: 5, name: 'Bridge over the Bayon stream' },
  { id: 'rim-swing', kind: 'swing', x: -377, z: -141, facing: 0, r: 8, name: 'The swing over the lake' },
  { id: 'stream-pool', kind: 'pool', x: -400, z: -115, facing: 1.08, r: 14, name: 'The stream pool' },
  { id: 'pool-bridge', kind: 'bridge', x: -401, z: -91, facing: -0.69, r: 5, name: 'Bridge below the pool' },
  { id: 'lake-shrine', kind: 'shrine', x: -439, z: -67, facing: 2.82, r: 5, name: 'Shrine by the lake' },
  // Round the back of Angkor Wat.
  { id: 'ruin-wall', kind: 'ruinWall', x: -124, z: -236, facing: -1.68, r: 9, name: 'The carved lintel' },
  { id: 'forest-buddha', kind: 'buddha', x: -52, z: -310, facing: 0.1, r: 7, name: 'The forest Buddha' },
  { id: 'monk-hut', kind: 'monkHut', x: 75, z: -339, facing: -0.38, r: 9, name: "The monk's hut" },
  // Between Ta Prohm's hills and Phnom Kulen, and at the mountain's foot.
  { id: 'root-gate', kind: 'rootGate', x: 226, z: -244, facing: 1.17, r: 7, name: 'The root gate' },
  { id: 'kulen-shrine', kind: 'shrine', x: 268, z: -240, facing: 0, r: 5, name: 'Shrine at the foot of the mountain' },
  { id: 'woodcutters', kind: 'woodcutter', x: 402, z: -216, facing: -1.57, r: 10, name: "Woodcutters' camp" },
  // Lowlands by the River Gate.
  { id: 'spirit-house', kind: 'shrine', x: -124, z: 88, facing: -3.04, r: 5, name: 'The spirit house' },
];

/**
 * Still lakes: an ellipse (roughened like the mesas) of water at `level`
 * (m; the land under it is carved to a flat bed 1 m down, where the
 * explorer takes a boat, and 0.6 m in a band of reed shallows along the
 * shore, where he wades; a small pool is shallow all over); a shore of
 * sand, then mud, round it. No current. A river that runs into a lake takes
 * its level. Hills in it higher than 7 m over the water stay as islands.
 */
export interface Lake {
  name: string;
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Turn of the ellipse (radians). */
  rot?: number;
  /** Water surface (m). */
  level: number;
  /** Edge noise, 0 = clean ellipse. */
  rough?: number;
}

export const LAKES: Lake[] = [
  // The great lake in the south-west lowland (like the Tonle Sap, south-west
  // of Angkor): out of the overview's frame, its water runs west under the
  // edge mist so it looks endless. Floating village on its east shore.
  { name: 'Great lake', x: -490, z: 22, rx: 206, rz: 78, rot: 0.05, level: 5, rough: 0.08 },
  // The pool under the Bayon stream's fall (the `stream-pool` site).
  { name: 'Stream pool', x: -400, z: -116, rx: 9, rz: 8, level: 7, rough: 0.12 },
];

/**
 * The floating village on the great lake's east shore (the village part
 * places the houses): the ground is flat dirt 1 m over the water, cleared
 * of trees; `shore` is the waterline where the stilt houses stand (half on
 * land, half over the reed shallows), `water` open water for the floating
 * houses. The village trail and the east shore trail end at `x, z`.
 */
export const VILLAGE = {
  x: -300,
  z: 74,
  shore: [
    [-290, 30],
    [-292, 44],
    [-301, 58],
    [-320, 68],
    [-336, 76],
    [-352, 82],
  ] as [number, number][],
  water: { x: -338, z: 48, r: 18 },
};

/**
 * Rice paddies between the lake and the west hill, south of the village
 * trail: flat plots (`w` across x, `d` across z before the turn `rot`) at
 * `level` (m), stepping down toward the lake; low earth dikes (one 2 m
 * cell, 0.5 m over the higher plot beside it) between them. The height
 * field makes them `SURFACE.paddy` (plots) and dirt (dikes), all occupied
 * (no trees); the paddies part adds water sheen and rice.
 */
export interface Paddy {
  x: number;
  z: number;
  w: number;
  d: number;
  rot: number;
  level: number;
}

export const PADDIES: Paddy[] = [
  // North row (z 58‥82), the village trail on the dike south of it.
  { x: -272, z: 70, w: 20, d: 24, rot: 0, level: 7 },
  { x: -249, z: 70, w: 22, d: 24, rot: 0, level: 7.5 },
  { x: -224, z: 70, w: 24, d: 24, rot: 0, level: 8 },
  { x: -200, z: 70, w: 20, d: 24, rot: 0, level: 8.5 },
  { x: -177, z: 70, w: 22, d: 24, rot: 0, level: 9 },
  // South row (z 84‥106).
  { x: -274, z: 95, w: 16, d: 22, rot: 0, level: 6.5 },
  { x: -254, z: 95, w: 20, d: 22, rot: 0, level: 7 },
  { x: -231, z: 95, w: 22, d: 22, rot: 0, level: 7.5 },
  { x: -207, z: 95, w: 22, d: 22, rot: 0, level: 8 },
  { x: -182, z: 95, w: 24, d: 22, rot: 0, level: 8.5 },
];

/**
 * A straight lane for the racing boat (ngo) race (a festival, later) on the great
 * lake: starts out west under the mist, finishes by the village.
 */
export const RACE_COURSE = { from: [-548, 10] as [number, number], to: [-348, 10] as [number, number] };

/** Where the explorer stands in the foreground: a rock ledge near the camera, bottom left. */
export const EXPLORER_SPOT = {
  /** Screen point of the feet (0‥1 from the top-left) and distance from the camera (m). */
  screen: [0.105, 0.86] as [number, number],
  distance: 9,
  /** Facing: towards this map point. */
  facing: [0, 56, -205] as [number, number, number],
};

/** Edges of the built land (m); beyond it: sea of mist and far silhouettes. */
export const MAP_BOUNDS = { x0: -600, x1: 600, z0: -660, z1: 120 };
