// Runs the real deletion logic against the Firestore emulator. Auth is faked
// (only deleteUser is used), so only the Firestore emulator is required.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { deleteAccount, AccountDeletionError } from '../src/accountDeletion';

let db: Firestore;
let seq = 0;

before(() => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run via firebase emulators:exec (FIRESTORE_EMULATOR_HOST not set)');
  db = getFirestore(initializeApp({ projectId: 'homemanager-c409a' }, 'account-deletion-test'));
});

function fakeAuth() {
  const deleted: string[] = [];
  const auth = { deleteUser: async (uid: string) => { deleted.push(uid); } } as unknown as Auth;
  return { auth, deleted };
}

// Unique ids per test so tests never see each other's data.
function ids() {
  const n = `${Date.now()}-${++seq}`;
  return { hid: `h-${n}`, p1: `p1-${n}`, p2: `p2-${n}`, c1: `c1-${n}`, c2: `c2-${n}`, code: `CODE-${n}` };
}

async function exists(path: string) {
  return (await db.doc(path).get()).exists;
}

async function seedHousehold(
  i: ReturnType<typeof ids>,
  opts: { twoParents?: boolean; subscriptionStatus?: string; subscriptionId?: number } = {},
) {
  const members = [i.p1, ...(opts.twoParents ? [i.p2] : []), i.c1, i.c2];
  await db.doc(`households/${i.hid}`).set({
    name: 'Test family',
    members,
    subscriptionStatus: opts.subscriptionStatus ?? 'trialing',
    lemonSqueezy: opts.subscriptionId ? { subscriptionId: opts.subscriptionId } : null,
  });
  await db.doc(`inviteCodes/${i.code}`).set({ householdId: i.hid });
  const users: [string, string][] = [[i.p1, 'parent'], [i.c1, 'child'], [i.c2, 'child'], ...(opts.twoParents ? [[i.p2, 'parent'] as [string, string]] : [])];
  for (const [uid, role] of users) {
    await db.doc(`users/${uid}`).set({ uid, role, householdId: i.hid, displayName: uid });
    await db.collection('suggestions').add({ userId: uid, title: 'idea' });
  }
  const h = (sub: string) => db.collection(`households/${i.hid}/${sub}`);
  await h('tasks').doc('t-c1').set({ assignedTo: i.c1, createdBy: i.p1 });
  await h('tasks').doc('t-c2').set({ assignedTo: i.c2, createdBy: i.p1 });
  await h('redemptions').doc('r-c1').set({ childId: i.c1, paidBy: i.p1 });
  await h('redemptions').doc('r-c2').set({ childId: i.c2, paidBy: i.p1 });
  await h('notifications').doc('n-c1').set({ recipientId: i.c1 });
  await h('notifications').doc('n-c2').set({ recipientId: i.c2 });
  await h('notifications').doc('n-p1').set({ recipientId: i.p1 });
  await h('notifications').doc('n-p2').set({ recipientId: i.p2 });
  await h('disputes').doc('d-c1').set({ raisedBy: i.c1 });
  await h('disputes').doc('d-p1').set({ raisedBy: i.p1 });
  await h('taskTemplates').doc('tt1').set({ title: 'template' });
}

const noCancel = async () => { throw new Error('cancelSubscription should not have been called'); };

test('a child deleting their account removes only their own data', async () => {
  const i = ids();
  await seedHousehold(i);
  const { auth, deleted } = fakeAuth();

  const result = await deleteAccount({ db, auth, cancelSubscription: noCancel }, i.c1);

  assert.deepEqual(result, { scope: 'account' });
  assert.deepEqual(deleted, [i.c1]);
  assert.equal(await exists(`users/${i.c1}`), false);
  assert.equal(await exists(`households/${i.hid}/tasks/t-c1`), false);
  assert.equal(await exists(`households/${i.hid}/redemptions/r-c1`), false);
  assert.equal(await exists(`households/${i.hid}/notifications/n-c1`), false);
  assert.equal(await exists(`households/${i.hid}/disputes/d-c1`), false);
  assert.equal((await db.collection('suggestions').where('userId', '==', i.c1).get()).size, 0);
  // Everyone else's data is untouched.
  assert.equal(await exists(`users/${i.c2}`), true);
  assert.equal(await exists(`households/${i.hid}/tasks/t-c2`), true);
  assert.equal(await exists(`households/${i.hid}/redemptions/r-c2`), true);
  assert.equal(await exists(`households/${i.hid}/disputes/d-p1`), true);
  assert.equal((await db.collection('suggestions').where('userId', '==', i.c2).get()).size, 1);
  const members = (await db.doc(`households/${i.hid}`).get()).data()!.members as string[];
  assert.deepEqual(members.sort(), [i.p1, i.c2].sort());
});

test('a parent with another parent still present leaves without deleting the household', async () => {
  const i = ids();
  await seedHousehold(i, { twoParents: true });
  const { auth, deleted } = fakeAuth();

  const result = await deleteAccount({ db, auth, cancelSubscription: noCancel }, i.p1);

  assert.deepEqual(result, { scope: 'account' });
  assert.deepEqual(deleted, [i.p1]);
  assert.equal(await exists(`users/${i.p1}`), false);
  assert.equal(await exists(`households/${i.hid}/notifications/n-p1`), false);
  assert.equal(await exists(`households/${i.hid}/disputes/d-p1`), false);
  // Children's records and the tasks this parent created stay.
  assert.equal(await exists(`households/${i.hid}/tasks/t-c1`), true);
  assert.equal(await exists(`households/${i.hid}/redemptions/r-c1`), true);
  assert.equal(await exists(`users/${i.c1}`), true);
  assert.equal(await exists(`users/${i.p2}`), true);
  assert.equal(await exists(`inviteCodes/${i.code}`), true);
  const members = (await db.doc(`households/${i.hid}`).get()).data()!.members as string[];
  assert.ok(!members.includes(i.p1));
});

test('the last parent must confirm before the household and children are deleted', async () => {
  const i = ids();
  await seedHousehold(i);
  const { auth, deleted } = fakeAuth();

  await assert.rejects(
    deleteAccount({ db, auth, cancelSubscription: noCancel }, i.p1),
    (err: unknown) => err instanceof AccountDeletionError && err.code === 'confirmation-required',
  );

  assert.deepEqual(deleted, []);
  assert.equal(await exists(`households/${i.hid}`), true);
  assert.equal(await exists(`users/${i.p1}`), true);
  assert.equal(await exists(`users/${i.c1}`), true);
});

test('the last parent, once confirmed, deletes the household, children, invite code and subcollections', async () => {
  const i = ids();
  await seedHousehold(i);
  const { auth, deleted } = fakeAuth();

  const result = await deleteAccount({ db, auth, cancelSubscription: noCancel }, i.p1, { confirmHouseholdDeletion: true });

  assert.deepEqual(result, { scope: 'household' });
  assert.deepEqual(deleted.sort(), [i.p1, i.c1, i.c2].sort());
  assert.equal(await exists(`households/${i.hid}`), false);
  for (const sub of ['tasks', 'redemptions', 'notifications', 'disputes', 'taskTemplates']) {
    assert.equal((await db.collection(`households/${i.hid}/${sub}`).get()).size, 0, `${sub} should be empty`);
  }
  for (const uid of [i.p1, i.c1, i.c2]) {
    assert.equal(await exists(`users/${uid}`), false);
    assert.equal((await db.collection('suggestions').where('userId', '==', uid).get()).size, 0);
  }
  assert.equal(await exists(`inviteCodes/${i.code}`), false);
});

test('an active subscription is cancelled on household deletion; a trial is not', async () => {
  const active = ids();
  await seedHousehold(active, { subscriptionStatus: 'active', subscriptionId: 4242 });
  const cancelled: number[] = [];
  await deleteAccount(
    { db, auth: fakeAuth().auth, cancelSubscription: async (id) => { cancelled.push(id); } },
    active.p1,
    { confirmHouseholdDeletion: true },
  );
  assert.deepEqual(cancelled, [4242]);

  const trial = ids();
  await seedHousehold(trial, { subscriptionStatus: 'trialing', subscriptionId: 9999 });
  await deleteAccount({ db, auth: fakeAuth().auth, cancelSubscription: noCancel }, trial.p1, { confirmHouseholdDeletion: true });
  assert.equal(await exists(`households/${trial.hid}`), false);
});

test('if the subscription cannot be cancelled nothing is deleted', async () => {
  const i = ids();
  await seedHousehold(i, { subscriptionStatus: 'active', subscriptionId: 4242 });
  const { auth, deleted } = fakeAuth();

  await assert.rejects(
    deleteAccount(
      { db, auth, cancelSubscription: async () => { throw new Error('Lemon Squeezy 500'); } },
      i.p1,
      { confirmHouseholdDeletion: true },
    ),
    (err: unknown) => err instanceof AccountDeletionError && err.code === 'subscription-cancel-failed',
  );

  assert.deepEqual(deleted, []);
  assert.equal(await exists(`households/${i.hid}`), true);
  assert.equal(await exists(`users/${i.p1}`), true);
  assert.equal(await exists(`users/${i.c1}`), true);
});

test('retrying after a partial failure finishes the job (profile already gone)', async () => {
  const i = ids();
  const { auth, deleted } = fakeAuth();
  // No users/{uid} doc: an earlier attempt deleted the data but not the Auth account.
  const result = await deleteAccount({ db, auth, cancelSubscription: noCancel }, i.p1);
  assert.deepEqual(result, { scope: 'account' });
  assert.deepEqual(deleted, [i.p1]);
});

test('more than one batch of records is fully removed', async () => {
  const i = ids();
  await seedHousehold(i);
  for (let start = 0; start < 850; start += 400) {
    const batch = db.batch();
    for (let n = start; n < Math.min(start + 400, 850); n++) {
      batch.set(db.collection(`households/${i.hid}/notifications`).doc(`bulk-${n}`), { recipientId: i.c1 });
    }
    await batch.commit();
  }
  await deleteAccount({ db, auth: fakeAuth().auth, cancelSubscription: noCancel }, i.c1);
  const left = await db.collection(`households/${i.hid}/notifications`).where('recipientId', '==', i.c1).get();
  assert.equal(left.size, 0);
  assert.equal(await exists(`households/${i.hid}/notifications/n-c2`), true);
});
