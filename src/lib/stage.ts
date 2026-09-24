import type { Point } from './gestures';

/**
 * A crisp, auto-resizing canvas that lets game code work in "logical" units.
 *
 * Two sizing modes:
 *  - fixed:    { width, height } → the whole logical area is always visible
 *              and letterboxed (good for grid/arena games).
 *  - flexible: { minWidth, minHeight } → at least that much is visible and the
 *              logical size grows to fill the screen's aspect ratio
 *              (good for scrolling or open-field games).
 */
export type StageSize =
  | { width: number; height: number }
  | { minWidth: number; minHeight: number };

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Current logical width/height. */
  readonly width: number;
  readonly height: number;
  /** Convert client (event) coordinates to logical coordinates. */
  toLocal(clientX: number, clientY: number): Point;
  /** Call before drawing each frame: resets transform to logical units. */
  begin(): CanvasRenderingContext2D;
  onResize(fn: () => void): void;
}

export function createStage(root: HTMLElement, size: StageSize, signal: AbortSignal): Stage {
  const wrap = document.createElement('div');
  wrap.className = 'stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'stage-canvas';
  wrap.appendChild(canvas);
  root.appendChild(wrap);
  const ctx = canvas.getContext('2d')!;

  let width = 'width' in size ? size.width : size.minWidth;
  let height = 'height' in size ? size.height : size.minHeight;
  let scale = 1;
  let dpr = 1;
  const resizeFns: Array<() => void> = [];

  const layout = () => {
    const availW = Math.max(1, wrap.clientWidth);
    const availH = Math.max(1, wrap.clientHeight);
    if ('width' in size) {
      scale = Math.min(availW / size.width, availH / size.height);
      width = size.width;
      height = size.height;
    } else {
      scale = Math.min(availW / size.minWidth, availH / size.minHeight);
      width = availW / scale;
      height = availH / scale;
    }
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = Math.floor(width * scale);
    const cssH = Math.floor(height * scale);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    resizeFns.forEach((f) => f());
  };

  const ro = new ResizeObserver(layout);
  ro.observe(wrap);
  signal.addEventListener('abort', () => ro.disconnect());
  layout();

  return {
    canvas,
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    toLocal(cx, cy) {
      const r = canvas.getBoundingClientRect();
      return { x: ((cx - r.left) / r.width) * width, y: ((cy - r.top) / r.height) * height };
    },
    begin() {
      const k = (canvas.width / width) || 1;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      return ctx;
    },
    onResize(fn) {
      resizeFns.push(fn);
    },
  };
}
