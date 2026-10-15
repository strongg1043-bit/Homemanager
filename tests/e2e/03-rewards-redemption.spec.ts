import { test, expect } from '@playwright/test';
import { clearEmulatorData, setupFamily, signIn, grantPoints, getUidByEmail } from './helpers';

test.beforeEach(async () => {
  await clearEmulatorData();
});

test('reward redemption: parent adds reward → child redeems → parent approves and fulfills', async ({ browser }) => {
  await setupFamily({
    parent: { email: 'parent@test.com', password: 'testpass123', name: 'Test Parent' },
    child:  { email: 'child@test.com',  password: 'testpass123', name: 'Test Child'  },
  });

  // Grant starting points directly — redeeming needs a balance, and getting there via
  // the full task-approval flow is already covered by 02-task-lifecycle.spec.ts.
  const childUid = await getUidByEmail('child@test.com');
  await grantPoints(childUid, 100);

  const parentCtx  = await browser.newContext();
  const parentPage = await parentCtx.newPage();
  const childCtx   = await browser.newContext();
  const childPage  = await childCtx.newPage();

  // ── Parent adds a reward to the store ────────────────────────────────────────
  await signIn(parentPage, 'parent@test.com', 'testpass123');
  await parentPage.getByRole('button', { name: 'Settings' }).click();
  await parentPage.getByPlaceholder('e.g. 1hr Screen Time').waitFor({ state: 'visible', timeout: 15000 });
  // Scoped to the Add Reward form specifically — the household's Currency Settings
  // further down the same page also has an input with placeholder "50".
  const addRewardForm = parentPage.locator('form').filter({ has: parentPage.getByPlaceholder('e.g. 1hr Screen Time') });
  await addRewardForm.getByPlaceholder('e.g. 1hr Screen Time').fill('Movie Night');
  await addRewardForm.getByPlaceholder('50').fill('30');
  await addRewardForm.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(parentPage.getByText('Movie Night')).toBeVisible({ timeout: 10000 });

  // ── Child redeems it ──────────────────────────────────────────────────────────
  await signIn(childPage, 'child@test.com', 'testpass123');
  await childPage.getByRole('button', { name: 'My Score' }).click();
  await expect(childPage.getByText('Movie Night')).toBeVisible({ timeout: 15000 });
  await childPage.getByRole('button', { name: 'Redeem' }).click();
  await childPage.getByRole('button', { name: 'Confirm Redemption' }).click();
  await expect(childPage.getByText('Redeem Reward?')).toBeHidden({ timeout: 10000 });

  // Balance should drop immediately (points are deducted on request, not on approval).
  // Several elements on the page say "70 pts" in different contexts — target the
  // specific "Available Balance" summary line.
  await expect(childPage.getByText('70 pts = R70')).toBeVisible({ timeout: 10000 });

  // ── Parent approves and marks it fulfilled ───────────────────────────────────
  await parentPage.getByRole('button', { name: 'The Bank' }).click();
  await parentPage.getByText('Review redemption requests').click();
  // "Movie Night" appears twice (the statement grid below, and the ledger row we want) —
  // the Approve button is unambiguous and only appears once the ledger has rendered.
  await expect(parentPage.getByRole('button', { name: 'Approve' })).toBeVisible({ timeout: 15000 });
  await parentPage.getByRole('button', { name: 'Approve' }).click();
  await expect(parentPage.getByRole('button', { name: 'Mark Fulfilled' })).toBeVisible({ timeout: 10000 });
  await parentPage.getByRole('button', { name: 'Mark Fulfilled' }).click();
  await expect(parentPage.getByRole('button', { name: 'Confirm Payment' })).toBeVisible({ timeout: 10000 });
  await parentPage.getByRole('button', { name: 'Confirm Payment' }).click();

  // Status should now read "paid" in the ledger
  await expect(parentPage.getByText('R30 paid')).toBeVisible({ timeout: 10000 });

  await parentCtx.close();
  await childCtx.close();
});
