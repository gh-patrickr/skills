import type { Plugin } from 'vite';

/** Files under `src/game/` are the deterministic core: they must run in Node. */
const CORE_FILE = /[\\/]src[\\/]game[\\/][^\\/]+\.ts$/;

const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; why: string }> = [
  { pattern: /\bMath\.random\s*\(/, why: 'use the seeded RNG in src/game/rng.ts' },
  { pattern: /\bDate\.now\s*\(/, why: 'inject time (dt/tick) instead of reading the clock' },
  { pattern: /\bperformance\.now\s*\(/, why: 'inject time (dt/tick) instead of reading the clock' },
  { pattern: /\b(window|document|localStorage|sessionStorage)\b/, why: 'keep the core DOM-free so playtest can run it in Node' },
];

const ESCAPE_HATCH = 'wg-allow-platform';

/**
 * Enforces the architectural invariant that gameplay logic is pure and
 * deterministic. A violation fails the build, not review.
 *
 * Disable for one file with a `wg-allow-platform` comment when the code is
 * genuinely platform-bound (rare — put it in an adapter instead).
 */
export function gameBridge(options: { e2e: boolean }): Plugin {
  return {
    name: 'wg:game-bridge',
    enforce: 'pre',
    transform(code, id) {
      if (!CORE_FILE.test(id) || code.includes(ESCAPE_HATCH)) return null;
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(code)) {
          this.error(
            `Deterministic core violation in ${id.replace(/^.*?src/, 'src')}: ` +
              `matches ${rule.pattern}. ${rule.why}. ` +
              `Move the side effect to an adapter (src/main.ts, src/render, src/persist).`,
          );
        }
      }
      return null;
    },
    transformIndexHtml(html) {
      return html.replace(
        '</head>',
        `    <meta name="wg:build" content="${options.e2e ? 'e2e' : 'production'}" />\n  </head>`,
      );
    },
  };
}
