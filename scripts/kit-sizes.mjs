// Prints the world kit's tables as markdown: sizes (real-world size vs the
// reference sheet's estimate, from each asset's `size` field) and scenes (the
// sheet panel each recreates). `--write` puts them into docs/world-kit.md
// between the SIZE TABLE / SCENE TABLE markers.
//
//   node scripts/kit-sizes.mjs [--write]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..');
const sections = ['18.1', '18.2', '19.1', '19.2', '20'];
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const cell = (s) => (s ?? '—').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const rows = ['| § | Asset | Built to (real world) | Sheet said | Why |', '| --- | --- | --- | --- | --- |'];
const scenes = ['| Scene | Recreates | Size | Page |', '| --- | --- | --- | --- |'];
try {
  for (const section of sections) {
    const dir = resolve(root, 'src/kit/assets', section);
    const assets = [];
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))) {
      const a = (await server.ssrLoadModule(`/src/kit/assets/${section}/${f}`)).default;
      assets.push(a);
    }
    assets.sort((a, b) => a.order - b.order);
    for (const a of assets) rows.push(`| ${section} ${a.order} | ${cell(a.name)} | ${cell(a.size.real)} | ${cell(a.size.sheet)} | ${cell(a.size.note)} |`);
  }
  const dir = resolve(root, 'src/kit/scenes');
  const list = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))) {
    const scene = (await server.ssrLoadModule(`/src/kit/scenes/${f}`)).default;
    list.push({ ...scene, id: f.replace(/\.ts$/, '') });
  }
  list.sort((a, b) => a.source.localeCompare(b.source, 'en', { numeric: true }));
  for (const x of list) scenes.push(`| ${cell(x.name)} | ${cell(x.source)} | ${x.size[0]} × ${x.size[1]} m | \`studio.html?scene=${x.id}\` |`);
} finally {
  await server.close();
}
const tables = { SIZE: rows.join('\n'), SCENE: scenes.join('\n') };
if (process.argv.includes('--write')) {
  const doc = resolve(root, 'docs/world-kit.md');
  let text = readFileSync(doc, 'utf8');
  for (const [name, table] of Object.entries(tables)) {
    const re = new RegExp(`<!-- ${name} TABLE -->[\\s\\S]*?<!-- /${name} TABLE -->`);
    if (!re.test(text)) throw new Error(`docs/world-kit.md has no <!-- ${name} TABLE --> … <!-- /${name} TABLE --> markers`);
    text = text.replace(re, `<!-- ${name} TABLE -->\n${table}\n<!-- /${name} TABLE -->`);
  }
  writeFileSync(doc, text);
  console.log(`wrote ${rows.length - 2} assets and ${scenes.length - 2} scenes to docs/world-kit.md`);
} else console.log(`${tables.SIZE}\n\n${tables.SCENE}`);
