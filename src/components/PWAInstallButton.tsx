import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall.ts';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-[#E0F2FE] dark:bg-cyan-500/15 border border-sky-300 dark:border-cyan-500/35 px-3 py-1.5 text-xs font-medium text-[#0284C7] dark:text-cyan-200 hover:bg-sky-100 dark:hover:bg-cyan-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Install Meghdrishti as an app"
      >
        <Download className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
        <span>{compact ? 'Install' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
          <span>{compact ? 'Install' : 'Add to Home'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#0b1222] border border-slate-200 dark:border-slate-700 p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Install Meghdrishti on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Close installation guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
                <li>Tap the <strong>Share</strong> icon in the Safari navigation bar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> to launch Meghdrishti in standalone mode.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#0284C7] py-2 text-sm font-medium text-white hover:bg-[#0369A1] transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-[#FFFBEB] dark:bg-amber-950/95 border border-[#FDE68A] dark:border-amber-500/40 px-3.5 py-2 text-xs font-medium text-[#B45309] dark:text-amber-200 shadow-lg">
      <WifiOff className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
      <span>Offline mode — displaying cached static assets only. Live telemetry unavailable.</span>
    </div>
  );
};
