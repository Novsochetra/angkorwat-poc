import type { HeightField } from '../heightfield';

export function probeField(field: HeightField): void {
  const rows: string[] = [];
  for (let z = -320; z <= -196; z += 2) {
    let s = `${String(z).padStart(5)} `;
    for (let x = 330; x <= 470; x += 2) {
      const c = field.index(x + 1, z + 1);
      const w = field.water[c] > -1000;
      const h = field.height[c];
      let ch: string;
      if (w) ch = 'W';
      else if (field.trail[c] === 2) ch = 'T';
      else if (field.trail[c] === 1) ch = 't';
      else if (field.occupied[c]) ch = 'o';
      else ch = h === 8 ? '.' : h < 8 ? String.fromCharCode(97 + Math.max(0, Math.min(25, Math.round(h)))) : String(Math.min(9, Math.round((h - 8) / 2)));
      s += ch;
    }
    rows.push(s);
  }
  console.info('[map] probe\n' + rows.join('\n'));
}
