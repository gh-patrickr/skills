import { defineConfig } from 'vitest/config';

/**
 * Unit tests cover the deterministic core only — no DOM, no browser.
 * Coverage thresholds are enforced so the "pure core" stays the testable part.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'artifacts/coverage',
      include: ['src/game/**/*.ts', 'src/persist/save.ts'],
      exclude: ['src/game/types.ts'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
  },
});
