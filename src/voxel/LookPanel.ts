import { Raycaster, Vector2, type Camera, type Intersection, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import type GUI from 'three/addons/libs/lil-gui.module.min.js';
import { VOXEL_MATERIALS, voxelFamiliesInUse, type VoxelLookUniforms, type VoxelMaterialKey, type VoxelMaterialSpec } from './materials';

/**
 * Block look panel (K): sliders for every block family on the page (edge
 * strip, speckle, bumps, shine…), changed live on every block of the family.
 * "Pick a block" names the family of the block you click next; "show where"
 * paints a family pink. "Copy changes" puts the values that differ from
 * materials.ts on the clipboard, ready to paste into VOXEL_MATERIALS.
 */
export interface LookPanelOptions {
  /** Camera and canvas rectangle under a client point (null: not over a view). */
  viewAt: (x: number, y: number) => { camera: Camera; rect: DOMRect } | null;
  /** What a pick can hit. */
  pickables: () => Object3D[];
  /** Draw again (pages that render on demand). */
  redraw?: () => void;
}

const HOTKEY = 'KeyK';
const PINK = 0.75;
/** World families (the ones after `stone` in VOXEL_MATERIALS); the rest dress the explorer. */
const KEYS = Object.keys(VOXEL_MATERIALS) as VoxelMaterialKey[];
const isWorld = (key: VoxelMaterialKey) => KEYS.indexOf(key) >= KEYS.indexOf('stone');

/** `K` shows / hides the panel, `?look=1` opens it at load. lil-gui loads on first use. */
export function installLookPanel(o: LookPanelOptions): void {
  let panel: Promise<LookPanel> | null = null;
  const toggle = () => {
    if (panel) void panel.then((p) => p.toggle());
    else panel = import('three/addons/libs/lil-gui.module.min.js').then(({ default: G }) => new LookPanel(G, o));
  };
  addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement | null;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.code !== HOTKEY || typing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.body.classList.contains('reporting')) return;
    toggle();
  });
  if (new URLSearchParams(location.search).get('look') === '1') toggle();
}

interface Family {
  key: VoxelMaterialKey;
  spec: VoxelMaterialSpec;
  material: Material;
  u: VoxelLookUniforms;
  folder: GUI;
  s: { where: boolean; strip: number; width: number; stripColour: string; speckle: number; bumps: number; shine: number; shineBlur: number };
}

class LookPanel {
  private readonly gui: GUI;
  private readonly families: Family[] = [];
  private readonly top = { worldStrips: 1, picked: '—', pick: () => this.startPick(), copy: () => void this.copy(), reset: () => this.gui.reset() };
  private readonly pickedCtrl: ReturnType<GUI['add']>;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private flash = 0;

  constructor(G: typeof GUI, private readonly o: LookPanelOptions) {
    const gui = new G({ title: 'Block look (K to hide)', width: 300 });
    this.gui = gui;
    // (below the top-right Report button)
    Object.assign(gui.domElement.style, { zIndex: '30', top: '88px', maxHeight: 'calc(100% - 96px)' });
    gui.add(this.top, 'pick').name('🎯 Pick a block');
    this.pickedCtrl = gui.add(this.top, 'picked').name('picked').disable();
    gui.add(this.top, 'worldStrips', 0, 2, 0.05).name('all world edge strips ×');
    gui.add(this.top, 'copy').name('📋 Copy changes');
    gui.add(this.top, 'reset').name('↺ Reset all');

    // World families first, then the explorer's.
    const inUse = voxelFamiliesInUse().sort((a, b) => Number(isWorld(b.key)) - Number(isWorld(a.key)));
    for (const { key, material, uniforms: u } of inUse) {
      const spec: VoxelMaterialSpec = VOXEL_MATERIALS[key];
      const lit = !spec.unlit;
      const folder = gui.addFolder(`${key}${isWorld(key) ? '' : ' (explorer)'}`).close();
      const s = {
        where: false,
        strip: spec.edgeStrength,
        width: spec.edgeWidth ?? 1,
        stripColour: `#${u.uEdgeTint.value.getHexString()}`,
        speckle: spec.grain,
        bumps: spec.relief ?? 0,
        shine: spec.specular ?? 0,
        shineBlur: spec.roughness,
      };
      const f: Family = { key, spec, material, u, folder, s };
      folder.add(s, 'where').name('show where (pink)');
      folder.add(s, 'strip', 0, 1, 0.01).name('edge strip');
      folder.add(s, 'width', 0, 1.5, 0.05).name('edge strip width');
      folder.addColor(s, 'stripColour').name('edge strip colour');
      folder.add(s, 'speckle', 0, 0.6, 0.01).name('speckle');
      // (bumps only exist on families built with a relief)
      if (lit && spec.relief) folder.add(s, 'bumps', 0, 0.3, 0.005).name('bumps');
      if (lit) {
        folder.add(s, 'shine', 0, 1, 0.01).name('shine');
        folder.add(s, 'shineBlur', 0, 1, 0.01).name('shine blur');
      }
      this.families.push(f);
    }
    gui.onChange(() => this.apply());
    this.apply();
  }

  toggle(): void {
    this.gui.show(this.gui._hidden);
  }

  /** Panel values → shader uniforms and materials. */
  private apply(): void {
    for (const { key, material, u, s } of this.families) {
      u.uEdgeStrength.value = s.strip * (isWorld(key) ? this.top.worldStrips : 1);
      u.uEdgeWidth.value = s.width;
      u.uEdgeTint.value.set(s.stripColour);
      u.uGrain.value = s.speckle;
      u.uRelief.value = s.bumps;
      u.uSpecular.value = s.shine;
      u.uHighlight.value = s.where || (this.flash && key === this.top.picked) ? PINK : 0;
      if ('roughness' in material) (material as MeshStandardMaterial).roughness = s.shineBlur;
    }
    this.o.redraw?.();
  }

  // ── Pick a block ─────────────────────────────────────────────────────────

  private startPick(): void {
    this.top.picked = 'click a block…';
    this.pickedCtrl.updateDisplay();
    document.body.style.cursor = 'crosshair';
    const onDown = (e: PointerEvent) => {
      if (this.gui.domElement.contains(e.target as Node)) return;
      // The click is ours: no camera drag, no link.
      e.preventDefault();
      e.stopPropagation();
      removeEventListener('pointerdown', onDown, true);
      const noClick = (c: MouseEvent) => (c.preventDefault(), c.stopPropagation());
      addEventListener('click', noClick, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', noClick, true), 600);
      document.body.style.cursor = '';
      this.picked(this.familyAt(e.clientX, e.clientY));
    };
    addEventListener('pointerdown', onDown, true);
  }

  private familyAt(x: number, y: number): string {
    const view = this.o.viewAt(x, y);
    if (!view) return 'nothing there';
    const r = view.rect;
    // (a fifth of a pixel off, so the ray doesn't slip down a seam between flush blocks)
    this.ndc.set(((x + 0.21 - r.left) / r.width) * 2 - 1, -((y + 0.17 - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, view.camera);
    const hits: Intersection[] = [];
    for (const root of this.o.pickables())
      root.traverseVisible((m) => {
        if ((m as Mesh).isMesh) m.raycast(this.raycaster, hits);
      });
    hits.sort((a, b) => a.distance - b.distance);
    const hit = hits[0];
    if (!hit) return 'sky';
    const mat = (hit.object as Mesh).material as Material;
    const name = mat.name ?? '';
    return name.startsWith('voxel:') ? name.slice('voxel:'.length) : `not a block: ${hit.object.name || name || mat.type}`;
  }

  private picked(what: string): void {
    this.top.picked = what;
    this.pickedCtrl.updateDisplay();
    const f = this.families.find((x) => x.key === what);
    if (!f) return;
    for (const x of this.families) x.folder.open(x === f);
    f.folder.domElement.scrollIntoView({ block: 'nearest' });
    // Flash the family pink for a moment.
    this.flash++;
    this.apply();
    setTimeout(() => {
      this.flash--;
      this.apply();
    }, 1200);
  }

  // ── Copy changes ─────────────────────────────────────────────────────────

  /** The values that differ from VOXEL_MATERIALS, as lines to paste into it. */
  private changes(): string {
    const lines: string[] = [];
    const num = (v: number) => String(Math.round(v * 1000) / 1000);
    for (const { key, spec, u, s } of this.families) {
      const out: string[] = [];
      const diff = (name: string, now: number, was: number) => {
        if (Math.abs(now - was) > 1e-4) out.push(`${name}: ${num(now)}`);
      };
      diff('edgeStrength', u.uEdgeStrength.value, spec.edgeStrength);
      diff('edgeWidth', s.width, spec.edgeWidth ?? 1);
      if (u.uEdgeTint.value.getHex() !== spec.edgeTint) out.push(`edgeTint: 0x${u.uEdgeTint.value.getHexString()}`);
      diff('grain', s.speckle, spec.grain);
      if (spec.relief) diff('relief', s.bumps, spec.relief);
      if (!spec.unlit) {
        diff('specular', s.shine, spec.specular ?? 0);
        diff('roughness', s.shineBlur, spec.roughness);
      }
      if (out.length) lines.push(`  ${key}: { ${out.join(', ')} },`);
    }
    return lines.length ? `// Block look changes (src/voxel/materials.ts, VOXEL_MATERIALS)\n${lines.join('\n')}` : '';
  }

  private async copy(): Promise<void> {
    const text = this.changes();
    if (!text) {
      this.say('no changes yet');
      return;
    }
    console.log(text);
    try {
      await navigator.clipboard.writeText(text);
      this.say('copied ✓ — paste it to Claude');
    } catch {
      this.say('see the console (copy failed)');
    }
  }

  private say(msg: string): void {
    this.top.picked = msg;
    this.pickedCtrl.updateDisplay();
  }
}
