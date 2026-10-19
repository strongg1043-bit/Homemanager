import { test, expect } from '@playwright/test';
import { clearEmulatorData, setupFamily, signIn, getUidByEmail, seedTask } from './helpers';

test.beforeEach(async () => {
  await clearEmulatorData();
});

test('dispute: child raises a dispute → parent sees and resolves it', async ({ browser }) => {
  const { householdId } = await setupFamily({
    parent: { email: 'parent@test.com', password: 'testpass123', name: 'Test Parent' },
    child:  { email: 'child@test.com',  password: 'testpass123', name: 'Test Child'  },
  });

  const childUid = await getUidByEmail('child@test.com');
  await seedTask({
    householdId,
    assignedTo: childUid,
    assignedToName: 'Test Child',
    title: 'Wash the Dishes',
    status: 'accepted',
  });

  const parentCtx  = await browser.newContext();
  const parentPage = await parentCtx.newPage();
  const childCtx   = await browser.newContext();
  const childPage  = await childCtx.newPage();

  // ── Child raises a dispute on the task ───────────────────────────────────────
  await signIn(childPage, 'child@test.com', 'testpass123');
  await expect(childPage.getByText('Wash the Dishes')).toBeVisible({ timeout: 15000 });
  await childPage.getByTitle('Raise Dispute').click();

  await childPage.getByPlaceholder(/explain why you are raising/i).fill('The point value seems wrong for this task.');
  await childPage.getByRole('button', { name: 'Report Issue' }).click();

  await expect(childPage.getByText('Dispute Raised!')).toBeVisible({ timeout: 10000 });
  await childPage.getByRole('button', { name: 'Done' }).click();

  // ── Parent sees it under Active Disputes and resolves it ─────────────────────
  await signIn(parentPage, 'parent@test.com', 'testpass123');
  await expect(parentPage.getByText('Active Disputes')).toBeVisible({ timeout: 15000 });
  await expect(parentPage.getByText('The point value seems wrong for this task.')).toBeVisible();

  await parentPage.getByRole('button', { name: 'Resolve' }).click();
  await parentPage.getByPlaceholder(/describe the outcome/i).fill('Adjusted and explained to the child — all good now.');
  await parentPage.getByRole('button', { name: /mark.*resolved|confirm/i }).click();

  await expect(parentPage.getByText('Dispute Resolved')).toBeVisible({ timeout: 10000 });

  await parentCtx.close();
  await childCtx.close();
});
