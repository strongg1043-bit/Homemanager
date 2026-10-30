import React, { useState } from 'react';
import { auth, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { UserProfile } from '../types';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  profile: UserProfile;
  /** Small text link instead of a full card — used on the locked paywall screen. */
  compact?: boolean;
}

const CONFIRM_WORD = 'DELETE';

/** In-app account deletion (required by Google Play). The Cloud Function decides the scope:
 *  a child or a non-last parent is removed alone; the last parent deletes the household, and
 *  the server asks for a second confirmation first because that also deletes the children. */
export default function DeleteAccountCard({ profile, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  // Set when the server says this deletion would also remove the household.
  const [householdMembers, setHouseholdMembers] = useState<number | null>(null);

  const reset = () => {
    setOpen(false);
    setTyped('');
    setError('');
    setHouseholdMembers(null);
  };

  const handleDelete = async () => {
    setWorking(true);
    setError('');
    try {
      const deleteMyAccount = httpsCallable(functions, 'deleteMyAccount');
      await deleteMyAccount({ confirmHouseholdDeletion: householdMembers !== null });
      // The Auth user no longer exists server-side; clear the local session straight away.
      await signOut(auth).catch(() => {});
    } catch (err) {
      const e = err as { code?: string; message?: string; details?: { code?: string; memberCount?: number } };
      if (e.details?.code === 'confirmation-required') {
        setHouseholdMembers(e.details.memberCount ?? 1);
      } else if (e.code === 'functions/unavailable') {
        setError(e.message || 'We could not cancel your subscription, so nothing was deleted. Please try again.');
      } else {
        console.error('Account deletion failed:', err);
        setError('Something went wrong and your account was not fully deleted. Please try again.');
      }
      setWorking(false);
    }
  };

  const canSubmit = typed.trim().toUpperCase() === CONFIRM_WORD && !working;
  const isParent = profile.role === 'parent';

  const form = (
    <div className="space-y-4">
      {householdMembers === null ? (
        <p className="text-sm text-slate-600 font-medium leading-relaxed">
          {isParent
            ? 'This permanently deletes your account and your notifications. If you are the only parent in your household, it will also delete the household and every child account in it.'
            : 'This permanently deletes your account, your missions, your wallet history and your notifications. This cannot be undone.'}
        </p>
      ) : (
        <div className="flex gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertTriangle className="text-red-500 shrink-0" size={20} />
          <p className="text-sm text-red-700 font-bold leading-relaxed">
            You are the only parent, so this will delete the whole household, including
            {householdMembers === 1 ? ' 1 other account' : ` ${householdMembers} other accounts`}, all their missions and rewards history,
            and cancel your subscription. This cannot be undone.
          </p>
        </div>
      )}

      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">
        Type {CONFIRM_WORD} to confirm
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="mt-2 w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-900 font-bold normal-case tracking-normal focus:outline-none focus:ring-2 focus:ring-red-400"
        />
      </label>

      {error && <p className="text-red-500 text-xs font-bold">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={reset}
          disabled={working}
          className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-2xl hover:bg-slate-200 transition-all disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={!canSubmit}
          className="flex-1 py-3 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {working ? <Loader2 className="animate-spin" size={18} /> : householdMembers === null ? 'Delete my account' : 'Delete everything'}
        </button>
      </div>
    </div>
  );

  if (compact) {
    return open ? (
      <div className="p-6 border-t border-slate-100 text-left">{form}</div>
    ) : (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 text-red-400 hover:text-red-600 hover:bg-red-50 font-bold text-xs uppercase tracking-widest transition-colors border-t border-slate-100"
      >
        Delete my account
      </button>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] border border-red-100 p-8 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-black text-slate-900 leading-none mb-1">Delete account</h3>
          <p className="text-slate-500 font-medium text-sm">Permanently remove your account and data</p>
        </div>
        <Trash2 className="text-red-200" size={32} />
      </div>
      {open ? (
        form
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-4 bg-red-50 text-red-600 font-black rounded-2xl hover:bg-red-100 transition-all"
        >
          Delete my account
        </button>
      )}
    </div>
  );
}
