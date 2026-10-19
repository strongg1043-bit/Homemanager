import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

let reportCount = 0;
const MAX_REPORTS_PER_SESSION = 20; // guards against an error loop flooding Firestore

/**
 * Logs a client-side error to Firestore so it's visible without relying on a
 * user to report it. Never throws — a failure here must not compound the
 * error it's trying to report.
 */
export function reportError(error: unknown, context: string): void {
  try {
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;
    reportCount++;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    void addDoc(collection(db, 'errorLogs'), {
      message: message.slice(0, 1000),
      stack: stack ? stack.slice(0, 4000) : null,
      context: context.slice(0, 200),
      url: window.location.href.slice(0, 500),
      userAgent: navigator.userAgent.slice(0, 300),
      userId: auth.currentUser?.uid || null,
      createdAt: serverTimestamp(),
    }).catch(() => { /* swallow — reporting must never itself throw */ });
  } catch {
    // swallow
  }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, 'window.onerror');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'unhandledrejection');
  });
}
