import '../ui/photos.css';

/** One photo in the album. */
interface Photo {
  /** IndexedDB key (0 until it's stored). */
  id: number;
  blob: Blob;
  time: number;
  /** Where it was taken, in words. */
  place: string;
  /** Object URL for showing it (not stored). */
  url: string;
}

const DB_NAME = 'angkor-quest';
const STORE = 'photos';
/** Field of view that counts as 1× zoom (degrees). */
export const PHOTO_FOV = 50;
/** Keys shown under the selfie shutter (the game's; a page can pass its own). */
const SELFIE_HINT =
  '<kbd>Space</kbd> / click take · drag to move the phone · wheel closer / further · <kbd>G</kbd> gesture · <kbd>X</kbd> face · <kbd>Y</kbd> / <kbd>Esc</kbd> put away · <kbd>M</kbd> album';

/**
 * The explorer's photos: the viewfinder drawn over the view while his camera
 * is up (or a phone screen round a selfie), the shutter (flash, click, a print
 * sliding into the corner), and an album kept in this browser (IndexedDB) to
 * look through, download or delete.
 */
export class PhotoAlbum {
  /** True while the album is open (the game pauses behind it). */
  isOpen = false;
  /** The selfie frame's shutter button was pressed: the page takes the photo. */
  onShutter?: () => void;
  private photos: Photo[] = [];
  private readonly db = openDb();
  private readonly finder = el('div', 'photo-finder');
  private readonly zoomEl = el('span', 'photo-zoom');
  private readonly flash = el('div', 'photo-flash');
  private readonly print = el('button', 'photo-print');
  private readonly button = el('button', 'photo-album-button');
  private readonly album = el('div', 'photo-album');
  private readonly grid = el('div', 'photo-grid');
  private readonly view = el('div', 'photo-view');
  private readonly countEl = el('span', 'photo-count');
  private readonly selfie = el('div', 'selfie-frame');
  private readonly selfieInfo = el('span', 'selfie-info');
  private readonly selfieHint = el('span', 'selfie-hint');
  private printTimer = 0;
  private audio: AudioContext | null = null;

  constructor() {
    this.finder.innerHTML = `<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
      <i class="thirds"></i><i class="focus"></i>
      <div class="photo-bar"><span class="rec">● Photo</span></div>`;
    this.finder.querySelector('.photo-bar')!.append(
      this.zoomEl,
      Object.assign(el('span', 'hint'), {
        innerHTML: '<kbd>Click</kbd> / <kbd>Space</kbd> take · drag to look · wheel to zoom · <kbd>Z</kbd> / <kbd>Esc</kbd> put away · <kbd>M</kbd> album',
      }),
    );
    // Selfie: a phone screen round the view — bezel, front-camera notch, mode, shutter.
    const shutter = Object.assign(el('button', 'selfie-shutter'), { type: 'button', title: 'Take the selfie (Space)' });
    shutter.setAttribute('aria-label', 'Take the selfie');
    shutter.onclick = () => this.onShutter?.();
    const modes = el('div', 'selfie-modes');
    modes.innerHTML = '<span>Photo</span><span class="on">Selfie</span>';
    this.selfieHint.innerHTML = SELFIE_HINT;
    this.selfie.append(el('i', 'selfie-bezel'), Object.assign(el('i', 'selfie-notch'), { innerHTML: '<b></b>' }), this.selfieInfo, modes, shutter, this.selfieHint);
    this.button.type = 'button';
    this.button.title = 'Your photos (M)';
    this.button.onclick = () => this.openAlbum();
    this.print.type = 'button';
    this.print.onclick = () => this.openAlbum(this.photos[0]);

    const head = el('header', '');
    const close = Object.assign(el('button', 'photo-close'), { type: 'button', textContent: '✕', title: 'Close (Esc)' });
    close.onclick = () => this.closeAlbum();
    head.append(Object.assign(el('h2', ''), { textContent: 'Album' }), this.countEl, close);
    const panel = el('div', 'photo-panel');
    panel.append(head, this.grid, this.view);
    this.album.append(panel);
    this.album.onclick = (e) => e.target === this.album && this.closeAlbum();
    this.album.hidden = true;
    this.view.hidden = true;

    document.body.append(this.finder, this.selfie, this.flash, this.print, this.button, this.album);
    this.refresh();
    void this.load();
  }

  /** Show or hide the viewfinder; `fov` gives the zoom it reads out. */
  setViewfinder(on: boolean, fov = PHOTO_FOV): void {
    document.body.classList.toggle('photo-mode', on);
    const zoom = Math.tan((PHOTO_FOV * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360);
    this.zoomEl.textContent = `${zoom.toFixed(1)}×`;
  }

  /**
   * Show or hide the selfie frame (a phone screen round the view, with a
   * shutter button that calls `onShutter`). `info` is a line at the top (e.g.
   * the gesture and face); `hint` replaces the keys line (HTML).
   */
  setSelfieFrame(on: boolean, info = '', hint?: string): void {
    document.body.classList.toggle('selfie-mode', on);
    this.selfieInfo.textContent = info;
    this.selfieInfo.hidden = !info;
    if (hint !== undefined) this.selfieHint.innerHTML = hint;
  }

  /**
   * Take the photo. Call it right after rendering the frame, while the canvas
   * still holds the picture.
   */
  capture(canvas: HTMLCanvasElement, place: string): void {
    const blob = dataUrlBlob(canvas.toDataURL('image/jpeg', 0.92));
    const photo: Photo = { id: 0, blob, time: Date.now(), place, url: URL.createObjectURL(blob) };
    this.photos.unshift(photo);
    this.shutter();
    this.showPrint(photo);
    this.refresh();
    void this.store(photo);
  }

  openAlbum(photo?: Photo): void {
    this.isOpen = true;
    this.album.hidden = false;
    this.print.classList.remove('show');
    if (photo) this.showPhoto(photo);
    else this.showGrid();
  }

  closeAlbum(): void {
    this.isOpen = false;
    this.album.hidden = true;
  }

  /** Esc in the album: from one photo back to all of them, then close. */
  back(): void {
    if (!this.view.hidden) this.showGrid();
    else this.closeAlbum();
  }

  // ── Album views ──────────────────────────────────────────────────────────

  private refresh(): void {
    const n = this.photos.length;
    this.button.textContent = n ? `🖼 Album · ${n}` : '🖼 Album';
    this.countEl.textContent = n === 1 ? '1 photo' : `${n} photos`;
    if (this.isOpen && this.view.hidden) this.showGrid();
  }

  private showGrid(): void {
    this.view.hidden = true;
    this.grid.hidden = false;
    this.grid.replaceChildren();
    if (!this.photos.length) {
      this.grid.append(Object.assign(el('p', 'photo-empty'), { innerHTML: 'No photos yet. Press <kbd>Z</kbd> to raise the camera, or <kbd>Y</kbd> for a selfie.' }));
      return;
    }
    for (const p of this.photos) {
      const b = Object.assign(el('button', 'photo-thumb'), { type: 'button', title: `${when(p.time)} · ${p.place}` });
      b.append(Object.assign(el('img', ''), { src: p.url, alt: '' }));
      b.onclick = () => this.showPhoto(p);
      this.grid.append(b);
    }
  }

  private showPhoto(p: Photo): void {
    this.grid.hidden = true;
    this.view.hidden = false;
    const img = Object.assign(el('img', ''), { src: p.url, alt: `Photo, ${when(p.time)}` });
    const meta = Object.assign(el('p', 'photo-meta'), { textContent: `${when(p.time)} · ${p.place}` });
    const save = Object.assign(el('a', 'photo-action'), { href: p.url, download: fileName(p.time), textContent: 'Download' });
    const del = Object.assign(el('button', 'photo-action'), { type: 'button', textContent: 'Delete' });
    del.onclick = () => void this.remove(p);
    const back = Object.assign(el('button', 'photo-action'), { type: 'button', textContent: 'All photos' });
    back.onclick = () => this.showGrid();
    const actions = el('div', 'photo-actions');
    actions.append(save, del, back);
    this.view.replaceChildren(img, meta, actions);
  }

  private showPrint(p: Photo): void {
    this.print.replaceChildren(Object.assign(el('img', ''), { src: p.url, alt: '' }), Object.assign(el('span', ''), { textContent: 'Saved to the album' }));
    this.print.classList.remove('show');
    void this.print.offsetWidth; // restart the slide-in
    this.print.classList.add('show');
    clearTimeout(this.printTimer);
    this.printTimer = window.setTimeout(() => this.print.classList.remove('show'), 3500);
  }

  // ── Shutter ──────────────────────────────────────────────────────────────

  /** White flash and a two-part mechanical click. */
  private shutter(): void {
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    try {
      const ctx = (this.audio ??= new AudioContext());
      const t = ctx.currentTime;
      for (const [at, len, gain, freq] of [
        [0, 0.035, 0.55, 3400],
        [0.075, 0.05, 0.35, 2300],
      ]) {
        const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(filter).connect(g).connect(ctx.destination);
        src.start(t + at);
      }
    } catch {
      // No sound (no audio device, or audio blocked); the flash is enough.
    }
  }

  // ── Storage (IndexedDB; the album still works for this visit without it) ─

  private async load(): Promise<void> {
    const rows = await this.request<Omit<Photo, 'url'>[]>('readonly', (s) => s.getAll());
    if (!rows?.length) return;
    const known = new Set(this.photos.map((p) => p.id));
    const loaded = rows.filter((r) => !known.has(r.id)).map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }));
    this.photos = [...this.photos, ...loaded].sort((a, b) => b.time - a.time);
    this.refresh();
  }

  private async store(p: Photo): Promise<void> {
    const id = await this.request('readwrite', (s) => s.add({ blob: p.blob, time: p.time, place: p.place }));
    if (typeof id === 'number') p.id = id;
  }

  private async remove(p: Photo): Promise<void> {
    this.photos = this.photos.filter((x) => x !== p);
    URL.revokeObjectURL(p.url);
    if (p.id) await this.request('readwrite', (s) => s.delete(p.id));
    this.refresh();
    this.showGrid();
  }

  private async request<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
    const db = await this.db;
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const r = fn(db.transaction(STORE, mode).objectStore(STORE));
        r.onsuccess = () => resolve(r.result as T);
        r.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function dataUrlBlob(url: string): Blob {
  const comma = url.indexOf(',');
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: url.slice(5, url.indexOf(';')) });
}

const when = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function fileName(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `angkor-heritage-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
}
