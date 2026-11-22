import React from 'react';
import {
  AlertTriangle,
  CloudRain,
  Droplets,
  ExternalLink,
  ShieldAlert,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CITIES } from '../data/cities.ts';
import type { CityId, CityTelemetryResponse, UnitsSystem } from '../types/flood.ts';
import {
  formatRain,
  formatTemperature,
  formatTimestampIST,
  formatWind,
  getChartTheme,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  InteractiveChartLegend,
  LiveBeaconDot,
  ScrollReveal,
  SlidingTabs,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface WeatherIntelligencePageProps {
  selectedCity: CityId;
  onSelectCity: (c: CityId) => void;
  telemetry: CityTelemetryResponse | null;
  loading: boolean;
  units: UnitsSystem;
  theme: ThemeMode;
}

export const WeatherIntelligencePage: React.FC<WeatherIntelligencePageProps> = ({
  selectedCity,
  onSelectCity,
  telemetry,
  loading,
  units,
  theme,
}) => {
  const chart = getChartTheme(theme);
  const [hiddenSeries, setHiddenSeries] = React.useState<Record<string, boolean>>({});
  const toggleSeries = (key: string) => setHiddenSeries((p) => ({ ...p, [key]: !p[key] }));

  const hourlyChart = (telemetry?.hourlyForecast ?? []).map((h) => ({
    hour: h.hourLabel,
    tempC: h.tempC,
    rainMm: h.rainMm ?? 0,
    probPct: h.rainProbPct ?? 0,
  }));

  const currentRain = formatRain(telemetry?.current.rainfallMmHr, units, true);

  return (
    <div className="space-y-6">
      {/* Header + City Switch */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <CloudRain className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              Weather Intelligence &amp; Forecasts
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-1">
              Google Maps Platform Weather API (with transparent Open-Meteo fallback) · Updated {formatTimestampIST(telemetry?.fetchedAt)}
            </p>
          </div>

          <SlidingTabs
            layoutId="weather-city-tabs"
            activeId={selectedCity}
            onChange={onSelectCity}
            className="self-start"
            items={CITIES.map((c) => ({ id: c.id, label: c.name }))}
          />
        </div>
      </ScrollReveal>

      {/* Current Weather Summary Card */}
      <section className="rounded-2xl glass-panel p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        <div className="lg:col-span-5 space-y-2">
          <div className="text-xs font-mono font-semibold text-[#0284C7] dark:text-cyan-400">
            {telemetry?.sources.weather.provider ?? 'Loading provider'}
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-mono font-bold text-[#0F172A] dark:text-slate-100 tabular-nums">
              {loading && !telemetry ? '—' : formatTemperature(telemetry?.current.temperatureC, units)}
            </span>
            <span className="text-sm text-[#475569] dark:text-slate-300">
              {telemetry?.current.conditionText ?? 'Condition Unavailable'}
            </span>
          </div>
          <p className="text-xs text-[#64748B] dark:text-slate-400">
            {telemetry?.city.name}, {telemetry?.city.state} · Feels like{' '}
            {formatTemperature(telemetry?.current.feelsLikeC, units)}
          </p>
        </div>

        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 space-y-1">
            <div className="text-[#475569] dark:text-slate-400 flex items-center gap-1">
              <CloudRain className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
              Expected Rain
            </div>
            <div className="font-mono font-semibold text-[#0F172A] dark:text-slate-100 text-sm tabular-nums">
              {currentRain.value === 'Unavailable' ? 'Unavailable' : `${currentRain.value} ${currentRain.unit}`}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 space-y-1">
            <div className="text-[#475569] dark:text-slate-400 flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5 text-[#2563EB] dark:text-blue-400" />
              Humidity
            </div>
            <div className="font-mono font-semibold text-[#0F172A] dark:text-slate-100 text-sm tabular-nums">
              {telemetry?.current.humidityPct !== null && telemetry?.current.humidityPct !== undefined
                ? `${telemetry.current.humidityPct}%`
                : 'Unavailable'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 space-y-1">
            <div className="text-[#475569] dark:text-slate-400 flex items-center gap-1">
              <Wind className="w-3.5 h-3.5 text-[#0D9488] dark:text-violet-400" />
              Wind
            </div>
            <div className="font-mono font-semibold text-[#0F172A] dark:text-slate-100 text-sm tabular-nums">
              {formatWind(telemetry?.current.windKmh, units)}
            </div>
            <div className="text-[11px] text-[#64748B] dark:text-slate-500">
              {telemetry?.current.windCardinal ?? '—'}
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 space-y-1">
            <div className="text-[#475569] dark:text-slate-400 flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-[#D97706] dark:text-amber-400" />
              Pressure
            </div>
            <div className="font-mono font-semibold text-[#0F172A] dark:text-slate-100 text-sm tabular-nums">
              {telemetry?.current.pressureMb !== null && telemetry?.current.pressureMb !== undefined
                ? `${telemetry.current.pressureMb} hPa`
                : 'Unavailable'}
            </div>
          </div>
        </div>
      </section>

      {/* Severe Weather Conditions & Public Alerts */}
      <section className="rounded-2xl glass-panel p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#EA580C] dark:text-orange-400" />
            Severe Weather Conditions &amp; Public Alerts
          </h2>
          <span className="text-xs font-mono text-[#64748B] dark:text-slate-400">
            {telemetry?.sources.alerts.provider ?? 'Public Alerts'}
          </span>
        </div>

        {telemetry?.alerts && telemetry.alerts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {telemetry.alerts.map((alert) => (
              <article
                key={alert.alertId}
                className="rounded-lg bg-[#FEF2F2] dark:bg-red-950/25 border border-[#FECACA] dark:border-red-500/35 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[#B91C1C] dark:text-red-200">{alert.title}</h3>
                  <span className="text-xs font-mono text-[#DC2626] dark:text-red-400">{alert.severity}</span>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{alert.description}</p>
                {alert.instructions.length > 0 && (
                  <ul className="text-xs text-slate-700 dark:text-slate-300 list-disc list-inside space-y-0.5">
                    {alert.instructions.map((ins, i) => (
                      <li key={i}>{ins}</li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  Source:{' '}
                  <a
                    href={alert.dataSource.authorityUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline text-[#0284C7] dark:text-cyan-300 hover:text-[#0369A1] dark:hover:text-cyan-200"
                  >
                    <span>{alert.dataSource.name}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3.5 text-xs text-[#475569] dark:text-slate-400 flex items-center gap-2">
            {telemetry?.sources.alerts.status === 'unavailable' ? (
              <>
                <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
                <span>
                  Public alerts channel unavailable ({telemetry.sources.alerts.message ?? 'Upstream unavailable'}). Check official IMD Mausam warnings.
                </span>
              </>
            ) : (
              <span>No active severe weather warnings reported for {telemetry?.city.name ?? selectedCity}.</span>
            )}
          </div>
        )}
      </section>

      {/* Hourly Forecast Chart */}
      <ScrollReveal delayMs={80}>
        <SpotlightCard
          tactile={false}
          className="rounded-2xl glass-panel p-5 space-y-4"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
                24-Hour Temperature, Rain Probability &amp; Expected QPF
              </h2>
              <p className="text-xs text-[#475569] dark:text-slate-400">
                Hourly meteorological outlook in IST · Click legend items to toggle series
              </p>
            </div>
            <InteractiveChartLegend
              series={[
                { key: 'rainMm', label: 'Rain (mm)', color: chart.colors.ocean },
                { key: 'probPct', label: 'Rain Prob (%)', color: chart.colors.royal },
                { key: 'tempC', label: 'Temp (°C)', color: chart.colors.amber },
              ]}
              hiddenKeys={hiddenSeries}
              onToggle={toggleSeries}
            />
          </div>

          <div className="h-64 w-full">
            {hourlyChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} vertical={false} />
                  <XAxis dataKey="hour" stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} interval={2} />
                  <YAxis yAxisId="left" stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} unit="mm" />
                  <YAxis yAxisId="right" orientation="right" stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip
                    contentStyle={chart.tooltipStyle}
                    cursor={{ stroke: chart.axisStroke, strokeDasharray: '4 4' }}
                  />
                  {!hiddenSeries.rainMm && (
                    <Bar yAxisId="left" dataKey="rainMm" name="Expected Rain (mm)" fill={chart.colors.ocean} radius={[3, 3, 0, 0]} />
                  )}
                  {!hiddenSeries.probPct && (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="probPct"
                      name="Rain Prob (%)"
                      stroke={chart.colors.royal}
                      strokeWidth={2}
                      dot={(dotProps) => (
                        <LiveBeaconDot
                          key={`w-prob-${dotProps.index}`}
                          cx={dotProps.cx}
                          cy={dotProps.cy}
                          index={dotProps.index}
                          targetIndex={0}
                          color={chart.colors.royal}
                        />
                      )}
                    />
                  )}
                  {!hiddenSeries.tempC && (
                    <Area yAxisId="right" type="monotone" dataKey="tempC" name="Temp (°C)" stroke={chart.colors.amber} fill={chart.colors.amber} fillOpacity={0.08} />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Hourly forecast unavailable.
              </div>
            )}
          </div>
        </SpotlightCard>
      </ScrollReveal>

      {/* 7-Day Daily Forecast Cards */}
      <section className="rounded-2xl glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <Sun className="w-4 h-4 text-[#D97706] dark:text-amber-400" />
            7-Day Daily Forecast
          </h2>
          <span className="text-xs text-[#64748B] dark:text-slate-400">{telemetry?.city.name}</span>
        </div>

        {telemetry?.dailyForecast.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
            {telemetry.dailyForecast.map((day, idx) => {
              const rSum = formatRain(day.rainSumMm, units, false);
              return (
                <ScrollReveal key={day.dateIso} delayMs={idx * 45}>
                  <SpotlightCard className="h-full rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3 flex flex-col justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-[#0F172A] dark:text-slate-100">{day.dayLabel}</div>
                    <div className="text-[11px] text-[#475569] dark:text-slate-400 mt-0.5 line-clamp-2">
                      {day.conditionText ?? 'Unavailable'}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-slate-400">Hi / Lo</span>
                      <span className="text-[#0F172A] dark:text-slate-100 font-medium">
                        {day.tempMaxC !== null ? Math.round(day.tempMaxC) : '—'}° /{' '}
                        {day.tempMinC !== null ? Math.round(day.tempMinC) : '—'}°
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-slate-400">Rain</span>
                      <span className="text-[#0284C7] dark:text-cyan-300 font-medium">
                        {rSum.value === 'Unavailable' ? '—' : `${rSum.value}${rSum.unit}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-slate-400">Prob</span>
                      <span className="text-[#475569] dark:text-slate-300">
                        {day.rainProbPct !== null ? `${day.rainProbPct}%` : '—'}
                      </span>
                    </div>
                  </div>
                  </SpotlightCard>
                </ScrollReveal>
              );
            })}
          </div>
        ) : (
          <div className="text-xs text-[#64748B] dark:text-slate-400 py-6 text-center">
            Daily forecast unavailable.
          </div>
        )}
      </section>
    </div>
  );
};
