import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { Task, Redemption, UserProfile } from '../types';
import { Printer } from 'lucide-react';

interface Props {
  householdId: string;
  profile: UserProfile;
  members: UserProfile[];
  currency: string;
  isParent: boolean;
}

type DateRange = 'week' | 'month' | 'all';
type TypeFilter = 'all' | 'tasks' | 'rewards';

type Row =
  | { kind: 'task'; data: Task; date: Date }
  | { kind: 'redemption'; data: Redemption; date: Date };

const STATUS_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  approved:     { label: 'Approved',   icon: '✅', color: 'text-emerald-700' },
  submitted:    { label: 'Submitted',  icon: '⏳', color: 'text-amber-600'   },
  pending:      { label: 'Pending',    icon: '⏳', color: 'text-amber-600'   },
  accepted:     { label: 'In Progress',icon: '🔄', color: 'text-blue-600'    },
  needs_retry:  { label: 'Redo',       icon: '🔄', color: 'text-orange-600'  },
  missed:       { label: 'Missed',     icon: '❌', color: 'text-slate-400'   },
  forfeited:    { label: 'Missed',     icon: '❌', color: 'text-slate-400'   },
  pending_red:  { label: 'Requested',  icon: '⏳', color: 'text-amber-600'   },
  approved_red: { label: 'Approved',   icon: '✓',  color: 'text-indigo-700'  },
  paid:         { label: 'Paid',       icon: '💰', color: 'text-emerald-700' },
  rejected:     { label: 'Rejected',   icon: '❌', color: 'text-red-600'     },
};

const TYPE_BADGE: Record<string, string> = {
  daily:      'bg-green-100 text-green-800',
  weekly:     'bg-blue-100 text-blue-800',
  monthly:    'bg-pink-100 text-pink-800',
  adhoc_date: 'bg-amber-100 text-amber-800',
  adhoc_kpi:  'bg-purple-100 text-purple-800',
};

function rowBackground(row: Row): string {
  if (row.kind === 'redemption') return 'bg-rose-50/40 hover:bg-rose-50/60';
  const s = row.data.status;
  if (s === 'approved') return 'hover:bg-emerald-50/40';
  if (s === 'submitted' || s === 'pending' || s === 'accepted') return 'bg-amber-50/30';
  if (s === 'needs_retry') return 'bg-orange-50/30';
  return 'bg-slate-50/50 opacity-60';
}

function getDateBoundary(range: DateRange): Date {
  const now = new Date();
  if (range === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (range === 'month') {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(0);
}

export default function TaskStatement({ householdId, profile, members, currency, isParent }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selectedChild, setSelectedChild] = useState<string>('all');

  const children = members.filter(m => m.role === 'child');

  // Live data
  useEffect(() => {
    if (!householdId) return;
    setLoading(true);

    const tasksQ = query(
      collection(db, 'households', householdId, 'tasks'),
      orderBy('createdAt', 'desc')
    );
    const redemptionsQ = query(
      collection(db, 'households', householdId, 'redemptions'),
      orderBy('createdAt', 'desc')
    );

    let loadedTasks = false;
    let loadedRedemptions = false;

    const unsubTasks = onSnapshot(tasksQ, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
      loadedTasks = true;
      if (loadedRedemptions) setLoading(false);
    });

    const unsubRed = onSnapshot(redemptionsQ, snap => {
      setRedemptions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Redemption)));
      loadedRedemptions = true;
      if (loadedTasks) setLoading(false);
    });

    return () => { unsubTasks(); unsubRed(); };
  }, [householdId]);

  // Build & filter rows
  const rows = useMemo<Row[]>(() => {
    const boundary = getDateBoundary(dateRange);
    const childFilter = isParent ? selectedChild : profile.uid;

    const taskRows: Row[] = tasks
      .filter(t => {
        if (childFilter !== 'all' && t.assignedTo !== childFilter) return false;
        const date = (t.createdAt as Timestamp)?.toDate() ?? new Date(0);
        return date >= boundary;
      })
      .map(t => ({
        kind: 'task' as const,
        data: t,
        date: (t.createdAt as Timestamp)?.toDate() ?? new Date(0),
      }));

    const redRows: Row[] = redemptions
      .filter(r => {
        if (childFilter !== 'all' && r.childId !== childFilter) return false;
        const date = (r.createdAt as Timestamp)?.toDate() ?? new Date(0);
        return date >= boundary;
      })
      .map(r => ({
        kind: 'redemption' as const,
        data: r,
        date: (r.createdAt as Timestamp)?.toDate() ?? new Date(0),
      }));

    let combined: Row[];
    if (typeFilter === 'all') combined = [...taskRows, ...redRows];
    else if (typeFilter === 'tasks') combined = taskRows;
    else combined = redRows;

    return combined.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [tasks, redemptions, dateRange, typeFilter, selectedChild, isParent, profile.uid]);

  // Summary stats
  const stats = useMemo(() => {
    const earned = rows
      .filter(r => r.kind === 'task' && r.data.status === 'approved')
      .reduce((sum, r) => sum + ((r.data as Task).pointValue ?? 0), 0);
    const spent = rows
      .filter(r => r.kind === 'redemption' && r.data.status !== 'rejected')
      .reduce((sum, r) => sum + ((r.data as Redemption).pointsSpent ?? 0), 0);
    const tasksDone = rows.filter(r => r.kind === 'task' && r.data.status === 'approved').length;
    return { earned, spent, balance: earned - spent, tasksDone };
  }, [rows]);

  const focusChild = isParent
    ? (selectedChild === 'all' ? 'All Children' : members.find(m => m.uid === selectedChild)?.displayName ?? '')
    : profile.displayName;

  return (
    <div className="space-y-6 pb-32">

      {/* Print header — only visible when printing */}
      <div className="hidden print:block mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-xl font-black text-slate-900">⚓ Home Anchor</h1>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-bold">{focusChild} — Task Statement</p>
            <p>Printed: {new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Filters — hidden when printing */}
      <div className="print:hidden space-y-3">

        {/* Child selector (parent only) */}
        {isParent && children.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedChild('all')}
              className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${selectedChild === 'all' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200'}`}
            >
              All Children
            </button>
            {children.map(c => (
              <button
                key={c.uid}
                onClick={() => setSelectedChild(c.uid)}
                className={`px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${selectedChild === c.uid ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200'}`}
              >
                {c.displayName}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          {/* Date range */}
          <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {(['week', 'month', 'all'] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-r border-slate-100 last:border-0 ${dateRange === r ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'All Time'}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {(['all', 'tasks', 'rewards'] as TypeFilter[]).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-r border-slate-100 last:border-0 ${typeFilter === t ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                {t === 'all' ? 'All' : t === 'tasks' ? 'Tasks' : 'Rewards'}
              </button>
            ))}
          </div>

          {/* Print button */}
          <button
            onClick={() => window.print()}
            className="ml-auto flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all shadow"
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tasks Done</div>
          <div className="text-3xl font-black text-slate-900">{stats.tasksDone}</div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest">approved</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Points Earned</div>
          <div className="text-3xl font-black text-emerald-600">+{stats.earned}</div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest">= {currency}{stats.earned}</div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Points Spent</div>
          <div className="text-3xl font-black text-rose-500">-{stats.spent}</div>
          <div className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-widest">rewards & cash</div>
        </div>
        <div className="bg-emerald-600 rounded-2xl p-4 shadow-sm">
          <div className="text-[10px] font-black text-emerald-200 uppercase tracking-widest mb-1">Net Balance</div>
          <div className="text-3xl font-black text-white">{stats.balance}</div>
          <div className="text-[10px] text-emerald-200 font-bold mt-0.5 uppercase tracking-widest">= {currency}{stats.balance}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">Transaction Log</h2>
          <span className="text-xs text-slate-400 font-bold">{rows.length} entries</span>
        </div>

        {/* Column headings */}
        <div className={`grid gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest ${isParent ? 'grid-cols-12' : 'grid-cols-11'}`}>
          <div className="col-span-2">Date</div>
          {isParent && <div className="col-span-1">Child</div>}
          <div className="col-span-4">Task / Reward</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Points</div>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-bold">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold italic">No records found for this period.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map((row, i) => {
              const isMissed = row.kind === 'task' && (row.data.status === 'missed' || row.data.status === 'forfeited');
              const isRedemption = row.kind === 'redemption';

              const childName = isRedemption
                ? (row.data as Redemption).childName
                : members.find(m => m.uid === (row.data as Task).assignedTo)?.displayName ?? '—';

              const childInitial = childName?.[0]?.toUpperCase() ?? '?';

              // Points display
              let pointsDisplay = '—';
              let pointsColor = 'text-slate-400';
              if (row.kind === 'task' && row.data.status === 'approved') {
                pointsDisplay = `+${(row.data as Task).pointValue}`;
                pointsColor = 'text-emerald-600';
              } else if (row.kind === 'task' && (row.data.status === 'submitted' || row.data.status === 'accepted' || row.data.status === 'pending')) {
                pointsDisplay = `+${(row.data as Task).pointValue}?`;
                pointsColor = 'text-amber-500';
              } else if (row.kind === 'redemption' && row.data.status !== 'rejected') {
                pointsDisplay = `-${(row.data as Redemption).pointsSpent}`;
                pointsColor = 'text-rose-500';
              }

              // Status display
              const statusKey = isRedemption
                ? (row.data.status === 'pending' ? 'pending_red' : row.data.status === 'approved' ? 'approved_red' : row.data.status)
                : row.data.status;
              const statusInfo = STATUS_DISPLAY[statusKey] ?? { label: row.data.status, icon: '•', color: 'text-slate-500' };

              // Type badge
              let typeBadge: string;
              let typeBadgeClass: string;
              if (row.kind === 'task') {
                const t = row.data as Task;
                typeBadge = (t.taskType ?? 'adhoc_date').replace('_', ' ');
                typeBadgeClass = TYPE_BADGE[t.taskType ?? 'adhoc_date'];
              } else {
                const r = row.data as Redemption;
                typeBadge = r.type === 'cash' ? '💸 Cash Out' : '🎁 Reward';
                typeBadgeClass = 'bg-rose-100 text-rose-800';
              }

              const title = row.kind === 'task'
                ? (row.data as Task).title
                : (row.data as Redemption).title;

              return (
                <div
                  key={`${row.kind}-${row.data.id}-${i}`}
                  className={`grid gap-2 px-6 py-3.5 items-center transition-colors ${isParent ? 'grid-cols-12' : 'grid-cols-11'} ${rowBackground(row)}`}
                >
                  <div className="col-span-2 text-xs text-slate-500 font-bold whitespace-nowrap">
                    {row.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </div>

                  {isParent && (
                    <div className="col-span-1">
                      <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 rounded-lg px-1.5 py-0.5">
                        {childInitial}
                      </span>
                    </div>
                  )}

                  <div className={`col-span-4 text-sm font-bold text-slate-800 truncate ${isMissed ? 'line-through text-slate-400' : ''}`}>
                    {title}
                  </div>

                  <div className="col-span-2">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${typeBadgeClass}`}>
                      {typeBadge}
                    </span>
                  </div>

                  <div className={`col-span-2 text-[10px] font-black ${statusInfo.color}`}>
                    {statusInfo.icon} {statusInfo.label}
                  </div>

                  <div className={`col-span-1 text-right font-black text-sm ${pointsColor}`}>
                    {pointsDisplay}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer totals */}
        {!loading && rows.length > 0 && (
          <div className="px-6 py-4 bg-slate-900 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {dateRange === 'week' ? 'This Week' : dateRange === 'month' ? 'This Month' : 'All Time'} Total
            </div>
            <div className="col-span-2 text-xs font-black text-emerald-400">+{stats.earned} earned</div>
            <div className="col-span-2 text-xs font-black text-rose-400">-{stats.spent} spent</div>
            <div className="col-span-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Balance</div>
            <div className="col-span-1 text-right text-white font-black text-sm">{stats.balance}</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest print:hidden">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-200 inline-block" /> Earned</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-200 inline-block" /> Spent</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-200 inline-block" /> Pending</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-200 inline-block" /> Missed</span>
      </div>

    </div>
  );
}
