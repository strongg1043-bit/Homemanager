// Rules-unit tests for the households/{hid}/notifications subcollection.
//
// This suite exists because of a real incident: on 2026-10-15, a security-rules
// tightening (commit e613299) started requiring every notification to carry a
// `recipientId` and a `type` from an allow-list — but InviteMemberCard.tsx and
// InviteParentCard.tsx wrote notifications with neither, silently breaking every
// invite (parent-invites-child and child-invites-parent) in production. The e2e
// suite never caught it because it runs against firestore.test.rules, a wide-open
// stand-in that doesn't enforce the real rules at all (see tests/e2e vs. here).
//
// Run with: npm run test:rules

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { seedEmptyAdminAccess, seedHousehold, seedNotification, seedUser, startRulesTestEnv } from './helpers.ts';

const HOUSEHOLD_ID = 'household-1';
const PARENT_1 = 'parent-1';
const PARENT_2 = 'parent-2';
const CHILD_1 = 'child-1';
const OUTSIDER = 'outsider-1'; // signed in, but not a member of HOUSEHOLD_ID

let testEnv: RulesTestEnvironment;

before(async () => {
  testEnv = await startRulesTestEnv();
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedEmptyAdminAccess(testEnv);
  await seedHousehold(testEnv, { householdId: HOUSEHOLD_ID, createdBy: PARENT_1, members: [PARENT_1, PARENT_2, CHILD_1] });
  await seedUser(testEnv, { uid: PARENT_1, role: 'parent', householdId: HOUSEHOLD_ID });
  await seedUser(testEnv, { uid: PARENT_2, role: 'parent', householdId: HOUSEHOLD_ID });
  await seedUser(testEnv, { uid: CHILD_1, role: 'child', householdId: HOUSEHOLD_ID });
  await seedUser(testEnv, { uid: OUTSIDER, role: 'parent', householdId: 'some-other-household' });
});

function notificationsCol(uid: string) {
  return testEnv.authenticatedContext(uid).firestore()
    .collection(`households/${HOUSEHOLD_ID}/notifications`);
}

describe('create — regression coverage for the 2026-10-15 invite outage', () => {
  test('REGRESSION GUARD: the exact buggy payload (no recipientId) must stay rejected', async () => {
    // This is verbatim what InviteMemberCard.tsx wrote before the fix — if this
    // ever starts succeeding again, the invite flow is silently broken in prod.
    await assertFails(notificationsCol(PARENT_1).add({
      householdId: HOUSEHOLD_ID,
      recipientRole: 'parent',
      type: 'invite_sent',
      title: 'Invite sent to Alex',
      message: 'A child invite was sent to alex@test.com.',
      emoji: '📩',
      read: false,
      invitedEmail: 'alex@test.com',
      invitedName: 'Alex',
    }));
  });

  test('the fixed payload (recipientId present, invite_sent allow-listed) succeeds', async () => {
    await assertSucceeds(notificationsCol(PARENT_1).add({
      householdId: HOUSEHOLD_ID,
      recipientId: PARENT_1,
      recipientRole: 'parent',
      type: 'invite_sent',
      title: 'Invite sent to Alex',
      message: 'A child invite was sent to alex@test.com.',
      emoji: '📩',
      read: false,
      invitedEmail: 'alex@test.com',
      invitedName: 'Alex',
    }));
  });

  test('the fixed invite_parent payload (InviteParentCard.tsx) succeeds', async () => {
    await assertSucceeds(notificationsCol(CHILD_1).add({
      householdId: HOUSEHOLD_ID,
      recipientId: PARENT_1,
      recipientRole: 'parent',
      type: 'invite_parent',
      title: '💸 No more swindling me!',
      message: 'Alex is calling you out!',
      emoji: '🚀',
      read: false,
      invitedEmail: 'mom@test.com',
      fromChildId: CHILD_1,
      fromChildName: 'Alex',
    }));
  });
});

describe('create — general validation', () => {
  test('rejects a type not in the allow-list', async () => {
    await assertFails(notificationsCol(PARENT_1).add({
      householdId: HOUSEHOLD_ID,
      recipientId: PARENT_1,
      recipientRole: 'parent',
      type: 'made_up_type',
      title: 'x',
      message: 'x',
      read: false,
    }));
  });

  test('rejects recipientId that is not a member of the household', async () => {
    await assertFails(notificationsCol(PARENT_1).add({
      householdId: HOUSEHOLD_ID,
      recipientId: OUTSIDER,
      recipientRole: 'parent',
      type: 'welcome',
      title: 'x',
      message: 'x',
      read: false,
    }));
  });

  test('rejects householdId that does not match the subcollection path', async () => {
    await assertFails(notificationsCol(PARENT_1).add({
      householdId: 'some-other-household',
      recipientId: PARENT_1,
      recipientRole: 'parent',
      type: 'welcome',
      title: 'x',
      message: 'x',
      read: false,
    }));
  });

  test('rejects read: true on creation (must start unread)', async () => {
    await assertFails(notificationsCol(PARENT_1).add({
      householdId: HOUSEHOLD_ID,
      recipientId: PARENT_1,
      recipientRole: 'parent',
      type: 'welcome',
      title: 'x',
      message: 'x',
      read: true,
    }));
  });

  test('a non-member cannot create a notification in this household at all', async () => {
    await assertFails(notificationsCol(OUTSIDER).add({
      householdId: HOUSEHOLD_ID,
      recipientId: PARENT_1,
      recipientRole: 'parent',
      type: 'welcome',
      title: 'x',
      message: 'x',
      read: false,
    }));
  });
});

function seedBasicNotification() {
  return seedNotification(testEnv, { householdId: HOUSEHOLD_ID, recipientId: PARENT_1, recipientRole: 'parent', type: 'welcome' });
}

describe('read', () => {
  test('the recipient can read their own notification', async () => {
    const id = await seedBasicNotification();
    await assertSucceeds(notificationsCol(PARENT_1).doc(id).get());
  });

  test('a different household member cannot read someone else\'s notification', async () => {
    const id = await seedBasicNotification();
    await assertFails(notificationsCol(PARENT_2).doc(id).get());
  });
});

describe('update', () => {
  test('the recipient can mark their own notification as read', async () => {
    const id = await seedBasicNotification();
    await assertSucceeds(notificationsCol(PARENT_1).doc(id).update({ read: true }));
  });

  test('the recipient cannot change fields other than `read`', async () => {
    const id = await seedBasicNotification();
    await assertFails(notificationsCol(PARENT_1).doc(id).update({ read: true, title: 'hacked' }));
  });

  test('a non-recipient member cannot update someone else\'s notification', async () => {
    const id = await seedBasicNotification();
    await assertFails(notificationsCol(PARENT_2).doc(id).update({ read: true }));
  });
});

describe('delete', () => {
  test('a regular parent cannot delete a notification (admin-only)', async () => {
    const id = await seedBasicNotification();
    await assertFails(notificationsCol(PARENT_1).doc(id).delete());
  });
});

test('sanity: the project really did seed three members', async () => {
  let members: unknown;
  await testEnv.withSecurityRulesDisabled(async context => {
    const snap = await context.firestore().doc(`households/${HOUSEHOLD_ID}`).get();
    members = snap.data()?.members;
  });
  assert.deepEqual(members, [PARENT_1, PARENT_2, CHILD_1]);
});
