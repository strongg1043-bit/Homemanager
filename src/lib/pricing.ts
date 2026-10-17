import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

// Price lives in the Lemon Squeezy dashboard (ZAR is the store's display
// currency — Lemon Squeezy always processes the actual charge in USD at
// real-time rates, so this is the one number we need to mirror). This is
// a fallback for before settings/pricing has loaded.
export const DEFAULT_MONTHLY_PRICE_ZAR_CENTS = 7900;

interface PricingDoc {
  monthlyPriceZarCents?: number;
}

interface FxRatesDoc {
  rates?: Record<string, number>;
}

/** Formats cents as a ZAR string, e.g. 7900 → "R79". */
export function formatZar(cents: number): string {
  const amount = cents / 100;
  return `R${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/**
 * Subscribes to settings/pricing and the daily-refreshed FX rates, returning
 * the ZAR price (what Lemon Squeezy's checkout will actually show) plus an
 * approximate USD equivalent for context. The USD figure is informational —
 * Lemon Squeezy computes the real charge itself at checkout time.
 */
export function useLocalizedPrice(): { zarPrice: string; usdEstimate: string | null } {
  const [priceCents, setPriceCents] = useState(DEFAULT_MONTHLY_PRICE_ZAR_CENTS);
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const unsubPricing = onSnapshot(doc(db, 'settings', 'pricing'), (snap) => {
      const cents = (snap.data() as PricingDoc | undefined)?.monthlyPriceZarCents;
      if (cents) setPriceCents(cents);
    }, () => {});
    const unsubRates = onSnapshot(doc(db, 'settings', 'fxRates'), (snap) => {
      setRates((snap.data() as FxRatesDoc | undefined)?.rates ?? null);
    }, () => setRates(null));
    return () => { unsubPricing(); unsubRates(); };
  }, []);

  const zarPrice = formatZar(priceCents);
  const zarPerUsd = rates?.ZAR;
  if (!zarPerUsd) return { zarPrice, usdEstimate: null };

  const usdAmount = (priceCents / 100) / zarPerUsd;
  return { zarPrice, usdEstimate: `≈$${usdAmount.toFixed(2)}` };
}
