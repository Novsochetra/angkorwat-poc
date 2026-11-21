/**
 * Press, hold and drag a thing he built (the build add-on: roam/_build.ts `dragGrab`), shared by the mouse
 * (input.ts) and the finger (touch.ts), which otherwise turn the camera with a drag.
 *
 * - A press on the view asks the grabber (`by.can`, the pointer's screen point) whether a thing of his is under it;
 *   no: a camera drag as ever.
 * - Yes: the press waits (`HOLD`) — moved past `SLOP` px before then, it is a camera drag after all (the look takes
 *   the move from there); held still, it is a grab (`by.start`; refused, e.g. half built: nothing, the grabber says
 *   why). While grabbed, the pointer's moves are the grab's (`at`), never the camera's.
 * - Let go: `by.end(true)` (put it down there); cancelled (the pointer lost, the page left): `by.end(false)`.
 */

export interface DragGrabber {
  /** A thing he can grab under the screen point (px)? Asked on each press. */
  can(x: number, y: number): boolean;
  /** The hold is long enough: grab it (true), or not (it says why itself). */
  start(x: number, y: number): boolean;
  /** Let go (`drop`: put it down where it is; false: put it back). */
  end(drop: boolean): void;
}

/** How long a press must hold still to grab (s): a mouse, a finger. */
export const HOLD = { mouse: 0.22, touch: 0.35 } as const;
/** How far a press may move while it waits (px) before it is a camera drag. */
export const SLOP = { mouse: 6, touch: 10 } as const;

export const DRAG_GRAB = {
  /** The build add-on's, once it is made. */
  by: null as DragGrabber | null,
  /** A grab is on (the pointer moves it). */
  active: false,
  /** The pointer's screen point now (px), mouse or finger: where the grab follows. */
  at: { x: 0, y: 0 },
};

/** A press waiting to be a grab: its timer and where it began. */
export interface PendingGrab {
  readonly x: number;
  readonly y: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Start waiting for a hold at (x, y) (px): when the hold is long enough, `onGrab` is told whether it grabbed. Null: no
 * thing of his under the press (or no grabber).
 */
export function pressGrab(x: number, y: number, kind: 'mouse' | 'touch', onGrab: (grabbed: boolean) => void): PendingGrab | null {
  const by = DRAG_GRAB.by;
  if (!by || DRAG_GRAB.active || !by.can(x, y)) return null;
  DRAG_GRAB.at.x = x;
  DRAG_GRAB.at.y = y;
  const p: PendingGrab = { x, y, timer: null };
  p.timer = setTimeout(() => {
    p.timer = null;
    const ok = by.start(DRAG_GRAB.at.x, DRAG_GRAB.at.y);
    DRAG_GRAB.active = ok;
    onGrab(ok);
  }, HOLD[kind] * 1000);
  return p;
}

/** A waiting press given up (it moved: a camera drag; or let go early: a click). */
export function dropPending(p: PendingGrab | null): void {
  if (p?.timer) clearTimeout(p.timer);
}

/** The grab ends (`drop`: put it down). */
export function endGrab(drop: boolean): void {
  if (!DRAG_GRAB.active) return;
  DRAG_GRAB.active = false;
  DRAG_GRAB.by?.end(drop);
}
