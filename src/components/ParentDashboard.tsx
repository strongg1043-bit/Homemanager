import React, { useState, useEffect } from 'react';
import { db, auth, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, collection, query, where, onSnapshot, updateDoc, orderBy, serverTimestamp, increment, deleteDoc, runTransaction, Timestamp, getDoc, setDoc } from 'firebase/firestore';
import { UserProfile, Household, Task, Redemption, Dispute, EvidenceType } from '../types';
import ParentTaskCard from './ParentTaskCard';
import CreateTaskForm from './CreateTaskForm';
import { resetRecurringTasks } from '../lib/taskUtils';
import RewardsManager from './RewardsManager';
import HouseholdSetup from './HouseholdSetup';
import HouseholdSettings from './HouseholdSettings';
import SuggestFeature from './SuggestFeature';
import NotificationBell from './NotificationBell';
import AuditTrailDrawer from './AuditTrailDrawer';
import PaymentConfirmationModal from './PaymentConfirmationModal';
import DisputeModal from './DisputeModal';
import InviteMemberCard from './InviteMemberCard';
import TaskStatement from './TaskStatement';
import TaskLibrary from './TaskLibrary';
import OnboardingWizard from './OnboardingWizard';
import DailyQuoteCard from './DailyQuoteCard';
import PushNotificationCard from './PushNotificationCard';
import SubscriptionPaywall from './SubscriptionPaywall';
import TrialBanner from './TrialBanner';
import { getFamilyColour } from '../lib/familyUtils';
import { motion, AnimatePresence } from 'motion/react';
import {
  LogOut, CheckCircle, Clock, Users, Settings,
  Plus, MessageSquare, ShieldCheck, Sparkles,
  AlertCircle,
  History, AlertTriangle, X, ClipboardList, BookOpen,
  Banknote, Loader2, Bell, BellRing
} from 'lucide-react';

interface Props {
  profile: UserProfile;
}

export default function ParentDashboard({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<'review' | 'family' | 'library' | 'report' | 'settings'>('review');
  const [household, setHousehold] = useState<Household | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedTaskForAudit, setSelectedTaskForAudit] = useState<Task | null>(null);
  const [selectedRedemptionForAudit, setSelectedRedemptionForAudit] = useState<Redemption | null>(null);
  const [selectedRedemptionForPayment, setSelectedRedemptionForPayment] = useState<Redemption | null>(null);
  const [selectedTaskForDispute, setSelectedTaskForDispute] = useState<Task | null>(null);
  const [selectedRedemptionForDispute, setSelectedRedemptionForDispute] = useState<Redemption | null>(null);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);
  const [resolvingDispute, setResolvingDispute] = useState<Dispute | null>(null);

  // Dispute resolution modal
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolveSuccess, setResolveSuccess] = useState(false);

  // Nudge a child about an open task
  const [nudgingTaskId, setNudgingTaskId] = useState<string | null>(null);
  const [nudgedTaskId, setNudgedTaskId] = useState<string | null>(null);
  const [nudgeErrorTaskId, setNudgeErrorTaskId] = useState<string | null>(null);
  const [nudgeErrorMessage, setNudgeErrorMessage] = useState('');

  // Proposal review modal
  const [reviewingProposal, setReviewingProposal] = useState<Task | null>(null);
  const [proposalPoints, setProposalPoints] = useState(0);
  const [proposalKpi, setProposalKpi] = useState('');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalRequiresProof, setProposalRequiresProof] = useState(false);
  const [proposalEvidenceType, setProposalEvidenceType] = useState<EvidenceType>('any');
  const [proposalDueDate, setProposalDueDate] = useState('');
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [payingChild, setPayingChild] = useState<UserProfile | null>(null);
  const [adHocAmount, setAdHocAmount] = useState(0);
  const [initiatingPayment, setInitiatingPayment] = useState(false);
  const [initiatePaymentError, setInitiatePaymentError] = useState<string | null>(null);
  const [viewingChildTasks, setViewingChildTasks] = useState<UserProfile | null>(null);
  const [filterChild, setFilterChild] = useState<string | null>(null);

  // Reopen forfeited task modal
  const [reopenTask, setReopenTask] = useState<Task | null>(null);
  const [reopenDate, setReopenDate] = useState('');
  const [reopeningTask, setReopeningTask] = useState(false);
  const householdTimezoneRef = React.useRef<string>('UTC');
  // Debounce ref — prevents resetRecurringTasks from firing on every rapid snapshot
  const resetDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteTask = async (taskId: string) => {
    if (!profile.householdId) return;
    try {
      await deleteDoc(doc(db, 'households', profile.householdId, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleReopenTask = async () => {
    if (!reopenTask || !profile.householdId || !reopenDate) return;
    setReopeningTask(true);
    try {
      const newDate = new Date(reopenDate + 'T23:59:00');
      const newTimestamp = Timestamp.fromDate(newDate);

      const updates: Record<string, any> = {
        status: 'pending',
        proofPhotoUrl: null,
        completedAt: null,
        approvedAt: null,
        retryNote: null,
      };

      if (reopenTask.recurrence) {
        // Recurring task — push the end date forward and reset the cycle
        updates['recurrence.expired'] = false;
        updates['recurrence.endDate'] = newTimestamp;
        updates['recurrence.lastReset'] = serverTimestamp();
      } else {
        // One-off task — update the due date
        updates.dueDate = newTimestamp;
      }

      await updateDoc(doc(db, 'households', profile.householdId, 'tasks', reopenTask.id), updates);
      setReopenTask(null);
      setReopenDate('');
    } catch (err) {
      console.error('Failed to re-open task:', err);
    } finally {
      setReopeningTask(false);
    }
  };

  const openReopenModal = (task: Task) => {
    // Default to 7 days from today for recurring tasks, 3 days for one-offs
    const defaultOffset = task.recurrence ? 7 : 3;
    const d = new Date();
    d.setDate(d.getDate() + defaultOffset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    setReopenDate(`${yyyy}-${mm}-${dd}`);
    setReopenTask(task);
  };

  // Parent-initiated payment: creates a redemption doc on behalf of the child then opens the payment modal
  const handleInitiatePayment = async () => {
    if (!household || !payingChild || adHocAmount <= 0) return;
    setInitiatingPayment(true);
    setInitiatePaymentError(null);
    try {
      const userRef = doc(db, 'users', payingChild.uid);
      const redemptionRef = doc(collection(db, 'households', household.id, 'redemptions'));

      // Transaction: read live balance → cap amount → write atomically.
      // Prevents double-deduction when child submits a cash-out at the same moment.
      let finalAmount = adHocAmount;
      await runTransaction(db, async (tx) => {
        const userSnap = await tx.get(userRef);
        const livePoints: number = userSnap.data()?.totalPoints ?? 0;
        finalAmount = Math.min(adHocAmount, Math.max(0, livePoints));
        if (finalAmount <= 0) throw new Error('No balance to settle');
        tx.set(redemptionRef, {
          id: redemptionRef.id,
          householdId: household.id,
          type: 'cash',
          title: 'Parent-initiated payment',
          pointsSpent: finalAmount,
          cashValue: finalAmount,
          childId: payingChild.uid,
          childName: payingChild.displayName,
          status: 'pending',
          proofPhotoUrl: null,
          note: null,
          paidBy: null,
          paidByName: null,
          paymentMethod: null,
          paymentReference: null,
          paymentNote: null,
          createdAt: serverTimestamp(),
          approvedAt: null,
          paidAt: null,
        });
        tx.update(userRef, { totalPoints: increment(-finalAmount) });
      });

      // Close settle panel and immediately open the payment confirmation modal
      setPayingChild(null);
      setAdHocAmount(0);
      setSelectedRedemptionForPayment({
        id: redemptionRef.id,
        householdId: household.id,
        type: 'cash',
        title: 'Parent-initiated payment',
        pointsSpent: finalAmount,
        cashValue: finalAmount,
        childId: payingChild.uid,
        childName: payingChild.displayName,
        status: 'pending',
        proofPhotoUrl: null,
        note: null,
        paidBy: null,
        paidByName: null,
        paymentMethod: null,
        paymentReference: null,
        paymentNote: null,
        createdAt: null as any,
        approvedAt: null,
        paidAt: null,
      });
    } catch (err) {
      console.error('Failed to initiate payment:', err);
      setInitiatePaymentError('Something went wrong. Please try again.');
    } finally {
      setInitiatingPayment(false);
    }
  };

  useEffect(() => {
    if (!profile.householdId) {
      setLoading(false);
      return;
    }

    const unsubHousehold = onSnapshot(doc(db, 'households', profile.householdId), (snap) => {
      if (snap.exists()) {
        setHousehold({ id: snap.id, ...snap.data() } as Household);
        householdTimezoneRef.current = (snap.data() as any)?.timezone || 'UTC';
      } else {
        console.error("Household not found:", profile.householdId);
        setHousehold(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Household listener error:", err);
      setLoading(false);
    });

    // ARCH-2: Single live query instead of N individual getDoc calls inside household callback.
    // This listener automatically reflects profile changes (display name, points, etc.).
    const membersQuery = query(collection(db, 'users'), where('householdId', '==', profile.householdId));
    const unsubMembers = onSnapshot(
      membersQuery,
      (snap) => {
        setMembers(snap.docs.map(d => d.data() as UserProfile));
        setMembersError(null);
      },
      (err) => {
        console.error('Members query error:', err);
        setMembersError(err.message);
      }
    );

    const tasksQuery = query(collection(db, 'households', profile.householdId, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      const fetchedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      setTasks(fetchedTasks);

      // Auto-reset recurring tasks — debounced so rapid snapshot bursts
      // (e.g. bulk quick-assign) don't cascade into a write→snapshot loop.
      if (profile.householdId) {
        if (resetDebounceRef.current) clearTimeout(resetDebounceRef.current);
        resetDebounceRef.current = setTimeout(() => {
          resetRecurringTasks(profile.householdId!, fetchedTasks, householdTimezoneRef.current);
        }, 3000);
      }
    });

    const redemptionsQuery = query(collection(db, 'households', profile.householdId, 'redemptions'), orderBy('createdAt', 'desc'));
    const unsubRedemptions = onSnapshot(redemptionsQuery, (snap) => {
      setRedemptions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)));
    });

    const disputesQuery = query(collection(db, 'households', profile.householdId, 'disputes'), orderBy('createdAt', 'desc'));
    const unsubDisputes = onSnapshot(disputesQuery, (snap) => {
      setDisputes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Dispute)));
    });

    return () => {
      unsubHousehold();
      unsubMembers();
      unsubTasks();
      unsubRedemptions();
      unsubDisputes();
    };
  }, [profile.householdId]);

  // One-time migration: ensure this household has an entry in the inviteCodes collection.
  // Households created before this feature was added won't have one; this effect creates it
  // silently on the parent's first load so invite-code lookups work without household list access.
  useEffect(() => {
    if (!household?.inviteCode || !household?.id) return;
    const codeRef = doc(db, 'inviteCodes', household.inviteCode);
    getDoc(codeRef).then(snap => {
      if (!snap.exists()) {
        setDoc(codeRef, {
          householdId: household.id,
          householdName: household.name,
          onboardingTaskPoints: household.onboardingTaskPoints ?? 0,
        }).catch(() => {});
      }
    }).catch(() => {});
    // Intentionally one-shot per household load — only backfills a missing inviteCodes doc
    // (the snap.exists() check no-ops once it's created), so re-running on every name/points
    // edit would just be wasted reads, not a bug fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  // Show the onboarding wizard when profile.showOnboarding is true.
  // This flag is written to Firestore during registration so it arrives through
  // the same onSnapshot channel as all other profile data — no race condition.
  useEffect(() => {
    if (profile.showOnboarding === true) {
      setShowOnboardingWizard(true);
    }
  }, [profile.showOnboarding]);

  const openReviewProposal = (task: Task) => {
    setReviewingProposal(task);
    setProposalPoints(task.pointValue || 10);
    setProposalKpi(task.kpi || '');
    setProposalDescription(task.description || '');
    setProposalRequiresProof(task.requiresProof ?? false);
    setProposalEvidenceType((task.evidenceType as EvidenceType) || 'any');
    setProposalDueDate('');
  };

  const handleApproveProposal = async () => {
    if (!household || !reviewingProposal) return;
    setProposalSubmitting(true);
    try {
      const update: Record<string, any> = {
        status: 'pending',
        pointValue: proposalPoints,
        proposedBy: null,
        approvedAt: serverTimestamp(),
        kpiLocked: true,
        rewardLocked: true,
        kpi: proposalKpi.trim() || reviewingProposal.kpi,
        description: proposalDescription.trim(),
        requiresProof: proposalRequiresProof,
        evidenceType: proposalEvidenceType,
      };
      if (proposalDueDate) {
        update.dueDate = Timestamp.fromDate(new Date(proposalDueDate));
      }
      await updateDoc(doc(db, 'households', household.id, 'tasks', reviewingProposal.id), update);
      setReviewingProposal(null);
    } catch (err) {
      console.error(err);
    } finally {
      setProposalSubmitting(false);
    }
  };

  const handleDeclineProposal = async (task: Task) => {
    if (!household) return;
    try {
      await updateDoc(doc(db, 'households', household.id, 'tasks', task.id), {
        status: 'forfeited',
      });
      if (reviewingProposal?.id === task.id) setReviewingProposal(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNudge = async (task: Task) => {
    if (nudgingTaskId) return;
    setNudgingTaskId(task.id);
    try {
      const sendNudge = httpsCallable(functions, 'sendNudge');
      await sendNudge({ taskId: task.id, householdId: profile.householdId });
      setNudgedTaskId(task.id);
      setTimeout(() => setNudgedTaskId(null), 3000);
    } catch (err) {
      console.error('Failed to send nudge:', err);
      const code = (err as { code?: string })?.code;
      setNudgeErrorTaskId(task.id);
      setNudgeErrorMessage(code === 'functions/resource-exhausted' ? 'Already nudged — wait a bit' : 'Could not send nudge');
      setTimeout(() => setNudgeErrorTaskId(null), 3000);
    } finally {
      setNudgingTaskId(null);
    }
  };

  const handleResolveDispute = (dispute: Dispute) => {
    setResolvingDispute(dispute);
    setResolutionText('');
    setResolveError(null);
    setResolveSuccess(false);
  };

  const closeResolveModal = () => {
    setResolvingDispute(null);
    setResolutionText('');
    setResolveError(null);
    setResolveSuccess(false);
  };

  const handleConfirmResolve = async () => {
    if (!resolvingDispute || !resolutionText.trim() || resolveSubmitting) return;
    setResolveSubmitting(true);
    setResolveError(null);
    try {
      await updateDoc(doc(db, 'households', profile.householdId, 'disputes', resolvingDispute.id), {
        status: 'resolved',
        resolution: resolutionText.trim(),
        resolvedAt: serverTimestamp(),
        resolvedBy: profile.uid,
      });
      setResolveSuccess(true);
      // Auto-close after showing success state
      setTimeout(() => closeResolveModal(), 1500);
    } catch (err: any) {
      console.error('Failed to resolve dispute:', err);
      setResolveError('Could not save resolution. Please try again.');
    } finally {
      setResolveSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile.householdId) return <HouseholdSetup profile={profile} />;

  if (household?.subscriptionStatus === 'expired') {
    return <SubscriptionPaywall variant="parent" household={household} profile={profile} />;
  }

  if (showOnboardingWizard && household) {
    return (
      <OnboardingWizard
        profile={profile}
        household={household}
        onComplete={() => setShowOnboardingWizard(false)}
      />
    );
  }

  const pendingSubmissions = tasks.filter(t => t.status === 'submitted');
  const taskProposals = tasks.filter(t => t.status === 'proposed' && t.proposedBy === 'child');
  const pendingRedemptions = redemptions.filter(r => r.status === 'pending');
  const openDisputes = disputes.filter(d => d.status === 'open');
  const children = members.filter(m => m.role === 'child');

  const familyColourHex = getFamilyColour(household?.familyColour || 'indigo');

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {household && <TrialBanner household={household} />}
      {/* Family Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
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
            <button 
              onClick={() => auth.signOut()}
              className="p-3 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'review' && (() => {
            const displaySubmissions = filterChild
              ? pendingSubmissions.filter(t => t.assignedTo === filterChild)
              : pendingSubmissions;
            const displayProposals = filterChild
              ? taskProposals.filter(t => t.assignedTo === filterChild)
              : taskProposals;
            const displayRedemptions = filterChild
              ? pendingRedemptions.filter(r => r.childId === filterChild)
              : pendingRedemptions;

            return (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* ── Daily AI quote — shown when there's nothing to action ── */}
              {displaySubmissions.length === 0 && displayProposals.length === 0 && displayRedemptions.length === 0 && (
                <DailyQuoteCard />
              )}

              {/* ── Child summary strip ── */}
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-3 px-3 snap-x">
                {/* All pill */}
                <button
                  onClick={() => setFilterChild(null)}
                  className={`snap-start flex-shrink-0 flex flex-col items-center gap-1.5 px-4 py-3 rounded-2xl border-2 transition-all ${
                    !filterChild
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-200'
                  }`}
                >
                  <Users size={18} />
                  <span className="text-[9px] font-black uppercase tracking-widest">All</span>
                  {(pendingSubmissions.length + taskProposals.length + pendingRedemptions.length) > 0 && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${!filterChild ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-600'}`}>
                      {pendingSubmissions.length + taskProposals.length + pendingRedemptions.length}
                    </span>
                  )}
                </button>

                {children.map(child => {
                  const cSubmitted = tasks.filter(t => t.assignedTo === child.uid && t.status === 'submitted').length;
                  const cProposals = tasks.filter(t => t.assignedTo === child.uid && t.status === 'proposed' && t.proposedBy === 'child').length;
                  const cCashOuts = redemptions.filter(r => r.childId === child.uid && r.status === 'pending').length;
                  const cTotal = cSubmitted + cProposals + cCashOuts;
                  const isSelected = filterChild === child.uid;
                  const avatarBg = child.avatarColour || familyColourHex;

                  return (
                    <button
                      key={child.uid}
                      onClick={() => setFilterChild(isSelected ? null : child.uid)}
                      className={`snap-start flex-shrink-0 flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl border-2 transition-all min-w-[80px] ${
                        isSelected ? 'shadow-lg' : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                      style={isSelected ? { backgroundColor: avatarBg, borderColor: avatarBg } : {}}
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm overflow-hidden flex-shrink-0"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.22)' : avatarBg }}
                      >
                        {child.profilePhoto
                          ? <img src={child.profilePhoto} className="w-full h-full object-cover" alt="" />
                          : child.displayName[0].toUpperCase()}
                      </div>
                      <span className={`text-[9px] font-black uppercase tracking-widest truncate max-w-[68px] ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                        {child.displayName.split(' ')[0]}
                      </span>
                      {cTotal > 0 ? (
                        <div className="flex gap-1 flex-wrap justify-center">
                          {cSubmitted > 0 && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{cSubmitted} ✓</span>
                          )}
                          {cProposals > 0 && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{cProposals} 💡</span>
                          )}
                          {cCashOuts > 0 && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>{cCashOuts} 💸</span>
                          )}
                        </div>
                      ) : (
                        <span className={`text-[9px] font-bold ${isSelected ? 'text-white/60' : 'text-slate-300'}`}>all clear</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active Disputes — always visible */}
              {openDisputes.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle size={18} className="text-red-600" />
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Active Disputes</h2>
                  </div>
                  <div className="space-y-3">
                    {openDisputes.map(dispute => {
                      const relatedTask = tasks.find(t => t.id === dispute.taskId);
                      const relatedRedemption = redemptions.find(r => r.id === dispute.redemptionId);
                      return (
                        <div key={dispute.id} className="bg-red-50 p-5 rounded-[2rem] border border-red-100 flex items-center justify-between gap-4">
                          <div className="flex gap-3">
                            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-red-600 shadow-sm border border-red-100 flex-shrink-0">
                              <AlertTriangle size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[9px] font-black text-red-600 uppercase tracking-widest">{dispute.raisedByName} raised a dispute</span>
                                <span className="text-[9px] font-bold text-red-400 bg-white px-2 py-0.5 rounded-full">
                                  {dispute.createdAt?.toDate().toLocaleDateString()}
                                </span>
                              </div>
                              <h3 className="font-black text-slate-900 text-sm mb-1">{dispute.reason}</h3>
                              {(relatedTask || relatedRedemption) && (
                                <button
                                  onClick={() => {
                                    if (relatedTask) setSelectedTaskForAudit(relatedTask);
                                    if (relatedRedemption) setSelectedRedemptionForAudit(relatedRedemption);
                                  }}
                                  className="mt-2 flex items-center gap-1.5 text-[9px] font-black uppercase text-red-600 bg-white px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                                >
                                  <History size={12} /> Audit Trail
                                </button>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleResolveDispute(dispute)}
                            className="bg-red-600 text-white px-4 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-red-100 flex-shrink-0"
                          >
                            Resolve
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Task Proposals */}
              {displayProposals.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare size={18} className="text-indigo-600" />
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Task Proposals</h2>
                    <span className="ml-auto text-[9px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase">{displayProposals.length}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {displayProposals.map(task => (
                      <div key={task.id} className="bg-white p-5 rounded-[2rem] border border-indigo-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-50 rounded-full -mr-10 -mt-10 opacity-50 group-hover:scale-150 transition-transform" />
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Proposal from {task.assignedToName}</div>
                              <h3 className="text-base font-black text-slate-900">{task.title}</h3>
                            </div>
                            <div className="bg-indigo-600 text-white px-2.5 py-1 rounded-full text-xs font-black flex-shrink-0 ml-2">
                              {task.pointValue} pts
                            </div>
                          </div>
                          <p className="text-slate-500 text-sm mb-4 line-clamp-2">{task.description}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => openReviewProposal(task)}
                              className="flex-1 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-100"
                            >
                              Review & Approve
                            </button>
                            <button
                              onClick={() => handleDeclineProposal(task)}
                              className="px-4 py-2.5 bg-slate-100 text-slate-600 text-xs font-black rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Task Submissions */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={18} className="text-emerald-600" />
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Ready for Review</h2>
                    {displaySubmissions.length > 0 && (
                      <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase">{displaySubmissions.length}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowCreateTask(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 hover:scale-105 transition-all"
                  >
                    <Plus size={14} /> New Task
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  {displaySubmissions.length > 0 ? (
                    displaySubmissions.map(task => (
                      <ParentTaskCard
                        key={task.id}
                        task={task}
                        childName={task.assignedToName}
                        currency={household?.currency || 'R'}
                        members={members}
                        emailEnabled={household?.emailNotificationsEnabled !== false}
                        onViewAudit={setSelectedTaskForAudit}
                        onOpenDispute={setSelectedTaskForDispute}
                        onDelete={handleDeleteTask}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-16 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                      <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                        <Clock size={28} />
                      </div>
                      <h3 className="text-slate-400 font-black">
                        {filterChild ? `No submissions from ${children.find(c => c.uid === filterChild)?.displayName.split(' ')[0]}` : 'No tasks waiting for review'}
                      </h3>
                      <p className="text-slate-300 text-sm font-medium mt-1">Enjoy the peace and quiet!</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Cash-out Requests */}
              {displayRedemptions.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <ShieldCheck size={18} className="text-amber-500" />
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Wallet Requests</h2>
                    <span className="ml-auto text-[9px] font-black bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full uppercase">{displayRedemptions.length}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {displayRedemptions.map(redemption => (
                      <div key={redemption.id} className="bg-white p-5 rounded-[2rem] border border-amber-100 shadow-sm flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                            <Sparkles size={20} />
                          </div>
                          <div>
                            <div className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-0.5">{redemption.childName}</div>
                            <h3 className="font-black text-slate-900 text-sm">{redemption.title}</h3>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-black text-slate-900">{household?.currency}{redemption.pointsSpent}</div>
                          <button
                            onClick={() => setSelectedRedemptionForPayment(redemption)}
                            className="text-[9px] font-black uppercase text-white bg-indigo-600 hover:bg-slate-900 px-3 py-1.5 rounded-lg transition-colors mt-1"
                          >
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </motion.div>
            );
          })()}

          {activeTab === 'family' && (
            <motion.div
              key="family"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              {/* Children */}
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2 font-sans">Family</h2>
                <p className="text-slate-400 font-medium text-sm mb-8">Manage tasks, balances and members</p>

                {membersError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-2 text-red-600 text-sm font-bold">
                    <AlertCircle size={18} className="flex-shrink-0" />
                    Couldn't load family members: {membersError}
                  </div>
                )}

                <div className="grid gap-4">
                  {children.map(child => {
                    const childPendingRedemptions = redemptions.filter(r => r.childId === child.uid && r.status === 'pending');
                    const childActiveTasks = tasks.filter(t => t.assignedTo === child.uid && ['pending', 'accepted', 'needs_retry', 'submitted'].includes(t.status));
                    const allChildTasks = tasks.filter(t => t.assignedTo === child.uid);
                    const isExpanded = viewingChildTasks?.uid === child.uid;
                    // Floor at 0 — guards against legacy negative values from race conditions
                    const safePoints = Math.max(0, child.totalPoints ?? 0);

                    const statusMeta: Record<string, { label: string; cls: string }> = {
                      pending:     { label: 'To Do',       cls: 'bg-slate-100 text-slate-600' },
                      accepted:    { label: 'In Progress', cls: 'bg-blue-100 text-blue-700' },
                      needs_retry: { label: 'Redo',        cls: 'bg-orange-100 text-orange-700' },
                      submitted:   { label: 'Submitted',   cls: 'bg-amber-100 text-amber-700' },
                      approved:    { label: 'Approved',    cls: 'bg-emerald-100 text-emerald-700' },
                      missed:      { label: 'Missed',      cls: 'bg-red-100 text-red-600' },
                      forfeited:   { label: 'Forfeited',   cls: 'bg-red-100 text-red-600' },
                      proposed:    { label: 'Proposed',    cls: 'bg-indigo-100 text-indigo-700' },
                    };

                    const statusOrder: Record<string, number> = {
                      needs_retry: 0, submitted: 1, accepted: 2, pending: 3, proposed: 4, approved: 5, missed: 6, forfeited: 7,
                    };

                    const sortedTasks = [...allChildTasks].sort((a, b) =>
                      (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
                    );

                    return (
                      <div key={child.uid} className={`bg-white rounded-[2rem] border overflow-hidden shadow-sm transition-all ${isExpanded ? 'border-indigo-200 shadow-indigo-50' : 'border-slate-200'}`}>
                        {/* Header row */}
                        <div className="p-5 flex flex-wrap items-center gap-4">
                          {/* Avatar */}
                          <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-md flex-shrink-0"
                            style={{ backgroundColor: child.avatarColour || familyColourHex }}
                          >
                            {child.profilePhoto ? (
                              <img src={child.profilePhoto} className="w-full h-full object-cover rounded-2xl" alt="Profile" />
                            ) : child.displayName[0].toUpperCase()}
                          </div>

                          {/* Name + badges */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-black text-slate-900 truncate">{child.displayName}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-full">
                                ⭐ {child.trustScore || 100}
                              </span>
                              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-widest rounded-full">
                                {household?.currency}{safePoints} owed
                              </span>
                              {childPendingRedemptions.length > 0 && (
                                <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-full">
                                  💸 {childPendingRedemptions.length} pending
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => setViewingChildTasks(isExpanded ? null : child)}
                              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                                isExpanded
                                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                                  : 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'
                              }`}
                            >
                              <ClipboardList size={15} />
                              Tasks
                              {childActiveTasks.length > 0 && (
                                <span className={`rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black ${isExpanded ? 'bg-white/25 text-white' : 'bg-indigo-600 text-white'}`}>
                                  {childActiveTasks.length}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={() => { setPayingChild(child); setAdHocAmount(safePoints); }}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md shadow-indigo-100 active:scale-95"
                            >
                              <Banknote size={15} /> Settle
                            </button>
                          </div>
                        </div>

                        {/* Pending redemption strip */}
                        {childPendingRedemptions.length > 0 && (
                          <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 flex flex-wrap gap-2">
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest self-center">Pending:</span>
                            {childPendingRedemptions.map(r => (
                              <button
                                key={r.id}
                                onClick={() => setSelectedRedemptionForPayment(r)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-black text-slate-700 hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm"
                              >
                                <Banknote size={12} className="text-amber-500" />
                                {r.title} — {household?.currency}{r.pointsSpent}
                                <span className="text-[9px] text-indigo-600 font-black uppercase">Pay →</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* ── Inline task table accordion ── */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22, ease: 'easeInOut' }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-indigo-100 bg-indigo-50/40">
                                {/* Table header */}
                                <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-5 py-2 border-b border-indigo-100">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Task</span>
                                  <span className="hidden sm:block text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Type</span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</span>
                                  <span className="hidden sm:block text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Ends</span>
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Value</span>
                                </div>

                                {sortedTasks.length === 0 ? (
                                  <div className="px-5 py-8 text-center">
                                    <p className="text-slate-400 text-sm font-black">No tasks yet</p>
                                    <p className="text-slate-300 text-xs font-medium mt-1">Assign tasks from the Templates tab</p>
                                  </div>
                                ) : (
                                  <div className="divide-y divide-indigo-100/70">
                                    {sortedTasks.map(task => {
                                      const sm = statusMeta[task.status] || { label: task.status, cls: 'bg-slate-100 text-slate-500' };
                                      const typeLabel: Record<string, string> = {
                                        daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
                                        adhoc_date: 'One-off', adhoc_kpi: 'KPI',
                                      };
                                      return (
                                        <div key={task.id} className={`${task.status === 'forfeited' ? 'bg-red-50/50' : ''}`}>
                                          <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center px-5 py-2.5 hover:bg-white/60 transition-colors">
                                            <div className="min-w-0">
                                              <p className="font-black text-slate-800 text-sm truncate">{task.title}</p>
                                              {task.description && (
                                                <p className="text-slate-400 text-xs font-medium truncate mt-0.5">{task.description}</p>
                                              )}
                                            </div>
                                            <span className="hidden sm:inline text-[9px] font-black text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap">
                                              {typeLabel[task.taskType] || task.taskType}
                                            </span>
                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap ${sm.cls}`}>
                                              {sm.label}
                                            </span>
                                            <span className="hidden sm:inline text-[9px] font-bold text-slate-400 whitespace-nowrap text-center">
                                              {task.recurrence?.endDate
                                                ? (() => {
                                                    const d = task.recurrence.endDate.toDate();
                                                    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
                                                  })()
                                                : task.dueDate
                                                ? (() => {
                                                    const d = task.dueDate.toDate();
                                                    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
                                                  })()
                                                : '—'}
                                            </span>
                                            <span className="text-sm font-black text-slate-900 text-right whitespace-nowrap">
                                              {household?.currency}{task.pointValue}
                                            </span>
                                          </div>
                                          {task.status === 'forfeited' && (
                                            <div className="px-5 pb-2.5 flex items-center gap-2">
                                              <span className="text-[9px] text-red-400 font-bold italic flex-1">Child didn't complete this cycle</span>
                                              <button
                                                onClick={() => openReopenModal(task)}
                                                className="text-[9px] font-black text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 px-3 py-1 rounded-lg uppercase tracking-widest transition-all"
                                              >
                                                ↩ Re-open
                                              </button>
                                            </div>
                                          )}
                                          {['pending', 'accepted', 'needs_retry'].includes(task.status) && (
                                            <div className="px-5 pb-2.5 flex items-center justify-end">
                                              <button
                                                onClick={() => handleNudge(task)}
                                                disabled={nudgingTaskId === task.id}
                                                className={`flex items-center gap-1.5 text-[9px] font-black px-3 py-1 rounded-lg uppercase tracking-widest border transition-all disabled:opacity-50 ${
                                                  nudgedTaskId === task.id
                                                    ? 'text-emerald-600 border-emerald-200 bg-emerald-50'
                                                    : nudgeErrorTaskId === task.id
                                                    ? 'text-red-500 border-red-200 bg-red-50'
                                                    : 'text-amber-600 border-amber-200 hover:text-white hover:bg-amber-500'
                                                }`}
                                              >
                                                {nudgedTaskId === task.id ? (
                                                  <><BellRing size={11} /> Nudged!</>
                                                ) : nudgeErrorTaskId === task.id ? (
                                                  <>{nudgeErrorMessage}</>
                                                ) : (
                                                  <><Bell size={11} /> {nudgingTaskId === task.id ? 'Sending…' : 'Nudge'}</>
                                                )}
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Footer: new task button */}
                                <div className="px-5 py-3 border-t border-indigo-100 flex justify-end">
                                  <button
                                    onClick={() => setShowCreateTask(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md"
                                  >
                                    <Plus size={14} /> Assign New Task
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Parents */}
              {members.filter(m => m.role === 'parent').length > 0 && (
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Parents / Guardians</h3>
                  <div className="grid gap-3">
                    {members.filter(m => m.role === 'parent').map(parent => (
                      <div key={parent.uid} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-4">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm shadow-sm flex-shrink-0"
                          style={{ backgroundColor: parent.avatarColour || familyColourHex }}
                        >
                          {parent.profilePhoto ? (
                            <img src={parent.profilePhoto} className="w-full h-full object-cover rounded-xl" alt="Profile" />
                          ) : parent.displayName[0].toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-slate-800 text-sm">{parent.displayName}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Parent</p>
                        </div>
                        {parent.uid === profile.uid && (
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-full">You</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Invite / Code at the bottom ── */}
              <div className="pt-6 border-t border-slate-100 space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Add Family Members</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Invite Code */}
                  <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-50 rounded-full -mr-14 -mt-14 transition-transform group-hover:scale-110" />
                    <div className="relative z-10">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">🔗 Invite Code</h3>
                      <p className="text-sm text-slate-500 mb-4 font-medium">Share with family to join {household?.name}</p>
                      <div className="bg-slate-50 rounded-2xl p-5 flex flex-col items-center justify-center border border-slate-100">
                        <div className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1">Household Code</div>
                        <div className="text-3xl font-black text-indigo-600 tracking-widest font-mono mb-4">{household?.inviteCode}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(household?.inviteCode || '');
                            setCodeCopied(true);
                            setTimeout(() => setCodeCopied(false), 2000);
                          }}
                          className={`w-full px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 ${codeCopied ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-slate-900'}`}
                        >
                          {codeCopied ? '✓ Copied!' : '📋 Copy Code'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Invite Member */}
                  {household && (
                    <InviteMemberCard
                      householdId={household.id}
                      householdName={household.name}
                      householdCode={household.inviteCode}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <h2 className="text-3xl font-black text-slate-900">Settings</h2>
              
              <div className="space-y-6">
                  <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 leading-none mb-1">Family Profile</h3>
                        <p className="text-slate-500 font-medium text-sm">Update your family identity</p>
                      </div>
                      <Settings className="text-slate-200" size={32} />
                    </div>

                    {household && <HouseholdSetup profile={profile} isEditing={true} existingData={household} />}
                  </div>

                  <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                     {household && <HouseholdSettings household={household} />}
                  </div>

                  <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                     {household && <RewardsManager household={household} />}
                  </div>

                  <PushNotificationCard uid={profile.uid} />
                </div>

              <SuggestFeature
                userId={profile.uid}
                userName={profile.displayName}
                householdId={household?.id || ''}
                householdName={household?.name || ''}
              />
            </motion.div>
          )}

          {activeTab === 'library' && household && (
            <motion.div
              key="library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <TaskLibrary
                householdId={household.id}
                members={members}
                profile={profile}
                currency={household.currency}
              />
            </motion.div>
          )}

          {activeTab === 'report' && household && (
            <motion.div
              key="report"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-1">The Bank</h2>
                <p className="text-slate-400 font-medium text-sm">Settle accounts &amp; view transaction history</p>
              </div>

              {/* ── Child account balance cards ── */}
              {children.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-4">
                  {children.map(child => {
                    const childPaid = redemptions.filter(r => r.childId === child.uid && r.status === 'paid').reduce((sum, r) => sum + r.pointsSpent, 0);
                    const childPending = redemptions.filter(r => r.childId === child.uid && r.status === 'pending').reduce((sum, r) => sum + r.pointsSpent, 0);
                    // Floor at 0 — guards against legacy negatives from concurrent deductions
                    const bankSafePoints = Math.max(0, child.totalPoints ?? 0);
                    return (
                      <div key={child.uid} className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                        {/* Card header */}
                        <div className="p-5 flex items-center gap-3">
                          <div
                            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg flex-shrink-0 overflow-hidden shadow-md"
                            style={{ backgroundColor: child.avatarColour || familyColourHex }}
                          >
                            {child.profilePhoto
                              ? <img src={child.profilePhoto} className="w-full h-full object-cover" alt="" />
                              : child.displayName[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-900 truncate">{child.displayName}</p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {childPending > 0 && (
                                <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                  {household.currency}{childPending} pending
                                </span>
                              )}
                              {childPaid > 0 && (
                                <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                  {household.currency}{childPaid} paid
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-2xl font-black text-slate-900">{household.currency}{bankSafePoints}</p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">owed</p>
                          </div>
                        </div>

                        {/* Settle actions */}
                        {bankSafePoints > 0 ? (
                          <div className="border-t border-slate-100 px-5 py-3 flex gap-2">
                            <button
                              onClick={() => { setPayingChild(child); setAdHocAmount(bankSafePoints); setInitiatePaymentError(null); }}
                              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md shadow-indigo-100 active:scale-95"
                            >
                              Settle Full · {household.currency}{bankSafePoints}
                            </button>
                            <button
                              onClick={() => { setPayingChild(child); setAdHocAmount(0); setInitiatePaymentError(null); }}
                              className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                            >
                              Partial
                            </button>
                          </div>
                        ) : (
                          <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-2 text-emerald-600">
                            <CheckCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Account settled</span>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}

              {/* Transaction history — the one log, with inline approve/reject/pay actions
                  for pending or approved redemptions (folded in from the old per-child
                  WalletLedger accordion, which just duplicated this same data). */}
              <TaskStatement
                householdId={household.id}
                onRequestPayment={(redemption) => setSelectedRedemptionForPayment(redemption)}
                profile={profile}
                members={members}
                currency={household.currency}
                isParent={true}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center justify-around z-50">
        <button
          onClick={() => setActiveTab('review')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'review' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'review' ? 'bg-indigo-100' : ''}`}>
            <CheckCircle size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Review</span>
        </button>
        <button
          onClick={() => setActiveTab('family')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'family' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'family' ? 'bg-indigo-100' : ''}`}>
            <Users size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Family</span>
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'library' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'library' ? 'bg-indigo-100' : ''}`}>
            <BookOpen size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">Templates</span>
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'report' ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className={`p-2 rounded-xl ${activeTab === 'report' ? 'bg-indigo-100' : ''}`}>
            <Banknote size={20} />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest">The Bank</span>
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

      {showCreateTask && household && (
        <CreateTaskForm 
          householdId={household.id} 
          members={members} 
          onClose={() => setShowCreateTask(false)} 
        />
      )}

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

      {/* Payment Confirmation Modal */}
      {selectedRedemptionForPayment && (
        <PaymentConfirmationModal
          isOpen={!!selectedRedemptionForPayment}
          onClose={() => setSelectedRedemptionForPayment(null)}
          redemption={selectedRedemptionForPayment}
          profile={profile}
          householdCurrency={household?.currency || 'R'}
          members={members}
          emailEnabled={household?.emailNotificationsEnabled !== false}
        />
      )}

      {/* Dispute Resolution Modal */}
      <AnimatePresence>
        {resolvingDispute && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] w-full sm:max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-red-600">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <AlertTriangle size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-red-200 uppercase tracking-widest mb-0.5">Active Dispute</p>
                    <h3 className="text-base font-black text-white leading-snug">Resolve Dispute</h3>
                  </div>
                </div>
                <button
                  onClick={closeResolveModal}
                  disabled={resolveSubmitting}
                  className="p-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors disabled:opacity-40"
                >
                  <X size={18} />
                </button>
              </div>

              {resolveSuccess ? (
                /* ── Success state ── */
                <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                  <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-1">
                    <CheckCircle size={28} className="text-green-600" />
                  </div>
                  <h4 className="text-lg font-black text-slate-900">Dispute Resolved</h4>
                  <p className="text-sm text-slate-500 font-medium">The dispute has been marked as resolved and recorded.</p>
                </div>
              ) : (
                <>
                  {/* Body */}
                  <div className="px-6 py-5 space-y-4">
                    {/* Dispute summary */}
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">
                        Raised by {resolvingDispute.raisedByName}
                      </p>
                      <p className="text-sm font-bold text-slate-700">{resolvingDispute.reason}</p>
                    </div>

                    {/* Resolution text */}
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                        How was this resolved?<span className="text-red-500 ml-0.5">*</span>
                      </label>
                      <textarea
                        value={resolutionText}
                        onChange={(e) => setResolutionText(e.target.value)}
                        placeholder="Describe the outcome clearly so it's recorded for the family…"
                        rows={4}
                        disabled={resolveSubmitting}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-900 focus:border-red-400 focus:bg-white transition-all outline-none resize-none disabled:opacity-60"
                      />
                    </div>

                    {/* Error */}
                    {resolveError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                        <p className="text-xs font-bold text-red-600">{resolveError}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-6 pb-6 flex gap-3">
                    <button
                      onClick={closeResolveModal}
                      disabled={resolveSubmitting}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!resolutionText.trim() || resolveSubmitting}
                      onClick={handleConfirmResolve}
                      className="flex-1 py-3 bg-red-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {resolveSubmitting ? (
                        <><Loader2 size={14} className="animate-spin" /> Saving…</>
                      ) : (
                        '✓ Mark Resolved'
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settle Account Modal — parent-initiated payment */}
      <AnimatePresence>
        {payingChild && (
          <div className="fixed inset-0 flex items-center justify-center z-[110] p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPayingChild(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="bg-indigo-600 p-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <Banknote size={24} className="text-white" />
                  </div>
                  <div>
                    <p className="text-indigo-200 text-[10px] font-black uppercase tracking-widest">Settle Account</p>
                    <h2 className="text-white font-black text-xl">{payingChild.displayName}</h2>
                  </div>
                </div>
                <button onClick={() => setPayingChild(null)} className="p-2 hover:bg-white/10 rounded-xl text-white transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {/* Balance summary */}
                {(() => { const modalSafePoints = Math.max(0, payingChild.totalPoints ?? 0); return (<>
                <div className="bg-slate-50 rounded-2xl p-5 flex items-center justify-between border border-slate-100">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Balance</p>
                    <p className="text-2xl font-black text-slate-900">{modalSafePoints} pts</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cash Value</p>
                    <p className="text-2xl font-black text-emerald-600">{household?.currency}{modalSafePoints}</p>
                  </div>
                </div>

                {/* Amount input */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Amount to Pay (pts)
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      min={1}
                      max={modalSafePoints}
                      value={adHocAmount || ''}
                      onChange={e => setAdHocAmount(Math.min(Number(e.target.value), modalSafePoints))}
                      placeholder="Enter amount"
                      className="flex-1 bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-2xl font-black text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    />
                    <div className="text-center">
                      <p className="text-[10px] font-black text-slate-400 uppercase">= Cash</p>
                      <p className="text-xl font-black text-emerald-600">{household?.currency}{adHocAmount || 0}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {[25, 50, 100].filter(v => v <= modalSafePoints).map(v => (
                      <button key={v} type="button" onClick={() => setAdHocAmount(v)}
                        className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                        {v}
                      </button>
                    ))}
                    <button type="button" onClick={() => setAdHocAmount(modalSafePoints)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-black rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all">
                      All ({modalSafePoints})
                    </button>
                  </div>
                </div>

                {/* Error feedback */}
                {initiatePaymentError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-bold">
                    <AlertCircle size={16} className="shrink-0" />
                    {initiatePaymentError}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setPayingChild(null); setInitiatePaymentError(null); }}
                    className="flex-1 py-4 rounded-2xl font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!adHocAmount || adHocAmount <= 0 || adHocAmount > modalSafePoints || initiatingPayment}
                    onClick={handleInitiatePayment}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  >
                    {initiatingPayment ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      <><Banknote size={18} /> Record Payment</>
                    )}
                  </button>
                </div>
                <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  Points will be deducted from {payingChild.displayName}'s balance
                </p>
              </> ); })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Full-size Receipt Modal */}
      <AnimatePresence>
        {selectedReceiptUrl && (
          <div className="fixed inset-0 flex items-center justify-center z-[200] p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReceiptUrl(null)}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-2xl w-full"
            >
              <img src={selectedReceiptUrl} className="w-full rounded-[2rem] shadow-2xl border-4 border-white/10" alt="Receipt" />
              <button 
                onClick={() => setSelectedReceiptUrl(null)}
                className="absolute -top-12 right-0 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Proposal Review Modal */}
      <AnimatePresence>
        {reviewingProposal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-end sm:items-center justify-center sm:p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] w-full sm:max-w-lg shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">Proposal from {reviewingProposal.assignedToName}</p>
                  <h3 className="text-xl font-black text-slate-900">{reviewingProposal.title}</h3>
                </div>
                <button onClick={() => setReviewingProposal(null)} className="p-2 bg-slate-100 text-slate-400 rounded-xl">
                  <X size={20} />
                </button>
              </div>

              {/* Editable fields */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Description (child's reason) */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Child's Reason</label>
                  <textarea
                    value={proposalDescription}
                    onChange={e => setProposalDescription(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-medium text-sm resize-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Add or edit the task description…"
                  />
                </div>

                {/* Points */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Reward (points)</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={proposalPoints}
                    onChange={e => setProposalPoints(Math.max(1, Math.min(10000, parseInt(e.target.value) || 1)))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                {/* KPI */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
                  <label className="block text-xs font-black text-indigo-700 uppercase tracking-widest mb-1">Quality Standard (KPI)</label>
                  <p className="text-[11px] text-indigo-500 font-medium mb-2">What does "done" look like? Your child will see this before starting.</p>
                  <textarea
                    value={proposalKpi}
                    onChange={e => setProposalKpi(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl outline-none font-bold text-sm resize-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="e.g. Car is clean inside and out, windows streak-free."
                  />
                </div>

                {/* Due date */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Due Date (optional)</label>
                  <input
                    type="date"
                    value={proposalDueDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setProposalDueDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:ring-2 focus:ring-indigo-400"
                  />
                </div>

                {/* Proof requirement */}
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="font-black text-slate-800 text-sm">Require Photo Proof</p>
                    <p className="text-xs text-slate-400 font-medium">Child must upload a photo to submit</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProposalRequiresProof(p => !p)}
                    className={`w-12 h-7 rounded-full transition-all relative flex-shrink-0 ${proposalRequiresProof ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${proposalRequiresProof ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* Evidence type */}
                {proposalRequiresProof && (
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Evidence Type</label>
                    <select
                      value={proposalEvidenceType}
                      onChange={e => setProposalEvidenceType(e.target.value as EvidenceType)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold focus:ring-2 focus:ring-indigo-400"
                    >
                      <option value="photo">Photo</option>
                      <option value="document">Document</option>
                      <option value="grade">Grade / Score</option>
                      <option value="any">Any Proof</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Footer actions */}
              <div className="flex gap-3 p-6 border-t border-slate-100 flex-shrink-0">
                <button
                  onClick={() => handleDeclineProposal(reviewingProposal)}
                  disabled={proposalSubmitting}
                  className="px-5 py-3 bg-slate-100 text-slate-600 text-sm font-black rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  onClick={handleApproveProposal}
                  disabled={proposalSubmitting}
                  className="flex-1 py-3 bg-indigo-600 text-white text-sm font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {proposalSubmitting
                    ? <Loader2 size={18} className="animate-spin" />
                    : <><CheckCircle size={18} /> Approve & Start</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Re-open Forfeited Task Modal ── */}
      <AnimatePresence>
        {reopenTask && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-end sm:items-center justify-center sm:p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] w-full sm:max-w-md shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-0.5">Re-open Task</p>
                  <h3 className="text-lg font-black text-slate-900 leading-snug">{reopenTask.title}</h3>
                </div>
                <button
                  onClick={() => { setReopenTask(null); setReopenDate(''); }}
                  className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Task summary */}
                <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned to</span>
                    <span className="text-sm font-black text-slate-700">{reopenTask.assignedToName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Reward</span>
                    <span className="text-sm font-black text-slate-700">{household?.currency}{reopenTask.pointValue}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Type</span>
                    <span className="text-sm font-black text-slate-700 capitalize">
                      {reopenTask.recurrence ? `${reopenTask.taskType} (recurring)` : 'One-off'}
                    </span>
                  </div>
                </div>

                {/* New due date */}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                    {reopenTask.recurrence ? 'New End Date' : 'New Due Date'}
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <p className="text-[11px] text-slate-400 font-medium mb-2">
                    {reopenTask.recurrence
                      ? 'The recurring task will run until this date. Must be a future date.'
                      : 'Set a future deadline — a past date will cause the task to forfeit again immediately.'}
                  </p>
                  <input
                    type="date"
                    value={reopenDate}
                    min={(() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      return tomorrow.toISOString().split('T')[0];
                    })()}
                    onChange={e => setReopenDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>

                {/* Warning */}
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl p-3">
                  <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                    The task will be reset to <strong>Pending</strong> and {reopenTask.assignedToName} will be able to complete it again. Previous proof and completion records will be cleared.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => { setReopenTask(null); setReopenDate(''); }}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReopenTask}
                  disabled={!reopenDate || reopeningTask}
                  className="flex-1 px-4 py-3 bg-amber-500 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {reopeningTask ? (
                    <><Loader2 size={16} className="animate-spin" /> Reopening…</>
                  ) : (
                    '↩ Confirm Re-open'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
