import type { Intent, Snapshot } from './types';

/**
 * A small, readable autopilot over the public snapshot.
 *
 * It is shared by the in-browser test bridge, the menu demo and the headless
 * playtest so a bot that works in one place works everywhere.
 */
export function autopilotIntent(snapshot: Snapshot): Intent {
  const { player } = snapshot;
  let targetX = player.x;
  let targetY = player.y;

  let nearestStar: { x: number; y: number; d: number } | null = null;
  for (const orb of snapshot.orbs) {
    if (orb.kind !== 'star') continue;
    const d = Math.hypot(orb.x - player.x, orb.y - player.y);
    if (nearestStar === null || d < nearestStar.d) nearestStar = { x: orb.x, y: orb.y, d };
  }
  if (nearestStar !== null) {
    targetX = nearestStar.x;
    targetY = nearestStar.y - 12;
  }

  for (const orb of snapshot.orbs) {
    if (orb.kind !== 'hazard') continue;
    if (Math.hypot(orb.x - player.x, orb.y - player.y) < 130) {
      targetX = player.x + (player.x - orb.x) * 1.5;
      targetY = player.y + (player.y - orb.y) * 0.4;
    }
  }

  return {
    left: targetX < player.x - 6,
    right: targetX > player.x + 6,
    up: targetY < player.y - 6,
    down: targetY > player.y + 6,
  };
}
