import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, collection, serverTimestamp, increment, runTransaction } from 'firebase/firestore';
import { Household, UserProfile, RewardItem } from '../types';
import { createNotification } from '../lib/notifications';
import { sendCashoutRequestEmail } from '../lib/email';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Banknote, CheckCircle2, Info, Loader2 } from 'lucide-react';

interface RedeemRewardsProps {
  household: Household;
  profile: UserProfile;
  members?: UserProfile[];
}

// Both a reward redemption and a cash-out spend points and create a Redemption
// record with the same pending → approved → paid lifecycle — the only real
// difference is whether the amount is fixed (a reward) or chosen by the child
// (cash). One confirmation modal covers both, keyed by this union.
type SpendTarget = { type: 'reward'; reward: RewardItem } | { type: 'cash' } | null;

export default function RedeemRewards({ household, profile, members = [] }: RedeemRewardsProps) {
  const [spendTarget, setSpendTarget] = useState<SpendTarget>(null);
  const [cashAmount, setCashAmount] = useState<number>(household.minCashOut);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const openCashOut = () => {
    setCashAmount(household.minCashOut);
    setError('');
    setSpendTarget({ type: 'cash' });
  };

  const handleRedeemReward = async (reward: RewardItem) => {
    setIsProcessing(true);
    setError('');
    try {
      const userRef = doc(db, 'users', profile.uid);
      const redemptionRef = doc(collection(db, 'households', household.id, 'redemptions'));

      // Transaction ensures we read the live balance before deducting —
      // prevents double-spend if the user taps twice or a concurrent cashout races this.
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const livePoints: number = userSnap.data()?.totalPoints ?? 0;
        if (livePoints < reward.pointCost) throw new Error('Insufficient balance');

        tx.set(redemptionRef, {
          id: redemptionRef.id,
          householdId: household.id,
          type: 'reward',
          title: reward.title,
          pointsSpent: reward.pointCost,
          cashValue: reward.pointCost,
          childId: profile.uid,
          childName: profile.displayName,
          status: 'pending',
          proofPhotoUrl: null,
          note: null,
          paidBy: null,
          paidByName: null,
          paymentMethod: null,
          paymentReference: null,
          paymentNote: null,
          createdAt: serverTimestamp(),
          approvedAt: null,
          paidAt: null,
        });
        tx.update(userRef, { totalPoints: increment(-reward.pointCost) });
      });

      setSpendTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === 'Insufficient balance' ? 'Not enough points for this reward.' : 'Redemption failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashOut = async () => {
    const minCashOut = household.minCashOut;
    if (!cashAmount || cashAmount < minCashOut || cashAmount > profile.totalPoints) return;
    setIsProcessing(true);
    setError('');
    try {
      const userRef = doc(db, 'users', profile.uid);
      const redemptionRef = doc(collection(db, 'households', household.id, 'redemptions'));

      // Use a transaction so the balance read and write are atomic —
      // prevents double-deduction if parent settles at the same moment.
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const livePoints: number = userSnap.data()?.totalPoints ?? 0;
        // Cap at actual live balance to guarantee we never go negative
        const safeAmount = Math.min(cashAmount, Math.max(0, livePoints));
        if (safeAmount < minCashOut) throw new Error('Insufficient balance');
        tx.set(redemptionRef, {
          id: redemptionRef.id,
          householdId: household.id,
          type: 'cash',
          title: 'Cash Out',
          pointsSpent: safeAmount,
          cashValue: safeAmount,
          childId: profile.uid,
          childName: profile.displayName,
          status: 'pending',
          proofPhotoUrl: null,
          note: null,
          paidBy: null,
          paidByName: null,
          paymentMethod: null,
          paymentReference: null,
          paymentNote: null,
          createdAt: serverTimestamp(),
          approvedAt: null,
          paidAt: null,
        });
        tx.update(userRef, { totalPoints: increment(-safeAmount) });
      });

      setSpendTarget(null);

      // Notify parents
      const parents = members.filter(m => m.role === 'parent');
      const emailEnabled = household.emailNotificationsEnabled !== false;
      for (const parent of parents) {
        await createNotification(
          household.id, parent.uid, 'parent',
          'cashout_requested',
          'Cash-out requested 💸',
          `${profile.displayName} wants to cash out ${household.currency}${cashAmount}. Tap to pay!`,
          '💸', { redemptionId: redemptionRef.id }
        );
        if (emailEnabled && parent.email) {
          sendCashoutRequestEmail(parent.email, parent.displayName || 'Parent', profile.displayName || 'Child', cashAmount, household.currency);
        }
      }
    } catch (err: unknown) {
      setError('Cash out failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  const safePoints = Math.max(0, profile.totalPoints ?? 0);
  const canCashOut = household.cashOutEnabled && safePoints >= household.minCashOut;

  return (
    <div className="space-y-12">
      {/* Points Summary Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
            <Gift size={24} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Available Balance</h2>
            <div className="text-2xl font-black text-slate-900">{safePoints} pts = {household.currency}{safePoints}</div>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
          <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest leading-relaxed">
            Balance reflects only parent-approved completed tasks. Cash-outs and rewards are limited to your earned balance.
          </p>
        </div>
      </div>

      {/* Spend grid — rewards and cash-out live side by side as the same kind of tile */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">Spend Your Points</h3>
          <span className="text-xs text-slate-500 font-medium">{household.rewardStore.length} reward{household.rewardStore.length === 1 ? '' : 's'} available</span>
        </div>

        {household.rewardStore.length === 0 && !household.cashOutEnabled ? (
          <div className="p-12 text-center bg-white border-2 border-dashed border-slate-200 rounded-3xl">
            <Gift className="mx-auto text-slate-200 mb-4" size={48} />
            <p className="text-slate-400 font-medium">No rewards added by parent yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {household.rewardStore.map((reward) => {
              const canAfford = profile.totalPoints >= reward.pointCost;
              return (
                <div
                  key={reward.id}
                  className={`bg-white p-6 rounded-3xl border transition-all ${
                    canAfford ? 'border-slate-200 shadow-lg shadow-slate-100' : 'border-slate-100 opacity-60'
                  }`}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <Gift size={20} />
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-black text-slate-900">{reward.pointCost}</div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Points</div>
                    </div>
                  </div>

                  <h4 className="text-lg font-bold text-slate-900 mb-1">{reward.title}</h4>
                  <p className="text-xs text-slate-400 mb-6">Value: {household.currencyName} {reward.pointCost}</p>

                  <button
                    disabled={!canAfford}
                    onClick={() => { setError(''); setSpendTarget({ type: 'reward', reward }); }}
                    className={`w-full py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                      canAfford
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-95'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {!canAfford && <Info size={14} />}
                    {canAfford ? 'Redeem' : `Need ${reward.pointCost - profile.totalPoints} more pts`}
                  </button>
                </div>
              );
            })}

            {household.cashOutEnabled && (
              <div
                className={`p-6 rounded-3xl border transition-all ${
                  canCashOut ? 'border-indigo-200 bg-indigo-50/40 shadow-lg shadow-indigo-100' : 'border-slate-100 opacity-60'
                }`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                    <Banknote size={20} />
                  </div>
                </div>

                <h4 className="text-lg font-bold text-slate-900 mb-1">Cash Out</h4>
                <p className="text-xs text-slate-400 mb-6">
                  {canCashOut ? `Choose your own amount · Min ${household.minCashOut} pts` : `Need ${household.minCashOut} pts minimum`}
                </p>

                <button
                  disabled={!canCashOut}
                  onClick={openCashOut}
                  className={`w-full py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    canCashOut
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {!canCashOut && <Info size={14} />}
                  Cash Out
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Spend confirmation modal — one shape for both a fixed-cost reward and a chosen cash amount */}
      <AnimatePresence>
        {spendTarget && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-8 rounded-[2rem] w-full max-w-sm shadow-2xl relative overflow-hidden"
            >
              <div className={`absolute top-0 left-0 w-full h-2 ${spendTarget.type === 'reward' ? 'bg-indigo-600' : 'bg-emerald-600'}`} />
              <div className="text-center space-y-6">
                <div className={`p-4 rounded-3xl w-fit mx-auto ${spendTarget.type === 'reward' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                  {spendTarget.type === 'reward' ? <Gift size={48} /> : <Banknote size={48} />}
                </div>

                {spendTarget.type === 'reward' ? (
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-800">Redeem Reward?</h3>
                    <p className="text-slate-500 font-medium">
                      Spend <span className="font-bold text-indigo-600">{spendTarget.reward.pointCost} pts ({household.currency}{spendTarget.reward.pointCost})</span> on <br />
                      <span className="text-slate-900 font-bold block mt-1">"{spendTarget.reward.title}"?</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-2xl font-black text-slate-800">Cash Out Points?</h3>
                    <div className="space-y-1 text-left">
                      <div className="flex justify-between text-xs font-bold text-slate-400 uppercase">
                        <span>Amount Pts</span>
                        <span>Min: {household.minCashOut} · Max: {safePoints}</span>
                      </div>
                      <input
                        type="number"
                        value={cashAmount || ''}
                        onChange={(e) => setCashAmount(Number(e.target.value))}
                        placeholder={`Min ${household.minCashOut}`}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-xl font-bold text-center"
                      />
                    </div>
                    <p className="text-slate-900 font-black text-xl">
                      = {household.currency}{Math.min(cashAmount || 0, safePoints)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase py-2 border-y border-slate-100">
                      Your parent will be notified to pay you
                    </p>
                  </div>
                )}

                {error && <p className="text-red-500 text-xs font-bold">{error}</p>}
                <div className="flex flex-col gap-3">
                  <button
                    disabled={isProcessing || (spendTarget.type === 'cash' && (!cashAmount || cashAmount < household.minCashOut || cashAmount > profile.totalPoints))}
                    onClick={() => spendTarget.type === 'reward' ? handleRedeemReward(spendTarget.reward) : handleCashOut()}
                    className={`w-full py-4 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center disabled:opacity-50 ${
                      spendTarget.type === 'reward' ? 'bg-indigo-600 shadow-indigo-100' : 'bg-emerald-600 shadow-emerald-100'
                    }`}
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : spendTarget.type === 'reward' ? 'Confirm Redemption' : 'Confirm Cash Out'}
                  </button>
                  <button
                    disabled={isProcessing}
                    onClick={() => setSpendTarget(null)}
                    className="w-full py-4 text-slate-400 font-bold hover:text-slate-600"
                  >
                    {spendTarget.type === 'reward' ? 'Maybe Later' : 'Cancel'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
