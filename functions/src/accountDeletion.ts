import { FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

// ── Account deletion ─────────────────────────────────────────────────────────
//
// Google Play requires apps with accounts to let users delete the account and its
// data from inside the app. This module holds the logic; index.ts wraps it in a
// callable. It deliberately imports nothing from firebase-functions so it can be
// exercised directly against the emulators (tests/rules/accountDeletion.test.ts).
//
// Three outcomes, chosen from who is deleting and who is left in the household:
//   • child, or a parent while another parent remains → remove only that person.
//   • the last parent → the whole household goes (every child's data, invite code,
//     all subcollections) and any live Lemon Squeezy subscription is cancelled first.
//     If children would be affected the caller must confirm explicitly.

export class AccountDeletionError extends Error {
  constructor(
    public readonly code: 'confirmation-required' | 'subscription-cancel-failed',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface DeleteAccountDeps {
  db: Firestore;
  auth: Auth;
  /** Cancels a Lemon Squeezy subscription. Must throw if it could not be cancelled. */
  cancelSubscription: (subscriptionId: number) => Promise<void>;
}

export interface DeleteAccountResult {
  scope: 'account' | 'household';
}

const BATCH_SIZE = 400;

async function deleteQuery(db: Firestore, query: Query): Promise<void> {
  // Re-query until empty so result sets larger than one batch are fully removed.
  for (;;) {
    const snap = await query.limit(BATCH_SIZE).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function deleteAuthUser(auth: Auth, uid: string): Promise<void> {
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') return;
    throw err;
  }
}

async function deleteUserOwnedDocs(db: Firestore, uid: string): Promise<void> {
  await deleteQuery(db, db.collection('suggestions').where('userId', '==', uid));
  await db.collection('users').doc(uid).delete();
}

export async function deleteAccount(
  { db, auth, cancelSubscription }: DeleteAccountDeps,
  uid: string,
  opts: { confirmHouseholdDeletion?: boolean } = {},
): Promise<DeleteAccountResult> {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data();
  const householdId = (user?.householdId as string | undefined) || '';

  // No profile or no household (e.g. a half-finished sign-up, or a retry after a
  // previous attempt already removed the data): just clear what is left.
  const householdRef = householdId ? db.collection('households').doc(householdId) : null;
  const householdSnap = householdRef ? await householdRef.get() : null;
  if (!user || !householdRef || !householdSnap?.exists) {
    if (user) await deleteUserOwnedDocs(db, uid);
    await deleteAuthUser(auth, uid);
    return { scope: 'account' };
  }

  const household = householdSnap.data()!;
  const members = ((household.members as string[] | undefined) ?? []).filter((m) => m !== uid);
  const memberSnaps = await Promise.all(members.map((m) => db.collection('users').doc(m).get()));
  const otherParents = memberSnaps.filter((s) => s.exists && s.data()?.role === 'parent').length;

  if (user.role === 'parent' && otherParents === 0) {
    // ── Last parent: delete the whole household ────────────────────────────
    if (members.length > 0 && !opts.confirmHouseholdDeletion) {
      throw new AccountDeletionError(
        'confirmation-required',
        'Deleting the last parent account deletes the whole household, including the children.',
        { memberCount: members.length },
      );
    }

    // Cancel billing first: if this fails nothing has been deleted yet, so the user
    // can retry rather than being left with data gone and a subscription still charging.
    const subscriptionId = household.lemonSqueezy?.subscriptionId as number | null | undefined;
    const status = household.subscriptionStatus as string | undefined;
    if (subscriptionId && (status === 'active' || status === 'past_due')) {
      try {
        await cancelSubscription(subscriptionId);
      } catch (err) {
        console.error('[AccountDeletion] Subscription cancel failed:', err);
        throw new AccountDeletionError(
          'subscription-cancel-failed',
          'Could not cancel your subscription, so nothing was deleted. Please try again.',
        );
      }
    }

    const allUids = [uid, ...members];
    await deleteQuery(db, db.collection('inviteCodes').where('householdId', '==', householdId));
    await Promise.all(allUids.map((id) => deleteUserOwnedDocs(db, id)));
    await db.recursiveDelete(householdRef);
    await Promise.all(allUids.map((id) => deleteAuthUser(auth, id)));
    return { scope: 'household' };
  }

  // ── Child, or a parent with another parent still in the household ────────
  const tasks = householdRef.collection('tasks');
  const notifications = householdRef.collection('notifications');
  const disputes = householdRef.collection('disputes');
  const redemptions = householdRef.collection('redemptions');

  await deleteQuery(db, notifications.where('recipientId', '==', uid));
  await deleteQuery(db, disputes.where('raisedBy', '==', uid));
  if (user.role === 'child') {
    // A child's own missions and redemption history go with them. A parent's
    // household-level records (tasks they created for children, payments they
    // recorded) stay, because the other members rely on them.
    await deleteQuery(db, tasks.where('assignedTo', '==', uid));
    await deleteQuery(db, redemptions.where('childId', '==', uid));
  }

  await householdRef.update({ members: FieldValue.arrayRemove(uid) });
  await deleteUserOwnedDocs(db, uid);
  await deleteAuthUser(auth, uid);
  return { scope: 'account' };
}
