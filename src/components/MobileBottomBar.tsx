import React from 'react';
import {
  BrainCircuit,
  Camera,
  CloudSun,
  Menu,
  Radar,
} from 'lucide-react';
import type { NavPageId } from '../types/flood.ts';

interface MobileBottomBarProps {
  activePage: NavPageId;
  onSelectPage: (page: NavPageId) => void;
  onOpenMore: () => void;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({
  activePage,
  onSelectPage,
  onOpenMore,
}) => {
  const primaryTabs: Array<{
    id: NavPageId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'overview', label: 'Home', icon: CloudSun },
    { id: 'map', label: 'Radar', icon: Radar },
    { id: 'predictions', label: 'Predict', icon: BrainCircuit },
    { id: 'env-vision', label: 'Camera', icon: Camera },
  ];

  const isMoreActive = !primaryTabs.some((t) => t.id === activePage);

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 pb-safe bg-white/95 dark:bg-[#060c1b]/95 backdrop-blur-xl border-t border-slate-200 dark:border-cyan-500/20 shadow-[0_-4px_24px_rgba(2,6,23,0.18)]"
    >
      <div className="grid grid-cols-5 h-15 px-1">
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activePage === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectPage(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg transition-colors cursor-pointer ${
                active
                  ? 'text-[#0284C7] dark:text-cyan-300'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4.5 h-4.5 ${active ? 'scale-105' : ''} transition-transform`} />
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] rounded-lg transition-colors cursor-pointer ${
            isMoreActive
              ? 'text-[#0284C7] dark:text-cyan-300'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
          aria-label="Open full navigation menu"
        >
          <Menu className="w-4.5 h-4.5" />
          <span className="text-[10px] font-medium tracking-tight">More</span>
        </button>
      </div>
    </nav>
  );
};
