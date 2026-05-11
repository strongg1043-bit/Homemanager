import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Task, Redemption, Notification, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Clock, CheckCircle, Camera, Banknote, 
  AlertTriangle, History, ArrowRight, User,
  Calendar, Shield
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  task?: Task;
  redemption?: Redemption;
  profile: UserProfile;
}

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  date: any;
  icon: React.ReactNode;
  color: string;
  details?: React.ReactNode;
}

export default function AuditTrailDrawer({ isOpen, onClose, task, redemption, profile }: Props) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    const generateEvents = async () => {
      setLoading(true);
      const timeline: TimelineEvent[] = [];
      const householdId = task?.householdId || redemption?.householdId;
      
      if (!householdId) return;

      // 1. Task Creation
      if (task) {
        timeline.push({
          id: 'task-created',
          type: 'creation',
          title: 'TASK CREATED',
          description: `Created by ${task.proposedBy === 'parent' ? 'Parent' : 'Child'}`,
          date: task.createdAt,
          icon: <PlusCircle size={18} />,
          color: 'bg-purple-500',
          details: (
            <div className="mt-2 space-y-1 text-[11px] text-slate-500 font-medium bg-slate-50 p-2 rounded-lg">
              <div className="flex justify-between"><span>Title:</span> <span className="text-slate-900">{task.title}</span></div>
              <div className="flex justify-between"><span>Reward:</span> <span className="text-slate-900">{task.pointValue} points</span></div>
              <div className="flex justify-between"><span>KPI:</span> <span className="text-slate-900">{task.kpi}</span></div>
            </div>
          )
        });

        if (task.childAcceptedAt) {
          timeline.push({
            id: 'task-accepted',
            type: 'acceptance',
            title: 'TASK ACCEPTED',
            description: `${task.assignedToName} accepted the mission`,
            date: task.childAcceptedAt,
            icon: <Shield size={18} />,
            color: 'bg-indigo-500',
            details: <p className="text-[11px] text-slate-500 mt-1 italic">Reward and KPI locked for accountability.</p>
          });
        }

        if (task.completedAt) {
          timeline.push({
            id: 'task-submitted',
            type: 'submission',
            title: 'PROOF SUBMITTED',
            description: `${task.assignedToName} completed the task`,
            date: task.completedAt,
            icon: <Camera size={18} />,
            color: 'bg-amber-500',
            details: task.proofPhotoUrl ? (
              <img src={task.proofPhotoUrl} className="mt-2 rounded-lg w-full h-24 object-cover border border-slate-200" alt="Proof" />
            ) : null
          });
        }

        if (task.approvedAt) {
          timeline.push({
            id: 'task-approved',
            type: 'approval',
            title: 'TASK APPROVED',
            description: 'Approved by Parent',
            date: task.approvedAt,
            icon: <CheckCircle size={18} />,
            color: 'bg-emerald-500',
            details: <div className="text-[11px] font-black text-emerald-600 mt-1">+{task.pointValue} points awarded</div>
          });
        }
      }

      // 2. Redemption Flow
      if (redemption) {
        timeline.push({
          id: 'redemption-created',
          type: 'redemption_requested',
          title: redemption.type === 'cash' ? 'CASH-OUT REQUESTED' : 'REWARD REDEEMED',
          description: `${redemption.childName} requested ${redemption.title}`,
          date: redemption.createdAt,
          icon: <Banknote size={18} />,
          color: redemption.type === 'cash' ? 'bg-amber-500' : 'bg-purple-500',
          details: (
            <div className="mt-2 space-y-1 text-[11px] text-slate-500 font-medium bg-slate-50 p-2 rounded-lg">
              <div className="flex justify-between"><span>Amount:</span> <span className="text-slate-900">{redemption.pointsSpent} points</span></div>
              {redemption.type === 'cash' && (
                <div className="flex justify-between"><span>Value:</span> <span className="text-slate-900">R{redemption.pointsSpent}</span></div>
              )}
            </div>
          )
        });

        if (redemption.paidAt) {
          timeline.push({
            id: 'redemption-paid',
            type: 'payment',
            title: 'PAYMENT CONFIRMED',
            description: `Paid by ${redemption.paidByName || 'Parent'}`,
            date: redemption.paidAt,
            icon: <CheckCircle size={18} />,
            color: 'bg-emerald-500',
            details: (
              <div className="mt-2 space-y-1 text-[11px] text-slate-500 font-medium bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                <div className="flex justify-between"><span>Method:</span> <span className="text-emerald-900 capitalize">{redemption.paymentMethod?.replace('_', ' ')}</span></div>
                {redemption.paymentReference && (
                  <div className="flex justify-between"><span>Reference:</span> <span className="text-emerald-900">{redemption.paymentReference}</span></div>
                )}
                {redemption.proofPhotoUrl && (
                  <div className="mt-2">
                    <span className="block mb-1">Receipt:</span>
                    <img src={redemption.proofPhotoUrl} className="rounded-lg w-full h-24 object-cover border border-emerald-200" alt="Receipt" />
                  </div>
                )}
              </div>
            )
          });
        }
      }

      // 3. Disputes (FETCH from Firestore)
      const disputesQ = query(
        collection(db, 'households', householdId, 'disputes'),
        where(task ? 'taskId' : 'redemptionId', '==', task?.id || redemption?.id)
      );
      const disputesSnap = await getDocs(disputesQ);
      disputesSnap.docs.forEach(d => {
        const data = d.data();
        timeline.push({
          id: d.id,
          type: 'dispute',
          title: 'DISPUTE RAISED',
          description: `By ${data.raisedByName} (${data.raisedByRole})`,
          date: data.createdAt,
          icon: <AlertTriangle size={18} />,
          color: 'bg-red-500',
          details: (
             <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-[11px] font-black text-red-900 uppercase">Reason:</p>
                <p className="text-[11px] text-red-700 mt-0.5">{data.reason}</p>
                {data.status === 'resolved' && (
                  <div className="mt-2 pt-2 border-t border-red-200 italic text-[10px] text-red-600">
                    Resolved: {data.resolution}
                  </div>
                )}
             </div>
          )
        });
      });

      // Sort all events by date
      timeline.sort((a, b) => {
        const dateA = a.date?.toMillis() || 0;
        const dateB = b.date?.toMillis() || 0;
        return dateA - dateB;
      });

      setEvents(timeline);
      setLoading(false);
    };

    generateEvents();
  }, [isOpen, task, redemption]);

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '...';
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Date Unknown';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[101] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-50 rounded-xl">
                  <History className="text-slate-400" size={20} />
                </div>
                <div>
                  <h2 className="font-black text-slate-900 uppercase tracking-tight">Audit Trail</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Record of {task ? 'Task' : 'Payment'}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Building timeline...</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical Line */}
                  <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-slate-100" />

                  <div className="space-y-8">
                    {events.map((event, idx) => (
                      <div key={event.id} className="relative pl-10">
                        {/* Circle */}
                        <div className={`absolute left-0 top-1 w-7 h-7 ${event.color} rounded-full flex items-center justify-center text-white shadow-sm ring-4 ring-white z-10`}>
                          {event.icon}
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{event.title}</span>
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{formatDateTime(event.date)}</span>
                          </div>
                          <p className="text-xs font-medium text-slate-500 mt-0.5">{event.description}</p>
                          {event.details && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="mt-1"
                            >
                              {event.details}
                            </motion.div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-12 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-widest border border-emerald-100">
                      <CheckCircle size={14} />
                      {events.some(e => e.type === 'payment' || e.type === 'approval') ? 'FULLY RESOLVED' : 'IN PROGRESS'}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100">
               <p className="text-[10px] text-center text-slate-400 font-bold leading-relaxed px-4">
                 Audit trails are shared records that cannot be modified. They serve as the definitive source of truth for all household transactions.
               </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Missing icons from lucide-react
function PlusCircle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}
