// Task utility functions — domain logic extracted from CreateTaskForm.tsx (ARCH-3).
import { db } from '../firebase';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';

/**
 * Resets any recurring tasks that are due to restart today.
 * Called each time the parent dashboard loads / tasks are refreshed.
 */
export async function resetRecurringTasks(householdId: string, tasks: any[]) {
  const batch = writeBatch(db);
  const now = new Date();
  let count = 0;

  tasks.forEach(task => {
    if (!task.recurrence) return;

    let shouldReset = false;
    const lastReset = task.recurrence.lastReset?.toDate() || new Date(0);

    if (task.taskType === 'daily') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (lastReset < today) shouldReset = true;
    } else if (task.taskType === 'weekly' && task.recurrence.weekday) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDayIndex = days.indexOf(task.recurrence.weekday.toLowerCase());
      if (now.getDay() === targetDayIndex) {
        const diffDays = (now.getTime() - lastReset.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 6) shouldReset = true;
      }
    } else if (task.taskType === 'monthly' && task.recurrence.dayOfMonth) {
      if (now.getDate() === task.recurrence.dayOfMonth) {
        if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
          shouldReset = true;
        }
      }
    }

    if (shouldReset) {
      batch.update(doc(db, 'households', householdId, 'tasks', task.id), {
        status: 'pending',
        'recurrence.lastReset': serverTimestamp(),
        proofPhotoUrl: null,
        completedAt: null,
        approvedAt: null
      });
      count++;
    }
  });

  if (count > 0) await batch.commit();
}
