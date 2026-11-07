import type { GameState } from './types';

/** FNV-1a 32-bit — tiny, dependency-free fingerprint for determinism checks. */
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Canonical fingerprint of gameplay-relevant state.
 * Rendering-only data (particles, shake) is deliberately excluded.
 */
export function hashState(state: GameState): string {
  const parts: string[] = [
    state.phase,
    String(state.seed),
    String(state.tick),
    state.score.toFixed(2),
    String(state.lives),
    String(state.level),
    String(state.combo),
    state.player.x.toFixed(3),
    state.player.y.toFixed(3),
    state.player.vx.toFixed(3),
    state.player.vy.toFixed(3),
    String(state.rngState),
    String(state.orbs.length),
  ];
  for (const orb of state.orbs) {
    parts.push(`${orb.id}:${orb.kind}:${orb.x.toFixed(2)}:${orb.y.toFixed(2)}`);
  }
  return fnv1a(parts.join('|'));
}
