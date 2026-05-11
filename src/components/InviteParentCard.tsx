import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { sendParentInviteEmail } from '../lib/email';

interface InviteParentCardProps {
  childName: string;
  childUid: string;
  householdId?: string;
  householdCode?: string;
  householdName?: string;
  initialEmail?: string;
  initialCode?: string;
  isOrphan?: boolean;
}

export default function InviteParentCard({ 
  childName, 
  childUid, 
  householdId, 
  householdCode, 
  householdName,
  initialEmail = '',
  initialCode = '',
  isOrphan = false
}: InviteParentCardProps) {
  const [email, setEmail] = useState(initialEmail);
  const [inputCode, setInputCode] = useState(initialCode || householdCode || '');
  const [status, setStatus] = useState<null | 'sending' | 'success' | 'error' | 'invalid' | 'invalid_code'>(null);

  const sendNudge = async () => {
    if (!email || !email.includes('@')) {
      setStatus('invalid');
      return;
    }
    if (isOrphan && (!inputCode || inputCode.length < 4)) {
      setStatus('invalid_code');
      return;
    }

    setStatus('sending');
    try {
      let activeHouseholdId = householdId;
      let activeHouseholdCode = householdCode || inputCode;
      let activeHouseholdName = householdName || 'Family';

      // 1. If orphan, join the household first
      if (isOrphan && inputCode) {
        const q = query(collection(db, 'households'), where('inviteCode', '==', inputCode.trim().toUpperCase()));
        const snap = await getDocs(q);
        if (snap.empty) {
          setStatus('invalid_code');
          return;
        }
        const hDoc = snap.docs[0];
        const hData = hDoc.data();
        activeHouseholdId = hDoc.id;
        activeHouseholdCode = hData.inviteCode;
        activeHouseholdName = hData.name;

        // Join household
        await updateDoc(doc(db, 'households', activeHouseholdId), {
          members: arrayUnion(childUid)
        });
        await updateDoc(doc(db, 'users', childUid), {
          householdId: activeHouseholdId
        });
      }

      if (!activeHouseholdId) throw new Error('No household ID');

      // 2. Internal Notification
      await addDoc(collection(db, 'notifications'), {
        householdId: activeHouseholdId,
        recipientRole: 'parent',
        type: 'invite_parent',
        title: '💸 No more swindling me!',
        message: `${childName} is calling you out! They've been grinding on HomeManager and want you to join officially. Use household code: ${activeHouseholdCode}`,
        emoji: '🚀',
        read: false,
        createdAt: serverTimestamp(),
        invitedEmail: email,
        fromChildId: childUid,
        fromChildName: childName,
        householdCode: activeHouseholdCode,
      });

      // 3. Real Email Trigger
      sendParentInviteEmail(email, childName, activeHouseholdCode, activeHouseholdName);

      setStatus('success');
      
      // If we joined, we might want to refresh. ChildDashboard usually handles this via onSnapshot.
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div className="rounded-[2.5rem] overflow-hidden shadow-2xl shadow-indigo-100 mx-0 mb-8 border border-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-950 via-indigo-800 to-indigo-600 p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="text-5xl mb-4">💸</div>
        <h3 className="text-white font-black text-2xl leading-tight mb-3">
          No more swindling me<br />out of my hard-earned cash!
        </h3>
        <p className="text-indigo-100/80 text-sm font-semibold leading-relaxed max-w-sm">
          Hey, I'm already working hard over here 💪<br />
          Join the app and see for yourself, parent!
        </p>
      </div>

      {/* Body */}
      <div className="bg-white p-8">
        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4">
          📨 Send a nudge to your parent
        </p>

        {/* Witty message preview */}
        <div className="bg-slate-50 rounded-[1.5rem] p-5 mb-6 border border-slate-100 relative group">
          <div className="absolute -top-3 -right-3 bg-white shadow-sm border border-slate-100 rounded-full p-2 text-xs">💬</div>
          <p className="text-sm text-slate-600 font-medium italic leading-relaxed">
            "Yo! I've been grinding away on HomeManager, earning points like a legend.
            Time to stop the under-the-table deals and make it official."
          </p>
        </div>

        {/* Household code */}
        <div className={`bg-amber-50 border rounded-2xl p-5 mb-6 transition-colors ${status === 'invalid_code' ? 'border-rose-300 bg-rose-50' : 'border-amber-100'}`}>
          <div className="flex items-center gap-4">
            <span className="text-3xl">🔑</span>
            <div className="flex-1">
              <div className={`text-[10px] font-black uppercase tracking-widest mb-1 ${status === 'invalid_code' ? 'text-rose-600' : 'text-amber-800'}`}>
                {isOrphan ? 'Enter Household Code to Join' : 'Household Code'}
              </div>
              {isOrphan ? (
                <input 
                  type="text"
                  value={inputCode}
                  onChange={e => {
                    setInputCode(e.target.value.toUpperCase());
                    if (status === 'invalid_code') setStatus(null);
                  }}
                  placeholder="ABCDEF"
                  className="w-full bg-transparent text-3xl font-black text-indigo-900 tracking-widest font-mono outline-none placeholder:text-indigo-200"
                />
              ) : (
                <div className="text-3xl font-black text-indigo-900 tracking-widest font-mono">
                  {householdCode || '------'}
                </div>
              )}
            </div>
          </div>
          {status === 'invalid_code' && (
            <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2 px-1">
              ⚠️ Invalid or missing code!
            </p>
          )}
        </div>

        {/* Email input */}
        <div className="mb-6">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">
            Parent's Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => {
                setEmail(e.target.value);
                if (status === 'invalid') setStatus(null);
            }}
            placeholder="dad@work.com"
            className={`w-full px-5 py-4 rounded-2xl border-2 outline-none text-base font-bold transition-all
                       ${status === 'invalid' 
                         ? 'border-rose-200 bg-rose-50 text-rose-900 placeholder:text-rose-300' 
                         : 'border-slate-100 bg-slate-50 text-slate-800 focus:border-indigo-500 focus:bg-white'}`}
          />
          {status === 'invalid' && (
            <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest mt-2 px-1">
              ⚠️ Enter a valid parent email first!
            </p>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={sendNudge}
          disabled={status === 'sending' || status === 'success'}
          className={`w-full py-5 rounded-2xl font-black text-white text-sm uppercase tracking-[0.1em]
                      transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl
                      ${status === 'success' 
                        ? 'bg-green-600 shadow-green-100' 
                        : status === 'sending'
                          ? 'bg-indigo-400 cursor-wait'
                          : 'bg-indigo-600 hover:bg-slate-900 shadow-indigo-100 hover:shadow-slate-200'
                      }`}
        >
          {status === 'sending' && (isOrphan ? '⏳ Joining & Firing...' : '⏳ Firing the nudge...')}
          {status === 'success' && (isOrphan ? '✅ Joined & Sent!' : '✅ Nudge Fired!')}
          {(status === null || status === 'invalid' || status === 'invalid_code' || status === 'error') && (isOrphan ? '🚀 Join & Nudge' : '🚀 Send the Nudge')}
        </button>

        {status === 'success' && (
          <div className="mt-4 p-4 bg-green-50 rounded-2xl text-center border border-green-100">
            <p className="text-green-700 text-xs font-bold">
              ✅ Nudge sent to {email}! <br/>Tell them to check their inbox.
            </p>
          </div>
        )}
        {status === 'error' && (
          <div className="mt-4 p-4 bg-rose-50 rounded-2xl text-center border border-rose-100">
            <p className="text-rose-600 text-xs font-bold uppercase tracking-widest">
              ❌ Connection error. Try again!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
