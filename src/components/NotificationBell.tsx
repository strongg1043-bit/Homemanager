import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, limit, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { Notification } from '../types';
import { Bell, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { markAllRead } from '../lib/notifications';

interface Props {
  householdId: string;
  userId: string;
}

export default function NotificationBell({ householdId, userId }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!householdId || !userId) return;

    const q = query(
      collection(db, 'households', householdId, 'notifications'),
      where('recipientId', '==', userId),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification))
        .sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
      setNotifications(fetched);
      setUnreadCount(fetched.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, [householdId, userId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen && unreadCount > 0) {
      // markAllRead(householdId, userId); // Optional: mark all read when opening? 
      // The instructions say "Mark notifications as read when the panel opens (not just on click)"
      markAllRead(householdId, userId);
    }
  };

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'households', householdId, 'notifications', id), {
        read: true
      });
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (timestamp: Timestamp | null | undefined) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={handleToggle}
        className="relative p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all"
      >
        <Bell size={24} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full border-2 border-white flex items-center justify-center animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-4 w-80 sm:w-96 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-[60]"
          >
            <div className="p-6 border-b border-slate-50 flex items-center justify-between">
              <h3 className="font-black text-slate-900 uppercase tracking-tight text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button 
                  onClick={() => markAllRead(householdId, userId)}
                  className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto scrollbar-hide py-2">
              {notifications.length > 0 ? (
                notifications.map((n) => (
                  <button 
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={`w-full p-4 flex gap-4 text-left hover:bg-slate-50 transition-colors relative group ${!n.read ? 'bg-indigo-50/40' : ''}`}
                  >
                    <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-2xl border border-slate-100">
                      {n.emoji}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-slate-900 text-sm leading-tight">{n.title}</span>
                        <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatTime(n.createdAt)}</span>
                      </div>
                      <p className="text-slate-500 text-xs mt-1 font-medium line-clamp-2">{n.message}</p>
                    </div>
                    {!n.read && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-indigo-600 rounded-full" />
                    )}
                  </button>
                ))
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-200">
                    <Sparkles size={32} />
                  </div>
                  <p className="text-slate-400 font-black text-sm uppercase tracking-tight">All caught up! 🎉</p>
                </div>
              )}
            </div>
            
            {notifications.length > 0 && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Showing latest activity</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
