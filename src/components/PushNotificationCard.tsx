import React, { useEffect, useState } from 'react';
import { Bell, BellRing, BellOff } from 'lucide-react';
import { enablePushNotifications, getPushPermissionState, PushPermissionResult } from '../lib/push';

interface Props {
  uid: string;
}

export default function PushNotificationCard({ uid }: Props) {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PushPermissionResult | null>(null);

  useEffect(() => {
    setPermission(getPushPermissionState());
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await enablePushNotifications(uid);
      setResult(res);
      setPermission(getPushPermissionState());
    } finally {
      setLoading(false);
    }
  };

  if (permission === null) return null; // unsupported browser — don't show a dead-end card

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 flex-shrink-0">
            {permission === 'granted' ? <BellRing size={22} /> : <Bell size={22} />}
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 leading-none mb-1">Push Notifications</h3>
            <p className="text-slate-500 font-medium text-sm">Deadline reminders and nudges, even when the app's closed</p>
          </div>
        </div>
      </div>

      {permission === 'granted' ? (
        <div className="flex items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-widest">
          <BellRing size={14} /> Enabled on this device
        </div>
      ) : permission === 'denied' ? (
        <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
          <BellOff size={16} className="flex-shrink-0" />
          Blocked in your browser settings. Enable notifications for this site to turn it back on.
        </div>
      ) : (
        <button
          onClick={handleEnable}
          disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all disabled:opacity-50"
        >
          <Bell size={14} /> {loading ? 'Enabling…' : 'Enable Push Notifications'}
        </button>
      )}

      {result === 'not-configured' && (
        <p className="text-amber-600 text-xs font-bold mt-3">Push isn't configured for this app yet.</p>
      )}
    </div>
  );
}
