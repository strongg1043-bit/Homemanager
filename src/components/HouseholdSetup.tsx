import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, setDoc, collection, query, where, getDocs, arrayUnion } from 'firebase/firestore';
import { Household, UserProfile } from '../types';
import { motion } from 'motion/react';
import { Sparkles, Camera, Check, Palette, Type, Save, Loader2, X, Plus, Home } from 'lucide-react';
import { compressToBase64Profile } from '../lib/imageUtils';
import { COLOUR_OPTIONS, getFamilyColour, generateInviteCode } from '../lib/familyUtils';

interface Props {
  profile: UserProfile;
  isEditing?: boolean;
  existingData?: Household;
  onComplete?: () => void;
}

export default function HouseholdSetup({ profile, isEditing = false, existingData, onComplete }: Props) {
  const [name, setName] = useState(existingData?.name || '');
  const [motto, setMotto] = useState(existingData?.familyMotto || '');
  const [colour, setColour] = useState(existingData?.familyColour || 'indigo');
  const [logo, setLogo] = useState<string | null>(existingData?.familyLogo || null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [formError, setFormError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await compressToBase64Profile(file);
      setLogo(base64);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setFormError('');
    setLoading(true);
    try {
      const q = query(collection(db, 'households'), where('inviteCode', '==', joinCode.toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setFormError('Invalid invite code. Please check and try again.');
        setLoading(false);
        return;
      }

      const hDoc = snap.docs[0];
      const householdId = hDoc.id;

      await updateDoc(doc(db, 'households', householdId), {
        members: arrayUnion(profile.uid)
      });

      await updateDoc(doc(db, 'users', profile.uid), {
        householdId: householdId
      });

      if (onComplete) onComplete();
    } catch (err) {
      console.error(err);
      setFormError('Failed to join household. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setFormError('');
    setLoading(true);

    try {
      let householdId = existingData?.id;

      if (!householdId) {
        const newHouseholdRef = doc(collection(db, 'households'));
        householdId = newHouseholdRef.id;
        const code = generateInviteCode();

        await setDoc(newHouseholdRef, {
          id: householdId,
          name: name.trim(),
          familyMotto: motto.trim(),
          familyColour: colour,
          familyLogo: logo,
          createdBy: profile.uid,
          members: [profile.uid],
          rewardStore: [],
          currency: 'R',
          currencyName: 'Points',
          cashOutEnabled: true,
          minCashOut: 100,
          createdAt: serverTimestamp(),
          inviteCode: code,
          updatedAt: serverTimestamp()
        });

        await updateDoc(doc(db, 'users', profile.uid), {
          householdId: householdId
        });
      } else {
        await updateDoc(doc(db, 'households', householdId), {
          name: name.trim(),
          familyMotto: motto.trim(),
          familyColour: colour,
          familyLogo: logo,
          updatedAt: serverTimestamp()
        });
      }

      if (onComplete) onComplete();
    } catch (err) {
      console.error("HouseholdSetup Error:", err);
      setFormError("Failed to save. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${isEditing ? '' : 'min-h-screen flex items-center justify-center p-4 bg-slate-50'}`}>
      <motion.form 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={mode === 'create' ? handleSave : handleJoin}
        className={`w-full max-w-xl bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100 ${isEditing ? 'shadow-none border-0 p-0' : ''}`}
      >
        {!isEditing && (
          <>
            <div className="text-center mb-10">
              <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-50">
                <Sparkles size={40} />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2">Welcome!</h2>
              <p className="text-slate-500 font-medium tracking-tight">Let's get your family setup on HomeManager.</p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                  mode === 'create' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Create Family
              </button>
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`flex-1 py-3 text-sm font-black rounded-xl transition-all ${
                  mode === 'join' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Join Family
              </button>
            </div>
          </>
        )}

        {mode === 'create' ? (
          <div className="space-y-8">
            {/* Logo Upload */}
            <div className="flex flex-col items-center">
              <div className="relative group">
                <div 
                  className="w-32 h-32 rounded-[3.5rem] bg-slate-50 border-4 border-white shadow-2xl flex items-center justify-center overflow-hidden transition-all group-hover:scale-105"
                  style={{ backgroundColor: getFamilyColour(colour) + '20' }}
                >
                  {logo ? (
                    <img src={logo} className="w-full h-full object-cover" alt="Family Logo" />
                  ) : (
                    <Camera className="text-slate-300" size={32} />
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                      <Loader2 className="animate-spin text-indigo-600" />
                    </div>
                  )}
                </div>
                <label className="absolute bottom-0 right-0 p-3 bg-white text-slate-900 border border-slate-100 rounded-2xl cursor-pointer shadow-xl hover:bg-slate-50 transition-all active:scale-95">
                  <Plus size={20} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                </label>
                {logo && (
                  <button 
                    type="button"
                    onClick={() => setLogo(null)}
                    className="absolute -top-1 -right-1 p-1.5 bg-red-500 text-white rounded-full shadow-lg"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <span className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Family Logo</span>
            </div>

            <div className="grid gap-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Family Name</label>
                <div className="relative">
                  <Home className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    placeholder="The Super-Smiths"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Family Motto</label>
                <div className="relative">
                  <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                  <input
                    type="text"
                    value={motto}
                    onChange={(e) => setMotto(e.target.value)}
                    className="w-full pl-12 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold italic"
                    placeholder="Supporting each other every day!"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
                  <Palette size={14} /> Brand Color
                </label>
                <div className="flex flex-wrap gap-3">
                  {COLOUR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColour(c)}
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${colour === c ? 'scale-110 shadow-lg' : 'hover:scale-105'}`}
                      style={{ backgroundColor: getFamilyColour(c) }}
                    >
                      {colour === c && <Check className="text-white" size={20} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isEditing && existingData?.inviteCode && (
              <div className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Household Invite Code</div>
                    <div className="text-2xl font-black text-indigo-600 tracking-widest font-mono">{existingData.inviteCode}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(existingData.inviteCode || '');
                      setCodeCopied(true);
                      setTimeout(() => setCodeCopied(false), 2000);
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all active:scale-95 ${codeCopied ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                  >
                    {codeCopied ? 'Copied! ✓' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {formError && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                <span className="text-sm font-bold">{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || uploading}
              className="w-full py-5 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-[2rem] shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 active:scale-95 group"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <span className="text-lg">{isEditing ? 'Update Profile' : 'Complete Setup'}</span>
                  {isEditing ? <Save size={24} /> : <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />}
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="text-center py-4">
              <p className="text-slate-500 font-medium">Enter your family's invite code to join.</p>
            </div>
            
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 text-center">Invite Code</label>
              <input
                type="text"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full px-5 py-6 bg-slate-50 border-2 border-slate-200 rounded-[2rem] focus:ring-2 focus:ring-emerald-500 outline-none font-black text-3xl tracking-[1em] text-center"
                placeholder="ABCDEF"
              />
            </div>

            {formError && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                <span className="text-sm font-bold">{formError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !joinCode.trim()}
              className="w-full py-5 bg-emerald-600 hover:bg-slate-900 text-white font-black rounded-[2rem] shadow-xl shadow-emerald-100 transition-all flex items-center justify-center gap-3 active:scale-95"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <span className="text-lg">Join Family</span>
                  <Check size={24} />
                </>
              )}
            </button>
          </div>
        )}
      </motion.form>
    </div>
  );
}

const ArrowRight = ({ size, className }: { size: number, className: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);
