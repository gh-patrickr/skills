/**
 * Headless bot playtest.
 *
 * Runs the pure game core in Node — no browser, no canvas — so thousands of
 * frames cost milliseconds. This is the balance/soak test that catches
 * "unplayable" changes before a human ever opens the game.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { autopilotIntent } from '../../src/game/autopilot';
import { createGame } from '../../src/game/game';
import type { Snapshot } from '../../src/game/types';

const DT = 1000 / 60;

function numberFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

function stringFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

interface BotResult {
  seed: number;
  score: number;
  stars: number;
  hits: number;
  ticks: number;
  ended: boolean;
  level: number;
  maxTickMs: number;
  nonFinite: boolean;
}

function runBot(seed: number, maxTicks: number): BotResult {
  const game = createGame({ seed });
  game.start();

  let stars = 0;
  let hits = 0;
  let maxTickMs = 0;
  let nonFinite = false;

  for (let tick = 0; tick < maxTicks; tick++) {
    if (game.state.phase !== 'playing') break;
    const snapshot = game.snapshot();
    const started = performance.now();
    game.update(autopilotIntent(snapshot), DT);
    maxTickMs = Math.max(maxTickMs, performance.now() - started);

    for (const event of game.drainEvents()) {
      if (event.type === 'star') stars += 1;
      if (event.type === 'hit') hits += 1;
    }
  }

  const final: Snapshot = game.snapshot();
  for (const value of [final.score, final.player.x, final.player.y, final.player.vx, final.player.vy]) {
    if (!Number.isFinite(value)) nonFinite = true;
  }

  return {
    seed,
    score: final.score,
    stars,
    hits,
    ticks: final.tick,
    ended: final.phase === 'gameover',
    level: final.level,
    maxTickMs,
    nonFinite,
  };
}

function replayHash(seed: number, ticks: number): string {
  const game = createGame({ seed });
  game.start();
  for (let tick = 0; tick < ticks; tick++) game.update(autopilotIntent(game.snapshot()), DT);
  return game.snapshot().hash;
}

const seconds = numberFlag('seconds', 60);
const bots = Math.max(1, Math.floor(numberFlag('bots', 4)));
const baseSeed = Math.max(1, Math.floor(numberFlag('seed', 1)));
const outFile = stringFlag('out', path.join('artifacts', 'playtest', 'playtest.json'));
const maxTicks = Math.max(60, Math.ceil(seconds * 60));

const results: BotResult[] = [];
const startedAt = performance.now();
for (let bot = 0; bot < bots; bot++) {
  results.push(runBot(baseSeed + bot * 7919, maxTicks));
}
const wallMs = performance.now() - startedAt;

const totalStars = results.reduce((sum, result) => sum + result.stars, 0);
const totalHits = results.reduce((sum, result) => sum + result.hits, 0);
const scores = results.map((result) => result.score);
const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
const maxTickMs = Math.max(...results.map((result) => result.maxTickMs));

const replayA = replayHash(baseSeed, 600);
const replayB = replayHash(baseSeed, 600);

const invariants = [
  { id: 'stars-collected', ok: totalStars > 0, detail: `${totalStars} stars collected across ${bots} bot(s)` },
  { id: 'score-progress', ok: avgScore > 0, detail: `average score ${avgScore.toFixed(1)}` },
  { id: 'finite-state', ok: results.every((result) => !result.nonFinite), detail: 'all snapshots are finite' },
  { id: 'tick-cost', ok: maxTickMs < 5, detail: `worst tick ${maxTickMs.toFixed(3)} ms` },
  {
    id: 'not-instant-death',
    ok: results.some((result) => result.ticks > 120),
    detail: `longest run ${Math.max(...results.map((result) => result.ticks))} ticks`,
  },
  { id: 'replay-stable', ok: replayA === replayB, detail: `hash ${replayA}` },
];

const failures = invariants.filter((invariant) => !invariant.ok);
const ok = failures.length === 0;

const report = {
  schema: 'webgame/playtest/v1',
  ok,
  config: { seconds, bots, seed: baseSeed, maxTicks },
  wallMs,
  aggregate: {
    totalStars,
    totalHits,
    avgScore,
    maxTickMs,
    endedRuns: results.filter((result) => result.ended).length,
  },
  invariants,
  bots: results,
  replayHash: replayA,
};

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const lines = [
  `# Playtest report`,
  '',
  `- **Result:** ${ok ? 'PASS' : 'FAIL'}`,
  `- **Bots:** ${bots} × ${seconds}s sim (${(wallMs / 1000).toFixed(2)}s wall)`,
  `- **Average score:** ${avgScore.toFixed(1)}`,
  `- **Stars / hits:** ${totalStars} / ${totalHits}`,
  `- **Worst tick:** ${maxTickMs.toFixed(3)} ms`,
  '',
  '| Bot | Seed | Score | Stars | Hits | Ticks | Ended |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.map(
    (result, index) =>
      `| ${index + 1} | ${result.seed} | ${result.score} | ${result.stars} | ${result.hits} | ${result.ticks} | ${result.ended ? 'yes' : 'no'} |`,
  ),
  '',
  '## Invariants',
  '',
  ...invariants.map((invariant) => `- ${invariant.ok ? '✅' : '❌'} **${invariant.id}** — ${invariant.detail}`),
  '',
];
writeFileSync(outFile.replace(/\.json$/, '.md'), lines.join('\n'), 'utf8');

for (const invariant of invariants) {
  console.log(`${invariant.ok ? '✔' : '✖'} ${invariant.id}: ${invariant.detail}`);
}
console.log(`\n${ok ? 'PASS' : 'FAIL'} — ${outFile}`);

process.exitCode = ok ? 0 : 1;
