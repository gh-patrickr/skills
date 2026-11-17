import { test as base, expect } from '@playwright/test';

/**
 * Auto fixture: a Playwright test fails on any console error or uncaught
 * exception, not only on a failed assertion. Most real game bugs surface here
 * first (asset 404s, unhandled promise rejections, WebGL context loss).
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors, 'console errors or uncaught exceptions').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
