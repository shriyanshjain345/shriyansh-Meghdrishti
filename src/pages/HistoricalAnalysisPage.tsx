import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  GitCompare,
  History,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CITIES, CITY_MAP } from '../data/cities.ts';
import type { CityId, HistoricalDailyRecord, HistoricalFloodEvent } from '../types/flood.ts';
import { getChartTheme, RiskStatusIndicator, type ThemeMode } from '../components/RiskBadge.tsx';
import {
  AnimatedNumber,
  ScrollReveal,
  SlidingTabs,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface HistoricalApiResponse {
  cityId: CityId;
  cityName: string;
  startDate: string;
  endDate: string;
  source: string;
  meanDailyMm: number;
  totalPeriodMm: number;
  dailyRecords: HistoricalDailyRecord[];
  weeklyTrends: Array<{ weekLabel: string; totalMm: number; days: number }>;
  monthlyTrends: Array<{ monthLabel: string; totalMm: number; rainyDays: number }>;
  anomalies: Array<{ date: string; precipitationMm: number | null; anomalyMm: number | null }>;
  documentedEvents: HistoricalFloodEvent[];
  allDocumentedEvents: HistoricalFloodEvent[];
}

interface HistoricalAnalysisPageProps {
  selectedCity: CityId;
  onSelectCity: (c: CityId) => void;
  theme: ThemeMode;
}

export const HistoricalAnalysisPage: React.FC<HistoricalAnalysisPageProps> = ({
  selectedCity,
  onSelectCity,
  theme,
}) => {
  const chart = getChartTheme(theme);
  const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const defaultEnd = yesterday.toISOString().slice(0, 10);
  const defaultStart = new Date(yesterday.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [compareCityId, setCompareCityId] = useState<CityId | 'none'>('none');
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly' | 'anomaly'>(
    'daily'
  );
  const [eventFilterCity, setEventFilterCity] = useState<'selected' | 'all'>('selected');
  const [showRawTable, setShowRawTable] = useState(false);

  const [data, setData] = useState<HistoricalApiResponse | null>(null);
  const [compareData, setCompareData] = useState<HistoricalApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistorical = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/historical/${encodeURIComponent(selectedCity)}?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      );
      const json = await resp.json();
      if (!resp.ok) {
        setError(json?.error || `Archive returned HTTP ${resp.status}`);
        setData(null);
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch historical rainfall data');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistorical();
  }, [selectedCity, startDate, endDate]);

  useEffect(() => {
    if (compareCityId === 'none' || compareCityId === selectedCity) {
      setCompareData(null);
      return;
    }
    let cancelled = false;
    setCompareLoading(true);
    fetch(
      `/api/historical/${encodeURIComponent(compareCityId)}?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
    )
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!cancelled) {
          setCompareData(ok ? json : null);
        }
      })
      .catch(() => {
        if (!cancelled) setCompareData(null);
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [compareCityId, selectedCity, startDate, endDate]);

  const applyPresetDays = (days: number) => {
    const endD = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const startD = new Date(endD.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(startD.toISOString().slice(0, 10));
    setEndDate(endD.toISOString().slice(0, 10));
  };

  const eventsToDisplay =
    eventFilterCity === 'all'
      ? data?.allDocumentedEvents ?? []
      : data?.documentedEvents ?? [];

  const peakDay = (data?.dailyRecords ?? []).reduce<{ date: string; mm: number }>(
    (best, r) =>
      (r.precipitationMm ?? 0) > best.mm ? { date: r.date, mm: r.precipitationMm ?? 0 } : best,
    { date: '—', mm: 0 }
  );

  // Merge primary & optional comparison city series cleanly
  const mergedDaily = useMemo(() => {
    const primary = data?.dailyRecords ?? [];
    const compMap = new Map(
      (compareData?.dailyRecords ?? []).map((r) => [r.date, r.precipitationMm])
    );
    return primary.map((r) => ({
      date: r.date,
      precipitationMm: r.precipitationMm,
      compareMm: compareData ? (compMap.get(r.date) ?? null) : null,
    }));
  }, [data?.dailyRecords, compareData]);

  const mergedWeekly = useMemo(() => {
    const primary = data?.weeklyTrends ?? [];
    const compMap = new Map((compareData?.weeklyTrends ?? []).map((w) => [w.weekLabel, w.totalMm]));
    return primary.map((w) => ({
      weekLabel: w.weekLabel,
      totalMm: w.totalMm,
      compareMm: compareData ? (compMap.get(w.weekLabel) ?? null) : null,
    }));
  }, [data?.weeklyTrends, compareData]);

  const mergedMonthly = useMemo(() => {
    const primary = data?.monthlyTrends ?? [];
    const compMap = new Map(
      (compareData?.monthlyTrends ?? []).map((m) => [m.monthLabel, m.totalMm])
    );
    return primary.map((m) => ({
      monthLabel: m.monthLabel,
      totalMm: m.totalMm,
      compareMm: compareData ? (compMap.get(m.monthLabel) ?? null) : null,
    }));
  }, [data?.monthlyTrends, compareData]);

  const primaryCityName = CITY_MAP[selectedCity]?.name ?? selectedCity;
  const compareCityName = compareData?.cityName ?? null;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
            Historical Rainfall &amp; City Comparison Archive
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-1">
            ERA5 meteorological reanalysis archive with side-by-side Indian city precipitation comparison and documented flood records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCity}
            onChange={(e) => onSelectCity(e.target.value as CityId)}
            aria-label="Select primary city for historical analysis"
            className="rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 shadow-sm"
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                Primary: {c.name}, {c.state}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 shadow-sm">
            <GitCompare className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
            <select
              value={compareCityId === selectedCity ? 'none' : compareCityId}
              onChange={(e) => setCompareCityId(e.target.value as CityId | 'none')}
              aria-label="Select city to compare rainfall history"
              className="bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
            >
              <option value="none">Compare with City (Off)</option>
              {CITIES.filter((c) => c.id !== selectedCity).map((c) => (
                <option key={c.id} value={c.id}>
                  vs {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#64748B] dark:text-slate-400" />
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono shadow-sm"
            />
            <span className="text-[#64748B] dark:text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={defaultEnd}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono shadow-sm"
            />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0b1222] border border-slate-200 dark:border-slate-800">
            {[
              { label: '30d', days: 30 },
              { label: '90d', days: 90 },
              { label: '180d', days: 180 },
              { label: '1y', days: 365 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPresetDays(p.days)}
                className="px-2.5 py-1 text-xs font-mono text-[#475569] dark:text-slate-300 hover:text-[#0284C7] dark:hover:text-cyan-300 hover:bg-white dark:hover:bg-slate-800 rounded cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-[#FEF2F2] dark:bg-red-950/30 border border-[#FECACA] dark:border-red-500/40 p-4 flex items-center justify-between gap-3 text-xs text-[#B91C1C] dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#DC2626] dark:text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchHistorical}
            className="inline-flex items-center gap-1 rounded bg-red-600 text-white dark:bg-red-500/20 px-3 py-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Period KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ScrollReveal delayMs={40}>
          <SpotlightCard className="rounded-2xl glass-panel p-4">
            <span className="text-xs text-[#475569] dark:text-slate-400">
              Cumulative Period Rainfall ({primaryCityName})
            </span>
            <div className="text-2xl font-mono font-bold text-[#0F172A] dark:text-slate-100 mt-1 tabular-nums">
              {loading ? (
                '...'
              ) : data ? (
                <>
                  <AnimatedNumber value={data.totalPeriodMm} decimals={1} /> mm
                </>
              ) : (
                'Unavailable'
              )}
            </div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-500">
              {compareData
                ? `vs ${compareData.cityName}: ${compareData.totalPeriodMm.toFixed(1)} mm`
                : `${startDate} to ${endDate}`}
            </span>
          </SpotlightCard>
        </ScrollReveal>
        <ScrollReveal delayMs={90}>
          <SpotlightCard className="rounded-2xl glass-panel p-4">
            <span className="text-xs text-[#475569] dark:text-slate-400">Daily Mean Baseline</span>
            <div className="text-2xl font-mono font-bold text-[#0F172A] dark:text-slate-100 mt-1 tabular-nums">
              {loading ? (
                '...'
              ) : data ? (
                <>
                  <AnimatedNumber value={data.meanDailyMm} decimals={1} /> mm/day
                </>
              ) : (
                'Unavailable'
              )}
            </div>
            <span className="text-[11px] text-[#64748B] dark:text-slate-500">
              {compareData
                ? `vs ${compareData.cityName}: ${compareData.meanDailyMm.toFixed(1)} mm/day`
                : 'Used for anomaly deviation baseline'}
            </span>
          </SpotlightCard>
        </ScrollReveal>
        <ScrollReveal delayMs={140}>
          <SpotlightCard className="rounded-2xl glass-panel p-4">
            <span className="text-xs text-[#475569] dark:text-slate-400">Peak Daily Accumulation</span>
            <div className="text-2xl font-mono font-bold text-[#0284C7] dark:text-cyan-300 mt-1 tabular-nums">
              {loading ? (
                '...'
              ) : data ? (
                <>
                  <AnimatedNumber value={peakDay.mm} decimals={1} /> mm
                </>
              ) : (
                'Unavailable'
              )}
            </div>
            <span className="text-[11px] font-mono text-[#64748B] dark:text-slate-500">
              Recorded on {peakDay.date}
            </span>
          </SpotlightCard>
        </ScrollReveal>
      </section>

      {/* Main Chart Card */}
      <section className="rounded-2xl glass-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
              {granularity === 'daily'
                ? `Daily Precipitation Archive${compareCityName ? ` (${primaryCityName} vs ${compareCityName})` : ''}`
                : granularity === 'weekly'
                ? `Weekly Cumulative Rainfall${compareCityName ? ` (${primaryCityName} vs ${compareCityName})` : ''}`
                : granularity === 'monthly'
                ? `Monthly Rainfall Trends${compareCityName ? ` (${primaryCityName} vs ${compareCityName})` : ''}`
                : `Daily Rainfall Anomaly vs Period Mean (${primaryCityName})`}
            </h2>
            <p className="text-xs text-[#475569] dark:text-slate-400">
              Source: {data?.source ?? 'Open-Meteo Historical Weather Archive'}
              {compareLoading ? ' · Loading comparison city...' : ''}
            </p>
          </div>

          <SlidingTabs
            layoutId="historical-granularity-tabs"
            activeId={granularity}
            onChange={setGranularity}
            className="self-start"
            items={[
              { id: 'daily', label: 'Daily' },
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'anomaly', label: 'Anomaly' },
            ]}
          />
        </div>

        <div className="h-72 w-full">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-[#64748B] dark:text-slate-400">
              Loading ERA5 historical archive...
            </div>
          ) : !data ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Historical archive unavailable.
            </div>
          ) : granularity === 'daily' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mergedDaily} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                  minTickGap={24}
                />
                <YAxis
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 11 }}
                  unit="mm"
                />
                <Tooltip contentStyle={chart.tooltipStyle} />
                {compareCityName && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Bar
                  dataKey="precipitationMm"
                  name={`${primaryCityName} (mm)`}
                  fill={chart.colors.ocean}
                  radius={[2, 2, 0, 0]}
                />
                {compareCityName && (
                  <Bar
                    dataKey="compareMm"
                    name={`${compareCityName} (mm)`}
                    fill={chart.colors.amber}
                    radius={[2, 2, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : granularity === 'weekly' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mergedWeekly} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="weekLabel"
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                />
                <YAxis
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 11 }}
                  unit="mm"
                />
                <Tooltip contentStyle={chart.tooltipStyle} />
                {compareCityName && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Bar
                  dataKey="totalMm"
                  name={`${primaryCityName} Weekly (mm)`}
                  fill={chart.colors.royal}
                  radius={[3, 3, 0, 0]}
                />
                {compareCityName && (
                  <Bar
                    dataKey="compareMm"
                    name={`${compareCityName} Weekly (mm)`}
                    fill={chart.colors.amber}
                    radius={[3, 3, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : granularity === 'monthly' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mergedMonthly} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="monthLabel"
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 11 }}
                />
                <YAxis
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 11 }}
                  unit="mm"
                />
                <Tooltip contentStyle={chart.tooltipStyle} />
                {compareCityName && <Legend wrapperStyle={{ fontSize: 11 }} />}
                <Bar
                  dataKey="totalMm"
                  name={`${primaryCityName} Monthly (mm)`}
                  fill={chart.colors.teal}
                  radius={[4, 4, 0, 0]}
                />
                {compareCityName && (
                  <Bar
                    dataKey="compareMm"
                    name={`${compareCityName} Monthly (mm)`}
                    fill={chart.colors.amber}
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.anomalies} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                  minTickGap={24}
                />
                <YAxis
                  stroke={chart.axisStroke}
                  tick={{ fill: chart.tickFill, fontSize: 11 }}
                  unit="mm"
                />
                <ReferenceLine y={0} stroke={chart.refLineStroke} />
                <Tooltip contentStyle={chart.tooltipStyle} />
                <Bar dataKey="anomalyMm" name="Anomaly vs Mean (mm)">
                  {data.anomalies.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={(entry.anomalyMm ?? 0) >= 0 ? chart.colors.amber : chart.colors.ocean}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Collapsible Raw Daily Records Table (collapsed by default) */}
        {data && data.dailyRecords.length > 0 && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => setShowRawTable((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0284C7] dark:text-cyan-300 hover:underline cursor-pointer"
            >
              {showRawTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>
                {showRawTable
                  ? 'Hide Raw Daily Records'
                  : `Inspect Raw Daily Archive Table (${data.dailyRecords.length} days)`}
              </span>
            </button>

            {showRawTable && (
              <div className="mt-3 overflow-x-auto max-h-72 rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-500">
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3 text-right">{primaryCityName} Rain</th>
                      {compareCityName && (
                        <th className="py-2 px-3 text-right">{compareCityName} Rain</th>
                      )}
                      <th className="py-2 px-3 text-right">Max Temp</th>
                      <th className="py-2 px-3 text-right">Min Temp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {mergedDaily.slice(-30).reverse().map((row, i) => {
                      const raw = data.dailyRecords[data.dailyRecords.length - 1 - i];
                      return (
                        <tr key={row.date}>
                          <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300">{row.date}</td>
                          <td className="py-1.5 px-3 text-right text-[#0284C7] dark:text-cyan-300">
                            {row.precipitationMm !== null ? `${row.precipitationMm.toFixed(1)} mm` : '—'}
                          </td>
                          {compareCityName && (
                            <td className="py-1.5 px-3 text-right text-amber-600 dark:text-amber-300">
                              {row.compareMm !== null ? `${row.compareMm.toFixed(1)} mm` : '—'}
                            </td>
                          )}
                          <td className="py-1.5 px-3 text-right text-slate-600 dark:text-slate-400">
                            {raw?.tempMaxC !== null && raw?.tempMaxC !== undefined ? `${raw.tempMaxC.toFixed(1)}°C` : '—'}
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-600 dark:text-slate-400">
                            {raw?.tempMinC !== null && raw?.tempMinC !== undefined ? `${raw.tempMinC.toFixed(1)}°C` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Documented Historical Flood Events */}
      <section className="rounded-2xl glass-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
              Documented Historical Urban Flood Reference Events
            </h2>
            <p className="text-xs text-[#475569] dark:text-slate-400">
              Curated reference archive from IMD / NDMA / SDMA public reports. Missing ward-level gauge readings are not extrapolated.
            </p>
          </div>
          <SlidingTabs
            layoutId="historical-event-scope-tabs"
            activeId={eventFilterCity}
            onChange={setEventFilterCity}
            className="self-start"
            items={[
              { id: 'selected', label: 'Selected City Only' },
              { id: 'all', label: 'All Indian Cities' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {eventsToDisplay.map((ev, idx) => (
            <ScrollReveal key={ev.id} delayMs={Math.min(idx * 45, 225)}>
              <SpotlightCard className="h-full rounded-xl bg-slate-50/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                    {ev.cityName} · {ev.dateLabel}
                  </div>
                  <RiskStatusIndicator level={ev.severity} />
                </div>
                <div className="text-xs font-mono font-semibold text-[#0284C7] dark:text-cyan-300">
                  24h Peak Recorded:{' '}
                  {ev.recordedPeakRainMm24h !== null
                    ? `${ev.recordedPeakRainMm24h} mm`
                    : 'Record Unavailable'}
                </div>
                <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                  {ev.summary}
                </p>
                <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                  Localities: {ev.affectedLocalities.join(', ')}
                </div>
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-[#64748B] dark:text-slate-500">
                  <span>{ev.sourceCitation}</span>
                  <span>{ev.recordStatus}</span>
                </div>
              </SpotlightCard>
            </ScrollReveal>
          ))}
        </div>
      </section>
    </div>
  );
};
