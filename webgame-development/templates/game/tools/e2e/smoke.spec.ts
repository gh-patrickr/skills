import { expect, test } from './fixtures';
import { boot, snapshot } from './helpers';

test('[smoke] boots to an accessible menu and starts a run', async ({ page }) => {
  await boot(page, { seed: 42 });

  await expect(page).toHaveTitle(/Aurora Drift/);
  await expect(page.getByRole('heading', { name: 'Aurora Drift', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start run' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Aurora Drift game field/ })).toBeVisible();

  const menu = await snapshot(page);
  expect(menu.phase).toBe('menu');
  expect(menu.score).toBe(0);

  await page.getByRole('button', { name: 'Start run' }).click();

  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
  await expect(page.getByRole('button', { name: 'Start run' })).toBeHidden();
  await expect(page.getByTestId('lives')).toHaveText('3');
});

test('[smoke] pause and resume stay in sync with the HUD', async ({ page }) => {
  await boot(page, { seed: 42 });
  await page.getByRole('button', { name: 'Start run' }).click();

  await page.keyboard.press('p');
  await expect.poll(async () => (await snapshot(page)).phase).toBe('paused');
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();

  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).phase).toBe('playing');
});
