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
import { pick, type Pick } from './pick';
import { errorCount, reportMarkdown, reportSlug, type ReportData } from './report';
import { resolveTrace } from './sourceTrace';

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

const line = (color: number, onTop = true) => new LineBasicMaterial({ color, depthTest: !onTop, transparent: true, fog: false, toneMapped: false });
const LINES = { hover: line(0xffffff), pick: line(0xffd27a), collider: line(0xff6b3d), map: line(0xff9a3c, false), mapWater: line(0x4cc3ff, false) };
const UNIT_BOX = new EdgesGeometry(new BoxGeometry(1, 1, 1));

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
      <p class="sub">Click or tap what's wrong — as many things as you like. Drag to look around.</p>
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
    this.ui.colliders.onchange = () => this.mapColliders(this.ui.colliders.checked);
    // Pages without a collision world (the studio) have no colliders to show.
    if (!o.colliders) this.ui.colliders.closest('label')!.style.display = 'none';
    primary.onclick = () => (this.mode === 'saved' ? this.close() : void this.save());
    secondary.onclick = () => (this.mode === 'saved' ? void this.copy() : this.close());

    this.tip.className = 'fb-tip';
    this.pins.className = 'fb-pins';
    document.body.append(this.button, this.panel, this.tip, this.pins);
    o.scene.add(this.outlines, this.hoverLines, this.colliderMap);

    addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (!this.open) {
        if (e.code === HOTKEY && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.show();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.code === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.save();
      }
    });

    // A click that doesn't drag picks; drags keep turning the camera.
    const canvas = o.events ?? o.renderer.domElement;
    // (on a page-wide element, the reporter's own panel and the page's controls don't pick)
    const ours = (e: Event) => e.target instanceof Element && (this.panel.contains(e.target) || this.button.contains(e.target) || (!!o.events && !!e.target.closest('button, input, select, textarea, label')));
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
    if (this.hoverAt && this.mode === 'picking') {
      const at = this.hoverAt;
      this.hoverAt = null;
      this.setHover(this.pickAt(at.x, at.y), at);
    }
    this.placePins();
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.fpsAtOpen = this.fps;
    this.picks = [];
    this.kind = 'bug';
    this.ui.note.value = '';
    this.ui.colliders.checked = false;
    this.setMode('picking');
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
    this.renderPicks();
    this.setHover(null);
    this.mapColliders(false);
    document.body.classList.remove('reporting');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // ── Picking ──────────────────────────────────────────────────────────────

  private pickAt(x: number, y: number): Pick | null {
    const view = this.o.viewAt ? this.o.viewAt(x, y) : { camera: this.o.camera, rect: this.o.renderer.domElement.getBoundingClientRect() };
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
    if (this.picks.length >= 20) return;
    this.picks.push(p);
    this.renderPicks();
    void this.resolveHint(p);
  }

  /** Show where the code is (`File.ts:line`) next to the pick once the trace resolves. */
  private async resolveHint(p: Pick): Promise<void> {
    const trace = p.trace ?? p.colliders[0]?.src;
    if (!trace) return;
    const frames = await resolveTrace(trace);
    // Builder helpers (WorldBuilder.block, the kit's BlockSet / shapes…) are rarely the place to fix; their caller is.
    const f = frames.find((fr) => !fr.file.endsWith('/WorldBuilder.ts') && !/^src\/kit\/[^/]+\.ts$/.test(fr.file)) ?? frames[0];
    if (!f) return;
    this.hints.set(p, `${f.file.split('/').pop()}:${f.line}`);
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
        this.setMode('saved', `Saved to ${dir}/`, 'Tell Claude: “check the feedback”. Using Claude on the web? Push the folder first, or copy the text into the chat.');
        return;
      }
      // No dev server (e.g. a static build): hand the files to the browser instead.
      this.savedText = await reportMarkdown({ ...data, image: `${name}.jpg` });
      download(`${name}.md`, new Blob([this.savedText], { type: 'text/markdown' }));
      if (jpeg) download(`${name}.jpg`, jpeg);
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

function clear(group: Group): void {
  for (const c of [...group.children]) {
    c.removeFromParent();
    const geo = (c as LineSegments).geometry;
    if (geo !== UNIT_BOX) geo.dispose();
  }
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
