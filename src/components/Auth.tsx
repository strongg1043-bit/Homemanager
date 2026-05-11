import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where, updateDoc, arrayUnion } from 'firebase/firestore';
import { Role } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Layout, LogIn, UserPlus, Star, Shield, ArrowRight, Copy, Check, Sparkles } from 'lucide-react';
import { generateInviteCode } from '../lib/familyUtils';
import { sendWelcomeEmail } from '../lib/email';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'role' | 'form' | 'success'>('role');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [parentAction, setParentAction] = useState<'create' | 'join' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!role) throw new Error('Please select a role');
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        let householdId = '';

        if (role === 'child') {
          // Automated household creation for children
          const newHouseholdRef = doc(collection(db, 'households'));
          householdId = newHouseholdRef.id;
          const code = generateInviteCode();
          setInviteCode(code);

          await setDoc(newHouseholdRef, {
            id: householdId,
            name: `${displayName}'s Family`,
            createdBy: user.uid,
            members: [user.uid],
            rewardStore: [],
            currency: 'R',
            currencyName: 'Points',
            cashOutEnabled: true,
            minCashOut: 100,
            createdAt: serverTimestamp(),
            inviteCode: code,
            familyColour: 'indigo',
            familyLogo: null,
            familyMotto: 'Supporting each other every day!'
          });
          
          if (user.email) {
            sendWelcomeEmail(user.email, displayName, `${displayName}'s Family`, role);
          }
        } else if (role === 'parent' && parentAction === 'join') {
          // Join existing household via code
          const q = query(collection(db, 'households'), where('inviteCode', '==', joinCode.toUpperCase()));
          const snap = await getDocs(q);
          if (snap.empty) throw new Error('Invalid invite code');
          const hDoc = snap.docs[0];
          householdId = hDoc.id;
          const householdData = hDoc.data();
          await updateDoc(doc(db, 'households', householdId), {
            members: arrayUnion(user.uid)
          });
          
          if (user.email) {
            sendWelcomeEmail(user.email, displayName, householdData.name || 'New Family', role);
          }
        } else if (role === 'parent' && parentAction === 'create') {
          // Parent creates household
          const newHouseholdRef = doc(collection(db, 'households'));
          householdId = newHouseholdRef.id;
          const code = generateInviteCode();
          setInviteCode(code);
          await setDoc(newHouseholdRef, {
            id: householdId,
            name: 'New Family',
            createdBy: user.uid,
            members: [user.uid],
            rewardStore: [],
            currency: 'R',
            currencyName: 'Points',
            cashOutEnabled: true,
            minCashOut: 100,
            createdAt: serverTimestamp(),
            inviteCode: code,
            familyColour: 'indigo',
            familyLogo: null,
            familyMotto: 'Teamwork makes the dream work!'
          });

          if (user.email) {
            sendWelcomeEmail(user.email, displayName, 'New Family', role);
          }
        }

        try {
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            displayName: displayName.trim(),
            email: user.email,
            role: role,
            householdId: householdId,
            totalPoints: 0,
            createdAt: serverTimestamp(),
            profilePhoto: null,
            avatarColour: 'indigo',
            trustScore: 100,
            badges: []
          });
          
          if (role === 'child' && !isLogin) {
            setStep('success');
          }
        } catch (setDocErr) {
          await signOut(auth);
          throw new Error('Account created but profile setup failed. Please try again.');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-emerald-50">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Welcome!</h2>
          <p className="text-slate-500 mb-8 font-medium">Your family space is ready. Share this code with your parent to complete setup.</p>
          
          <div className="bg-slate-50 p-6 rounded-2xl border-2 border-emerald-100 mb-8 relative">
            <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Invite Code</div>
            <div className="text-4xl font-black tracking-widest text-slate-800">{inviteCode}</div>
            <button 
              onClick={copyCode}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-emerald-600 transition-colors"
            >
              {copied ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-100 hover:scale-105 transition-transform"
          >
            Go to my Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-100 rounded-full blur-3xl -mr-32 -mt-32 opacity-50" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-100 rounded-full blur-3xl -ml-32 -mb-32 opacity-50" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-200 p-8 relative z-10"
      >
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
            <Layout size={32} />
          </div>
        </div>
        
        <h1 className="text-3xl font-black text-slate-900 text-center mb-1">HomeManager</h1>
        <p className="text-slate-500 text-center mb-8 font-medium">Empowering family teamwork</p>

        <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
          <button
            onClick={() => { setIsLogin(true); setStep('form'); }}
            className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
              isLogin ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setIsLogin(false); setStep('role'); }}
            className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
              !isLogin ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Sign Up
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!isLogin && step === 'role' ? (
            <motion.div 
              key="role-select"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-bold text-slate-800 text-center mb-6">Who are you?</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => { setRole('child'); setStep('form'); }}
                  className="group p-6 bg-emerald-50 rounded-3xl border-2 border-transparent hover:border-emerald-500 transition-all text-center"
                >
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Star size={32} />
                  </div>
                  <div className="font-black text-emerald-800 uppercase tracking-tight text-xs mb-1">Empowered</div>
                  <div className="font-bold text-slate-900">I'm a Child</div>
                </button>
                <button
                  onClick={() => { setRole('parent'); setStep('form'); }}
                  className="group p-6 bg-indigo-50 rounded-3xl border-2 border-transparent hover:border-indigo-500 transition-all text-center"
                >
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Shield size={32} />
                  </div>
                  <div className="font-black text-indigo-800 uppercase tracking-tight text-xs mb-1">Manager</div>
                  <div className="font-bold text-slate-900">I'm a Parent</div>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.form 
              key="form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleSubmit} 
              className="space-y-4"
            >
              {!isLogin && (
                <>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Your Name</label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold"
                      placeholder="e.g. Alex"
                    />
                  </div>
                  
                  {role === 'parent' && (
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setParentAction('create')}
                        className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${parentAction === 'create' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border-slate-100'}`}
                      >
                        Create Family
                      </button>
                      <button
                        type="button"
                        onClick={() => setParentAction('join')}
                        className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${parentAction === 'join' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border-slate-100'}`}
                      >
                        Join Family
                      </button>
                    </div>
                  )}

                  {role === 'parent' && parentAction === 'join' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Invite Code</label>
                      <input
                        type="text"
                        required
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold tracking-widest"
                        placeholder="ABCDEF"
                      />
                    </motion.div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold"
                  placeholder="name@email.com"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

              <button
                type="submit"
                disabled={loading || (!isLogin && role === 'parent' && !parentAction)}
                className={`w-full py-4 mt-4 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg ${
                  isLogin ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{isLogin ? 'Sign In' : 'Sign Up Now'}</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>

              {!isLogin && (
                <button 
                  type="button"
                  onClick={() => setStep('role')}
                  className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
                >
                  Change Role
                </button>
              )}
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
