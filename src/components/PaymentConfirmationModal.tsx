import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Redemption, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Banknote, Landmark, CreditCard,
  Wallet, Camera, Check, Loader2,
  Receipt, FileText
} from 'lucide-react';
import { compressToBase64Profile } from '../lib/imageUtils';
import { createNotification } from '../lib/notifications';
import { sendPaymentConfirmedEmail } from '../lib/email';
import BetaFundingModal from './BetaFundingModal';
import { shouldShowFundingModal, recordFundingModalShown } from '../lib/fundingModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  redemption: Redemption;
  profile: UserProfile;
  householdCurrency: string;
  members: UserProfile[];
  emailEnabled?: boolean;
}

const METHODS = [
  { id: 'cash', label: 'Cash', icon: <Wallet size={16} /> },
  { id: 'bank_transfer', label: 'Bank Transfer', icon: <Landmark size={16} /> },
  { id: 'eft', label: 'EFT', icon: <CreditCard size={16} /> },
  { id: 'other', label: 'Other', icon: <Banknote size={16} /> },
] as const;

export default function PaymentConfirmationModal({ isOpen, onClose, redemption, profile, householdCurrency, members, emailEnabled = true }: Props) {
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'eft' | 'other'>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showFunding, setShowFunding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const base64 = await compressToBase64Profile(file);
      setProofUrl(base64);
    } catch (err) {
      console.error(err);
      setFormError('Failed to process image. Please try a different file.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      await updateDoc(doc(db, 'households', redemption.householdId, 'redemptions', redemption.id), {
        status: 'paid',
        paidAt: serverTimestamp(),
        paidBy: profile.uid,
        paidByName: profile.displayName,
        paymentMethod: method,
        paymentReference: reference.trim() || null,
        paymentNote: note.trim() || null,
        proofPhotoUrl: proofUrl,
      });

      await createNotification(
        redemption.householdId, redemption.childId, 'child',
        'cashout_paid',
        'Payment received! 💰',
        `Your cash-out of ${householdCurrency}${redemption.pointsSpent} has been paid. Check your wallet!`,
        '💰', { redemptionId: redemption.id }
      );

      const child = members.find(m => m.uid === redemption.childId);
      if (emailEnabled && child?.email) {
        sendPaymentConfirmedEmail(
          child.email, child.displayName || redemption.childName, profile.displayName || 'Your parent',
          redemption.cashValue || redemption.pointsSpent, householdCurrency,
          method, reference
        );
      }

      // Show funding modal before closing (throttled to once per 7 days)
      if (shouldShowFundingModal()) {
        recordFundingModalShown();
        setShowFunding(true);
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      setFormError('Failed to confirm payment. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-end sm:items-center justify-center z-[110] sm:p-4">
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
            className="relative w-full sm:max-w-lg bg-white rounded-t-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
          >
            <div className="p-6 sm:p-8 border-b border-slate-50 flex items-center justify-between bg-indigo-600 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-white backdrop-blur-sm">
                  <Banknote size={24} />
                </div>
                <div>
                  <h2 className="text-white font-black text-xl leading-tight uppercase tracking-tight">Confirm Payment</h2>
                  <p className="text-indigo-100/70 text-[10px] font-black uppercase tracking-widest mt-0.5">Recording audit-ready proof</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto flex-1 pb-4 sm:pb-8">
              {/* Summary */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount to Pay</p>
                  <p className="text-2xl font-black text-slate-900">{householdCurrency}{redemption.pointsSpent}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Child</p>
                  <p className="text-sm font-black text-slate-700">{redemption.childName}</p>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  {METHODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id)}
                      className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${method === m.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                    >
                      <div className={`p-2 rounded-xl ${method === m.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50'}`}>
                        {m.icon}
                      </div>
                      <span className="text-xs font-black uppercase tracking-tight">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Reference and Note */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Reference (Optional)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="e.g. TXN123456"
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white transition-all outline-none"
                    />
                    <FileText className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Payment Note</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Weekly pocket money"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white transition-all outline-none"
                  />
                </div>
              </div>

              {/* Upload Proof */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Proof of Payment (Recommended)</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                
                {proofUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border-2 border-slate-100 aspect-video group">
                    <img src={proofUrl} className="w-full h-full object-cover" alt="Proof" />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-tight flex items-center gap-2"
                      >
                        <Camera size={18} /> Change
                      </button>
                      <button 
                        type="button"
                        onClick={() => setProofUrl(null)}
                        className="p-3 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-tight flex items-center gap-2"
                      >
                        <X size={18} /> Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-2 hover:border-indigo-400 hover:bg-slate-50 transition-all cursor-pointer group disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="animate-spin text-indigo-600" size={32} />
                    ) : (
                      <Receipt className="text-slate-300 group-hover:text-indigo-400 transition-colors" size={32} />
                    )}
                    <span className="text-xs font-black text-slate-400 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">
                      {uploading ? 'Processing...' : 'Attach Receipt or Screenshot'}
                    </span>
                  </button>
                )}
              </div>

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-bold">
                  {formError}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 p-5 rounded-2xl font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] bg-indigo-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <Check size={20} />
                      Confirm Payment
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    <BetaFundingModal
      isOpen={showFunding}
      onClose={() => { setShowFunding(false); onClose(); }}
      variant="parent"
    />
    </>
  );
}
