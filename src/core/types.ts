/**
 * The contract every game implements.
 *
 * A game lives in its own folder under `src/games/<id>/` with two files:
 *   - meta.ts   → `export default defineMeta({...})`  (loaded eagerly for the menu)
 *   - index.ts  → `export default defineGame((ctx) => {...})` (lazy-loaded on play)
 *
 * The folder is picked up automatically; nothing else needs registering.
 */

export type Category = 'arcade' | 'puzzle';

export interface GameMeta {
  /** URL slug. Must match the folder name. */
  id: string;
  title: string;
  /** One short line shown on the menu card. */
  description: string;
  category: Category;
  /** Inline SVG markup (24x24 viewBox, stroke = currentColor works best). */
  icon: string;
  /** Lower numbers sort first within a category. Defaults to 100. */
  order?: number;
  /** Controls shown in the help sheet. */
  controls: {
    keyboard: string[];
    touch: string[];
  };
  /** Optional short note shown on the menu card on touch devices. */
  touchNote?: string;
  /** Optional function returning a short "best" line for the menu card. */
  bestLabel?: (storage: Storage) => string | null;
  /**
   * Show the header's restart button (default true). Games with their own
   * "New game" flow (and saved progress) can turn it off.
   */
  restartButton?: boolean;
}

export interface Stat {
  label: string;
  value: string | number;
}

export interface Storage {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export interface GameContext {
  /** The element the game should render into. It fills the space below the header. */
  root: HTMLElement;
  /** Aborted when the game is closed. Pass it to addEventListener / helpers for auto-cleanup. */
  signal: AbortSignal;
  /** Replace the stat chips shown in the header (score, best, lives...). */
  setStats(stats: Stat[]): void;
  /** Per-game persistent storage (localStorage, namespaced by game id). */
  storage: Storage;
  /**
   * Record a result. Returns the best value and whether this one beat it.
   * `mode: 'high'` for scores, `'low'` for times.
   */
  recordBest(key: string, value: number, mode?: 'high' | 'low'): { best: number; isNew: boolean };
  /** True if the primary input is a touch screen. */
  isTouch: boolean;
  /** Vibrate briefly if supported (no-op elsewhere). */
  haptic(ms?: number): void;
}

export interface GameInstance {
  /** Called when the tab is hidden or the pause button is pressed. */
  pause?(): void;
  /** Called when the pause button is pressed again. */
  resume?(): void;
  /** Whether the game is currently paused (used by the header button). */
  isPaused?(): boolean;
  /** Optional extra cleanup. Listeners registered with ctx.signal are removed automatically. */
  destroy?(): void;
}

export type GameFactory = (ctx: GameContext) => GameInstance;

export const defineMeta = (meta: GameMeta): GameMeta => meta;
export const defineGame = (factory: GameFactory): GameFactory => factory;
