import { describe, expect, it } from 'vitest';
import { SAVE_KEY, createSaveStore, defaultSave, migrate, type SaveStorage } from '../../src/persist/save';

class MemoryStorage implements SaveStorage {
  values = new Map<string, string>();
  failNextWrite = false;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('quota exceeded');
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('save migration', () => {
  it('upgrades the v0 bare-number format', () => {
    expect(migrate(42)).toMatchObject({ version: 2, best: 42 });
  });

  it('upgrades v1 and keeps mute', () => {
    expect(migrate({ version: 1, best: 7.9, muted: true })).toMatchObject({
      version: 2,
      best: 7,
      muted: true,
      reducedMotion: false,
    });
  });

  it('keeps a valid v2 payload', () => {
    const data = { version: 2, best: 9, muted: false, reducedMotion: true, lastSeed: 77 };
    expect(migrate(data)).toEqual(data);
  });

  it('falls back safely on garbage', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('nonsense')).toEqual(defaultSave());
    expect(migrate({ version: 99, best: -3 })).toEqual(defaultSave());
  });

  it('clamps negative and non-finite scores', () => {
    expect(migrate({ version: 2, best: -5 }).best).toBe(0);
    expect(migrate({ version: 2, best: Number.POSITIVE_INFINITY }).best).toBe(0);
  });
});

describe('save store', () => {
  it('round-trips through storage', () => {
    const storage = new MemoryStorage();
    const store = createSaveStore(storage);
    store.save({ ...defaultSave(), best: 15, muted: true });
    expect(storage.getItem(SAVE_KEY)).toContain('"best":15');
    expect(store.load()).toMatchObject({ best: 15, muted: true });
  });

  it('survives a quota error and still serves memory state', () => {
    const storage = new MemoryStorage();
    storage.failNextWrite = true;
    const store = createSaveStore(storage);
    store.save({ ...defaultSave(), best: 3 });
    expect(store.load().best).toBe(3);
  });

  it('works with no storage at all', () => {
    const store = createSaveStore(null);
    store.save({ ...defaultSave(), best: 4 });
    expect(store.load().best).toBe(4);
    store.clear();
    expect(store.load().best).toBe(0);
  });

  it('ignores corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(createSaveStore(storage).load()).toEqual(defaultSave());
  });
});
