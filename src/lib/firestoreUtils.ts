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
