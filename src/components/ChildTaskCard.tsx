import React, { useState, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, Task } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { createNotification } from '../lib/notifications';
import {
  Camera, CheckCircle, Loader2, Calendar,
  ClipboardCheck, Sparkles,
  PlayCircle, Clock,
  History, AlertTriangle, MessageSquare, Eye, ChevronDown, ChevronUp,
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
  /** Controlled accordion state — provided by parent so only one card is open at a time */
  isExpanded?: boolean;
  onToggle?: () => void;
}

// Accent strip colour per task type (left border)
const ACCENT_COLOURS: Record<string, string> = {
  daily:      'bg-green-400',
  weekly:     'bg-blue-400',
  monthly:    'bg-pink-400',
  adhoc_date: 'bg-amber-400',
  adhoc_kpi:  'bg-purple-400',
};

const ChildTaskCard: React.FC<ChildTaskCardProps> = ({
  task, onUpdated, parents = [], profile, onViewAudit, onOpenDispute,
  isExpanded = false, onToggle,
}) => {
  // On needs_retry, do NOT pre-populate the old proof — force a fresh upload
  const initialProof = task.status === 'needs_retry' ? null : (task.proofPhotoUrl ?? null);
  const [proofUrl, setProofUrl]     = useState<string | null>(initialProof);
  const [previewSrc, setPreviewSrc] = useState<string | null>(initialProof);
  const [uploading, setUploading]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');
  const [showFullProof, setShowFullProof] = useState(false);
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
        proofPhotoUrl: base64,
      });
    } catch {
      setError('Photo upload failed. Please try again.');
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
        retryNote: null,
      });

      if (profile) {
        for (const parent of parents) {
          await createNotification(
            task.householdId, parent.uid, 'parent',
            'task_submitted',
            'Ready for review 📸',
            `${profile.displayName} completed "${task.title}" and submitted ${task.requiresProof ? 'proof' : 'it'}. Tap to review!`,
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

  const isPending     = task.status === 'pending';
  const isAccepted    = task.status === 'accepted';
  const isNeedsRetry  = task.status === 'needs_retry';
  const isSubmitted   = task.status === 'submitted';
  const isApproved    = task.status === 'approved';
  const isActive      = isPending || isAccepted || isNeedsRetry; // still actionable

  // ── Due date (one-off adhoc_date tasks) ──────────────────────────────────
  const dueDate     = task.dueDate?.toDate();
  const dueDateStr  = dueDate
    ? dueDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const daysUntilDue = dueDate
    ? Math.ceil((dueDate.getTime() - Date.now()) / 86400000)
    : null;
  // Urgency level for the due date
  type UrgencyLevel = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'week' | 'normal' | null;
  const dueUrgency: UrgencyLevel = daysUntilDue === null ? null
    : daysUntilDue < 0  ? 'overdue'
    : daysUntilDue === 0 ? 'today'
    : daysUntilDue === 1 ? 'tomorrow'
    : daysUntilDue <= 3  ? 'soon'
    : daysUntilDue <= 7  ? 'week'
    : 'normal';

  // ── End date (recurring tasks) ────────────────────────────────────────────
  const endDateRaw   = task.recurrence?.endDate;
  const endDate      = endDateRaw ? endDateRaw.toDate() : null;
  const endDateStr   = endDate
    ? endDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null;
  const daysUntilEnd = endDate
    ? Math.ceil((endDate.getTime() - Date.now()) / 86400000)
    : null;
  const endUrgency: UrgencyLevel = daysUntilEnd === null ? null
    : daysUntilEnd < 0  ? 'overdue'
    : daysUntilEnd === 0 ? 'today'
    : daysUntilEnd === 1 ? 'tomorrow'
    : daysUntilEnd <= 3  ? 'soon'
    : daysUntilEnd <= 7  ? 'week'
    : 'normal';

  // The most urgent of the two, for card-level styling
  const urgencyPriority: Record<string, number> = {
    overdue: 5, today: 4, tomorrow: 3, soon: 2, week: 1, normal: 0,
  };
  const effectiveUrgency: UrgencyLevel = (() => {
    const a = dueUrgency  ? urgencyPriority[dueUrgency]  ?? 0 : 0;
    const b = endUrgency  ? urgencyPriority[endUrgency]  ?? 0 : 0;
    if (a === 0 && b === 0) return null;
    return a >= b ? dueUrgency : endUrgency;
  })();

  // Show urgency banner on the card when still actionable and deadline is close
  const showUrgencyBanner = isActive && effectiveUrgency !== null && effectiveUrgency !== 'normal';

  const accentClass   = ACCENT_COLOURS[task.taskType || 'adhoc_date'];
  const typeStyleClass = TYPE_STYLES[task.taskType || 'adhoc_date'];

  // Collapsed header row: show everything needed at a glance
  // Expanded: show KPI, retry note, and action area
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
          isActive && (effectiveUrgency === 'overdue' || effectiveUrgency === 'today')
            ? 'border-red-300 shadow-red-100'
            : isActive && (effectiveUrgency === 'tomorrow' || effectiveUrgency === 'soon')
            ? 'border-amber-300 shadow-amber-50'
            : isNeedsRetry
            ? 'border-amber-200'
            : 'border-slate-200'
        }`}
      >
        {/* ── Compact header row ── */}
        <div
          className="flex items-stretch cursor-pointer select-none"
          onClick={onToggle}
        >
          {/* Left accent strip (or thumbnail if before photo) */}
          {task.beforePhotoUrl ? (
            <div className="w-14 flex-shrink-0">
              <img
                src={task.beforePhotoUrl}
                className="w-full h-full object-cover"
                alt="Reference"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className={`w-1.5 flex-shrink-0 ${accentClass}`} />
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {/* Title + type badge row */}
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${typeStyleClass}`}>
                    {(task.taskType || 'adhoc').replace('_', ' ')}
                  </span>
                  {/* Status badge — only when not pending (pending is the default) */}
                  {!isPending && (
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      isApproved    ? 'bg-emerald-100 text-emerald-700' :
                      isSubmitted   ? 'bg-indigo-100 text-indigo-700' :
                      isNeedsRetry  ? 'bg-amber-100 text-amber-700' :
                      isAccepted    ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {CHILD_STATUS_LABELS[task.status]?.split(' ')[0] ?? task.status}
                    </span>
                  )}
                  {/* Due date chip — one-off tasks */}
                  {dueDateStr && !isSubmitted && !isApproved && (
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      dueUrgency === 'overdue'  ? 'bg-red-500 text-white' :
                      dueUrgency === 'today'    ? 'bg-red-100 text-red-700' :
                      dueUrgency === 'tomorrow' ? 'bg-orange-100 text-orange-700' :
                      dueUrgency === 'soon'     ? 'bg-amber-100 text-amber-700' :
                      dueUrgency === 'week'     ? 'bg-yellow-50 text-yellow-700' :
                      'bg-slate-100 text-slate-400'
                    } ${(dueUrgency === 'overdue' || dueUrgency === 'today') ? 'animate-pulse' : ''}`}>
                      <Calendar size={9} />
                      {dueUrgency === 'overdue'  ? '⚠ Overdue!'     :
                       dueUrgency === 'today'    ? '🔴 Due Today!'   :
                       dueUrgency === 'tomorrow' ? '⏰ Due Tomorrow' :
                       dueUrgency === 'soon'     ? `⏳ ${daysUntilDue}d left` :
                       dueUrgency === 'week'     ? `📅 ${daysUntilDue}d left` :
                       `📅 ${dueDateStr}`}
                    </span>
                  )}
                  {/* End date chip — recurring tasks */}
                  {endDateStr && !isSubmitted && !isApproved && (
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      endUrgency === 'overdue'  ? 'bg-red-500 text-white' :
                      endUrgency === 'today'    ? 'bg-red-100 text-red-700' :
                      endUrgency === 'tomorrow' ? 'bg-orange-100 text-orange-700' :
                      endUrgency === 'soon'     ? 'bg-amber-100 text-amber-700' :
                      endUrgency === 'week'     ? 'bg-yellow-50 text-yellow-700' :
                      'bg-slate-100 text-slate-400'
                    } ${(endUrgency === 'overdue' || endUrgency === 'today') ? 'animate-pulse' : ''}`}>
                      <Clock size={9} />
                      {endUrgency === 'overdue'  ? '⚠ Overdue!'       :
                       endUrgency === 'today'    ? '🔴 Last day!'      :
                       endUrgency === 'tomorrow' ? '⏰ Ends Tomorrow'  :
                       endUrgency === 'soon'     ? `⏳ ${daysUntilEnd}d left` :
                       endUrgency === 'week'     ? `📅 ${daysUntilEnd}d left` :
                       `Ends ${endDateStr}`}
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-black text-slate-900 leading-tight truncate">{task.title}</h3>
              </div>

              {/* Right: points + expand toggle + action icons */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-xs font-black whitespace-nowrap">
                  {task.pointValue}pts
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onViewAudit?.(task); }}
                  className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition-all"
                  title="Audit Trail"
                >
                  <History size={13} />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onOpenDispute?.(task); }}
                  className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                  title="Raise Dispute"
                >
                  <AlertTriangle size={13} />
                </button>
                <div className="p-1 text-slate-300">
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </div>
            </div>

            {/* Quick status line when collapsed */}
            {!isExpanded && (
              <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-relaxed line-clamp-1 italic">
                {task.kpi}
              </p>
            )}
          </div>
        </div>

        {/* ── Urgency deadline banner (always visible when close to forfeiting) ── */}
        {showUrgencyBanner && (() => {
          const isRed    = effectiveUrgency === 'overdue' || effectiveUrgency === 'today';
          const isOrange = effectiveUrgency === 'tomorrow';
          const isAmber  = effectiveUrgency === 'soon';

          // Pick the deadline being shown (dueDate takes priority over endDate)
          const deadlineDate = dueDate ?? endDate;
          const deadlineDays = dueDate !== null ? daysUntilDue : daysUntilEnd;

          const bannerLabel =
            effectiveUrgency === 'overdue'  ? '⚠️ This task is overdue — submit now before it\'s forfeited!' :
            effectiveUrgency === 'today'    ? '🔴 Due today — complete and submit before midnight!' :
            effectiveUrgency === 'tomorrow' ? `⏰ Due tomorrow · ${deadlineDate?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}` :
            effectiveUrgency === 'soon'     ? `⏳ ${deadlineDays} days left · Due ${deadlineDate?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` :
            `📅 ${deadlineDays} days left · Due ${deadlineDate?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;

          return (
            <div className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black border-t ${
              isRed    ? 'bg-red-50 border-red-100 text-red-700' :
              isOrange ? 'bg-orange-50 border-orange-100 text-orange-700' :
              isAmber  ? 'bg-amber-50 border-amber-100 text-amber-700' :
                         'bg-yellow-50 border-yellow-100 text-yellow-700'
            }`}>
              <Clock size={11} className={`flex-shrink-0 ${isRed ? 'animate-pulse' : ''}`} />
              <span className="uppercase tracking-wider leading-relaxed">{bannerLabel}</span>
            </div>
          );
        })()}

        {/* ── Expanded detail + action area ── */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">

                {/* Deadline warning block — shown in expanded view when close */}
                {isActive && (dueDate || endDate) && (() => {
                  const deadlineDate = dueDate ?? endDate;
                  const urgency      = dueDate ? dueUrgency : endUrgency;
                  const days         = dueDate ? daysUntilDue : daysUntilEnd;
                  if (!urgency || urgency === 'normal') return null;
                  const isRed = urgency === 'overdue' || urgency === 'today';
                  return (
                    <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                      isRed    ? 'bg-red-50 border-red-200' :
                      urgency === 'tomorrow' ? 'bg-orange-50 border-orange-200' :
                      urgency === 'soon'     ? 'bg-amber-50 border-amber-200' :
                      'bg-yellow-50 border-yellow-200'
                    }`}>
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isRed ? 'bg-red-100' : 'bg-amber-100'
                      }`}>
                        <Calendar size={15} className={isRed ? 'text-red-600' : 'text-amber-600'} />
                      </div>
                      <div>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${
                          isRed ? 'text-red-600' : 'text-amber-700'
                        }`}>
                          {urgency === 'overdue'  ? 'Overdue — submit now!' :
                           urgency === 'today'    ? 'Due today!' :
                           urgency === 'tomorrow' ? 'Due tomorrow' :
                           `${days} days remaining`}
                        </p>
                        <p className={`text-xs font-bold mt-0.5 ${
                          isRed ? 'text-red-500' : 'text-amber-600'
                        }`}>
                          Deadline: {deadlineDate?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* KPI */}
                <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ClipboardCheck size={13} className="text-indigo-600" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Done means…</span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 leading-relaxed italic line-clamp-3">"{task.kpi}"</p>
                </div>

                {/* Retry note */}
                {isNeedsRetry && task.retryNote && (
                  <div className="bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl flex gap-2">
                    <MessageSquare size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-0.5">Parent's Feedback</p>
                      <p className="text-xs font-bold text-amber-800">"{task.retryNote}"</p>
                    </div>
                  </div>
                )}

                {/* ── Action area ── */}

                {/* PENDING — Accept */}
                {isPending && (
                  <button
                    onClick={handleAccept}
                    disabled={submitting}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-slate-900 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all active:scale-95"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : (
                      <>
                        <PlayCircle size={16} />
                        <span>Accept this Mission</span>
                      </>
                    )}
                  </button>
                )}

                {/* ACCEPTED or NEEDS_RETRY — Proof + Submit */}
                {(isAccepted || isNeedsRetry) && (
                  <div className="space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    {task.requiresProof && (
                      <div className="space-y-2">
                        {previewSrc ? (
                          /* ── Proof uploaded — show thumbnail ── */
                          <div className="relative rounded-xl overflow-hidden aspect-video border-2 border-indigo-200">
                            <img src={previewSrc} className="w-full h-full object-cover" alt="Proof" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 hover:opacity-100 bg-black/30 transition-opacity">
                              <button
                                onClick={() => setShowFullProof(true)}
                                className="bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-black text-slate-900 shadow flex items-center gap-1"
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-black text-slate-900 shadow flex items-center gap-1"
                              >
                                <Camera size={12} /> Retake
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── No proof yet — prominent photo CTA ── */
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="w-full py-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-amber-100 hover:border-amber-400 transition-all active:scale-[0.98] group"
                          >
                            {uploading ? (
                              <Loader2 size={22} className="animate-spin text-amber-500" />
                            ) : (
                              <Camera size={22} className="text-amber-500 group-hover:scale-110 transition-transform" />
                            )}
                            <div className="text-center">
                              <p className="text-xs font-black text-amber-700 uppercase tracking-widest">
                                {isNeedsRetry ? 'New photo required' : 'Photo proof required'}
                              </p>
                              <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                                {uploading ? 'Uploading…' : 'Tap here to take a photo before you can submit'}
                              </p>
                            </div>
                          </button>
                        )}
                        {error && <p className="text-[10px] font-bold text-red-500 text-center">{error}</p>}
                      </div>
                    )}

                    {/* Submit button — only shown once proof requirement is satisfied */}
                    {(!task.requiresProof || proofUrl) && (
                      <button
                        onClick={handleComplete}
                        disabled={submitting}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow shadow-emerald-100"
                      >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : (
                          <>
                            <CheckCircle size={16} />
                            <span>{isNeedsRetry ? 'Resubmit for Review' : 'Mark Done — Submit for Review'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* SUBMITTED */}
                {isSubmitted && (
                  <div className="flex items-center justify-between bg-indigo-50 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-indigo-500 animate-pulse" />
                      <div>
                        <p className="font-black text-indigo-700 text-xs">Submitted — Awaiting Review</p>
                        <p className="text-[10px] text-slate-400 font-medium">Your parent will review this soon</p>
                      </div>
                    </div>
                    {task.proofPhotoUrl && (
                      <button
                        onClick={() => setShowFullProof(true)}
                        className="flex items-center gap-1 text-[10px] font-black uppercase text-indigo-600 bg-white px-2 py-1 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100"
                      >
                        <Eye size={11} /> View
                      </button>
                    )}
                  </div>
                )}

                {/* APPROVED */}
                {isApproved && (
                  <div className="flex items-center gap-2 text-emerald-600 font-black text-sm justify-center py-1">
                    <Sparkles size={16} /> Mission Complete — {task.pointValue} pts earned!
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Full-size proof photo modal */}
      <AnimatePresence>
        {showFullProof && (task.proofPhotoUrl || previewSrc) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/95 backdrop-blur z-[100] flex flex-col"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
              <button
                onClick={() => setShowFullProof(false)}
                className="flex items-center gap-2 text-white/80 hover:text-white transition-colors font-black text-sm uppercase tracking-widest"
              >
                <ChevronDown size={18} className="rotate-90" />
                Back
              </button>
              <span className="text-white/50 text-xs font-black uppercase tracking-widest">My Proof</span>
              {/* Retake button — only available before parent has approved */}
              {(isAccepted || isNeedsRetry) && (
                <button
                  onClick={() => {
                    setShowFullProof(false);
                    // Wait for the modal exit animation to finish before triggering
                    // the file picker — otherwise the overlay swallows the click.
                    setTimeout(() => fileInputRef.current?.click(), 250);
                  }}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-all"
                >
                  <Camera size={14} /> Replace
                </button>
              )}
              {/* Spacer when retake not available (keeps title centred) */}
              {!(isAccepted || isNeedsRetry) && <div className="w-20" />}
            </div>

            {/* Photo — fills remaining space */}
            <div className="flex-1 flex items-center justify-center p-6 min-h-0">
              <img
                src={task.proofPhotoUrl || previewSrc!}
                className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain border-4 border-white/10"
                alt="Proof"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Bottom close hint */}
            <div className="flex justify-center pb-6 flex-shrink-0">
              <button
                onClick={() => setShowFullProof(false)}
                className="bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs font-black uppercase tracking-widest px-6 py-3 rounded-2xl transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChildTaskCard;
