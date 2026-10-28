import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, collection, getDocs, query, where, limit, arrayUnion, writeBatch } from 'firebase/firestore';
import { Role } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Star, Shield, ArrowRight, Copy, Check, Sparkles,
  ClipboardCheck, Banknote, ShieldCheck, RefreshCw, Anchor,
} from 'lucide-react';
import { generateInviteCode } from '../lib/familyUtils';
import { sendWelcomeEmail } from '../lib/email';

// ── Brand colours ────────────────────────────────────────────────────────────
const NAVY  = '#1B3A5C';
const TEAL  = '#2E7D6B';
const AMBER = '#F5A35A';
const LINEN = '#F7F3EE';

// ── Landing panel ─────────────────────────────────────────────────────────────
const HIGHLIGHTS = [
  { icon: <ClipboardCheck size={16} />, colour: TEAL,  text: 'Mission-based tasks with clear KPIs and photo proof' },
  { icon: <Banknote       size={16} />, colour: AMBER, text: 'Points convert to real cash — settled by parents'      },
  { icon: <ShieldCheck    size={16} />, colour: TEAL,  text: 'Trust scores and audit trails for full accountability'  },
  { icon: <RefreshCw      size={16} />, colour: AMBER, text: 'Daily, weekly and monthly tasks reset automatically'    },
];

function LandingPanel() {
  return (
    <div
      className="lg:w-3/5 flex flex-col justify-center"
      style={{ backgroundColor: NAVY }}
    >
      <div className="px-10 py-14">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-12">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ backgroundColor: TEAL }}
          >
            <Anchor size={22} color="#fff" />
          </div>
          <span className="text-white font-black text-xl tracking-tight">Home Anchor</span>
        </div>

        {/* Headline */}
        <h1
          className="text-4xl lg:text-5xl font-black leading-tight mb-5"
          style={{ color: LINEN }}
        >
          Every home needs<br />
          <span style={{ color: AMBER }}>an anchor.</span>
        </h1>

        {/* One-liner */}
        <p className="text-base font-medium leading-relaxed mb-10" style={{ color: '#A8C4D4' }}>
          Turn chores into missions, reward effort with real points, and build
          accountability that lasts a lifetime.
        </p>

        {/* Four key highlights */}
        <div className="space-y-4 mb-12">
          {HIGHLIGHTS.map(({ icon, colour, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: colour + '22', color: colour }}
              >
                {icon}
              </div>
              <p className="text-sm font-medium" style={{ color: '#A8C4D4' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-xs font-medium" style={{ color: '#4A7A95' }}>
          Free · Built for real families · Independent developer
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
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
  // Recovers an error stashed by a previous Auth instance right before a forced
  // sign-out remounted this component — see the sessionStorage note in handleSubmit's catch.
  const [error, setError] = useState(() => {
    try {
      const stashed = sessionStorage.getItem('authError');
      if (stashed) sessionStorage.removeItem('authError');
      return stashed ?? '';
    } catch { return ''; }
  });
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Pre-fill join code AND email from magic invite link (?code=XXXX&email=child@x.com)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const emailParam = params.get('email');
    if (code) {
      setIsLogin(false);
      setRole('child');
      setStep('form');
      setParentAction('join');
      setJoinCode(code.toUpperCase());
      if (emailParam) setEmail(emailParam);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!role) throw new Error('Please select a role');
        if (!parentAction) throw new Error('Please select whether you are creating or joining a family.');

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        let householdId = '';

        const userDocRef = doc(db, 'users', user.uid);
        const userProfile = {
          uid: user.uid,
          displayName: displayName.trim(),
          email: user.email,
          role: role,
          householdId: '',
          totalPoints: 0,
          createdAt: serverTimestamp(),
          profilePhoto: null,
          avatarColour: '#1B3A5C',
          trustScore: 100,
          badges: [],
        };

        if (parentAction === 'join') {
          // Primary: fast single-doc lookup via inviteCodes collection (no enumeration risk)
          // Fallback: limit(1) query for households created before the inviteCodes migration
          // Reads here require isSignedIn() per firestore.rules (anti-enumeration), which is
          // why the lookup has to happen after account creation rather than before it.
          type InviteLookup = { householdId: string; householdName?: string; onboardingTaskPoints?: number };
          let inviteLookup: InviteLookup | null = null;

          const inviteSnap = await getDoc(doc(db, 'inviteCodes', joinCode.toUpperCase()));
          if (inviteSnap.exists()) {
            inviteLookup = inviteSnap.data() as InviteLookup;
          } else {
            const q = query(collection(db, 'households'), where('inviteCode', '==', joinCode.toUpperCase()), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
              const hd = snap.docs[0].data();
              inviteLookup = { householdId: snap.docs[0].id, householdName: hd.name, onboardingTaskPoints: hd.onboardingTaskPoints };
            }
          }

          if (!inviteLookup) throw new Error('Invalid invite code. Please check and try again.');
          householdId = inviteLookup.householdId;
          const householdData = {
            name: inviteLookup.householdName || 'Your Family',
            onboardingTaskPoints: inviteLookup.onboardingTaskPoints,
          };

          // Credit the registration reward directly into totalPoints so it appears
          // in the child's wallet immediately — no task submission or parent approval needed.
          const onboardingPts = role === 'child' && typeof householdData.onboardingTaskPoints === 'number'
            ? householdData.onboardingTaskPoints : 0;

          const batch = writeBatch(db);
          batch.update(doc(db, 'households', householdId), { members: arrayUnion(user.uid) });
          // Set showChildOnboarding so ChildDashboard shows the welcome screen on first login
          const extraFlags = role === 'child' ? { showChildOnboarding: true } : {};
          batch.set(userDocRef, {
            ...userProfile,
            householdId,
            totalPoints: onboardingPts, // ← credited immediately; overrides the 0 in userProfile
            ...extraFlags,
          });
          await batch.commit();

          if (user.email) {
            sendWelcomeEmail(user.email, displayName, householdData.name || 'New Family', role);
          }
        } else if (parentAction === 'create') {
          const newHouseholdRef = doc(collection(db, 'households'));
          householdId = newHouseholdRef.id;
          const code = generateInviteCode();
          setInviteCode(code);

          const familyName = role === 'child' ? `${displayName}'s Family` : 'New Family';
          const familyMotto = role === 'child'
            ? 'Supporting each other every day!'
            : 'Teamwork makes the dream work!';

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
            familyMotto,
          });
          batch.set(userDocRef, { ...userProfile, householdId, showOnboarding: true });
          // Register invite code in the secure lookup collection
          batch.set(doc(db, 'inviteCodes', code), {
            householdId,
            householdName: familyName,
            onboardingTaskPoints: 0,
          });
          await batch.commit();

          if (user.email) {
            sendWelcomeEmail(user.email, displayName, familyName, role);
          }
        }

        if (role === 'child' && !isLogin) {
          setStep('success');
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      const AUTH_ERRORS: Record<string, string> = {
        'auth/invalid-credential':     'Incorrect email or password. Please try again.',
        'auth/user-not-found':         'No account found with that email address.',
        'auth/wrong-password':         'Incorrect email or password. Please try again.',
        'auth/email-already-in-use':   'An account with this email already exists. Try signing in instead.',
        'auth/weak-password':          'Password must be at least 6 characters.',
        'auth/invalid-email':          'Please enter a valid email address.',
        'auth/too-many-requests':      'Too many failed attempts. Please wait a few minutes and try again.',
        'auth/network-request-failed': 'Network error. Please check your connection and try again.',
        'auth/user-disabled':          'This account has been disabled. Please contact support.',
      };
      const message = (code && AUTH_ERRORS[code]) ??
        (err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.');

      // The instant createUserWithEmailAndPassword succeeds, App.tsx's onAuthStateChanged
      // swaps this whole form out for a loading screen — so if household setup then fails
      // (bad invite code, etc.), this component is unmounted and setError below is a no-op.
      // Stash the message in sessionStorage so the fresh Auth instance that mounts after
      // sign-out can recover and show it, and delete the half-created account rather than
      // just signing out of it, so no orphaned Auth user (with no Firestore profile) is left.
      try { sessionStorage.setItem('authError', message); } catch { /* ignore */ }
      if (auth.currentUser && !isLogin) {
        await deleteUser(auth.currentUser).catch(() => signOut(auth).catch(() => {}));
      } else if (auth.currentUser) {
        await signOut(auth).catch(() => {});
      }

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

  // ── Success screen ───────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: LINEN }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center"
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: TEAL + '22', color: TEAL }}
          >
            <Sparkles size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Welcome!</h2>
          <p className="text-slate-500 mb-8 font-medium">
            Your family space is ready. Share this code with your parent to complete setup.
          </p>

          <div className="p-6 rounded-2xl border-2 mb-8 relative" style={{ backgroundColor: LINEN, borderColor: TEAL + '44' }}>
            <div className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: TEAL }}>
              Invite Code
            </div>
            <div className="text-4xl font-black tracking-widest text-slate-800">{inviteCode}</div>
            <button
              onClick={copyCode}
              className="absolute top-4 right-4 p-2 text-slate-400 transition-colors"
              style={{ color: copied ? TEAL : undefined }}
            >
              {copied ? <Check size={20} /> : <Copy size={20} />}
            </button>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 text-white font-black rounded-2xl shadow-lg transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: TEAL }}
          >
            Go to my Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main layout: landing left + auth right ───────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left: landing content ── */}
      <LandingPanel />

      {/* ── Right: auth form ── */}
      <div className="lg:w-2/5 lg:sticky lg:top-0 lg:h-screen flex items-center justify-center overflow-y-auto bg-white p-8">
        <div className="w-full max-w-sm">

          {/* Logo mark */}
          <div className="flex justify-center mb-6">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ backgroundColor: NAVY }}
            >
              <Anchor size={28} color="#fff" />
            </div>
          </div>

          <h2 className="text-2xl font-black text-center mb-1" style={{ color: NAVY }}>
            Home Anchor
          </h2>
          <p className="text-slate-400 text-center text-sm font-medium mb-8">
            {isLogin ? 'Welcome back — sign in to continue' : 'Start your family journey'}
          </p>

          {/* Sign In / Sign Up toggle */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            <button
              onClick={() => { setIsLogin(true); setStep('form'); }}
              className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                isLogin ? 'bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
              style={isLogin ? { color: NAVY } : {}}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsLogin(false); setStep('role'); }}
              className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                !isLogin ? 'bg-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
              style={!isLogin ? { color: TEAL } : {}}
            >
              Sign Up
            </button>
          </div>

          <AnimatePresence mode="wait">
            {/* ── Role selection ── */}
            {!isLogin && step === 'role' ? (
              <motion.div
                key="role-select"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h3 className="text-lg font-bold text-slate-800 text-center mb-4">Who are you?</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setRole('child'); setStep('form'); }}
                    className="group p-5 rounded-3xl border-2 border-transparent transition-all text-center"
                    style={{ backgroundColor: TEAL + '11' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = TEAL)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm mx-auto mb-3 group-hover:scale-110 transition-transform"
                      style={{ backgroundColor: '#fff', color: TEAL }}
                    >
                      <Star size={28} />
                    </div>
                    <div className="font-black text-xs uppercase tracking-tight mb-0.5" style={{ color: TEAL }}>
                      Empowered
                    </div>
                    <div className="font-bold text-slate-900 text-sm">I'm a Child</div>
                  </button>

                  <button
                    onClick={() => { setRole('parent'); setStep('form'); }}
                    className="group p-5 rounded-3xl border-2 border-transparent transition-all text-center"
                    style={{ backgroundColor: NAVY + '0D' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = NAVY)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm mx-auto mb-3 group-hover:scale-110 transition-transform"
                      style={{ backgroundColor: '#fff', color: NAVY }}
                    >
                      <Shield size={28} />
                    </div>
                    <div className="font-black text-xs uppercase tracking-tight mb-0.5" style={{ color: NAVY }}>
                      Anchor
                    </div>
                    <div className="font-bold text-slate-900 text-sm">I'm a Parent</div>
                  </button>
                </div>
              </motion.div>

            ) : (
              /* ── Auth form ── */
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
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Your Name</label>
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-current font-bold transition-all"
                        placeholder="e.g. Alex"
                      />
                    </div>

                    {role === 'parent' && (
                      <div className="flex gap-3">
                        {['create', 'join'].map(action => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => setParentAction(action as 'create' | 'join')}
                            className="flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all"
                            style={
                              parentAction === action
                                ? { backgroundColor: NAVY, color: '#fff', borderColor: NAVY }
                                : { backgroundColor: '#fff', color: '#94a3b8', borderColor: '#f1f5f9' }
                            }
                          >
                            {action === 'create' ? 'Create Family' : 'Join Family'}
                          </button>
                        ))}
                      </div>
                    )}

                    {role === 'child' && (
                      <div className="flex gap-3">
                        {(['create', 'join'] as const).map(action => (
                          <button
                            key={action}
                            type="button"
                            onClick={() => setParentAction(action)}
                            className="flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all"
                            style={
                              parentAction === action
                                ? { backgroundColor: TEAL, color: '#fff', borderColor: TEAL }
                                : { backgroundColor: '#fff', color: '#94a3b8', borderColor: '#f1f5f9' }
                            }
                          >
                            {action === 'create' ? 'Start New Family' : 'Join Existing'}
                          </button>
                        ))}
                      </div>
                    )}

                    {parentAction === 'join' && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Invite Code</label>
                        <input
                          type="text"
                          required
                          value={joinCode}
                          onChange={e => setJoinCode(e.target.value.toUpperCase())}
                          maxLength={6}
                          className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none font-bold tracking-widest transition-all"
                          placeholder="ABCDEF"
                        />
                      </motion.div>
                    )}
                  </>
                )}

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none font-bold transition-all"
                    placeholder="name@email.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none font-bold transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p className="text-red-500 text-xs font-bold bg-red-50 p-3 rounded-xl border border-red-100">
                    {error}
                  </p>
                )}

                {resetSent && (
                  <p className="text-xs font-bold p-3 rounded-xl border" style={{ color: TEAL, backgroundColor: TEAL + '11', borderColor: TEAL + '33' }}>
                    ✓ If an account exists for that email, a reset link has been sent. Check your inbox.
                  </p>
                )}

                {isLogin && (
                  <div className="text-right -mt-1">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      className="text-xs font-bold transition-colors disabled:opacity-50"
                      style={{ color: TEAL }}
                    >
                      {resetLoading ? 'Sending…' : 'Forgot password?'}
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || (!isLogin && !!role && !parentAction)}
                  className="w-full py-4 mt-2 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ backgroundColor: isLogin ? NAVY : TEAL }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{isLogin ? 'Sign In' : 'Sign Up Now'}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                {!isLogin && (
                  <p className="text-center text-[10px] text-slate-400 font-medium -mt-1">
                    By signing up, you agree to our{' '}
                    <a href="https://home-anchor.org/terms.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Terms</a>
                    {' '}and{' '}
                    <a href="https://home-anchor.org/privacy.html" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Privacy Policy</a>.
                  </p>
                )}

                {!isLogin && (
                  <button
                    type="button"
                    onClick={() => setStep('role')}
                    className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
                  >
                    ← Change Role
                  </button>
                )}
              </motion.form>
            )}
          </AnimatePresence>

          {/* Bottom note */}
          <p className="text-center text-[10px] text-slate-300 font-medium mt-8 uppercase tracking-widest">
            Free · Secure · Built for families
          </p>
        </div>
      </div>
    </div>
  );
}
