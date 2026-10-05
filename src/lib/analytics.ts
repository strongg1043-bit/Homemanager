import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type DonationEventType =
  | 'impression'       // modal was shown
  | 'details_expanded' // parent clicked "Bank details"
  | 'field_copied'     // copied a single field
  | 'all_copied'       // copied all details
  | 'dismissed';       // clicked "Maybe later" or X

/** ISO week string — e.g. "2025-W20" */
function isoWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const wn = 1 + Math.round(
    ((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7
  );
  return `${d.getFullYear()}-W${wn.toString().padStart(2, '0')}`;
}

/**
 * Fire-and-forget — never throws, never blocks the UI.
 */
export async function recordDonationEvent(
  type: DonationEventType,
  variant: 'parent' | 'child',
): Promise<void> {
  try {
    const now = new Date();
    await addDoc(collection(db, 'donationEvents'), {
      type,
      variant,
      date: now.toISOString().split('T')[0], // YYYY-MM-DD
      week: isoWeek(now),
      createdAt: serverTimestamp(),
    });
  } catch {
    // analytics must never interrupt the user
  }
}
