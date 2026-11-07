import { describe, expect, it } from 'vitest';
import { autopilotIntent } from '../../src/game/autopilot';
import type { Snapshot } from '../../src/game/types';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    phase: 'playing',
    seed: 1,
    tick: 10,
    timeMs: 160,
    score: 0,
    best: 0,
    lives: 3,
    combo: 1,
    level: 1,
    difficulty: 1,
    player: { x: 480, y: 400, vx: 0, vy: 0, r: 14, invuln: false },
    orbs: [],
    hash: '00000000',
    ...overrides,
  };
}

describe('autopilot', () => {
  it('stays still when the field is empty', () => {
    expect(autopilotIntent(snapshot())).toEqual({ left: false, right: false, up: false, down: false });
  });

  it('steers toward the nearest star', () => {
    const intent = autopilotIntent(
      snapshot({
        orbs: [{ id: 1, kind: 'star', x: 800, y: 300, r: 11, spin: 0 }],
      }),
    );
    expect(intent.right).toBe(true);
    expect(intent.left).toBe(false);
    expect(intent.up).toBe(true);
  });

  it('flees a hazard that is too close', () => {
    const intent = autopilotIntent(
      snapshot({
        orbs: [{ id: 9, kind: 'hazard', x: 520, y: 400, r: 18, spin: 0 }],
      }),
    );
    expect(intent.left).toBe(true);
  });

  it('ignores hazards that are far away', () => {
    const intent = autopilotIntent(
      snapshot({
        orbs: [{ id: 9, kind: 'hazard', x: 480, y: 60, r: 18, spin: 0 }],
      }),
    );
    expect(intent).toEqual({ left: false, right: false, up: false, down: false });
  });
});
