import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import type {
  AiRiskAssessmentPayload,
  AiWeatherSummaryPayload,
  CityComparisonSummary,
  CityId,
  CityTelemetryResponse,
  NavPageId,
  UnitsSystem,
} from '../types/flood.ts';
import {
  formatRain,
  formatTemperature,
  formatTimestampIST,
  formatWind,
  RISK_STYLES,
  RiskStatusIndicator,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  AnimatedNumber,
  ScrollReveal,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';
import {
  WeatherAtmosphericBackdrop,
  WeatherConditionIcon,
} from '../components/WeatherVisuals.tsx';

interface OverviewPageProps {
  telemetry: CityTelemetryResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  comparison: CityComparisonSummary[];
  comparisonError: string | null;
  aiAssessment: AiRiskAssessmentPayload | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAi: (force?: boolean) => void;
  weatherSummary: AiWeatherSummaryPayload | null;
  weatherSummaryLoading: boolean;
  weatherSummaryError: string | null;
  onRefreshWeatherSummary: (force?: boolean) => void;
  onSelectCity: (city: CityId) => void;
  onNavigate: (page: NavPageId) => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

function formatTempValue(c: number | null | undefined, units: UnitsSystem): string {
  if (c === null || c === undefined || Number.isNaN(c)) return '—';
  const val = units === 'IMPERIAL' ? (c * 9) / 5 + 32 : c;
  return `${Math.round(val)}°`;
}

function uvCategoryLabel(uv: number | null | undefined): string {
  if (uv === null || uv === undefined) return 'Unavailable';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  telemetry,
  loading,
  error,
  onRetry,
  comparison,
  aiAssessment,
  weatherSummary,
  weatherSummaryLoading,
  weatherSummaryError,
  onRefreshWeatherSummary,
  onSelectCity,
  onNavigate,
  units,
}) => {
  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(0);
  const [expandedDayIdx, setExpandedDayIdx] = useState<number | null>(0);

  const cur = telemetry?.current;
  const hourly = telemetry?.hourlyForecast ?? [];
  const daily = telemetry?.dailyForecast ?? [];
  const selectedHour = hourly[selectedHourIdx] ?? hourly[0] ?? null;

  const dailyTempBounds = useMemo(() => {
    const mins = daily.map((d) => d.tempMinC).filter((v): v is number => typeof v === 'number');
    const maxs = daily.map((d) => d.tempMaxC).filter((v): v is number => typeof v === 'number');
    const min = mins.length ? Math.min(...mins) : 15;
    const max = maxs.length ? Math.max(...maxs) : 40;
    return { min, max: Math.max(max, min + 1) };
  }, [daily]);

  if (loading && !telemetry) {
    return (
      <div className="space-y-5">
        <div className="h-72 rounded-3xl bg-slate-200 dark:bg-slate-900/80 animate-pulse" />
        <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-900/70 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 h-80 rounded-2xl bg-slate-200 dark:bg-slate-900/70 animate-pulse" />
          <div className="lg:col-span-7 h-80 rounded-2xl bg-slate-200 dark:bg-slate-900/70 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!telemetry && error) {
    return (
      <div className="glass-panel rounded-2xl p-8 text-center space-y-3 max-w-lg mx-auto my-8">
        <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
        <h2 className="text-lg font-display font-semibold text-slate-900 dark:text-slate-100">
          Unable to Load City Weather Telemetry
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Telemetry Sync</span>
        </button>
      </div>
    );
  }

  if (!telemetry || !cur) return null;

  const rainRate = formatRain(cur.rainfallMmHr, units, true);
  const rain24 = formatRain(cur.accumulated24hMm, units, false);
  const riskStyle = RISK_STYLES[telemetry.risk.category];

  return (
    <div className="space-y-6">
      {/* 1. ATMOSPHERIC WEATHER HERO */}
      <ScrollReveal delayMs={0}>
        <section className="relative rounded-3xl overflow-hidden border border-slate-300/60 dark:border-cyan-400/25 shadow-xl min-h-[290px] sm:min-h-[320px] flex flex-col justify-between bg-[#061128] text-white">
          <WeatherAtmosphericBackdrop
            conditionType={cur.conditionType}
            conditionText={cur.conditionText}
          />

          <div className="relative z-10 p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: City + Huge Live Temp + Condition */}
            <div className="space-y-3 max-w-xl">
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-cyan-200/90">
                <span className="inline-flex items-center gap-1.5 font-semibold tracking-wide uppercase">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Live Atmospheric Feed
                </span>
                <span aria-hidden="true" className="text-white/30">·</span>
                <span className="text-slate-200/85">{telemetry.sources.weather.provider}</span>
                <span aria-hidden="true" className="text-white/30">·</span>
                <span className="font-mono text-slate-300/80">{formatTimestampIST(telemetry.fetchedAt)}</span>
              </div>

              <div>
                <h1 className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-white">
                  {telemetry.city.name}
                  <span className="text-lg sm:text-2xl font-normal text-slate-300/90 ml-2">
                    {telemetry.city.state}
                  </span>
                </h1>
                <p className="text-xs text-slate-300/80 mt-1 line-clamp-1">
                  {telemetry.city.terrainSummary}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <div className="flex items-center gap-3.5">
                  <WeatherConditionIcon
                    conditionType={cur.conditionType}
                    conditionText={cur.conditionText}
                    isDaytime={cur.isDaytime}
                    className="w-12 h-12 sm:w-14 sm:h-14 drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]"
                  />
                  <div className="font-display font-extrabold text-5xl sm:text-6xl tracking-tight tabular-nums text-white">
                    {cur.temperatureC !== null ? (
                      <>
                        <AnimatedNumber
                          value={units === 'IMPERIAL' ? (cur.temperatureC * 9) / 5 + 32 : cur.temperatureC}
                          decimals={0}
                        />
                        <span className="text-2xl sm:text-3xl font-semibold text-cyan-300 align-top ml-0.5">
                          {units === 'IMPERIAL' ? '°F' : '°C'}
                        </span>
                      </>
                    ) : (
                      'Unavailable'
                    )}
                  </div>
                </div>

                <div className="space-y-1 text-xs sm:text-sm text-slate-200 border-l border-white/15 pl-4">
                  <p className="font-semibold text-white text-sm sm:text-base">
                    {cur.conditionText ?? 'Clear / Observed'}
                  </p>
                  <p className="font-mono text-slate-300 tabular-nums">
                    H: {formatTempValue(cur.tempMaxC, units)} · L: {formatTempValue(cur.tempMinC, units)} · Feels{' '}
                    {formatTempValue(cur.feelsLikeC, units)}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Flood-Risk Pulse & Quick Actions Glass Card */}
            <div className="lg:w-[340px] shrink-0 rounded-2xl bg-[#040a18]/72 backdrop-blur-xl border border-cyan-400/25 p-4 sm:p-5 space-y-3.5 shadow-2xl">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/90 font-semibold">
                    Urban Flood-Risk Pulse
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className={`font-mono text-3xl font-bold tabular-nums ${riskStyle.text}`}>
                      <AnimatedNumber value={telemetry.risk.currentScore} />
                    </span>
                    <span className="text-xs font-mono text-slate-400">/ 100 index</span>
                  </div>
                </div>
                <RiskStatusIndicator level={telemetry.risk.category} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-white/10">
                <div className="rounded-xl bg-white/5 px-2.5 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Rain Intensity</span>
                  <span className="font-mono font-semibold text-white tabular-nums">
                    {rainRate.value} {rainRate.unit}
                  </span>
                </div>
                <div className="rounded-xl bg-white/5 px-2.5 py-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Drainage Headroom</span>
                  <span className="font-mono font-semibold text-cyan-300 tabular-nums">
                    {cur.drainageCapacityPct !== null ? `${cur.drainageCapacityPct}%` : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => onNavigate('predictions')}
                  className="tactile-btn flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs py-2 px-3 cursor-pointer shadow-lg shadow-cyan-500/20"
                >
                  <span>Flood Forecast</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('map')}
                  className="tactile-btn inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs py-2 px-3 cursor-pointer"
                >
                  <span>Radar</span>
                </button>
              </div>
            </div>
          </div>

          {/* Hero Bottom Quick Telemetry Bar */}
          <div className="relative z-10 px-5 sm:px-7 py-3 bg-[#030712]/65 backdrop-blur-md border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <span className="inline-flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5 text-cyan-400" />
                Humidity <strong className="font-mono text-white">{cur.humidityPct ?? '—'}%</strong>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wind className="w-3.5 h-3.5 text-sky-400" />
                Wind <strong className="font-mono text-white">{formatWind(cur.windKmh, units)}</strong>
                {cur.windCardinal ? <span className="text-slate-400">{cur.windCardinal}</span> : null}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CloudRain className="w-3.5 h-3.5 text-blue-400" />
                24h Rain <strong className="font-mono text-white">{rain24.value} {rain24.unit}</strong>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('weather')}
                className="text-cyan-300 hover:text-cyan-200 underline underline-offset-4 cursor-pointer"
              >
                Atmospheric Deep-Dive
              </button>
              <span aria-hidden="true" className="text-white/25">·</span>
              <button
                type="button"
                onClick={() => onNavigate('live')}
                className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Diagnostics</span>
              </button>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* 2. INTERACTIVE 24-HOUR HOURLY FORECAST STRIP */}
      <ScrollReveal delayMs={40}>
        <SpotlightCard
          tactile={false}
          className="glass-panel rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-display font-semibold text-slate-900 dark:text-slate-100">
                24-Hour Interactive Hourly Timeline
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any hour slot to inspect detailed temperature, precipitation probability, wind, and pressure.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 dark:text-cyan-300/80">
              {hourly.length} forecast intervals · IST
            </span>
          </div>

          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2 snap-x">
            {hourly.map((h, idx) => {
              const selected = idx === selectedHourIdx;
              const rainObj = formatRain(h.rainMm, units, false);
              return (
                <button
                  key={`${h.timeIso}-${idx}`}
                  type="button"
                  onClick={() => setSelectedHourIdx(idx)}
                  aria-pressed={selected}
                  className={`tactile-btn snap-start shrink-0 w-[86px] rounded-2xl p-3 flex flex-col items-center justify-between gap-2 border cursor-pointer transition-all ${
                    selected
                      ? 'bg-[#E0F2FE] dark:bg-cyan-500/20 border-sky-400 dark:border-cyan-400/60 shadow-md dark:shadow-cyan-500/10'
                      : 'bg-slate-50/90 dark:bg-slate-900/55 border-slate-200 dark:border-slate-800/80 hover:border-sky-300 dark:hover:border-cyan-500/35'
                  }`}
                >
                  <span className={`text-[11px] font-mono font-semibold ${selected ? 'text-[#0284C7] dark:text-cyan-200' : 'text-slate-600 dark:text-slate-400'}`}>
                    {idx === 0 ? 'Now' : h.hourLabel}
                  </span>
                  <WeatherConditionIcon conditionText={h.conditionText} className="w-6 h-6" />
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatTempValue(h.tempC, units)}
                  </span>
                  <span className="text-[10px] font-mono text-[#0284C7] dark:text-cyan-300 tabular-nums">
                    {h.rainProbPct !== null ? `${Math.round(h.rainProbPct)}%` : '—'} · {rainObj.value}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedHour && (
            <div className="rounded-xl bg-slate-50 dark:bg-[#070f23]/90 border border-slate-200 dark:border-cyan-500/20 p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <WeatherConditionIcon conditionText={selectedHour.conditionText} className="w-7 h-7" />
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedHourIdx === 0 ? 'Current Forecast Window' : `Forecast for ${selectedHour.hourLabel} IST`}
                    {' · '}
                    <span className="text-[#0284C7] dark:text-cyan-300">
                      {selectedHour.conditionText ?? 'Observed / Modelled'}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Source: {selectedHour.source} ({selectedHour.dataKind})
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono tabular-nums text-slate-700 dark:text-slate-200">
                <span>Temp: <strong>{formatTemperature(selectedHour.tempC, units)}</strong></span>
                <span>
                  Rain:{' '}
                  <strong>
                    {formatRain(selectedHour.rainMm, units, false).value}{' '}
                    {formatRain(selectedHour.rainMm, units, false).unit}
                  </strong>{' '}
                  ({selectedHour.rainProbPct ?? '—'}%)
                </span>
                <span>Humidity: <strong>{selectedHour.humidityPct ?? '—'}%</strong></span>
                <span>Wind: <strong>{formatWind(selectedHour.windKmh, units)}</strong></span>
                <span>Pressure: <strong>{selectedHour.pressureMb ? `${Math.round(selectedHour.pressureMb)} hPa` : '—'}</strong></span>
              </div>
            </div>
          )}
        </SpotlightCard>
      </ScrollReveal>

      {/* 3. 7-DAY FORECAST + CURRENT CONDITIONS GRID + AI WEATHER SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 7-Day Forecast */}
        <ScrollReveal delayMs={70} className="lg:col-span-5">
          <SpotlightCard tactile={false} className="glass-panel rounded-2xl p-4 sm:p-5 h-full space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-display font-semibold text-slate-900 dark:text-slate-100">
                  7-Day Outlook
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap a day to inspect rain totals and max wind.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('weather')}
                className="text-xs font-medium text-[#0284C7] dark:text-cyan-300 hover:underline cursor-pointer"
              >
                Full Charts
              </button>
            </div>

            <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
              {daily.map((d, idx) => {
                const isOpen = expandedDayIdx === idx;
                const minVal = d.tempMinC ?? dailyTempBounds.min;
                const maxVal = d.tempMaxC ?? dailyTempBounds.max;
                const span = dailyTempBounds.max - dailyTempBounds.min;
                const leftPct = Math.max(0, Math.min(85, ((minVal - dailyTempBounds.min) / span) * 100));
                const widthPct = Math.max(12, Math.min(100 - leftPct, ((maxVal - minVal) / span) * 100));
                const dayRain = formatRain(d.rainSumMm, units, false);

                return (
                  <div key={d.dateIso} className="py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedDayIdx(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
                    >
                      <div className="w-24 shrink-0">
                        <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 block">
                          {idx === 0 ? 'Today' : d.dayLabel.split(',')[0]}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {d.dayLabel.split(',')[1]?.trim() ?? d.dateIso}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 min-w-[70px]">
                        <WeatherConditionIcon conditionText={d.conditionText} className="w-5 h-5 shrink-0" />
                        <span className="text-[11px] font-mono text-[#0284C7] dark:text-cyan-300 tabular-nums">
                          {d.rainProbPct !== null ? `${Math.round(d.rainProbPct)}%` : '—'}
                        </span>
                      </div>

                      <div className="flex-1 flex items-center gap-2 min-w-[100px]">
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 w-7 text-right tabular-nums">
                          {formatTempValue(d.tempMinC, units)}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
                          <div
                            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-amber-400"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-semibold text-slate-900 dark:text-white w-7 tabular-nums">
                          {formatTempValue(d.tempMaxC, units)}
                        </span>
                      </div>

                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="mt-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span>{d.conditionText ?? 'Forecast'}</span>
                        <div className="flex items-center gap-4 font-mono tabular-nums">
                          <span>Total Rain: <strong>{dayRain.value} {dayRain.unit}</strong></span>
                          <span>Max Wind: <strong>{formatWind(d.windMaxKmh, units)}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </SpotlightCard>
        </ScrollReveal>

        {/* Right: Current Conditions Grid + Gemini AI Weather Summary */}
        <ScrollReveal delayMs={100} className="lg:col-span-7 flex flex-col gap-5">
          {/* 6-tile Current Conditions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            <SpotlightCard className="glass-panel rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Rainfall Rate</span>
                <CloudRain className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {rainRate.value} <span className="text-xs font-normal text-slate-500">{rainRate.unit}</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                24h: {rain24.value} {rain24.unit}
              </p>
            </SpotlightCard>

            <SpotlightCard className="glass-panel rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Humidity &amp; Dew</span>
                <Droplets className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              </div>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {cur.humidityPct ?? '—'}%
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Dew pt: {cur.dewPointC !== null ? formatTemperature(cur.dewPointC, units) : 'Unavailable'}
              </p>
            </SpotlightCard>

            <SpotlightCard className="glass-panel rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Wind &amp; Gusts</span>
                <Compass className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              </div>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {formatWind(cur.windKmh, units)}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {cur.windCardinal ?? '—'} · Gust {cur.windGustKmh !== null ? formatWind(cur.windGustKmh, units) : '—'}
              </p>
            </SpotlightCard>

            <SpotlightCard className="glass-panel rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Air Pressure</span>
                <Gauge className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {cur.pressureMb !== null ? `${Math.round(cur.pressureMb)} hPa` : 'Unavailable'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Mean sea-level pressure
              </p>
            </SpotlightCard>

            <SpotlightCard className="glass-panel rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Visibility</span>
                <Eye className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              </div>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {cur.visibilityKm !== null ? `${cur.visibilityKm.toFixed(1)} km` : 'Unavailable'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Cloud cover: {cur.cloudCoverPct ?? '—'}%
              </p>
            </SpotlightCard>

            <SpotlightCard className="glass-panel rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>UV Index</span>
                <Sun className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              </div>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                {cur.uvIndex !== null && cur.uvIndex !== undefined ? cur.uvIndex.toFixed(1) : 'Unavailable'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Exposure: {uvCategoryLabel(cur.uvIndex)}
              </p>
            </SpotlightCard>
          </div>

          {/* Gemini AI Weather Intelligence Briefing */}
          <SpotlightCard
            tactile={false}
            className="glass-panel-elevated rounded-2xl p-5 flex-1 flex flex-col justify-between space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-400/30 flex items-center justify-center">
                  <Sparkles className="w-4.5 h-4.5 text-[#0284C7] dark:text-cyan-300" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-display font-semibold text-slate-900 dark:text-white">
                    AI Weather Intelligence Brief
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Grounded exclusively in live {telemetry.city.name} telemetry · Distinct from official IMD warnings
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRefreshWeatherSummary(true)}
                disabled={weatherSummaryLoading}
                className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-cyan-500/30 bg-slate-50 dark:bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-cyan-200 hover:border-cyan-400/60 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${weatherSummaryLoading ? 'animate-spin' : ''}`} />
                <span>{weatherSummaryLoading ? 'Synthesizing...' : 'Refresh Brief'}</span>
              </button>
            </div>

            {weatherSummaryError && !weatherSummary && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 p-3 text-xs text-amber-800 dark:text-amber-200">
                {weatherSummaryError}
              </div>
            )}

            {weatherSummary ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#0284C7] dark:text-cyan-300">
                  {weatherSummary.headline}
                </p>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {weatherSummary.summary}
                </p>
                {weatherSummary.highlights.length > 0 && (
                  <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {weatherSummary.highlights.map((item, idx) => (
                      <li
                        key={idx}
                        className="rounded-xl bg-slate-50 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/80 dark:border-slate-800/80 pt-2">
                  {weatherSummary.advisoryNote}
                </p>
              </div>
            ) : aiAssessment ? (
              <div className="space-y-2.5">
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                  {aiAssessment.plainLanguageSummary}
                </p>
                <button
                  type="button"
                  onClick={() => onRefreshWeatherSummary(true)}
                  className="text-xs font-medium text-[#0284C7] dark:text-cyan-300 hover:underline cursor-pointer"
                >
                  Generate sky &amp; commute weather brief →
                </button>
              </div>
            ) : (
              <div className="py-4 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-[#0284C7] dark:text-cyan-400 animate-pulse" />
                <span>Preparing live meteorological summary for {telemetry.city.name}...</span>
              </div>
            )}
          </SpotlightCard>
        </ScrollReveal>
      </div>

      {/* 4. ALL-INDIA CITY PULSE STRIP (9 CITIES) */}
      {comparison.length > 0 && (
        <ScrollReveal delayMs={130}>
          <section className="glass-panel rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-display font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                  India Urban Weather &amp; Flood Pulse ({comparison.length} Cities)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tap any city to switch active telemetry across Home, Radar, and AI Predictions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('comparison')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0284C7] dark:text-cyan-300 hover:underline cursor-pointer"
              >
                <span>Open City Explorer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {comparison.map((city) => {
                const isActive = city.cityId === telemetry.city.id;
                return (
                  <button
                    key={city.cityId}
                    type="button"
                    onClick={() => onSelectCity(city.cityId)}
                    className={`tactile-btn text-left rounded-2xl p-3.5 border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-[#E0F2FE]/80 dark:bg-cyan-500/15 border-sky-400 dark:border-cyan-400/50 shadow-sm'
                        : 'bg-slate-50/80 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 hover:border-sky-300 dark:hover:border-cyan-500/35'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {city.cityName}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {city.state}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                        {city.conditionText ?? 'Monitored'} · Risk {city.floodRiskIndex ?? '—'}/100
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatTempValue(city.temperatureC, units)}
                      </span>
                      <RiskStatusIndicator level={city.riskCategory} showText={false} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </ScrollReveal>
      )}
    </div>
  );
};
