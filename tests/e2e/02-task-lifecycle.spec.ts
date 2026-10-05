import { test, expect } from '@playwright/test';
import { clearEmulatorData, setupFamily, registerUser, signIn } from './helpers';

test.beforeEach(async () => {
  await clearEmulatorData();
});

test('full task lifecycle: parent creates task → child completes → parent approves → points awarded', async ({ browser }) => {
  // Set up parent + child accounts via REST API — no browser Firestore listeners
  // during data setup avoids the emulator watch-stream race (ca9 assertion).
  await setupFamily({
    parent: { email: 'parent@test.com', password: 'testpass123', name: 'Test Parent' },
    child:  { email: 'child@test.com',  password: 'testpass123', name: 'Test Child'  },
  });

  // Open both interaction contexts simultaneously so there's no sequential
  // close/reopen race with the emulator.
  const parentCtx  = await browser.newContext();
  const parentPage = await parentCtx.newPage();
  const childCtx   = await browser.newContext();
  const childPage  = await childCtx.newPage();

  // ── Phase 1: Parent signs in and creates a task ──────────────────────────────
  await signIn(parentPage, 'parent@test.com', 'testpass123');

  await parentPage.getByRole('button', { name: 'Review' }).click();
  await parentPage.getByRole('button', { name: 'New Task' }).click();
  await parentPage.getByText('Task Title').waitFor({ state: 'visible', timeout: 10000 });

  await parentPage.getByRole('button', { name: 'One-off' }).click();
  await parentPage.getByPlaceholder('e.g. Clean Bedroom').fill('Clean the Kitchen');

  // Wait for child to appear in the Assign To dropdown (real-time Firestore listener)
  const assignSelect = parentPage.locator('select');
  await expect(assignSelect.locator('option', { hasText: 'Test Child' })).toBeAttached({ timeout: 15000 });
  await assignSelect.selectOption({ label: 'Test Child' });

  await parentPage.locator('input[type="number"]').fill('50');

  // KPI quality standard is required
  await parentPage.locator('textarea[placeholder*="Floor is clear"]').fill('Kitchen surfaces are wiped, dishes done');

  // Turn off photo proof requirement — the toggle's indicator has translate-x-6 when ON (default).
  // Without this the child would need to upload a photo before submitting.
  const proofToggle = parentPage.locator('button').filter({ has: parentPage.locator('.translate-x-6') });
  await proofToggle.click();

  // Due date is required for One-off tasks.
  // The form opens with taskType='daily' (recurring end-date visible), then
  // switching to One-off triggers a framer-motion exit/enter pair that briefly
  // puts TWO date inputs in the DOM. Target specifically the due-date input by
  // its bg-slate-50 class (the recurring end-date has bg-white).
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateInput = parentPage.locator('input[type="date"].bg-slate-50');
  await dateInput.waitFor({ state: 'visible', timeout: 5000 });
  await dateInput.fill(tomorrow.toISOString().split('T')[0]);

  await parentPage.getByRole('button', { name: 'Deploy this Task' }).click();

  // Wait for the Create a Task modal to close (form submitted successfully).
  // Newly created tasks have status='pending' and appear in a collapsed accordion
  // in the parent's task list, so we verify creation on the child's dashboard instead.
  await expect(parentPage.getByRole('heading', { name: 'Create a Task' })).toBeHidden({ timeout: 20000 });

  // ── Phase 2: Child signs in and completes the task ───────────────────────────
  await signIn(childPage, 'child@test.com', 'testpass123');

  await expect(childPage.getByText('Clean the Kitchen')).toBeVisible({ timeout: 15000 });
  await childPage.getByText('Clean the Kitchen').click();
  await childPage.getByText('Accept this Mission').click();

  await expect(childPage.getByText('Mark Done — Submit for Review')).toBeVisible({ timeout: 10000 });
  await childPage.getByText('Mark Done — Submit for Review').click();

  await expect(childPage.getByText(/submitted|pending review/i)).toBeVisible({ timeout: 10000 });

  // ── Phase 3: Parent approves ──────────────────────────────────────────────────
  // No reload — inMemoryPersistence means reload logs the user out. The parent's
  // Firestore listener fires when the child submits, showing the task in Review.
  await expect(parentPage.getByText('Clean the Kitchen')).toBeVisible({ timeout: 15000 });
  await parentPage.getByText('Clean the Kitchen').click();
  await expect(parentPage.getByText('Approve')).toBeVisible({ timeout: 10000 });
  await parentPage.getByText('Approve').click();

  // ── Phase 4: Child sees awarded points ───────────────────────────────────────
  // No reload — Firestore listener updates the child dashboard in real-time when
  // the parent approves and totalPoints is incremented.
  await expect(childPage.getByText(/50/)).toBeVisible({ timeout: 15000 });

  await parentCtx.close();
  await childCtx.close();
});

test('parent can open task form and browse task types', async ({ browser }) => {
  const ctx  = await browser.newContext();
  const page = await ctx.newPage();

  await registerUser(page, {
    role: 'parent', name: 'Test Parent', email: 'parent@test.com',
    password: 'testpass123', action: 'create',
  });

  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'New Task' }).click();
  await page.getByText('Task Title').waitFor({ state: 'visible', timeout: 10000 });

  await expect(page.getByRole('button', { name: 'Daily' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Weekly' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monthly' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'One-off' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'KPI Goal' })).toBeVisible();

  await page.getByRole('button', { name: 'Daily' }).click();
  await page.getByPlaceholder('e.g. Clean Bedroom').fill('Morning Exercise');
  await expect(page.getByText('Task Title')).toBeVisible();

  await ctx.close();
});
