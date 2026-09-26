import {
  BoxGeometry,
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Matrix4,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { AABB, ColliderWorld } from '../game/world/Colliders';
import posthog, { isPostHogConfigured } from '../posthog';
import { areaPick, samePose, viewPose, type Area, type Point } from './area';
import { pick, type Pick } from './pick';
import { errorCount, reportMarkdown, reportSlug, type ReportData } from './report';
import { resolveTrace, type SourceTrace } from './sourceTrace';

/** One camera's view on screen (client pixels). */
export interface FeedbackView {
  camera: Camera;
  rect: { left: number; top: number; width: number; height: number };
}

export interface FeedbackOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  /** Roots whose meshes can be picked. */
  pickables: () => Object3D[];
  colliders?: ColliderWorld;
  /** The explorer's feet, for distances in the report. */
  anchor?: () => Vector3;
  /** Page state for the report, label → value. */
  state: () => Record<string, string>;
  /** Query string that reproduces the current view of this page. */
  repro: () => URLSearchParams;
  // ── Pages that draw several views into one canvas (the asset studio) ──
  /** Element whose clicks pick (default: the canvas). */
  events?: HTMLElement;
  /** The view under a client point, or null if none (default: `camera` over the whole canvas). */
  viewAt?: (x: number, y: number) => FeedbackView | null;
  /** Client position of a world point, or null when it isn't shown (default: projected with `camera`). */
  screenOf?: (p: Vector3) => { x: number; y: number } | null;
  /** Draw a fresh full frame for the screenshot (default: renderer.render(scene, camera)). */
  render?: () => void;
}

/** Served by src/feedback/vitePlugin.ts (dev server and `vite preview`). */
const ENDPOINT = '/__feedback';
const HOTKEY = 'KeyB';
const MAX_PICKS = 20;

const line = (color: number, onTop = true, opacity = 1) => new LineBasicMaterial({ color, depthTest: !onTop, transparent: true, opacity, fog: false, toneMapped: false });
// (an area's blocks are outlined faintly and only where they show: all their edges on top would hide the problem)
const LINES = { hover: line(0xffffff), pick: line(0xffd27a), area: line(0xffd27a, false, 0.45), collider: line(0xff6b3d), map: line(0xff9a3c, false), mapWater: line(0x4cc3ff, false) };
const UNIT_BOX = new EdgesGeometry(new BoxGeometry(1, 1, 1));
const SVG = 'http://www.w3.org/2000/svg';

/** How a press on the scene picks: one thing, or everything inside a drawn box / loop. */
type Tool = 'click' | Area['tool'];
const HOW: Record<Tool, string> = {
  click: "Click or tap what's wrong — as many things as you like. Drag to look around.",
  box: "Drag a box around what's wrong: everything you can see inside it is picked. A tap picks one thing; 👆 Click looks around again.",
  loop: "Draw a loop around what's wrong: everything you can see inside it is picked. A tap picks one thing; 👆 Click looks around again.",
};
const KEYS = ' Shift + drag draws a box, Alt (⌥) + drag a loop.';

/** A box or loop being drawn. */
interface Drawing {
  tool: Area['tool'];
  pointer: number;
  view: FeedbackView;
  /** Box: start and current corner. Loop: the path so far. */
  points: Point[];
  t: number;
}

/**
 * Bug / idea reporter for the game and the viewer. B (or the 🐞 button) freezes
 * the page — the host skips its updates while {@link active} — then clicks pick
 * blocks, meshes and colliders, and "Save report" writes
 * feedback/<date>-<slug>/report.md + screenshot.jpg through the dev server. Each
 * pick names the code that created it, so the report leads straight to the fix.
 */
export class FeedbackTool {
  private open = false;
  private mode: 'picking' | 'saving' | 'saved' = 'picking';
  private kind: ReportData['kind'] = 'bug';
  private picks: Pick[] = [];
  private readonly hints = new WeakMap<Pick, string>();
  private tool: Tool = 'click';
  private drawing: Drawing | null = null;
  private hoverAt: { x: number; y: number } | null = null;
  private down: { x: number; y: number; t: number } | null = null;
  private savedText = '';
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly v = new Vector3();
  private readonly outlines = new Group();
  private readonly hoverLines = new Group();
  private readonly colliderMap = new Group();
  private frames = 0;
  private frameMs = 0;
  private lastFrame = performance.now();
  private fps = 0;
  private fpsAtOpen = 0;
  private errorsShown = 0;
  private readonly button = document.createElement('button');
  private readonly panel = document.createElement('aside');
  private readonly tip = document.createElement('div');
  private readonly pins = document.createElement('div');
  private readonly shapes = document.createElementNS(SVG, 'svg');
  private shapesDrawn = '';
  /** The element whose presses pick (the canvas, or the studio's page), and its own touch-action. */
  private readonly surface: HTMLElement;
  private readonly touchAction: string;
  private readonly coarse = matchMedia('(pointer: coarse)').matches;
  private readonly ui;

  constructor(private readonly o: FeedbackOptions) {
    this.button.type = 'button';
    this.button.className = 'fb-button';
    this.button.textContent = '🐞 Report';
    this.button.title = 'Report a bug or an idea (B)';
    this.button.onclick = () => this.show();

    this.panel.className = 'panel fb-panel';
    this.panel.innerHTML = `
      <h1></h1>
      <div class="chips fb-tools" role="group" aria-label="Pick with"><button type="button" data-tool="click">👆 Click</button><button type="button" data-tool="box">▭ Box</button><button type="button" data-tool="loop">◯ Loop</button></div>
      <p class="sub"></p>
      <ol class="fb-picks"></ol>
      <div class="chips"><button type="button" data-kind="bug">🐞 Bug</button><button type="button" data-kind="idea">💡 Idea</button></div>
      <textarea rows="4" placeholder="What's wrong, and what did you expect? Any language is fine."></textarea>
      <label class="row"><span>Show colliders nearby</span><input type="checkbox" /></label>
      <div class="fb-status" role="status"></div>
      <div class="fb-actions"><button type="button"></button><button type="button" class="fb-primary"></button></div>`;
    const $ = <T extends Element>(sel: string) => this.panel.querySelector<T>(sel)!;
    const [secondary, primary] = this.panel.querySelectorAll<HTMLButtonElement>('.fb-actions button');
    this.ui = {
      title: $<HTMLElement>('h1'),
      how: $<HTMLElement>('.sub'),
      tools: [...this.panel.querySelectorAll<HTMLButtonElement>('[data-tool]')],
      list: $<HTMLOListElement>('.fb-picks'),
      kinds: [...this.panel.querySelectorAll<HTMLButtonElement>('[data-kind]')],
      note: $<HTMLTextAreaElement>('textarea'),
      colliders: $<HTMLInputElement>('input[type=checkbox]'),
      status: $<HTMLElement>('.fb-status'),
      primary,
      secondary,
    };
    for (const b of this.ui.kinds)
      b.onclick = () => {
        this.kind = b.dataset.kind as ReportData['kind'];
        this.renderKind();
      };
    for (const b of this.ui.tools) b.onclick = () => this.setTool(b.dataset.tool as Tool);
    this.ui.colliders.onchange = () => this.mapColliders(this.ui.colliders.checked);
    // Pages without a collision world (the studio) have no colliders to show.
    if (!o.colliders) this.ui.colliders.closest('label')!.style.display = 'none';
    primary.onclick = () => (this.mode === 'saved' ? this.close() : void this.save());
    secondary.onclick = () => (this.mode === 'saved' ? void this.copy() : this.close());

    this.tip.className = 'fb-tip';
    this.pins.className = 'fb-pins';
    this.shapes.classList.add('fb-shapes');
    document.body.append(this.button, this.panel, this.tip, this.shapes, this.pins);
    o.scene.add(this.outlines, this.hoverLines, this.colliderMap);
    this.surface = o.events ?? o.renderer.domElement;
    this.touchAction = this.surface.style.touchAction;
    this.setTool('click');

    addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (!this.open) {
        if (e.code === HOTKEY && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.show();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (this.drawing) this.drawing = null;
        else this.close();
      } else if (e.code === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.save();
      }
    });

    // A click that doesn't drag picks; drags keep turning the camera.
    const canvas = this.surface;
    // (on a page-wide element, the reporter's own panel and the page's controls don't pick)
    const ours = (e: Event) => e.target instanceof Element && (this.panel.contains(e.target) || this.button.contains(e.target) || (!!o.events && !!e.target.closest('button, input, select, textarea, label')));

    // Box / loop (or Shift / Alt + drag): the drag draws instead. These listeners
    // run first (window, capture phase) and keep the drag from the page's camera.
    addEventListener('pointerdown', (e) => {
      if (!this.open || this.mode !== 'picking' || this.drawing || !e.isPrimary || e.button !== 0) return;
      if (!(e.target instanceof Node) || !canvas.contains(e.target) || ours(e)) return;
      const tool = e.shiftKey ? 'box' : e.altKey ? 'loop' : this.tool;
      const view = tool === 'click' ? null : this.viewAt(e.clientX, e.clientY);
      if (tool === 'click' || !view) return;
      e.stopPropagation();
      e.preventDefault();
      this.drawing = { tool, pointer: e.pointerId, view, points: [{ x: e.clientX, y: e.clientY }], t: performance.now() };
      this.down = null;
      this.setHover(null);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // (a pointer that is already gone)
      }
    }, true);
    addEventListener('pointermove', (e) => {
      const d = this.drawing;
      if (!d || e.pointerId !== d.pointer) return;
      e.stopPropagation();
      const p = { x: e.clientX, y: e.clientY };
      const last = d.points[d.points.length - 1];
      if (d.tool === 'box') d.points[1] = p;
      else if (Math.hypot(p.x - last.x, p.y - last.y) >= 3) d.points.push(p);
    }, true);
    addEventListener('pointerup', (e) => {
      const d = this.drawing;
      if (!d || e.pointerId !== d.pointer) return;
      e.stopPropagation();
      this.drawing = null;
      this.finishDrawing(d);
    }, true);
    addEventListener('pointercancel', (e) => {
      if (this.drawing?.pointer === e.pointerId) this.drawing = null;
    }, true);
    // (the game reads touches as touch events: hold those back while drawing too)
    for (const type of ['touchstart', 'touchmove', 'touchend'] as const)
      addEventListener(type, (e) => {
        if (!this.drawing) return;
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }, { capture: true, passive: false });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.open && e.isPrimary && e.button === 0 && !ours(e)) this.down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    canvas.addEventListener('pointerup', (e) => {
      const d = this.down;
      this.down = null;
      if (!this.open || this.mode !== 'picking' || !d || !e.isPrimary || ours(e)) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 800) return;
      const p = this.pickAt(e.clientX, e.clientY);
      if (p) this.add(p);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.open || e.pointerType !== 'mouse') return;
      this.hoverAt = e.buttons || ours(e) ? null : { x: e.clientX, y: e.clientY };
      if (e.buttons) this.setHover(null);
    });
    canvas.addEventListener('pointerleave', () => {
      this.hoverAt = null;
      this.setHover(null);
    });
  }

  /** True while reporting: the host should pause its simulation (but keep rendering). */
  get active(): boolean {
    return this.open;
  }

  /** Call once per frame, after rendering. */
  update(): void {
    const now = performance.now();
    this.frameMs += now - this.lastFrame;
    this.lastFrame = now;
    if (++this.frames >= 30 || this.frameMs > 1000) {
      this.fps = (this.frames * 1000) / this.frameMs;
      this.frames = this.frameMs = 0;
    }
    const errors = errorCount();
    if (errors !== this.errorsShown) {
      // Red badge: something went wrong that is worth reporting.
      this.errorsShown = errors;
      this.button.dataset.errors = String(errors);
      this.button.title = `Report a bug or an idea (B) — ${errors} console error(s) so far`;
    }
    if (!this.open) return;
    if (this.hoverAt && this.mode === 'picking' && !this.drawing) {
      const at = this.hoverAt;
      this.hoverAt = null;
      this.setHover(this.pickAt(at.x, at.y), at);
    }
    this.placePins();
    this.drawShapes();
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.fpsAtOpen = this.fps;
    this.picks = [];
    this.kind = 'bug';
    this.ui.note.value = '';
    this.ui.colliders.checked = false;
    this.drawing = null;
    this.setMode('picking');
    this.setTool(this.tool);
    this.renderKind();
    this.renderPicks();
    document.body.classList.add('reporting');
    // Type straight away on desktop; on touch screens the keyboard would hide the scene.
    if (!matchMedia('(pointer: coarse)').matches) this.ui.note.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.open || this.mode === 'saving') return;
    if (this.mode === 'picking' && (this.picks.length || this.ui.note.value.trim()) && !confirm('Discard this report?')) return;
    this.open = false;
    this.picks = [];
    this.drawing = null;
    this.renderPicks();
    this.drawShapes();
    this.setTool(this.tool);
    this.setHover(null);
    this.mapColliders(false);
    document.body.classList.remove('reporting');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // ── Picking ──────────────────────────────────────────────────────────────

  private viewAt(x: number, y: number): FeedbackView | null {
    return this.o.viewAt ? this.o.viewAt(x, y) : { camera: this.o.camera, rect: this.o.renderer.domElement.getBoundingClientRect() };
  }

  private pickAt(x: number, y: number): Pick | null {
    const view = this.viewAt(x, y);
    if (!view) return null;
    const r = view.rect;
    // A fifth of a pixel off: a ray lying exactly in the seam plane between two
    // flush blocks (dead centre with the follow camera axis-aligned) slips
    // between their side faces and hits whatever is below.
    x += 0.21;
    y += 0.17;
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, view.camera);
    return pick(this.raycaster, this.o.pickables(), this.o.colliders, this.o.anchor?.());
  }

  /** Client position of a world point (null when off screen). */
  private screenOf(p: Vector3): { x: number; y: number } | null {
    if (this.o.screenOf) return this.o.screenOf(p);
    const r = this.o.renderer.domElement.getBoundingClientRect();
    const s = this.v.copy(p).project(this.o.camera);
    return s.z < 1 ? { x: r.left + ((s.x + 1) / 2) * r.width, y: r.top + ((1 - s.y) / 2) * r.height } : null;
  }

  private add(p: Pick): void {
    if (this.picks.length >= MAX_PICKS) return;
    this.picks.push(p);
    this.renderPicks();
    void this.resolveHint(p);
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    for (const b of this.ui.tools) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    this.ui.how.textContent = HOW[tool] + (tool === 'click' && !this.coarse ? KEYS : '');
    // (on touch screens a drag then draws, instead of scrolling the page)
    this.surface.style.touchAction = this.open && tool !== 'click' ? 'none' : this.touchAction;
    document.body.classList.toggle('fb-drawing', this.open && tool !== 'click');
  }

  /** A finished drag: everything that shows inside the box / loop becomes one pick. */
  private finishDrawing(d: Drawing): void {
    const outline = d.tool === 'box' ? corners(d.points[0], d.points[d.points.length - 1]) : d.points;
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (size <= 6) {
      // Hardly moved: a tap, which picks one thing as the Click tool does.
      const p = performance.now() - d.t < 800 ? this.pickAt(d.points[0].x, d.points[0].y) : null;
      if (p) this.add(p);
      return;
    }
    if (outline.length < 3 || this.picks.length >= MAX_PICKS) return;
    try {
      // (the pin goes on the block nearest the middle; with no blocks, on whatever is there)
      const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const fallback = this.pickAt(mid.x, mid.y)?.point ?? new Vector3().setFromMatrixPosition(d.view.camera.matrixWorld);
      this.add(areaPick(this.o.renderer, this.o.pickables(), d.view, d.tool, outline, fallback));
    } catch (err) {
      console.error('[feedback] could not pick inside the area:', err);
      this.setMode('picking', `Couldn't pick inside the ${d.tool}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** A drawn outline lines up with the scene only while its view hasn't moved. */
  private lined(a: Area): boolean {
    const v = this.viewAt(a.outline[0].x, a.outline[0].y);
    return !!v && v.camera === a.camera && samePose(viewPose(v), a.pose);
  }

  /** Show where the code is (`File.ts:line`) next to the pick once the trace resolves. */
  private async resolveHint(p: Pick): Promise<void> {
    const hint = p.area ? await areaHint(p.area) : await fixSite(p.trace ?? p.colliders[0]?.src);
    if (!hint) return;
    this.hints.set(p, hint);
    if (this.picks.includes(p)) this.renderList();
  }

  private setHover(p: Pick | null, at?: { x: number; y: number }): void {
    clear(this.hoverLines);
    if (p?.block) this.hoverLines.add(outline(p.block));
    else if (p?.kind === 'collider') this.hoverLines.add(boxLines(p.colliders, LINES.hover));
    this.tip.style.display = p && at ? 'block' : 'none';
    if (!p || !at) return;
    this.tip.textContent = p.label;
    this.tip.style.left = `${at.x}px`;
    this.tip.style.top = `${at.y}px`;
  }

  // ── Panel, pins, outlines ────────────────────────────────────────────────

  private setMode(mode: FeedbackTool['mode'], ...status: string[]): void {
    this.mode = mode;
    this.panel.dataset.mode = mode;
    this.ui.title.textContent = mode === 'saved' ? 'Report saved ✓' : 'Report a problem';
    this.ui.status.replaceChildren(
      ...status.map((s) => {
        const p = document.createElement('p');
        p.textContent = s;
        return p;
      }),
    );
    this.ui.primary.textContent = mode === 'picking' ? 'Save report' : mode === 'saving' ? 'Saving…' : 'Done';
    this.ui.secondary.textContent = mode === 'saved' ? 'Copy text' : 'Cancel';
    this.ui.primary.disabled = this.ui.secondary.disabled = mode === 'saving';
  }

  private renderKind(): void {
    for (const b of this.ui.kinds) b.setAttribute('aria-pressed', String(b.dataset.kind === this.kind));
  }

  private renderPicks(): void {
    this.renderList();
    this.pins.replaceChildren(
      ...this.picks.map((_, i) => {
        const pin = document.createElement('div');
        pin.className = 'fb-pin';
        pin.innerHTML = `<span>${i + 1}</span>`;
        return pin;
      }),
    );
    this.placePins();
    clear(this.outlines);
    for (const p of this.picks) {
      if (p.block) this.outlines.add(outline(p.block, LINES.pick));
      const blocks = p.area?.items.flatMap((i) => (i.block ? [i.block] : [])) ?? [];
      if (blocks.length) this.outlines.add(blockLines(blocks.slice(0, 4000), LINES.area));
      if (p.colliders.length) this.outlines.add(boxLines(p.colliders, LINES.collider));
    }
  }

  private renderList(): void {
    this.ui.list.replaceChildren(
      ...this.picks.map((p, i) => {
        const li = document.createElement('li');
        li.innerHTML = '<span></span> <code></code> <button type="button" title="Remove">✕</button>';
        li.children[0].textContent = p.label;
        li.children[1].textContent = this.hints.get(p) ?? '';
        (li.children[2] as HTMLButtonElement).onclick = () => {
          this.picks.splice(i, 1);
          this.renderPicks();
        };
        return li;
      }),
    );
  }

  private placePins(): void {
    this.picks.forEach((p, i) => {
      const pin = this.pins.children[i] as HTMLElement | undefined;
      if (!pin) return;
      const s = this.screenOf(p.point);
      pin.style.display = s ? '' : 'none';
      if (!s) return;
      pin.style.left = `${s.x}px`;
      pin.style.top = `${s.y}px`;
    });
  }

  /** The drawn outlines that still line up with the scene, and the one being drawn. */
  private drawShapes(): void {
    const paths: string[] = [];
    if (this.open) for (const p of this.picks) if (p.area && this.lined(p.area)) paths.push(`<path d="${pathData(p.area.outline)}"/>`);
    const d = this.drawing;
    if (d && d.points.length > 1) paths.push(`<path class="fb-draft" d="${pathData(d.tool === 'box' ? corners(d.points[0], d.points[d.points.length - 1]) : d.points)}"/>`);
    const html = paths.join('');
    if (html !== this.shapesDrawn) this.shapes.innerHTML = this.shapesDrawn = html;
  }

  /** Wireframes of every collider within 60 m (orange; water / bounds blue). */
  private mapColliders(on: boolean): void {
    clear(this.colliderMap);
    const world = this.o.colliders;
    if (!on || !world) return;
    const c = this.o.anchor?.() ?? this.o.camera.position;
    const R = 60;
    const solid: AABB[] = [];
    const water: AABB[] = [];
    world.forEachNear(c.x - R, c.z - R, c.x + R, c.z + R, (b) => (b.noStand ? water : solid).push(b));
    if (solid.length) this.colliderMap.add(boxLines(solid, LINES.map));
    if (water.length) this.colliderMap.add(boxLines(water, LINES.mapWater));
  }

  // ── Saving ───────────────────────────────────────────────────────────────

  private async save(): Promise<void> {
    if (!this.open || this.mode !== 'picking') return;
    this.setMode('saving');
    this.setHover(null);
    try {
      const shot = this.capture();
      const data: ReportData = {
        kind: this.kind,
        note: this.ui.note.value,
        page: location.pathname.split('/').pop() || 'index.html',
        picks: this.picks,
        state: this.o.state(),
        env: this.environment(),
        repro: this.o.repro().toString().replace(/%2C/gi, ','),
        image: 'screenshot.jpg',
      };
      const name = `${stamp()}-${reportSlug(this.picks, data.note)}`;
      const jpeg = await new Promise<Blob | null>((resolve) => shot.toBlob(resolve, 'image/jpeg', 0.88));
      this.savedText = await reportMarkdown(data);
      const dir = await this.post(name, this.savedText, jpeg).catch((err: unknown) => {
        console.info('[feedback] could not save through the dev server, downloading instead:', err);
        return null;
      });
      if (dir) {
        if (isPostHogConfigured) posthog.capture('feedback_submitted', { feedback_type: this.kind, picked_item_count: this.picks.length, delivery: 'dev_server' });
        this.setMode('saved', `Saved to ${dir}/`, 'Tell Claude: “check the feedback”. Using Claude on the web? Push the folder first, or copy the text into the chat.');
        return;
      }
      // No dev server (e.g. a static build): hand the files to the browser instead.
      this.savedText = await reportMarkdown({ ...data, image: `${name}.jpg` });
      download(`${name}.md`, new Blob([this.savedText], { type: 'text/markdown' }));
      if (jpeg) download(`${name}.jpg`, jpeg);
      if (isPostHogConfigured) posthog.capture('feedback_submitted', { feedback_type: this.kind, picked_item_count: this.picks.length, delivery: 'browser_download' });
      this.setMode('saved', `Downloaded ${name}.md and .jpg (the dev server wasn't reachable).`, 'Send both files to Claude, or copy the text into the chat.');
    } catch (err) {
      // A bug in the reporter itself: stay open (and unfrozen from "Saving…") so the note isn't lost.
      console.error('[feedback] could not build the report:', err);
      this.setMode('picking', `Couldn't save: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** POST the report to the dev server; resolves to the folder it was saved in. */
  private async post(name: string, markdown: string, jpeg: Blob | null): Promise<string> {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, markdown, image: jpeg ? await base64(jpeg) : '' }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return ((await res.json()) as { dir: string }).dir;
  }

  /** Render a fresh frame and copy it (the WebGL buffer is only valid until this task ends), with pins drawn on. */
  private capture(): HTMLCanvasElement {
    const { renderer, scene, camera } = this.o;
    if (this.o.render) this.o.render();
    else renderer.render(scene, camera);
    const src = renderer.domElement;
    const rect = src.getBoundingClientRect();
    const k = Math.min(1, 1600 / src.width);
    const out = document.createElement('canvas');
    out.width = Math.round(src.width * k);
    out.height = Math.round(src.height * k);
    const g = out.getContext('2d')!;
    g.drawImage(src, 0, 0, out.width, out.height);
    const r = Math.max(9, out.width / 90);
    const at = (q: Point) => [((q.x - rect.left) / rect.width) * out.width, ((q.y - rect.top) / rect.height) * out.height] as const;
    for (const p of this.picks) if (p.area && this.lined(p.area)) drawOutline(g, p.area.outline.map(at), r);
    this.picks.forEach((p, i) => {
      const s = this.screenOf(p.point);
      if (s) drawPin(g, ((s.x - rect.left) / rect.width) * out.width, ((s.y - rect.top) / rect.height) * out.height, r, String(i + 1));
    });
    return out;
  }

  private environment(): Record<string, string> {
    const gl = this.o.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      Browser: navigator.userAgent,
      Screen: `${innerWidth}×${innerHeight} CSS px @${devicePixelRatio}×${matchMedia('(pointer: coarse)').matches ? ' · touch' : ''}`,
      GPU: String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
      'Frame rate': this.fpsAtOpen ? `${this.fpsAtOpen.toFixed(0)} fps before reporting` : 'not measured yet',
    };
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.savedText);
    } catch {
      // No async clipboard outside secure contexts (e.g. a phone on http://<LAN IP>).
      const t = document.createElement('textarea');
      t.value = this.savedText;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    this.ui.secondary.textContent = 'Copied ✓';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function outline(matrix: Matrix4, material = LINES.hover): LineSegments {
  const l = new LineSegments(UNIT_BOX, material);
  l.matrixAutoUpdate = false;
  l.matrix.copy(matrix);
  l.matrixWorldNeedsUpdate = true;
  l.frustumCulled = false;
  l.renderOrder = 999;
  return l;
}

function boxLines(boxes: AABB[], material: LineBasicMaterial): LineSegments {
  const p: number[] = [];
  for (const b of boxes) {
    const xs = [b.minX, b.maxX];
    const ys = [b.minY, b.maxY];
    const zs = [b.minZ, b.maxZ];
    for (const y of ys) for (const z of zs) p.push(xs[0], y, z, xs[1], y, z);
    for (const x of xs) for (const z of zs) p.push(x, ys[0], z, x, ys[1], z);
    for (const x of xs) for (const y of ys) p.push(x, y, zs[0], x, y, zs[1]);
  }
  const l = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(p, 3)), material);
  l.frustumCulled = false;
  l.renderOrder = 999;
  return l;
}

/** Outlines of many blocks as one line mesh. */
function blockLines(blocks: Matrix4[], material: LineBasicMaterial): LineSegments {
  const edges = UNIT_BOX.getAttribute('position');
  const p = new Float32Array(blocks.length * edges.count * 3);
  const v = new Vector3();
  let k = 0;
  for (const m of blocks)
    for (let i = 0; i < edges.count; i++) {
      v.fromBufferAttribute(edges, i).applyMatrix4(m);
      p[k++] = v.x;
      p[k++] = v.y;
      p[k++] = v.z;
    }
  const l = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(p, 3)), material);
  l.frustumCulled = false;
  l.renderOrder = 999;
  return l;
}

function corners(a: Point, b: Point): Point[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
}

function pathData(points: Point[]): string {
  return `${points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('')}Z`;
}

/** Where to fix a pick, `File.ts:line`. */
async function fixSite(trace?: SourceTrace): Promise<string> {
  if (!trace) return '';
  const frames = await resolveTrace(trace);
  // Builder helpers (WorldBuilder.block, the kit's BlockSet / shapes…) are rarely the place to fix; their caller is.
  const f = frames.find((fr) => !fr.file.endsWith('/WorldBuilder.ts') && !/^src\/kit\/[^/]+\.ts$/.test(fr.file)) ?? frames[0];
  return f ? `${f.file.split('/').pop()}:${f.line}` : '';
}

/** Where an area's blocks were made, the code filling most of it first: `Gate.ts:12 +3 more`. */
async function areaHint(a: Area): Promise<string> {
  const stacks = new Map<string, { trace: SourceTrace; n: number }>();
  for (const i of a.items) {
    if (!i.trace) continue;
    const s = stacks.get(i.trace.stack ?? '');
    if (s) s.n += i.pixels;
    else stacks.set(i.trace.stack ?? '', { trace: i.trace, n: i.pixels });
  }
  const sites = new Map<string, number>();
  for (const { trace, n } of stacks.values()) {
    const site = await fixSite(trace);
    if (site) sites.set(site, (sites.get(site) ?? 0) + n);
  }
  const top = [...sites].sort((x, y) => y[1] - x[1]);
  return top.length ? `${top[0][0]}${top.length > 1 ? ` +${top.length - 1} more` : ''}` : '';
}

function clear(group: Group): void {
  for (const c of [...group.children]) {
    c.removeFromParent();
    const geo = (c as LineSegments).geometry;
    if (geo !== UNIT_BOX) geo.dispose();
  }
}

/** A drawn box / loop, as on screen: gold over a dark edge, lightly filled. */
function drawOutline(g: CanvasRenderingContext2D, points: (readonly [number, number])[], r: number): void {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = 'rgba(255, 210, 122, 0.14)';
  g.fill();
  g.lineJoin = 'round';
  g.lineWidth = r * 0.45;
  g.strokeStyle = 'rgba(20, 24, 28, 0.85)';
  g.stroke();
  g.lineWidth = r * 0.22;
  g.strokeStyle = '#ffd27a';
  g.stroke();
}

/** Numbered marker like the on-screen pins: a ring on the point, the number up-right. */
function drawPin(g: CanvasRenderingContext2D, x: number, y: number, r: number, label: string): void {
  const ink = 'rgba(20, 24, 28, 0.85)';
  const gold = '#ffd27a';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.lineWidth = r * 0.5;
  g.strokeStyle = ink;
  g.stroke();
  g.lineWidth = r * 0.25;
  g.strokeStyle = gold;
  g.stroke();
  g.font = `700 ${Math.round(r * 1.3)}px system-ui, sans-serif`;
  const h = r * 1.9;
  const w = Math.max(h, g.measureText(label).width + r);
  const bx = x + r * 0.8;
  const by = y - r * 0.8 - h;
  g.beginPath();
  g.roundRect(bx, by, w, h, h / 2);
  g.fillStyle = gold;
  g.fill();
  g.lineWidth = r * 0.2;
  g.strokeStyle = ink;
  g.stroke();
  g.fillStyle = '#1f2a36';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, bx + w / 2, by + h / 2 + 1);
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function download(name: string, blob: Blob): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
