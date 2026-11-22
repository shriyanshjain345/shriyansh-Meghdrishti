import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import type { RiskLevel, UnitsSystem } from '../types/flood.ts';

export type ThemeMode = 'light' | 'dark';

export const RISK_STYLES: Record<
  RiskLevel | 'UNAVAILABLE',
  {
    text: string;
    badgeClasses: string;
    bgSoft: string;
    border: string;
    hex: string;
    label: string;
  }
> = {
  LOW: {
    text: 'text-[#047857] dark:text-emerald-400',
    badgeClasses:
      'text-[#047857] bg-[#ECFDF5] border-[#A7F3D0] dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30',
    bgSoft: 'bg-[#ECFDF5] dark:bg-emerald-500/10',
    border: 'border-[#A7F3D0] dark:border-emerald-500/30',
    hex: '#059669',
    label: 'LOW',
  },
  MODERATE: {
    text: 'text-[#B45309] dark:text-amber-300',
    badgeClasses:
      'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A] dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30',
    bgSoft: 'bg-[#FFFBEB] dark:bg-amber-500/10',
    border: 'border-[#FDE68A] dark:border-amber-500/30',
    hex: '#D97706',
    label: 'MODERATE',
  },
  HIGH: {
    text: 'text-[#C2410C] dark:text-orange-400',
    badgeClasses:
      'text-[#C2410C] bg-[#FFF7ED] border-[#FED7AA] dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/30',
    bgSoft: 'bg-[#FFF7ED] dark:bg-orange-500/10',
    border: 'border-[#FED7AA] dark:border-orange-500/30',
    hex: '#EA580C',
    label: 'HIGH',
  },
  SEVERE: {
    text: 'text-[#B91C1C] dark:text-red-400',
    badgeClasses:
      'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA] dark:text-red-300 dark:bg-red-500/10 dark:border-red-500/30',
    bgSoft: 'bg-[#FEF2F2] dark:bg-red-500/10',
    border: 'border-[#FECACA] dark:border-red-500/30',
    hex: '#DC2626',
    label: 'SEVERE',
  },
  UNAVAILABLE: {
    text: 'text-slate-600 dark:text-slate-400',
    badgeClasses:
      'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/50 dark:border-slate-700',
    bgSoft: 'bg-slate-100 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-700',
    hex: '#64748B',
    label: 'UNAVAILABLE',
  },
};

export const RiskStatusIndicator: React.FC<{
  level: RiskLevel | 'UNAVAILABLE';
  showText?: boolean;
}> = ({ level, showText = true }) => {
  const s = RISK_STYLES[level];
  const Icon =
    level === 'SEVERE'
      ? AlertOctagon
      : level === 'HIGH'
      ? ShieldAlert
      : level === 'MODERATE'
      ? AlertTriangle
      : level === 'LOW'
      ? CheckCircle2
      : Info;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${s.badgeClasses} whitespace-nowrap shrink-0`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {showText && <span>{s.label}</span>}
    </span>
  );
};

export function getChartTheme(theme: ThemeMode) {
  const isDark = theme === 'dark';
  return {
    gridStroke: isDark ? '#1e293b' : '#E2E8F0',
    axisStroke: isDark ? '#64748b' : '#CBD5E1',
    tickFill: isDark ? '#94a3b8' : '#334155',
    tickLabelFill: isDark ? '#cbd5e1' : '#334155',
    refLineStroke: isDark ? '#475569' : '#94A3B8',
    tooltipStyle: isDark
      ? {
          backgroundColor: '#0b1222',
          borderColor: '#334155',
          color: '#f1f5f9',
          borderRadius: '0.5rem',
          fontSize: '12px',
        }
      : {
          backgroundColor: '#FFFFFF',
          borderColor: '#CBD5E1',
          color: '#0F172A',
          borderRadius: '0.5rem',
          fontSize: '12px',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
        },
    colors: {
      ocean: '#0284C7',
      royal: '#2563EB',
      teal: '#0D9488',
      amber: '#D97706',
      crimson: '#DC2626',
    },
  };
}

export function formatTemperature(celsius: number | null | undefined, units: UnitsSystem): string {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) return 'Unavailable';
  if (units === 'IMPERIAL') {
    return `${((celsius * 9) / 5 + 32).toFixed(1)} °F`;
  }
  return `${celsius.toFixed(1)} °C`;
}

export function formatRain(mm: number | null | undefined, units: UnitsSystem, perHour = false): {
  value: string;
  unit: string;
} {
  if (mm === null || mm === undefined || Number.isNaN(mm)) {
    return { value: 'Unavailable', unit: '' };
  }
  if (units === 'IMPERIAL') {
    return {
      value: (mm / 25.4).toFixed(2),
      unit: perHour ? 'in/hr' : 'in',
    };
  }
  return {
    value: mm.toFixed(1),
    unit: perHour ? 'mm/hr' : 'mm',
  };
}

export function formatWind(kmh: number | null | undefined, units: UnitsSystem): string {
  if (kmh === null || kmh === undefined || Number.isNaN(kmh)) return 'Unavailable';
  if (units === 'IMPERIAL') {
    return `${(kmh * 0.621371).toFixed(1)} mph`;
  }
  return `${kmh.toFixed(1)} km/h`;
}

export function formatTimestampIST(iso: string | null | undefined): string {
  if (!iso) return 'Unavailable';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return `${d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    })} IST`;
  } catch {
    return iso;
  }
}
