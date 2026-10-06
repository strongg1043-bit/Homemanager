import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();

const PROMPT =
  'Write one short inspirational quote (2–3 sentences) for a parent using a family chore-and-rewards app. ' +
  'The theme should weave together: raising children with accountability, the value of earning rewards through effort, ' +
  'and building deep trust between parents and children at home. ' +
  'Make it warm, wise, and timeless — as if it has always been true. ' +
  'Return only the quote text. No author attribution, no quotation marks, no extra commentary.';

export const generateDailyQuote = onSchedule(
  {
    schedule: '0 6 * * *',   // 06:00 UTC every day
    timeZone: 'UTC',
    secrets: ['ANTHROPIC_API_KEY'],
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore();
    const docRef = db.collection('settings').doc('dailyQuote');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Skip if today's quote already exists (idempotent)
    const snap = await docRef.get();
    if (snap.exists && snap.data()?.date === today) {
      console.log('[DailyQuote] Already generated for', today);
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[DailyQuote] ANTHROPIC_API_KEY secret not set');
      return;
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 180,
        messages: [{ role: 'user', content: PROMPT }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error(`[DailyQuote] Anthropic API ${res.status}:`, err);
      return;
    }

    const data = await res.json() as { content?: Array<{ text?: string }> };
    const quote = data?.content?.[0]?.text?.trim() ?? '';
    if (!quote) {
      console.error('[DailyQuote] Empty response from Anthropic');
      return;
    }

    await docRef.set({ quote, date: today, generatedAt: FieldValue.serverTimestamp() });
    console.log('[DailyQuote] Generated and cached for', today, ':', quote.slice(0, 60), '…');
  },
);

// ── Task deadline / engagement nudges ───────────────────────────────────────

const ACTIVE_STATUSES = ['pending', 'accepted', 'needs_retry'];
const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;      // nudge once a task is within 24h of its deadline
const STALE_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000;  // nudge once a task has sat untouched for 2 days
const RENUDGE_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000; // don't repeat the same nudge within 2 days

interface PushData {
  [key: string]: string;
}

// Sends a push to every device registered for a user, pruning tokens the
// browser/OS has invalidated so the array doesn't grow stale forever.
async function sendPushToUser(
  db: FirebaseFirestore.Firestore,
  uid: string,
  title: string,
  body: string,
  data: PushData,
): Promise<void> {
  const userSnap = await db.collection('users').doc(uid).get();
  const tokens: string[] = userSnap.data()?.fcmTokens || [];
  if (tokens.length === 0) return;

  try {
    const resp = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: { fcmOptions: { link: '/' } },
      data,
    });
    const invalidTokens = resp.responses
      .map((r, i) => (!r.success && (
        r.error?.code === 'messaging/registration-token-not-registered' ||
        r.error?.code === 'messaging/invalid-argument'
      ) ? tokens[i] : null))
      .filter((t): t is string => t !== null);
    if (invalidTokens.length > 0) {
      await db.collection('users').doc(uid).update({ fcmTokens: FieldValue.arrayRemove(...invalidTokens) });
    }
  } catch (err) {
    console.error('[push] send failed for', uid, err);
  }
}

// Mirrors the push as an in-app notification so it shows in the bell even
// if the device never granted push permission, or the push silently failed.
async function createInAppNotification(
  db: FirebaseFirestore.Firestore,
  householdId: string,
  recipientId: string,
  recipientRole: 'parent' | 'child',
  type: string,
  title: string,
  message: string,
  emoji: string,
  relatedTaskId: string | null,
): Promise<void> {
  await db.collection('households').doc(householdId).collection('notifications').add({
    householdId, recipientId, recipientRole, type, title, message, emoji,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    relatedTaskId: relatedTaskId || null,
    relatedRedemptionId: null,
  });
}

// Runs every 6 hours: finds tasks approaching their deadline (adhoc tasks
// only — recurring tasks don't carry a per-cycle dueDate) and tasks that
// have sat open with no engagement for 2+ days, and nudges the assigned child.
export const checkTaskNudges = onSchedule(
  { schedule: '0 */6 * * *', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    const db = getFirestore();
    const now = Date.now();

    const snap = await db.collectionGroup('tasks').where('status', 'in', ACTIVE_STATUSES).get();
    console.log(`[Nudges] Scanning ${snap.size} active tasks`);

    for (const taskDoc of snap.docs) {
      const task = taskDoc.data();
      if (!task.assignedTo) continue;

      // Deadline approaching (adhoc tasks only — recurrence-based tasks have dueDate == null)
      if (task.dueDate) {
        const msUntilDue = task.dueDate.toMillis() - now;
        const alreadyNudged = task.lastDueSoonNudgeAt &&
          (now - task.lastDueSoonNudgeAt.toMillis() < RENUDGE_COOLDOWN_MS);

        if (msUntilDue > 0 && msUntilDue <= DUE_SOON_WINDOW_MS && !alreadyNudged) {
          const title = '⏰ Task due soon';
          const body = `"${task.title}" is due soon — don't forget!`;
          await sendPushToUser(db, task.assignedTo, title, body, { taskId: taskDoc.id, type: 'task_due_soon' });
          await createInAppNotification(db, task.householdId, task.assignedTo, 'child', 'task_due_soon', title, body, '⏰', taskDoc.id);
          await taskDoc.ref.update({ lastDueSoonNudgeAt: FieldValue.serverTimestamp() });
          continue; // don't also fire the stale check this pass
        }
      }

      // No engagement: sitting untouched since it was assigned/reset
      const startTs = task.recurrence?.lastReset || task.createdAt;
      if (startTs) {
        const ageMs = now - startTs.toMillis();
        const alreadyNudged = task.lastStaleNudgeAt &&
          (now - task.lastStaleNudgeAt.toMillis() < RENUDGE_COOLDOWN_MS);

        if (ageMs >= STALE_THRESHOLD_MS && !alreadyNudged) {
          const title = '👀 Still waiting on you';
          const body = `"${task.title}" has been open for a couple of days — give it a go!`;
          await sendPushToUser(db, task.assignedTo, title, body, { taskId: taskDoc.id, type: 'task_stale' });
          await createInAppNotification(db, task.householdId, task.assignedTo, 'child', 'task_stale', title, body, '👀', taskDoc.id);
          await taskDoc.ref.update({ lastStaleNudgeAt: FieldValue.serverTimestamp() });
        }
      }
    }
  },
);

// Lets a parent manually nudge their child about a specific open task, right now.
export const sendNudge = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');

  const { taskId, householdId } = (request.data || {}) as { taskId?: string; householdId?: string };
  if (!taskId || !householdId) throw new HttpsError('invalid-argument', 'taskId and householdId are required.');

  const db = getFirestore();
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  const caller = callerSnap.data();
  if (!caller || caller.role !== 'parent' || caller.householdId !== householdId) {
    throw new HttpsError('permission-denied', 'Only a parent in this household can send a nudge.');
  }

  const taskSnap = await db.collection('households').doc(householdId).collection('tasks').doc(taskId).get();
  if (!taskSnap.exists) throw new HttpsError('not-found', 'Task not found.');
  const task = taskSnap.data()!;
  if (!task.assignedTo) throw new HttpsError('failed-precondition', 'Task has no assignee.');

  const title = `👋 Nudge from ${caller.displayName || 'your parent'}`;
  const body = `Don't forget: "${task.title}"`;

  await sendPushToUser(db, task.assignedTo, title, body, { taskId, type: 'parent_nudge' });
  await createInAppNotification(db, householdId, task.assignedTo, 'child', 'parent_nudge', title, body, '👋', taskId);

  return { ok: true };
});
