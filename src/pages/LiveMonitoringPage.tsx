import React from 'react';
import {
  Activity,
  AlertTriangle,
  Cloud,
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Gauge,
  RefreshCw,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CITIES } from '../data/cities.ts';
import type { ApiChannelStatus, CityId, CityTelemetryResponse, UnitsSystem } from '../types/flood.ts';
import {
  formatRain,
  formatTemperature,
  formatTimestampIST,
  formatWind,
  getChartTheme,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  LiveBeaconDot,
  ScrollReveal,
  SlidingTabs,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface LiveMonitoringPageProps {
  selectedCity: CityId;
  onSelectCity: (c: CityId) => void;
  telemetry: CityTelemetryResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

const ChannelStatusCard: React.FC<{ title: string; channel?: ApiChannelStatus }> = ({
  title,
  channel,
}) => {
  const status = channel?.status ?? 'unavailable';
  const tone =
    status === 'ok'
      ? 'text-[#047857] bg-[#ECFDF5] border-[#A7F3D0] dark:text-emerald-400 dark:border-emerald-500/30 dark:bg-emerald-500/10'
      : status === 'degraded'
      ? 'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A] dark:text-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10'
      : 'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA] dark:text-red-400 dark:border-red-500/30 dark:bg-red-500/10';

  const label =
    status === 'ok'
      ? 'CONNECTED'
      : status === 'degraded'
      ? 'FALLBACK'
      : status === 'quota_exceeded'
      ? 'QUOTA LIMIT'
      : 'UNAVAILABLE';

  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[#0F172A] dark:text-slate-300">{title}</span>
        <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${tone}`}>
          {label}
        </span>
      </div>
      <p className="text-[11px] text-[#475569] dark:text-slate-400 truncate">{channel?.provider ?? 'Not initialized'}</p>
      {channel?.message && (
        <p className="text-[11px] text-[#B45309] dark:text-amber-300/90 line-clamp-2">{channel.message}</p>
      )}
    </div>
  );
};

export const LiveMonitoringPage: React.FC<LiveMonitoringPageProps> = ({
  selectedCity,
  onSelectCity,
  telemetry,
  loading,
  error,
  onRefresh,
  units,
  theme,
}) => {
  const chart = getChartTheme(theme);
  const rainHr = formatRain(telemetry?.current.rainfallMmHr, units, true);
  const acc24 = formatRain(telemetry?.current.accumulated24hMm, units, false);

  const observations = [
    {
      label: 'Current Rainfall Intensity',
      value: rainHr.value === 'Unavailable' ? 'Unavailable' : `${rainHr.value} ${rainHr.unit}`,
      icon: CloudRain,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: '24h Accumulated Rain',
      value: acc24.value === 'Unavailable' ? 'Unavailable' : `${acc24.value} ${acc24.unit}`,
      icon: Droplets,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: 'Air Temperature',
      value: formatTemperature(telemetry?.current.temperatureC, units),
      sub:
        telemetry?.current.feelsLikeC !== null && telemetry?.current.feelsLikeC !== undefined
          ? `Feels like ${formatTemperature(telemetry.current.feelsLikeC, units)}`
          : undefined,
      icon: Thermometer,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: 'Relative Humidity',
      value:
        telemetry?.current.humidityPct !== null && telemetry?.current.humidityPct !== undefined
          ? `${telemetry.current.humidityPct}%`
          : 'Unavailable',
      icon: Droplets,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: 'Wind Speed & Bearing',
      value: formatWind(telemetry?.current.windKmh, units),
      sub: telemetry?.current.windCardinal ? `Direction: ${telemetry.current.windCardinal}` : undefined,
      icon: Wind,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: 'Atmospheric Pressure',
      value:
        telemetry?.current.pressureMb !== null && telemetry?.current.pressureMb !== undefined
          ? `${telemetry.current.pressureMb.toFixed(1)} hPa`
          : 'Unavailable',
      icon: Gauge,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: 'Sky / Weather Condition',
      value: telemetry?.current.conditionText ?? 'Unavailable',
      sub:
        telemetry?.current.cloudCoverPct !== null && telemetry?.current.cloudCoverPct !== undefined
          ? `Cloud cover ${telemetry.current.cloudCoverPct}%`
          : undefined,
      icon: Cloud,
      source: telemetry?.sources.weather.provider,
    },
    {
      label: 'Visibility & Elevation',
      value:
        telemetry?.current.visibilityKm !== null && telemetry?.current.visibilityKm !== undefined
          ? `${telemetry.current.visibilityKm} km`
          : 'Visibility Unavailable',
      sub:
        telemetry?.current.elevationM !== null && telemetry?.current.elevationM !== undefined
          ? `Terrain ${Math.round(telemetry.current.elevationM)} m ASL`
          : 'Elevation Unavailable',
      icon: Eye,
      source: telemetry?.sources.elevation.provider,
    },
  ];

  const hourlyData = (telemetry?.hourlyForecast ?? []).map((h) => ({
    hour: h.hourLabel,
    rainMm: h.rainMm ?? 0,
    tempC: h.tempC,
    humidity: h.humidityPct,
  }));

  return (
    <div className="space-y-6">
      {/* Header & City Switcher */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              Live Meteorological &amp; Hydrological Monitoring
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-1">
              Real-time observations and short-term feed status. Unavailable sensor fields are reported explicitly.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SlidingTabs
              layoutId="live-city-tabs"
              activeId={selectedCity}
              onChange={onSelectCity}
              items={CITIES.map((c) => ({ id: c.id, label: c.name }))}
            />
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7] dark:hover:border-cyan-500/40 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0284C7] dark:text-cyan-400' : ''}`} />
              <span>Sync Now</span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      {error && (
        <div className="rounded-xl bg-[#FEF2F2] dark:bg-red-950/30 border border-[#FECACA] dark:border-red-500/40 p-4 text-xs text-[#B91C1C] dark:text-red-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#DC2626] dark:text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* API Connection Indicators */}
      <section className="rounded-2xl glass-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-200 flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
            Upstream Data Channel Diagnostics
          </h2>
          <span className="text-xs font-mono text-[#64748B] dark:text-slate-400 tabular-nums">
            Last Sync: {formatTimestampIST(telemetry?.fetchedAt)} {telemetry?.cached ? '(Cached)' : '(Fresh)'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <ChannelStatusCard title="Weather Telemetry" channel={telemetry?.sources.weather} />
          <ChannelStatusCard title="Soil Hydrology" channel={telemetry?.sources.soilMoisture} />
          <ChannelStatusCard title="Terrain Elevation" channel={telemetry?.sources.elevation} />
          <ChannelStatusCard title="Public Weather Alerts" channel={telemetry?.sources.alerts} />
        </div>
      </section>

      {/* Current Observations Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {observations.map((obs, idx) => {
          const Icon = obs.icon;
          const isUnavail = obs.value.includes('Unavailable');
          return (
            <ScrollReveal key={obs.label} delayMs={Math.min(idx * 45, 240)}>
              <SpotlightCard className="h-full rounded-2xl glass-panel p-4 flex flex-col justify-between gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#475569] dark:text-slate-400">{obs.label}</span>
                  <Icon className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                </div>
                <div>
                  <div
                    className={`text-xl font-mono font-bold tabular-nums ${
                      isUnavail ? 'text-slate-400 dark:text-slate-500 text-base' : 'text-[#0F172A] dark:text-slate-100'
                    }`}
                  >
                    {loading && !telemetry ? '...' : obs.value}
                  </div>
                  {obs.sub && <div className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">{obs.sub}</div>}
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-[#64748B] dark:text-slate-500 truncate">
                  {obs.source ?? 'Awaiting feed'}
                </div>
              </SpotlightCard>
            </ScrollReveal>
          );
        })}
      </section>

      {/* Rainfall Intensity Graph */}
      <section className="rounded-2xl glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
              Hourly Rainfall Intensity Curve (Next 24h)
            </h2>
            <p className="text-xs text-[#475569] dark:text-slate-400">
              Expected hourly precipitation (mm) for {telemetry?.city.name ?? selectedCity}
            </p>
          </div>
          <span className="text-xs font-mono text-[#64748B] dark:text-slate-400">
            Design Cap: {telemetry?.city.drainageDesignMmHr ?? '—'} mm/hr
          </span>
        </div>

        <div className="h-64 w-full">
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="liveRain" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis dataKey="hour" stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} interval={2} />
                <YAxis stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} unit="mm" />
                <Tooltip
                  contentStyle={chart.tooltipStyle}
                  cursor={{ stroke: chart.axisStroke, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey="rainMm"
                  name="Rainfall (mm)"
                  stroke={chart.colors.royal}
                  strokeWidth={2}
                  fill="url(#liveRain)"
                  dot={(dotProps) => (
                    <LiveBeaconDot
                      key={`live-rain-dot-${dotProps.index}`}
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      index={dotProps.index}
                      targetIndex={0}
                      color={chart.colors.royal}
                    />
                  )}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Hourly rainfall data unavailable.
            </div>
          )}
        </div>
      </section>

      {/* Hourly Weather Timeline Table */}
      <section className="rounded-2xl glass-panel p-5">
        <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 mb-3">
          Hourly Meteorological Timeline
        </h2>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-white dark:bg-[#0b1222]">
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                <th className="py-2 pr-3">Time (IST)</th>
                <th className="py-2 px-3">Condition</th>
                <th className="py-2 px-3 text-right">Rain</th>
                <th className="py-2 px-3 text-right">Prob.</th>
                <th className="py-2 px-3 text-right">Temp</th>
                <th className="py-2 px-3 text-right">Humidity</th>
                <th className="py-2 px-3 text-right">Wind</th>
                <th className="py-2 pl-3 text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {!telemetry?.hourlyForecast.length ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Hourly timeline unavailable.
                  </td>
                </tr>
              ) : (
                telemetry.hourlyForecast.map((h) => {
                  const r = formatRain(h.rainMm, units, false);
                  return (
                    <tr key={h.timeIso} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 pr-3 font-mono tabular-nums text-[#0F172A] dark:text-slate-200 whitespace-nowrap">
                        {h.hourLabel}
                      </td>
                      <td className="py-2 px-3 text-[#475569] dark:text-slate-300 whitespace-nowrap">
                        {h.conditionText ?? 'Unavailable'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0284C7] dark:text-cyan-300 whitespace-nowrap font-medium">
                        {r.value === 'Unavailable' ? 'Unavailable' : `${r.value} ${r.unit}`}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300">
                        {h.rainProbPct !== null ? `${h.rainProbPct}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0F172A] dark:text-slate-200 whitespace-nowrap">
                        {formatTemperature(h.tempC, units)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300">
                        {h.humidityPct !== null ? `${h.humidityPct}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300 whitespace-nowrap">
                        {formatWind(h.windKmh, units)}
                      </td>
                      <td className="py-2 pl-3 text-right text-[11px] text-[#64748B] dark:text-slate-500 whitespace-nowrap">
                        {h.source}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
