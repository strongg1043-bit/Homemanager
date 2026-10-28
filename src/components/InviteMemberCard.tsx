import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, setDoc } from 'firebase/firestore';
import { sendWelcomeEmail, sendChildInviteEmail } from '../lib/email';
import { UserPlus, Check, Loader2, Sparkles, Send, Shield, Star, Gift } from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  householdId: string;
  householdName: string;
  householdCode: string;
}

export default function InviteMemberCard({ householdId, householdName, householdCode }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'child' | 'parent'>('child');
  const [onboardingPoints, setOnboardingPoints] = useState(50);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [sentName, setSentName] = useState('');
  const [sentRole, setSentRole] = useState<'child' | 'parent'>('child');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;

    setStatus('sending');
    setErrorMsg('');
    try {
      // Guard: check whether this email already belongs to a member of this household
      const existingUserSnap = await getDocs(
        query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()), where('householdId', '==', householdId))
      );
      if (!existingUserSnap.empty) {
        setErrorMsg(`${email} is already a member of this household.`);
        setStatus('error');
        return;
      }

      // 1. Create a notification record in the household stream
      await addDoc(collection(db, 'households', householdId, 'notifications'), {
        householdId,
        recipientId: auth.currentUser?.uid,
        recipientRole: 'parent',
        type: 'invite_sent',
        title: `Invite sent to ${name}`,
        message: `A ${role} invite was sent to ${email}.`,
        emoji: '📩',
        read: false,
        createdAt: serverTimestamp(),
        invitedEmail: email,
        invitedName: name
      });

      // 2. For child invites: save the onboarding reward to the household, then send
      //    the specialised child invite email that prominently shows the reward.
      //    For parent invites: send the standard welcome email.
      if (role === 'child') {
        await updateDoc(doc(db, 'households', householdId), {
          onboardingTaskPoints: onboardingPoints
        });
        // Keep inviteCodes in sync so joining children can read the reward without household access
        await setDoc(doc(db, 'inviteCodes', householdCode), {
          householdId,
          householdName,
          onboardingTaskPoints: onboardingPoints,
        }, { merge: true });
        await sendChildInviteEmail(email, name, householdName, householdCode, onboardingPoints, householdName);
      } else {
        await sendWelcomeEmail(email, name, householdName, role, householdCode);
      }

      setSentName(name);
      setSentRole(role);
      setStatus('success');
      setEmail('');
      setName('');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (err) {
      console.error(err);
      setErrorMsg('Something went wrong. Please check your internet and try again.');
      setStatus('error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden h-full"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 opacity-50 transition-colors ${role === 'child' ? 'bg-emerald-50' : 'bg-indigo-50'}`} />
      
      <div className="relative z-10">
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${role === 'child' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <UserPlus size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 leading-none mb-1">Invite Family Member</h3>
            <p className="text-slate-500 font-medium text-sm">Grow your household team</p>
          </div>
        </div>

        <div className="flex gap-4 mb-6 p-1 bg-slate-100 rounded-2xl w-fit">
          <button 
            type="button"
            onClick={() => setRole('child')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'child' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
          >
            <Star size={14} /> Child
          </button>
          <button 
            type="button"
            onClick={() => setRole('parent')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'parent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
          >
            <Shield size={14} /> Parent
          </button>
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Name</label>
              <input 
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                placeholder={role === 'child' ? 'Alex' : 'Partner Name'}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Email</label>
              <input 
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                placeholder="email@example.com"
              />
            </div>
          </div>

          {/* Registration reward — only shown for child invites */}
          {role === 'child' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-0.5 shrink-0">
                  <Gift size={18} />
                </div>
                <div>
                  <p className="font-black text-emerald-900 text-sm leading-none mb-1">Registration Reward</p>
                  <p className="text-emerald-700 text-xs font-medium leading-snug">
                    When {name || 'your child'} registers and completes their first task, they'll earn this reward automatically. It's a great way to show them the system works!
                  </p>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1 block ml-1">Reward Amount (points)</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={onboardingPoints}
                  onChange={e => setOnboardingPoints(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-full px-4 py-3 bg-white border border-emerald-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-emerald-800 text-lg"
                />
                <p className="text-[10px] text-emerald-600 font-bold mt-1 ml-1 opacity-75">This amount will be prominently featured in the invite email</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'sending'}
            className={`w-full py-5 rounded-2xl font-black text-white flex items-center justify-center gap-3 transition-all shadow-xl
              ${status === 'success' ? 'bg-emerald-600' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-100'}
              ${status === 'sending' ? 'opacity-70 cursor-wait' : 'active:scale-95'}
            `}
          >
            {status === 'sending' ? (
              <Loader2 className="animate-spin" />
            ) : status === 'success' ? (
              <><Check size={20} /> Invitation Sent!</>
            ) : (
              <><Send size={20} /> Send Invite Email</>
            )}
          </button>
        </form>

        {status === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3"
          >
            <Sparkles className="text-emerald-500 mt-0.5 shrink-0" size={20} />
            <p className="text-emerald-800 text-xs font-bold leading-snug">
              Invite sent to {sentName}! The email includes a magic link and{sentRole === 'child' ? ` shows the ${onboardingPoints} pt registration reward — a great motivator to get them signed up!` : " one tap lands them on the app with the join code already filled in."}
            </p>
          </motion.div>
        )}

        {status === 'error' && (
          <p className="mt-4 text-rose-500 text-xs font-bold text-center">
            {errorMsg || 'Something went wrong. Please check your internet and try again.'}
          </p>
        )}
      </div>
    </motion.div>
  );
}
