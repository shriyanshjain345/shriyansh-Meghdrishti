import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  MapPin,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Sun,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { CITIES, CITY_MAP } from '../data/cities.ts';
import type { CityId, CityTelemetryResponse, NavPageId, UnitsSystem } from '../types/flood.ts';
import { formatTimestampIST, RiskStatusIndicator, type ThemeMode } from './RiskBadge.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { SlidingTabs } from './MotionPrimitives.tsx';
import { BrandLogo } from './BrandLogo.tsx';

interface TopBarProps {
  selectedCity: CityId;
  onSelectCity: (city: CityId) => void;
  telemetry: CityTelemetryResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenMobileMenu: () => void;
  units: UnitsSystem;
  onChangeUnits: (u: UnitsSystem) => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: (v: boolean) => void;
  onNavigate: (page: NavPageId) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  selectedCity,
  onSelectCity,
  telemetry,
  loading,
  error,
  onRefresh,
  onOpenMobileMenu,
  units,
  onChangeUnits,
  autoRefresh,
  onToggleAutoRefresh,
  onNavigate,
  theme,
  onToggleTheme,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [nowClock, setNowClock] = useState<string>(() =>
    new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    })
  );
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setNowClock(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        })
      );
    }, 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setCityPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return CITIES;
    return CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
  }, [cityQuery]);

  const activeCity = CITY_MAP[selectedCity];
  const weatherStatus = telemetry?.sources.weather.status;
  const alerts = telemetry?.alerts ?? [];
  const highRiskAlert =
    telemetry && (telemetry.risk.category === 'HIGH' || telemetry.risk.category === 'SEVERE');
  const notificationCount = alerts.length + (highRiskAlert ? 1 : 0);

  const connectionLabel = loading
    ? 'Syncing'
    : error || weatherStatus === 'unavailable'
    ? 'Feed Unavailable'
    : weatherStatus === 'quota_exceeded'
    ? 'Fallback Feed'
    : weatherStatus === 'degraded'
    ? 'Open-Meteo Feed'
    : 'Live Feed';

  const connectionColor = loading
    ? 'text-[#0284C7] dark:text-cyan-400'
    : error || weatherStatus === 'unavailable'
    ? 'text-[#B91C1C] dark:text-red-400'
    : weatherStatus === 'degraded' || weatherStatus === 'quota_exceeded'
    ? 'text-[#B45309] dark:text-amber-400'
    : 'text-[#047857] dark:text-emerald-400';

  return (
    <>
      <header className="sticky top-0 z-30 h-14 bg-white/95 dark:bg-[#050a17]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/80 px-3 sm:px-5 flex items-center justify-between gap-2.5">
        {/* Zone 1: Brand + Mobile Menu */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 min-w-[40px] min-h-[40px] cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('overview')}
            className="flex items-center text-left cursor-pointer whitespace-nowrap shrink-0 lg:hidden"
            aria-label="MEGHDRISHTI home"
          >
            <BrandLogo variant="compact" />
          </button>

          {/* Searchable City Selector */}
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setCityPickerOpen((v) => !v)}
              aria-expanded={cityPickerOpen}
              aria-label="Select Indian monitoring city"
              className="tactile-btn inline-flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-cyan-500/25 hover:border-sky-300 dark:hover:border-cyan-400/50 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400 shrink-0" />
              <span className="truncate max-w-[130px] sm:max-w-none">
                {activeCity.name}
                <span className="hidden sm:inline text-slate-500 dark:text-slate-400 font-normal">
                  , {activeCity.state}
                </span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {cityPickerOpen && (
              <div className="absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white dark:bg-[#091225] border border-slate-200 dark:border-cyan-500/25 shadow-2xl p-2.5 z-50">
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="Search 9 Indian cities..."
                    autoFocus
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0284C7] dark:focus:border-cyan-400"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredCities.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 px-2 py-3 text-center">
                      No matching monitored city.
                    </p>
                  ) : (
                    filteredCities.map((c) => {
                      const active = c.id === selectedCity;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onSelectCity(c.id);
                            setCityPickerOpen(false);
                            setCityQuery('');
                          }}
                          className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#E0F2FE] dark:bg-cyan-500/15 text-[#0284C7] dark:text-cyan-200 font-semibold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                          }`}
                        >
                          <span>{c.name}</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                            {c.state}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Zone 2: Live Connection Status + Local IST Time */}
        <div className="hidden md:flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1.5 font-medium ${connectionColor}`}>
            {error || weatherStatus === 'unavailable' ? (
              <WifiOff className="w-3.5 h-3.5" />
            ) : (
              <Wifi className="w-3.5 h-3.5" />
            )}
            <span>{connectionLabel}</span>
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {nowClock} IST
          </span>
          {telemetry && (
            <>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                Sync {formatTimestampIST(telemetry.fetchedAt)}
              </span>
            </>
          )}
        </div>

        {/* Zone 3: Actions (PWA Install, Theme Switch, Refresh, Notifications, Settings) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
          <PWAInstallButton compact />

          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'light' ? 'Switch to Midnight Dark' : 'Switch to Daylight Light'}
            aria-label={theme === 'light' ? 'Switch to Midnight Dark' : 'Switch to Daylight Light'}
            className="tactile-btn inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2 text-slate-700 dark:text-slate-300 hover:text-[#0284C7] dark:hover:text-cyan-300 hover:border-sky-300 dark:hover:border-cyan-500/40 min-w-[38px] min-h-[38px] cursor-pointer transition-colors"
          >
            {theme === 'light' ? (
              <Moon className="w-4 h-4" />
            ) : (
              <Sun className="w-4 h-4 text-amber-300" />
            )}
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh live telemetry"
            aria-label="Refresh live telemetry"
            className="tactile-btn inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2 text-slate-700 dark:text-slate-300 hover:text-[#0284C7] dark:hover:text-cyan-300 hover:border-sky-300 dark:hover:border-cyan-500/40 disabled:opacity-50 min-w-[38px] min-h-[38px] cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0284C7] dark:text-cyan-400' : ''}`} />
          </button>

          {/* Notifications Popover Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotifOpen((prev) => !prev);
                setSettingsOpen(false);
              }}
              aria-label="Active alerts and notifications"
              className="tactile-btn relative inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2 text-slate-700 dark:text-slate-300 hover:text-[#0284C7] dark:hover:text-cyan-300 hover:border-sky-300 dark:hover:border-cyan-500/40 min-w-[38px] min-h-[38px] cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-[10px] font-mono font-bold text-white flex items-center justify-center">
                  {notificationCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-[#091225] border border-slate-200 dark:border-cyan-500/25 shadow-2xl p-4 z-50">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Alerts &amp; Advisories ({telemetry?.city.name ?? activeCity.name})
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotifOpen(false)}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 space-y-2.5 max-h-72 overflow-y-auto">
                  {alerts.length === 0 && !highRiskAlert && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 py-2">
                      No active public weather alerts or elevated flood-risk advisories for {telemetry?.city.name ?? activeCity.name}.
                    </p>
                  )}
                  {highRiskAlert && telemetry && (
                    <div className="rounded-xl bg-[#FFF7ED] dark:bg-slate-900/90 border border-[#FED7AA] dark:border-orange-500/35 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#C2410C] dark:text-orange-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#EA580C] dark:text-orange-400" />
                          Elevated Flood-Risk Index
                        </span>
                        <RiskStatusIndicator level={telemetry.risk.category} />
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        Calculated index is {telemetry.risk.currentScore}/100. Review AI Predictions and Emergency Guide.
                      </p>
                    </div>
                  )}
                  {alerts.map((a) => (
                    <div key={a.alertId} className="rounded-xl bg-[#FEF2F2] dark:bg-red-950/35 border border-[#FECACA] dark:border-red-500/35 p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#B91C1C] dark:text-red-300">{a.title}</span>
                        <span className="text-[11px] font-mono text-[#DC2626] dark:text-red-400">{a.severity}</span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-3">{a.description}</p>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Source:{' '}
                        <a
                          href={a.dataSource.authorityUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-[#0284C7] dark:text-cyan-300 hover:text-[#0369A1] dark:hover:text-cyan-200"
                        >
                          {a.dataSource.name}
                        </a>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile / Preferences Button */}
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(true);
              setNotifOpen(false);
            }}
            title="Preferences & Settings"
            aria-label="Open preferences and settings"
            className="tactile-btn inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2 text-slate-700 dark:text-slate-300 hover:text-[#0284C7] dark:hover:text-cyan-300 hover:border-sky-300 dark:hover:border-cyan-500/40 min-w-[38px] min-h-[38px] cursor-pointer"
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Settings / Profile Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#091225] border border-slate-200 dark:border-cyan-500/25 shadow-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Workspace Preferences
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Close settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Appearance Theme
                </label>
                <SlidingTabs
                  layoutId="topbar-theme-tabs"
                  activeId={theme}
                  onChange={(nextTheme) => {
                    if (nextTheme !== theme) onToggleTheme();
                  }}
                  items={[
                    { id: 'dark', label: 'Midnight Navy', icon: Moon },
                    { id: 'light', label: 'Daylight Light', icon: Sun },
                  ]}
                  className="grid grid-cols-2"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Measurement Units
                </label>
                <SlidingTabs
                  layoutId="topbar-units-tabs"
                  activeId={units}
                  onChange={(nextUnits) => onChangeUnits(nextUnits)}
                  items={[
                    { id: 'METRIC', label: 'Metric (°C, mm, km/h)' },
                    { id: 'IMPERIAL', label: 'Imperial (°F, in, mph)' },
                  ]}
                  className="grid grid-cols-2"
                />
              </div>

              <div>
                <label htmlFor="settings-default-city" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Active Monitoring City
                </label>
                <select
                  id="settings-default-city"
                  value={selectedCity}
                  onChange={(e) => onSelectCity(e.target.value as CityId)}
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0284C7] dark:focus:border-cyan-400"
                >
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-slate-200 dark:border-slate-800/80">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Auto-Sync Telemetry</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Refresh active city feed every 15 minutes</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoRefresh}
                  onClick={() => onToggleAutoRefresh(!autoRefresh)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                    autoRefresh ? 'bg-[#0284C7] dark:bg-cyan-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoRefresh ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">Progressive Web App</span>
                <PWAInstallButton />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-xl bg-slate-900 dark:bg-cyan-600 hover:bg-slate-800 dark:hover:bg-cyan-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
