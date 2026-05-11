import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, Task } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../lib/notifications';
import { 
  Camera, CheckCircle, Info, Loader2, Calendar, 
  Image as ImageIcon, ClipboardCheck, Sparkles,
  PlayCircle, Clock, AlertCircle, RotateCcw,
  History, AlertTriangle
} from 'lucide-react';
import { compressToBase64 } from '../lib/imageUtils';
import { TYPE_STYLES, CHILD_STATUS_LABELS } from '../lib/taskConstants';

interface ChildTaskCardProps {
  task: Task;
  currency: string;
  onUpdated: () => void;
  parents?: UserProfile[];
  profile?: UserProfile;
  onViewAudit?: (task: Task) => void;
  onOpenDispute?: (task: Task) => void;
}


const ChildTaskCard: React.FC<ChildTaskCardProps> = ({ task, currency, onUpdated, parents = [], profile, onViewAudit, onOpenDispute }) => {
  const [proofUrl, setProofUrl] = useState<string | null>(task.proofPhotoUrl ?? null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(task.proofPhotoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showKpi, setShowKpi] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAccept = async () => {
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'households', task.householdId, 'tasks', task.id), {
        status: 'accepted',
        childAcceptedAt: serverTimestamp(),
        rewardLocked: true,
        kpiLocked: true,
      });
      onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const base64 = await compressToBase64(file, 800, 0.7);
      setPreviewSrc(base64);
      setProofUrl(base64);
      await updateDoc(doc(db, 'households', task.householdId, 'tasks', task.id), {
        proofPhotoUrl: base64
      });
    } catch (err) {
      setError('Photo setup failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleComplete = async () => {
    if (task.requiresProof && !proofUrl) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, 'households', task.householdId, 'tasks', task.id), {
        status: 'submitted',
        completedAt: serverTimestamp(),
      });

      // Notify ALL parents
      if (profile) {
        for (const parent of parents) {
          await createNotification(
            task.householdId, parent.uid, 'parent',
            'task_submitted',
            'Ready for review 📸',
            `${profile.displayName} completed "${task.title}" and submitted proof. Tap to review!`,
            '📸', { taskId: task.id }
          );
        }
      }

      onUpdated();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = task.status === 'pending';
  const isAccepted = task.status === 'accepted';
  const needsProof = task.requiresProof && !proofUrl;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col h-full"
    >
      {/* Visual Header */}
      {task.beforePhotoUrl ? (
        <div className="relative aspect-video w-full">
          <img src={task.beforePhotoUrl} alt="Before" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
            <span className="text-white text-xs font-black uppercase tracking-widest bg-amber-500/80 backdrop-blur px-3 py-1 rounded-full flex items-center gap-2">
              <Camera size={12} /> Standard Reference
            </span>
          </div>
        </div>
      ) : (
        <div className={`h-2 text-white ${TYPE_STYLES[task.taskType || 'adhoc_date'].split(' ')[0]}`} />
      )}

      <div className="p-8 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${TYPE_STYLES[task.taskType || 'adhoc_date']}`}>
              {(task.taskType || 'adhoc_date').replace('_', ' ')}
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-2 leading-tight">{task.title}</h3>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-black whitespace-nowrap">
              {task.pointValue} pts
            </div>
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
            </div>
          </div>
        </div>

        {/* KPI / Done Section */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6 relative">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck size={16} className="text-indigo-600" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">What does 'Done' look like?</span>
          </div>
          <p className="text-sm font-bold text-slate-600 leading-relaxed italic">
            "{task.kpi}"
          </p>
        </div>

        {/* Action Area */}
        <div className="mt-auto space-y-4">
          {isPending ? (
            <button 
              onClick={handleAccept}
              disabled={submitting}
              className="w-full py-4 bg-indigo-600 hover:bg-slate-900 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 transition-all active:scale-95 group"
            >
              {submitting ? <Loader2 className="animate-spin" /> : (
                <>
                  <span>Accept this Mission</span>
                  <PlayCircle size={20} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          ) : (
            <>
              {/* Status Badge */}
              <div className="flex items-center gap-2 mb-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <Clock size={16} className="text-indigo-500" />
                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  {CHILD_STATUS_LABELS[task.status] || task.status}
                </span>
              </div>

              {task.status === 'accepted' || task.status === 'needs_retry' ? (
                <div className="space-y-4">
                  {task.requiresProof && (
                    <div className="space-y-3">
                      <input 
                        ref={fileInputRef} 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFileChange} 
                      />
                      {previewSrc ? (
                        <div className="relative rounded-2xl overflow-hidden aspect-video border-2 border-indigo-200">
                          <img src={previewSrc} className="w-full h-full object-cover" alt="Proof" referrerPolicy="no-referrer" />
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="absolute bottom-3 right-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-black text-slate-900 shadow-lg flex items-center gap-2"
                          >
                            <Camera size={14} /> Change Photo
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-6 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-indigo-300 hover:bg-indigo-50 transition-all group"
                        >
                          <Camera size={24} className="group-hover:text-indigo-600 transition-colors" />
                          <span className="text-xs font-black uppercase tracking-widest">Take a Photo for Proof</span>
                        </button>
                      )}
                    </div>
                  )}

                  <button 
                    onClick={handleComplete}
                    disabled={submitting || needsProof}
                    className={`w-full py-4 text-white font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl ${
                      needsProof ? 'bg-slate-300 shadow-none cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                    }`}
                  >
                    {submitting ? <Loader2 className="animate-spin" /> : (
                      <>
                        <CheckCircle size={20} />
                        <span>Ready for Review</span>
                      </>
                    )}
                  </button>
                </div>
              ) : null}
            </>
          )}

          {task.status === 'approved' && (
            <div className="flex items-center gap-2 text-emerald-600 font-black text-sm justify-center py-2">
              <Sparkles size={18} /> MISSION COMPLETE
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ChildTaskCard;
