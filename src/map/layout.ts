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

/**
 * The places' own pages (the real-scale temple, the kit world) open from the
 * map. Off for this release, where the world map is the whole game: every
 * place is "coming soon" (no "Begin expedition", no "E  Enter …").
 */
export const SCENES_OPEN = false;
/** A place's page, while the pages are open. */
const scene = (href: string) => (SCENES_OPEN ? href : undefined);

export const PLACES: PlaceDef[] = [
  {
    id: 'sanctuary',
    name: 'Angkor Wat',
    subtitle: 'The Sacred Summit',
    blurb: "Angkor Wat was built in 1122 AD, in the 12th century. It was built during the reign of King Suryavarman II. The king built it for many purposes. He dedicated it to the god Vishnu. It also honored his own great works. And it was to be his place of eternal peace after his death.",
    facts: ['Main expedition', 'Real-scale Angkor Wat'],
    km: {
      name: 'អង្គរវត្ត',
      subtitle: 'កំពូលដ៏ពិសិដ្ឋ',
      blurb: 'ប្រាសាទអង្គរវត្តត្រូវបានកសាងឡើងក្នុងឆ្នាំ ១១២២ នៃគ.ស. ដែលត្រូវនឹងស.វទី១២ ក្នុងរជ្ជកាលព្រះបាទ សូរ្យវរ្ម័នទី២ ដែលប្រាសាទនេះបានសាងសង់ឡើងក្នុងពហុបំណងច្រើនយ៉ាងរបស់ព្រះអង្គ ដោយការឧទ្ទិសឱ្យអង្គទេព ព្រះវិស្ណុ ការរំលឹកដល់ស្នាដៃរបស់អង្គខ្លួនឯងផ្ទាល់ផង ការផ្ដល់ជាទីឋានបរមសុខនៅពេលដែលទ្រង់សោយទីវង្គតនៅពេលខាងមុខផងដែរ។',
      facts: ['ដំណើរសំខាន់', 'អង្គរវត្តទំហំពិត'],
    },
    x: 0,
    y: 56,
    z: -205,
    pad: [62, 44],
    anchor: [0, 58, -165],
    card: [4, -161],
    focus: { pos: [70, 150, -30], target: [0, 80, -200] },
    href: scene('./game.html?spawn=2'),
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
    blurb: "Ta Prohm Temple was built in 1186 AD by King Jayavarman VII. He dedicated it to his mother, in the form of Prajnaparamita. Prajnaparamita is the Buddhist goddess of wisdom. Big trees grow over the temple and wrap around it. An inscription (old writing carved in stone) at the temple says Ta Prohm had 3,140 villages. It also had 79,365 people who cared for the temple. These included 18 royal priests, 2,740 officials, 2,202 assistants, and 615 dancers.",
    facts: ['Tree temple', 'Waterfalls'],
    km: {
      name: 'តាព្រហ្ម',
      subtitle: 'សួនច្បារដែលបាត់បង់',
      blurb: 'ប្រាសាទតាព្រហ្មកសាងឡើយនៅក្នុងឆ្នាំ១១៨៦នៃគ្រឹស្តរាជ ដោយព្រះបាទជ័យវរ្ម័នទី៧ ដើម្បីឧទ្ទិសថ្វាយព្រះមាតារបស់ព្រះអង្គក្រោមរូបភាពប្រាជ្ញាបារមី។ ប្រាសាទនេះរុំព័ទ្ធទៅដោយឈើធំៗដុះលើប្រាសាទ។ បើតាមសិលាចារិកនៅប្រាសាទនេះបញ្ជាក់តាព្រហ្មមាន ៣១៤០ភូមិ និងមានមនុស្ស ៧៩៣៦៥នាក់ មើលថែប្រាសាទរួមមានរាជគ្រូ ១៨នាក់ មន្រ្តី២៧៤០នាក់ ជំនួយការ២២០២នាក់ និងអ្នករាំរបាំ ៦១៥នាក់។',
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
    blurb: 'Bayon Temple stands in the exact center of the royal capital, Angkor Thom. King Jayavarman VII built it in the late 12th and early 13th centuries. Each tower has four faces. There are 49 towers, plus 5 more over the entrance gates. That makes 54 towers in total. They stand for the 54 Khmer provinces of that time. Some scholars think the four faces show Lokeshvara. Lokeshvara is a Bodhisattva (a being who helps others reach enlightenment) in Mahayana Buddhism. Others think the faces show King Jayavarman VII.',
    facts: ['Viewpoint', 'Face towers'],
    km: {
      name: 'បាយ័ន',
      subtitle: 'ព្រះភក្ត្រថ្ម',
      blurb: 'ប្រាសាទបាយ័នមានទីតាំងស្ថិតនៅចំកណ្តាលនៃរាជធានីអង្គរធំ។ ប្រាសាទនេះកសាងនៅចុងសតវត្សរ៍ទី ១២ និងដើមសតវត្សរ៍ទី ១៣ ដោយព្រះបាទជ័យវរ្ម័នទី៧។ ប្រាសាទនេះមាន តួប៉មនីមួយៗ មានមុខបួន ដែលមានកំពូល ៤៩ និងកំពូលក្លោងទ្វារចូល៥ ទៀត សរុបទាំងអស់ ៥៤ កំពូល ដែលតំណាងឲ្យខេត្តក្រុងខ្មែរ ទាំង ៥៤ នៅសម័យកាលនោះ។ មានអ្នកប្រាជ្ញមួយចំនួនបានគិតថា មុខទាំង ៤ នោះតំណាងឲ្យព្រះពោធិសត្វលោកេស្វរៈនៃព្រះពុទ្ធសាសនាមហាយាន អ្នកខ្លះទៀត គិតថា ជារូបតំណាងព្រះបាទជ័យវរ្ម័នទី៧',
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
    blurb: "Preah Khan Temple was built in the 12th century, in 1191, by King Jayavarman VII. But it was not finished in his time. Later kings kept adding to it through the 12th and 13th centuries AD. It was dedicated to the king's father. Its carving style is like Banteay Kdei and Ta Prohm temples.",
    facts: ['Ruins', 'Short walk'],
    km: {
      name: 'ព្រះខ័ន',
      subtitle: 'ប្រាសាទដ៏ស្ងាត់ស្ងៀម',
      blurb: 'ប្រាសាទព្រះខ័នកសាងឡើងនៅសតវត្យរ៍ទី១២ ក្នុងឆ្នាំ១១៩១ ដោយព្រះបាទជ័យវរ្ម័នទី៧ តែពុំបានសង់រួចនៅក្នុងសម័យព្រះអង្គទេ មហាក្សត្រក្រោយៗ បានសង់បន្ថែមបន្ដបន្ទាប់នៅគ្រិស្តសតវត្សទី ១២ - ១៣ដើម្បីឧទ្ទិសដល់ព្រះវររាជបិតារបស់ព្រះអង្គ។ ក្បាច់រចនានៃប្រាសាទ មានលក្ខណៈដូចជាប្រាសាទបន្ទាយក្តី និង ប្រាសាទតាព្រហ្មដែរ',
      facts: ['ប្រាសាទបាក់បែក', 'ផ្លូវដើរខ្លី'],
    },
    x: -88,
    y: 24,
    z: -30,
    pad: [18, 15],
    anchor: [-70, 26, -12],
    card: [108, -114],
    focus: { pos: [-25, 85, 55], target: [-80, 30, -45] },
    href: scene('./game.html?level=kit'),
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
    href: scene('./game.html?spawn=0'),
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
  /**
   * A bench levelled into the land (a ledge cut into a flank, a pool's floor): inside its outline
   * the land is cut down or built up to `top`, whatever the other plateaus make there; benches
   * later in the list over earlier ones.
   */
  bench?: boolean;
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
  // ── Where the map grew: round Phnom Kulen and east of it (off the picker's frame, or behind the mountain).
  // The Kulen falls: benches cut into the mountain's south-east flank, one under the other. The Kulen
  // stream rises at the back of the high one and falls off each (`RIVERS`: 12, 16, then 18 m, a wide
  // curtain), the last into the Kulen pool (`LAKES`) on its floor; the picnic place (`KULEN_PICNIC`) on a
  // terrace beside it, at the mountain's foot.
  { name: 'Kulen pool floor', x: 446, z: -303, rx: 13, rz: 11, top: 8, rough: 0.1, bench: true },
  { name: 'Kulen picnic terrace', x: 421, z: -299, rx: 17, rz: 15, top: 10, rough: 0.08, bench: true },
  { name: 'Kulen falls low bench', x: 447, z: -327, rx: 16, rz: 13, top: 26, rough: 0.1, bench: true },
  { name: 'Kulen falls mid bench', x: 448, z: -349, rx: 14, rz: 11, top: 42, rough: 0.1, bench: true },
  { name: 'Kulen falls high bench', x: 453, z: -371, rx: 13, rz: 11, top: 54, rough: 0.1, bench: true },
  // East of the Kulen stream: a strip of lowland, then hills stepping down into the mist.
  { name: 'east hills', x: 600, z: -170, rx: 62, rz: 120, top: 30, rough: 0.2, ledges: [{ at: 0.72, drop: 10 }] },
  { name: 'south-east hills', x: 596, z: 36, rx: 48, rz: 64, top: 22, rough: 0.22 },
  // East of Phnom Kulen, over a saddle: a lesser stepped hill.
  { name: 'Kulen east shoulder', x: 700, z: -500, rx: 105, rz: 125, top: 72, rough: 0.12, cone: 8 },
  // Behind the holy mountain: a ridge sinking into the mist.
  { name: 'north ridge', x: 430, z: -735, rx: 190, rz: 62, top: 56, rough: 0.2, ledges: [{ at: 0.7, drop: 12 }] },
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
  /** Downstream; a third number is the width there (m; between points it changes evenly, else `w`). */
  points: ([number, number] | [number, number, number])[];
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
  {
    // The Kulen stream: a spring at the back of the high bench of the Kulen falls, on Phnom Kulen's
    // south-east flank (`PLATEAUS`); off each bench in a fall (12, 16, then 18 m, a wide curtain) into
    // the Kulen pool by the picnic place (`KULEN_PICNIC`, `LAKES`); then south over the lowland, past
    // the woodcutters' camp, along the sugar-palm village's east side (`EAST_VILLAGE`; the village
    // street crosses it on a foot bridge), by the east paddies, and off the south-east edge. Wide
    // enough for a boat below the pool.
    name: 'Kulen stream',
    w: 6,
    points: [
      [458, -379, 5],
      [453, -370, 6],
      [449, -361, 6],
      [446, -350, 7],
      [444, -339, 8],
      [443, -328, 11],
      [443, -315, 14],
      [444, -303, 12],
      [440, -289, 6],
      [438, -272],
      [436, -250],
      [440, -210],
      [444, -160],
      [446, -120],
      [448, -90],
      [448, -60],
      [450, -30],
      [452, 0],
      [456, 30],
      [462, 60],
      [476, 90],
      [492, 118],
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
  // ── The east side: the sugar-palm village (`EAST_VILLAGE`), its morning market (`MARKET`), the palm
  // sugar grove (`PALM_GROVE`) and the Kulen stream's picnic falls (`KULEN_PICNIC`); off the picker's frame.
  {
    // Off the garden and mountain road below Ta Prohm's hills, south-east over the lowland into the
    // market square, then east along the village street, over the Kulen stream (a village foot
    // bridge) to the village's east end. A little wider: carts and motos use it.
    name: 'east village road',
    w: 3,
    points: [
      [262, -205],
      [286, -190],
      [308, -166],
      [324, -136],
      [333, -108],
      [336, -84],
      [358, -72],
      [384, -66],
      [410, -62],
      [436, -60],
      [456, -60],
      [472, -62],
    ],
  },
  {
    // From the village north over the lowland to the woodcutters' camp at the end of the back trail
    // (so the back trail, Kulen's foot and the village join up).
    name: 'kulen foot trail',
    w: 2,
    points: [
      [410, -62],
      [412, -96],
      [414, -130],
      [410, -170],
      [404, -206],
    ],
  },
  {
    // From the woodcutters' camp up the Kulen stream's west bank to the picnic place below its falls.
    name: 'picnic trail',
    w: 2,
    points: [
      [406, -224],
      [418, -250],
      [428, -276],
      [434, -296],
    ],
  },
  {
    // From the village street south to the palm sugar grove and on along the dikes of the east paddies.
    name: 'palm lane',
    w: 2,
    points: [
      [396, -64],
      [398, -38],
      [398, -12],
      [396, 10],
      [396, 23],
    ],
  },
  {
    // Behind Angkor Wat: off the back trail north into the little hamlet by the lotus pond.
    name: 'hamlet lane',
    w: 2,
    points: [
      [128, -306],
      [136, -322],
      [146, -336],
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
  // Behind Angkor Wat: the lotus pond by the little hamlet (`BACK_HAMLET`), where children swim and a buffalo wallows.
  { name: 'Lotus pond', x: 104, z: -352, rx: 12, rz: 8, rot: 0.2, level: 7, rough: 0.1 },
  // The Kulen pool under the Kulen stream's last, big fall, by the picnic place (`KULEN_PICNIC`): shallow
  // all over (people wade and swim), a little over the stream below it.
  { name: 'Kulen pool', x: 445, z: -302, rx: 11, rz: 9, rot: -0.2, level: 7, rough: 0.1 },
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
  // The east paddies south of the sugar-palm village (`EAST_VILLAGE`), stepping down toward the Kulen
  // stream on their east side; sugar palms stand on their dikes (the palm sugar grove, `PALM_GROVE`).
  { x: 372, z: 35, w: 22, d: 22, rot: 0, level: 7.5 },
  { x: 396, z: 35, w: 22, d: 22, rot: 0, level: 7 },
  { x: 420, z: 35, w: 22, d: 22, rot: 0, level: 6.5 },
  { x: 384, z: 59, w: 22, d: 22, rot: 0, level: 7 },
  { x: 408, z: 59, w: 22, d: 22, rot: 0, level: 6.5 },
];

/** A settled spot on the map: its middle (m) and radius (m). */
export interface Spot {
  x: number;
  z: number;
  r: number;
}

/**
 * The sugar-palm village (ភូមិត្នោត) on the east lowland at the foot of Phnom Kulen, "the other side"
 * from the floating village (off the picker's frame): Khmer houses on stilts along the village street
 * (the `east village road` trail), the Kulen stream running by its east side (a foot bridge where the
 * street crosses it). Its market is `MARKET`, its palm sugar grove `PALM_GROVE`, its rice the last
 * five `PADDIES`. Built by the hamlet part (`src/map/hamlet/`); its people are `people/_sceneEastVillage.ts`.
 */
export const EAST_VILLAGE: Spot = { x: 410, z: -62, r: 44 };

/** The morning market (ផ្សារ) in the square where the east village road comes in (hamlet/_market.ts, people/_sceneMarket.ts). */
export const MARKET: Spot = { x: 336, z: -84, r: 20 };

/** The palm sugar grove and the family's cooking hut, between the village and the east paddies (hamlet/_palmSugar.ts, people/_scenePalmSugar.ts). */
export const PALM_GROVE: Spot = { x: 392, z: 0, r: 18 };

/** The picnic place below the Kulen stream's falls, on Phnom Kulen's lower slope (hamlet/_kulenPicnic.ts, people/_sceneKulen.ts). */
export const KULEN_PICNIC: Spot = { x: 422, z: -298, r: 14 };

/** The little hamlet behind Angkor Wat, by the lotus pond, off the back trail (hamlet/_backHamlet.ts, people/_sceneBack.ts). */
export const BACK_HAMLET: Spot = { x: 146, z: -340, r: 26 };

/**
 * Ground the height field flattens (± one block, like a jungle site) and marks dirt in its middle, for
 * the settled spots above. Trees keep off only what a builder marks occupied (`field.occupy`).
 */
export const HAMLETS: (Spot & { id: string; dirt?: number })[] = [
  // (`dirt`: the share of the radius laid bare in the middle; 0.5 if not given)
  { id: 'market', ...MARKET, dirt: 0.8 },
  { id: 'east-village', ...EAST_VILLAGE },
  { id: 'palm-grove', ...PALM_GROVE },
  { id: 'kulen-picnic', ...KULEN_PICNIC },
  { id: 'back-hamlet', ...BACK_HAMLET },
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
export const MAP_BOUNDS = { x0: -600, x1: 760, z0: -800, z1: 120 };
