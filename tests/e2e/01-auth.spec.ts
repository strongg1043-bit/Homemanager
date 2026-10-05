import { test, expect } from '@playwright/test';
import { clearEmulatorData, setupFamily, registerUser } from './helpers';

test.beforeEach(async () => {
  await clearEmulatorData();
});

test('parent can register and create a family', async ({ page }) => {
  await registerUser(page, {
    role: 'parent',
    name: 'Test Parent',
    email: 'parent@test.com',
    password: 'testpass123',
    action: 'create',
  });

  // Should land on parent dashboard with nav tabs visible
  await expect(page.getByRole('button', { name: 'Review' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Family' })).toBeVisible();
});

test('child can register and join a family', async ({ page }) => {
  // Create parent account and family via REST API — no browser Firestore listeners
  // during setup avoids the emulator watch-stream race (INTERNAL ASSERTION FAILED ca9).
  const { inviteCode } = await setupFamily({
    parent: { email: 'parent@test.com', password: 'testpass123', name: 'Test Parent' },
  });
  expect(inviteCode).toMatch(/^[A-Z0-9]{6}$/);

  // Register the child through the actual UI (this is what the test verifies)
  await registerUser(page, {
    role: 'child',
    name: 'Test Child',
    email: 'child@test.com',
    password: 'testpass123',
    action: 'join',
    joinCode: inviteCode,
  });

  // Child should reach the child dashboard — verify with family name and child-only nav tab
  await expect(page.getByRole('button', { name: 'My Score' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Test Family')).toBeVisible();
});

test('invalid invite code blocks registration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign Up' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await page.getByText("I'm a Child").waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText("I'm a Child").click();
  await page.getByPlaceholder('e.g. Alex').fill('Test Child');
  await page.getByText('Join Existing').click();
  await page.getByPlaceholder('ABCDEF').fill('ZZZZZZ');
  await page.getByPlaceholder('name@email.com').fill('child@test.com');
  await page.locator('input[type="password"]').fill('testpass123');
  await page.getByRole('button', { name: /sign up now|create account/i }).click();

  // After the failed registration, the user should NOT reach the child dashboard.
  // The app rolls back the auth account and returns to the login screen.
  await page.waitForTimeout(5000); // allow time for rollback
  const dashboardNav = page.locator('nav').filter({ hasText: /home|score/i });
  await expect(dashboardNav).not.toBeVisible();

  // App should be back at the auth screen (Sign In / Sign Up visible)
  await expect(page.getByRole('button', { name: 'Sign Up' })).toBeVisible({ timeout: 10000 });
});
