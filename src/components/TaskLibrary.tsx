import React, { useState, useEffect, memo } from 'react';
import { db } from '../firebase';
import {
  collection, query, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, writeBatch, Timestamp
} from 'firebase/firestore';
import { UserProfile, TaskType, EvidenceType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, Plus, Zap, Pencil, Trash2, CheckCircle, X,
  Users, RefreshCw, Calendar, Sparkles, ChevronDown, ChevronUp,
  Clock, AlertCircle
} from 'lucide-react';

interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  taskType: TaskType;
  pointValue: number;
  kpi: string;
  evidenceType: EvidenceType;
  requiresProof: boolean;
  isActive: boolean;
  isStarter: boolean;
  createdAt: any;
  createdBy: string;
}

interface Props {
  householdId: string;
  members: UserProfile[];
  profile: UserProfile;
  currency: string;
}

const STARTER_TEMPLATES = [
  {
    title: 'Make your bed',
    description: 'Straighten sheets and arrange pillows neatly every morning.',
    taskType: 'daily' as TaskType,
    pointValue: 10,
    kpi: 'Bed looks neat with pillows arranged',
    evidenceType: 'photo' as EvidenceType,
    requiresProof: true,
    isStarter: true,
  },
  {
    title: 'Do homework',
    description: 'Complete all homework and show parent for sign-off.',
    taskType: 'daily' as TaskType,
    pointValue: 30,
    kpi: 'All subjects completed and checked',
    evidenceType: 'any' as EvidenceType,
    requiresProof: false,
    isStarter: true,
  },
  {
    title: 'Wash dishes',
    description: 'Wash, rinse and dry all dishes after meals.',
    taskType: 'daily' as TaskType,
    pointValue: 25,
    kpi: 'All dishes clean and put away',
    evidenceType: 'photo' as EvidenceType,
    requiresProof: true,
    isStarter: true,
  },
  {
    title: 'Clean bathroom',
    description: 'Scrub toilet, sink and wipe all surfaces.',
    taskType: 'weekly' as TaskType,
    pointValue: 50,
    kpi: 'Toilet clean, sink clean, surfaces wiped',
    evidenceType: 'photo' as EvidenceType,
    requiresProof: true,
    isStarter: true,
  },
  {
    title: 'Take out trash',
    description: 'Empty all bins and replace bags.',
    taskType: 'weekly' as TaskType,
    pointValue: 30,
    kpi: 'All bins emptied and new bags in place',
    evidenceType: 'any' as EvidenceType,
    requiresProof: false,
    isStarter: true,
  },
  {
    title: 'Base Allowance',
    description: 'Monthly base allowance — given automatically just for being part of the family. No task required; this is the consistent baseline reward on top of which everything else is earned.',
    taskType: 'monthly' as TaskType,
    pointValue: 100,
    kpi: 'Paid monthly as a base allowance — no action required from child',
    evidenceType: 'any' as EvidenceType,
    requiresProof: false,
    isStarter: true,
  },
];

const TYPE_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  adhoc_date: 'Ad-hoc',
  adhoc_kpi: 'Ad-hoc',
};

const TYPE_COLOURS: Record<string, string> = {
  daily: 'bg-emerald-100 text-emerald-700',
  weekly: 'bg-indigo-100 text-indigo-700',
  monthly: 'bg-purple-100 text-purple-700',
  adhoc_date: 'bg-amber-100 text-amber-700',
  adhoc_kpi: 'bg-amber-100 text-amber-700',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  daily: <RefreshCw size={12} />,
  weekly: <Calendar size={12} />,
  monthly: <Calendar size={12} />,
  adhoc_date: <Zap size={12} />,
  adhoc_kpi: <Zap size={12} />,
};

const EMPTY_FORM = {
  title: '',
  description: '',
  taskType: 'daily' as TaskType,
  pointValue: 20,
  kpi: '',
  evidenceType: 'photo' as EvidenceType,
  requiresProof: false,
};

export default function TaskLibrary({ householdId, members, profile }: Props) {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | TaskType>('all');

  // Modals
  const [assignTemplate, setAssignTemplate] = useState<TaskTemplate | null>(null);
  const [editTemplate, setEditTemplate] = useState<TaskTemplate | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<TaskTemplate | null>(null);

  // Quick assign state
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  // Edit / Add form state
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const children = members.filter(m => m.role === 'child');

  // ── Firestore listener ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'households', householdId, 'taskTemplates'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskTemplate));
        setTemplates(data);
        setLoading(false);
      },
      (err) => {
        console.error('TaskLibrary snapshot error:', err);
        setLoading(false); // unblock the spinner so the UI doesn't hang
      }
    );
    return unsub;
  }, [householdId]);

  // ── Seed starter templates (once, if library is empty) ───────────────────
  const seedStarterTemplates = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const batch = writeBatch(db);
      STARTER_TEMPLATES.forEach(t => {
        const ref = doc(collection(db, 'households', householdId, 'taskTemplates'));
        batch.set(ref, {
          ...t,
          isActive: true,
          createdAt: serverTimestamp(),
          createdBy: profile.uid,
        });
      });
      await batch.commit();
    } catch (err) {
      console.error('Error seeding templates:', err);
    }
    setSeeding(false);
  };

  // ── Quick Assign ─────────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!assignTemplate || selectedChildren.length === 0) return;
    setAssigning(true);
    try {
      const batch = writeBatch(db);

      // For recurring tasks, default end date = 90 days from today at 23:59:59
      // This prevents the immediate-reset loop caused by lastReset: null tasks.
      const defaultEndDate = Timestamp.fromDate(
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      );

      selectedChildren.forEach(childId => {
        const child = members.find(m => m.uid === childId);
        if (!child) return;
        const taskRef = doc(collection(db, 'households', householdId, 'tasks'));
        const taskData: Record<string, any> = {
          householdId,
          title: assignTemplate.title,
          description: assignTemplate.description,
          assignedTo: childId,
          assignedToName: child.displayName,
          pointValue: assignTemplate.pointValue,
          taskType: assignTemplate.taskType,
          status: 'pending',
          kpi: assignTemplate.kpi,
          kpiLocked: false,
          evidenceType: assignTemplate.evidenceType,
          requiresProof: assignTemplate.requiresProof,
          proposedBy: 'parent',
          rewardLocked: false,
          dueDate: null,
          beforePhotoUrl: null,
          proofPhotoUrl: null,
          completedAt: null,
          approvedAt: null,
          childAcceptedAt: null,
          retryNote: null,
          missedCount: 0,
          lastMissedAt: null,
          createdAt: serverTimestamp(),
          fromTemplateId: assignTemplate.id,
        };

        // Recurring tasks need a proper recurrence object with a real lastReset
        // (set to now so resetRecurringTasks doesn't immediately re-fire on them)
        // and a default end date so they don't run forever.
        if (assignTemplate.taskType === 'daily') {
          taskData.recurrence = {
            lastReset: serverTimestamp(),
            endDate: defaultEndDate,
            expired: false,
          };
        } else if (assignTemplate.taskType === 'weekly') {
          taskData.recurrence = {
            weekday: null,
            lastReset: serverTimestamp(),
            endDate: defaultEndDate,
            expired: false,
          };
        } else if (assignTemplate.taskType === 'monthly') {
          taskData.recurrence = {
            dayOfMonth: null,
            lastReset: serverTimestamp(),
            endDate: defaultEndDate,
            expired: false,
          };
        }

        batch.set(taskRef, taskData);
      });

      await batch.commit();
      setAssignSuccess(true);
      setTimeout(() => {
        setAssignSuccess(false);
        setAssignTemplate(null);
        setSelectedChildren([]);
      }, 1500);
    } catch (err) {
      console.error('Error assigning task:', err);
    } finally {
      setAssigning(false);
    }
  };

  // ── Save (Add or Edit) Template ──────────────────────────────────────────
  const handleSaveTemplate = async () => {
    if (!form.title.trim() || !form.kpi.trim()) return;
    setSaving(true);
    try {
      if (editTemplate) {
        await updateDoc(doc(db, 'households', householdId, 'taskTemplates', editTemplate.id), {
          title: form.title.trim(),
          description: form.description.trim(),
          taskType: form.taskType,
          pointValue: form.pointValue,
          kpi: form.kpi.trim(),
          evidenceType: form.evidenceType,
          requiresProof: form.requiresProof,
        });
        setEditTemplate(null);
      } else {
        await addDoc(collection(db, 'households', householdId, 'taskTemplates'), {
          ...form,
          title: form.title.trim(),
          description: form.description.trim(),
          kpi: form.kpi.trim(),
          isActive: true,
          isStarter: false,
          createdAt: serverTimestamp(),
          createdBy: profile.uid,
        });
        setShowAddModal(false);
      }
      setForm(EMPTY_FORM);
    } catch (err) {
      console.error('Error saving template:', err);
    }
    setSaving(false);
  };

  // ── Toggle Decommission ──────────────────────────────────────────────────
  const handleToggleActive = async (template: TaskTemplate) => {
    await updateDoc(doc(db, 'households', householdId, 'taskTemplates', template.id), {
      isActive: !template.isActive,
    });
  };

  // ── Hard Delete ──────────────────────────────────────────────────────────
  const handleDelete = async (template: TaskTemplate) => {
    await deleteDoc(doc(db, 'households', householdId, 'taskTemplates', template.id));
    setDeleteConfirm(null);
  };

  // ── Open Edit Modal ──────────────────────────────────────────────────────
  const openEdit = (t: TaskTemplate) => {
    setForm({
      title: t.title,
      description: t.description,
      taskType: t.taskType,
      pointValue: t.pointValue,
      kpi: t.kpi,
      evidenceType: t.evidenceType,
      requiresProof: t.requiresProof,
    });
    setEditTemplate(t);
  };

  // ── Filter logic ─────────────────────────────────────────────────────────
  const filtered = templates.filter(t => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'adhoc_kpi') return t.taskType === 'adhoc_kpi' || t.taskType === 'adhoc_date';
    return t.taskType === typeFilter;
  });

  const active = filtered.filter(t => t.isActive);
  const decommissioned = filtered.filter(t => !t.isActive);

  // ── Filter tabs ──────────────────────────────────────────────────────────
  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'adhoc_kpi', label: 'Ad-hoc' },
  ] as const;

  if (loading) {
    return (
      <div className="py-20 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <BookOpen className="text-indigo-600" size={28} />
            Task Library
          </h2>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Pre-defined templates — quick-assign to any child in seconds
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setShowAddModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 hover:scale-105 transition-all"
        >
          <Plus size={16} /> Chore Template
        </button>
      </div>

      {/* Empty state — offer to seed */}
      {templates.length === 0 && (
        <div className="py-16 text-center bg-white rounded-[2.5rem] border border-dashed border-indigo-200">
          <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <BookOpen size={36} className="text-indigo-300" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mb-2">Your library is empty</h3>
          <p className="text-slate-400 font-medium text-sm mb-8">Load our starter templates or create your own from scratch.</p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={seedStarterTemplates}
              disabled={seeding}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-100 hover:bg-slate-900 transition-all disabled:opacity-50"
            >
              <Sparkles size={16} /> {seeding ? 'Loading...' : 'Load Starter Templates'}
            </button>
            <button
              onClick={() => { setForm(EMPTY_FORM); setShowAddModal(true); }}
              className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl text-xs font-black hover:bg-slate-200 transition-all"
            >
              <Plus size={16} /> Create Custom
            </button>
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <>
          {/* Type filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setTypeFilter(tab.key as any)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  typeFilter === tab.key
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {tab.label}
                <span className="ml-1.5 opacity-60">
                  ({tab.key === 'all'
                    ? templates.filter(t => t.isActive).length
                    : tab.key === 'adhoc_kpi'
                    ? templates.filter(t => (t.taskType === 'adhoc_kpi' || t.taskType === 'adhoc_date') && t.isActive).length
                    : templates.filter(t => t.taskType === tab.key && t.isActive).length
                  })
                </span>
              </button>
            ))}
          </div>

          {/* Active Templates Grid */}
          {active.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {active.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  children={children}
                  onAssign={() => { setAssignTemplate(template); setSelectedChildren([]); setAssignSuccess(false); }}
                  onEdit={() => openEdit(template)}
                  onToggle={() => handleToggleActive(template)}
                  onDelete={() => setDeleteConfirm(template)}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center bg-slate-50 rounded-[2rem] border border-slate-100">
              <p className="text-slate-400 font-black text-xs uppercase tracking-widest">No templates in this category</p>
            </div>
          )}

          {/* Decommissioned section */}
          {decommissioned.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none py-3 px-4 bg-slate-100 rounded-2xl text-xs font-black text-slate-500 uppercase tracking-widest hover:bg-slate-200 transition-colors select-none">
                <AlertCircle size={14} />
                Decommissioned ({decommissioned.length})
                <ChevronDown size={14} className="ml-auto group-open:hidden" />
                <ChevronUp size={14} className="ml-auto hidden group-open:block" />
              </summary>
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {decommissioned.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    children={children}
                    onAssign={() => {}}
                    onEdit={() => openEdit(template)}
                    onToggle={() => handleToggleActive(template)}
                    onDelete={() => setDeleteConfirm(template)}
                    isDecommissioned
                  />
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* ── Quick Assign Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {assignTemplate && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full sm:max-w-md shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
            >
              {/* Modal header */}
              <div className="p-4 sm:p-6 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
                <div>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 ${TYPE_COLOURS[assignTemplate.taskType]}`}>
                    {TYPE_ICONS[assignTemplate.taskType]}
                    {TYPE_LABELS[assignTemplate.taskType]}
                  </div>
                  <h3 className="text-xl font-black text-slate-900">{assignTemplate.title}</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">{assignTemplate.description}</p>
                </div>
                <button onClick={() => setAssignTemplate(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl ml-4 flex-shrink-0">
                  <X size={20} />
                </button>
              </div>

              {/* Points strip */}
              <div className="px-4 sm:px-6 py-3 bg-indigo-50 flex items-center justify-between flex-shrink-0">
                <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Points awarded</span>
                <span className="text-2xl font-black text-indigo-600">{assignTemplate.pointValue} pts</span>
              </div>

              {/* KPI */}
              <div className="px-4 sm:px-6 py-4 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Success Criteria</p>
                <p className="text-sm font-bold text-slate-700">{assignTemplate.kpi}</p>
              </div>

              {/* Child selector — scrollable body */}
              <div className="p-4 sm:p-6 space-y-3 overflow-y-auto flex-1">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Assign to</p>
                {children.length === 0 ? (
                  <p className="text-slate-400 text-sm font-medium">No children in household yet.</p>
                ) : (
                  <div className="space-y-3">
                    {/* All children option */}
                    <button
                      onClick={() => {
                        const allIds = children.map(c => c.uid);
                        setSelectedChildren(
                          selectedChildren.length === children.length ? [] : allIds
                        );
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${
                        selectedChildren.length === children.length
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-slate-100 hover:border-indigo-200 bg-white'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <Users size={18} className="text-indigo-600" />
                      </div>
                      <div>
                        <div className="font-black text-slate-900 text-sm">All Children</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{children.length} members</div>
                      </div>
                      {selectedChildren.length === children.length && (
                        <CheckCircle size={18} className="text-indigo-600 ml-auto" />
                      )}
                    </button>

                    {children.map(child => (
                      <button
                        key={child.uid}
                        onClick={() => setSelectedChildren(prev =>
                          prev.includes(child.uid)
                            ? prev.filter(id => id !== child.uid)
                            : [...prev, child.uid]
                        )}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left ${
                          selectedChildren.includes(child.uid)
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-slate-100 hover:border-indigo-200 bg-white'
                        }`}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg overflow-hidden"
                          style={{ backgroundColor: child.avatarColour || '#1B3A5C' }}
                        >
                          {child.profilePhoto
                            ? <img src={child.profilePhoto} className="w-full h-full object-cover" alt="" />
                            : child.displayName[0].toUpperCase()
                          }
                        </div>
                        <div>
                          <div className="font-black text-slate-900 text-sm">{child.displayName}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{child.totalPoints} pts available</div>
                        </div>
                        {selectedChildren.includes(child.uid) && (
                          <CheckCircle size={18} className="text-indigo-600 ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons — fixed footer, always visible on mobile */}
              <div className="flex gap-3 p-4 sm:p-6 border-t border-slate-100 flex-shrink-0">
                <button
                  onClick={() => setAssignTemplate(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssign}
                  disabled={selectedChildren.length === 0 || assigning || assignSuccess}
                  className={`flex-1 py-4 font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 ${
                    assignSuccess
                      ? 'bg-emerald-600 text-white shadow-emerald-100'
                      : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-slate-900'
                  }`}
                >
                  {assignSuccess
                    ? '✓ Assigned!'
                    : assigning
                    ? 'Assigning...'
                    : `Assign (${selectedChildren.length})`
                  }
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add / Edit Template Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {(showAddModal || editTemplate) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center sm:p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-t-[2rem] sm:rounded-[2rem] w-full sm:max-w-lg shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[90vh] flex flex-col"
            >
              <div className="px-4 py-4 sm:p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 flex-shrink-0">
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  {editTemplate ? 'Edit Template' : 'Chore Template'}
                </h3>
                <button
                  onClick={() => { setShowAddModal(false); setEditTemplate(null); setForm(EMPTY_FORM); }}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
                {/* Title */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Task Title *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Make your bed"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="What does this task involve?"
                    rows={3}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all resize-none"
                  />
                </div>

                {/* Type + Points row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Frequency</label>
                    <select
                      value={form.taskType}
                      onChange={e => setForm(f => ({ ...f, taskType: e.target.value as TaskType }))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="adhoc_kpi">Ad-hoc</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Points</label>
                    <input
                      type="number"
                      min={1}
                      max={9999}
                      value={form.pointValue}
                      onChange={e => setForm(f => ({ ...f, pointValue: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>

                {/* KPI */}
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Success Criteria (KPI) *</label>
                  <input
                    value={form.kpi}
                    onChange={e => setForm(f => ({ ...f, kpi: e.target.value }))}
                    placeholder="How do we know it's done well?"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all"
                  />
                </div>

                {/* Evidence + Proof row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Evidence Type</label>
                    <select
                      value={form.evidenceType}
                      onChange={e => setForm(f => ({ ...f, evidenceType: e.target.value as EvidenceType }))}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:border-indigo-600 focus:bg-white outline-none transition-all"
                    >
                      <option value="photo">Photo</option>
                      <option value="document">Document</option>
                      <option value="grade">Grade</option>
                      <option value="any">Any</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Require Proof</label>
                    <button
                      onClick={() => setForm(f => ({ ...f, requiresProof: !f.requiresProof }))}
                      className={`w-full py-3 rounded-2xl text-sm font-black border-2 transition-all ${
                        form.requiresProof
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-50 border-slate-100 text-slate-400'
                      }`}
                    >
                      {form.requiresProof ? '✓ Required' : 'Optional'}
                    </button>
                  </div>
                </div>

                {/* Save/Cancel */}
                <div className="flex gap-3 pt-2 pb-2 sm:pb-0">
                  <button
                    onClick={() => { setShowAddModal(false); setEditTemplate(null); setForm(EMPTY_FORM); }}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!form.title.trim() || !form.kpi.trim() || saving}
                    className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editTemplate ? 'Save Changes' : 'Create Template'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirm Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl space-y-6"
            >
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={28} className="text-red-600" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900 mb-2">Delete Template?</h3>
                <p className="text-slate-500 font-medium text-sm">
                  "<span className="font-black text-slate-700">{deleteConfirm.title}</span>" will be permanently removed from your library.
                </p>
                <p className="text-slate-400 text-xs mt-2">Existing tasks already assigned won't be affected.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Keep It
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-3 bg-red-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-red-100"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Template Card sub-component ──────────────────────────────────────────────
interface CardProps {
  template: TaskTemplate;
  children: UserProfile[];
  onAssign: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  isDecommissioned?: boolean;
}

const TemplateCard = memo(function TemplateCard({ template, children, onAssign, onEdit, onToggle, onDelete, isDecommissioned }: CardProps) {
  return (
    <div
      className={`bg-white rounded-[2rem] border p-6 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow group ${
        isDecommissioned ? 'border-slate-100 opacity-60' : 'border-slate-200'
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 ${TYPE_COLOURS[template.taskType]}`}>
            {TYPE_ICONS[template.taskType]}
            {TYPE_LABELS[template.taskType]}
            {template.isStarter && (
              <span className="ml-1 opacity-60">· Starter</span>
            )}
          </div>
          <h3 className={`font-black text-slate-900 leading-tight ${isDecommissioned ? 'line-through text-slate-400' : ''}`}>
            {template.title}
          </h3>
          {template.description && (
            <p className="text-xs text-slate-400 font-medium mt-1 line-clamp-2">{template.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-black text-indigo-600 leading-none">{template.pointValue}</div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">pts</div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="bg-slate-50 rounded-2xl px-4 py-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Success Criteria</p>
        <p className="text-xs font-bold text-slate-600 line-clamp-2">{template.kpi}</p>
      </div>

      {/* Actions */}
      {!isDecommissioned ? (
        <div className="flex gap-2 mt-auto">
          <button
            onClick={onAssign}
            disabled={children.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-indigo-100 disabled:opacity-40"
          >
            <Zap size={13} /> Quick Assign
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="p-2.5 bg-slate-100 text-slate-500 rounded-2xl hover:bg-indigo-50 hover:text-indigo-600 transition-all"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onToggle}
            title="Decommission"
            className="p-2.5 bg-slate-100 text-slate-500 rounded-2xl hover:bg-amber-50 hover:text-amber-600 transition-all"
          >
            <Clock size={15} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-2.5 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mt-auto">
          <button
            onClick={onToggle}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-50 hover:text-emerald-700 transition-all"
          >
            <RefreshCw size={13} /> Reactivate
          </button>
          <button
            onClick={onDelete}
            title="Delete permanently"
            className="p-2.5 bg-slate-100 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
});
