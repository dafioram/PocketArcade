import type { Storage } from './types';

const PREFIX = 'pa:';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or quota: ignore */
  }
}

export function createStorage(namespace: string): Storage {
  const k = (key: string) => `${PREFIX}${namespace}:${key}`;
  return {
    get<T>(key: string, fallback: T): T {
      const raw = safeGet(k(key));
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown) {
      if (value === undefined) {
        try {
          localStorage.removeItem(k(key));
        } catch {
          /* ignore */
        }
        return;
      }
      safeSet(k(key), JSON.stringify(value));
    },
  };
}

export const appStorage = {
  get: (key: string) => safeGet(PREFIX + key),
  set: (key: string, value: string) => safeSet(PREFIX + key, value),
};
