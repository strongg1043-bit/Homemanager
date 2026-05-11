import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, onSnapshot, collection, query, where, orderBy, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, Task, Household, Redemption } from '../types';
import ChildTaskCard from './ChildTaskCard';
import RedeemRewards from './RedeemRewards';
import WalletLedger from './WalletLedger';
import SuggestFeature from './SuggestFeature';
import HouseholdSetup from './HouseholdSetup';
import NotificationBell from './NotificationBell';
import AuditTrailDrawer from './AuditTrailDrawer';
import DisputeModal from './DisputeModal';
import InviteParentCard from './InviteParentCard';
import { createNotification } from '../lib/notifications';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Trophy, Wallet, LogOut, CheckCircle, Clock, 
  Users, Settings, Plus, Home, Star, Shield, 
  ChevronRight, Camera, X, Send, History, Loader2,
  BellRing, AlertTriangle, Banknote
} from 'lucide-react';
import { compressToBase64Profile } from '../lib/imageUtils';
import { getFamilyColour } from '../lib/familyUtils';

interface Props {
  profile: UserProfile;
}

export default function ChildDashboard({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<'home' | 'score' | 'settings'>('home');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  
  // Modals
  const [selectedTaskForAudit, setSelectedTaskForAudit] = useState<Task | null>(null);
  const [selectedRedemptionForAudit, setSelectedRedemptionForAudit] = useState<Redemption | null>(null);
  const [selectedTaskForDispute, setSelectedTaskForDispute] = useState<Task | null>(null);
  const [selectedRedemptionForDispute, setSelectedRedemptionForDispute] = useState<Redemption | null>(null);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestTitle, setRequestTitle] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [suggestedPoints, setSuggestedPoints] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reminderSentId, setReminderSentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingMode, setOnboardingMode] = useState<'join' | 'setup'>('join');
  const [urlParams, setUrlParams] = useState({ code: '', email: '' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || '';
    const email = params.get('email') || '';
    setUrlParams({ code, email });
    if (code || email) setOnboardingMode('join');
  }, []);

  useEffect(() => {
    if (!profile.householdId) {
      setLoading(false);
      return;
    }

    const unsubHousehold = onSnapshot(doc(db, 'households', profile.householdId), (snap) => {
      if (snap.exists()) {
        setHousehold({ id: snap.id, ...snap.data() } as Household);
      } else {
        console.error("Household not found:", profile.householdId);
        setHousehold(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Household listener error:", err);
      setLoading(false);
    });

    // ARCH-2: Single live query for member profiles — no N+1 getDoc calls inside household callback.
    const qMembers = query(collection(db, 'users'), where('householdId', '==', profile.householdId));
    const unsubMembers = onSnapshot(qMembers, (snap) => {
      setMembers(snap.docs.map(d => d.data() as UserProfile));
    });

    const qTasks = query(collection(db, 'households', profile.householdId, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)).filter(t => t.assignedTo === profile.uid));
    });

    const qRedemptions = query(collection(db, 'households', profile.householdId, 'redemptions'), orderBy('createdAt', 'desc'));
    const unsubRedemptions = onSnapshot(qRedemptions, (snap) => {
      setRedemptions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)).filter(r => r.childId === profile.uid));
    });

    return () => {
      unsubHousehold();
      unsubMembers();
      unsubTasks();
      unsubRedemptions();
    };
  }, [profile.householdId, profile.uid]);

  const handleRequestTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestTitle.trim() || !profile.householdId) return;
    setIsSubmitting(true);
    try {
      const taskRef = await addDoc(collection(db, 'households', profile.householdId, 'tasks'), {
        householdId: profile.householdId,
        title: requestTitle.trim(),
        description: requestReason.trim(),
        assignedTo: profile.uid,
        assignedToName: profile.displayName,
        pointValue: Math.min(Math.max(1, suggestedPoints || 1), 9999),
        taskType: 'adhoc_date',
        status: 'proposed', 
        kpi: 'Parent will define quality standards',
        kpiLocked: false,
        evidenceType: 'photo',
        requiresProof: true,
        proposedBy: 'child',
        rewardLocked: false,
        createdAt: serverTimestamp(),
        completedAt: null,
        approvedAt: null,
        beforePhotoUrl: null,
        proofPhotoUrl: null,
        dueDate: null
      });
      await updateDoc(taskRef, { id: taskRef.id });

      // Notify ALL parents
      const parents = members.filter(m => m.role === 'parent');
      for (const parent of parents) {
        await createNotification(
          profile.householdId, parent.uid, 'parent',
          'task_assigned', // Using assigned as proposal for now or adding new type
          'New Task Proposal 💡',
          `${profile.displayName} suggested a new task: "${requestTitle.trim()}". Tap to review!`,
          '💡', { taskId: taskRef.id }
        );
      }

      setShowRequestModal(false);
      setRequestTitle('');
      setRequestReason('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await compressToBase64Profile(file);
      await updateDoc(doc(db, 'users', profile.uid), {
        profilePhoto: base64
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendReminder = async (redemption: Redemption) => {
    const parents = members.filter(m => m.role === 'parent');
    for (const parent of parents) {
      await createNotification(
        profile.householdId, parent.uid, 'parent',
        'payment_reminder',
        'Payment Reminder 🔔',
        `${profile.displayName} is gently reminding you about their ${household?.currency}${redemption.pointsSpent} cash-out.`,
        '🔔', { redemptionId: redemption.id }
      );
    }
    setReminderSentId(redemption.id);
    setTimeout(() => setReminderSentId(null), 2500);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile.householdId) {
    if (onboardingMode === 'setup') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative">
          <button 
            onClick={() => setOnboardingMode('join')}
            className="absolute top-6 left-6 text-slate-400 hover:text-indigo-600 font-bold flex items-center gap-2 transition-colors p-3 bg-white rounded-2xl shadow-sm border border-slate-100"
          >
            <ChevronRight className="rotate-180" size={20} /> Back to Join
          </button>
          <HouseholdSetup profile={profile} />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-100/50 rounded-full blur-3xl -ml-48 -mb-48" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg relative z-10"
        >
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl flex items-center justify-center mx-auto mb-6 text-indigo-600">
              <Home size={40} />
            </div>
            <h2 className="text-4xl font-black text-slate-900 mb-2">Join Your Family</h2>
            <p className="text-slate-500 font-medium px-8">Ready to start earning? Join your family's household with a code or invite a parent.</p>
          </div>
  
          <InviteParentCard 
            childName={profile.displayName}
            childUid={profile.uid}
            isOrphan={true}
            initialCode={urlParams.code}
            initialEmail={urlParams.email}
          />
  
          <div className="text-center mt-8">
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-4">Or if you're the first one here...</p>
            <button 
              onClick={() => setOnboardingMode('setup')}
              className="text-indigo-600 font-black text-sm uppercase tracking-tighter hover:text-slate-900 transition-colors"
            >
              Create your own family instead →
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const todayTasks = tasks.filter(t => 
    (t.status === 'pending' || t.status === 'accepted' || t.status === 'needs_retry') && 
    (t.proposedBy === 'parent' || (t.proposedBy === 'child' && t.approvedAt))
  );
  
  const pendingRequests = tasks.filter(t => t.proposedBy === 'child' && !t.approvedAt && t.status === 'proposed');

  const trustScore = profile.trustScore || 0;
  let trustLabel = "🌱 Just getting started";
  let trustColor = "bg-slate-400";
  if (trustScore >= 90) { trustLabel = "⭐ Highly Trustworthy"; trustColor = "bg-emerald-500"; }
  else if (trustScore >= 70) { trustLabel = "✅ Reliable"; trustColor = "bg-blue-500"; }
  else if (trustScore >= 40) { trustLabel = "📈 Building trust"; trustColor = "bg-amber-500"; }

  const familyColourHexHex = getFamilyColour(household?.familyColourHex || 'indigo');

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Family Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black overflow-hidden shadow-lg"
              style={{ backgroundColor: familyColourHex }}
            >
              {household?.familyLogo ? (
                <img src={household.familyLogo} className="w-full h-full object-cover" alt="Logo" />
              ) : (
                <span className="text-xl">{household?.name?.[0]}</span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none mb-1" style={{ color: familyColourHex }}>
                {household?.name}
              </h1>
              <p className="text-slate-400 text-xs font-bold italic tracking-tight">
                "{household?.familyMotto}"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell householdId={profile.householdId} userId={profile.uid} />
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
              <Trophy size={18} className="text-emerald-500" />
              <span className="font-black text-slate-700">{profile.totalPoints} pts</span>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              {/* Today's Tasks */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={20} className="text-emerald-600" />
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Today's Missions</h2>
                  </div>
                  <div className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
                    {todayTasks.length} Active
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {todayTasks.length > 0 ? (
                    todayTasks.map(task => (
                      <ChildTaskCard 
                        key={task.id} 
                        task={task} 
                        currency={household?.currency || 'R'} 
                        onUpdated={() => {}} 
                        parents={members.filter(m => m.role === 'parent')}
                        profile={profile}
                        onViewAudit={setSelectedTaskForAudit}
                        onOpenDispute={setSelectedTaskForDispute}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                      <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500 shadow-lg shadow-emerald-50">
                        <Sparkles size={32} />
                      </div>
                      <h3 className="text-slate-800 font-black text-xl mb-1">Excellent Work!</h3>
                      <p className="text-slate-400 font-medium">You've finished all your tasks for now.</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Pending Requests */}
              {pendingRequests.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <Clock size={20} className="text-indigo-600" />
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Your Requests</h2>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {pendingRequests.map(task => (
                      <div key={task.id} className="bg-white p-6 rounded-[2rem] border border-indigo-100 opacity-80 shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Waiting for Parent</div>
                            <h4 className="font-black text-slate-700">{task.title}</h4>
                          </div>
                          <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{task.pointValue} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}

          {activeTab === 'score' && (
            <motion.div 
              key="score"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black text-slate-900">Your Progress</h2>
              </div>

              {/* Trust Score Card */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 opacity-50 group-hover:scale-150 transition-transform duration-700" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        Trust Score <Shield className="text-emerald-500" size={24} />
                      </h3>
                      <p className="text-slate-500 font-medium mt-1">Status: <span className="font-black text-emerald-600">{trustLabel}</span></p>
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-black text-slate-900">{trustScore}%</div>
                    </div>
                  </div>
                  
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden mb-6">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${trustScore}%` }}
                      className={`h-full ${trustColor} shadow-md`}
                    />
                  </div>
                  
                  <p className="text-slate-400 text-sm font-medium italic">
                    Great work! Complete your accepted tasks to keep building trust.
                  </p>
                </div>
              </div>

              {/* Point Ledger & Wallet */}
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center shadow-lg shadow-emerald-50">
                      <Wallet size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 leading-none mb-1">{profile.totalPoints} pts</h3>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Total Wallet Balance</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab('score')} // In a real app maybe scroll to ledger
                    className="p-4 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
                  >
                    <History size={24} />
                  </button>
                </div>

                {household && (
                  <WalletLedger 
                    householdId={household.id}
                    childId={profile.uid}
                    childName={profile.displayName}
                    currency={household.currency}
                    totalPoints={profile.totalPoints}
                    isParent={false}
                  />
                )}
              </div>

              {/* Rewards Section */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles size={20} className="text-purple-600" />
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Available Rewards</h2>
                </div>
                {household && <RedeemRewards household={household} profile={profile} members={members} />}
              </section>

              {/* Payment History */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Banknote size={20} className="text-emerald-600" />
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">My Payment History</h2>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                  <div className="max-h-[400px] overflow-y-auto scrollbar-hide py-2">
                    {redemptions.length > 0 ? (
                      redemptions.map(r => (
                        <div key={r.id} className="p-6 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-6">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${r.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                              {r.status === 'paid' ? <CheckCircle size={24} /> : <Clock size={24} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`font-black tracking-tight ${r.status === 'paid' ? 'text-slate-900' : 'text-amber-700'}`}>
                                  {household?.currency}{r.pointsSpent} {r.status === 'paid' ? 'Received' : 'Awaiting Payment'}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {r.createdAt?.toDate().toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {r.status === 'paid' ? `${r.paymentMethod?.replace('_', ' ')} • Parent Paid ✓` : 'Requested'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {r.status === 'pending' && (
                              <button
                                onClick={() => handleSendReminder(r)}
                                disabled={reminderSentId === r.id}
                                className={`flex items-center gap-1.5 text-[10px] font-black uppercase px-3 py-2 rounded-xl transition-colors ${reminderSentId === r.id ? 'bg-emerald-50 text-emerald-600' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                              >
                                <BellRing size={14} /> {reminderSentId === r.id ? 'Sent! ✓' : 'Remind'}
                              </button>
                            )}
                            <button 
                              onClick={() => setSelectedRedemptionForAudit(r)}
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-slate-50 px-3 py-2 rounded-xl transition-all"
                            >
                              <History size={14} /> Details
                            </button>
                            <button 
                              onClick={() => setSelectedRedemptionForDispute(r)}
                              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <AlertTriangle size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center">
                        <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No payments yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-10"
            >
              <h2 className="text-3xl font-black text-slate-900">Your Profile</h2>
              
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 flex flex-col items-center">
                <div className="relative group">
                  <div 
                    className="w-32 h-32 rounded-[3rem] overflow-hidden bg-slate-100 flex items-center justify-center shadow-2xl"
                    style={{ backgroundColor: profile.avatarColour || familyColourHex }}
                  >
                    {profile.profilePhoto ? (
                      <img src={profile.profilePhoto} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                      <span className="text-4xl font-black text-white">{profile.displayName[0].toUpperCase()}</span>
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-2xl cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-lg border-4 border-white">
                    <Camera size={20} />
                    <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} />
                  </label>
                </div>
                <h3 className="mt-6 text-2xl font-black text-slate-900">{profile.displayName}</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">Supercharged Child</p>
              </div>

              <SuggestFeature 
                userId={profile.uid}
                userName={profile.displayName}
                householdId={household?.id || ''}
                householdName={household?.name || ''}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Action Button */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setShowRequestModal(true)}
        className="fixed right-6 bottom-32 w-16 h-16 bg-indigo-600 text-white rounded-3xl shadow-2xl flex items-center justify-center z-40 hover:bg-slate-900 transition-colors"
      >
        <Plus size={32} />
      </motion.button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-around z-50">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'home' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'home' ? 'bg-indigo-100' : ''}`}>
            <Home size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('score')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'score' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'score' ? 'bg-indigo-100' : ''}`}>
            <Star size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">My Score</span>
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'settings' ? 'bg-indigo-100' : ''}`}>
            <Settings size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
        </button>
      </nav>

      {/* Audit Drawer */}
      <AuditTrailDrawer 
        isOpen={!!selectedTaskForAudit || !!selectedRedemptionForAudit}
        onClose={() => {
          setSelectedTaskForAudit(null);
          setSelectedRedemptionForAudit(null);
        }}
        task={selectedTaskForAudit || undefined}
        redemption={selectedRedemptionForAudit || undefined}
        profile={profile}
      />

      {/* Dispute Modal */}
      <DisputeModal 
        isOpen={!!selectedTaskForDispute || !!selectedRedemptionForDispute}
        onClose={() => {
          setSelectedTaskForDispute(null);
          setSelectedRedemptionForDispute(null);
        }}
        task={selectedTaskForDispute || undefined}
        redemption={selectedRedemptionForDispute || undefined}
        profile={profile}
        members={members}
      />

      {/* Request Task Modal */}
      <AnimatePresence>
        {showRequestModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">Request a Task</h3>
                  <p className="text-slate-500 font-medium">Suggest a way to earn points!</p>
                </div>
                <button onClick={() => setShowRequestModal(false)} className="p-2 bg-slate-50 text-slate-400 rounded-xl">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleRequestTask} className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 shadow-indigo-100">Short Title</label>
                  <input
                    type="text"
                    required
                    value={requestTitle}
                    onChange={(e) => setRequestTitle(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    placeholder="e.g. Wash the car"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 shadow-indigo-100">Why should you do this?</label>
                  <textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium h-32 resize-none"
                    placeholder="Describe your proposal..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Suggested Reward</label>
                  <input
                    type="number"
                    min="1"
                    max={9999}
                    value={suggestedPoints}
                    onChange={(e) => setSuggestedPoints(Math.min(parseInt(e.target.value) || 1, 9999))}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 transition-all"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <>Send Proposal <Send size={20} /></>}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
