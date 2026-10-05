import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Task, Redemption, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, AlertTriangle, Send, Loader2, 
  MessageSquare, HelpCircle, ArrowRight
} from 'lucide-react';
import { createNotification } from '../lib/notifications';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task?: Task;
  redemption?: Redemption;
  profile: UserProfile;
  members: UserProfile[];
}

const OUTCOMES = [
  'Request re-review',
  'Request payment',
  'Clarify instructions',
  'Report technical issue',
  'Other'
];

export default function DisputeModal({ isOpen, onClose, task, redemption, profile, members }: Props) {
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState(OUTCOMES[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const isMounted = useRef(true);

  // Guard against state updates after unmount
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Reset form state whenever the modal is closed, so re-opening is always clean
  useEffect(() => {
    if (!isOpen) {
      setSuccess(false);
      setReason('');
      setOutcome(OUTCOMES[0]);
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;

    setLoading(true);
    try {
      const householdId = task?.householdId || redemption?.householdId;
      if (!householdId) return;

      await addDoc(collection(db, 'households', householdId, 'disputes'), {
        householdId,
        taskId: task?.id || null,
        redemptionId: redemption?.id || null,
        raisedBy: profile.uid,
        raisedByName: profile.displayName,
        raisedByRole: profile.role,
        reason: reason.trim(),
        desiredOutcome: outcome,
        status: 'open',
        createdAt: serverTimestamp(),
      });

      // Notify parents about the dispute
      const parents = members.filter(m => m.role === 'parent');
      for (const parent of parents) {
        await createNotification(
          householdId, parent.uid, 'parent',
          'dispute_raised',
          'Dispute Raised ⚠️',
          `${profile.displayName} raised a dispute for "${task?.title || redemption?.title}". Tap to review!`,
          '⚠️', { taskId: task?.id || null, redemptionId: redemption?.id || null }
        );
      }

      if (isMounted.current) setSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center z-[120] sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
          >
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-red-600">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur-sm">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 className="text-white font-black uppercase tracking-tight">Raise Dispute</h2>
                  <p className="text-red-100/70 text-[10px] font-black uppercase tracking-widest mt-0.5">Requesting re-review</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white"
              >
                <X size={20} />
              </button>
            </div>

            {success ? (
              <div className="p-6 text-center space-y-6">
                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                  <Send size={28} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 mb-1">Dispute Raised!</h3>
                  <p className="text-slate-500 font-medium text-sm">A family manager has been notified and will review your dispute.</p>
                </div>
                <button
                  onClick={() => { setSuccess(false); setReason(''); onClose(); }}
                  className="w-full bg-slate-900 text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">What's the issue?</p>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why you are raising this dispute..."
                  rows={4}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:border-red-600 focus:bg-white transition-all outline-none resize-none"
                />
              </div>

              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Desired Outcome</p>
                <div className="grid grid-cols-1 gap-2">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOutcome(o)}
                      className={`p-3 rounded-xl border-2 text-left text-xs font-black uppercase tracking-tight transition-all flex items-center justify-between ${outcome === o ? 'border-red-600 bg-red-50 text-red-700' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                    >
                      {o}
                      {outcome === o && <Send size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !reason.trim()}
                className="w-full bg-red-600 text-white p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-red-100 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <Send size={20} />
                    Report Issue
                  </>
                )}
              </button>

              <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest bg-slate-50 p-2 rounded-lg">
                ⚠️ Abuse of the dispute system can affect your trust score.
              </p>
            </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
