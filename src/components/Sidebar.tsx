import React from 'react';
import { LayoutGroup, motion } from 'motion/react';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  Camera,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  Globe2,
  History,
  Hospital,
  Info,
  Radar,
  ShieldAlert,
  Wind,
  X,
} from 'lucide-react';
import type { NavPageId } from '../types/flood.ts';
import { BrandLogo } from './BrandLogo.tsx';

export interface NavItemConfig {
  id: NavPageId;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'overview', label: 'Home', shortLabel: 'Home', icon: CloudSun },
  { id: 'map', label: 'Weather Radar', shortLabel: 'Radar', icon: Radar },
  { id: 'predictions', label: 'AI Predictions', shortLabel: 'Predictions', icon: BrainCircuit },
  { id: 'env-vision', label: 'Environmental Camera', shortLabel: 'Camera', icon: Camera },
  { id: 'air-quality', label: 'Air Quality', shortLabel: 'Air Quality', icon: Wind },
  { id: 'comparison', label: 'City Explorer', shortLabel: 'Cities', icon: Globe2 },
  { id: 'historical', label: 'Historical Analysis', shortLabel: 'History', icon: History },
  { id: 'relief', label: 'Relief Centres', shortLabel: 'Relief', icon: Hospital },
  { id: 'guide', label: 'Emergency Guide', shortLabel: 'Emergency', icon: ShieldAlert },
  { id: 'performance', label: 'Model Performance', shortLabel: 'Model Eval', icon: BarChart3 },
  { id: 'about', label: 'About Meghdrishti', shortLabel: 'About', icon: Info },
];

interface SidebarProps {
  activePage: NavPageId;
  onSelectPage: (page: NavPageId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) => {
  const handleSpotMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  };

  const renderNavList = (isMobile: boolean) => {
    const groupId = isMobile ? 'sidebar-nav-mobile' : 'sidebar-nav-desktop';
    return (
      <LayoutGroup id={groupId}>
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              activePage === item.id ||
              (item.id === 'overview' && (activePage === 'live' || activePage === 'weather'));
            return (
              <button
                key={item.id}
                type="button"
                onMouseMove={handleSpotMove}
                onClick={() => {
                  onSelectPage(item.id);
                  if (isMobile) onCloseMobile();
                }}
                title={collapsed && !isMobile ? item.label : undefined}
                className={`spotlight-surface tactile-btn relative w-full flex items-center gap-3 rounded-xl px-3 min-h-[42px] text-[13px] font-medium transition-colors cursor-pointer ${
                  active
                    ? 'text-[#0284C7] dark:text-cyan-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800/50'
                } ${collapsed && !isMobile ? 'justify-center px-0' : ''}`}
              >
                {active && (
                  <motion.span
                    layoutId={groupId}
                    transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-[#E0F2FE] dark:bg-gradient-to-r dark:from-cyan-500/18 dark:to-blue-500/12 border border-sky-200 dark:border-cyan-400/35 shadow-xs pointer-events-none"
                  />
                )}
                <Icon
                  className={`w-4 h-4 shrink-0 relative z-10 ${
                    active ? 'text-[#0284C7] dark:text-cyan-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                {(!collapsed || isMobile) && (
                  <span className="truncate whitespace-nowrap relative z-10">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>
      </LayoutGroup>
    );
  };

  return (
    <>
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-white dark:bg-[#050a17] border-r border-slate-200 dark:border-slate-800/70 transition-[width] duration-200 ${
          collapsed ? 'w-[70px]' : 'w-64'
        }`}
      >
        <div className="h-14 flex items-center justify-between px-3.5 border-b border-slate-200 dark:border-slate-800/70">
          {!collapsed && <BrandLogo variant="full" showTagline />}
          {collapsed && <BrandLogo variant="icon" iconClassName="w-8 h-8 rounded-lg mx-auto" />}
        </div>

        {renderNavList(false)}

        <div className="p-2.5 border-t border-slate-200 dark:border-slate-800/70 space-y-2">
          {!collapsed && (
            <button
              type="button"
              onClick={() => onSelectPage('live')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs border transition-colors cursor-pointer ${
                activePage === 'live'
                  ? 'bg-[#E0F2FE] border-sky-300 text-[#0284C7] dark:bg-cyan-500/15 dark:border-cyan-500/40 dark:text-cyan-200'
                  : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-2 font-medium">
                <Activity className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                <span>Telemetry Channels</span>
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="tactile-btn w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse Menu</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-76 max-w-[85vw] bg-white dark:bg-[#050a17] border-r border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl">
            <div className="h-14 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
              <BrandLogo variant="full" showTagline />
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNavList(true)}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={() => {
                  onSelectPage('live');
                  onCloseMobile();
                }}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-medium bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                  <span>Telemetry Channels &amp; Feed Health</span>
                </span>
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1">
                Decision-support platform. Always follow official IMD / NDMA / SDMA warnings.
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
