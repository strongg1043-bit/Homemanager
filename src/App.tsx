/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
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
    <p className="text-slate-500 font-medium animate-pulse">Loading HomeManager...</p>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setProfileError(null);

        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          } else {
            // Authenticated but no Firestore profile — account is incomplete
            setProfile(null);
          }
          setProfileLoading(false);
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
        if (unsubProfile) unsubProfile();
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
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

  // Authenticated but no Firestore profile — account setup incomplete
  if (user && !profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-10 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Account setup incomplete</h2>
            <p className="text-slate-500 text-sm font-medium">Your account exists but your family profile wasn't fully set up. Please sign out and register again.</p>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100"
          >
            Sign Out & Register Again
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
