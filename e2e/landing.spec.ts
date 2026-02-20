import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should display the hero section and elements', async ({ page }) => {
    await page.goto('/');

    const heading = page.locator('h1', { hasText: 'Build Trading Strategies' });
    await expect(heading).toBeVisible();

    const startButton = page.locator('.landing-hero-actions button').filter({ hasText: 'Start Building — Free' });
    await expect(startButton).toBeVisible();
  });

  test('should handle navbar scroll effects', async ({ page }) => {
    await page.goto('/');

    const nav = page.locator('nav.landing-nav');
    
    // Scroll down significantly
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    // After scrolling down, the nav should have a non-zero Y translation (hidden)
    const transformDown = await nav.evaluate((el) => window.getComputedStyle(el).transform);
    expect(transformDown).not.toBe('matrix(1, 0, 0, 1, 0, 0)');

    // Scroll back up a bit
    await page.evaluate(() => window.scrollBy(0, -100));
    await page.waitForTimeout(500);

    // Nav should reappear
    await expect(nav).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  });
});
