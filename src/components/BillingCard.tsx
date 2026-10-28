import React, { useState } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { Household } from '../types';
import { useLocalizedPrice } from '../lib/pricing';
import { CreditCard, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  household: Household;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Always-available billing entry point — unlike TrialBanner (last 7 days only)
 *  and SubscriptionPaywall (expired only), this lets a parent subscribe or
 *  check their status at any point in the trial, not just at the edges. */
export default function BillingCard({ household }: Props) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const { zarPrice, usdEstimate } = useLocalizedPrice();

  const status = household.subscriptionStatus;

  const handleSubscribe = async () => {
    setStarting(true);
    setError('');
    try {
      const createCheckoutUrl = httpsCallable(functions, 'createCheckoutUrl');
      const result = await createCheckoutUrl({ householdId: household.id });
      const url = (result.data as { url?: string })?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (err) {
      console.error('Failed to start checkout:', err);
      setError('Something went wrong starting checkout. Please try again in a moment.');
      setStarting(false);
    }
  };

  const renewalDate = household.currentPeriodEnd
    ? household.currentPeriodEnd.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const trialDaysLeft = household.trialEndsAt
    ? Math.max(0, Math.ceil((household.trialEndsAt.toMillis() - Date.now()) / MS_PER_DAY))
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-black text-slate-900 leading-none mb-1">Billing</h3>
          <p className="text-slate-500 font-medium text-sm">Manage your Home Anchor subscription</p>
        </div>
        <CreditCard className="text-slate-200" size={32} />
      </div>

      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 mb-6">
        {status === 'active' && (
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
            <CheckCircle2 size={16} />
            Active{renewalDate ? ` — renews ${renewalDate}` : ''}
          </p>
        )}
        {status === 'trialing' && (
          <p className="text-sm font-bold text-slate-700">
            Free trial{trialDaysLeft !== null ? ` — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left` : ''}
          </p>
        )}
        {status === 'past_due' && (
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700">
            <AlertTriangle size={16} />
            Payment failed — please update your card to keep your subscription active
          </p>
        )}
        {(status === 'cancelled' || status === 'expired') && (
          <p className="text-sm font-bold text-slate-700">
            {status === 'cancelled' ? 'Subscription cancelled' : 'Trial ended'} — subscribe below to keep using Home Anchor
          </p>
        )}
        {!status && <p className="text-sm font-bold text-slate-700">Free trial</p>}

        <p className="text-2xl font-black text-slate-900 mt-2">
          {zarPrice}<span className="text-sm font-bold text-slate-400">/mo</span>
        </p>
        {usdEstimate && <p className="text-xs font-bold text-slate-400">{usdEstimate}/mo · charged in USD</p>}
      </div>

      {error && <p className="text-red-500 text-xs font-bold mb-4">{error}</p>}

      {status !== 'active' && (
        <button
          onClick={handleSubscribe}
          disabled={starting}
          className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {starting ? <Loader2 className="animate-spin" size={20} /> : status === 'trialing' || !status ? 'Subscribe Now' : 'Subscribe'}
        </button>
      )}
    </div>
  );
}
