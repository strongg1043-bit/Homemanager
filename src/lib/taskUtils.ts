// Task utility functions — domain logic extracted from CreateTaskForm.tsx (ARCH-3).
import { db } from '../firebase';
import { doc, writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';

/**
 * Returns date parts in the given IANA timezone.
 * Uses Intl.DateTimeFormat so results are always local-time correct
 * regardless of where the server/browser is running.
 */
function localParts(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'long', hour12: false,
  });
  const p = fmt.formatToParts(date);
  const get = (type: string) => p.find(pp => pp.type === type)?.value ?? '';
  const year = parseInt(get('year'));
  const month = parseInt(get('month'));
  const day = parseInt(get('day'));
  return {
    year, month, day,
    weekday: get('weekday').toLowerCase(), // 'monday', etc.
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/**
 * Resets recurring tasks that are due for a new cycle, and expires tasks
 * that have passed their end date. All date comparisons use the household timezone.
 *
 * Rules per cycle:
 *  - status was submitted / approved  → clean reset (completed on time ✓)
 *  - status was pending / accepted / needs_retry → missed cycle → missedCount++, then reset
 *
 * End-date rules:
 *  - if local date > recurrence.endDate AND task is not already terminal → expire:
 *      incomplete last cycle  → status = 'forfeited', recurrence.expired = true
 *      completed  last cycle  → just mark recurrence.expired = true (keep for history)
 */
export async function resetRecurringTasks(
  householdId: string,
  tasks: any[],
  timezone: string = 'UTC',
) {
  const batch = writeBatch(db);
  const now = new Date();
  const nowLocal = localParts(now, timezone);
  let count = 0;

  tasks.forEach(task => {
    if (!task.recurrence) return;
    if (task.recurrence.expired) return; // already terminated

    const taskRef = doc(db, 'households', householdId, 'tasks', task.id);
    const lastReset: Date = task.recurrence.lastReset?.toDate?.() ?? new Date(0);
    const lastLocal = localParts(lastReset, timezone);

    // ── 1. End-date expiration ──────────────────────────────────────────────
    if (task.recurrence.endDate) {
      const endDate: Date = task.recurrence.endDate instanceof Timestamp
        ? task.recurrence.endDate.toDate()
        : new Date(task.recurrence.endDate);
      const endLocal = localParts(endDate, timezone);

      if (nowLocal.dateStr > endLocal.dateStr) {
        const cycleCompleted = task.status === 'approved' || task.status === 'submitted';
        const updates: Record<string, any> = { 'recurrence.expired': true };
        if (!cycleCompleted) {
          updates.status = 'forfeited';
          updates.lastMissedAt = serverTimestamp();
          updates.missedCount = increment(1);
        }
        batch.update(taskRef, updates);
        count++;
        return;
      }
    }

    // ── 2. Normal cycle reset ───────────────────────────────────────────────
    let shouldReset = false;

    if (task.taskType === 'daily') {
      // Reset if local date has changed since last reset
      if (nowLocal.dateStr !== lastLocal.dateStr) shouldReset = true;

    } else if (task.taskType === 'weekly' && task.recurrence.weekday) {
      const targetDay = task.recurrence.weekday.toLowerCase();
      if (nowLocal.weekday === targetDay) {
        const diffMs = now.getTime() - lastReset.getTime();
        const diffDays = diffMs / (1000 * 3600 * 24);
        if (diffDays > 6) shouldReset = true;
      }

    } else if (task.taskType === 'monthly' && task.recurrence.dayOfMonth) {
      if (nowLocal.day === task.recurrence.dayOfMonth) {
        if (nowLocal.month !== lastLocal.month || nowLocal.year !== lastLocal.year) {
          shouldReset = true;
        }
      }
    }

    if (!shouldReset) return;

    const cycleCompleted = task.status === 'submitted' || task.status === 'approved';
    const updates: Record<string, any> = {
      status: 'pending',
      'recurrence.lastReset': serverTimestamp(),
      proofPhotoUrl: null,
      completedAt: null,
      approvedAt: null,
      childAcceptedAt: null,
      retryNote: null,
    };
    if (!cycleCompleted) {
      updates.lastMissedAt = serverTimestamp();
      updates.missedCount = increment(1);
    }

    batch.update(taskRef, updates);
    count++;
  });

  if (count > 0) await batch.commit();
}
