import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  CloudRain,
  History,
  Info,
  RefreshCw,
  ShieldCheck,
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
import { HISTORICAL_FLOOD_EVENTS } from '../data/cities.ts';
import type {
  AiRiskAssessmentPayload,
  CityTelemetryResponse,
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
import { classifyRisk } from '../lib/riskModel.ts';
import {
  AnimatedNumber,
  ScrollReveal,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface AiPredictionsPageProps {
  telemetry: CityTelemetryResponse | null;
  aiAssessment: AiRiskAssessmentPayload | null;
  aiLoading: boolean;
  aiError: string | null;
  onGenerateAi: (force?: boolean) => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

type TimelineSlotId = 'now' | '+1h' | '+2h' | '+3h' | '+4h' | '+5h' | '+6h' | '+12h' | '+24h';

export const AiPredictionsPage: React.FC<AiPredictionsPageProps> = ({
  telemetry,
  aiAssessment,
  aiLoading,
  aiError,
  onGenerateAi,
  units,
  theme,
}) => {
  const chart = getChartTheme(theme);
  const [selectedSlot, setSelectedSlot] = useState<TimelineSlotId>('now');

  const cityEvents = telemetry
    ? HISTORICAL_FLOOD_EVENTS.filter((e) => e.cityId === telemetry.city.id)
    : [];

  // Interactive clickable forecast timeline slots (Now, +1h..+6h, +12h, +24h)
  const timelineSlots = useMemo(() => {
    if (!telemetry) return [];
    const hourly = telemetry.hourlyForecast ?? [];
    const curScore = telemetry.risk.currentScore;
    const h6Score = telemetry.risk.sixHourScore;
    const h12Score = telemetry.risk.twelveHourScore;
    const h24Score = telemetry.risk.twentyFourHourScore;

    const slots: Array<{
      id: TimelineSlotId;
      label: string;
      timeIst: string;
      kind: 'Observation + Estimate' | 'Forecast Projection';
      score: number;
      rainMm: number | null;
      rainProbPct: number | null;
      tempC: number | null;
      note: string;
    }> = [
      {
        id: 'now',
        label: 'Now',
        timeIst: 'Current',
        kind: 'Observation + Estimate',
        score: curScore,
        rainMm: telemetry.current.rainfallMmHr,
        rainProbPct: hourly[0]?.rainProbPct ?? null,
        tempC: telemetry.current.temperatureC,
        note:
          aiAssessment?.plainLanguageSummary ??
          'Current deterministic score derived from live rainfall, 24h accumulation, soil saturation, and municipal drainage headroom.',
      },
    ];

    const hourOffsets: Array<{ id: TimelineSlotId; offset: number }> = [
      { id: '+1h', offset: 1 },
      { id: '+2h', offset: 2 },
      { id: '+3h', offset: 3 },
      { id: '+4h', offset: 4 },
      { id: '+5h', offset: 5 },
      { id: '+6h', offset: 6 },
    ];

    for (const h of hourOffsets) {
      const hr = hourly[h.offset] ?? hourly[h.offset - 1] ?? null;
      const rainImpact = Math.min(28, Math.round((hr?.rainMm ?? 0) * 1.4));
      const interpBase = Math.round(curScore + ((h6Score - curScore) * h.offset) / 6);
      const slotScore =
        h.offset === 6 ? h6Score : Math.max(0, Math.min(100, Math.round(interpBase * 0.8 + rainImpact * 0.2)));
      slots.push({
        id: h.id,
        label: h.id,
        timeIst: hr?.hourLabel ?? h.id,
        kind: 'Forecast Projection',
        score: slotScore,
        rainMm: hr?.rainMm ?? null,
        rainProbPct: hr?.rainProbPct ?? null,
        tempC: hr?.tempC ?? null,
        note:
          h.offset === 6
            ? aiAssessment?.horizonForecasts.sixHour ??
              '6-hour projection blends immediate hourly rainfall forecast with antecedent soil saturation.'
            : `Hourly forecast slot (${hr?.hourLabel ?? h.id}): ${
                hr?.conditionText ?? 'Sky outlook'
              }, ${hr?.rainMm !== null && hr?.rainMm !== undefined ? `${hr.rainMm} mm expected rain` : 'rainfall unavailable'}.`,
      });
    }

    const h12 = hourly[12] ?? null;
    slots.push({
      id: '+12h',
      label: '+12h',
      timeIst: h12?.hourLabel ?? '+12h',
      kind: 'Forecast Projection',
      score: h12Score,
      rainMm: h12?.rainMm ?? null,
      rainProbPct: h12?.rainProbPct ?? null,
      tempC: h12?.tempC ?? null,
      note:
        aiAssessment?.horizonForecasts.twelveHour ??
        '12-hour outlook reflecting cumulative forecast rainfall and basin drainage recovery.',
    });

    const h24 = hourly[23] ?? null;
    slots.push({
      id: '+24h',
      label: '+24h',
      timeIst: h24?.hourLabel ?? '+24h',
      kind: 'Forecast Projection',
      score: h24Score,
      rainMm: h24?.rainMm ?? null,
      rainProbPct: h24?.rainProbPct ?? null,
      tempC: h24?.tempC ?? null,
      note:
        aiAssessment?.horizonForecasts.twentyFourHour ??
        '24-hour multi-factor hydrological projection across the city drainage basin.',
    });

    return slots;
  }, [telemetry, aiAssessment]);

  const activeSlot = timelineSlots.find((s) => s.id === selectedSlot) ?? timelineSlots[0] ?? null;
  const activeSlotCat = activeSlot ? classifyRisk(activeSlot.score) : 'LOW';
  const activeSlotStyle = RISK_STYLES[activeSlotCat];

  const horizonCards = telemetry
    ? [
        {
          slotId: 'now' as TimelineSlotId,
          label: 'Current Risk Score',
          kind: 'Observation + Estimate',
          score: telemetry.risk.currentScore,
          note: aiAssessment?.plainLanguageSummary,
        },
        {
          slotId: '+6h' as TimelineSlotId,
          label: '6-Hour Prediction',
          kind: 'Forecast Projection',
          score: telemetry.risk.sixHourScore,
          note: aiAssessment?.horizonForecasts.sixHour,
        },
        {
          slotId: '+12h' as TimelineSlotId,
          label: '12-Hour Prediction',
          kind: 'Forecast Projection',
          score: telemetry.risk.twelveHourScore,
          note: aiAssessment?.horizonForecasts.twelveHour,
        },
        {
          slotId: '+24h' as TimelineSlotId,
          label: '24-Hour Prediction',
          kind: 'Forecast Projection',
          score: telemetry.risk.twentyFourHourScore,
          note: aiAssessment?.horizonForecasts.twentyFourHour,
        },
      ]
    : [];

  const factorChartData = (telemetry?.risk.contributingFactors ?? []).map((f) => ({
    name: f.label.replace('Current ', '').replace('Municipal ', ''),
    score: f.normalizedScore,
    weight: f.weightPct,
    rawReading: f.rawReading,
    dataKind: f.dataKind,
  }));

  const rainNow = formatRain(telemetry?.current.rainfallMmHr, units, true);
  const rain24 = formatRain(telemetry?.current.accumulated24hMm, units, false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              AI Flood Risk Predictions &amp; Explainability
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-1">
              Interactive multi-horizon hydrological timeline paired with Gemini structured interpretation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onGenerateAi(true)}
            disabled={aiLoading || !telemetry}
            className="tactile-btn inline-flex items-center gap-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white cursor-pointer self-start sm:self-auto shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
            <span>{aiAssessment ? 'Regenerate AI Assessment' : 'Run AI Assessment'}</span>
          </button>
        </div>
      </ScrollReveal>

      {/* Methodology Transparency Notice */}
      <div className="rounded-2xl glass-panel p-4 flex items-start gap-3 text-xs text-slate-700 dark:text-slate-300">
        <Info className="w-4 h-4 text-[#0284C7] dark:text-cyan-400 shrink-0 mt-0.5" />
        <p>
          <strong className="text-slate-900 dark:text-slate-100">Model Transparency:</strong> Scores are computed deterministically by MEGHDRISHTI’s weighted hydrological formula using real observations, weather forecasts, and terrain baselines.{' '}
          <strong className="text-slate-900 dark:text-slate-100">Gemini does not invent numerical predictions</strong> — it explains the computed telemetry and clearly separates <em>Observed Data</em>, <em>Weather Forecasts</em>, and <em>Model Estimates</em>.
        </p>
      </div>

      {/* Interactive Forecast Timeline Selector */}
      {telemetry && timelineSlots.length > 0 && (
        <section className="rounded-2xl glass-panel p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                Interactive Forecast Timeline Selector
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Select any horizon from Now through +24h to inspect projected risk score, uncertainty range, and expected rainfall.
              </p>
            </div>
            {activeSlot && <RiskStatusIndicator level={activeSlotCat} />}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {timelineSlots.map((slot) => {
              const selected = slot.id === selectedSlot;
              const cat = classifyRisk(slot.score);
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => setSelectedSlot(slot.id)}
                  className={`shrink-0 rounded-xl border px-3.5 py-2.5 text-left transition-all cursor-pointer min-w-[84px] ${
                    selected
                      ? 'bg-[#E0F2FE] dark:bg-cyan-500/20 border-sky-400 dark:border-cyan-400/70 shadow-sm'
                      : 'bg-slate-50/80 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-cyan-500/40'
                  }`}
                >
                  <div className="text-[11px] font-mono font-bold text-[#0284C7] dark:text-cyan-300">
                    {slot.label}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">{slot.timeIst}</div>
                  <div className="mt-1 flex items-baseline gap-1 font-mono">
                    <span
                      className="text-base font-bold tabular-nums"
                      style={{ color: RISK_STYLES[cat].hex }}
                    >
                      {slot.score}
                    </span>
                    <span className="text-[10px] text-slate-500">/100</span>
                  </div>
                </button>
              );
            })}
          </div>

          {activeSlot && (
            <div className="rounded-xl bg-slate-50/80 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-4 space-y-1">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                  {activeSlot.label} ({activeSlot.timeIst}) · {activeSlot.kind}
                </div>
                <div className="flex items-baseline gap-2">
                  <AnimatedNumber
                    value={activeSlot.score}
                    className="text-4xl font-mono font-bold tabular-nums text-[#0F172A] dark:text-slate-100"
                  />
                  <span className="text-xs font-mono text-slate-500">
                    / 100 (±{telemetry.risk.uncertaintyPlusMinus} pts)
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(5, activeSlot.score)}%`,
                      backgroundColor: activeSlotStyle.hex,
                    }}
                  />
                </div>
              </div>

              <div className="lg:col-span-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500 flex items-center gap-1">
                    <CloudRain className="w-3 h-3 text-cyan-400" />
                    Rain
                  </div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeSlot.rainMm !== null ? `${activeSlot.rainMm.toFixed(1)} mm` : '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500">Rain Prob</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeSlot.rainProbPct !== null ? `${activeSlot.rainProbPct}%` : '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-2.5">
                  <div className="text-[10px] text-slate-500">Temp</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatTemperature(activeSlot.tempC, units)}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-4 text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                {activeSlot.note}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 4 Horizon Score Cards */}
      {telemetry && (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {horizonCards.map((card, idx) => {
            const cat = classifyRisk(card.score);
            const st = RISK_STYLES[cat];
            const isActive = selectedSlot === card.slotId;
            return (
              <ScrollReveal key={card.label} delayMs={idx * 60}>
                <SpotlightCard
                  onClick={() => setSelectedSlot(card.slotId)}
                  className={`h-full rounded-2xl glass-panel p-4 flex flex-col justify-between gap-3 cursor-pointer ${
                    isActive ? 'ring-2 ring-[#0284C7]/60 dark:ring-cyan-400/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#475569] dark:text-slate-300">
                      {card.label}
                    </span>
                    <RiskStatusIndicator level={cat} />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <div className="font-mono tabular-nums">
                      <AnimatedNumber
                        value={card.score}
                        className="text-3xl font-bold text-[#0F172A] dark:text-slate-100"
                      />
                      <span className="text-xs text-[#64748B] dark:text-slate-500"> / 100</span>
                    </div>
                    <span className="text-[11px] font-mono text-[#64748B] dark:text-slate-400">
                      ±{telemetry.risk.uncertaintyPlusMinus} pts
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{ width: `${Math.max(4, card.score)}%`, backgroundColor: st.hex }}
                    />
                  </div>
                  {card.note && (
                    <p className="text-xs text-[#475569] dark:text-slate-400 leading-relaxed">
                      {card.note}
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-[#64748B] dark:text-slate-500">
                    Type: {card.kind} · Confidence: {telemetry.risk.confidenceLabel}
                  </div>
                </SpotlightCard>
              </ScrollReveal>
            );
          })}
        </section>
      )}

      {/* Pipeline Variables & Factor Contributions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-2xl glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
              Contributing Risk Factors (0–100 Normalized)
            </h2>
            <span className="text-xs font-mono text-[#64748B] dark:text-slate-400">Weighted Sum</span>
          </div>

          <div className="h-60 w-full">
            {factorChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={factorChartData}
                  layout="vertical"
                  margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.gridStroke} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    stroke={chart.axisStroke}
                    tick={{ fill: chart.tickFill, fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={135}
                    stroke={chart.axisStroke}
                    tick={{ fill: chart.tickLabelFill, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={chart.tooltipStyle}
                    cursor={{
                      fill: theme === 'dark' ? 'rgba(34,211,238,0.08)' : 'rgba(2,132,199,0.06)',
                    }}
                  />
                  <Bar dataKey="score" name="Factor Stress (0-100)" radius={[0, 4, 4, 0]}>
                    {factorChartData.map((entry, idx) => (
                      <Cell key={idx} fill={RISK_STYLES[classifyRisk(entry.score)].hex} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Telemetry not loaded yet.
              </div>
            )}
          </div>

          {/* Explicit 7-Variable Table */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <h3 className="text-xs font-semibold text-[#0F172A] dark:text-slate-300">
              Pipeline Input Inventory
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                <span className="text-[#475569] dark:text-slate-400 block">
                  1. Rainfall Intensity (Observation)
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                  {rainNow.value === 'Unavailable'
                    ? 'Unavailable'
                    : `${rainNow.value} ${rainNow.unit}`}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                <span className="text-[#475569] dark:text-slate-400 block">
                  2. 24h Accumulation (Estimate)
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                  {rain24.value === 'Unavailable'
                    ? 'Unavailable'
                    : `${rain24.value} ${rain24.unit}`}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                <span className="text-[#475569] dark:text-slate-400 block">
                  3. Soil Moisture (Hydrology Estimate)
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                  {telemetry?.current.soilMoisturePct !== null &&
                  telemetry?.current.soilMoisturePct !== undefined
                    ? `${telemetry.current.soilMoisturePct}%`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                <span className="text-[#475569] dark:text-slate-400 block">
                  4. Drainage Capacity (Modelled)
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                  {telemetry?.current.drainageCapacityPct !== null &&
                  telemetry?.current.drainageCapacityPct !== undefined
                    ? `${telemetry.current.drainageCapacityPct}% headroom`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                <span className="text-[#475569] dark:text-slate-400 block">
                  5. Elevation &amp; Terrain
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                  {telemetry?.current.elevationM !== null &&
                  telemetry?.current.elevationM !== undefined
                    ? `${Math.round(telemetry.current.elevationM)} m ASL`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-2.5">
                <span className="text-[#475569] dark:text-slate-400 block">
                  6. Historical Events &amp; Waterlogging
                </span>
                <span className="font-mono font-semibold text-[#0F172A] dark:text-slate-100">
                  {cityEvents.length} documented · {telemetry?.city.zones.length ?? 0} demo basins
                </span>
              </div>
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-slate-500">
              7. Crowdsourced waterlogging reports: Live municipal civic-complaint feeds are not connected in this release; sensitivity relies on documented historical flood localities.
            </p>
          </div>
        </div>

        {/* Gemini Structured Assessment Panel */}
        <div className="lg:col-span-6 rounded-2xl glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
              Gemini Hydrological Interpretation
            </h2>
            {aiAssessment && (
              <span className="text-[11px] font-mono text-[#0284C7] dark:text-cyan-400">
                {aiAssessment.model} · {formatTimestampIST(aiAssessment.generatedAt)}
              </span>
            )}
          </div>

          {aiLoading ? (
            <div className="space-y-3 py-4">
              <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-24 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            </div>
          ) : aiError ? (
            <div className="rounded-lg bg-[#FFFBEB] dark:bg-amber-950/30 border border-[#FDE68A] dark:border-amber-500/35 p-4 text-xs text-[#B45309] dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
                <span>Gemini AI Assessment Unavailable</span>
              </div>
              <p>{aiError}</p>
              <button
                type="button"
                onClick={() => onGenerateAi(true)}
                className="rounded-md bg-amber-600 text-white dark:bg-amber-500/20 px-3 py-1.5 text-xs font-medium dark:text-amber-100 hover:bg-amber-700 dark:hover:bg-amber-500/30 cursor-pointer"
              >
                Retry Assessment
              </button>
            </div>
          ) : aiAssessment ? (
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-[#0284C7] dark:text-cyan-300">
                  Technical Interpretation
                </h3>
                <p className="text-[#475569] dark:text-slate-300 leading-relaxed">
                  {aiAssessment.technicalInterpretation}
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  Key Risk Drivers
                </h3>
                <ul className="space-y-1 text-[#475569] dark:text-slate-300 text-xs">
                  {aiAssessment.keyDrivers.map((k, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400 shrink-0 mt-0.5" />
                      <span>{k}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-[#0F172A] dark:text-slate-200">
                  Actionable Preparedness
                </h3>
                <ul className="space-y-1 text-[#475569] dark:text-slate-300 text-xs">
                  {aiAssessment.preparednessActions.map((a, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#047857] dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-900/75 border border-slate-200 dark:border-slate-800 p-3 text-xs text-[#475569] dark:text-slate-400">
                <strong className="text-[#0F172A] dark:text-slate-300">
                  Uncertainty &amp; Limitations:{' '}
                </strong>
                {aiAssessment.uncertaintyAndLimitations}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#64748B] dark:text-slate-400 py-8 text-center">
              Click “Run AI Assessment” to generate structured Gemini hydrological reasoning for{' '}
              {telemetry?.city.name ?? 'the selected city'}.
            </p>
          )}

          {cityEvents.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
              <h3 className="text-xs font-semibold text-[#0F172A] dark:text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                Historical Reference Incidents ({telemetry?.city.name})
              </h3>
              {cityEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="text-xs text-[#475569] dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-2.5 border border-slate-200 dark:border-slate-800/70"
                >
                  <span className="font-semibold text-[#0F172A] dark:text-slate-200">
                    {ev.dateLabel}
                  </span>
                  {ev.recordedPeakRainMm24h !== null && (
                    <span className="font-mono text-[#0284C7] dark:text-cyan-300">
                      {' '}
                      · {ev.recordedPeakRainMm24h} mm/24h
                    </span>
                  )}
                  <p className="mt-0.5 text-[11px]">{ev.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
