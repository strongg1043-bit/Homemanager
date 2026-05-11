import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where, updateDoc, arrayUnion, writeBatch } from 'firebase/firestore';
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
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

        // Build the user profile doc — shared across all paths
        const userDocRef = doc(db, 'users', user.uid);
        const userProfile = {
          uid: user.uid,
          displayName: displayName.trim(),
          email: user.email,
          role: role,
          householdId: '', // filled below per path
          totalPoints: 0,
          createdAt: serverTimestamp(),
          profilePhoto: null,
          avatarColour: 'indigo',
          trustScore: 100,
          badges: []
        };

        if (parentAction === 'join') {
          // --- JOIN path (child or parent) ---
          // Look up the household first, before touching anything
          const q = query(collection(db, 'households'), where('inviteCode', '==', joinCode.toUpperCase()));
          const snap = await getDocs(q);
          if (snap.empty) throw new Error('Invalid invite code. Please check and try again.');
          const hDoc = snap.docs[0];
          householdId = hDoc.id;
          const householdData = hDoc.data();

          // Batch: add uid to household.members + create user doc atomically
          const batch = writeBatch(db);
          batch.update(doc(db, 'households', householdId), { members: arrayUnion(user.uid) });
          batch.set(userDocRef, { ...userProfile, householdId });
          await batch.commit();

          if (user.email) {
            sendWelcomeEmail(user.email, displayName, householdData.name || 'New Family', role);
          }

        } else if (parentAction === 'create') {
          // --- CREATE path (child or parent) ---
          const newHouseholdRef = doc(collection(db, 'households'));
          householdId = newHouseholdRef.id;
          const code = generateInviteCode();
          setInviteCode(code);

          const familyName = role === 'child' ? `${displayName}'s Family` : 'New Family';
          const familyMotto = role === 'child'
            ? 'Supporting each other every day!'
            : 'Teamwork makes the dream work!';

          // Batch: create household + user doc atomically — no orphan households on failure
          const batch = writeBatch(db);
          batch.set(newHouseholdRef, {
            id: householdId,
            name: familyName,
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
            familyMotto
          });
          batch.set(userDocRef, { ...userProfile, householdId });
          await batch.commit();

          if (user.email) {
            sendWelcomeEmail(user.email, displayName, familyName, role);
          }
        } else {
          // Fallback: no action selected — should not reach here due to UI guard
          await signOut(auth);
          throw new Error('Please select whether you are creating or joining a family.');
        }

        if (role === 'child' && !isLogin) {
          setStep('success');
        }
      }
    } catch (err: unknown) {
      // Sign out if auth user was created but batch failed, to avoid ghost accounts
      if (auth.currentUser) await signOut(auth).catch(() => {});
      // Map Firebase auth error codes to user-friendly messages instead of exposing raw SDK strings
      const code = (err as { code?: string }).code;
      const AUTH_ERRORS: Record<string, string> = {
        'auth/invalid-credential':      'Incorrect email or password. Please try again.',
        'auth/user-not-found':          'No account found with that email address.',
        'auth/wrong-password':          'Incorrect email or password. Please try again.',
        'auth/email-already-in-use':    'An account with this email already exists. Try signing in instead.',
        'auth/weak-password':           'Password must be at least 6 characters.',
        'auth/invalid-email':           'Please enter a valid email address.',
        'auth/too-many-requests':       'Too many failed attempts. Please wait a few minutes and try again.',
        'auth/network-request-failed':  'Network error. Please check your connection and try again.',
        'auth/user-disabled':           'This account has been disabled. Please contact support.',
      };
      const message = (code && AUTH_ERRORS[code])
        ?? (err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email address above, then click "Forgot password?".');
      return;
    }
    setResetLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        // Don't reveal whether the address exists — just show success to prevent enumeration
        setResetSent(true);
      } else {
        setError('Could not send reset email. Please try again.');
      }
    } finally {
      setResetLoading(false);
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

                  {role === 'child' && (
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setParentAction('create')}
                        className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${parentAction === 'create' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-50' : 'bg-white text-slate-500 border-slate-100'}`}
                      >
                        Start New Family
                      </button>
                      <button
                        type="button"
                        onClick={() => setParentAction('join')}
                        className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${parentAction === 'join' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-50' : 'bg-white text-slate-500 border-slate-100'}`}
                      >
                        Join Existing
                      </button>
                    </div>
                  )}

                  {parentAction === 'join' && (
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

              {resetSent && (
                <p className="text-emerald-600 text-xs font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                  ✓ If an account exists for that email, a password reset link has been sent. Check your inbox.
                </p>
              )}

              {isLogin && (
                <div className="text-right -mt-1">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetLoading}
                    className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {resetLoading ? 'Sending…' : 'Forgot password?'}
                  </button>
                </div>
              )}

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
