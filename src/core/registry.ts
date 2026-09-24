import type { GameFactory, GameMeta } from './types';

// Every folder in src/games/ with a meta.ts + index.ts becomes a game.
// Folders starting with "_" (like _template) are ignored.
const metaModules = import.meta.glob<GameMeta>(
  ['../games/*/meta.ts', '!../games/_*/meta.ts'],
  { eager: true, import: 'default' },
);
const gameModules = import.meta.glob<GameFactory>(
  ['../games/*/index.ts', '!../games/_*/index.ts'],
  { import: 'default' },
);

const folderOf = (path: string) => path.split('/').slice(-2, -1)[0];

export const games: GameMeta[] = Object.entries(metaModules)
  .map(([path, meta]) => {
    const folder = folderOf(path);
    if (meta.id !== folder) {
      console.warn(`Game meta id "${meta.id}" doesn't match its folder "${folder}". Using the folder name.`);
    }
    return { ...meta, id: folder };
  })
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title));

export function findGame(id: string): GameMeta | undefined {
  return games.find((g) => g.id === id);
}

export async function loadGame(id: string): Promise<GameFactory> {
  const key = Object.keys(gameModules).find((p) => folderOf(p) === id);
  if (!key) throw new Error(`No index.ts found for game "${id}"`);
  return gameModules[key]();
}
