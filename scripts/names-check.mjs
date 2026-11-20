// The player names' check (src/net/names.ts, AWP-35 "Names"): good names pass, bad ones are refused for the
// right reason. `node scripts/names-check.mjs` (Node runs the .ts as it is: type stripping). Exits 1 on a miss.
import { checkName } from '../src/net/names.ts';

/** Names that must pass (Latin, Khmer, accents, names that hide a short rude word or a team word). */
const GOOD = [
  'Sophia', 'Dara', 'Sokha Chan', 'Jean-Pierre', "O'Brien", 'Zoë', 'José', 'Nguyễn Văn An', 'Li', 'Bo',
  'ដារ៉ា', 'សុខា', 'ចាន់ សុភា', 'សុវណ្ណារី', 'មករា', 'ស្រីនាង',
  'Cassandra', 'Hancock', 'Dickens', 'Yoshitaka', 'Analise', 'Nazira', 'Pornchai', 'Therapist', 'Grape', 'Spicer', 'Essex', 'Glass',
  'Staffan', 'Modesto', 'Devi', 'Bob', 'Nigeria', 'Shitij', 'Peacock', 'Raccoon', 'Assefa', 'Bassam', 'Matsumoto',
  'Abcdefghijklmnop',
  // (not: "Scunthorpe", the old trap of a word matched inside a name: the worst words are matched anywhere, so it is refused)
];

/** Names that must be refused, and why. */
const BAD = [
  ['', 'short'], ['   ', 'short'], ['A', 'short'], ['ក', 'short'],
  ['Abcdefghijklmnopq', 'long'], ['Sokha Chan Dara Vann', 'long'],
  ['Dara🙂', 'letters'], ['Dara_99', 'letters'], ['Дмитрий', 'letters'], ['王小明', 'letters'], ['R2D2', 'letters'], ['Sok!', 'letters'],
  ['fuck', 'rude'], ['FUCK', 'rude'], ['Fuuuuck', 'rude'], ['f.u.c.k', 'rude'], ['f u c k', 'rude'], ['phuck you', 'rude'], ['fvck', 'rude'],
  ['sh1t', 'rude'], ['b1tch', 'rude'], ['b!tch', 'rude'], ['a$$hole', 'rude'], ['@sshole', 'rude'], ['Asssshole', 'rude'], ['d1ck', 'rude'],
  ['big dick', 'rude'], ['Dicks', 'rude'], ['c0ck', 'rude'], ['p0rn', 'rude'], ['s3x', 'rude'], ['5ex', 'rude'], ['n1gger', 'rude'],
  ['n i g g a', 'rude'], ['f4ggot', 'rude'], ['Mr Bitch', 'rude'], ['ImAWhore', 'rude'], ['Cunt', 'rude'], ['Hitler', 'rude'], ['Nazi', 'rude'],
  ['retard', 'rude'], ['Pu55y', 'rude'], ['kys', 'rude'], ['Bullshit', 'rude'], ['Boobs', 'rude'],
  ['ចុយ', 'rude'], ['អាឆ្កែ', 'rude'], ['អា ឆ្កែ', 'rude'], ['អាជ្រូក', 'rude'], ['ចុយម្រាយ', 'rude'], ['អាល្ងង់', 'rude'], ['ចង្រៃ', 'rude'], ['ដារ៉ាចុយ', 'rude'],
  ['choy mrai', 'rude'], ['Achkae', 'rude'], ['a chkae', 'rude'], ['chongrai', 'rude'],
  ['www.dara.com', 'link'], ['http://x', 'link'], ['dara.com', 'link'], ['@dara', 'link'], ['Follow @sok', 'link'], ['discord gg', 'link'], ['tiktok dara', 'link'],
  ['012345678', 'digits'], ['Dara 0123', 'digits'], ['Call 012 345 678', 'digits'], ['Dara ០១២៣៤', 'digits'], ['12-34', 'digits'],
  ['admin', 'staff'], ['Admin Dara', 'staff'], ['4dm1n', 'staff'], ['Moderator', 'staff'], ['m0derat0r', 'staff'], ['staff', 'staff'], ['Mod', 'staff'],
  ['Official', 'staff'], ['Angkor Heritage', 'staff'], ['AngkorHeritage', 'staff'], ['angkor heritage team', 'staff'], ['Developer', 'staff'],
  ['មរតកអង្គរ', 'staff'], ['អ្នកគ្រប់គ្រង', 'staff'],
];

let bad = 0;
for (const n of GOOD) {
  const r = checkName(n);
  if (!r.ok) {
    bad++;
    console.log(`✗ "${n}" should pass, refused: ${r.reason}`);
  }
}
for (const [n, why] of BAD) {
  const r = checkName(n);
  if (r.ok || r.reason !== why) {
    bad++;
    console.log(`✗ "${n}" should be refused (${why}), got: ${r.ok ? 'ok' : r.reason}`);
  }
}
// Tidying: spaces collapsed and trimmed, curly apostrophes straight, zero-width spaces out.
const tidyCases = [['  Sokha   Chan ', 'Sokha Chan'], ['O’Brien', "O'Brien"], ['ដា​រ៉ា', 'ដារ៉ា']];
for (const [n, want] of tidyCases) {
  const r = checkName(n);
  if (!r.ok || r.name !== want) {
    bad++;
    console.log(`✗ "${n}" should be "${want}", got: ${r.ok ? `"${r.name}"` : r.reason}`);
  }
}
const total = GOOD.length + BAD.length + tidyCases.length;
console.log(bad ? `names-check: ${bad} of ${total} wrong` : `names-check: all ${total} right`);
process.exit(bad ? 1 : 0);
