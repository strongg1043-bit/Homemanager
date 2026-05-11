import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, setDoc, doc, Timestamp, serverTimestamp, writeBatch } from 'firebase/firestore';
import { TaskType, EvidenceType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Calendar, Camera, Info, Loader2, Sun, CalendarDays, 
  CalendarRange, Pin, Target, CheckCircle2, ChevronRight,
  ClipboardCheck, Image as ImageIcon
} from 'lucide-react';
import { compressToBase64 } from '../lib/imageUtils';

interface Props {
  householdId: string;
  members: { uid: string; displayName: string; role: string }[];
  onClose: () => void;
}

const TYPE_CONFIG = [
  { id: 'daily', label: 'Daily', icon: Sun, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', desc: 'Routines like tidying' },
  { id: 'weekly', label: 'Weekly', icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', desc: 'Recurring each week' },
  { id: 'monthly', label: 'Monthly', icon: CalendarRange, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-100', desc: 'Big monthly goals' },
  { id: 'adhoc_date', label: 'Adhoc', icon: Pin, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', desc: 'One-off specific tasks' },
  { id: 'adhoc_kpi', label: 'KPI Goal', icon: Target, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', desc: 'Achievement targets' },
] as const;

export default function CreateTaskForm({ householdId, members, onClose }: Props) {
  const [taskType, setTaskType] = useState<TaskType>('daily');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [pointValue, setPointValue] = useState(10);
  const [kpi, setKpi] = useState('');
  const [targetMetric, setTargetMetric] = useState('');
  const [evidenceType, setEvidenceType] = useState<'photo' | 'document' | 'grade' | 'any'>('photo');
  const [requiresProof, setRequiresProof] = useState(true);
  const [beforePhotoUrl, setBeforePhotoUrl] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [weekday, setWeekday] = useState('monday');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const children = members.filter(m => m.role === 'child');
  const today = new Date().toISOString().split('T')[0];

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const base64 = await compressToBase64(file, 800, 0.7);
      setBeforePhotoUrl(base64);
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      alert("Please provide a task title.");
      return;
    }
    if (!assignedTo) {
      alert("Please select a child to assign the task to.");
      return;
    }
    if (!kpi.trim()) {
      alert("Please specify the Quality Standard (KPI) for the task.");
      return;
    }
    if (taskType === 'adhoc_kpi' && !targetMetric.trim()) {
      alert("Please specify the Target Metric for the KPI Goal.");
      return;
    }
    // BUG FIX 1: Prevent silent fail for adhoc tasks with empty due date
    if ((taskType === 'adhoc' || taskType === 'adhoc_date' || taskType === 'adhoc_kpi') && !dueDate) {
      alert("Please set a Due Date for this adhoc task.");
      return;
    }

    setLoading(true);

    const child = children.find(c => c.uid === assignedTo);

    try {
      const tasksRef = collection(db, 'households', householdId, 'tasks');
      const docRef = doc(tasksRef);
      
      const taskData = {
        id: docRef.id,
        householdId,
        title: title.trim(),
        description: description.trim(),
        assignedTo,
        assignedToName: child?.displayName || 'Child',
        pointValue,
        taskType,
        status: 'pending',
        kpi: kpi.trim(),
        kpiLocked: false,
        targetMetric: taskType === 'adhoc_kpi' ? targetMetric : '',
        evidenceType,
        requiresProof,
        beforePhotoUrl,
        proofPhotoUrl: null,
        proposedBy: 'parent',
        rewardLocked: false,
        dueDate: (taskType === 'adhoc_date' || taskType === 'adhoc_kpi') && dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        recurrence: (taskType === 'daily' || taskType === 'weekly' || taskType === 'monthly') ? {
          weekday: taskType === 'weekly' ? (weekday || 'monday') : null,
          dayOfMonth: taskType === 'monthly' ? (dayOfMonth || 1) : null,
          lastReset: serverTimestamp()
        } : null,
        completedAt: null,
        approvedAt: null,
        createdAt: serverTimestamp()
      };

      // Strip undefined values before write
      const cleanTaskData = Object.fromEntries(
        Object.entries(taskData).filter(([_, v]) => v !== undefined)
      );

      await setDoc(docRef, cleanTaskData);
      onClose();
    } catch (err: any) {
      console.error(err);
      alert("Failed to deploy task: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Create a Task</h2>
            <p className="text-slate-500 text-sm font-medium">Build accountability and trust</p>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-400 hover:text-slate-600 rounded-2xl transition-all">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
          {/* Type Selector */}
          <section>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Select Task Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {TYPE_CONFIG.map((config) => (
                <button
                  key={config.id}
                  type="button"
                  onClick={() => setTaskType(config.id as TaskType)}
                  className={`flex flex-col items-center justify-center p-4 rounded-3xl border-2 transition-all relative ${
                    taskType === config.id 
                    ? `border-indigo-600 ${config.bg} scale-105 shadow-lg shadow-indigo-100` 
                    : 'border-slate-100 bg-white hover:border-slate-300'
                  }`}
                >
                  <config.icon size={24} className={taskType === config.id ? 'text-indigo-600' : config.color} />
                  <span className={`text-[10px] font-black mt-2 uppercase tracking-tight ${taskType === config.id ? 'text-indigo-800' : 'text-slate-500'}`}>
                    {config.label}
                  </span>
                  {taskType === config.id && (
                    <div className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5">
                      <CheckCircle2 size={12} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Basic Info */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 shadow-indigo-100">Task Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                  placeholder="e.g. Clean Bedroom"
                />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Details</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium h-32 resize-none"
                  placeholder="Additional context..."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Assign To</label>
                <select
                  required
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                >
                  <option value="">Select Child</option>
                  {children.map(child => (
                    <option key={child.uid} value={child.uid}>{child.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Reward (Points)</label>
                <input
                  type="number"
                  min="0"
                  value={pointValue}
                  onChange={(e) => setPointValue(parseInt(e.target.value))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                />
              </div>
            </div>
          </div>

          {/* Quality Standard (KPI) */}
          <section className="bg-indigo-50 p-6 rounded-[2rem] border border-indigo-100">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="text-indigo-600" size={20} />
              <h3 className="font-black text-indigo-900 uppercase tracking-tight text-sm">Quality Standard (KPI)</h3>
            </div>
            <label className="block text-xs font-bold text-indigo-700/60 mb-2">What does 'done' look like? Your child will see this before they start.</label>
            <textarea
              required
              value={kpi}
              onChange={(e) => setKpi(e.target.value)}
              className="w-full px-5 py-4 bg-white border border-indigo-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-indigo-900 h-24 resize-none"
              placeholder="e.g. Floor is clear, bed is made, books are on the shelf."
            />
          </section>

          {/* Conditional Fields */}
          <AnimatePresence mode="wait">
            {taskType === 'weekly' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Which Day?</label>
                <div className="flex flex-wrap gap-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setWeekday(day)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tight transition-all border ${
                        weekday === day ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-500 border-slate-100'
                      }`}
                    >
                      {day.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {taskType === 'monthly' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Day of Month</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                />
              </motion.div>
            )}

            {(taskType === 'adhoc_date' || taskType === 'adhoc_kpi') && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                  <Calendar size={14} /> Due Date
                </label>
                <input
                  type="date"
                  min={today}
                  value={dueDate}
                  required
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                />
              </motion.div>
            )}

            {taskType === 'adhoc_kpi' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4 pt-4 border-t border-slate-100">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Target Metric</label>
                    <input
                      type="text"
                      required
                      value={targetMetric}
                      onChange={(e) => setTargetMetric(e.target.value)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                      placeholder="e.g. A+ Grade"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Evidence Required</label>
                    <select
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value as any)}
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
                    >
                      <option value="photo">Photo Proof</option>
                      <option value="document">Document Upload</option>
                      <option value="grade">Grade Verification</option>
                      <option value="any">Any Proof</option>
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Additional Controls */}
          <div className="grid sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <ImageIcon size={14} /> Task Standards Photo
              </label>
              <div className="flex items-start gap-3">
                <label className="flex-1 cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                  <div className="w-full py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-1 hover:border-indigo-300 hover:bg-white transition-all text-slate-400">
                    {uploadingPhoto ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
                    <span className="text-[10px] font-black uppercase tracking-tight">Add "Before" Photo</span>
                  </div>
                </label>
                {beforePhotoUrl && (
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 p-1 relative shadow-sm">
                    <img src={beforePhotoUrl} className="w-full h-full object-cover rounded-xl" alt="Preview" referrerPolicy="no-referrer" />
                    <button onClick={() => setBeforePhotoUrl(null)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 shadow-sm">
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100 h-fit self-end">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${requiresProof ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  <ImageIcon size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Requirement</div>
                  <div className="text-sm font-black text-slate-800">Photo Evidence</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRequiresProof(!requiresProof)}
                className={`w-14 h-8 rounded-full transition-all relative ${requiresProof ? 'bg-indigo-600' : 'bg-slate-200'}`}
              >
                <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${requiresProof ? 'translate-x-6' : ''}`} />
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="pt-4 sticky bottom-0 bg-white">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-[2rem] shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 group"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <>
                  <span className="text-lg">Deploy this Task</span>
                  <ChevronRight size={24} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Sub-component for batch update - used in Dashboard for efficiency
export async function resetRecurringTasks(householdId: string, tasks: any[]) {
  const batch = writeBatch(db);
  const now = new Date();
  let count = 0;

  tasks.forEach(task => {
    if (!task.recurrence) return;
    
    let shouldReset = false;
    const lastReset = task.recurrence.lastReset?.toDate() || new Date(0);
    
    if (task.taskType === 'daily') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (lastReset < today) shouldReset = true;
    } else if (task.taskType === 'weekly' && task.recurrence.weekday) {
      // Simple weekly logic: if today is the day and last reset was more than 6 days ago
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDayIndex = days.indexOf(task.recurrence.weekday.toLowerCase());
      if (now.getDay() === targetDayIndex) {
        const diffDays = (now.getTime() - lastReset.getTime()) / (1000 * 3600 * 24);
        if (diffDays > 6) shouldReset = true;
      }
    } else if (task.taskType === 'monthly' && task.recurrence.dayOfMonth) {
      if (now.getDate() === task.recurrence.dayOfMonth) {
        if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
          shouldReset = true;
        }
      }
    }

    if (shouldReset) {
      batch.update(doc(db, 'households', householdId, 'tasks', task.id), {
        status: 'pending',
        'recurrence.lastReset': serverTimestamp(),
        proofPhotoUrl: null,
        completedAt: null,
        approvedAt: null
      });
      count++;
    }
  });

  if (count > 0) await batch.commit();
}
