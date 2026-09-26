import { JUNGLE_SITES, PLACES } from '../layout';
import type { Lang, PlaceId, SubjectKind } from '../types';
import { PAGODA } from '../village/_spots';

/**
 * What the explorer's nature book and temple passport hold (roam/_book.ts):
 * every living thing he can photograph, with its Khmer and English names,
 * one short true fact and where to look; every stamp he can collect (the six
 * places, the jungle sites, the village pagoda) with the ink it is printed in and its motif
 * (roam/_stamps.ts draws them).
 */

/** A word in both languages (Khmer first). */
export type Both = Record<Lang, string>;

/** The book's chapters, in order. */
export type BookGroup = 'land' | 'jungle' | 'water' | 'plants' | 'people';
export const BOOK_GROUPS: readonly BookGroup[] = ['land', 'jungle', 'water', 'plants', 'people'];

export interface Species {
  kind: SubjectKind;
  group: BookGroup;
  /** Its name: `km` Khmer, `en` English. */
  name: Both;
  /** One short true fact. */
  fact: Both;
  /** Where to look for it (shown on its empty page). */
  where: Both;
}

/** Every page of the nature book, chapter by chapter. */
export const SPECIES: readonly Species[] = [
  // ── Land animals ──
  {
    kind: 'elephant',
    group: 'land',
    name: { km: 'ដំរីអាស៊ី', en: 'Asian elephant' },
    fact: {
      km: 'ដំរីធ្លាប់ដឹកស្ដេចនៃអង្គរ។ ទីលានជល់ដំរីនៅអង្គរធំ មានចម្លាក់ដំរីពេញជញ្ជាំង។',
      en: 'Elephants carried the kings of Angkor; the Terrace of the Elephants at Angkor Thom is carved with them.',
    },
    where: { km: 'ផ្លូវក្នុងជ្រលងភ្នំ', en: 'on the valley road' },
  },
  {
    kind: 'macaque',
    group: 'land',
    name: { km: 'ស្វាក្ដាម', en: 'Long-tailed macaque' },
    fact: {
      km: 'គេហៅវាថា ស្វាក្ដាម ព្រោះវាចេះចាប់ក្ដាមស៊ី។ ពួកវារស់នៅជាហ្វូង ជុំវិញប្រាសាទអង្គរ។',
      en: 'Also called the crab-eating macaque; troops of them live round the temples of Angkor.',
    },
    where: { km: 'ជុំវិញប្រាសាទ', en: 'round the temples' },
  },
  {
    kind: 'sambar',
    group: 'land',
    name: { km: 'ប្រើស', en: 'Sambar deer' },
    fact: {
      km: 'ប្រើស ជាសត្វក្ដាន់ធំជាងគេនៅអាស៊ីអាគ្នេយ៍។ ពេលភ្ញាក់ផ្អើល វាទះជើងនឹងដី ហើយស្រែកឮខ្លាំង។',
      en: 'The largest deer of Southeast Asia. When alarmed it stamps a foot and gives a loud honk.',
    },
    where: { km: 'វាលស្មៅ', en: 'in the open meadows' },
  },
  {
    kind: 'muntjac',
    group: 'land',
    name: { km: 'ឈ្លូស', en: 'Red muntjac' },
    fact: {
      km: 'ពេលភ័យខ្លាច វាស្រែកឮដូចឆ្កែព្រុស។',
      en: 'Called the barking deer: its alarm call sounds like a dog’s bark.',
    },
    where: { km: 'មាត់ព្រៃ', en: 'at the forest edges' },
  },
  {
    kind: 'junglefowl',
    group: 'land',
    name: { km: 'មាន់ព្រៃ', en: 'Red junglefowl' },
    fact: { km: 'វាជាដូនតាព្រៃ នៃមាន់ទាំងអស់នៅលើពិភពលោក។', en: 'The wild ancestor of every chicken in the world.' },
    where: { km: 'តាមមាត់ផ្លូវ', en: 'by the roads' },
  },
  {
    kind: 'buffalo',
    group: 'land',
    name: { km: 'ក្របី', en: 'Water buffalo' },
    fact: {
      km: 'អស់រាប់ពាន់ឆ្នាំមកហើយ ក្របីជួយភ្ជួររាស់ស្រែនៅកម្ពុជា។ វាដេកក្នុងភក់ ដើម្បីឱ្យត្រជាក់ខ្លួន។',
      en: 'Buffalo have ploughed Cambodia’s rice fields for thousands of years; they wallow in mud to keep cool.',
    },
    where: { km: 'មាត់ទន្លេ', en: 'on the river banks' },
  },
  {
    kind: 'ox',
    group: 'land',
    name: { km: 'គោ', en: 'White ox' },
    fact: {
      km: 'គោមួយនឹមនៅតែអូសរទេះឈើ តាមផ្លូវភូមិនៅកម្ពុជា។ ជញ្ជាំងប្រាសាទបាយ័ន មានចម្លាក់រទេះគោដូចគ្នា តាំងពី ៨០០ ឆ្នាំមុន។',
      en: 'Pairs of white oxen still pull wooden carts on Cambodia’s village roads; the Bayon’s walls show the same carts 800 years ago.',
    },
    where: { km: 'អូសរទេះតាមផ្លូវភូមិ', en: 'on the village roads, with a cart' },
  },
  // ── The jungle ──
  {
    kind: 'ibis',
    group: 'jungle',
    name: { km: 'ត្រយ៉ង', en: 'Giant ibis' },
    fact: { km: 'ត្រយ៉ង ជាបក្សីជាតិរបស់កម្ពុជា។ នៅក្នុងព្រៃ មានវាតិចជាង ៣០០ គូប៉ុណ្ណោះ។', en: 'Cambodia’s national bird; fewer than 300 pairs live in the wild.' },
    where: { km: 'មាត់ទន្លេនៅវាលទំនាប', en: 'on the lowland river banks' },
  },
  {
    kind: 'hornbill',
    group: 'jungle',
    name: { km: 'កេងកង', en: 'Great hornbill' },
    fact: {
      km: 'មេកេងកងបិទខ្លួនក្នុងប្រហោងឈើ ដើម្បីភ្ញាស់កូន ហើយឈ្មោលនាំចំណីមកឱ្យវាតាមរន្ធតូចមួយ។',
      en: 'The mother seals herself into a tree hole to nest; the father feeds her through a narrow slit.',
    },
    where: { km: 'លើចុងឈើខ្ពស់ៗ', en: 'on the tallest treetops' },
  },
  {
    kind: 'peafowl',
    group: 'jungle',
    name: { km: 'ក្ងោក', en: 'Green peafowl' },
    fact: { km: 'ក្ងោកបៃតងជិតផុតពូជនៅអាស៊ី។ កម្ពុជាជាជម្រកចុងក្រោយមួយ របស់ពួកវា។', en: 'Endangered across Asia; Cambodia is home to some of the last wild ones.' },
    where: { km: 'វាលចំហក្នុងព្រៃ', en: 'in jungle clearings' },
  },
  {
    kind: 'gibbon',
    group: 'jungle',
    name: { km: 'ទោច', en: 'Pileated gibbon' },
    fact: { km: 'រៀងរាល់ព្រឹក ទោចមួយគូច្រៀងឆ្លើយឆ្លងគ្នា ឮសន្ធឹកពាសពេញព្រៃ។', en: 'Every morning a pair sings a duet that carries far through the forest.' },
    where: { km: 'លើមែកឈើខ្ពស់ៗ', en: 'high in the tall trees' },
  },
  {
    kind: 'boar',
    group: 'jungle',
    name: { km: 'ជ្រូកព្រៃ', en: 'Wild boar' },
    fact: {
      km: 'កូនជ្រូកព្រៃមានឆ្នូតលើខ្លួន ដែលលាក់វានៅលើដីព្រៃ។ ឆ្នូតទាំងនោះបាត់ទៅវិញ ពេលវាធំឡើង។',
      en: 'Piglets wear stripes that hide them on the forest floor; the stripes fade as they grow.',
    },
    where: { km: 'ក្រោមដើមឈើ', en: 'under the trees' },
  },
  {
    kind: 'monitor',
    group: 'jungle',
    name: { km: 'ត្រកួត', en: 'Water monitor' },
    fact: { km: 'វាហែលទឹកពូកែ ហើយអាចលូតលាស់វែងជាងពីរម៉ែត្រ។', en: 'One of the world’s biggest lizards: it swims well and can grow over two metres long.' },
    where: { km: 'ក្បែរទឹក', en: 'by the water' },
  },
  {
    kind: 'snake',
    group: 'jungle',
    name: { km: 'ពស់ខៀវ', en: 'Oriental whip snake' },
    fact: {
      km: 'វាស្ដើងដូចវល្លិ ហើយលាក់ខ្លួនក្នុងស្លឹកឈើ។ ប្រស្រីភ្នែករបស់វា មានរាងដូចរន្ធសោ។',
      en: 'Thin as a vine, it hides among the leaves; its pupils are shaped like keyholes.',
    },
    where: { km: 'លើគុម្ពោតទាបៗ', en: 'on low bushes' },
  },
  {
    kind: 'squirrel',
    group: 'jungle',
    name: { km: 'កំប្រុក', en: 'Variable squirrel' },
    fact: { km: 'ពេលមានគ្រោះថ្នាក់ វាស្រែកស្រួចៗ ហើយគ្រវីកន្ទុយ។', en: 'When danger is near it scolds with a sharp chatter and flicks its tail.' },
    where: { km: 'លើដើមឈើ', en: 'on tree trunks' },
  },
  {
    kind: 'skink',
    group: 'jungle',
    name: { km: 'ជីងចក់ស្បែករលោង', en: 'Sun skink' },
    fact: {
      km: 'ពេលមានសត្រូវ វាអាចផ្ដាច់កន្ទុយខ្លួនឯង ដើម្បីរត់គេច ហើយកន្ទុយថ្មីដុះមកវិញ។',
      en: 'A skink can drop its tail to escape a hunter; a new one grows back.',
    },
    where: { km: 'លើដីព្រៃ', en: 'on the forest floor' },
  },
  // ── Water and sky ──
  {
    kind: 'egret',
    group: 'water',
    name: { km: 'ក្រសាស', en: 'Great egret' },
    fact: { km: 'វាឈរស្ងៀមក្នុងទឹករាក់ រួចចឹកត្រីយ៉ាងលឿនតែម្ដង។', en: 'It stands still in the shallows, then spears a fish with one quick stab.' },
    where: { km: 'ទឹករាក់មាត់ច្រាំង', en: 'in the shallows by the banks' },
  },
  {
    kind: 'heron',
    group: 'water',
    name: { km: 'ក្រសាប្រផេះ', en: 'Grey heron' },
    fact: { km: 'វារកស៊ីតែម្នាក់ឯង ហើយអាចឈររង់ចាំ ដោយមិនកម្រើកយូរណាស់។', en: 'Herons hunt alone and can wait without moving for a long time.' },
    where: { km: 'តាមខ្សែទន្លេ', en: 'along the rivers' },
  },
  {
    kind: 'duck',
    group: 'water',
    name: { km: 'ទាព្រៃ', en: 'Wild duck' },
    fact: { km: 'កូនទាអាចហែលទឹកបាន តាំងពីថ្ងៃដែលវាញាស់ចេញពីពង។', en: 'Ducklings can swim on the very day they hatch.' },
    where: { km: 'លើទន្លេស្ងប់ៗ', en: 'on calm river reaches' },
  },
  {
    kind: 'fish',
    group: 'water',
    name: { km: 'ត្រី', en: 'River fish' },
    fact: { km: 'បាយ និងត្រី ជាបេះដូងនៃម្ហូបខ្មែរ។', en: 'Rice and fish are the heart of a Khmer meal.' },
    where: { km: 'លោតក្នុងទន្លេ', en: 'on the rivers, where fish leap' },
  },
  {
    kind: 'frog',
    group: 'water',
    name: { km: 'កង្កែប', en: 'Frog' },
    fact: { km: 'កង្កែបយំខ្លាំងជាងគេ នៅរដូវភ្លៀង ក្រោយភ្លៀងធ្លាក់ដំបូង។', en: 'Frogs sing loudest when the rains come, calling for mates after the first storms.' },
    where: { km: 'មាត់ច្រាំង ពេលយប់', en: 'on the banks at night' },
  },
  {
    kind: 'dragonfly',
    group: 'water',
    name: { km: 'កន្ទុំរុយ', en: 'Dragonfly' },
    fact: { km: 'កន្ទុំរុយចាប់មូសស៊ី ពេលកំពុងហោះ។ កូនរបស់វាធំឡើងនៅក្រោមទឹក។', en: 'Dragonflies catch mosquitoes in flight; their young grow up under the water.' },
    where: { km: 'លើផ្ទៃទឹក', en: 'over the water' },
  },
  {
    kind: 'bat',
    group: 'water',
    name: { km: 'ប្រចៀវ', en: 'Bat' },
    fact: {
      km: 'ពេលព្រលប់ ប្រចៀវហើរចេញពីកំពូលប្រាសាទ។ ប្រចៀវមួយអាចស៊ីសត្វល្អិតរាប់រយ ក្នុងមួយយប់។',
      en: 'At dusk bats pour out of the temple towers; one bat can eat hundreds of insects in a night.',
    },
    where: { km: 'ពេលព្រលប់ ជុំវិញកំពូលប្រាសាទ', en: 'at dusk, round the towers' },
  },
  // ── Plants ──
  {
    kind: 'bamboo',
    group: 'plants',
    name: { km: 'ឫស្សី', en: 'Bamboo' },
    fact: { km: 'ឫស្សីខ្លះអាចដុះបានជិតមួយម៉ែត្រ ក្នុងមួយថ្ងៃ។', en: 'Some bamboo grows almost a metre in a single day.' },
    where: { km: 'មាត់អូរ និងដីទំនាប', en: 'by the streams and on low ground' },
  },
  {
    kind: 'lotus',
    group: 'plants',
    name: { km: 'ផ្កាឈូក', en: 'Lotus' },
    fact: {
      km: 'ផ្កាឈូកដុះចេញពីភក់ ប៉ុន្តែផ្កាវានៅតែស្អាតបរិសុទ្ធ។ ប៉មប្រាសាទអង្គរវត្ត មានរាងដូចផ្កាឈូកកំពុងក្ពុំ។',
      en: 'The lotus rises clean out of the mud; the towers of Angkor Wat are shaped like its closed buds.',
    },
    where: { km: 'ក្នុងត្រពាំងក្រោមទឹកធ្លាក់', en: 'in the pool below the waterfall' },
  },
  // ── People of Angkor ──
  {
    kind: 'monk',
    group: 'people',
    name: { km: 'ព្រះសង្ឃ', en: 'Monk' },
    fact: { km: 'រៀងរាល់ព្រឹក ព្រះសង្ឃនិមន្តបិណ្ឌបាត។ ការដាក់បាត ជាការធ្វើបុណ្យ។', en: 'Each morning monks walk to receive alms; offering them food is a way of making merit.' },
    where: { km: 'តាមផ្លូវទៅអង្គរវត្ត', en: 'on the road to Angkor Wat' },
  },
  {
    kind: 'guide',
    group: 'people',
    name: { km: 'មគ្គុទ្ទេសក៍', en: 'Temple guide' },
    fact: { km: 'រឿងដែលមគ្គុទ្ទេសក៍ចូលចិត្តប្រាប់៖ អង្គរវត្ត ជាវិមានសាសនាធំជាងគេបំផុតក្នុងពិភពលោក។', en: 'A guide’s favourite fact: Angkor Wat is the largest religious monument in the world.' },
    where: { km: 'នាំភ្ញៀវទៅប្រាសាទ', en: 'at the temples, with a group of visitors' },
  },
  {
    kind: 'visitor',
    group: 'people',
    name: { km: 'ភ្ញៀវទេសចរ', en: 'Visitors' },
    fact: { km: 'អង្គរជាបេតិកភណ្ឌពិភពលោករបស់យូណេស្កូ តាំងពីឆ្នាំ ១៩៩២។', en: 'Angkor has been a UNESCO World Heritage Site since 1992.' },
    where: { km: 'តាមក្រោយមគ្គុទ្ទេសក៍', en: 'behind a guide with a flag' },
  },
  {
    kind: 'villager',
    group: 'people',
    name: { km: 'កសិករ', en: 'Rice farmer' },
    fact: { km: 'គ្រួសារខ្មែរភាគច្រើនធ្វើស្រែ។ គេស្ទូងកូនស្រូវដោយដៃ នៅពេលភ្លៀងមកដល់។', en: 'Most Khmer families grow rice; the seedlings are planted by hand when the rains come.' },
    where: { km: 'វាលស្រែ', en: 'in the rice fields' },
  },
  {
    kind: 'fisherman',
    group: 'people',
    name: { km: 'អ្នកនេសាទ', en: 'Fisherman' },
    fact: { km: 'ពេលបង់សំណាញ់ សំណាញ់រីកជារង្វង់ធំ រួចលិចគ្របលើត្រី។', en: 'A cast net is thrown so that it opens into a wide circle and sinks over the fish.' },
    where: { km: 'លើបឹងធំ', en: 'on the great lake' },
  },
  {
    kind: 'kid',
    group: 'people',
    name: { km: 'ក្មេងបង្ហោះខ្លែង', en: 'Kite flyer' },
    fact: {
      km: 'ខ្លែងអេកមានធ្នូធ្វើពីផ្ដៅ ដែលបន្លឺសំឡេងពេលខ្យល់បក់។ គេបង្ហោះវាក្រោយរដូវច្រូតកាត់។',
      en: 'The Khmer kite “khleng ek” hums in the wind with a bow of rattan; it flies after the harvest.',
    },
    where: { km: 'វាលស្រែ ពេលខ្យល់បក់', en: 'over the fields on a windy day' },
  },
  {
    kind: 'dancer',
    group: 'people',
    name: { km: 'អ្នករបាំអប្សរា', en: 'Apsara dancer' },
    fact: {
      km: 'របាំបុរាណខ្មែរ ត្រូវបានយូណេស្កូចុះក្នុងបញ្ជីបេតិកភណ្ឌវប្បធម៌អរូបីនៃមនុស្សជាតិ។',
      en: 'Khmer classical dance is on UNESCO’s list of the living heritage of humanity.',
    },
    where: { km: 'ពេលយប់ ក្រោមពន្លឺចន្លុះ', en: 'at night, by torchlight' },
  },
  {
    kind: 'festival',
    group: 'people',
    name: { km: 'អ្នកចូលរួមពិធីបុណ្យ', en: 'Festival crowd' },
    fact: {
      km: 'នៅបុណ្យអុំទូក ទូកងរាប់រយប្រណាំងគ្នា ហើយនៅចូលឆ្នាំខ្មែរ ក្នុងខែមេសា គ្រួសារនានាជួបជុំគ្នានៅវត្ត។',
      en: 'Hundreds of long boats race at the Water Festival; at Khmer New Year, in April, families gather at the pagoda.',
    },
    where: { km: 'ពេលមានពិធីបុណ្យ នៅមាត់បឹង ឬក្នុងភូមិ', en: 'at festival time, by the lake or in the village' },
  },
];

export const SPECIES_BY_KIND = new Map(SPECIES.map((s) => [s.kind, s]));

/** The chapters' titles. */
export const GROUP_NAME: Record<BookGroup, Both> = {
  land: { km: 'សត្វលើគោក', en: 'Land animals' },
  jungle: { km: 'សត្វព្រៃ', en: 'The jungle' },
  water: { km: 'ទឹក និងមេឃ', en: 'Water and sky' },
  plants: { km: 'រុក្ខជាតិ', en: 'Plants' },
  people: { km: 'ប្រជាជននៃអង្គរ', en: 'People of Angkor' },
};

// ── The temple passport ──────────────────────────────────────────────────────

/** A stamp's picture (roam/_stamps.ts). */
export type Motif =
  | PlaceId
  | 'fallenHead'
  | 'bridge'
  | 'swing'
  | 'pool'
  | 'stupa'
  | 'spiritHouse'
  | 'ruinWall'
  | 'buddha'
  | 'monkHut'
  | 'rootGate'
  | 'woodcutter'
  | 'pagoda';

/** The stamp's outline. */
export type Frame = 'round' | 'octagon' | 'cut' | 'rounded' | 'arch' | 'oval' | 'lotus';

export interface StampDef {
  /** A place's id, or a jungle site's. */
  id: string;
  /** A temple (the six places) or a jungle site. */
  temple: boolean;
  name: Both;
  motif: Motif;
  frame: Frame;
  /** Ink colour (sRGB hex). */
  ink: string;
  /** Where it is, and how near on foot counts as a visit (m, across; and up or down). */
  x: number;
  z: number;
  reach: number;
}

const INK = {
  red: '#b3392b',
  indigo: '#2d4b86',
  green: '#2f6a4c',
  plum: '#77325f',
  ochre: '#9a5a14',
  teal: '#1d6a74',
  brown: '#6e3f24',
};

/** The places' stamps: their look (the names come from layout.ts). */
const PLACE_STAMP: Record<PlaceId, { frame: Frame; ink: string }> = {
  sanctuary: { frame: 'round', ink: INK.red },
  overlook: { frame: 'octagon', ink: INK.indigo },
  shrine: { frame: 'cut', ink: INK.green },
  terrace: { frame: 'rounded', ink: INK.plum },
  kulen: { frame: 'arch', ink: INK.teal },
  rivergate: { frame: 'oval', ink: INK.ochre },
};

/** The jungle sites' stamps: Khmer names (layout.ts has the English), look. */
const SITE_STAMP: Record<string, { km: string; motif: Motif; frame: Frame; ink: string }> = {
  'fallen-face': { km: 'ព្រះភក្ត្រថ្មរលំ', motif: 'fallenHead', frame: 'rounded', ink: INK.indigo },
  'rim-bridge': { km: 'ស្ពានឆ្លងអូរបាយ័ន', motif: 'bridge', frame: 'round', ink: INK.brown },
  'rim-swing': { km: 'ទោងលើបឹង', motif: 'swing', frame: 'oval', ink: INK.teal },
  'stream-pool': { km: 'ត្រពាំងក្រោមទឹកធ្លាក់', motif: 'pool', frame: 'round', ink: INK.teal },
  'pool-bridge': { km: 'ស្ពានក្រោមត្រពាំង', motif: 'bridge', frame: 'cut', ink: INK.green },
  'lake-shrine': { km: 'ទីសក្ការៈមាត់បឹង', motif: 'stupa', frame: 'arch', ink: INK.red },
  'ruin-wall': { km: 'ផ្ដែរចម្លាក់បុរាណ', motif: 'ruinWall', frame: 'cut', ink: INK.brown },
  'forest-buddha': { km: 'ព្រះពុទ្ធរូបក្នុងព្រៃ', motif: 'buddha', frame: 'lotus', ink: INK.ochre },
  'monk-hut': { km: 'កុដិក្នុងព្រៃ', motif: 'monkHut', frame: 'octagon', ink: INK.ochre },
  'root-gate': { km: 'ខ្លោងទ្វារឫសឈើ', motif: 'rootGate', frame: 'rounded', ink: INK.green },
  'kulen-shrine': { km: 'ទីសក្ការៈជើងភ្នំ', motif: 'stupa', frame: 'round', ink: INK.plum },
  woodcutters: { km: 'ជំរំអ្នកកាប់ឈើ', motif: 'woodcutter', frame: 'octagon', ink: INK.brown },
  'spirit-house': { km: 'រានអ្នកតា', motif: 'spiritHouse', frame: 'arch', ink: INK.red },
};

/** A place's beacon counts from this near (m; roam/world.ts `placeNear` reach). */
const PLACE_REACH = 16;

/** Every stamp of the passport: the six places, then the jungle sites and the village pagoda. */
export const STAMPS: readonly StampDef[] = [
  ...PLACES.map((p): StampDef => ({ id: p.id, temple: true, name: { km: p.km.name, en: p.name }, motif: p.id, ...PLACE_STAMP[p.id], x: p.anchor[0], z: p.anchor[2], reach: PLACE_REACH })),
  ...JUNGLE_SITES.map((s): StampDef => {
    const look = SITE_STAMP[s.id] ?? { km: s.name ?? s.id, motif: 'stupa' as Motif, frame: 'round' as Frame, ink: INK.brown };
    return { id: s.id, temple: false, name: { km: look.km, en: s.name ?? s.id }, motif: look.motif, frame: look.frame, ink: look.ink, x: s.x, z: s.z, reach: s.r + 4 };
  }),
  // The floating village's pagoda (village/_pagoda.ts): walking onto its terrace (its lotus seal: praying at its door, roam/_worship.ts).
  {
    id: 'village-pagoda',
    temple: false,
    name: { km: 'វត្តក្នុងភូមិ', en: 'The village pagoda' },
    motif: 'pagoda',
    frame: 'lotus',
    ink: INK.red,
    x: PAGODA.x,
    z: (PAGODA.terrace.z0 + PAGODA.terrace.z1) / 2,
    reach: (PAGODA.terrace.x1 - PAGODA.terrace.x0) / 2 + 2,
  },
];

export const STAMP_BY_ID = new Map(STAMPS.map((s) => [s.id, s]));

/** Khmer months (for the stamps' dates). */
export const KHMER_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
