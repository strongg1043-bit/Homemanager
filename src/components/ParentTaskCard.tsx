import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Task, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../lib/notifications';
import { sendTaskApprovedEmail, sendTaskNeedsRetryEmail } from '../lib/email';
import { 
  Check, X, AlertCircle, User, Calendar, 
  Image as ImageIcon, ClipboardCheck, Info,
  Camera, Eye, ArrowRight, CornerUpLeft, 
  Sparkles, ShieldCheck, History, AlertTriangle, Trash2
} from 'lucide-react';

interface ParentTaskCardProps {
  task: Task;
  childName: string;
  currency: string;
  members: UserProfile[];
  onViewAudit?: (task: Task) => void;
  onOpenDispute?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
}

const TYPE_STYLES: Record<string, string> = {
  daily: 'bg-green-100 text-green-800',
  weekly: 'bg-blue-100 text-blue-800',
  monthly: 'bg-pink-100 text-pink-800',
  adhoc_date: 'bg-amber-100 text-amber-800',
  adhoc_kpi: 'bg-purple-100 text-purple-800',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting to start',
  accepted: 'In progress',
  submitted: 'Ready for review',
  approved: 'Approved ✓',
  needs_retry: 'Re-do requested',
  missed: 'Missed deadline',
  forfeited: 'Forfeited'
};

const ParentTaskCard: React.FC<ParentTaskCardProps> = ({ task, childName, currency, members, onViewAudit, onOpenDispute, onDelete }) => {
  const [submitting, setSubmitting] = useState(false);
  const [showFullPhoto, setShowFullPhoto] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      // Atomic batch: task status + point award land together or not at all.
      const batch = writeBatch(db);
      batch.update(doc(db, 'households', task.householdId, 'tasks', task.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'users', task.assignedTo), {
        totalPoints: increment(task.pointValue),
      });
      await batch.commit();

      await createNotification(
        task.householdId, task.assignedTo, 'child',
        'task_approved',
        'Task approved! ✅',
        `"${task.title}" has been approved. +${task.pointValue} points added to your wallet!`,
        '✅', { taskId: task.id }
      );

      // Send Email
      const child = members.find(m => m.uid === task.assignedTo);
      if (child?.email) {
        sendTaskApprovedEmail(child.email, child.displayName || 'Child', task.title, task.pointValue || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNeedsRetry = async () => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'households', task.householdId, 'tasks', task.id), {
        status: 'needs_retry',
        completedAt: null,
      });

      await createNotification(
        task.householdId, task.assignedTo, 'child',
        'task_needs_retry',
        'Give it another go 💪',
        `"${task.title}" needs a little more work. Check the feedback and try again!`,
        '💪', { taskId: task.id }
      );

      // Send Email
      const child = members.find(m => m.uid === task.assignedTo);
      if (child?.email) {
        sendTaskNeedsRetryEmail(child.email, child.displayName || 'Child', task.title);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const isSubmitted = task.status === 'submitted';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm flex flex-col h-full`}
    >
      <div className="p-8 flex-1 flex flex-col">
        {/* Top Info */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
              <User size={20} />
            </div>
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{childName}</div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${TYPE_STYLES[task.taskType || 'adhoc_date']}`}>
                {(task.taskType || 'adhoc_date').replace('_', ' ')}
              </span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div className="text-xl font-black text-slate-900">{task.pointValue} pts</div>
            <div className="flex gap-1">
              <button 
                onClick={() => onViewAudit?.(task)}
                className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                title="View Audit Trail"
              >
                <History size={14} />
              </button>
              <button 
                onClick={() => onOpenDispute?.(task)}
                className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                title="Raise Dispute"
              >
                <AlertTriangle size={14} />
              </button>
              <button 
                onClick={() => {
                  if (confirm('Are you sure you want to delete this task?')) {
                    onDelete?.(task.id);
                  }
                }}
                className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                title="Delete Task"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        <h3 className="text-xl font-black text-slate-900 mb-4 leading-tight">{task.title}</h3>

        {/* Quality Standard Info */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 group cursor-help relative">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck size={14} className="text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Required Quality</span>
          </div>
          <p className="text-sm font-bold text-slate-600 italic">"{task.kpi}"</p>
        </div>

        {/* Evidence Area */}
        <div className="grid gap-4 mb-6">
          {task.proofPhotoUrl ? (
            <div className="grid grid-cols-2 gap-3">
              {task.beforePhotoUrl && (
                <div className="relative aspect-square rounded-2xl overflow-hidden border border-slate-100 opacity-60">
                  <span className="absolute top-2 left-2 bg-slate-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest z-10">Before</span>
                  <img src={task.beforePhotoUrl} className="w-full h-full object-cover" alt="Ref" referrerPolicy="no-referrer" />
                </div>
              )}
              <div className={`${task.beforePhotoUrl ? 'col-span-1' : 'col-span-2'} relative aspect-square rounded-2xl overflow-hidden border-2 border-indigo-200 shadow-lg shadow-indigo-50 group`}>
                <span className="absolute top-2 left-2 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest z-10">Submission</span>
                <img src={task.proofPhotoUrl} className="w-full h-full object-cover" alt="Proof" referrerPolicy="no-referrer" />
                <button 
                  onClick={() => setShowFullPhoto(true)}
                  className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Eye className="text-white" />
                </button>
              </div>
            </div>
          ) : task.beforePhotoUrl && (
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-100 opacity-40">
               <span className="absolute top-2 left-2 bg-slate-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest z-10">Standard Ref</span>
               <img src={task.beforePhotoUrl} className="w-full h-full object-cover" alt="Ref" referrerPolicy="no-referrer" />
            </div>
          )}
        </div>

        {/* Action Area */}
        <div className="mt-auto pt-6 border-t border-slate-100">
          {isSubmitted ? (
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleNeedsRetry}
                disabled={submitting}
                className="py-4 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-50 hover:text-red-600 transition-all"
              >
                <CornerUpLeft size={18} /> Retry
              </button>
              <button 
                onClick={handleApprove}
                disabled={submitting}
                className="py-4 bg-emerald-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 group"
              >
                <span>Approve</span>
                <Check size={18} className="group-hover:scale-125 transition-transform" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-slate-400" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {STATUS_LABELS[task.status] || task.status}
                </span>
              </div>
              <ArrowRight size={14} className="text-slate-200" />
            </div>
          )}
        </div>
      </div>

      {/* Full Photo Modal */}
      <AnimatePresence>
        {showFullPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 backdrop-blur z-[100] flex items-center justify-center p-8"
            onClick={() => setShowFullPhoto(false)}
          >
            <button className="absolute top-8 right-8 text-white p-4">
              <X size={32} />
            </button>
            <img 
              src={task.proofPhotoUrl!} 
              className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain border-4 border-white/10" 
              alt="Verification" 
              referrerPolicy="no-referrer"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ParentTaskCard;
