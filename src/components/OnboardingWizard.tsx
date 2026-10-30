import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, Household } from '../types';
import { sendChildInviteEmail } from '../lib/email';
import { COLOUR_OPTIONS, getFamilyColour } from '../lib/familyUtils';
import { compressToBase64Profile } from '../lib/imageUtils';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight, Check, X, Camera, Loader2,
  Send, Gift, Sparkles, Trophy, Palette, Home as HomeIcon,
} from 'lucide-react';

interface ChildRow { name: string; email: string; }

interface Props {
  profile: UserProfile;
  household: Household;
  onComplete: () => void;
}

type Step = 'welcome' | 'family' | 'reward' | 'invite';
const STEPS: Step[] = ['welcome', 'family', 'reward', 'invite'];
const STEP_LABELS = ['Welcome', 'Your Family', 'First Reward', 'Invite Kids'];

const COLOUR_LABELS: Record<string, string> = {
  indigo: 'Navy', violet: 'Teal', amber: 'Amber',
  emerald: 'Emerald', rose: 'Rose', sky: 'Sky',
};

export default function OnboardingWizard({ profile, household, onComplete }: Props) {
  // ── navigation ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);
  const idx = STEPS.indexOf(step);

  // ── step 2 – family ───────────────────────────────────────────────────────
  const [familyName,  setFamilyName]  = useState(
    !household.name || household.name === 'New Family' ? '' : household.name
  );
  const [familyMotto, setFamilyMotto] = useState(household.familyMotto || '');
  const [colour,      setColour]      = useState(household.familyColour || 'indigo');
  const [logo,        setLogo]        = useState<string | null>(household.familyLogo || null);
  const [uploading,   setUploading]   = useState(false);

  // ── step 3 – invite ───────────────────────────────────────────────────────
  const [childCount,     setChildCount]     = useState(1);
  const [children,       setChildren]       = useState<ChildRow[]>([{ name: '', email: '' }]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteResults,  setInviteResults]  = useState<('sent' | 'error' | null)[]>([]);

  // ── step 4 – reward ───────────────────────────────────────────────────────
  const [wantReward,   setWantReward]   = useState<boolean | null>(null);
  const [rewardPoints, setRewardPoints] = useState(50);

  // ── logo upload ───────────────────────────────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { setLogo(await compressToBase64Profile(file)); } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  // ── child count change ────────────────────────────────────────────────────
  const handleChildCount = (n: number) => {
    setChildCount(n);
    setChildren(prev => {
      const next = [...prev];
      while (next.length < n) next.push({ name: '', email: '' });
      return next.slice(0, n);
    });
    setInviteResults([]);
  };

  const updateChild = (i: number, field: keyof ChildRow, val: string) =>
    setChildren(prev => prev.map((c, j) => j === i ? { ...c, [field]: val } : c));

  // ── save family (step 2 → 3) ──────────────────────────────────────────────
  const handleSaveFamily = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'households', household.id), {
        name:         familyName.trim() || 'Our Family',
        familyMotto:  familyMotto.trim(),
        familyColour: colour,
        familyLogo:   logo,
        updatedAt:    serverTimestamp(),
      });
      setStep('reward');
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  // ── save reward + advance to invite step (step 3 → 4) ────────────────────
  const handleSaveReward = async () => {
    setSaving(true);
    try {
      if (wantReward === true) {
        await updateDoc(doc(db, 'households', household.id), { onboardingTaskPoints: rewardPoints });
        // Keep inviteCodes in sync so joining children can read the reward without household access
        // (Auth.tsx's join flow looks up onboardingTaskPoints from inviteCodes, not households).
        await setDoc(doc(db, 'inviteCodes', household.inviteCode), {
          householdId: household.id,
          householdName: familyName.trim() || household.name,
          onboardingTaskPoints: rewardPoints,
        }, { merge: true });
      }
    } catch { /* non-critical */ }
    finally { setSaving(false); }
    setStep('invite');
  };

  // ── send invites (step 4 — now LAST step) ────────────────────────────────
  // Reward has already been set; pass the correct points to the email.
  const handleSendInvites = async () => {
    const hasAny = children.slice(0, childCount).some(c => c.name.trim() && c.email.trim());
    if (!hasAny) { handleFinish(); return; }

    setSendingInvites(true);
    const pts = wantReward === true ? rewardPoints : 0;
    const results: ('sent' | 'error' | null)[] = children.map(() => null);
    await Promise.all(
      children.slice(0, childCount).map(async (child, i) => {
        if (!child.name.trim() || !child.email.trim()) return;
        try {
          await sendChildInviteEmail(
            child.email.trim(), child.name.trim(),
            familyName.trim() || household.name,
            household.inviteCode, pts, profile.displayName,
          );
          results[i] = 'sent';
        } catch { results[i] = 'error'; }
      })
    );
    setInviteResults([...results]);
    setSendingInvites(false);
  };

  // ── finish — clears onboarding flag ──────────────────────────────────────
  const handleFinish = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), { showOnboarding: false });
    } catch { /* non-critical */ }
    finally { setSaving(false); }
    onComplete();
  };

  const allInvitesSent = inviteResults.length > 0 &&
    children.slice(0, childCount).every((c, i) =>
      !c.name.trim() || !c.email.trim() || inviteResults[i] === 'sent'
    );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 flex flex-col">

      {/* ── Top bar ── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white text-lg">⚓</span>
            </div>
            <span className="font-black text-slate-900 text-sm">Home Anchor Setup</span>
          </div>
          <button onClick={handleFinish} disabled={saving}
            className="text-slate-400 hover:text-slate-600 text-xs font-bold flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-all disabled:opacity-60">
            Skip setup <X size={12} />
          </button>
        </div>
      </div>

      {/* ── Step progress ── */}
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 ${
                    i < idx   ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100' :
                    i === idx ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-110' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {i < idx ? <Check size={15} /> : i + 1}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${
                    i === idx ? 'text-indigo-600' : 'text-slate-400'
                  }`}>{STEP_LABELS[i]}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-1 rounded-full mx-2 mb-4 transition-all duration-500 ${
                    i < idx ? 'bg-emerald-400' : 'bg-slate-100'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-8">
          <AnimatePresence mode="wait">

            {/* ═══ STEP 1 — WELCOME ═══ */}
            {step === 'welcome' && (
              <motion.div key="welcome"
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="space-y-8"
              >
                <div className="text-center pt-2">
                  <motion.div
                    initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.1, stiffness: 260, damping: 20 }}
                    className="w-28 h-28 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-200"
                  >
                    <span className="text-5xl">🎉</span>
                  </motion.div>
                  <h1 className="text-3xl font-black text-slate-900 mb-3 leading-tight">
                    You're in!<br />
                    <span className="text-indigo-600">Let's build your family space.</span>
                  </h1>
                  <p className="text-slate-500 font-medium leading-relaxed text-sm">
                    This takes about 2 minutes. By the end, your kids will have invites
                    in their inbox and your first reward will be ready to roll.
                  </p>
                </div>

                <div className="grid gap-3">
                  {[
                    { emoji: '🏠', step: '01', title: 'Customise your family', desc: 'Name it, brand it, make it yours — logo, colour, motto.', col: 'border-indigo-100 bg-indigo-50/60' },
                    { emoji: '👧', step: '02', title: 'Invite your kids',       desc: 'Enter their names and emails — personalised invites land in seconds.', col: 'border-emerald-100 bg-emerald-50/60' },
                    { emoji: '🎁', step: '03', title: 'Set a welcome reward',   desc: 'Optional: reward each child just for completing their registration.', col: 'border-amber-100 bg-amber-50/60' },
                    { emoji: '🚀', step: '04', title: "You're live!",           desc: 'Head to Review to assign missions, approve work, and pay out points.', col: 'border-violet-100 bg-violet-50/60' },
                  ].map((item, i) => (
                    <motion.div key={i}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className={`rounded-2xl p-4 border flex items-center gap-4 ${item.col}`}
                    >
                      <span className="text-2xl w-10 text-center flex-shrink-0">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.step}</span>
                          <p className="font-black text-slate-800 text-sm">{item.title}</p>
                        </div>
                        <p className="text-slate-500 text-xs font-medium leading-snug">{item.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 2 — FAMILY CUSTOMISATION ═══ */}
            {step === 'family' && (
              <motion.div key="family"
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 mb-1">🏠 Make it yours</h2>
                  <p className="text-slate-500 font-medium text-sm">Give your family space a name, a look, and a little personality.</p>
                </div>

                {/* Logo upload */}
                <div className="flex flex-col items-center">
                  <div className="relative group">
                    <div className="w-28 h-28 rounded-[2rem] border-4 border-white shadow-xl flex items-center justify-center overflow-hidden transition-all group-hover:scale-105"
                      style={{ backgroundColor: getFamilyColour(colour) + '20' }}>
                      {logo
                        ? <img src={logo} className="w-full h-full object-cover" alt="Logo" />
                        : <span className="text-4xl">🏡</span>
                      }
                      {uploading && (
                        <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                          <Loader2 className="animate-spin text-indigo-600" size={24} />
                        </div>
                      )}
                    </div>
                    <label className="absolute -bottom-1 -right-1 p-2.5 bg-white border border-slate-200 rounded-xl shadow-lg cursor-pointer hover:bg-slate-50 transition-all active:scale-95">
                      <Camera size={16} className="text-slate-600" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                    {logo && (
                      <button type="button" onClick={() => setLogo(null)}
                        className="absolute -top-1 -right-1 p-1.5 bg-red-500 text-white rounded-full shadow">
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <span className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Family Logo</span>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Family Name</label>
                  <div className="relative">
                    <HomeIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input type="text" value={familyName} onChange={e => setFamilyName(e.target.value)}
                      className="w-full pl-11 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm"
                      placeholder="The Smiths" />
                  </div>
                </div>

                {/* Motto */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Family Motto <span className="normal-case font-medium opacity-60">(optional)</span>
                  </label>
                  <input type="text" value={familyMotto} onChange={e => setFamilyMotto(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold italic text-sm"
                    placeholder="Teamwork makes the dream work!" />
                </div>

                {/* Colour picker */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1 flex items-center gap-1.5">
                    <Palette size={12} /> Brand Colour
                  </label>
                  <div className="grid grid-cols-6 gap-3 mt-2">
                    {COLOUR_OPTIONS.map(c => (
                      <button key={c} type="button" onClick={() => setColour(c)}
                        className={`aspect-square rounded-2xl flex items-center justify-center transition-all ${
                          colour === c ? 'ring-4 ring-offset-2 scale-110 shadow-lg' : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: getFamilyColour(c) }}
                        title={COLOUR_LABELS[c]}
                      >
                        {colour === c && <Check className="text-white drop-shadow" size={18} />}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-2 ml-1">
                    Selected: <span className="font-black text-slate-600">{COLOUR_LABELS[colour]}</span>
                  </p>
                </div>
              </motion.div>
            )}

            {/* ═══ STEP 3 — REGISTRATION REWARD ═══ */}
            {step === 'reward' && (
              <motion.div key="reward"
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 mb-1">🎁 Welcome reward</h2>
                  <p className="text-slate-500 font-medium text-sm leading-relaxed">
                    Would you like to reward each child just for registering? This amount will appear in their invite email so they're motivated to join right away.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button type="button" onClick={() => setWantReward(true)}
                    className={`p-6 rounded-3xl border-2 font-black text-center transition-all flex flex-col items-center gap-3 ${
                      wantReward === true
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700 scale-105 shadow-lg shadow-emerald-100'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'
                    }`}>
                    <span className="text-4xl">🎉</span>
                    <span className="text-sm">Yes! Give them a reward</span>
                  </button>
                  <button type="button" onClick={() => setWantReward(false)}
                    className={`p-6 rounded-3xl border-2 font-black text-center transition-all flex flex-col items-center gap-3 ${
                      wantReward === false
                        ? 'bg-slate-100 border-slate-400 text-slate-700 scale-105 shadow-lg'
                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}>
                    <span className="text-4xl">⏭️</span>
                    <span className="text-sm">Skip for now</span>
                  </button>
                </div>

                <AnimatePresence>
                  {wantReward === true && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="overflow-hidden"
                    >
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl mt-0.5 flex-shrink-0">
                            <Gift size={18} />
                          </div>
                          <div>
                            <p className="font-black text-emerald-900 text-sm">Points per child</p>
                            <p className="text-emerald-700 text-xs font-medium leading-snug mt-0.5">
                              This exact amount will show prominently in their invite email — make it feel worth joining for!
                            </p>
                          </div>
                        </div>
                        <div>
                          <input type="number" min="1" max="500" value={rewardPoints}
                            onChange={e => setRewardPoints(Math.min(500, Math.max(1, parseInt(e.target.value) || 1)))}
                            className="w-full px-5 py-4 bg-white border border-emerald-300 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none font-black text-emerald-800 text-3xl text-center" />
                          <div className="flex gap-2 mt-2">
                            {[25, 50, 100, 200].map(v => (
                              <button key={v} type="button" onClick={() => setRewardPoints(v)}
                                className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${
                                  rewardPoints === v ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                }`}>{v}</button>
                            ))}
                          </div>
                        </div>
                        <div className="bg-white rounded-xl p-3 border border-emerald-100">
                          <p className="text-[10px] text-emerald-600 font-bold flex items-start gap-1.5">
                            <Sparkles size={10} className="mt-0.5 flex-shrink-0" />
                            When each child marks their registration task complete, you'll get a notification to review and approve it — then {rewardPoints} pts land in their account instantly.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ═══ STEP 4 — INVITE CHILDREN ═══ */}
            {step === 'invite' && (
              <motion.div key="invite"
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-2xl font-black text-slate-900 mb-1">👧 Who's in your crew?</h2>
                  <p className="text-slate-500 font-medium text-sm leading-relaxed">
                    Each child gets a personalised email invite with your family code. They register and are linked to your household automatically.
                  </p>
                </div>

                {/* Count selector */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">How many kids?</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => handleChildCount(n)}
                        className={`flex-1 py-3 rounded-2xl font-black text-sm transition-all ${
                          childCount === n
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* Dynamic child rows */}
                <div className="space-y-3">
                  {children.slice(0, childCount).map((child, i) => (
                    <motion.div key={i}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`bg-white rounded-2xl border p-4 space-y-3 transition-colors ${
                        inviteResults[i] === 'sent'  ? 'border-emerald-200 bg-emerald-50/40' :
                        inviteResults[i] === 'error' ? 'border-red-200 bg-red-50/30' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Child {i + 1}</span>
                        {inviteResults[i] === 'sent'  && <span className="text-[10px] font-black text-emerald-600 flex items-center gap-1"><Check size={10} /> Invite sent!</span>}
                        {inviteResults[i] === 'error' && <span className="text-[10px] font-black text-red-500">Failed — retry</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" value={child.name} onChange={e => updateChild(i, 'name', e.target.value)}
                          disabled={inviteResults[i] === 'sent'}
                          className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm disabled:opacity-50"
                          placeholder="Name" />
                        <input type="email" value={child.email} onChange={e => updateChild(i, 'email', e.target.value)}
                          disabled={inviteResults[i] === 'sent'}
                          className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-sm disabled:opacity-50"
                          placeholder="Email" />
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Manual code fallback */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-center">
                  <p className="text-xs font-bold text-slate-400">
                    Manual join code:{' '}
                    <span className="font-black text-indigo-600 tracking-widest font-mono">{household.inviteCode}</span>
                  </p>
                  <p className="text-[10px] text-slate-300 mt-0.5">Share this if the email bounces</p>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── Bottom navigation ── */}
      <div className="bg-white/90 backdrop-blur-md border-t border-slate-100 px-6 py-4 sticky bottom-0">
        <div className="max-w-lg mx-auto">

          {step === 'welcome' && (
            <button onClick={() => setStep('family')}
              className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
              Let's go! 🚀 <ChevronRight size={18} />
            </button>
          )}

          {/* Family → save reward step */}
          {step === 'family' && (
            <div className="flex gap-3">
              <button onClick={() => setStep('reward')}
                className="px-5 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-sm">
                Skip
              </button>
              <button onClick={handleSaveFamily} disabled={saving}
                className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> Save & Continue</>}
              </button>
            </div>
          )}

          {/* Reward → save reward amount then go to invite step */}
          {step === 'reward' && (
            <div className="flex gap-3">
              <button onClick={() => setStep('invite')}
                className="px-5 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-sm">
                Skip
              </button>
              <button onClick={handleSaveReward} disabled={saving}
                className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <><ChevronRight size={18} /> Continue — Invite Kids</>}
              </button>
            </div>
          )}

          {/* Invite → send emails (now with correct reward) then finish */}
          {step === 'invite' && !allInvitesSent && (
            <div className="flex gap-3">
              <button onClick={handleFinish} disabled={saving}
                className="px-5 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl hover:bg-slate-200 transition-all text-sm">
                Skip
              </button>
              <button onClick={handleSendInvites} disabled={sendingInvites}
                className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
                {sendingInvites
                  ? <><Loader2 size={18} className="animate-spin" /> Sending…</>
                  : <><Send size={18} /> Send {childCount} Invite{childCount > 1 ? 's' : ''}</>}
              </button>
            </div>
          )}

          {step === 'invite' && allInvitesSent && (
            <button onClick={handleFinish} disabled={saving}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-emerald-600 text-white font-black rounded-2xl shadow-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
              {saving
                ? <Loader2 size={18} className="animate-spin" />
                : <><Trophy size={18} /> Go to my Dashboard!</>}
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
