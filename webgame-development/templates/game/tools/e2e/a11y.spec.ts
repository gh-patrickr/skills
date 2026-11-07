import { createRequire } from 'node:module';
import { expect, test } from './fixtures';
import { boot, start } from './helpers';

const require = createRequire(import.meta.url);

interface AxeViolation {
  id: string;
  impact: string | null;
  targets: string[];
}

async function runAxe(page: import('@playwright/test').Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  return page.evaluate(async () => {
    const axe = (window as unknown as {
      axe: {
        run: (context?: Document) => Promise<{
          violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: string[] }> }>;
        }>;
      };
    }).axe;
    const results = await axe.run(document);
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }));
  });
}

test('the menu has no axe violations', async ({ page }) => {
  await boot(page, { seed: 8 });
  expect(await runAxe(page)).toEqual([]);
});

test('the gameplay HUD has no axe violations', async ({ page }) => {
  await boot(page, { seed: 8 });
  await start(page);
  expect(await runAxe(page)).toEqual([]);
});

test('keyboard alone can start a run', async ({ page }) => {
  await boot(page, { seed: 8 });

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Start run' })).toBeFocused();

  await page.keyboard.press('Enter');
  await expect.poll(async () => (await page.evaluate(() => window.__WG__!.snapshot().phase))).toBe('playing');
});

test('reduced motion still renders and plays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, { seed: 8 });
  await start(page);

  const after = await page.evaluate(() => window.__WG__!.step(120));
  expect(after.tick).toBe(120);
  expect(after.phase).toBe('playing');
});
