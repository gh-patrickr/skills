/**
 * Versioned save data.
 *
 * The storage is injected so this module stays testable without a browser and
 * so a future cloud save backend is a drop-in replacement.
 */

export const SAVE_KEY = 'webgame.save';
export const SAVE_VERSION = 2;

export interface SaveData {
  version: typeof SAVE_VERSION;
  best: number;
  muted: boolean;
  reducedMotion: boolean;
  lastSeed: number;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveStore {
  load(): SaveData;
  save(data: SaveData): void;
  clear(): void;
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, best: 0, muted: false, reducedMotion: false, lastSeed: 1 };
}

function toInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/**
 * Accepts every historical shape:
 *   v0: a bare number (best score)
 *   v1: `{ version: 1, best, muted }`
 *   v2: current
 * Unknown or corrupt input degrades to defaults, never throws.
 */
export function migrate(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw === 'number') return { ...base, best: toInt(raw, 0) };
  if (raw === null || typeof raw !== 'object') return base;

  const record = raw as Record<string, unknown>;
  const best = toInt(record.best, 0);

  if (record.version === 1) {
    return {
      ...base,
      best,
      muted: record.muted === true,
      lastSeed: toInt(record.lastSeed, 1) || 1,
    };
  }

  if (record.version === 2) {
    return {
      version: SAVE_VERSION,
      best,
      muted: record.muted === true,
      reducedMotion: record.reducedMotion === true,
      lastSeed: toInt(record.lastSeed, 1) || 1,
    };
  }

  return { ...base, best };
}

export function createSaveStore(storage: SaveStorage | null): SaveStore {
  let memory: SaveData = defaultSave();

  return {
    load(): SaveData {
      if (storage === null) return { ...memory };
      try {
        const text = storage.getItem(SAVE_KEY);
        if (text === null) return { ...memory };
        const parsed = migrate(JSON.parse(text));
        memory = parsed;
        return parsed;
      } catch {
        return { ...memory };
      }
    },

    save(data: SaveData): void {
      memory = { ...data };
      if (storage === null) return;
      try {
        storage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch {
        /* quota or private mode: keep the in-memory copy */
      }
    },

    clear(): void {
      memory = defaultSave();
      try {
        storage?.removeItem(SAVE_KEY);
      } catch {
        /* ignore */
      }
    },
  };
}

/** localStorage can throw on access itself (sandboxed iframe), so guard it. */
export function safeLocalStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
