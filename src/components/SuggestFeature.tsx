import React, { useState, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Lightbulb, History, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'pending' | 'approved' | 'deferred' | 'rejected' | 'shipped';
  createdAt: any;
}

interface Props {
  userId: string;
  userName: string;
  householdId: string;
  householdName: string;
}

const CATEGORIES = [
  "Task Management",
  "Rewards & Points",
  "Family & Members",
  "Design & UI",
  "Other"
];

const STATUS_CONFIG = {
  pending: { label: "⏳ Under Review", color: "text-amber-600 bg-amber-50 border-amber-100" },
  approved: { label: "✅ Approved", color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  deferred: { label: "⏸ Deferred", color: "text-slate-500 bg-slate-50 border-slate-200" },
  rejected: { label: "❌ Not selected", color: "text-red-600 bg-red-50 border-red-100" },
  shipped: { label: "🚀 Live in app!", color: "text-indigo-600 bg-indigo-50 border-indigo-100" }
};

export default function SuggestFeature({ userId, userName, householdId, householdName }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mySuggestions, setMySuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'suggestions'),
      where('userId', '==', userId),
      limit(10)
    );

    const unsub = onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Suggestion))
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 5);
      setMySuggestions(sorted);
    });

    return () => unsub();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'suggestions'), {
        householdId,
        userId,
        userName,
        householdName,
        title: title.trim(),
        description: description.trim(),
        category,
        status: 'pending',
        aiAnalysis: {},
        adminNote: '',
        createdAt: serverTimestamp(),
        resolvedAt: null
      });

      setSuccess(true);
      setTitle('');
      setDescription('');
      setCategory(CATEGORIES[0]);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error("Failed to submit suggestion:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Submit Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <div className="p-6 bg-indigo-600 text-white flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl">
            <Lightbulb size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black">Suggest an Improvement</h3>
            <p className="text-indigo-100 text-xs font-medium">Help shape the future of Home Anchor</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <AnimatePresence>
            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-xl flex items-center gap-3"
              >
                <CheckCircle2 className="shrink-0" size={20} />
                <span className="text-sm font-bold">🎉 Thanks! Your suggestion has been submitted. We review every idea.</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Feature Title</label>
            <input
              type="text"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add a grocery list"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest">Detail & Benefits</label>
              <span className={`text-[10px] font-bold ${description.length > 450 ? 'text-red-500' : 'text-slate-400'}`}>
                {description.length} / 500
              </span>
            </div>
            <textarea
              required
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your idea or what's bothering you..."
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium h-24 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <span>Send Suggestion</span>
                <Send size={18} />
              </>
            )}
          </button>
        </form>
      </motion.div>

      {/* History Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History size={16} /> Your Suggestions
        </h3>
        
        <div className="grid gap-3">
          {mySuggestions.map((s) => (
            <motion.div 
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm"
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-black text-slate-800 leading-tight">{s.title}</h4>
                <div className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border ${STATUS_CONFIG[s.status]?.color || STATUS_CONFIG.pending.color}`}>
                  {STATUS_CONFIG[s.status]?.label || STATUS_CONFIG.pending.label}
                </div>
              </div>
              <p className="text-xs text-slate-500 line-clamp-2 mb-2">{s.description}</p>
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span className="bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wider">{s.category}</span>
                <span>{s.createdAt?.toDate().toLocaleDateString()}</span>
              </div>
            </motion.div>
          ))}

          {mySuggestions.length === 0 && (
            <div className="py-8 text-center bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
              <Sparkles size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-bold">No suggestions yet — be the first to shape the app!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
