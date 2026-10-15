import { request, type Page } from '@playwright/test';

const PROJECT_ID = 'homemanager-c409a';
const AUTH_EMULATOR = 'http://localhost:9099';
const FIRESTORE_EMULATOR = 'http://localhost:8080';

const INVITE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len: number): string {
  return Array.from({ length: len }, () => INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]).join('');
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** Wipe all emulator Auth accounts and Firestore documents between tests. */
export async function clearEmulatorData() {
  // Give the Firestore emulator 2 s to finish processing watch-stream cleanup
  // from the previous test's connections. Without this, the emulator can be in
  // a transitional state when new connections arrive, causing the ca9 assertion.
  await new Promise(resolve => setTimeout(resolve, 2000));

  const ctx = await request.newContext();
  await ctx.delete(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`);
  await ctx.delete(`${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`);
  await ctx.dispose();
}

/**
 * Create parent (and optionally child) accounts via the emulator REST API.
 * Using REST avoids opening browser Firestore listeners during setup, which
 * prevents the emulator watch-stream race (INTERNAL ASSERTION FAILED ca9).
 */
export async function setupFamily(opts: {
  parent: { email: string; password: string; name: string };
  child?: { email: string; password: string; name: string };
}): Promise<{ inviteCode: string; householdId: string }> {
  const ctx = await request.newContext();
  const now = new Date().toISOString();

  // ── 1. Create parent auth account ──────────────────────────────────────────
  // Use the v1 endpoint format (firebase-tools 13+); older /v3/relyingparty/
  // paths are no longer routed by the Auth emulator.
  const parentAuthResp = await ctx.post(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`,
    { data: { email: opts.parent.email, password: opts.parent.password, displayName: opts.parent.name, returnSecureToken: true } },
  );
  if (!parentAuthResp.ok()) {
    throw new Error(`Auth create parent failed: ${parentAuthResp.status()} ${await parentAuthResp.text()}`);
  }
  const { localId: parentUid } = await parentAuthResp.json() as { localId: string };

  // ── 2. Create Firestore documents (no auth header — rules say allow if true) ─
  const inviteCode  = randomCode(6);
  const householdId = randomId();
  const firestoreBase = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  const householdResp = await ctx.post(`${firestoreBase}/households?documentId=${householdId}`, {
    data: {
      fields: {
        id:                   { stringValue: householdId },
        name:                 { stringValue: 'Test Family' },
        createdBy:            { stringValue: parentUid },
        members:              { arrayValue: { values: [{ stringValue: parentUid }] } },
        rewardStore:          { arrayValue: { values: [] } },
        currency:             { stringValue: 'R' },
        currencyName:         { stringValue: 'Points' },
        cashOutEnabled:       { booleanValue: true },
        minCashOut:           { integerValue: '100' },
        inviteCode:           { stringValue: inviteCode },
        familyColour:         { stringValue: 'indigo' },
        familyLogo:           { nullValue: null },
        familyMotto:          { stringValue: 'Teamwork makes the dream work!' },
        onboardingTaskPoints: { integerValue: '0' },
        createdAt:            { timestampValue: now },
      },
    },
  });
  if (!householdResp.ok()) {
    throw new Error(`Firestore create household failed: ${householdResp.status()} ${await householdResp.text()}`);
  }

  // ── 3. Create parent user profile ─────────────────────────────────────────
  const parentProfileResp = await ctx.post(`${firestoreBase}/users?documentId=${parentUid}`, {
    data: {
      fields: {
        uid:            { stringValue: parentUid },
        displayName:    { stringValue: opts.parent.name },
        email:          { stringValue: opts.parent.email },
        role:           { stringValue: 'parent' },
        householdId:    { stringValue: householdId },
        totalPoints:    { integerValue: '0' },
        trustScore:     { integerValue: '100' },
        badges:         { arrayValue: { values: [] } },
        profilePhoto:   { nullValue: null },
        avatarColour:   { stringValue: '#1B3A5C' },
        showOnboarding: { booleanValue: false },
        createdAt:      { timestampValue: now },
      },
    },
  });
  if (!parentProfileResp.ok()) {
    throw new Error(`Firestore create parent profile failed: ${parentProfileResp.status()} ${await parentProfileResp.text()}`);
  }

  // ── 4. Create invite code lookup doc ──────────────────────────────────────
  const inviteResp = await ctx.post(`${firestoreBase}/inviteCodes?documentId=${inviteCode}`, {
    data: {
      fields: {
        householdId:          { stringValue: householdId },
        householdName:        { stringValue: 'Test Family' },
        onboardingTaskPoints: { integerValue: '0' },
      },
    },
  });
  if (!inviteResp.ok()) {
    throw new Error(`Firestore create inviteCode failed: ${inviteResp.status()} ${await inviteResp.text()}`);
  }

  // ── 5. Optionally create child account ────────────────────────────────────
  if (opts.child) {
    const childAuthResp = await ctx.post(
      `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`,
      { data: { email: opts.child.email, password: opts.child.password, displayName: opts.child.name, returnSecureToken: true } },
    );
    if (!childAuthResp.ok()) {
      throw new Error(`Auth create child failed: ${childAuthResp.status()} ${await childAuthResp.text()}`);
    }
    const { localId: childUid } = await childAuthResp.json() as { localId: string };

    const childProfileResp = await ctx.post(`${firestoreBase}/users?documentId=${childUid}`, {
      data: {
        fields: {
          uid:                 { stringValue: childUid },
          displayName:         { stringValue: opts.child.name },
          email:               { stringValue: opts.child.email },
          role:                { stringValue: 'child' },
          householdId:         { stringValue: householdId },
          totalPoints:         { integerValue: '0' },
          trustScore:          { integerValue: '100' },
          badges:              { arrayValue: { values: [] } },
          profilePhoto:        { nullValue: null },
          avatarColour:        { stringValue: '#1B3A5C' },
          showChildOnboarding: { booleanValue: false },
          createdAt:           { timestampValue: now },
        },
      },
    });
    if (!childProfileResp.ok()) {
      throw new Error(`Firestore create child profile failed: ${childProfileResp.status()} ${await childProfileResp.text()}`);
    }

    const patchResp = await ctx.patch(
      `${firestoreBase}/households/${householdId}?updateMask.fieldPaths=members`,
      {
        data: {
          fields: {
            members: { arrayValue: { values: [{ stringValue: parentUid }, { stringValue: childUid }] } },
          },
        },
      },
    );
    if (!patchResp.ok()) {
      throw new Error(`Firestore patch household members failed: ${patchResp.status()} ${await patchResp.text()}`);
    }
  }

  await ctx.dispose();
  return { inviteCode, householdId };
}

/** Register a new user through the Auth UI and return after reaching the dashboard. */
export async function registerUser(
  page: Page,
  opts: {
    role: 'parent' | 'child';
    name: string;
    email: string;
    password: string;
    /** 'create' = start new family, 'join' = join with code */
    action: 'create' | 'join';
    familyName?: string;
    joinCode?: string;
  },
) {
  // Capture page errors and console.error calls to help diagnose crashes
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => { pageErrors.push(`PAGE ERROR: ${err.message}`); });
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`CONSOLE ERROR: ${msg.text()}`);
  });

  await page.goto('/');

  // Default state is Sign In — switch to Sign Up first
  await page.getByRole('button', { name: 'Sign Up' }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('button', { name: 'Sign Up' }).click();

  // Role selection now appears
  const roleLabel = opts.role === 'parent' ? "I'm a Parent" : "I'm a Child";
  await page.getByText(roleLabel).waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText(roleLabel).click();

  // Fill name (placeholder is "e.g. Alex" — label has no for= attribute)
  await page.getByPlaceholder('e.g. Alex').fill(opts.name);

  // Choose create vs join
  const actionLabel =
    opts.role === 'parent'
      ? opts.action === 'create' ? 'Create Family' : 'Join Family'
      : opts.action === 'create' ? 'Start New Family' : 'Join Existing';
  await page.getByText(actionLabel).click();

  // Family name (create only) — only some flows show this
  if (opts.action === 'create' && opts.familyName) {
    const familyInput = page.getByPlaceholder(/family name/i).first();
    if (await familyInput.isVisible()) {
      await familyInput.fill(opts.familyName);
    }
  }

  // Join code (join only)
  if (opts.action === 'join' && opts.joinCode) {
    await page.getByPlaceholder('ABCDEF').fill(opts.joinCode);
  }

  // Fill credentials
  await page.getByPlaceholder('name@email.com').fill(opts.email);
  await page.locator('input[type="password"]').fill(opts.password);

  // Submit
  await page.getByRole('button', { name: /sign up now|create account/i }).click();

  // Wait for whichever post-submit state appears first
  const skipBtn         = page.getByRole('button', { name: /skip setup/i });
  const reviewBtn       = page.getByRole('button', { name: 'Review' });
  const homeBtn         = page.getByRole('button', { name: 'Home' });
  const errorBoundary   = page.getByText('Something went wrong');
  const profileError    = page.getByText("Couldn't load your profile");
  const setupIncomplete = page.getByText('Account setup incomplete');
  // Children who join a family see the ChildWelcomeScreen before the dashboard
  const welcomeBtn      = page.getByRole('button', { name: /take me to my dashboard/i });

  const firstVisible = skipBtn.or(reviewBtn).or(homeBtn)
    .or(errorBoundary).or(profileError).or(setupIncomplete).or(welcomeBtn);
  await firstVisible.first().waitFor({ state: 'visible', timeout: 30000 });

  // If error state appeared, fail with diagnostic info
  const crashed = await errorBoundary.isVisible()
    || await profileError.isVisible()
    || await setupIncomplete.isVisible();
  if (crashed) {
    const errors = pageErrors.join('\n');
    throw new Error(`App crashed during ${opts.role} registration:\n${errors || '(no captured errors)'}`);
  }

  // Child welcome screen — click through to the actual dashboard
  if (await welcomeBtn.isVisible()) {
    await welcomeBtn.click();
    await homeBtn.waitFor({ state: 'visible', timeout: 20000 });
  }

  // Parent onboarding wizard — skip it
  if (await skipBtn.isVisible()) {
    await skipBtn.click();
    await reviewBtn.or(homeBtn).first().waitFor({ state: 'visible', timeout: 20000 });
  }
}

/** Sign in to an existing account and wait for the dashboard to appear. */
export async function signIn(page: Page, email: string, password: string) {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => { pageErrors.push(`PAGE ERROR: ${err.message}`); });
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`CONSOLE ERROR: ${msg.text()}`);
  });

  await page.goto('/');
  await page.getByPlaceholder('name@email.com').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByPlaceholder('name@email.com').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  const reviewBtn       = page.getByRole('button', { name: 'Review' });
  const homeBtn         = page.getByRole('button', { name: 'Home' });
  const errorBoundary   = page.getByText('Something went wrong');
  const profileError    = page.getByText("Couldn't load your profile");
  const setupIncomplete = page.getByText('Account setup incomplete');

  const firstVisible = reviewBtn.or(homeBtn)
    .or(errorBoundary).or(profileError).or(setupIncomplete);
  await firstVisible.first().waitFor({ state: 'visible', timeout: 30000 });

  const crashed = await errorBoundary.isVisible()
    || await profileError.isVisible()
    || await setupIncomplete.isVisible();
  if (crashed) {
    const errors = pageErrors.join('\n');
    throw new Error(`App crashed or profile failed during sign-in as ${email}:\n${errors || '(no captured errors)'}`);
  }
}

/** Look up a user's uid by email via REST — setupFamily doesn't return child uids directly. */
export async function getUidByEmail(email: string): Promise<string> {
  const ctx = await request.newContext();
  const resp = await ctx.get(`${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users`);
  const json = await resp.json() as { documents?: { name: string; fields: Record<string, { stringValue?: string }> }[] };
  const doc = json.documents?.find(d => d.fields.email?.stringValue === email);
  await ctx.dispose();
  if (!doc) throw new Error(`No user found with email ${email}`);
  return doc.name.split('/').pop()!;
}

/** Directly set a child's totalPoints via REST — for tests that need a starting balance
 *  without running the full task-approval flow first. */
export async function grantPoints(childUid: string, points: number) {
  const ctx = await request.newContext();
  const resp = await ctx.patch(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${childUid}?updateMask.fieldPaths=totalPoints`,
    { data: { fields: { totalPoints: { integerValue: String(points) } } } },
  );
  if (!resp.ok()) throw new Error(`grantPoints failed: ${resp.status()} ${await resp.text()}`);
  await ctx.dispose();
}

/** Directly create a task via REST — for tests that need an existing task without
 *  running the full parent-creates-task UI flow first (already covered elsewhere). */
export async function seedTask(opts: {
  householdId: string;
  assignedTo: string;
  assignedToName: string;
  title: string;
  status?: string;
  pointValue?: number;
}): Promise<string> {
  const ctx = await request.newContext();
  const taskId = randomId();
  const now = new Date().toISOString();
  const resp = await ctx.post(
    `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/households/${opts.householdId}/tasks?documentId=${taskId}`,
    {
      data: {
        fields: {
          id:             { stringValue: taskId },
          householdId:    { stringValue: opts.householdId },
          title:          { stringValue: opts.title },
          description:    { stringValue: '' },
          assignedTo:     { stringValue: opts.assignedTo },
          assignedToName: { stringValue: opts.assignedToName },
          pointValue:     { integerValue: String(opts.pointValue ?? 20) },
          taskType:       { stringValue: 'adhoc_date' },
          status:         { stringValue: opts.status ?? 'accepted' },
          kpi:            { stringValue: 'Done well' },
          kpiLocked:      { booleanValue: true },
          evidenceType:   { stringValue: 'any' },
          dueDate:        { nullValue: null },
          requiresProof:  { booleanValue: false },
          beforePhotoUrl: { nullValue: null },
          proofPhotoUrl:  { nullValue: null },
          proposedBy:     { nullValue: null },
          rewardLocked:   { booleanValue: true },
          completedAt:    { nullValue: null },
          approvedAt:     { nullValue: null },
          createdAt:      { timestampValue: now },
        },
      },
    },
  );
  if (!resp.ok()) throw new Error(`seedTask failed: ${resp.status()} ${await resp.text()}`);
  await ctx.dispose();
  return taskId;
}

/** Read the household invite code from the parent Family tab. */
export async function getInviteCode(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Family' }).click();
  const codeEl = page.locator('.font-mono').first();
  await codeEl.waitFor({ state: 'visible', timeout: 15000 });
  const code = (await codeEl.textContent())?.trim() ?? '';
  if (!code || code.length !== 6) throw new Error(`Unexpected invite code: "${code}"`);
  return code;
}
