// Print ASCII projections of a voxel part (front / side / top) for quick shape checks.
//   node scripts/voxel-slices.mjs hair
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
const which = process.argv[2] ?? 'hair';

const hair = await server.ssrLoadModule('/src/character/parts/hair.ts');
const head = await server.ssrLoadModule('/src/character/parts/head.ts');

const parts = [];
if (which.includes('hair')) parts.push(['#', hair.buildHair()]);
if (which.includes('head')) parts.push(['o', head.buildHead()]);

// front projection: x horizontal, y vertical, show the front-most material
function project(axisH, axisV, axisD, sign, label) {
  const cells = new Map();
  for (const [ch, b] of parts)
    for (const box of b.boxes) {
      const h = Math.round(box[axisH]);
      const v = Math.round(box[axisV]);
      const d = box[axisD] * sign;
      const k = `${h}|${v}`;
      const cur = cells.get(k);
      if (!cur || d > cur.d) cells.set(k, { d, ch });
    }
  const hs = [...cells.keys()].map((k) => Number(k.split('|')[0]));
  const vs = [...cells.keys()].map((k) => Number(k.split('|')[1]));
  const h0 = Math.min(...hs), h1 = Math.max(...hs), v0 = Math.min(...vs), v1 = Math.max(...vs);
  console.log(`\n== ${label} (${axisH} →, ${axisV} ↑) ==`);
  for (let v = v1; v >= v0; v -= 1) {
    let line = `${v.toFixed(1).padStart(5)} `;
    for (let h = h0; h <= h1; h += 1) {
      const c = cells.get(`${h}|${v}`);
      line += c ? c.ch : '.';
    }
    if (/[#o]/.test(line)) console.log(line);
  }
  console.log(`      ${axisH}: ${h0} … ${h1}`);
}

project('x', 'y', 'z', 1, 'FRONT');
project('z', 'y', 'x', -1, 'SIDE (from character right, front → right)');
await server.close();
