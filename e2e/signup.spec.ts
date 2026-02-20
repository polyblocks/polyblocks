import { test, expect } from '@playwright/test';

test.describe('Signup Flow', () => {
  test('should allow a user to sign up with a random email', async ({ page }) => {
    // Generate a random email to test a fresh signup every time
    const randomSuffix = Date.now();
    const testEmail = `testuser_${randomSuffix}@polyblocks-e2e.com`;
    const testPassword = 'SecurePassword123!';

    // Navigate to landing page
    await page.goto('/');

    // Click the "Start Building — Free" button to open the auth modal
    await page.locator('.landing-hero-actions button').filter({ hasText: 'Start Building — Free' }).click();

    // Check if modal is visible
    const authModal = page.locator('.auth-modal');
    await expect(authModal).toBeVisible();

    // Ensure it's the Register view
    const switchModeBtn = page.locator('.auth-switch button');
    if (await switchModeBtn.textContent() === 'Sign up') {
      await switchModeBtn.click();
    }

    // Ensure the title changed to Create Account
    await expect(page.locator('.auth-modal h2')).toHaveText('Create Account');

    // Fill in the form
    await page.getByPlaceholder('Name (optional)').fill(`Test User ${randomSuffix}`);
    await page.getByPlaceholder('Email', { exact: true }).fill(testEmail);
    await page.getByPlaceholder('Password (min 8 characters)').fill(testPassword);

    // Submit the form
    await page.locator('.auth-submit-btn').click();

    // We expect the app to redirect us to the dashboard after a successful signup
    await expect(page).toHaveURL(/.*\/dashboard/);
    
    // Check that we reached the dashboard and it's visible
    const dashboardHero = page.locator('.dashboard-hero h1');
    await expect(dashboardHero).toBeVisible({ timeout: 10000 });
  });
});
