import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, nextRandom, normalizeSeed } from '../../src/game/rng';

describe('seeded rng', () => {
  it('is deterministic for a given state', () => {
    const a = nextRandom(12345);
    const b = nextRandom(12345);
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(0);
    expect(a.value).toBeLessThan(1);
  });

  it('advances state and produces a long cycle', () => {
    const seen = new Set<number>();
    let state = 1;
    for (let index = 0; index < 2_000; index++) {
      const step = nextRandom(state);
      state = step.state;
      seen.add(step.value);
    }
    expect(seen.size).toBeGreaterThan(1_900);
  });

  it('keeps integers inside the inclusive range', () => {
    let state = 7;
    for (let index = 0; index < 500; index++) {
      const step = nextInt(state, 5, 9);
      state = step.state;
      expect(step.value).toBeGreaterThanOrEqual(5);
      expect(step.value).toBeLessThanOrEqual(9);
      expect(Number.isInteger(step.value)).toBe(true);
    }
  });

  it('keeps floats inside [min, max)', () => {
    let state = 9;
    for (let index = 0; index < 500; index++) {
      const step = nextFloat(state, -2, 3);
      state = step.state;
      expect(step.value).toBeGreaterThanOrEqual(-2);
      expect(step.value).toBeLessThan(3);
    }
  });

  it('normalizes invalid seeds instead of producing NaN', () => {
    expect(normalizeSeed(undefined)).toBe(1);
    expect(normalizeSeed(Number.NaN)).toBe(1);
    expect(normalizeSeed(-42)).toBe(42);
    expect(normalizeSeed(0)).toBe(1);
  });
});
