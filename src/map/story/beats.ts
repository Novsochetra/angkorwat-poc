import type { PlaceId } from '../types';

/**
 * The story shown before the map ("To the young people of Cambodia"), in
 * beats: one or two sentences at a time, each over its own picture.
 *
 * The words are the author's, Khmer and English, exactly as written: a beat
 * only cuts the text at a sentence (or a line) — never change them here
 * without the author.
 */

/** What is behind a beat's words (story.ts `SCENES`). */
export type Scene =
  /** Dark, the pixel temple over the title. */
  | 'title'
  /** Dark. */
  | 'dark'
  /** The Khmer Empire around 900 CE (empire-900.svg), spreading out from Angkor. */
  | 'map'
  /** The map's camera on Angkor Wat, in colour. */
  | 'temple'
  /** The map in grey. */
  | 'grey'
  /** Dark with a sunrise glow. */
  | 'dawn'
  /** One gold block: one person (temple.ts). */
  | 'one'
  /** Thousands of gold blocks build Angkor Wat, bottom up (temple.ts). */
  | 'hands'
  /** The whole map in colour. */
  | 'world'
  /** The map behind a sunrise glow; the last beat has the Start button. */
  | 'dawnWorld';

/** How a line looks: body text, or the title, a lead-in, the big line, the list of fields, the signature. */
export type LineKind = 'body' | 'title' | 'lead' | 'big' | 'list' | 'sign';

export interface StoryLine {
  km: string;
  en: string;
  kind?: LineKind;
}

export interface Beat {
  scene: Scene;
  lines: StoryLine[];
}

export const BEATS: Beat[] = [
  { scene: 'title', lines: [{ kind: 'title', km: 'ជូនចំពោះយុវជនខ្មែរ', en: 'To the young people of Cambodia.' }] },
  { scene: 'dark', lines: [{ km: 'យើងជាកូនខ្មែរ។ ប្រទេសយើងតូច។', en: 'We are Cambodian. Our country is small.' }] },
  {
    scene: 'map',
    lines: [
      {
        km: 'ប៉ុន្តែកាលពីអតីតកាល ដូនតាយើងធ្លាប់កសាងអាណាចក្រដ៏មហិមាមួយ ដែលខ្លាំងពូកែបំផុតនៅអាស៊ីអាគ្នេយ៍។',
        en: 'But long ago, our ancestors built a great empire, one of the strongest in Southeast Asia.',
      },
    ],
  },
  { scene: 'map', lines: [{ km: 'ពួកគាត់មានស្មារតីរឹងមាំ និងចិត្តក្លាហាន។', en: 'They had strong minds and brave hearts.' }] },
  {
    scene: 'temple',
    lines: [
      {
        km: 'ពួកគាត់បានសាងសង់អង្គរវត្ត ដែលជាប្រាសាទបុរាណដ៏ធំ និងស្មុគស្មាញបំផុតមួយនៅលើពិភពលោក។',
        en: 'They built Angkor Wat, one of the largest and most complex ancient temples in the world.',
      },
    ],
  },
  {
    scene: 'temple',
    lines: [
      {
        km: 'ពួកគាត់ធ្វើបាន ដោយគ្មានម៉ាស៊ីនទំនើប មានតែចំណេះដឹង ការខិតខំ និងសាមគ្គីភាព។',
        en: 'They had no modern machines. They did it with knowledge, hard work and unity.',
      },
    ],
  },
  { scene: 'grey', lines: [{ km: 'តែសព្វថ្ងៃ យើងបានធ្លាក់ចុះ ហើយនៅពីក្រោយប្រទេសជិតខាងឆ្ងាយណាស់។', en: 'Today we have fallen behind our neighbours.' }] },
  { scene: 'grey', lines: [{ km: 'សីលធម៌ និងសាមគ្គីភាពរបស់យើងកាន់តែខ្សោយ។', en: 'Our morals and our unity are weaker.' }] },
  {
    scene: 'grey',
    lines: [
      {
        km: 'យើងជាច្រើនឈប់ខ្វល់ពីប្រទេសជាតិ ឈប់រៀនសូត្រ ឈប់អភិវឌ្ឍខ្លួនឯង ហើយចំណាយពេលច្រើនពេកទៅលើការលេងសប្បាយ ដោយភ្លេចគិតពីថ្ងៃស្អែក។',
        en: 'Many of us stopped caring about our country. We stopped learning and growing. We spend too much time having fun and forget about tomorrow.',
      },
    ],
  },
  {
    scene: 'dawn',
    lines: [
      { kind: 'lead', km: 'ដូច្នេះ សូមសួរខ្លួនឯងម្ដង៖', en: 'So ask yourself one question:' },
      {
        kind: 'big',
        km: '«តើខ្ញុំអាចជាមនុស្សម្នាក់ ដែលអាចធ្វើឲ្យកម្ពុជារុងរឿងឡើងវិញ ក្នុងជំនាញដែលខ្ញុំស្រឡាញ់ បានដែរឬទេ?»',
        en: '"Can I be the one who makes Cambodia shine again, in the field I love?"',
      },
    ],
  },
  {
    scene: 'dawn',
    lines: [
      {
        kind: 'list',
        km: 'វិទ្យាសាស្ត្រ, វេជ្ជសាស្ត្រ, វិស្វកម្ម, បច្ចេកវិទ្យា, សិល្បៈ, កីឡា, កសិកម្ម, អាជីវកម្ម, ការបង្រៀន ...',
        en: 'Science, medicine, engineering, technology, art, sport, farming, business, teaching... every field matters.',
      },
    ],
  },
  { scene: 'one', lines: [{ km: 'អង្គរវត្តមិនមែនសាងសង់ដោយមនុស្សតែម្នាក់ទេ។', en: 'Angkor Wat was not built by one person.' }] },
  {
    scene: 'hands',
    lines: [
      {
        km: 'វាកើតចេញពីដៃមនុស្សរាប់សែននាក់ ដែលម្នាក់ៗបានធ្វើចំណែករបស់ខ្លួនឲ្យបានល្អបំផុត។',
        en: 'Tens of thousands of hands built it, and each person crafted their part so well.',
      },
    ],
  },
  {
    scene: 'world',
    lines: [
      {
        km: 'ហ្គេមនេះ ត្រូវបានបង្កើតឡើងពីកេរដំណែល ដែលដូនតាយើងបានទុកឲ្យយើងជិតមួយពាន់ឆ្នាំមកហើយ។',
        en: 'This game is built from what our ancestors left us almost 1,000 years ago.',
      },
    ],
  },
  { scene: 'world', lines: [{ km: 'វាប្រហែលជាមិនដូចអង្គរពិតប្រាកដទេ។', en: 'It may not look like the real Angkor.' }] },
  {
    scene: 'world',
    lines: [
      {
        km: 'ប៉ុន្តែសូមក្រឡេកមើលថា ដូនតាយើងបានទុកអ្វីខ្លះឲ្យយើង ហើយសួរខ្លួនឯងថា តើយើងនឹងទុកអ្វីឲ្យកូនចៅជំនាន់ក្រោយ?',
        en: 'But look at what they gave us, and ask yourself: what will we leave for the next generation?',
      },
    ],
  },
  { scene: 'dawnWorld', lines: [{ kind: 'big', km: 'អ្វីៗទាំងអស់ ចាប់ផ្ដើមពីអ្នក។', en: 'It all starts with you.' }] },
  {
    scene: 'dawnWorld',
    lines: [
      { km: 'តោះ ទៅមើលមរតកដែលដូនតាបន្សល់ទុកឲ្យយើង។', en: "Let's go and see what our ancestors left us." },
      { kind: 'sign', km: '— ពីកូនខ្មែរម្នាក់ ជូនកូនខ្មែរទាំងអស់', en: '— From one Cambodian, to all Cambodians' },
    ],
  },
];

/** Where the map's camera looks during a scene (none: it stays where it is). */
export const SCENE_PLACE: Partial<Record<Scene, PlaceId | 'overview'>> = {
  temple: 'sanctuary',
  grey: 'overview',
  world: 'overview',
  dawnWorld: 'overview',
};
