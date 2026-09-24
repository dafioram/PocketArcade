/**
 * One small gesture recognizer shared by every game.
 *
 * Built on Pointer Events so mouse, pen and touch all go through the same path.
 * Recognizes: press, move (drag), release, tap, double tap, long press, swipe.
 *
 * `tap` always fires immediately (no waiting to see if a double tap follows),
 * so games stay responsive; `doubleTap` fires in addition on the second tap.
 */

export interface Point {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface DragInfo {
  /** Where the pointer went down. */
  start: Point;
  /** Movement since the previous move event. */
  delta: Point;
  /** Total movement since press. */
  total: Point;
}

export interface ReleaseInfo {
  moved: boolean;
  duration: number;
  total: Point;
}

export interface GestureHandlers {
  press?(p: Point, e: PointerEvent): void;
  move?(p: Point, info: DragInfo, e: PointerEvent): void;
  release?(p: Point, info: ReleaseInfo, e: PointerEvent): void;
  tap?(p: Point, e: PointerEvent): void;
  doubleTap?(p: Point, e: PointerEvent): void;
  longPress?(p: Point): void;
  swipe?(dir: Direction, p: Point): void;
}

export interface GestureOptions {
  signal?: AbortSignal;
  /** Convert client coordinates to game coordinates. Defaults to element-relative CSS pixels. */
  toLocal?: (clientX: number, clientY: number) => Point;
  /** Pixels a pointer may drift before it counts as a drag (cancels tap/long-press). */
  slop?: number;
  longPressMs?: number;
  doubleTapMs?: number;
  /** Minimum travel in CSS px for a swipe. */
  swipeMin?: number;
  /**
   * Fire swipes during a drag each time the finger travels `swipeMin`,
   * instead of only on release. Great for snake-style steering.
   */
  swipeWhileMoving?: boolean;
  /** Only react to the primary mouse button (default true). */
  primaryOnly?: boolean;
}

export function gestures(el: HTMLElement, h: GestureHandlers, opts: GestureOptions = {}): () => void {
  const slop = opts.slop ?? 10;
  const longPressMs = opts.longPressMs ?? 450;
  const doubleTapMs = opts.doubleTapMs ?? 300;
  const swipeMin = opts.swipeMin ?? 28;
  const toLocal =
    opts.toLocal ??
    ((cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: cx - r.left, y: cy - r.top };
    });

  let active: number | null = null;
  let startClient = { x: 0, y: 0 };
  let lastClient = { x: 0, y: 0 };
  let swipeOrigin = { x: 0, y: 0 };
  let startLocal: Point = { x: 0, y: 0 };
  let lastLocal: Point = { x: 0, y: 0 };
  let startTime = 0;
  let moved = false;
  let longFired = false;
  let swipedDuringMove = false;
  let longTimer: number | undefined;
  let lastTap = { t: -1e9, x: 0, y: 0 };

  const ac = new AbortController();
  const sig = ac.signal;
  opts.signal?.addEventListener('abort', () => ac.abort());

  const clearLong = () => {
    if (longTimer !== undefined) clearTimeout(longTimer);
    longTimer = undefined;
  };

  const dirOf = (dx: number, dy: number): Direction =>
    Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';

  el.addEventListener(
    'pointerdown',
    (e) => {
      if (active !== null) return;
      if ((opts.primaryOnly ?? true) && e.pointerType === 'mouse' && e.button !== 0) return;
      active = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      startClient = lastClient = swipeOrigin = { x: e.clientX, y: e.clientY };
      startLocal = lastLocal = toLocal(e.clientX, e.clientY);
      startTime = performance.now();
      moved = false;
      longFired = false;
      swipedDuringMove = false;
      if (h.longPress) {
        longTimer = window.setTimeout(() => {
          if (active !== null && !moved) {
            longFired = true;
            h.longPress!(startLocal);
          }
        }, longPressMs);
      }
      h.press?.(startLocal, e);
    },
    { signal: sig },
  );

  el.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== active) return;
      const p = toLocal(e.clientX, e.clientY);
      const dxc = e.clientX - startClient.x;
      const dyc = e.clientY - startClient.y;
      if (!moved && Math.hypot(dxc, dyc) > slop) {
        moved = true;
        clearLong();
      }
      if (h.move) {
        h.move(
          p,
          {
            start: startLocal,
            delta: { x: p.x - lastLocal.x, y: p.y - lastLocal.y },
            total: { x: p.x - startLocal.x, y: p.y - startLocal.y },
          },
          e,
        );
      }
      if (opts.swipeWhileMoving && h.swipe) {
        const sx = e.clientX - swipeOrigin.x;
        const sy = e.clientY - swipeOrigin.y;
        if (Math.hypot(sx, sy) >= swipeMin) {
          h.swipe(dirOf(sx, sy), p);
          swipedDuringMove = true;
          swipeOrigin = { x: e.clientX, y: e.clientY };
        }
      }
      lastLocal = p;
      lastClient = { x: e.clientX, y: e.clientY };
    },
    { signal: sig },
  );

  const end = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== active) return;
    active = null;
    clearLong();
    const p = cancelled ? lastLocal : toLocal(e.clientX, e.clientY);
    const cx = cancelled ? lastClient.x : e.clientX;
    const cy = cancelled ? lastClient.y : e.clientY;
    const duration = performance.now() - startTime;
    const total = { x: p.x - startLocal.x, y: p.y - startLocal.y };
    h.release?.(p, { moved, duration, total }, e);
    if (cancelled) return;

    const dx = cx - startClient.x;
    const dy = cy - startClient.y;
    if (!moved && !longFired) {
      h.tap?.(p, e);
      const now = performance.now();
      if (
        h.doubleTap &&
        now - lastTap.t < doubleTapMs &&
        Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40
      ) {
        h.doubleTap(p, e);
        lastTap = { t: -1e9, x: 0, y: 0 };
      } else {
        lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
    } else if (h.swipe && !swipedDuringMove && Math.hypot(dx, dy) >= swipeMin && duration < 600) {
      h.swipe(dirOf(dx, dy), p);
    }
  };

  el.addEventListener('pointerup', (e) => end(e, false), { signal: sig });
  el.addEventListener('pointercancel', (e) => end(e, true), { signal: sig });
  // Long-press on touch can open the context menu / text callout. Block it.
  el.addEventListener('contextmenu', (e) => e.preventDefault(), { signal: sig });

  return () => ac.abort();
}
