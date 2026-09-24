/**
 * Keyboard + mouse + touch input. Movement is exposed as an analog 2D vector
 * (x = strafe right, y = forward) so keyboard and the touch stick share a path.
 */
export class Input {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Accumulated pointer drag since last frame (pixels). */
  dragX = 0;
  dragY = 0;
  /** Accumulated wheel delta since last frame. */
  wheel = 0;
  /** Mouse position (client pixels) while it is over the canvas, else null. */
  pointer: { x: number; y: number } | null = null;
  /** True for one frame after a left click on the canvas that wasn't a drag. */
  clicked = false;
  private dragDist = 0;
  private touchMove: { id: number; x0: number; y0: number; x: number; y: number } | null = null;
  private touchLook: { id: number; x: number; y: number } | null = null;
  private pointerDown = false;

  constructor(
    el: HTMLElement,
    private readonly pad?: HTMLElement,
  ) {
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointerDown = true;
      this.dragDist = 0;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.pointer = { x: e.clientX, y: e.clientY };
      if (e.pointerType === 'touch' || !this.pointerDown) return;
      this.dragX += e.movementX;
      this.dragY += e.movementY;
      this.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
    });
    el.addEventListener('pointerup', (e) => {
      if (this.pointerDown && e.button === 0 && this.dragDist < 6) this.clicked = true;
      this.pointerDown = false;
    });
    el.addEventListener('pointerleave', () => (this.pointer = null));
    el.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60);
      e.preventDefault();
    }, { passive: false });

    // Touch: left half = move stick, right half = look.
    el.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < innerWidth * 0.45 && !this.touchMove) this.touchMove = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        else if (!this.touchLook) this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.touchMove && t.identifier === this.touchMove.id) {
          this.touchMove.x = t.clientX;
          this.touchMove.y = t.clientY;
        } else if (this.touchLook && t.identifier === this.touchLook.id) {
          this.dragX += (t.clientX - this.touchLook.x) * 1.4;
          this.dragY += (t.clientY - this.touchLook.y) * 1.4;
          this.touchLook.x = t.clientX;
          this.touchLook.y = t.clientY;
        }
      }
      this.updatePad();
      e.preventDefault();
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.touchMove && t.identifier === this.touchMove.id) this.touchMove = null;
        if (this.touchLook && t.identifier === this.touchLook.id) this.touchLook = null;
      }
      this.updatePad();
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per key press. */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Movement vector, length ≤ 1 (x right, y forward). */
  move(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.touchMove) {
      const dx = (this.touchMove.x - this.touchMove.x0) / 55;
      const dy = (this.touchMove.y - this.touchMove.y0) / 55;
      x += dx;
      y -= dy;
    }
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  /** Sprint when Shift is held or the touch stick is pushed far. */
  get running(): boolean {
    if (this.down('ShiftLeft') || this.down('ShiftRight')) return true;
    if (!this.touchMove) return false;
    return Math.hypot(this.touchMove.x - this.touchMove.x0, this.touchMove.y - this.touchMove.y0) > 70;
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
    this.clicked = false;
    this.dragX = this.dragY = this.wheel = 0;
  }

  private updatePad(): void {
    if (!this.pad) return;
    const knob = this.pad.firstElementChild as HTMLElement | null;
    if (!knob) return;
    if (!this.touchMove) {
      knob.style.transform = '';
      return;
    }
    const dx = Math.max(-45, Math.min(45, this.touchMove.x - this.touchMove.x0));
    const dy = Math.max(-45, Math.min(45, this.touchMove.y - this.touchMove.y0));
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
