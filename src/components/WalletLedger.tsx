import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, updateDoc, doc, Timestamp, increment, writeBatch } from 'firebase/firestore';
import { Task, Redemption } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Gift,
  Banknote,
  XCircle,
  Eye,
  Wallet,
  Loader2
} from 'lucide-react';

interface WalletLedgerProps {
  householdId: string;
  childId: string;
  childName: string;
  currency: string;
  totalPoints: number;
  isParent: boolean;
  /** ARCH-4: caller supplies this so PaymentConfirmationModal handles the full payment flow */
  onRequestPayment?: (redemption: Redemption) => void;
}

type Transaction =
  | { type: 'task'; data: Task; date: Date }
  | { type: 'redemption'; data: Redemption; date: Date };

export default function WalletLedger({ householdId, childId, childName, currency, totalPoints, isParent, onRequestPayment }: WalletLedgerProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingProof, setViewingProof] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    
    // Subscribe to approved tasks for this child
    const tasksQuery = query(
      collection(db, 'households', householdId, 'tasks'),
      where('assignedTo', '==', childId),
      where('status', '==', 'approved'),
      orderBy('approvedAt', 'desc')
    );

    // Subscribe to redemptions for this child
    const redemptionsQuery = query(
      collection(db, 'households', householdId, 'redemptions'),
      where('childId', '==', childId),
      orderBy('createdAt', 'desc')
    );

    let tasks: Transaction[] = [];
    let redemptions: Transaction[] = [];

    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      tasks = snap.docs.map(doc => ({
        type: 'task',
        data: { id: doc.id, ...doc.data() } as Task,
        date: (doc.data().approvedAt as Timestamp | null)?.toDate() ?? new Date(0)
      }));
      updateList();
    });

    const unsubRedemptions = onSnapshot(redemptionsQuery, (snap) => {
      redemptions = snap.docs.map(doc => ({
        type: 'redemption',
        data: { id: doc.id, ...doc.data() } as Redemption,
        date: (doc.data().createdAt as Timestamp).toDate()
      }));
      updateList();
    });

    function updateList() {
      const merged = [...tasks, ...redemptions].sort((a, b) => b.date.getTime() - a.date.getTime());
      setTransactions(merged);
      setLoading(false);
    }

    return () => {
      unsubTasks();
      unsubRedemptions();
    };
  }, [householdId, childId]);

  const handleStatusChange = async (redemptionId: string, status: 'approved' | 'rejected') => {
    try {
      if (status === 'rejected') {
        // Atomic batch: refund points + status update land together or not at all.
        const redemption = (transactions.find(t => t.type === 'redemption' && t.data.id === redemptionId)?.data) as Redemption;
        if (redemption) {
          const batch = writeBatch(db);
          batch.update(doc(db, 'users', childId), { totalPoints: increment(redemption.pointsSpent) });
          batch.update(doc(db, 'households', householdId, 'redemptions', redemptionId), { status, approvedAt: Timestamp.now() });
          await batch.commit();
          return;
        }
      }
      await updateDoc(doc(db, 'households', householdId, 'redemptions', redemptionId), { status, approvedAt: Timestamp.now() });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-8 rounded-3xl text-white shadow-xl">
        <div className="flex items-center gap-3 text-indigo-300 mb-2">
          <Wallet size={20} />
          <span className="text-sm font-bold tracking-wider uppercase">Current Balance</span>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-5xl font-black">{totalPoints} <span className="text-2xl font-normal opacity-70">pts</span></span>
          <span className="text-4xl font-light opacity-50">=</span>
          <span className="text-5xl font-black text-indigo-400">{currency}{totalPoints}</span>
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            Transaction History
          </h3>
          <span className="text-xs text-slate-500 font-medium">{transactions.length} items</span>
        </div>
        
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-300" /></div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 font-medium italic">No transactions yet — start earning!</p>
            </div>
          ) : (
            transactions.map((tx, idx) => {
              if (tx.type === 'task') {
                const task = tx.data;
                return (
                  <div key={`task-${task.id}-${idx}`} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                        <ArrowUpRight size={20} />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{task.title}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Approved {tx.date.toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-emerald-600 font-black text-sm">+{task.pointValue} pts</div>
                  </div>
                );
              } else {
                const redemption = tx.data;
                const isCash = redemption.type === 'cash';
                const statusColors = {
                  pending: 'bg-amber-100 text-amber-700',
                  approved: 'bg-indigo-100 text-indigo-700',
                  rejected: 'bg-red-100 text-red-700',
                  paid: 'bg-emerald-100 text-emerald-700'
                };
                const StatusIcon = {
                  pending: Clock,
                  approved: CheckCircle2,
                  rejected: XCircle,
                  paid: Banknote
                }[redemption.status];

                return (
                  <div key={`red-${redemption.id}-${idx}`} className="p-4 hover:bg-slate-50 transition-colors space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${isCash ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {isCash ? <Banknote size={20} /> : <Gift size={20} />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">
                            {redemption.title} {isCash && `(${currency}${redemption.cashValue})`}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={12} /> {isCash ? 'Cash Out' : 'Reward'} • {tx.date.toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-slate-600 font-black text-sm">-{redemption.pointsSpent} pts</div>
                    </div>

                    <div className="flex items-center justify-between pl-14">
                      <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${statusColors[redemption.status]}`}>
                        <StatusIcon size={12} />
                        {redemption.status} 
                        {redemption.status === 'rejected' && ` (+${redemption.pointsSpent} refunded)`}
                      </div>

                      <div className="flex items-center gap-2">
                        {redemption.proofPhotoUrl && (
                          <button 
                            onClick={() => setViewingProof(redemption.proofPhotoUrl)}
                            className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline"
                          >
                            <Eye size={12} /> View proof
                          </button>
                        )}

                        {isParent && redemption.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleStatusChange(redemption.id, 'rejected')}
                              className="p-1 text-red-500 hover:bg-red-50 rounded"
                            >
                              <XCircle size={18} />
                            </button>
                            <button 
                              onClick={() => handleStatusChange(redemption.id, 'approved')}
                              className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-lg shadow-sm"
                            >
                              Approve
                            </button>
                          </div>
                        )}

                        {isParent && redemption.status === 'approved' && isCash && onRequestPayment && (
                          <button
                            onClick={() => onRequestPayment(redemption)}
                            className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-lg flex items-center gap-1 shadow-sm"
                          >
                            <Banknote size={14} /> Mark as Paid
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }
            })
          )}
        </div>
      </div>

      {/* Photo Viewer Modal */}
      <AnimatePresence>
        {viewingProof && (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setViewingProof(null)}>
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center"
            >
              <img src={viewingProof} alt="Full Proof" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
              <button 
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md"
                onClick={() => setViewingProof(null)}
              >
                <XCircle size={24} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
