/**
 * requestAnimationFrame loop with a clamped delta time (in seconds).
 * `render` keeps running while paused so overlays/theme changes still draw.
 */
export interface Loop {
  paused: boolean;
  stop(): void;
}

export function loop(
  update: (dt: number) => void,
  render: () => void,
  signal: AbortSignal,
): Loop {
  let last = performance.now();
  let raf = 0;
  const state: Loop = {
    paused: false,
    stop: () => cancelAnimationFrame(raf),
  };
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!state.paused) update(dt);
    render();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  signal.addEventListener('abort', () => cancelAnimationFrame(raf));
  return state;
}
