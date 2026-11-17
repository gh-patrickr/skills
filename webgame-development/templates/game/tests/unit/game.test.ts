import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game/game';
import { defaultConfig, type GameConfig } from '../../src/game/config';
import type { Intent } from '../../src/game/types';

const DT = 1000 / 60;
const IDLE: Intent = { left: false, right: false, up: false, down: false };

function collectibleConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return {
    ...defaultConfig,
    world: { width: 320, height: 240 },
    spawn: { ...defaultConfig.spawn, starChance: 1, baseIntervalMs: 120, minIntervalMs: 120, intervalPerLevel: 0 },
    orb: { ...defaultConfig.orb, starRadius: 90 },
    levels: { everyMs: 100_000, max: 1 },
    lives: 3,
    ...overrides,
  };
}

describe('game lifecycle', () => {
  it('starts in the menu and only ticks while playing', () => {
    const game = createGame({ seed: 4 });
    expect(game.state.phase).toBe('menu');
    game.update(IDLE, DT);
    expect(game.state.tick).toBe(0);

    game.start();
    expect(game.state.phase).toBe('playing');
    game.update(IDLE, DT);
    expect(game.state.tick).toBe(1);
    game.drainEvents();
  });

  it('pauses, resumes and ends a run', () => {
    const game = createGame({ seed: 4, best: 10 });
    game.start();
    game.update(IDLE, DT);
    game.pause();
    game.update(IDLE, DT);
    expect(game.state.tick).toBe(1);
    game.resume();
    game.update(IDLE, DT);
    expect(game.state.tick).toBe(2);
    game.end();
    expect(game.state.phase).toBe('gameover');
    expect(game.state.best).toBe(10);
  });

  it('rejects an unsafe config with a readable message', () => {
    const bad: GameConfig = {
      ...defaultConfig,
      spawn: { ...defaultConfig.spawn, minIntervalMs: 999_999 },
    };
    expect(() => createGame({ config: bad })).toThrow(/invalid game config/);
  });
});

describe('determinism', () => {
  it('same seed + same inputs produce the same state hash', () => {
    const run = () => {
      const game = createGame({ seed: 777 });
      game.start();
      for (let tick = 0; tick < 1_200; tick++) {
        game.update(
          {
            left: tick % 90 < 20,
            right: tick % 90 > 70,
            up: tick % 140 < 15,
            down: false,
          },
          DT,
        );
      }
      return game.snapshot();
    };

    const first = run();
    const second = run();
    expect(second.hash).toBe(first.hash);
    expect(second.score).toBe(first.score);
    expect(second.orbs.length).toBe(first.orbs.length);
  });

  it('different seeds diverge', () => {
    const gameA = createGame({ seed: 1 });
    const gameB = createGame({ seed: 2 });
    gameA.start();
    gameB.start();
    for (let tick = 0; tick < 240; tick++) {
      gameA.update(IDLE, DT);
      gameB.update(IDLE, DT);
    }
    expect(gameA.snapshot().hash).not.toBe(gameB.snapshot().hash);
  });
});

describe('gameplay systems', () => {
  it('collects stars, raises the combo and scores', () => {
    const game = createGame({ seed: 2, config: collectibleConfig() });
    game.start();
    for (let tick = 0; tick < 600; tick++) game.update(IDLE, DT);

    const snapshot = game.snapshot();
    expect(snapshot.score).toBeGreaterThan(0);
    expect(snapshot.combo).toBeGreaterThan(1);

    const events = game.drainEvents();
    expect(events.some((event) => event.type === 'star')).toBe(true);
    const star = events.find((event) => event.type === 'star');
    expect(star?.x).not.toBeNull();
  });

  it('hazards cost hull and end the run at zero', () => {
    const config = collectibleConfig({
      spawn: { ...defaultConfig.spawn, starChance: 0, baseIntervalMs: 120, minIntervalMs: 120, intervalPerLevel: 0 },
      orb: { ...defaultConfig.orb, hazardRadius: 120 },
      lives: 1,
    });
    const game = createGame({ seed: 3, config });
    game.start();
    for (let tick = 0; tick < 600 && game.state.phase === 'playing'; tick++) game.update(IDLE, DT);

    expect(game.state.phase).toBe('gameover');
    expect(game.state.best).toBeGreaterThanOrEqual(0);
    expect(game.drainEvents().some((event) => event.type === 'hit')).toBe(true);
  });

  it('levels up on the configured cadence and saturates', () => {
    const config = collectibleConfig({ levels: { everyMs: 1_000, max: 3 } });
    const game = createGame({ seed: 5, config });
    game.start();

    for (let tick = 0; tick < 70; tick++) game.update(IDLE, DT);
    expect(game.snapshot().level).toBe(2);

    for (let tick = 0; tick < 400; tick++) game.update(IDLE, DT);
    expect(game.snapshot().level).toBe(3);
    expect(game.snapshot().difficulty).toBeCloseTo(3.5, 5);
  });
});
