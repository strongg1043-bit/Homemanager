import { onSnapshot, Query, QuerySnapshot, DocumentData, FirestoreError } from 'firebase/firestore';
import { auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log full diagnostic context to console ONLY — never expose PII in thrown errors.
  const diagInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      // Partial UID only (first 8 chars) to aid debugging without fully exposing identity
      userId: auth.currentUser?.uid ? auth.currentUser.uid.substring(0, 8) + '…' : null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      // Provider IDs only — no emails
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: null,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Context:', JSON.stringify(diagInfo));

  // Throw a sanitised error — no PII in the message string.
  throw new Error(`Firestore ${operationType} failed on "${path ?? 'unknown'}": ${errorMessage}`);
}

/**
 * Subscribes to a query, silently retrying a few times (with backoff) if the very
 * first error is `permission-denied`. This happens transiently right after a user
 * joins a household: the security rule reads this user's own householdId back off
 * their user doc, and that write can take a moment to become visible to the rule's
 * own read — a plain page reload always "fixes" it, which is the tell that it's a
 * propagation race rather than a real permissions problem. Returns an unsubscribe
 * function that also cancels any pending retry.
 */
export function onSnapshotWithRetry(
  query: Query<DocumentData>,
  onNext: (snap: QuerySnapshot<DocumentData>) => void,
  onError: (err: FirestoreError) => void,
  maxRetries = 3,
): () => void {
  let unsub: () => void = () => {};
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let cancelled = false;

  function subscribe() {
    unsub = onSnapshot(
      query,
      (snap) => {
        retries = 0;
        onNext(snap);
      },
      (err) => {
        if (err.code === 'permission-denied' && retries < maxRetries && !cancelled) {
          retries++;
          retryTimer = setTimeout(subscribe, 800 * retries);
          return;
        }
        onError(err);
      },
    );
  }
  subscribe();

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    unsub();
  };
}
