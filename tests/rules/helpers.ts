import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_ID = 'homemanager-rules-test';
const RULES_PATH = resolve(__dirname, '../../firestore.rules');

/**
 * Boots a Firestore emulator test environment loaded with the REAL production
 * security rules (firestore.rules) — never firestore.test.rules, which is wide
 * open (`allow read, write: if true`) and used only by the e2e suite. A bug in
 * firestore.rules is invisible to e2e tests; this is what actually catches it.
 *
 * Requires a Firestore emulator already running on 127.0.0.1:8080 — start one
 * with `npm run test:rules` (see package.json), which wraps this in
 * `firebase emulators:exec`.
 */
export async function startRulesTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

/** Seeds a household + its members, bypassing security rules entirely. */
export async function seedHousehold(
  testEnv: RulesTestEnvironment,
  opts: { householdId: string; createdBy: string; members: string[] },
) {
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.firestore().doc(`households/${opts.householdId}`).set({
      name: 'Test Family',
      createdBy: opts.createdBy,
      members: opts.members,
      inviteCode: 'TEST01',
    });
  });
}

/** Seeds a user profile doc, bypassing security rules entirely. */
export async function seedUser(
  testEnv: RulesTestEnvironment,
  opts: { uid: string; role: 'parent' | 'child'; householdId: string },
) {
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.firestore().doc(`users/${opts.uid}`).set({
      role: opts.role,
      householdId: opts.householdId,
      email: `${opts.uid}@test.com`,
      displayName: opts.uid,
      totalPoints: 0,
    });
  });
}

/** Seeds an empty admin allowlist so isAdmin() resolves to false cleanly, instead
 *  of erroring on a missing settings/adminAccess doc. */
export async function seedEmptyAdminAccess(testEnv: RulesTestEnvironment) {
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.firestore().doc('settings/adminAccess').set({ emails: [] });
  });
}

/** Seeds a notification doc, bypassing security rules entirely, and returns its id.
 *  withSecurityRulesDisabled's callback return type is `Promise<void>` — it discards
 *  whatever the callback returns — so the id is captured via an outer variable instead. */
export async function seedNotification(
  testEnv: RulesTestEnvironment,
  opts: { householdId: string; recipientId: string; recipientRole: 'parent' | 'child'; type: string },
): Promise<string> {
  let id = '';
  await testEnv.withSecurityRulesDisabled(async context => {
    const ref = context.firestore().collection(`households/${opts.householdId}/notifications`).doc();
    id = ref.id;
    await ref.set({
      householdId: opts.householdId,
      recipientId: opts.recipientId,
      recipientRole: opts.recipientRole,
      type: opts.type,
      title: 'x',
      message: 'x',
      read: false,
    });
  });
  return id;
}
