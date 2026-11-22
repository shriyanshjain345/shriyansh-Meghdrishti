import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Info,
  RotateCcw,
  SlidersHorizontal,
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
import { CITIES, CITY_MAP } from '../data/cities.ts';
import { computeFloodRisk } from '../lib/riskModel.ts';
import type { CityId, CityTelemetryResponse } from '../types/flood.ts';
import { getChartTheme, RISK_STYLES, RiskStatusIndicator, type ThemeMode } from '../components/RiskBadge.tsx';
import {
  AnimatedNumber,
  ScrollReveal,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface ModelPerformancePageProps {
  selectedCity: CityId;
  telemetry: CityTelemetryResponse | null;
  theme: ThemeMode;
}

export const ModelPerformancePage: React.FC<ModelPerformancePageProps> = ({
  selectedCity,
  telemetry,
  theme,
}) => {
  const chart = getChartTheme(theme);
  const [simCityId, setSimCityId] = useState<CityId>(selectedCity);
  const [simRainMmHr, setSimRainMmHr] = useState<number>(
    Math.round(telemetry?.current.rainfallMmHr ?? 18)
  );
  const [simAcc24Mm, setSimAcc24Mm] = useState<number>(
    Math.round(telemetry?.current.accumulated24hMm ?? 65)
  );
  const [simSoilPct, setSimSoilPct] = useState<number>(
    Math.round(telemetry?.current.soilMoisturePct ?? 62)
  );

  const simCity = CITY_MAP[simCityId];

  const simulated = useMemo(() => {
    return computeFloodRisk({
      city: simCity,
      rainfallMmHr: simRainMmHr,
      accumulated24hMm: simAcc24Mm,
      soilMoisturePct: simSoilPct,
      elevationM: simCity.elevationBaselineM,
      hourlyForecast: [],
      weatherSourceLabel: 'Interactive Sensitivity Input',
      soilSourceLabel: 'Interactive Sensitivity Input',
      elevationSourceLabel: 'City Baseline Reference',
    });
  }, [simCity, simRainMmHr, simAcc24Mm, simSoilPct]);

  const resetToLive = () => {
    if (telemetry) {
      setSimCityId(telemetry.city.id);
      setSimRainMmHr(Math.round(telemetry.current.rainfallMmHr ?? 0));
      setSimAcc24Mm(Math.round(telemetry.current.accumulated24hMm ?? 0));
      setSimSoilPct(Math.round(telemetry.current.soilMoisturePct ?? 45));
    } else {
      setSimCityId(selectedCity);
      setSimRainMmHr(18);
      setSimAcc24Mm(65);
      setSimSoilPct(62);
    }
  };

  const simScoreStyle = RISK_STYLES[simulated.assessment.category];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
          Model Performance &amp; Validation Transparency
        </h1>
        <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-0.5">
          Honest evaluation audit of MeghDrishti’s heuristic hydrological index and Gemini interpretation layer.
        </p>
      </div>

      {/* Explicit Transparency Notice */}
      <div className="rounded-xl bg-[#FFFBEB] dark:bg-amber-950/25 border border-[#FDE68A] dark:border-amber-500/35 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#D97706] dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-[#B45309] dark:text-amber-100/90 space-y-1">
          <p className="font-semibold text-[#92400E] dark:text-amber-200">
            Ground-Truth Empirical Metrics Are Intentionally Marked “NOT EVALUATED”
          </p>
          <p className="text-xs text-[#92400E]/90 dark:text-amber-200/80 leading-relaxed">
            MeghDrishti does not fabricate accuracy claims, confusion matrices, or synthetic validation scores. Municipal street-level waterlogging logs, ward IoT ultrasonic depth gauges, and historical pump telemetry are not connected to this runtime; therefore Precision, Recall, F1 Score, Confusion Matrix, and MAE/RMSE remain unmeasured until formal municipal backtesting is executed.
          </p>
        </div>
      </div>

      {/* Evaluation Status Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Precision (Severe/High Alert)', value: 'NOT EVALUATED', note: 'Requires municipal waterlogging ground-truth labels' },
          { label: 'Recall (Flood Event Detection)', value: 'NOT EVALUATED', note: 'Requires ward-level flood incident logs' },
          { label: 'F1 Score', value: 'NOT EVALUATED', note: 'Pending balanced monsoon backtest cohort' },
          { label: 'Prediction Error (MAE / RMSE)', value: 'NOT EVALUATED', note: 'Pending ultrasonic depth / drain-gauge telemetry' },
          { label: 'Confusion Matrix', value: 'NOT EVALUATED', note: 'No fabricated TP / FP / TN / FN counts' },
        ].map((m, idx) => (
          <ScrollReveal key={m.label} delayMs={idx * 45}>
            <SpotlightCard className="h-full rounded-2xl glass-panel p-4 flex flex-col justify-between gap-2">
              <span className="text-xs font-medium text-[#475569] dark:text-slate-400">{m.label}</span>
              <p className="text-sm font-mono font-bold text-[#B45309] dark:text-amber-300 tracking-wide">
                {m.value}
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-slate-500 leading-relaxed">{m.note}</p>
            </SpotlightCard>
          </ScrollReveal>
        ))}
      </section>

      {/* Pipeline & Dataset Metadata */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-6 rounded-2xl glass-panel p-5 space-y-4">
          <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
            Model Architecture &amp; Pipeline Details
          </h2>

          <dl className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#475569] dark:text-slate-400">Risk Scoring Engine</dt>
              <dd className="font-mono font-medium text-[#0F172A] dark:text-slate-100 text-right">MeghDrishti Heuristic Index v1.0</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#475569] dark:text-slate-400">Scoring Paradigm</dt>
              <dd className="text-[#334155] dark:text-slate-200 text-right">Deterministic Weighted Linear Combination (0–100)</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#475569] dark:text-slate-400">AI Interpretation Model</dt>
              <dd className="font-mono font-medium text-[#0284C7] dark:text-cyan-300 text-right">gemini-4-hydrogen (Schema-constrained JSON)</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#475569] dark:text-slate-400">Live Meteorological Feeds</dt>
              <dd className="text-[#334155] dark:text-slate-200 text-right">Google Weather API + Open-Meteo Forecast &amp; Soil Moisture</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#475569] dark:text-slate-400">Historical Climate Dataset</dt>
              <dd className="text-[#334155] dark:text-slate-200 text-right">Open-Meteo ERA5 Reanalysis Archive + Documented IMD Events</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-[#475569] dark:text-slate-400">Terrain Elevation Source</dt>
              <dd className="text-[#334155] dark:text-slate-200 text-right">Google Elevation API + City Basin Baselines</dd>
            </div>
          </dl>
        </div>

        <div className="lg:col-span-6 rounded-2xl glass-panel p-5 space-y-4">
          <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <Info className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
            Required Validation Protocol (Roadmap)
          </h2>
          <p className="text-xs text-[#475569] dark:text-slate-400 leading-relaxed">
            Before using MeghDrishti indices for automated municipal dispatch or calibrated flood-depth forecasting, the following empirical validation pipeline is required:
          </p>
          <ol className="space-y-2.5 text-xs text-[#334155] dark:text-slate-300 list-decimal list-inside leading-relaxed">
            <li>
              <strong className="text-[#0F172A] dark:text-slate-100">Ward Waterlogging Ground Truth:</strong> Pair historical 24h ERA5 &amp; IMD AWS rainfall with dated municipal flood complaint registers (e.g., BMC 1916, GCC 1913, BBMP 1533 logs) across at least 3 monsoon seasons.
            </li>
            <li>
              <strong className="text-[#0F172A] dark:text-slate-100">Temporal Out-of-Sample Split:</strong> Train/calibrate weight thresholds on 2020–2023 monsoon events and hold out 2024+ events for strict out-of-sample Precision, Recall, and F1 scoring.
            </li>
            <li>
              <strong className="text-[#0F172A] dark:text-slate-100">Tidal &amp; Stormwater SCADA Coupling:</strong> For coastal basins (Mumbai, Chennai, Kolkata), incorporate high-tide lock windows and pumping station flow rates to quantify drainage backpressure MAE/RMSE.
            </li>
          </ol>
        </div>
      </section>

      {/* Interactive Hydrological Sensitivity Explorer */}
      <ScrollReveal delayMs={60}>
        <SpotlightCard
          tactile={false}
          className="rounded-2xl glass-panel p-5 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                Interactive Heuristic Weight &amp; Sensitivity Explorer
              </h2>
              <p className="text-xs text-[#475569] dark:text-slate-400">
                Test how rainfall intensity, 24h accumulation, soil saturation, and city drainage capacity affect the deterministic 0–100 index.
              </p>
            </div>
            <button
              type="button"
              onClick={resetToLive}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer self-start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Sync to Live Readings</span>
            </button>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Controls */}
          <div className="lg:col-span-5 space-y-4">
            <div>
              <label htmlFor="sim-city-select" className="block text-xs font-medium text-[#334155] dark:text-slate-300 mb-1.5">
                Reference City Profile (Drainage Design Cap: {simCity.drainageDesignMmHr} mm/hr · Elevation: {simCity.elevationBaselineM} m)
              </label>
              <select
                id="sim-city-select"
                value={simCityId}
                onChange={(e) => setSimCityId(e.target.value as CityId)}
                className="w-full rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0284C7] dark:focus:border-cyan-500"
              >
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.drainageDesignMmHr} mm/hr design · {c.elevationBaselineM}m ASL)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="sim-rain" className="text-[#334155] dark:text-slate-300 font-medium">
                  Rainfall Intensity (30% weight)
                </label>
                <span className="font-mono font-semibold text-[#0284C7] dark:text-cyan-300">{simRainMmHr} mm/hr</span>
              </div>
              <input
                id="sim-rain"
                type="range"
                min={0}
                max={100}
                value={simRainMmHr}
                onChange={(e) => setSimRainMmHr(Number(e.target.value))}
                className="w-full accent-[#0284C7] cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="sim-acc" className="text-[#334155] dark:text-slate-300 font-medium">
                  24h Accumulated Rain (25% weight)
                </label>
                <span className="font-mono font-semibold text-[#0284C7] dark:text-cyan-300">{simAcc24Mm} mm</span>
              </div>
              <input
                id="sim-acc"
                type="range"
                min={0}
                max={260}
                value={simAcc24Mm}
                onChange={(e) => setSimAcc24Mm(Number(e.target.value))}
                className="w-full accent-[#0284C7] cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="sim-soil" className="text-[#334155] dark:text-slate-300 font-medium">
                  Soil Moisture Saturation (20% weight)
                </label>
                <span className="font-mono font-semibold text-[#0284C7] dark:text-cyan-300">{simSoilPct}%</span>
              </div>
              <input
                id="sim-soil"
                type="range"
                min={5}
                max={100}
                value={simSoilPct}
                onChange={(e) => setSimSoilPct(Number(e.target.value))}
                className="w-full accent-[#0284C7] cursor-pointer"
              />
            </div>

            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
              <div>
                <span className="text-xs text-[#475569] dark:text-slate-400 block">Simulated Index Output</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <AnimatedNumber
                    value={simulated.assessment.currentScore}
                    durationMs={280}
                    className={`text-3xl font-mono font-bold ${simScoreStyle.text}`}
                  />
                  <span className="text-xs font-mono text-[#64748B] dark:text-slate-400">/ 100</span>
                </div>
                <span className="text-[11px] text-[#64748B] dark:text-slate-500 font-mono">
                  Est. Drainage Capacity: {simulated.drainageCapacityPct ?? '—'}%
                </span>
              </div>
              <RiskStatusIndicator level={simulated.assessment.category} />
            </div>
          </div>

          {/* Factor Contribution Chart */}
          <div className="lg:col-span-7 space-y-2">
            <h3 className="text-xs font-semibold text-[#334155] dark:text-slate-300">
              Factor Sub-Scores (0–100 Normalized Intensity)
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={simulated.assessment.contributingFactors}
                  layout="vertical"
                  margin={{ top: 6, right: 20, left: 10, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke={chart.axisStroke} tick={{ fill: chart.tickFill, fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={175}
                    stroke={chart.axisStroke}
                    tick={{ fill: chart.tickLabelFill, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={chart.tooltipStyle}
                    cursor={{ fill: theme === 'dark' ? 'rgba(34,211,238,0.08)' : 'rgba(2,132,199,0.06)' }}
                  />
                  <Bar dataKey="normalizedScore" name="Factor Score (/100)" radius={[0, 4, 4, 0]}>
                    {simulated.assessment.contributingFactors.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={
                          entry.normalizedScore >= 75
                            ? '#DC2626'
                            : entry.normalizedScore >= 50
                            ? '#EA580C'
                            : entry.normalizedScore >= 25
                            ? '#D97706'
                            : '#059669'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        </SpotlightCard>
      </ScrollReveal>
    </div>
  );
};
