import { test, expect } from '@playwright/test';
import { clearEmulatorData, registerUser } from './helpers';

// The deleteMyAccount Cloud Function isn't part of the e2e emulator set, so these tests cover
// the in-app entry point and its confirmation gate. The deletion logic itself is tested
// against the Firestore emulator in functions/test/accountDeletion.test.ts.

test.beforeEach(async () => {
  await clearEmulatorData();
});

test('parent can reach Delete account and must type DELETE to enable it', async ({ page }) => {
  await registerUser(page, {
    role: 'parent', name: 'Test Parent', email: 'parent@test.com',
    password: 'testpass123', action: 'create',
  });

  await page.getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: 'Delete my account' }).click();

  const confirm = page.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();

  await page.getByLabel(/Type DELETE to confirm/i).fill('delete');
  await expect(confirm).toBeEnabled();

  // Cancelling collapses the form and leaves the account untouched.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel(/Type DELETE to confirm/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage' })).toBeVisible();
});
