/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import Auth from './components/Auth';
import HouseholdSetup from './components/HouseholdSetup';
import ParentDashboard from './components/ParentDashboard';
import ChildDashboard from './components/ChildDashboard';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

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

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Fetch profile
        unsubProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snap) => {
          if (snap.exists()) {
            const profileData = snap.data() as UserProfile;
            
            // Safety check: ensure email matches or sync it
            if (!profileData.email && firebaseUser.email) {
              await updateDoc(doc(db, 'users', firebaseUser.uid), {
                email: firebaseUser.email
              });
            } else if (profileData.email && firebaseUser.email && profileData.email.toLowerCase() !== firebaseUser.email.toLowerCase()) {
              console.warn("Profile email mismatch:", profileData.email, firebaseUser.email);
            }

            setProfile(profileData);
            setProfileLoading(false);
          } else {
            // Check if we are already in the process of creating a profile to avoid loops
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                uid: firebaseUser.uid,
                displayName: firebaseUser.email?.split('@')[0] || 'User',
                email: firebaseUser.email,
                role: 'parent',
                householdId: '',
                totalPoints: 0,
                createdAt: serverTimestamp()
              });
            } catch (err) {
              console.error("Failed to create default profile:", err);
              setProfile(null);
              setProfileLoading(false);
            }
          }
        }, (err) => {
          console.error(err);
          setProfileLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        setProfileLoading(false);
        if (unsubProfile) unsubProfile();
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  if (!user && !profileLoading) {
    return <Auth />;
  }

  if (user && profileLoading) {
    return <LoadingSpinner />;
  }

  if (profileLoading) {
    return <LoadingSpinner />;
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
        <motion.div key="auth-fallback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Auth />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
