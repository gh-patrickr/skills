import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(configDir, '..');
const port = Number(process.env.WG_E2E_PORT ?? 4173);
/**
 * Per-run artifact directory. `wg verify` points this inside
 * `artifacts/<run>/playwright/` so two threads never overwrite each other's
 * results, traces or HTML report.
 */
const artifactsDir = process.env.WG_ARTIFACTS_DIR
  ? path.resolve(root, process.env.WG_ARTIFACTS_DIR)
  : path.join(root, 'artifacts', 'playwright');
/** wg-managed runs always boot their own preview; manual runs may reuse one. */
const reuseExistingServer =
  process.env.WG_REUSE_SERVER === undefined ? !process.env.CI : process.env.WG_REUSE_SERVER === '1';

/**
 * Tests run against a production-equivalent build served by `vite preview`.
 * `node tools/wg.mjs preview` builds `dist-e2e` on demand, so
 * `npm run test:e2e` works from a clean checkout.
 */
export default defineConfig({
  testDir: path.join(configDir, 'e2e'),
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.012,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(artifactsDir, 'results.json') }],
    ['html', { outputFolder: path.join(artifactsDir, 'html'), open: 'never' }],
  ],
  outputDir: path.join(artifactsDir, 'test-results'),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.WG_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 1100, height: 800 },
    trace: 'retain-on-failure',
    video: process.env.WG_VIDEO === '1' ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure',
    reducedMotion: 'no-preference',
  },
  projects: [
    { name: 'ui', testIgnore: /visual\.spec\.ts/ },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: {
    command: `node tools/wg.mjs preview --port ${port}`,
    cwd: root,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
