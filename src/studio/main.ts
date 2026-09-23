import { Box3, Group, Vector3 } from 'three';
import { AngkorExplorer } from '../character/AngkorExplorer';
import { FeedbackTool } from '../feedback/FeedbackTool';
import { KIT_SECTIONS, kitAssetIds, loadKitAsset, loadKitSection, type KitSectionInfo } from '../kit/registry';
import type { KitAsset, KitPiece, KitSection, KitShot, KitView } from '../kit/types';
import { buildVoxelMesh, type VoxelQuality } from '../voxel/VoxelMesh';
import { CHARACTER_HEIGHT_M } from '../world/scale';
import { Stage, type StageView, type Subject } from './Stage';

/**
 * Voxel asset studio — the world kit on reference-sheet style pages, to inspect
 * each component of the Angkor Wat plan against its sheet:
 *
 *   studio.html?section=18.1                 a whole sheet section (cards)
 *   studio.html?asset=18.1/large-tree        one asset: views, reference, scale, variants
 *     &variant=…&seed=3&quality=high
 *   studio.html?lineup=18.1                  every asset of a section side by side, to scale
 *
 * Add `shot=1` for headless screenshots (scripts/screenshots.mjs).
 */
const params = new URLSearchParams(location.search);
const shot = params.get('shot') === '1';
const quality = (params.get('quality') as VoxelQuality | null) ?? 'medium';
if (shot) document.body.classList.add('shot');
document.documentElement.classList.add('studio');

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const page = document.getElementById('page')!;
const light: Record<string, number> = {};
for (const k of ['hemi', 'key', 'fill', 'rim', 'env']) if (params.has(k)) light[k] = Number(params.get(k));
const stage = new Stage(canvas, { shot, pageBg: '#f1eadb', light });
const t0 = performance.now();
let blocksTotal = 0;

// ── Building pieces ───────────────────────────────────────────────────────────
const pieces = new Map<string, KitPiece>();
/** `&height=` overrides the main size of assets that support it (trees, ponds…). */
const heightParam = params.has('height') ? Number(params.get('height')) : undefined;
function buildPiece(asset: KitAsset, variant: string, seed: number): KitPiece {
  const k = `${asset.id}|${variant}|${seed}`;
  let p = pieces.get(k);
  if (!p) {
    const t = performance.now();
    p = asset.build({ variant, seed, height: params.has('asset') ? heightParam : undefined });
    pieces.set(k, p);
    console.info(`[kit] ${asset.id} · ${variant} · seed ${seed}: ${p.voxels.boxes.length} blocks in ${(performance.now() - t).toFixed(0)} ms`);
  }
  return p;
}

function localBounds(piece: KitPiece): Box3 {
  const { min, max } = piece.voxels.bounds();
  const b = Number.isFinite(min[0]) ? new Box3(new Vector3(...min), new Vector3(...max)) : new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
  for (const e of piece.extras ?? []) b.expandByObject(e);
  return b;
}

/** An object for one piece (each view subject needs its own copy). */
function pieceObject(piece: KitPiece, name: string): Group {
  const g = new Group();
  g.name = `kit:${name}`;
  if (piece.voxels.boxes.length) g.add(buildVoxelMesh(piece.voxels, { quality, name }));
  for (const e of piece.extras ?? []) g.add(e.clone());
  blocksTotal += piece.voxels.boxes.length;
  return g;
}

function explorerFigure(): Group {
  const e = new AngkorExplorer({ quality: 'medium', outfit: 'default' });
  e.blinking = false;
  for (let i = 0; i < 40; i++) e.update(1 / 60);
  const g = new Group();
  g.name = 'scale-explorer';
  g.add(e.object);
  return g;
}

/** A subject showing one piece, optionally with the 1.7 m explorer beside it. */
function subjectFor(asset: KitAsset, variant: string, seed: number, human = false): Subject {
  const piece = buildPiece(asset, variant, seed);
  const obj = pieceObject(piece, `${asset.id}:${variant}`);
  const local = localBounds(piece);
  if (human) {
    // Stand the explorer on the piece's floor, a step left of it, facing the camera.
    const fig = explorerFigure();
    fig.position.set(local.min.x - 0.9, local.min.y, (local.min.z + local.max.z) / 2 + Math.min(0.5, (local.max.z - local.min.z) / 2));
    obj.add(fig);
    local.union(new Box3(new Vector3(fig.position.x - 0.35, local.min.y, fig.position.z - 0.25), new Vector3(fig.position.x + 0.35, local.min.y + CHARACTER_HEIGHT_M, fig.position.z + 0.25)));
  }
  return stage.addSubject(obj, local);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function link(text: string, q: Record<string, string>, cls = ''): HTMLAnchorElement {
  const a = el('a', cls, text);
  a.href = `?${new URLSearchParams(q).toString()}`;
  return a;
}

const VIEW_NAMES: Record<KitView, string> = { iso: 'Isometric view', 'iso-low': 'Front view', front: 'Front view', side: 'Side view', back: 'Back view', top: 'Top view', elevation: 'Elevation' };

/** 22.4 m · 1.25 m · 35 cm */
const metres = (m: number) => (m >= 10 ? `${m.toFixed(1)} m` : m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

function dimsOf(b: Box3): string {
  const s = b.getSize(new Vector3());
  return `${metres(s.x)} × ${metres(s.z)} footprint · ${metres(s.y)} tall`;
}

function header(info: KitSectionInfo | null, crumb?: string): HTMLElement {
  const h = el('header', 'st-header');
  const brand = el('a', 'st-brand');
  brand.href = '?';
  brand.innerHTML = '<b>Angkor Wat</b><span>Voxel Asset Studio</span>';
  const title = el('div', 'st-title');
  title.append(el('h1', '', info ? info.sheet : 'World kit'), el('p', '', crumb ?? (info ? `${info.title} — ${info.subtitle}` : 'Sections 18–20 of the component plan')));
  const nav = el('nav', 'st-nav');
  for (const s of KIT_SECTIONS) {
    const a = link(s.title, { section: s.id });
    if (info?.id === s.id) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  nav.append(link('Scale lineup', { lineup: info?.id ?? '18.1' }, 'st-alt'));
  h.append(brand, title, nav);
  return h;
}

function band(num: string, text: string, right = ''): HTMLElement {
  const b = el('div', 'st-band');
  b.append(el('span', 'st-num', num), el('span', 'st-band-title', text));
  if (right) b.append(el('span', 'st-band-right', right));
  return b;
}

/** A view element bound to a subject. */
function viewBox(cls: string, subject: Subject, view: KitView, o: { orbit?: boolean; after?: StageView['after']; bg?: string; pad?: number } = {}): { box: HTMLDivElement; view: StageView } {
  const box = el('div', `st-view ${cls}`);
  return { box, view: stage.addView(box, subject, view, o) };
}

// ── Ruler overlay for elevation views ─────────────────────────────────────────
function niceStep(h: number): number {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10]) if (h / s <= 8) return s;
  return 20;
}

function ruler(label: (h: number) => string = (h) => `${metres(h)}`): NonNullable<StageView['after']> {
  return (v, rect) => {
    let r = v.el.querySelector<HTMLDivElement>('.st-ruler');
    if (!r) {
      r = el('div', 'st-ruler');
      v.el.append(r);
    }
    // Elevation views look level, so camera-space y is world height minus the camera's.
    const b = v.subject.bounds;
    const px = rect.height / (v.camera.top - v.camera.bottom);
    const yPx = (h: number) => (v.camera.top - (h - v.camera.position.y)) * px;
    const top = b.max.y;
    const step = niceStep(top);
    const parts: string[] = [];
    for (let h = 0; h <= top + 1e-6; h += step) parts.push(`<div class="tick" style="top:${yPx(h).toFixed(1)}px"><span>${h === 0 ? '0 m' : metres(h)}</span></div>`);
    parts.push(`<div class="height" style="top:${yPx(top).toFixed(1)}px;height:${(top * px).toFixed(1)}px"><span>${label(top)}</span></div>`);
    r.innerHTML = parts.join('');
  };
}

// ── Pages ─────────────────────────────────────────────────────────────────────
function defaultShots(asset: KitAsset): KitShot[] {
  if (asset.shots) return asset.shots;
  if (asset.variants.length > 1) return [...asset.variants.slice(1, 4).map((v) => ({ view: 'iso' as KitView, variant: v.id, label: v.name })), { view: 'top', label: 'Top view' }];
  return [
    { view: 'side', label: 'Side view' },
    { view: 'top', label: 'Top view' },
  ];
}

function sizeLine(asset: KitAsset, b: Box3): HTMLElement {
  const p = el('p', 'st-size');
  p.innerHTML = `<b>${dimsOf(b)}</b><br>real ${asset.size.real}${asset.size.sheet ? ` · <s title="the sheet's estimate">sheet ${asset.size.sheet}</s>` : ''}`;
  if (asset.size.note) p.title = asset.size.note;
  return p;
}

function errorCard(id: string, error: unknown): HTMLElement {
  console.error(`[kit] ${id}:`, error);
  const c = el('article', 'st-card st-error');
  c.append(el('h2', '', id), el('pre', '', error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)));
  return c;
}

async function sectionPage(section: KitSection): Promise<void> {
  const info = KIT_SECTIONS.find((s) => s.id === section) ?? KIT_SECTIONS[0];
  page.append(header(info), band(info.id, info.title.replace(/^[\d.]+ /, '').toUpperCase(), 'Click a card to inspect it'));
  const grid = el('main', `st-grid st-grid-${section.replace('.', '-')}`);
  page.append(grid);
  const { assets, errors } = await loadKitSection(section);
  for (const asset of assets) {
    try {
      grid.append(card(asset));
    } catch (e) {
      grid.append(errorCard(asset.id, e));
    }
  }
  for (const e of errors) grid.append(errorCard(e.id, e.error));
  if (!assets.length && !errors.length) grid.append(el('p', 'st-empty', `No assets yet — add modules under src/kit/assets/${section}/.`));
}

function card(asset: KitAsset): HTMLElement {
  const c = el('article', 'st-card');
  const title = el('h2');
  title.append(el('span', 'n', String(asset.order)), el('span', '', asset.name));
  const open = link('Inspect →', { asset: asset.id }, 'st-open');
  c.append(title);
  const main = asset.variants[0].id;
  const mainSubject = subjectFor(asset, main, 1);
  const mainView = asset.mainView ?? 'iso';
  const { box } = viewBox('st-main', mainSubject, mainView);
  c.append(box, el('div', 'st-label', mainView === 'iso' && asset.variants.length > 1 ? asset.variants[0].name : VIEW_NAMES[mainView]));
  const row = el('div', 'st-row');
  for (const s of defaultShots(asset)) {
    const variant = s.variant ?? main;
    const seed = s.seed ?? 1;
    const subject = variant === main && seed === 1 ? mainSubject : subjectFor(asset, variant, seed);
    const fig = el('figure');
    fig.append(viewBox('st-small', subject, s.view).box, el('figcaption', '', s.label));
    row.append(fig);
  }
  c.append(row, el('p', 'st-caption', asset.caption), sizeLine(asset, mainSubject.bounds), open);
  return c;
}

function refCrop(asset: KitAsset, width: number): HTMLElement | null {
  if (!asset.ref) return null;
  const [x0, y0, x1, y1] = asset.ref.box;
  const k = width / (x1 - x0);
  const fig = el('figure', 'st-ref');
  const img = el('div', 'st-refimg');
  const url = encodeURI(`/assets/angkor detail/${asset.ref.sheet}`);
  Object.assign(img.style, {
    width: `${width}px`,
    height: `${(y1 - y0) * k}px`,
    backgroundImage: `url("${url}")`,
    backgroundSize: `${1536 * k}px ${1024 * k}px`,
    backgroundPosition: `${-x0 * k}px ${-y0 * k}px`,
  });
  fig.append(img, el('figcaption', '', `Reference · ${asset.ref.sheet.split('/').pop()}`));
  return fig;
}

async function assetPage(id: string): Promise<void> {
  let asset: KitAsset;
  try {
    asset = await loadKitAsset(id);
  } catch (e) {
    page.append(header(null, id), errorCard(id, e));
    return;
  }
  const info = KIT_SECTIONS.find((s) => s.id === asset.section) ?? null;
  const variant = params.get('variant') ?? asset.variants[0].id;
  const seed = Number(params.get('seed') ?? 1);
  const view = (params.get('view') as KitView | null) ?? asset.mainView ?? 'iso';
  page.append(header(info, `${info?.title ?? asset.section} › ${asset.order}. ${asset.name}`));
  page.append(band(`${asset.section}·${asset.order}`, asset.name.toUpperCase(), asset.caption));

  // Chips: variants and seeds.
  const bar = el('div', 'st-chips');
  const q = (o: Record<string, string>) => ({ asset: id, variant, seed: String(seed), ...(quality !== 'medium' ? { quality } : {}), ...o });
  const vg = el('div', 'chips');
  vg.append(el('span', 'st-chip-label', 'Variant'));
  for (const v of asset.variants) {
    const a = link(v.name, q({ variant: v.id }));
    if (v.id === variant) a.setAttribute('aria-pressed', 'true');
    vg.append(a);
  }
  const sg = el('div', 'chips');
  sg.append(el('span', 'st-chip-label', 'Seed'));
  for (let s = 1; s <= 6; s++) {
    const a = link(String(s), q({ seed: String(s) }));
    if (s === seed) a.setAttribute('aria-pressed', 'true');
    sg.append(a);
  }
  bar.append(vg, sg);
  page.append(bar);

  const top = el('div', 'st-asset');
  let subject: Subject;
  try {
    subject = subjectFor(asset, variant, seed);
  } catch (e) {
    page.append(errorCard(id, e));
    return;
  }
  const mainBox = viewBox('st-big', subject, view, { orbit: !shot, pad: 0.06 });
  const dims = el('div', 'st-dims', dimsOf(subject.bounds));
  mainBox.box.append(dims, el('div', 'st-hint', shot ? '' : 'drag to orbit · wheel to zoom · B to report'));
  const side = el('aside', 'st-side');
  const ref = refCrop(asset, 300);
  if (ref) side.append(ref);
  const three = el('div', 'st-three');
  for (const v of ['front', 'side', 'top'] as KitView[]) {
    const fig = el('figure');
    fig.append(viewBox('st-small', subject, v).box, el('figcaption', '', VIEW_NAMES[v]));
    three.append(fig);
  }
  side.append(three);
  top.append(mainBox.box, side);
  page.append(top);

  // Scale: the piece next to the 1.7 m explorer, in true elevation, with a ruler.
  const bottom = el('div', 'st-asset-bottom');
  const scaleFig = el('figure', 'st-scale');
  const scaleSubject = subjectFor(asset, variant, seed, true);
  scaleFig.append(viewBox('st-scaleview', scaleSubject, 'elevation', { after: ruler(), pad: 0.1 }).box, el('figcaption', '', `Scale — explorer ${CHARACTER_HEIGHT_M.toFixed(2)} m`));
  bottom.append(scaleFig);
  const vars = el('div', 'st-variants');
  for (const v of asset.variants) {
    const fig = el('figure');
    const s = v.id === variant ? subject : subjectFor(asset, v.id, seed);
    const vb = viewBox('st-small', s, 'iso');
    const a = link('', q({ variant: v.id }), 'st-varlink');
    a.append(vb.box);
    fig.append(a, el('figcaption', '', v.name));
    vars.append(fig);
  }
  if (asset.variants.length > 1) bottom.append(vars);
  page.append(bottom);

  const piece = buildPiece(asset, variant, seed);
  const fam = new Map<string, number>();
  for (const b of piece.voxels.boxes) fam.set(b.mat, (fam.get(b.mat) ?? 0) + 1);
  const table = el('dl', 'st-info');
  const row = (k: string, v: string) => table.append(el('dt', '', k), el('dd', '', v));
  row('Measured', dimsOf(subject.bounds));
  row('Real size', asset.size.real);
  if (asset.size.sheet) row('Sheet estimate', asset.size.sheet);
  if (asset.size.note) row('Why', asset.size.note);
  row('Blocks', `${piece.voxels.boxes.length.toLocaleString()} (${[...fam].map(([m, n]) => `${m} ${n.toLocaleString()}`).join(' · ')}) · ${fam.size} draw calls`);
  row('Colliders', piece.colliders.length ? `${piece.colliders.length} box${piece.colliders.length > 1 ? 'es' : ''}` : 'none (walk-through)');
  row('Code', `src/kit/assets/${asset.id}.ts`);
  page.append(table);
}

async function lineupPage(section: KitSection): Promise<void> {
  const info = KIT_SECTIONS.find((s) => s.id === section) ?? KIT_SECTIONS[0];
  page.append(header(info, `${info.title} — every asset to scale beside the ${CHARACTER_HEIGHT_M.toFixed(2)} m explorer`));
  page.append(band(info.id, 'SCALE REFERENCE', 'front elevation · 1 unit = 1 m'));
  const { assets, errors } = await loadKitSection(section);
  const group = new Group();
  group.name = `lineup:${section}`;
  const local = new Box3();
  const fig = explorerFigure();
  group.add(fig);
  local.union(new Box3(new Vector3(-0.35, 0, -0.3), new Vector3(0.35, CHARACTER_HEIGHT_M, 0.3)));
  let x = 1.2;
  const labels: { x: number; name: string; h: number }[] = [{ x: 0, name: `Explorer ${CHARACTER_HEIGHT_M} m`, h: CHARACTER_HEIGHT_M }];
  for (const asset of assets) {
    try {
      const piece = buildPiece(asset, asset.variants[0].id, 1);
      const b = localBounds(piece);
      const obj = pieceObject(piece, asset.id);
      const w = b.max.x - b.min.x;
      obj.position.set(x - b.min.x, -b.min.y, -(b.min.z + b.max.z) / 2);
      group.add(obj);
      local.union(b.clone().translate(obj.position));
      labels.push({ x: x + w / 2, name: asset.name, h: b.max.y - b.min.y });
      x += w + Math.max(0.6, w * 0.25);
    } catch (e) {
      console.error(`[kit] ${asset.id}:`, e);
    }
  }
  for (const e of errors) console.error(`[kit] ${e.id}:`, e.error);
  const subject = stage.addSubject(group, local);
  const box = viewBox('st-lineup', subject, 'elevation', {
    pad: 0.06,
    after: (v, rect) => {
      ruler()(v, rect);
      let lab = v.el.querySelector<HTMLDivElement>('.st-lineup-labels');
      if (!lab) {
        lab = el('div', 'st-lineup-labels');
        v.el.append(lab);
      }
      const origin = subject.object.position;
      lab.innerHTML = labels
        .map((l) => {
          const s = stage.screenIn(v, new Vector3(origin.x + l.x, origin.y, origin.z));
          return s ? `<div style="left:${(s.x - rect.left).toFixed(0)}px"><b>${l.name}</b><span>${metres(l.h)}</span></div>` : '';
        })
        .join('');
    },
  }).box;
  page.append(box);
}

function indexPage(): void {
  page.append(header(null));
  const list = el('main', 'st-index');
  for (const s of KIT_SECTIONS) {
    const ids = kitAssetIds(s.id);
    const c = el('article', 'st-card');
    c.append(el('h2', '', s.title), el('p', 'st-caption', s.subtitle), el('p', 'st-size', `${ids.length} asset module${ids.length === 1 ? '' : 's'}`));
    c.append(link('Open sheet →', { section: s.id }, 'st-open'));
    list.append(c);
  }
  page.append(list);
}

// ── Main ──────────────────────────────────────────────────────────────────────
function sizeCanvas(): void {
  if (shot) {
    // Screenshots capture the whole page: the canvas covers the document.
    const h = Math.max(innerHeight, document.documentElement.scrollHeight);
    canvas.style.position = 'absolute';
    canvas.style.height = `${h}px`;
    stage.resize(innerWidth, h);
  } else stage.resize(innerWidth, innerHeight);
}

async function main(): Promise<void> {
  if (params.has('asset')) await assetPage(params.get('asset')!);
  else if (params.has('lineup')) await lineupPage(params.get('lineup') as KitSection);
  else if (params.has('section')) await sectionPage(params.get('section') as KitSection);
  else indexPage();
  const buildMs = performance.now() - t0;
  console.info(`[kit] studio built in ${buildMs.toFixed(0)} ms, ${blocksTotal} blocks on ${stage.subjects.length} subjects, ${stage.views.length} views`);
  sizeCanvas();
  if (shot) {
    stage.render(true);
    (window as unknown as { __ready: boolean }).__ready = true;
    return;
  }
  addEventListener('resize', sizeCanvas);
  addEventListener('scroll', () => stage.invalidate(), { passive: true });
  const feedback = new FeedbackTool({
    renderer: stage.renderer,
    scene: stage.scene,
    camera: stage.views[0]?.camera ?? stage.key.shadow.camera,
    pickables: () => stage.pickables(),
    events: page,
    viewAt: (x, y) => {
      const v = stage.viewAt(x, y);
      return v ? { camera: v.camera, rect: v.el.getBoundingClientRect() } : null;
    },
    screenOf: (p) => {
      const v = stage.viewOf(p);
      return v ? stage.screenIn(v, p) : null;
    },
    render: () => stage.render(true),
    state: () => ({
      Studio: `${params.toString() || 'index'} · quality ${quality}`,
      Scene: `${stage.subjects.length} subjects · ${stage.views.length} views · ${blocksTotal.toLocaleString()} blocks · built in ${buildMs.toFixed(0)} ms`,
    }),
    repro: () => {
      const q = new URLSearchParams(location.search);
      q.delete('shot');
      return q;
    },
  });
  // Picking while reporting must not follow the card / variant links.
  page.addEventListener('click', (e) => {
    if (feedback.active && e.target instanceof Element && e.target.closest('a')) e.preventDefault();
  }, true);
  const tick = () => {
    stage.render();
    feedback.update();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  Object.assign(window, { stage, feedback });
}

main().catch((e) => {
  console.error('[kit] studio failed:', e);
  page.append(errorCard('studio', e));
  (window as unknown as { __ready: boolean }).__ready = true;
});
