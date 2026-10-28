import React, { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

const DISMISSED_KEY = 'installBannerDismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** One-time, dismiss-forever nudge to install the PWA, shown only to browser
 *  visitors who haven't already installed or dismissed it. Android/Chrome gets
 *  a real install button via beforeinstallprompt; iOS Safari (which never fires
 *  that event) gets manual "Add to Home Screen" instructions instead. */
export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
    } catch {
      // localStorage unavailable (private window etc.) — treat as not dismissed
    }
    if (dismissed) return;

    setIsIOS(/iPad|iPhone|iPod/.test(window.navigator.userAgent));

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    // Delay so it doesn't compete with the first screen a visitor sees.
    const timer = setTimeout(() => setVisible(true), 4000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* ignore */ }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    dismiss();
  };

  if (!visible) return null;

  return (
    // Sits above the app's bottom tab nav (fixed bottom-0, ~90px tall on both
    // dashboards) rather than overlapping it — bottom-24 clears that plus a gap.
    <div className="fixed bottom-24 inset-x-0 z-40 px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto bg-slate-900 text-white rounded-2xl shadow-2xl shadow-black/20 p-4 flex items-start gap-3">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Download size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm leading-tight">Install Home Anchor</p>
          {isIOS ? (
            <p className="text-xs text-slate-300 font-medium mt-1 leading-relaxed flex items-center gap-1 flex-wrap">
              Tap <Share size={13} className="inline -mt-0.5" /> then "Add to Home Screen" for the full app experience.
            </p>
          ) : (
            <p className="text-xs text-slate-300 font-medium mt-1 leading-relaxed">
              Add it to your home screen for a faster, full-screen experience.
            </p>
          )}
          {!isIOS && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wide rounded-xl transition-all"
            >
              Install
            </button>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-slate-400 hover:text-white flex-shrink-0 p-1">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
