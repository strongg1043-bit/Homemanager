import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, collection, query, onSnapshot, updateDoc, arrayUnion, arrayRemove, orderBy, serverTimestamp, increment, writeBatch, deleteDoc } from 'firebase/firestore';
import { UserProfile, Household, Task, Redemption, Dispute } from '../types';
import ParentTaskCard from './ParentTaskCard';
import CreateTaskForm, { resetRecurringTasks } from './CreateTaskForm';
import RewardsManager from './RewardsManager';
import HouseholdSetup from './HouseholdSetup';
import HouseholdSettings from './HouseholdSettings';
import WalletLedger from './WalletLedger';
import SuggestFeature from './SuggestFeature';
import NotificationBell from './NotificationBell';
import AuditTrailDrawer from './AuditTrailDrawer';
import PaymentConfirmationModal from './PaymentConfirmationModal';
import DisputeModal from './DisputeModal';
import EmailSettings from './EmailSettings';
import InviteMemberCard from './InviteMemberCard';
import InviteParentCard from './InviteParentCard';
import { createNotification } from '../lib/notifications';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Layout, LogOut, CheckCircle, Clock, Users, Settings, 
  Plus, MessageSquare, ShieldCheck, Star, Sparkles,
  ChevronRight, ArrowUpRight, AlertCircle, Trash2, 
  History, AlertTriangle, Receipt, Eye, X, Mail
} from 'lucide-react';

interface Props {
  profile: UserProfile;
}

export default function ParentDashboard({ profile }: Props) {
  const [activeTab, setActiveTab] = useState<'review' | 'family' | 'settings'>('review');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'email'>('general');
  const [household, setHousehold] = useState<Household | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedTaskForAudit, setSelectedTaskForAudit] = useState<Task | null>(null);
  const [selectedRedemptionForAudit, setSelectedRedemptionForAudit] = useState<Redemption | null>(null);
  const [selectedRedemptionForPayment, setSelectedRedemptionForPayment] = useState<Redemption | null>(null);
  const [selectedTaskForDispute, setSelectedTaskForDispute] = useState<Task | null>(null);
  const [selectedRedemptionForDispute, setSelectedRedemptionForDispute] = useState<Redemption | null>(null);
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState<string | null>(null);

  const handleDeleteTask = async (taskId: string) => {
    if (!profile.householdId) return;
    try {
      await deleteDoc(doc(db, 'households', profile.householdId, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  useEffect(() => {
    if (!profile.householdId) {
      setLoading(false);
      return;
    }

    const unsubHousehold = onSnapshot(doc(db, 'households', profile.householdId), async (snap) => {
      if (snap.exists()) {
        const hData = { id: snap.id, ...snap.data() } as Household;
        setHousehold(hData);
        
        // Fetch member data
        const memberData = await Promise.all(
          hData.members.map(async (uid) => {
            const uSnap = await getDoc(doc(db, 'users', uid));
            if (uSnap.exists()) return uSnap.data() as UserProfile;
            return null;
          })
        );
        setMembers(memberData.filter(Boolean) as UserProfile[]);
      } else {
        console.error("Household not found:", profile.householdId);
        setHousehold(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Household listener error:", err);
      setLoading(false);
    });

    const tasksQuery = query(collection(db, 'households', profile.householdId, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      const fetchedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
      setTasks(fetchedTasks);
      
      // Auto-reset recurring tasks
      if (profile.householdId) {
        resetRecurringTasks(profile.householdId, fetchedTasks);
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
      unsubTasks();
      unsubRedemptions();
      unsubDisputes();
    };
  }, [profile.householdId]);

  const stripUndefined = <T extends Record<string, any>>(obj: T): T => {
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined)
    ) as T;
  };

  const handleApproveProposal = async (task: Task, points: number) => {
    if (!household) return;
    try {
      await updateDoc(doc(db, 'households', household.id, 'tasks', task.id), stripUndefined({
        status: 'pending',
        pointValue: points || task.pointValue || 0,
        proposedBy: null,
        approvedAt: serverTimestamp(),
        kpiLocked: true,
        rewardLocked: true,
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineProposal = async (task: Task) => {
    if (!household) return;
    try {
      await updateDoc(doc(db, 'households', household.id, 'tasks', task.id), {
        status: 'forfeited', // Or some specific status
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveDispute = async (dispute: Dispute) => {
    const resolution = prompt("How was this dispute resolved?");
    if (!resolution) return;
    
    try {
      await updateDoc(doc(db, 'households', profile.householdId, 'disputes', dispute.id), {
        status: 'resolved',
        resolution,
        resolvedAt: serverTimestamp(),
        resolvedBy: profile.uid
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!profile.householdId) return <HouseholdSetup profile={profile} />;

  const pendingSubmissions = tasks.filter(t => t.status === 'submitted');
  const taskProposals = tasks.filter(t => t.status === 'proposed' && t.proposedBy === 'child');
  const pendingRedemptions = redemptions.filter(r => r.status === 'pending');
  const paidRedemptions = redemptions.filter(r => r.status === 'paid');
  const openDisputes = disputes.filter(d => d.status === 'open');
  const children = members.filter(m => m.role === 'child');

  const familyColour = household?.familyColour || 'indigo';
  const familyTextClass = `text-[${familyColour}]`;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Family Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black overflow-hidden shadow-lg"
              style={{ backgroundColor: familyColour }}
            >
              {household?.familyLogo ? (
                <img src={household.familyLogo} className="w-full h-full object-cover" alt="Logo" />
              ) : (
                <span className="text-xl">{household?.name?.[0]}</span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none mb-1" style={{ color: familyColour }}>
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === 'review' && (
            <motion.div 
              key="review"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              {/* Active Disputes */}
              {openDisputes.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <AlertTriangle size={20} className="text-red-600" />
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Active Disputes</h2>
                  </div>
                  <div className="space-y-4">
                    {openDisputes.map(dispute => {
                      const relatedTask = tasks.find(t => t.id === dispute.taskId);
                      const relatedRedemption = redemptions.find(r => r.id === dispute.redemptionId);
                      return (
                        <div key={dispute.id} className="bg-red-50 p-6 rounded-[2rem] border border-red-100 flex items-center justify-between gap-6">
                          <div className="flex gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-red-600 shadow-sm border border-red-100">
                              <AlertTriangle size={24} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[10px] font-black text-red-600 uppercase tracking-widest">{dispute.raisedByName} ({dispute.raisedByRole}) raised a dispute</span>
                                <span className="text-[10px] font-bold text-red-400 bg-white px-2 py-0.5 rounded-full">
                                  {dispute.createdAt?.toDate().toLocaleDateString()}
                                </span>
                              </div>
                              <h3 className="font-black text-slate-900 mb-1">Reason: {dispute.reason}</h3>
                              <p className="text-xs text-slate-500 font-medium italic">Desired: {dispute.desiredOutcome}</p>
                              {(relatedTask || relatedRedemption) && (
                                <button 
                                  onClick={() => {
                                    if (relatedTask) setSelectedTaskForAudit(relatedTask);
                                    if (relatedRedemption) setSelectedRedemptionForAudit(relatedRedemption);
                                  }}
                                  className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase text-red-600 bg-white px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors"
                                >
                                  <History size={14} /> View Audit Trail
                                </button>
                              )}
                            </div>
                          </div>
                          <button 
                            onClick={() => handleResolveDispute(dispute)}
                            className="bg-red-600 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-red-100"
                          >
                            Resolve
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Task Requests from Children (Proposals) */}
              {taskProposals.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <MessageSquare size={20} className="text-indigo-600" />
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Task Proposals</h2>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {taskProposals.map(task => (
                      <div key={task.id} className="bg-white p-6 rounded-[2rem] border border-indigo-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-12 -mt-12 opacity-50 group-hover:scale-150 transition-transform" />
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">New Proposal from {task.assignedToName}</div>
                              <h3 className="text-lg font-black text-slate-900">{task.title}</h3>
                            </div>
                            <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-black">
                              {task.pointValue} pts
                            </div>
                          </div>
                          <p className="text-slate-500 text-sm mb-6 line-clamp-2">{task.description}</p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleApproveProposal(task, task.pointValue)}
                              className="flex-1 py-3 bg-indigo-600 text-white text-xs font-black rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-indigo-100"
                            >
                              Approve & Start
                            </button>
                            <button 
                              onClick={() => handleDeclineProposal(task)}
                              className="px-4 py-3 bg-slate-100 text-slate-600 text-xs font-black rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all"
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

              {/* Task Submissions for Approval */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={20} className="text-emerald-600" />
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Ready for Review</h2>
                  </div>
                  <button 
                    onClick={() => setShowCreateTask(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 hover:scale-105 transition-all"
                  >
                    <Plus size={16} /> New Task
                  </button>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  {pendingSubmissions.length > 0 ? (
                    pendingSubmissions.map(task => (
                      <ParentTaskCard 
                        key={task.id} 
                        task={task} 
                        childName={task.assignedToName}
                        currency={household?.currency || 'R'}
                        members={members}
                        onViewAudit={setSelectedTaskForAudit}
                        onOpenDispute={setSelectedTaskForDispute}
                        onDelete={handleDeleteTask}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border border-dashed border-slate-200">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                        <Clock size={32} />
                      </div>
                      <h3 className="text-slate-400 font-black text-lg">No tasks waiting for review</h3>
                      <p className="text-slate-400 text-sm font-medium">Enjoy the peace and quiet!</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Active Tasks Section */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <Star size={20} className="text-amber-500" />
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Active Tasks (In Progress)</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-6">
                  {tasks.filter(t => t.status === 'accepted' || t.status === 'needs_retry').length > 0 ? (
                    tasks.filter(t => t.status === 'accepted' || t.status === 'needs_retry').map(task => (
                      <ParentTaskCard 
                        key={task.id} 
                        task={task} 
                        childName={task.assignedToName}
                        currency={household?.currency || 'R'}
                        members={members}
                        onViewAudit={setSelectedTaskForAudit}
                        onOpenDispute={setSelectedTaskForDispute}
                        onDelete={handleDeleteTask}
                      />
                    ))
                  ) : (
                    <div className="col-span-full py-12 text-center bg-slate-50 rounded-[2rem] border border-slate-100">
                      <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No tasks currently in progress</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Cash-out Requests */}
              {pendingRedemptions.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-6">
                    <ShieldCheck size={20} className="text-amber-500" />
                    <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Wallet Requests</h2>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {pendingRedemptions.map(redemption => (
                      <div key={redemption.id} className="bg-white p-6 rounded-[2rem] border border-amber-100 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                            <Sparkles size={24} />
                          </div>
                          <div>
                            <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-0.5">{redemption.childName} requests</div>
                            <h3 className="font-black text-slate-900">{redemption.title}</h3>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-black text-slate-900">{redemption.pointsSpent} pts</div>
                          <button 
                            onClick={() => setSelectedRedemptionForPayment(redemption)}
                            className="text-[10px] font-black uppercase text-white bg-indigo-600 hover:bg-slate-900 px-3 py-1.5 rounded-lg transition-colors mt-2"
                          >
                            Mark Paid
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Payment History */}
              <section>
                <div className="flex items-center gap-2 mb-6">
                  <History size={20} className="text-indigo-600" />
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Payment History</h2>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-sm">
                  <div className="max-h-[400px] overflow-y-auto scrollbar-hide py-2">
                    {paidRedemptions.length > 0 ? (
                      paidRedemptions.map(r => (
                        <div key={r.id} className="p-6 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-6">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                              <CheckCircle size={24} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-black text-slate-900">{r.childName} • {household?.currency}{r.pointsSpent} Paid</span>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {r.paidAt?.toDate().toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {r.paymentMethod?.replace('_', ' ')} • Ref: {r.paymentReference || 'N/A'}
                              </p>
                              {r.paymentNote && <p className="text-xs text-slate-500 font-medium mt-1">"{r.paymentNote}"</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.proofPhotoUrl && (
                              <button 
                                onClick={() => setSelectedReceiptUrl(r.proofPhotoUrl)}
                                className="flex items-center gap-1.5 text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-3 py-2 rounded-xl hover:bg-indigo-100 transition-colors"
                              >
                                <Receipt size={14} /> Receipt
                              </button>
                            )}
                            <button 
                              onClick={() => setSelectedRedemptionForAudit(r)}
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-indigo-600 hover:bg-slate-50 px-3 py-2 rounded-xl transition-all"
                            >
                              <History size={14} /> Audit Trail
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center">
                        <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No transaction history yet</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'family' && (
            <motion.div 
              key="family"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-6 font-sans">Family & Members</h2>
                
                <div className="grid md:grid-cols-2 gap-6 mb-10">
                  {/* Invite Code Card */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                    <div className="relative z-10">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">🔗 Invite Code</h3>
                      <p className="text-sm text-slate-500 mb-6 font-medium">Share this code with family members to join {household?.name}</p>
                      <div className="bg-slate-50 rounded-2xl p-6 flex flex-col items-center justify-center border border-slate-100">
                        <div className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1">Household Code</div>
                        <div className="text-4xl font-black text-indigo-600 tracking-widest font-mono mb-4">{household?.inviteCode}</div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(household?.inviteCode || '');
                            alert('Code copied! Share it with family members to join.');
                          }}
                          className="w-full bg-indigo-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                        >
                          📋 Copy Code
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Invite Member Card */}
                  {household && (
                    <InviteMemberCard 
                      householdId={household.id}
                      householdName={household.name}
                      householdCode={household.inviteCode}
                    />
                  )}
                </div>

                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Active Members</h3>
                </div>
              </div>

              <div className="grid gap-6">
                {children.map(child => (
                  <div key={child.uid} className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="p-8 flex flex-wrap items-center justify-between gap-6">
                      <div className="flex items-center gap-6">
                        <div 
                          className="w-20 h-20 rounded-[2rem] flex items-center justify-center text-white font-black text-3xl shadow-lg"
                          style={{ backgroundColor: child.avatarColour || familyColour }}
                        >
                          {child.profilePhoto ? (
                            <img src={child.profilePhoto} className="w-full h-full object-cover" alt="Profile" />
                          ) : (
                            child.displayName[0].toUpperCase()
                          )}
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-slate-900">{child.displayName}</h3>
                          <div className="flex items-center gap-2 mt-2">
                            <div className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                              ⭐ Trust Score: {child.trustScore || 100}
                            </div>
                            <div className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest rounded-full">
                              {child.badges?.length || 0} Badges
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-10">
                        <div className="text-center">
                          <div className="text-3xl font-black text-slate-900 tracking-tight">{child.totalPoints}</div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Available Points</div>
                        </div>
                        <button className="p-4 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all">
                          <ChevronRight size={24} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
              
              <div className="flex gap-4 p-1 bg-slate-100 rounded-2xl w-fit mb-8">
                <button 
                  onClick={() => setActiveSettingsTab('general')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeSettingsTab === 'general' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  General
                </button>
                <button 
                  onClick={() => setActiveSettingsTab('email')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeSettingsTab === 'email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Email
                </button>
              </div>

              {activeSettingsTab === 'general' ? (
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
                </div>
              ) : (
                <EmailSettings />
              )}

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
        />
      )}

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
    </div>
  );
}
