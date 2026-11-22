import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, RotateCw } from 'lucide-react';

/**
 * Zero-rerender pointer tracking hook for cursor-aligned spotlight radial glow.
 */
export function useSpotlightPointer<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const prefersReduced = useReducedMotion();

  const onMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      if (prefersReduced || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      ref.current.style.setProperty('--spot-x', `${x}px`);
      ref.current.style.setProperty('--spot-y', `${y}px`);
    },
    [prefersReduced]
  );

  return { ref, onMouseMove };
}

/**
 * Tactile card container with cursor-tracking spotlight border & smooth hover elevation.
 */
export const SpotlightCard: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    tactile?: boolean;
  }
> = ({ children, className = '', tactile = true, onMouseMove, ...rest }) => {
  const { ref, onMouseMove: handleSpotMove } = useSpotlightPointer<HTMLDivElement>();

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        handleSpotMove(e);
        onMouseMove?.(e);
      }}
      className={`spotlight-surface ${tactile ? 'tactile-card hover:shadow-md dark:hover:shadow-cyan-950/30 hover:border-sky-300/80 dark:hover:border-cyan-500/35' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * ScrollReveal wrapper driven by IntersectionObserver with staggered cascade delay.
 * Keeps critical content immediately interactive in DOM and honors prefers-reduced-motion.
 */
export const ScrollReveal: React.FC<{
  children: React.ReactNode;
  delayMs?: number;
  className?: string;
}> = ({ children, delayMs = 0, className = '' }) => {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState<boolean>(() => Boolean(prefersReduced));

  useEffect(() => {
    if (prefersReduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -16px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [prefersReduced]);

  return (
    <div
      ref={ref}
      style={{
        transitionDelay: visible && !prefersReduced ? `${delayMs}ms` : '0ms',
      }}
      className={`${
        prefersReduced
          ? ''
          : 'transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity]'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${className}`}
    >
      {children}
    </div>
  );
};

/**
 * RequestAnimationFrame animated numeric counter with tabular-nums formatting.
 */
export const AnimatedNumber: React.FC<{
  value: number | null | undefined;
  decimals?: number;
  durationMs?: number;
  fallback?: string;
  className?: string;
}> = ({ value, decimals = 0, durationMs = 620, fallback = 'Unavailable', className = '' }) => {
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(
    value !== null && value !== undefined && Number.isFinite(value) ? value : null
  );
  const prevRef = useRef<number>(
    value !== null && value !== undefined && Number.isFinite(value) ? value : 0
  );

  useEffect(() => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      setDisplay(null);
      return;
    }

    if (prefersReduced) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }

    const from = prevRef.current;
    const to = value;
    if (Math.abs(to - from) < 0.001) {
      setDisplay(to);
      return;
    }

    let rafId = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        setDisplay(to);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs, prefersReduced]);

  if (display === null) {
    return <span className={className}>{fallback}</span>;
  }

  return (
    <span className={`tabular-nums ${className}`}>
      {display.toFixed(decimals)}
    </span>
  );
};

/**
 * Reusable 3D Flip Card with zero layout shift (CSS Grid overlap), touch/click toggle,
 * keyboard accessibility (Enter/Space), spotlight tracking, and interactive child button safety.
 */
export const FlipCard: React.FC<{
  front: React.ReactNode;
  back: React.ReactNode;
  ariaLabel: string;
  className?: string;
  flipped?: boolean;
  onFlipChange?: (flipped: boolean) => void;
}> = ({ front, back, ariaLabel, className = '', flipped: controlledFlipped, onFlipChange }) => {
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = controlledFlipped !== undefined ? controlledFlipped : internalFlipped;

  const { ref: frontSpotRef, onMouseMove: frontMove } = useSpotlightPointer<HTMLDivElement>();
  const { ref: backSpotRef, onMouseMove: backMove } = useSpotlightPointer<HTMLDivElement>();

  const toggle = useCallback(() => {
    const next = !isFlipped;
    if (controlledFlipped === undefined) {
      setInternalFlipped(next);
    }
    onFlipChange?.(next);
  }, [isFlipped, controlledFlipped, onFlipChange]);

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, input, select, [data-no-flip="true"]')) {
      return;
    }
    toggle();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target !== e.currentTarget && target?.closest('a, button, input, select')) {
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isFlipped}
      aria-label={`${ariaLabel} (${isFlipped ? 'showing details, activate to flip back' : 'activate to flip for details'})`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className={`flip-card-perspective group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] dark:focus-visible:ring-cyan-400 rounded-xl ${className}`}
    >
      <div className={`flip-card-inner h-full ${isFlipped ? 'is-flipped' : ''}`}>
        {/* Front Face */}
        <div
          ref={frontSpotRef}
          onMouseMove={frontMove}
          aria-hidden={isFlipped}
          className={`flip-card-face spotlight-surface rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm group-hover:shadow-md group-hover:border-sky-300/80 dark:group-hover:border-cyan-500/35 transition-[border-color,box-shadow] duration-200 p-4 flex flex-col justify-between ${
            isFlipped ? 'pointer-events-none' : ''
          }`}
        >
          {front}
        </div>

        {/* Back Face */}
        <div
          ref={backSpotRef}
          onMouseMove={backMove}
          aria-hidden={!isFlipped}
          className={`flip-card-face flip-card-back spotlight-surface rounded-xl bg-slate-50/95 dark:bg-[#0d162b] border border-sky-200 dark:border-cyan-500/35 shadow-md p-4 flex flex-col justify-between ${
            !isFlipped ? 'pointer-events-none' : ''
          }`}
        >
          {back}
        </div>
      </div>
    </div>
  );
};

export const FlipHintBadge: React.FC<{ label?: string; flipped?: boolean }> = ({
  label = 'Flip for formula & source',
  flipped = false,
}) => (
  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#0284C7] dark:text-cyan-400/90 group-hover:text-[#0369A1] dark:group-hover:text-cyan-300 transition-colors select-none">
    <RotateCw className={`w-2.5 h-2.5 transition-transform duration-300 ${flipped ? '-rotate-90' : 'group-hover:rotate-45'}`} />
    <span>{label}</span>
  </span>
);

/**
 * Top hairline scroll-progress indicator mounted cleanly below TopBar.
 */
export const ScrollProgressBar: React.FC<{ watchKey?: string }> = ({ watchKey }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let rafId = 0;
    const compute = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight);
      const ratio = maxScroll > 24 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
      setProgress(ratio);
    };

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [watchKey]);

  return (
    <div
      aria-hidden="true"
      className="sticky top-14 z-20 h-[2px] w-full bg-transparent pointer-events-none overflow-hidden"
    >
      <div
        className="h-full w-full origin-left bg-gradient-to-r from-[#0284C7] via-[#2563EB] to-[#0D9488] dark:from-cyan-400 dark:via-blue-400 dark:to-violet-400 transition-opacity duration-200"
        style={{
          transform: `scaleX(${progress})`,
          opacity: progress > 0.01 ? 1 : 0,
        }}
      />
    </div>
  );
};

/**
 * Animated sliding pill tabs powered by motion layoutId.
 */
export interface SlidingTabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function SlidingTabs<T extends string>({
  items,
  activeId,
  onChange,
  layoutId,
  className = '',
}: {
  items: ReadonlyArray<SlidingTabItem<T>>;
  activeId: T;
  onChange: (id: T) => void;
  layoutId: string;
  className?: string;
}) {
  return (
    <LayoutGroup id={layoutId}>
      <div
        className={`flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0b1222] border border-slate-200 dark:border-slate-800 ${className}`}
      >
        {items.map((item) => {
          const active = item.id === activeId;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              aria-pressed={active}
              className={`relative px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap tactile-btn flex items-center gap-1.5 ${
                active
                  ? 'text-[#0284C7] dark:text-cyan-200'
                  : 'text-[#475569] hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 rounded-md bg-white dark:bg-cyan-500/20 border border-slate-200 dark:border-cyan-500/40 shadow-sm"
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{item.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/**
 * Clickable Recharts Legend Toggle Strip so users can show/hide individual series smoothly.
 */
export interface ChartSeriesToggleItem {
  key: string;
  label: string;
  color: string;
}

export const InteractiveChartLegend: React.FC<{
  series: ChartSeriesToggleItem[];
  hiddenKeys: Record<string, boolean>;
  onToggle: (key: string) => void;
}> = ({ series, hiddenKeys, onToggle }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    {series.map((s) => {
      const hidden = Boolean(hiddenKeys[s.key]);
      return (
        <button
          key={s.key}
          type="button"
          onClick={() => onToggle(s.key)}
          aria-pressed={!hidden}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium cursor-pointer tactile-btn ${
            hidden
              ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 line-through'
              : 'bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-xs hover:border-sky-300 dark:hover:border-cyan-500/40'
          }`}
        >
          <span
            className="w-2.5 h-2.5 rounded-sm shrink-0 transition-opacity"
            style={{ backgroundColor: s.color, opacity: hidden ? 0.3 : 1 }}
          />
          <span>{s.label}</span>
        </button>
      );
    })}
  </div>
);

/**
 * SVG pulsing beacon dot for the anchor / latest live observation point on Recharts time-series curves.
 */
export const LiveBeaconDot = (props: {
  cx?: number;
  cy?: number;
  index?: number;
  targetIndex?: number;
  color?: string;
}) => {
  const { cx, cy, index, targetIndex = 0, color = '#0284C7' } = props;
  if (cx === undefined || cy === undefined || index !== targetIndex) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={color} fillOpacity={0.25} className="radar-ring" />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />
    </g>
  );
};

/**
 * Smooth animated Accordion Drawer for dense analysis sections.
 */
export const AccordionDrawer: React.FC<{
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, badge, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  const prefersReduced = useReducedMotion();

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-900/45 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
      >
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 truncate">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          <ChevronDown
            className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={prefersReduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
