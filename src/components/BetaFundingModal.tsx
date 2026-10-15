import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Heart, Copy, Check, Sparkles } from 'lucide-react';
import { recordDonationEvent } from '../lib/analytics';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  variant: 'parent' | 'child';
  childName?: string;
}

const BANK_DETAILS = [
  { label: 'Account Holder', value: 'Home Anchor' },
  { label: 'Bank', value: 'Capitec Bank, South Africa' },
  { label: 'Account Number', value: '2541543057' },
  { label: 'Branch Code', value: '470010' },
  { label: 'SWIFT / BIC', value: 'CABLZAJJ' },
];

export default function BetaFundingModal({ isOpen, onClose, variant, childName }: Props) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Track impression once per open
  useEffect(() => {
    if (isOpen) recordDonationEvent('impression', variant);
  }, [isOpen, variant]);

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
    recordDonationEvent('field_copied', variant);
  };

  const copyAll = () => {
    const text = BANK_DETAILS.map(d => `${d.label}: ${d.value}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedField('all');
    setTimeout(() => setCopiedField(null), 2000);
    recordDonationEvent('all_copied', variant);
  };

  const handleDismiss = () => {
    recordDonationEvent('dismissed', variant);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
          />

          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            {variant === 'parent' ? (
              <ParentVariant copiedField={copiedField} copy={copy} copyAll={copyAll} onClose={handleDismiss} />
            ) : (
              <ChildVariant childName={childName} onClose={handleDismiss} />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Parent variant ─────────────────────────────────────────────────────────────
function ParentVariant({ copiedField, copy, copyAll, onClose }: {
  copiedField: string | null;
  copy: (v: string, l: string) => void;
  copyAll: () => void;
  onClose: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const handleToggleDetails = () => {
    if (!showDetails) recordDonationEvent('details_expanded', 'parent');
    setShowDetails(d => !d);
  };

  return (
    <>
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-8 text-white relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Heart size={22} className="text-white" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200">Early Access</div>
            <h2 className="text-xl font-black leading-tight">Beta Version</h2>
          </div>
        </div>
        <p className="text-indigo-100 text-sm font-medium leading-relaxed">
          Home Anchor is built by an independent developer, for real families.
          There's no corporate backing — just a belief that family accountability
          shouldn't cost a fortune.
        </p>
      </div>

      {/* Body */}
      <div className="p-8 space-y-6">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
          <p className="text-slate-700 font-medium text-sm leading-relaxed">
            If Home Anchor is working for your family — if it's building habits,
            rewarding effort, and making life a little more organised —
            <strong className="text-slate-900"> please consider a small contribution</strong> to
            help keep the service free and growing.
          </p>
        </div>

        {/* Donate CTA */}
        <div>
          <button
            onClick={handleToggleDetails}
            className="w-full flex items-center justify-between px-5 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100"
          >
            <span className="flex items-center gap-2"><Heart size={16} /> Support Home Anchor</span>
            <span className="text-indigo-300 text-xs">{showDetails ? 'Hide details' : 'Bank details'}</span>
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-3 bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
                  {/* International note */}
                  <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                      International wire transfers use SWIFT/BIC · Local SA transfers use Branch Code
                    </p>
                  </div>

                  {BANK_DETAILS.map((detail) => (
                    <div
                      key={detail.label}
                      className="flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-white transition-colors"
                    >
                      <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{detail.label}</p>
                        <p className="font-black text-slate-900 font-mono text-sm">{detail.value}</p>
                      </div>
                      <button
                        onClick={() => copy(detail.value, detail.label)}
                        className={`p-2 rounded-xl transition-colors ${copiedField === detail.label ? 'bg-emerald-100 text-emerald-600' : 'text-slate-300 hover:text-indigo-600 hover:bg-indigo-50'}`}
                      >
                        {copiedField === detail.label ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  ))}

                  <div className="px-5 py-3">
                    <button
                      onClick={copyAll}
                      className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${copiedField === 'all' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'}`}
                    >
                      {copiedField === 'all' ? '✓ Copied all details' : 'Copy all details'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="w-full py-3 text-slate-400 hover:text-slate-600 font-black text-xs uppercase tracking-widest transition-colors"
        >
          Maybe later
        </button>
      </div>
    </>
  );
}

// ── Child variant ──────────────────────────────────────────────────────────────
function ChildVariant({ childName, onClose }: {
  childName?: string;
  onClose: () => void;
}) {
  return (
    <>
      {/* Header — fun and warm */}
      <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-8 text-white relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>
        <div className="text-5xl mb-3">🎉</div>
        <h2 className="text-2xl font-black leading-tight">
          Nice work, {childName || 'champion'}!
        </h2>
        <p className="text-emerald-100 text-sm font-medium mt-2">
          You just cashed in your hard-earned points. That's real effort — be proud of it!
        </p>
      </div>

      {/* Body */}
      <div className="p-8 space-y-5">
        {/* The ask — simple, honest, age-appropriate */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-emerald-600" />
            <p className="font-black text-emerald-800 text-sm">Quick question for you...</p>
          </div>
          <p className="text-slate-700 font-medium text-sm leading-relaxed">
            Is Home Anchor actually helping you? Are you earning more, doing your chores,
            and feeling good about it?
          </p>
          <p className="text-slate-600 text-sm leading-relaxed">
            Home Anchor is <strong>free</strong> — and we want to keep it that way.
            But to do that, we need support from families like yours.
          </p>
          <p className="text-slate-700 text-sm font-bold">
            💬 Ask your parent if they can support Home Anchor. It keeps the lights on for you and every other family using it! 🙌
          </p>
        </div>

        {/* Simple footer note */}
        <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          Early Beta · Built with ❤️ for families
        </p>

        <button
          onClick={onClose}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-sm uppercase tracking-widest transition-all shadow-lg shadow-emerald-100"
        >
          Got it — thanks! 🙌
        </button>
      </div>
    </>
  );
}
