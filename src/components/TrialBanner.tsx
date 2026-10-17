import React, { useState } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { Household } from '../types';
import { useLocalizedPrice } from '../lib/pricing';
import { Clock, Loader2 } from 'lucide-react';

interface Props {
  household: Household;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Only shown once the trial is in its final week — stays out of the way until then. */
export default function TrialBanner({ household }: Props) {
  const [starting, setStarting] = useState(false);
  const { usdPrice } = useLocalizedPrice('ZAR');

  if (household.subscriptionStatus !== 'trialing' || !household.trialEndsAt) return null;
  const daysLeft = Math.ceil((household.trialEndsAt.toMillis() - Date.now()) / MS_PER_DAY);
  if (daysLeft > 7) return null;

  const handleSubscribe = async () => {
    setStarting(true);
    try {
      const createCheckoutUrl = httpsCallable(functions, 'createCheckoutUrl');
      const result = await createCheckoutUrl({ householdId: household.id });
      const url = (result.data as { url?: string })?.url;
      if (url) window.location.href = url;
      else setStarting(false);
    } catch (err) {
      console.error('Failed to start checkout:', err);
      setStarting(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-100 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-3 text-center">
      <p className="text-amber-800 text-xs font-bold flex items-center gap-2">
        <Clock size={14} />
        {daysLeft <= 0 ? 'Your free trial ends today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial`}
        {' — '}{usdPrice}/mo after that.
      </p>
      <button
        onClick={handleSubscribe}
        disabled={starting}
        className="text-xs font-black text-indigo-600 hover:text-slate-900 uppercase tracking-tight underline disabled:opacity-60"
      >
        {starting ? <Loader2 className="animate-spin inline" size={14} /> : 'Subscribe now'}
      </button>
    </div>
  );
}
