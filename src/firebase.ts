import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, setPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// All Firebase config values must be set in .env.local (see .env.example).
// NEVER hardcode real credentials here.
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  // Use in-memory persistence during E2E tests so each browser context
  // starts with a clean auth state (no cross-context localStorage leakage).
  setPersistence(auth, inMemoryPersistence);
  // Expose a cleanup hook so Playwright tests can terminate the Firestore
  // connection before navigating away, avoiding the emulator listener-cleanup
  // race that causes INTERNAL ASSERTION FAILED (ca9) errors.
  (window as Window & { __e2e_terminateFirestore?: () => Promise<void> }).__e2e_terminateFirestore = () => terminate(db);
}
