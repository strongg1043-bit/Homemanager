import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Household, RewardItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Edit2, Check, X, Gift, Info } from 'lucide-react';

interface RewardsManagerProps {
  household: Household;
}

export default function RewardsManager({ household }: RewardsManagerProps) {
  const [title, setTitle] = useState('');
  const [pointCost, setPointCost] = useState<number>(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleAddReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || pointCost <= 0) return;
    setLoading(true);
    try {
      const newReward: RewardItem = {
        id: crypto.randomUUID(),
        title: title.trim(),
        pointCost
      };
      await updateDoc(doc(db, 'households', household.id), {
        rewardStore: arrayUnion(newReward)
      });
      setTitle('');
      setPointCost(0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteReward = async (reward: RewardItem) => {
    try {
      await updateDoc(doc(db, 'households', household.id), {
        rewardStore: arrayRemove(reward)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const startEditReward = (reward: RewardItem) => {
    setEditingId(reward.id);
    setTitle(reward.title);
    setPointCost(reward.pointCost);
  };

  const cancelEditReward = () => {
    setEditingId(null);
    setTitle('');
    setPointCost(0);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !title || pointCost <= 0) return;
    setLoading(true);
    try {
      const updatedStore = household.rewardStore.map((r) =>
        r.id === editingId ? { ...r, title: title.trim(), pointCost } : r
      );
      await updateDoc(doc(db, 'households', household.id), {
        rewardStore: updatedStore
      });
      cancelEditReward();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Create / Edit Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          {editingId ? <Edit2 className="text-indigo-600" size={20} /> : <Gift className="text-indigo-600" size={20} />}
          {editingId ? 'Edit Reward' : 'Add New Reward'}
        </h3>
        <form onSubmit={editingId ? handleSaveEdit : handleAddReward} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Reward Name</label>
            <input
              type="text"
              placeholder="e.g. 1hr Screen Time"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">Point Cost</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="50"
                  value={pointCost || ''}
                  onChange={(e) => setPointCost(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  pts = {household.currency}{pointCost || 0}
                </div>
              </div>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEditReward}
                  className="bg-slate-100 text-slate-500 px-4 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-all"
                >
                  <X size={18} />
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !title || pointCost <= 0}
                className="bg-indigo-600 text-white px-6 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md active:scale-95"
              >
                {editingId ? <Check size={20} /> : <Plus size={20} />} {editingId ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Rewards List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Current Rewards Store</h3>
          <span className="text-xs text-slate-500 font-medium">{household.rewardStore.length} items</span>
        </div>
        
        {household.rewardStore.length === 0 ? (
          <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white/50">
            <p className="text-slate-400 font-medium italic">Reward store is empty. Add a reward above!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {household.rewardStore.map((reward) => (
                <motion.div
                  key={reward.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm group relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                  
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{reward.title}</h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <Info size={12} /> Value: {household.currency}{reward.pointCost}
                      </div>
                    </div>
                    {confirmDeleteId === reward.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteReward(reward)}
                          className="text-[9px] font-black text-white bg-red-500 px-2 py-1 rounded-lg uppercase tracking-widest"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[9px] font-black text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg uppercase tracking-widest"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditReward(reward)}
                          className="text-slate-300 hover:text-indigo-500 transition-colors p-1"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(reward.id)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-baseline gap-1 mt-4">
                    <span className="text-2xl font-black text-indigo-600">{reward.pointCost}</span>
                    <span className="text-xs font-bold text-slate-400">pts</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
