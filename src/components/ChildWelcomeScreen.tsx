import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile, Household, Task } from '../types';
import { motion } from 'motion/react';
import { getFamilyColour } from '../lib/familyUtils';
import { ChevronRight, Loader2, Trophy, Sparkles } from 'lucide-react';

interface Props {
  profile: UserProfile;
  household: Household;
  onboardingTask: Task | null;   // null when no registration reward was set
  onDone: () => void;
}

export default function ChildWelcomeScreen({ profile, household, onboardingTask, onDone }: Props) {
  const [dismissing, setDismissing] = useState(false);
  const familyColour = getFamilyColour(household.familyColour || 'indigo');
  // Points come from the household setting — they are credited directly to the child's
  // totalPoints at registration, so no task submission or parent approval is needed.
  const pts = household.onboardingTaskPoints ?? onboardingTask?.pointValue ?? 0;
  const currency = household.currency || 'R';

  const handleDone = async () => {
    setDismissing(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { showChildOnboarding: false });
    } catch { /* non-critical */ }
    onDone();
  };

  return (
    <div className="min-h-screen flex flex-col overflow-hidden relative"
      style={{ background: `linear-gradient(135deg, ${familyColour}ee 0%, #059669cc 100%)` }}>

      {/* Decorative blobs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 bg-white" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-10 bg-white" />
      <div className="absolute top-1/3 right-8 w-20 h-20 rounded-full opacity-15 bg-white" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10 max-w-md mx-auto w-full">

        {/* Family logo / avatar */}
        <motion.div
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
          className="w-24 h-24 rounded-[2rem] bg-white/20 backdrop-blur border-4 border-white/40 flex items-center justify-center shadow-2xl mb-6 overflow-hidden"
        >
          {household.familyLogo
            ? <img src={household.familyLogo} className="w-full h-full object-cover" alt="Family logo" />
            : <span className="text-4xl">⚓</span>
          }
        </motion.div>

        {/* Main headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-center mb-8"
        >
          <p className="text-white/70 text-xs font-black uppercase tracking-widest mb-2">
            Welcome to {household.name}!
          </p>
          <h1 className="text-4xl font-black text-white leading-tight mb-3">
            Hey {profile.displayName?.split(' ')[0]}! 🎉
          </h1>
          <p className="text-white/80 font-medium leading-relaxed text-sm">
            You're officially part of the family on Home Anchor. Here's how to start earning rewards right away.
          </p>
        </motion.div>

        {/* Reward highlight — shown whenever a registration reward was configured */}
        {pts > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 20 }}
            className="w-full bg-white/15 backdrop-blur border border-white/30 rounded-3xl p-6 mb-6 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-2xl">🎁</span>
              <p className="text-white/80 text-xs font-black uppercase tracking-widest">Your welcome reward</p>
            </div>
            <p className="text-6xl font-black text-white leading-none mb-1">
              {currency}{pts}
            </p>
            <p className="text-white/70 text-sm font-medium">
              already in your wallet — go spend it! 🚀
            </p>
          </motion.div>
        )}

        {/* How it works — 3 steps */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="w-full space-y-3 mb-8"
        >
          {[
            {
              icon: pts > 0 ? '💰' : '✅',
              title: pts > 0 ? `${currency}${pts} is already in your wallet!` : 'Check your missions',
              desc: pts > 0
                ? `Your welcome reward has been added to your balance. Go to your wallet to see it!`
                : 'Your parent assigns missions — complete them to earn points.',
            },
            {
              icon: '📸',
              title: 'Submit proof when you\'re done',
              desc: 'Take a photo or mark it complete. Your parent reviews and approves.',
            },
            {
              icon: '🏆',
              title: 'Points hit your wallet instantly',
              desc: 'Cash out anytime — your balance is yours to keep.',
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="flex items-start gap-4 bg-white/10 backdrop-blur rounded-2xl px-4 py-3"
            >
              <span className="text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
              <div>
                <p className="text-white font-black text-sm leading-none mb-0.5">{item.title}</p>
                <p className="text-white/65 text-xs font-medium leading-snug">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          onClick={handleDone}
          disabled={dismissing}
          className="w-full py-5 bg-white font-black rounded-2xl shadow-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 text-base"
          style={{ color: familyColour }}
        >
          {dismissing
            ? <Loader2 size={20} className="animate-spin" />
            : pts > 0
              ? <><Trophy size={20} /> Show me my {currency}{pts} balance! <ChevronRight size={18} /></>
              : <><Sparkles size={20} /> Take me to my dashboard! <ChevronRight size={18} /></>
          }
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          className="text-white/40 text-[10px] font-bold uppercase tracking-widest mt-4 text-center"
        >
          Home Anchor · Earn real rewards at home
        </motion.p>
      </div>
    </div>
  );
}
