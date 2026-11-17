import { expect, test } from './fixtures';
import { boot, start, step } from './helpers';

test('seeded runs are reproducible and spawn content', async ({ page }) => {
  await boot(page, { seed: 1234 });
  await start(page);
  const first = await step(page, 300);

  expect(first.tick).toBe(300);
  expect(first.orbs.length).toBeGreaterThan(0);

  await page.reload();
  await page.waitForFunction(() => window.__WG__?.ready === true);
  await start(page);
  const second = await step(page, 300);

  expect(second.hash).toBe(first.hash);
  expect(second.score).toBe(first.score);
});

test('HUD mirrors game state every frame', async ({ page }) => {
  await boot(page, { seed: 99 });
  await start(page);
  const after = await step(page, 120);

  await expect(page.getByTestId('score')).toHaveText(String(after.score));
  await expect(page.getByTestId('combo')).toHaveText(`×${after.combo}`);
  await expect(page.getByTestId('lives')).toHaveText(String(after.lives));
});

test('the bot can play a run and score', async ({ page }) => {
  await boot(page, { seed: 5 });
  await start(page);
  const result = await page.evaluate(() => window.__WG__!.autoplay(900));

  expect(result.phase === 'playing' || result.phase === 'gameover').toBe(true);
  expect(result.score).toBeGreaterThan(0);
  expect(result.tick).toBeGreaterThan(60);

  const events = await page.evaluate(() => window.__WG__!.events());
  expect(events.some((event) => event.type === 'star')).toBe(true);
});
