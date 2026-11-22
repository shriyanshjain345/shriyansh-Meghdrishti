import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  detail?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  pushToast: (title: string, detail?: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue>({
  pushToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, detail?: string, tone: ToastTone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, detail, tone }]);
      setTimeout(() => {
        dismiss(id);
      }, 4200);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 lg:bottom-5 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => {
          const Icon =
            t.tone === 'success'
              ? CheckCircle2
              : t.tone === 'error' || t.tone === 'warning'
              ? AlertCircle
              : Info;
          const borderCls =
            t.tone === 'success'
              ? 'border-emerald-300 dark:border-emerald-500/40 text-emerald-900 dark:text-emerald-100'
              : t.tone === 'error'
              ? 'border-red-300 dark:border-red-500/45 text-red-900 dark:text-red-100'
              : t.tone === 'warning'
              ? 'border-amber-300 dark:border-amber-500/45 text-amber-900 dark:text-amber-100'
              : 'border-sky-300 dark:border-cyan-500/40 text-slate-900 dark:text-slate-100';
          const iconCls =
            t.tone === 'success'
              ? 'text-emerald-600 dark:text-emerald-400'
              : t.tone === 'error'
              ? 'text-red-600 dark:text-red-400'
              : t.tone === 'warning'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-[#0284C7] dark:text-cyan-400';

          return (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-xl bg-white/95 dark:bg-[#0b152a]/95 backdrop-blur-xl border shadow-2xl px-3.5 py-2.5 flex items-start gap-2.5 ${borderCls}`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconCls}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{t.title}</p>
                {t.detail && <p className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{t.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="p-0.5 rounded opacity-60 hover:opacity-100 cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};
