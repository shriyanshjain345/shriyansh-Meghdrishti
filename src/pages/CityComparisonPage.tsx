import React, { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  GitCompare,
  Map as MapIcon,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CITY_MAP } from '../data/cities.ts';
import type {
  CityComparisonSummary,
  CityId,
  NavPageId,
  RiskLevel,
  UnitsSystem,
} from '../types/flood.ts';
import {
  formatRain,
  formatTemperature,
  formatTimestampIST,
  getChartTheme,
  RISK_STYLES,
  RiskStatusIndicator,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  AnimatedNumber,
  FlipCard,
  FlipHintBadge,
  InteractiveChartLegend,
  ScrollReveal,
  SlidingTabs,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface CityComparisonPageProps {
  comparison: CityComparisonSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  selectedCity: CityId;
  onSelectCity: (c: CityId) => void;
  onNavigate: (p: NavPageId) => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

type SortKey =
  | 'cityName'
  | 'rainfallMmHr'
  | 'accumulated24hMm'
  | 'floodRiskIndex'
  | 'soilMoisturePct'
  | 'drainageCapacityPct';

export const CityComparisonPage: React.FC<CityComparisonPageProps> = ({
  comparison,
  loading,
  error,
  onRefresh,
  selectedCity,
  onSelectCity,
  onNavigate,
  units,
  theme,
}) => {
  const chart = getChartTheme(theme);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | RiskLevel>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('floodRiskIndex');
  const [sortAsc, setSortAsc] = useState(false);
  const [hiddenRainSeries, setHiddenRainSeries] = useState<Record<string, boolean>>({});

  const toggleRainSeries = (key: string) => {
    setHiddenRainSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'cityName');
    }
  };

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...comparison]
      .filter((c) => {
        if (q && !c.cityName.toLowerCase().includes(q) && !c.state.toLowerCase().includes(q)) {
          return false;
        }
        if (riskFilter !== 'ALL' && c.riskCategory !== riskFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortKey === 'cityName') {
          return sortAsc
            ? a.cityName.localeCompare(b.cityName)
            : b.cityName.localeCompare(a.cityName);
        }
        const av = a[sortKey] ?? -1;
        const bv = b[sortKey] ?? -1;
        return sortAsc ? av - bv : bv - av;
      });
  }, [comparison, search, riskFilter, sortKey, sortAsc]);

  const chartData = comparison.map((c) => ({
    city: c.cityName,
    riskIndex: c.floodRiskIndex ?? 0,
    rain24h: c.accumulated24hMm ?? 0,
    soilPct: c.soilMoisturePct ?? 0,
    category: c.riskCategory,
  }));

  return (
    <div className="space-y-6">
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              City Explorer &amp; Multi-Basin Comparison
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-1">
              Side-by-side live weather &amp; flood monitoring across 9 Indian cities: Mumbai, Delhi, Chennai, Bengaluru, Kolkata, Jaipur, Hyderabad, Pune, and Ahmedabad.
            </p>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="tactile-btn inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#0284C7] dark:hover:border-cyan-500/40 cursor-pointer self-start"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#0284C7] dark:text-cyan-400' : ''}`} />
            <span>Refresh All Cities</span>
          </button>
        </div>
      </ScrollReveal>

      {error && (
        <div className="rounded-xl bg-[#FEF2F2] dark:bg-red-950/30 border border-[#FECACA] dark:border-red-500/40 p-4 text-xs text-[#B91C1C] dark:text-red-200">
          Failed to fetch multi-city comparison: {error}
        </div>
      )}

      {/* Interactive 3D City Summary FlipCard Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-display font-semibold text-[#0F172A] dark:text-slate-100">
              Interactive Urban Basin Cards
            </h2>
            <p className="text-xs text-[#64748B] dark:text-slate-400">
              Tap or press Enter on any city card to flip for coordinates, hydrological breakdown &amp; quick navigation.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#64748B] dark:text-slate-400">
            Showing {filteredAndSorted.length} of {comparison.length || 9} cities
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAndSorted.map((row, idx) => {
            const meta = CITY_MAP[row.cityId];
            const isSelected = selectedCity === row.cityId;
            const rRate = formatRain(row.rainfallMmHr, units, true);
            const r24 = formatRain(row.accumulated24hMm, units, false);
            const gmapsDirections = `https://www.google.com/maps/dir/?api=1&destination=${meta.lat},${meta.lng}`;

            return (
              <ScrollReveal key={row.cityId} delayMs={Math.min(idx * 55, 280)}>
                <FlipCard
                  ariaLabel={`${row.cityName} flood telemetry card`}
                  className="h-full"
                  front={
                    <div className="flex flex-col justify-between gap-3 h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-display font-bold text-[#0F172A] dark:text-slate-100 truncate">
                              {row.cityName}
                            </h3>
                            {isSelected && (
                              <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-[#E0F2FE] dark:bg-cyan-500/20 text-[#0284C7] dark:text-cyan-300 border border-sky-200 dark:border-cyan-500/35">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                            {row.state} · {row.conditionText ?? 'Status unavailable'}
                          </p>
                        </div>
                        <RiskStatusIndicator level={row.riskCategory} />
                      </div>

                      <div className="grid grid-cols-3 gap-2 py-1">
                        <div>
                          <div className="text-[10px] text-[#64748B] dark:text-slate-400">Risk Index</div>
                          <div className="font-mono text-xl font-bold text-[#0F172A] dark:text-slate-100 tabular-nums">
                            <AnimatedNumber value={row.floodRiskIndex} fallback="—" />
                            <span className="text-[10px] font-normal text-slate-500">/100</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#64748B] dark:text-slate-400">Rain Rate</div>
                          <div className="font-mono text-sm font-semibold text-[#0284C7] dark:text-cyan-300 tabular-nums mt-1">
                            {rRate.value === 'Unavailable' ? '—' : `${rRate.value} ${rRate.unit}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-[#64748B] dark:text-slate-400">Temp</div>
                          <div className="font-mono text-sm font-semibold text-[#0F172A] dark:text-slate-200 tabular-nums mt-1">
                            {formatTemperature(row.temperatureC, units)}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-[#64748B] dark:text-slate-400">
                        <span className="truncate font-mono">
                          {row.tempMaxC != null && row.tempMinC != null
                            ? `H ${Math.round(row.tempMaxC)}° / L ${Math.round(row.tempMinC)}°`
                            : row.alertStatus}
                          {row.uvIndex != null ? ` · UV ${Math.round(row.uvIndex)}` : ''}
                        </span>
                        <FlipHintBadge label="Flip for actions" />
                      </div>
                    </div>
                  }
                  back={
                    <div className="flex flex-col justify-between gap-3 h-full text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-bold text-[#0F172A] dark:text-slate-100 block truncate">
                            {row.cityName} Telemetry Breakdown
                          </span>
                          <span className="text-[10px] font-mono text-[#64748B] dark:text-slate-400 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-[#0284C7] dark:text-cyan-400" />
                            {meta.lat.toFixed(3)}°N, {meta.lng.toFixed(3)}°E · {meta.elevationBaselineM}m ASL
                          </span>
                        </div>
                        <FlipHintBadge flipped label="Front ↻" />
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/85 dark:bg-slate-900/75 border border-slate-200 dark:border-slate-800 p-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block text-[10px]">24h Rain</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {r24.value === 'Unavailable' ? '—' : `${r24.value} ${r24.unit}`}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Soil %</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {row.soilMoisturePct !== null ? `${row.soilMoisturePct}%` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px]">Drainage</span>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {row.drainageCapacityPct !== null ? `${row.drainageCapacityPct}%` : '—'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          data-no-flip="true"
                          onClick={() => {
                            onSelectCity(row.cityId);
                            onNavigate('overview');
                          }}
                          className="tactile-btn flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-white cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isSelected ? 'Open Overview' : 'Switch City'}</span>
                        </button>
                        <button
                          type="button"
                          data-no-flip="true"
                          onClick={() => {
                            onSelectCity(row.cityId);
                            onNavigate('map');
                          }}
                          className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
                        >
                          <MapIcon className="w-3 h-3 text-[#0284C7] dark:text-cyan-400" />
                          <span>Flood Map</span>
                        </button>
                        <a
                          href={gmapsDirections}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-2 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                          title="Get directions to city centre"
                        >
                          <Navigation className="w-3 h-3" />
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  }
                />
              </ScrollReveal>
            );
          })}
        </div>
      </section>

      {/* Comparison Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ScrollReveal delayMs={60}>
          <SpotlightCard
            tactile={false}
            className="h-full rounded-2xl glass-panel p-5"
          >
            <h2 className="text-sm font-display font-semibold text-[#0F172A] dark:text-slate-100 mb-1">
              Flood-Risk Index Comparison (0–100)
            </h2>
            <p className="text-xs text-[#475569] dark:text-slate-400 mb-4">Calculated live from current weather, soil saturation &amp; drainage</p>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                  <XAxis dataKey="city" stroke={chart.axisStroke} tick={{ fill: chart.tickLabelFill, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} />
                  <Tooltip
                    contentStyle={chart.tooltipStyle}
                    cursor={{ fill: theme === 'dark' ? 'rgba(34,211,238,0.08)' : 'rgba(2,132,199,0.06)' }}
                  />
                  <Bar dataKey="riskIndex" name="Flood-Risk Index" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={RISK_STYLES[entry.category].hex} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SpotlightCard>
        </ScrollReveal>

        <ScrollReveal delayMs={120}>
          <SpotlightCard
            tactile={false}
            className="h-full rounded-2xl glass-panel p-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-display font-semibold text-[#0F172A] dark:text-slate-100">
                  24h Accumulated Rain (mm) vs Soil Moisture (%)
                </h2>
                <p className="text-xs text-[#475569] dark:text-slate-400">Hydrological runoff load across monitored cities</p>
              </div>
              <InteractiveChartLegend
                series={[
                  { key: 'rain24h', label: '24h Rain (mm)', color: chart.colors.ocean },
                  { key: 'soilPct', label: 'Soil Moisture (%)', color: chart.colors.royal },
                ]}
                hiddenKeys={hiddenRainSeries}
                onToggle={toggleRainSeries}
              />
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                  <XAxis dataKey="city" stroke={chart.axisStroke} tick={{ fill: chart.tickLabelFill, fontSize: 11 }} />
                  <YAxis stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} />
                  <Tooltip
                    contentStyle={chart.tooltipStyle}
                    cursor={{ fill: theme === 'dark' ? 'rgba(34,211,238,0.08)' : 'rgba(2,132,199,0.06)' }}
                  />
                  {!hiddenRainSeries.rain24h && (
                    <Bar dataKey="rain24h" name="24h Rain (mm)" fill={chart.colors.ocean} radius={[4, 4, 0, 0]} />
                  )}
                  {!hiddenRainSeries.soilPct && (
                    <Bar dataKey="soilPct" name="Soil Moisture (%)" fill={chart.colors.royal} radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SpotlightCard>
        </ScrollReveal>
      </section>

      {/* Filter Toolbar & Sortable Table */}
      <ScrollReveal delayMs={80}>
        <SpotlightCard
          tactile={false}
          className="rounded-2xl glass-panel p-5 space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter city or state..."
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#0284C7] dark:focus:border-cyan-500"
              />
            </div>

            <SlidingTabs
              layoutId="city-comparison-risk-tabs"
              activeId={riskFilter}
              onChange={setRiskFilter}
              items={[
                { id: 'ALL', label: 'All Levels' },
                { id: 'LOW', label: 'LOW' },
                { id: 'MODERATE', label: 'MODERATE' },
                { id: 'HIGH', label: 'HIGH' },
                { id: 'SEVERE', label: 'SEVERE' },
              ]}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                  <th className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => handleSort('cityName')}
                      className="inline-flex items-center gap-1 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
                    >
                      City <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Weather</th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('rainfallMmHr')}
                      className="inline-flex items-center gap-1 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
                    >
                      Rain Rate <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('accumulated24hMm')}
                      className="inline-flex items-center gap-1 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
                    >
                      24h Rain <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('soilMoisturePct')}
                      className="inline-flex items-center gap-1 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
                    >
                      Soil % <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('drainageCapacityPct')}
                      className="inline-flex items-center gap-1 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
                    >
                      Drainage % <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort('floodRiskIndex')}
                      className="inline-flex items-center gap-1 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
                    >
                      Risk Index <ArrowDownUp className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 pl-3 text-right">Alert Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No cities match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((row) => {
                    const rRate = formatRain(row.rainfallMmHr, units, true);
                    const r24 = formatRain(row.accumulated24hMm, units, false);
                    return (
                      <tr
                        key={row.cityId}
                        onClick={() => {
                          onSelectCity(row.cityId);
                          onNavigate('overview');
                        }}
                        className={`cursor-pointer transition-colors ${
                          selectedCity === row.cityId
                            ? 'bg-[#E0F2FE]/60 dark:bg-cyan-500/10'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 pr-3 font-medium text-[#0F172A] dark:text-slate-100 whitespace-nowrap">
                          {row.cityName}{' '}
                          <span className="text-[#64748B] dark:text-slate-500 font-normal">· {row.state}</span>
                        </td>
                        <td className="py-3 px-3 text-[#475569] dark:text-slate-300 whitespace-nowrap">
                          {row.conditionText ?? 'Unavailable'} · {formatTemperature(row.temperatureC, units)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#0F172A] dark:text-slate-200 whitespace-nowrap">
                          {rRate.value === 'Unavailable' ? 'Unavailable' : `${rRate.value} ${rRate.unit}`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300 whitespace-nowrap">
                          {r24.value === 'Unavailable' ? 'Unavailable' : `${r24.value} ${r24.unit}`}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300">
                          {row.soilMoisturePct !== null ? `${row.soilMoisturePct}%` : 'Unavailable'}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-[#475569] dark:text-slate-300">
                          {row.drainageCapacityPct !== null ? `${row.drainageCapacityPct}%` : 'Unavailable'}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 justify-end">
                            <span className="font-mono tabular-nums text-[#0F172A] dark:text-slate-100 font-semibold">
                              {row.floodRiskIndex ?? '—'}
                            </span>
                            <RiskStatusIndicator level={row.riskCategory} />
                          </div>
                        </td>
                        <td className="py-3 pl-3 text-right text-[#64748B] dark:text-slate-400 whitespace-nowrap">
                          {row.alertStatus}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-[#64748B] dark:text-slate-500 flex justify-between">
            <span>Click any city row to open its full Overview Dashboard.</span>
            <span className="font-mono">
              Synced: {comparison[0] ? formatTimestampIST(comparison[0].fetchedAt) : '—'}
            </span>
          </div>
        </SpotlightCard>
      </ScrollReveal>
    </div>
  );
};
