import { describe, expect, it } from 'vitest';
import { defaultConfig, difficultyFor, levelFor, validateConfig } from '../../src/game/config';

describe('config', () => {
  it('accepts the shipped defaults', () => {
    expect(validateConfig(defaultConfig)).toEqual([]);
  });

  it('reports every unsafe value instead of throwing at runtime', () => {
    const issues = validateConfig({
      ...defaultConfig,
      world: { width: -1, height: 0 },
      spawn: { ...defaultConfig.spawn, minIntervalMs: 10_000, starChance: 2 },
      combo: { maxMultiplier: 0, windowMs: -5 },
      lives: 0,
    });
    expect(issues.length).toBeGreaterThanOrEqual(5);
    expect(issues.join('\n')).toMatch(/world dimensions/);
    expect(issues.join('\n')).toMatch(/starChance/);
    expect(issues.join('\n')).toMatch(/lives/);
  });

  it('ramps levels and clamps at the maximum', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(defaultConfig.levels.everyMs)).toBe(2);
    expect(levelFor(defaultConfig.levels.everyMs * 1_000)).toBe(defaultConfig.levels.max);
  });

  it('keeps difficulty monotonic', () => {
    let previous = 0;
    for (let level = 1; level <= defaultConfig.levels.max; level++) {
      const value = difficultyFor(level);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
