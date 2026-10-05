import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
