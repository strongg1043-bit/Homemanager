/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, deleteUser, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import Auth from './components/Auth';
import ParentDashboard from './components/ParentDashboard';
import ChildDashboard from './components/ChildDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, AlertTriangle } from 'lucide-react';

const LoadingSpinner = () => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
    <motion.div 
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
      className="text-indigo-600"
    >
      <Loader2 size={48} />
    </motion.div>
    <p className="text-slate-500 font-medium animate-pulse">Loading Home Anchor...</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    // Grace-period timer: onAuthStateChanged fires before the registration batch write
    // completes, so the profile snapshot may briefly return "doesn't exist". We hold
    // the loading spinner for up to 6 seconds before surfacing the "incomplete" state.
    let profileMissingTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      // Clear any pending "missing" timer when auth state changes
      if (profileMissingTimer) { clearTimeout(profileMissingTimer); profileMissingTimer = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
        setProfileError(null);
        setProfileLoading(true); // Stay in loading state until profile confirmed

        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          if (snap.exists()) {
            // Profile found — cancel any pending missing timer
            if (profileMissingTimer) { clearTimeout(profileMissingTimer); profileMissingTimer = null; }
            setProfile(snap.data() as UserProfile);
            setProfileLoading(false);
          } else {
            // Profile not found yet — could be mid-registration batch write.
            // Don't surface the error state immediately; wait for the grace period.
            if (!profileMissingTimer) {
              profileMissingTimer = setTimeout(() => {
                profileMissingTimer = null;
                setProfile(null);
                setProfileLoading(false);
              }, 6000); // 6-second window for the batch write to land
            }
          }
        }, (err) => {
          console.error('Profile listener error:', err);
          setProfileError(err.message || 'Could not load your profile.');
          setProfileLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        if (unsubProfile) { unsubProfile(); unsubProfile = null; }
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (profileMissingTimer) clearTimeout(profileMissingTimer);
    };
  }, []);

  if (profileLoading) {
    return <LoadingSpinner />;
  }

  // Authenticated but profile failed to load (e.g. Firestore permission error)
  if (user && profileError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-10 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Couldn't load your profile</h2>
            <p className="text-slate-500 text-sm font-medium">There was a problem reading your account data. Please sign out and sign back in.</p>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100"
          >
            Sign Out & Try Again
          </button>
        </div>
      </div>
    );
  }

  // Authenticated but no Firestore profile — account setup incomplete.
  // Offer to delete the orphaned Auth account so the user can re-register immediately.
  if (user && !profile) {
    const handleReregister = async () => {
      try {
        // deleteUser() works when the session is fresh (just registered).
        if (auth.currentUser) await deleteUser(auth.currentUser);
      } catch {
        // Session is stale (re-auth required) — fall back to a plain sign-out.
        await signOut(auth).catch(() => {});
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-10 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Account setup incomplete</h2>
            <p className="text-slate-500 text-sm font-medium">
              Your account wasn't fully set up. Click below to clear it so you can register fresh — your invite link will still work.
            </p>
          </div>
          <button
            onClick={handleReregister}
            className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100"
          >
            Clear & Register Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {!user ? (
        <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Auth />
        </motion.div>
      ) : profile?.role === 'child' ? (
        <motion.div key="child" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ChildDashboard profile={profile} />
        </motion.div>
      ) : profile?.role === 'parent' ? (
        <motion.div key="parent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ParentDashboard profile={profile} />
        </motion.div>
      ) : (
        <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Auth />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
