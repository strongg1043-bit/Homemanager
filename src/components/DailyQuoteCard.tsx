import React, { useEffect, useState } from 'react';
import { getDailyQuote } from '../lib/dailyQuote';

type State = 'loading' | 'ready' | 'hidden';

export default function DailyQuoteCard() {
  const [state, setState] = useState<State>('loading');
  const [quote, setQuote] = useState('');

  useEffect(() => {
    let cancelled = false;
    getDailyQuote().then(q => {
      if (cancelled) return;
      if (q) { setQuote(q); setState('ready'); }
      else setState('hidden');
    });
    return () => { cancelled = true; };
  }, []);

  if (state === 'hidden') return null;

  // ── Skeleton while loading ───────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <div
        className="relative rounded-[1.75rem] overflow-hidden mb-6 shadow-xl"
        style={{ background: 'linear-gradient(135deg,#1B3A5C 0%,#2E7D6B 100%)' }}
      >
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full opacity-10 bg-white pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-5 bg-white pointer-events-none" />
        <div className="relative z-10 p-8 space-y-4 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-3 w-40 rounded-full bg-white/15" />
            <div className="h-3 w-20 rounded-full bg-white/10" />
          </div>
          <div className="space-y-2 pt-2">
            <div className="h-4 rounded-full bg-white/10 w-full" />
            <div className="h-4 rounded-full bg-white/10 w-11/12" />
            <div className="h-4 rounded-full bg-white/10 w-4/5" />
          </div>
          <div className="h-3 w-36 rounded-full bg-white/10" />
        </div>
      </div>
    );
  }

  // ── Rendered quote ───────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div
      className="relative rounded-[1.75rem] overflow-hidden mb-6 shadow-xl shadow-indigo-100/60"
      style={{ background: 'linear-gradient(135deg,#1B3A5C 0%,#2E7D6B 100%)' }}
    >
      <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-[0.07] bg-white pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full opacity-[0.05] bg-white pointer-events-none" />
      <div className="absolute top-1/2 right-20 w-16 h-16 rounded-full opacity-[0.04] bg-white pointer-events-none" />

      <div className="relative z-10 p-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                 style={{ background: 'rgba(255,255,255,0.12)' }}>
              ⚓
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: 'rgba(255,255,255,0.65)' }}>
              Daily Family Inspiration
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.35)' }}>
            {today}
          </span>
        </div>

        <div className="text-[72px] font-black leading-[0.65] mb-2 select-none"
             style={{ color: 'rgba(245,163,90,0.55)', fontFamily: 'Georgia, serif' }}>
          "
        </div>

        <p className="text-white font-bold leading-relaxed mb-5" style={{ fontSize: '16px' }}>
          {quote}
        </p>

        <div className="flex items-end justify-between">
          <span className="text-[11px] font-semibold italic"
                style={{ color: 'rgba(255,255,255,0.45)' }}>
            — Home Anchor · Daily AI Inspiration
          </span>
          <div className="text-[36px] font-black leading-none select-none"
               style={{ color: 'rgba(245,163,90,0.35)', fontFamily: 'Georgia, serif' }}>
            "
          </div>
        </div>
      </div>
    </div>
  );
}
