import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';

// Actual billing always happens in USD via Lemon Squeezy — this is only ever
// used to show an approximate local-currency price on the paywall.
export const MONTHLY_PRICE_USD_CENTS = 499; // placeholder until finalized in the Lemon Squeezy dashboard

interface FxRatesDoc {
  rates?: Record<string, number>;
}

/** Formats cents as a USD string, e.g. 499 → "$4.99". */
export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Subscribes to the daily-refreshed FX rates and returns the USD price plus
 * an approximate conversion to the given display currency (e.g. "R92").
 * Returns null for localPrice while rates haven't loaded yet, or for a
 * currency the refresh job doesn't track (falls back to USD-only display).
 */
export function useLocalizedPrice(currencyCode: string): { usdPrice: string; localPrice: string | null } {
  const [rates, setRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'fxRates'), (snap) => {
      setRates((snap.data() as FxRatesDoc | undefined)?.rates ?? null);
    }, () => setRates(null));
    return unsub;
  }, []);

  const usdPrice = formatUsd(MONTHLY_PRICE_USD_CENTS);
  const rate = rates?.[currencyCode.toUpperCase()];
  if (!rate) return { usdPrice, localPrice: null };

  const localAmount = Math.round((MONTHLY_PRICE_USD_CENTS / 100) * rate);
  return { usdPrice, localPrice: `≈${currencyCode.toUpperCase()}${localAmount}` };
}
