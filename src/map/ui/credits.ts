import type { Lang } from '../types';

/**
 * The credits page in the settings (ui.ts: the "Credits" row). A heading per
 * group, then its lines: a name (kept as written in both languages) and a
 * short note in Khmer and English. Add a line here to credit someone.
 */
export interface CreditGroup {
  head: Record<Lang, string>;
  lines: { name: string; note?: Record<Lang, string> }[];
}

export const CREDITS: CreditGroup[] = [
  {
    head: { km: 'បង្កើតដោយ', en: 'Made by' },
    lines: [{ name: 'Sochetra Nov', note: { km: 'គំនិត ការរចនា និងពិភពលោកទាំងមូល', en: 'Idea, design and the whole world' } }],
  },
  {
    head: { km: 'ជំនួយការសរសេរកូដ', en: 'Code helper' },
    lines: [{ name: 'Claude (Anthropic)' }],
  },
  {
    head: { km: 'សំឡេង', en: 'Sounds' },
    lines: [
      { name: 'GFX Sounds', note: { km: 'ជំហានលើថ្ម និងឈើ ម៉ាស៊ីនអង្គុលីលេខ', en: 'Steps on stone and wood, the typewriter' } },
      { name: 'SmartSound FX', note: { km: 'ជំហានលើស្មៅ', en: 'Steps on grass' } },
      { name: 'Vadi Sound', note: { km: 'ជំហានក្នុងទឹក និងភក់', en: 'Steps in water and mud' } },
      { name: '', note: { km: 'សំឡេងផ្សេងទៀតទាំងអស់ បង្កើតផ្ទាល់នៅក្នុងកម្មវិធីរុករក', en: 'Every other sound is made live in the browser' } },
    ],
  },
  {
    head: { km: 'ពុម្ពអក្សរ', en: 'Fonts' },
    lines: [
      { name: 'Kantumruy Pro · Koulen', note: { km: 'អក្សរខ្មែរ', en: 'Khmer letters' } },
      { name: 'Pixelify Sans · Nunito Sans', note: { km: 'Google Fonts (SIL Open Font License)', en: 'Google Fonts (SIL Open Font License)' } },
    ],
  },
  {
    head: { km: 'ផែនទីក្នុងរឿង', en: 'Map in the story' },
    lines: [{ name: 'Jembezmamy', note: { km: 'Wikimedia Commons (CC0)', en: 'Wikimedia Commons (CC0)' } }],
  },
  {
    head: { km: 'បង្កើតជាមួយ', en: 'Built with' },
    lines: [{ name: 'three.js · Vite · TypeScript' }],
  },
  {
    head: { km: 'សូមអរគុណ', en: 'Thank you' },
    lines: [{ name: '', note: { km: 'ជូនចំពោះប្រជាជនកម្ពុជា ដែលថែរក្សាអង្គររហូតមកដល់សព្វថ្ងៃ', en: 'To the people of Cambodia, who have kept Angkor to this day' } }],
  },
];
