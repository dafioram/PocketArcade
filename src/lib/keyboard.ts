/** Tracks which keys are held, plus a one-shot keydown callback. */
export interface Keyboard {
  /** True while any of the given `KeyboardEvent.code` / `key` values is held. */
  down(...keys: string[]): boolean;
}

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  ' ',
]);

export function keyboard(signal: AbortSignal, onKey?: (e: KeyboardEvent) => void): Keyboard {
  const held = new Set<string>();
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (GAME_KEYS.has(e.code) || GAME_KEYS.has(e.key)) e.preventDefault();
      held.add(e.code);
      held.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      onKey?.(e);
    },
    { signal },
  );
  window.addEventListener(
    'keyup',
    (e) => {
      held.delete(e.code);
      held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    },
    { signal },
  );
  window.addEventListener('blur', () => held.clear(), { signal });
  return {
    down: (...keys) => keys.some((k) => held.has(k)),
  };
}
