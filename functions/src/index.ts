import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as crypto from 'node:crypto';

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
  db: Firestore,
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
  db: Firestore,
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

  const taskRef = db.collection('households').doc(householdId).collection('tasks').doc(taskId);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) throw new HttpsError('not-found', 'Task not found.');
  const task = taskSnap.data()!;
  if (!task.assignedTo) throw new HttpsError('failed-precondition', 'Task has no assignee.');

  const lastManualNudgeAt = task.lastManualNudgeAt as Timestamp | undefined;
  if (lastManualNudgeAt && Date.now() - lastManualNudgeAt.toMillis() < 60_000) {
    throw new HttpsError('resource-exhausted', 'Already nudged this task in the last minute — give it a moment.');
  }

  const title = `👋 Nudge from ${caller.displayName || 'your parent'}`;
  const body = `Don't forget: "${task.title}"`;

  await sendPushToUser(db, task.assignedTo, title, body, { taskId, type: 'parent_nudge' });
  await createInAppNotification(db, householdId, task.assignedTo, 'child', 'parent_nudge', title, body, '👋', taskId);
  await taskRef.update({ lastManualNudgeAt: FieldValue.serverTimestamp() });

  return { ok: true };
});

// ── Admin alert: new household registered ───────────────────────────────────

// Public EmailJS credentials (safe to embed — same values already compiled into the client
// bundle). Reading the admin email list, by contrast, must never happen client-side, which is
// why this whole alert now lives here instead of in src/lib/email.ts.
const EMAILJS_SERVICE_ID = 'service_vnn4nqs';
const EMAILJS_TEMPLATE_ID = 'template_homemanager';
const EMAILJS_PUBLIC_KEY = 'xGcMUKdMFdgJGW67s';
const EMAILJS_REPLY_TO = 'homemanagercomms@gmail.com';

async function sendViaEmailJs(toEmail: string, toName: string, subject: string, messageHtml: string): Promise<void> {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email: toEmail,
        to_name: toName,
        subject,
        message_html: messageHtml,
        from_name: 'Home Anchor',
        reply_to: EMAILJS_REPLY_TO,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`EmailJS ${res.status}: ${text}`);
  }
}

function wrapEmail(body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1f2937">
    <div style="background:#1B3A5C;padding:24px;text-align:center;border-radius:12px 12px 0 0">
      <h1 style="color:#fff;margin:0;font-size:24px">🏠 Home Anchor</h1>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      ${body}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#9ca3af">
        Sent by Home Anchor · Empowering family teamwork
      </div>
    </div>
  </div>`;
}

// Fires on every new household — reads the admin email list via Admin SDK (which bypasses
// Firestore rules) so the client never needs read access to settings/adminAccess.
export const notifyAdminOnNewHousehold = onDocumentCreated(
  { document: 'households/{householdId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const household = snap.data();
    const db = getFirestore();

    const adminSnap = await db.collection('settings').doc('adminAccess').get();
    if (!adminSnap.exists) return;
    const adminEmails: string[] = adminSnap.data()?.emails || [];
    if (adminEmails.length === 0) return;

    let creatorName = 'Unknown';
    let creatorEmail = '';
    if (household.createdBy) {
      const userSnap = await db.collection('users').doc(household.createdBy).get();
      if (userSnap.exists) {
        creatorName = userSnap.data()?.displayName || 'Unknown';
        creatorEmail = userSnap.data()?.email || '';
      }
    }

    const timestamp = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const body = `
      <h2 style="color:#1B3A5C">🏠 New Family Registered</h2>
      <p>A new household just joined <strong>Home Anchor</strong>.</p>
      <div style="background:#F4F7FB;border-left:4px solid #2E7D6B;padding:16px;border-radius:4px;margin:16px 0">
        <p style="margin:0"><strong>Family name:</strong> ${household.name}</p>
        <p style="margin:6px 0 0"><strong>Created by:</strong> ${creatorName}${creatorEmail ? ` &lt;${creatorEmail}&gt;` : ''}</p>
        <p style="margin:6px 0 0"><strong>Household ID:</strong> <code style="font-family:monospace;font-size:12px;background:#e2e8f0;padding:2px 6px;border-radius:4px">${event.params.householdId}</code></p>
        <p style="margin:6px 0 0"><strong>Registered at:</strong> ${timestamp}</p>
      </div>
      <p>
        <a href="https://app.home-anchor.org"
           style="background:#1B3A5C;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;margin-top:8px">
          Open Home Anchor →
        </a>
      </p>`;

    await Promise.all(
      adminEmails.map((email) =>
        sendViaEmailJs(email, 'Admin', `🏠 New family registered: ${household.name}`, wrapEmail(body))
          .catch((err) => console.error('[AdminAlert] Failed to notify', email, err))
      )
    );
  },
);

// ── Subscription billing (Lemon Squeezy) ────────────────────────────────────
//
// Model: every household gets a 30-day free trial from creation. After that,
// subscriptionStatus must be 'active' (or still in Lemon Squeezy's own
// cancellation grace period, i.e. 'cancelled' with ends_at in the future) or
// the app locks. All of subscriptionStatus / trialEndsAt / currentPeriodEnd /
// lemonSqueezy is written only here — never by the client (enforced in
// firestore.rules) — so a household can't grant itself access.

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';

const TRIAL_LENGTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Grants the 30-day trial the moment a household is created.
export const initializeSubscriptionTrial = onDocumentCreated(
  { document: 'households/{householdId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    if (snap.data()?.subscriptionStatus) return; // already set — avoid clobbering a backfill

    await snap.ref.update({
      subscriptionStatus: 'trialing',
      trialEndsAt: Timestamp.fromMillis(Date.now() + TRIAL_LENGTH_MS),
      currentPeriodEnd: null,
      lemonSqueezy: null,
    });
  },
);

// Daily sweep: flips any household whose trial has run out, and hasn't
// subscribed, from 'trialing' to 'expired' (which the client treats as a
// hard lockout). Subscribing before the trial ends short-circuits this via
// the webhook below, which moves status to 'active' first.
export const checkTrialExpirations = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    const db = getFirestore();
    const snap = await db.collection('households')
      .where('subscriptionStatus', '==', 'trialing')
      .where('trialEndsAt', '<=', Timestamp.now())
      .get();

    console.log(`[Billing] ${snap.size} trial(s) expiring`);
    await Promise.all(snap.docs.map((d) => d.ref.update({ subscriptionStatus: 'expired' })));
  },
);

// Starts a Lemon Squeezy hosted checkout for the caller's household and
// returns the URL to redirect to. storeId/variantId live in Firestore
// (settings/pricing) rather than hardcoded so the price can change without
// a redeploy; the API key is a secret since it can create real charges.
export const createCheckoutUrl = onCall(
  { region: 'us-central1', secrets: ['LEMON_SQUEEZY_API_KEY'] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');

    const { householdId } = (request.data || {}) as { householdId?: string };
    if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');

    const db = getFirestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    const caller = callerSnap.data();
    if (!caller || caller.role !== 'parent' || caller.householdId !== householdId) {
      throw new HttpsError('permission-denied', 'Only a parent in this household can manage billing.');
    }

    const pricingSnap = await db.collection('settings').doc('pricing').get();
    const pricing = pricingSnap.data() as { lemonSqueezyStoreId?: string; lemonSqueezyVariantId?: string } | undefined;
    const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
    if (!pricing?.lemonSqueezyStoreId || !pricing?.lemonSqueezyVariantId || !apiKey) {
      throw new HttpsError('failed-precondition', 'Billing isn\'t set up yet — please try again soon.');
    }

    const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: { custom: { householdId } },
            product_options: { redirect_url: 'https://app.home-anchor.org' },
          },
          relationships: {
            store: { data: { type: 'stores', id: pricing.lemonSqueezyStoreId } },
            variant: { data: { type: 'variants', id: pricing.lemonSqueezyVariantId } },
          },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      console.error('[Billing] Checkout creation failed:', res.status, text);
      throw new HttpsError('internal', 'Could not start checkout. Please try again.');
    }

    const body = await res.json() as { data?: { attributes?: { url?: string } } };
    const url = body?.data?.attributes?.url;
    if (!url) throw new HttpsError('internal', 'Could not start checkout. Please try again.');

    return { url };
  },
);

function mapLemonSqueezyStatus(status: string): SubscriptionStatus | null {
  switch (status) {
    case 'active':
    case 'on_trial':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    default:
      return null;
  }
}

interface LemonSqueezyWebhookPayload {
  meta?: { event_name?: string; custom_data?: { householdId?: string } };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      customer_id?: number;
      renews_at?: string | null;
    };
  };
}

// Keeps household.subscriptionStatus in sync with Lemon Squeezy. Verifies
// the request actually came from Lemon Squeezy via the HMAC signature they
// send (see https://docs.lemonsqueezy.com/help/webhooks/signing-requests) —
// this endpoint is public, so that check is the only thing stopping anyone
// on the internet from granting themselves a free subscription.
export const lemonSqueezyWebhook = onRequest(
  { region: 'us-central1', secrets: ['LEMON_SQUEEZY_WEBHOOK_SECRET'] },
  async (request, response) => {
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    const signatureHeader = request.get('X-Signature') || '';
    if (!secret || !request.rawBody) {
      console.error('[Billing] Webhook secret not configured or rawBody missing');
      response.status(500).send('Webhook not configured');
      return;
    }

    const digest = crypto.createHmac('sha256', secret).update(request.rawBody).digest('hex');
    const digestBuf = Buffer.from(digest, 'utf8');
    const signatureBuf = Buffer.from(signatureHeader, 'utf8');
    const isValid = digestBuf.length === signatureBuf.length && crypto.timingSafeEqual(digestBuf, signatureBuf);
    if (!isValid) {
      console.error('[Billing] Webhook signature mismatch');
      response.status(401).send('Invalid signature');
      return;
    }

    const payload = request.body as LemonSqueezyWebhookPayload;
    const eventName = payload.meta?.event_name;
    const householdId = payload.meta?.custom_data?.householdId;
    const attrs = payload.data?.attributes;

    if (!householdId || !attrs) {
      console.log('[Billing] Webhook missing householdId/attributes, ignoring:', eventName);
      response.status(200).send('ignored');
      return;
    }

    // subscription_expired/cancelled map directly from the event itself — more reliable
    // than the status field, since 'cancelled' subscriptions report status 'cancelled'
    // right up until ends_at, which is exactly the grace period we want to preserve.
    const mappedStatus =
      eventName === 'subscription_expired' ? 'expired' :
      eventName === 'subscription_cancelled' ? 'cancelled' :
      mapLemonSqueezyStatus(attrs.status || '');

    if (!mappedStatus) {
      console.log('[Billing] Unhandled status, ignoring:', eventName, attrs.status);
      response.status(200).send('ignored');
      return;
    }

    const db = getFirestore();
    const householdRef = db.collection('households').doc(householdId);
    if (!(await householdRef.get()).exists) {
      console.error('[Billing] Webhook referenced unknown household:', householdId);
      response.status(200).send('household not found');
      return;
    }

    await householdRef.update({
      subscriptionStatus: mappedStatus,
      currentPeriodEnd: attrs.renews_at ? Timestamp.fromDate(new Date(attrs.renews_at)) : null,
      lemonSqueezy: {
        customerId: attrs.customer_id ?? null,
        subscriptionId: payload.data?.id ? Number(payload.data.id) : null,
      },
    });

    console.log(`[Billing] ${eventName} → household ${householdId} is now ${mappedStatus}`);
    response.status(200).send('ok');
  },
);

// ── Display pricing (FX rates) ───────────────────────────────────────────────
//
// Actual billing always happens in USD via Lemon Squeezy — these rates are
// only ever used to show an approximate local-currency price on the paywall,
// never to charge anyone, so a daily refresh from a free rate API is plenty.

const FX_DISPLAY_CURRENCIES = ['ZAR', 'GBP', 'EUR'];

export const refreshFxRates = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${FX_DISPLAY_CURRENCIES.join(',')}`);
    if (!res.ok) {
      console.error('[FX] Frankfurter API failed:', res.status, await res.text().catch(() => ''));
      return;
    }

    const body = await res.json() as { rates?: Record<string, number> };
    if (!body.rates) {
      console.error('[FX] Frankfurter API returned no rates');
      return;
    }

    await getFirestore().collection('settings').doc('fxRates').set({
      base: 'USD',
      rates: body.rates,
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log('[FX] Refreshed rates:', body.rates);
  },
);
