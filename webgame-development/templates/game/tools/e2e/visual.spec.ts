import { expect, test } from './fixtures';
import { boot, start, step } from './helpers';

/**
 * Baselines are created on the first run (`--update-snapshots=missing` from
 * `wg verify`) and then compared with a small pixel tolerance. Fonts and
 * canvas antialiasing differ per OS, so Playwright names snapshots per
 * platform — commit each platform you care about.
 */
test('menu screen', async ({ page }) => {
  await boot(page, { seed: 7 });
  await expect(page).toHaveScreenshot('menu.png', { fullPage: false });
});

test('seeded gameplay field', async ({ page }) => {
  await boot(page, { seed: 7 });
  await start(page);
  const state = await step(page, 180);
  expect(state.tick).toBe(180);

  await expect(page.locator('#game')).toHaveScreenshot('gameplay-seed7.png', {
    animations: 'disabled',
  });
});
