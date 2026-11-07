import { expect, test } from './fixtures';
import { boot, start } from './helpers';

test('live requestAnimationFrame loop holds a playable frame rate', async ({ page }) => {
  await boot(page, { seed: 3, live: true });
  await start(page);
  await page.waitForTimeout(2_500);

  const fps = await page.evaluate(() => window.__WG__!.fps());
  expect(fps).toBeGreaterThanOrEqual(30);

  const snapshot = await page.evaluate(() => window.__WG__!.snapshot());
  expect(snapshot.phase).toBe('playing');
  expect(snapshot.tick).toBeGreaterThan(60);
});
