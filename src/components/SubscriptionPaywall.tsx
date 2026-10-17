import React, { useState } from 'react';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { Household, UserProfile } from '../types';
import { useLocalizedPrice } from '../lib/pricing';
import { Lock, Loader2, Heart } from 'lucide-react';

interface Props {
  variant: 'parent' | 'child';
  household: Household;
  profile: UserProfile;
}

export default function SubscriptionPaywall({ variant, household, profile }: Props) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  // Household's own `currency` field is the points/allowance symbol (e.g. "R"), not a
  // billing locale — the display price always shows ZAR for now regardless of that setting.
  const { usdPrice, localPrice } = useLocalizedPrice('ZAR');

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-w-md w-full">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white text-center">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm mx-auto mb-4">
            <Lock size={24} />
          </div>
          <h2 className="text-xl font-black leading-tight">
            {variant === 'parent' ? "Your family's free trial has ended" : 'Waiting on your parent'}
          </h2>
        </div>

        <div className="p-8 space-y-6 text-center">
          {variant === 'parent' ? (
            <>
              <p className="text-slate-600 font-medium text-sm leading-relaxed">
                {household.name} has had 60 days of Home Anchor. To keep using it —
                tasks, rewards, everything — subscribe below.
              </p>
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
                <p className="text-3xl font-black text-slate-900">{usdPrice}<span className="text-sm font-bold text-slate-400">/mo</span></p>
                {localPrice && <p className="text-xs font-bold text-slate-400 mt-1">{localPrice}/mo · billed in USD</p>}
              </div>
              {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
              <button
                onClick={handleSubscribe}
                disabled={starting}
                className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {starting ? <Loader2 className="animate-spin" size={20} /> : 'Subscribe Now'}
              </button>
            </>
          ) : (
            <>
              <div className="text-5xl mb-2">⏳</div>
              <p className="text-slate-600 font-medium text-sm leading-relaxed">
                Hey {profile.displayName}! Home Anchor's free trial for your family has ended.
                Ask a parent to subscribe so you can keep earning.
              </p>
              <p className="flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Heart size={12} /> We'll be right here when they do
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
