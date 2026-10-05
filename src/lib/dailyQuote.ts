/**
 * dailyQuote.ts
 *
 * Reads today's pre-generated quote from the Firestore cache.
 * The quote is generated server-side by a Firebase Scheduled Function
 * (functions/src/index.ts) at 06:00 UTC daily — the API key never
 * touches the browser bundle.
 */

import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

function todayISO(): string {
  return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
}

/** Returns today's quote from the Firestore cache, or null if not yet generated. */
export async function getDailyQuote(): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'dailyQuote'));
    if (snap.exists() && snap.data().date === todayISO()) {
      return (snap.data().quote as string) || null;
    }
    return null;
  } catch {
    return null;
  }
}
