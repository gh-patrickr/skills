import { expect, test } from './fixtures';
import { snapshot, start } from './helpers';

test('migrates a v1 save and restores best score and mute state', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('webgame.save', JSON.stringify({ version: 1, best: 123, muted: true }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__WG__?.ready === true);

  await expect(page.getByTestId('best')).toHaveText('123');
  await expect(page.getByRole('button', { name: 'Unmute sound' })).toHaveAttribute('aria-pressed', 'true');
});

test('a finished run persists the new best across reloads', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__WG__?.ready === true);

  await start(page);
  const played = await page.evaluate(() => window.__WG__!.autoplay(600));
  expect(played.score).toBeGreaterThan(0);

  await page.evaluate(() => window.__WG__!.endRun());
  const finished = await snapshot(page);
  expect(finished.best).toBeGreaterThanOrEqual(finished.score);

  await page.reload();
  await page.waitForFunction(() => window.__WG__?.ready === true);
  await expect(page.getByTestId('best')).toHaveText(String(finished.best));
});
