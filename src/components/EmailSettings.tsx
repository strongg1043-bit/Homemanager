import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import {
  getEmailSettings,
  invalidateEmailSettingsCache,
  DEFAULT_EMAIL_SETTINGS,
  type EmailSettingsMap,
  type NotificationId,
} from '../lib/email';
import { Anchor, Save, Loader2, Info } from 'lucide-react';

// ── Notification metadata ─────────────────────────────────────────────────────
const NOTIFICATIONS: {
  id: NotificationId;
  emoji: string;
  label: string;
  description: string;
  recipient: 'Child' | 'Parent';
}[] = [
  {
    id: 'task-approved',
    emoji: '✅',
    label: 'Task Approved',
    description: 'Sent to the child when a parent approves a completed task.',
    recipient: 'Child',
  },
  {
    id: 'task-needs-retry',
    emoji: '💪',
    label: 'Task Needs Retry',
    description: 'Sent to the child when a parent sends a task back for rework.',
    recipient: 'Child',
  },
  {
    id: 'payment-confirmation',
    emoji: '💰',
    label: 'Payment Confirmed',
    description: 'Sent to the child when a parent confirms a cash-out payment.',
    recipient: 'Child',
  },
  {
    id: 'cashout-request',
    emoji: '💸',
    label: 'Cash-out Requested',
    description: 'Sent to the parent when a child submits a cash-out request.',
    recipient: 'Parent',
  },
  {
    id: 'welcome',
    emoji: '🏠',
    label: 'Welcome',
    description: 'Sent when a new member joins or creates a household.',
    recipient: 'Child',
  },
  {
    id: 'parent-invite',
    emoji: '🚀',
    label: 'Parent Invite',
    description: 'Sent to a parent when a child invites them to join the household.',
    recipient: 'Parent',
  },
];

// ── Toggle component ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-12 h-7 rounded-full transition-all relative flex-shrink-0 ${on ? 'bg-indigo-600' : 'bg-slate-200'}`}
      aria-label={on ? 'Enabled' : 'Disabled'}
    >
      <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${on ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────
function NotificationRow({
  notification,
  footerOn,
  onToggleFooter,
}: {
  notification: (typeof NOTIFICATIONS)[number];
  footerOn: boolean;
  onToggleFooter: () => void;
}) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      {/* Left: identity */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-xl flex-shrink-0">
          {notification.emoji}
        </div>
        <div className="min-w-0">
          <p className="font-black text-slate-900 text-sm leading-tight">{notification.label}</p>
          <p className="text-xs text-slate-400 font-medium leading-snug mt-0.5 truncate">
            {notification.description}
          </p>
        </div>
      </div>

      {/* Right: sustainability footer toggle */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 hidden sm:block">
          ⚓ Footer
        </span>
        <Toggle on={footerOn} onToggle={onToggleFooter} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EmailSettings() {
  const [settings, setSettings] = useState<EmailSettingsMap>({ ...DEFAULT_EMAIL_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load current settings from Firestore (via cached helper)
  useEffect(() => {
    getEmailSettings().then((s) => {
      setSettings({ ...s });
      setLoading(false);
    });
  }, []);

  const toggleFooter = (id: NotificationId) => {
    setSettings((prev) => ({
      ...prev,
      [id]: { ...prev[id], sustainabilityFooter: !prev[id].sustainabilityFooter },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      // /settings collection has parent-write rules already in place
      await setDoc(doc(db, 'settings', 'sustainabilityFooter'), settings);
      invalidateEmailSettingsCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save email settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-slate-300" size={28} />
      </div>
    );
  }

  const childNotifications = NOTIFICATIONS.filter((n) => n.recipient === 'Child');
  const parentNotifications = NOTIFICATIONS.filter((n) => n.recipient === 'Parent');

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
        <Anchor size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 font-medium leading-relaxed">
          The <strong>Support Home Anchor</strong> block (with banking details) can be shown or hidden
          independently on each notification type. All other notification content is unaffected.
        </p>
      </div>

      {/* Child notifications */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
          Child Notifications
        </p>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {childNotifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              footerOn={settings[n.id].sustainabilityFooter}
              onToggleFooter={() => toggleFooter(n.id)}
            />
          ))}
        </div>
      </div>

      {/* Parent notifications */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">
          Parent Notifications
        </p>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {parentNotifications.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              footerOn={settings[n.id].sustainabilityFooter}
              onToggleFooter={() => toggleFooter(n.id)}
            />
          ))}
        </div>
      </div>

      {/* Save row */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 text-white font-black px-8 py-4 rounded-2xl flex items-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          Save Changes
        </button>
        {saved && (
          <p className="text-emerald-600 font-bold flex items-center gap-2">
            <Info size={18} /> Settings saved!
          </p>
        )}
      </div>
    </div>
  );
}
