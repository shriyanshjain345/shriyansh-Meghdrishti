import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Compass,
  Droplets,
  HeartPulse,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wind,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CITIES, CITY_MAP } from '../data/cities.ts';
import type { AirQualityIntelResponse, CityId, UnitsSystem } from '../types/flood.ts';
import {
  formatRain,
  formatTimestampIST,
  formatWind,
  getChartTheme,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  AnimatedNumber,
  ScrollReveal,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';
import { useToast } from '../components/ToastContext.tsx';

interface AirQualityPageProps {
  selectedCity: CityId;
  onSelectCity: (city: CityId) => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

function getAqiVisualSpec(aqi: number | null, category?: string | null) {
  const cat = (category ?? '').toLowerCase();
  if (aqi === null) {
    return {
      color: '#64748B',
      label: 'Unavailable',
      badge: 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800/60 dark:border-slate-700',
    };
  }
  if (cat.includes('good') || aqi <= 50) {
    return {
      color: '#10b981',
      label: category || 'Good Air Quality',
      badge: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/15 dark:border-emerald-500/35',
    };
  }
  if (cat.includes('satisfactory') || cat.includes('moderate') || aqi <= 100) {
    return {
      color: '#eab308',
      label: category || 'Moderate / Satisfactory',
      badge: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-500/35',
    };
  }
  if (cat.includes('sensitive') || aqi <= 200) {
    return {
      color: '#f97316',
      label: category || 'Moderate to Poor',
      badge: 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-500/15 dark:border-orange-500/35',
    };
  }
  if (cat.includes('very') || aqi > 300) {
    return {
      color: '#a855f7',
      label: category || 'Very Poor / Severe',
      badge: 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-500/15 dark:border-purple-500/35',
    };
  }
  return {
    color: '#ef4444',
    label: category || 'Unhealthy / Poor',
    badge: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-500/15 dark:border-red-500/35',
  };
}

export const AirQualityPage: React.FC<AirQualityPageProps> = ({
  selectedCity,
  onSelectCity,
  units,
  theme,
}) => {
  const { pushToast } = useToast();
  const [data, setData] = useState<AirQualityIntelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);

  const fetchAq = useCallback(
    async (opts?: { lat?: number; lng?: number; refresh?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (opts?.lat !== undefined && opts?.lng !== undefined) {
          params.set('lat', String(opts.lat));
          params.set('lng', String(opts.lng));
        } else {
          params.set('cityId', selectedCity);
        }
        if (opts?.refresh) params.set('refresh', 'true');
        const res = await fetch(`/api/air-quality?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json?.error || `HTTP ${res.status}`);
        } else {
          setData(json as AirQualityIntelResponse);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to fetch Air Quality data');
      } finally {
        setLoading(false);
      }
    },
    [selectedCity]
  );

  useEffect(() => {
    setGpsCoords(null);
    fetchAq();
  }, [selectedCity, fetchAq]);

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      pushToast('GPS Unavailable', 'Browser geolocation is not supported on this device.', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setGpsCoords({ lat, lng });
        fetchAq({ lat, lng, refresh: true });
        pushToast('GPS Coordinates Applied', `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`, 'success');
      },
      (err) => {
        pushToast('Location Denied', err.message || 'Unable to acquire device GPS position.', 'error');
      },
      { timeout: 10000 }
    );
  };

  const chartTheme = useMemo(() => getChartTheme(theme), [theme]);
  const aq = data?.airQuality;
  const spec = getAqiVisualSpec(aq?.aqi ?? null, aq?.aqiCategory);

  // Circular Gauge geometry (max scale 500 for regional/US AQI, 100 for UAQI)
  const isUaqi = (aq?.regionStandard ?? '').toLowerCase().includes('universal');
  const maxGaugeScale = isUaqi ? 100 : 500;
  const gaugePct =
    aq?.aqi !== null && aq?.aqi !== undefined
      ? Math.max(4, Math.min(100, (aq.aqi / maxGaugeScale) * 100))
      : 0;
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (gaugePct / 100) * circumference;

  const pollutantBars = useMemo(() => {
    if (!aq?.pollutants) return [];
    return aq.pollutants
      .filter((p) => p.value !== null)
      .map((p) => ({
        name: p.displayName,
        value: p.value as number,
        units: p.units ?? '',
      }));
  }, [aq]);

  const healthTips = useMemo(() => {
    if (aq?.healthRecommendations) {
      const hr = aq.healthRecommendations;
      return [
        { group: 'General Population', text: hr.generalPopulation },
        { group: 'Athletes & Outdoor Activity', text: hr.athletes },
        { group: 'Elderly & Children', text: hr.elderly || hr.children },
        { group: 'Respiratory & Cardiac Sensitivity', text: hr.lungDiseasePopulation || hr.heartDiseasePopulation },
      ].filter((item) => Boolean(item.text));
    }
    if (aq?.aqi === null || aq?.aqi === undefined) return [];
    if (aq.aqi <= 50) {
      return [
        { group: 'General Population', text: 'Air quality is clean. Standard outdoor exercise and ventilation are safe.' },
        { group: 'Sensitive Groups', text: 'Minimal atmospheric burden detected at monitoring grid resolution.' },
      ];
    }
    if (aq.aqi <= 150) {
      return [
        { group: 'General Population', text: 'Moderate particulate load. Limit prolonged roadside exertion during peak traffic hours.' },
        { group: 'Sensitive Groups', text: 'Individuals with asthma or cardiac conditions should reduce heavy outdoor activity.' },
      ];
    }
    return [
      { group: 'General Population', text: 'Elevated pollution level. Consider wearing an N95/FFP2 respirator outdoors and closing windows facing arterial roads.' },
      { group: 'Sensitive Groups', text: 'Avoid strenuous outdoor exercise; keep prescribed inhalers and indoor filtration accessible.' },
    ];
  }, [aq]);

  const activeCityName = CITY_MAP[selectedCity]?.name ?? 'Selected City';

  return (
    <div className="space-y-6">
      {/* Header + Controls */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Wind className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              Live Air Quality Intelligence
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Real-time AQI, six measured atmospheric pollutants, 24-hour trend history, and meteorological dispersion context.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCity}
              onChange={(e) => onSelectCity(e.target.value as CityId)}
              aria-label="Select city for air quality"
              className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-cyan-500/25 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.state}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleUseGps}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-cyan-500/30 bg-white dark:bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-700 dark:text-cyan-200 hover:border-cyan-400 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
              <span>Use GPS</span>
            </button>

            <button
              type="button"
              onClick={() => fetchAq({ ...(gpsCoords ?? {}), refresh: true })}
              disabled={loading}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync AQI</span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      {error && (
        <div className="rounded-2xl bg-red-50 dark:bg-red-950/35 border border-red-200 dark:border-red-500/35 p-4 text-xs text-red-700 dark:text-red-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Row: Animated Circular AQI Gauge + 6 Pollutant Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Animated Circular AQI Gauge */}
        <ScrollReveal delayMs={40} className="lg:col-span-5">
          <SpotlightCard tactile={false} className="glass-panel-elevated rounded-3xl p-6 h-full flex flex-col justify-between space-y-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                  {gpsCoords ? 'GPS Coordinate Feed' : `${activeCityName} Monitoring Grid`}
                </span>
                <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white mt-0.5">
                  {data?.locationLabel ?? activeCityName}
                </h2>
              </div>
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${spec.badge}`}>
                {spec.label}
              </span>
            </div>

            {/* SVG Circular Gauge */}
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-slate-200 dark:text-slate-800/80"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke={spec.color}
                    strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    style={{
                      transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s ease',
                      filter: `drop-shadow(0 0 10px ${spec.color}66)`,
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Measured AQI
                  </span>
                  <span className="font-mono text-4xl font-extrabold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {aq?.aqi !== null && aq?.aqi !== undefined ? <AnimatedNumber value={aq.aqi} /> : '—'}
                  </span>
                  <span className="text-[11px] font-mono text-[#0284C7] dark:text-cyan-300 mt-1">
                    Lead: {aq?.dominantPollutant ?? 'Unavailable'}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>Scale Standard</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white">{aq?.regionStandard ?? 'Unavailable'}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                <span>Data Provider</span>
                <span className="font-medium text-right truncate max-w-[200px]">{aq?.source ?? 'Pending'}</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Observed
                </span>
                <span className="font-mono">{aq?.measuredAt ? formatTimestampIST(aq.measuredAt) : 'Unavailable'}</span>
              </div>
            </div>
          </SpotlightCard>
        </ScrollReveal>

        {/* Right: 6 Pollutant Grid + Pollutant Comparison BarChart */}
        <ScrollReveal delayMs={80} className="lg:col-span-7 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(aq?.pollutants ?? []).map((p) => (
              <SpotlightCard key={p.code} className="glass-panel rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0284C7] dark:text-cyan-300">{p.displayName}</span>
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {p.value !== null ? p.value : '—'}
                  <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 ml-1">
                    {p.units ?? ''}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {p.fullName}
                </p>
              </SpotlightCard>
            ))}
          </div>

          <SpotlightCard tactile={false} className="glass-panel rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-slate-100">
                Measured Pollutant Concentration Profile
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Station / atmospheric grid concentration
              </span>
            </div>
            {pollutantBars.length > 0 ? (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pollutantBars} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                    <XAxis dataKey="name" tick={{ fill: chartTheme.tickFill, fontSize: 11 }} stroke={chartTheme.axisStroke} />
                    <YAxis tick={{ fill: chartTheme.tickFill, fontSize: 11 }} stroke={chartTheme.axisStroke} />
                    <Tooltip
                      contentStyle={chartTheme.tooltipStyle}
                      formatter={(val: any, _n: any, entry: any) => [`${val} ${entry?.payload?.units ?? ''}`, 'Concentration']}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {pollutantBars.map((_, i) => (
                        <Cell
                          key={i}
                          fill={i === 0 ? '#06b6d4' : i === 1 ? '#3b82f6' : i === 2 ? '#8b5cf6' : '#0ea5e9'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                Pollutant breakdown unavailable for the current query.
              </p>
            )}
          </SpotlightCard>
        </ScrollReveal>
      </div>

      {/* 24-Hour Historical AQI Trend Chart */}
      <ScrollReveal delayMs={110}>
        <SpotlightCard tactile={false} className="glass-panel rounded-2xl p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                24-Hour Historical AQI &amp; Particulate Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Source: {data?.historySource ?? 'Awaiting historical series'}
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-cyan-300/80">
              {data?.history.length ?? 0} hourly points
            </span>
          </div>

          {data?.history && data.history.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.history} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aqiHistoryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                  <XAxis dataKey="hourLabel" tick={{ fill: chartTheme.tickFill, fontSize: 11 }} stroke={chartTheme.axisStroke} />
                  <YAxis tick={{ fill: chartTheme.tickFill, fontSize: 11 }} stroke={chartTheme.axisStroke} />
                  <Tooltip contentStyle={chartTheme.tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="aqi"
                    name="AQI"
                    stroke="#06b6d4"
                    strokeWidth={2.4}
                    fill="url(#aqiHistoryGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="pm25"
                    name="PM2.5 (µg/m³)"
                    stroke="#8b5cf6"
                    strokeWidth={1.8}
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              24-hour historical air quality trend is currently unavailable for these coordinates.
            </p>
          )}
        </SpotlightCard>
      </ScrollReveal>

      {/* Health Recommendations & Weather Dispersion Context */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <ScrollReveal delayMs={130} className="lg:col-span-7">
          <SpotlightCard tactile={false} className="glass-panel rounded-2xl p-5 h-full space-y-3.5">
            <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              Health &amp; Exposure Guidance
            </h2>
            {healthTips.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {healthTips.map((tip, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-1"
                  >
                    <p className="text-xs font-semibold text-[#0284C7] dark:text-cyan-300">{tip.group}</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{tip.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Health recommendations will appear once AQI measurements load.
              </p>
            )}
          </SpotlightCard>
        </ScrollReveal>

        <ScrollReveal delayMs={150} className="lg:col-span-5">
          <SpotlightCard tactile={false} className="glass-panel rounded-2xl p-5 h-full space-y-3.5">
            <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
              Atmospheric Dispersion Context
            </h2>
            {data?.weather.available && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                  <span className="text-[10px] text-slate-500 block">Wind</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {formatWind(data.weather.windKmh, units)}
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                  <span className="text-[10px] text-slate-500 block flex items-center gap-1">
                    <Droplets className="w-3 h-3" /> Humidity
                  </span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {data.weather.humidityPct ?? '—'}%
                  </span>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                  <span className="text-[10px] text-slate-500 block">Recent Rain</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {formatRain(data.weather.recentRainMm, units, false).value}{' '}
                    {formatRain(data.weather.recentRainMm, units, false).unit}
                  </span>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {data?.weather.dispersionNote ?? 'Loading wind and humidity dispersion context...'}
            </p>
            <div className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>
                Sensor/grid AQI values above come from Google Maps Platform Air Quality API / Open-Meteo CAMS, kept strictly separate from Environmental Camera visual screening.
              </span>
            </div>
          </SpotlightCard>
        </ScrollReveal>
      </div>
    </div>
  );
};
