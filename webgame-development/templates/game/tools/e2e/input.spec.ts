import { expect, test } from './fixtures';
import { boot, snapshot, start, step } from './helpers';

test('keyboard steering moves the ship through the real input path', async ({ page }) => {
  await boot(page, { seed: 3 });
  await start(page);

  const before = await snapshot(page);
  await page.keyboard.down('ArrowRight');
  const during = await step(page, 40);
  await page.keyboard.up('ArrowRight');

  expect(during.player.x).toBeGreaterThan(before.player.x + 20);
  expect(during.player.vx).toBeGreaterThan(0);
});

test('the pause key and the pause button agree', async ({ page }) => {
  await boot(page, { seed: 3 });
  await start(page);

  await page.keyboard.press('p');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');

  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');

  await page.getByRole('button', { name: 'Pause game' }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
});

test('end run returns to the game-over screen', async ({ page }) => {
  await boot(page, { seed: 3 });
  await start(page);
  await step(page, 60);

  await page.getByRole('button', { name: 'Pause game' }).click();
  await page.getByRole('button', { name: 'End run' }).click();

  await expect.poll(async () => (await snapshot(page)).phase).toBe('gameover');
  await expect(page.getByRole('heading', { name: 'Hull breached' })).toBeVisible();
});
