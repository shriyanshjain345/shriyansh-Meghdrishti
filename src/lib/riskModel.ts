import type {
  CityConfig,
  ContributingFactor,
  FloodRiskAssessment,
  HourlyPoint,
  MonitoringZoneDemo,
  RiskLevel,
  SixHourRiskStep,
} from '../types/flood.ts';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function classifyRisk(score: number): RiskLevel {
  if (score >= 75) return 'SEVERE';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MODERATE';
  return 'LOW';
}

export interface RiskComputationInput {
  city: CityConfig;
  rainfallMmHr: number | null;
  accumulated24hMm: number | null;
  soilMoisturePct: number | null;
  elevationM: number | null;
  hourlyForecast: HourlyPoint[];
  weatherSourceLabel: string;
  soilSourceLabel: string;
  elevationSourceLabel: string;
}

export function computeDrainageCapacityPct(
  city: CityConfig,
  rainfallMmHr: number | null,
  accumulated24hMm: number | null,
  soilMoisturePct: number | null
): number | null {
  if (rainfallMmHr === null && accumulated24hMm === null) {
    return null;
  }
  const rainRate = rainfallMmHr ?? 0;
  const acc24 = accumulated24hMm ?? 0;
  const soil = soilMoisturePct ?? 40;

  const rateLoad = (rainRate / Math.max(15, city.drainageDesignMmHr)) * 55;
  const cumulativeLoad = (acc24 / Math.max(40, city.drainageDesignMmHr * 3)) * 30;
  const soilRunoffAmplifier = soil > 60 ? ((soil - 60) / 40) * 15 : 0;

  const stress = clamp(rateLoad + cumulativeLoad + soilRunoffAmplifier, 2, 96);
  return Math.round(100 - stress);
}

export function computeFloodRisk(input: RiskComputationInput): {
  drainageCapacityPct: number | null;
  assessment: FloodRiskAssessment;
} {
  const {
    city,
    rainfallMmHr,
    accumulated24hMm,
    soilMoisturePct,
    elevationM,
    hourlyForecast,
    weatherSourceLabel,
    soilSourceLabel,
    elevationSourceLabel,
  } = input;

  const drainageCapacityPct = computeDrainageCapacityPct(
    city,
    rainfallMmHr,
    accumulated24hMm,
    soilMoisturePct
  );

  const effectiveRain = rainfallMmHr ?? 0;
  const effectiveAcc24 = accumulated24hMm ?? 0;
  const effectiveSoil = soilMoisturePct ?? 35;
  const effectiveDrainage = drainageCapacityPct ?? 85;
  const effectiveElev = elevationM ?? city.elevationBaselineM;

  // 1. Rainfall Intensity (30%)
  const rainIntensityScore = clamp(
    (effectiveRain / Math.max(20, city.drainageDesignMmHr)) * 100,
    0,
    100
  );

  // 2. 24h Accumulated Rainfall (25%)
  const acc24Score = clamp(
    (effectiveAcc24 / Math.max(50, city.drainageDesignMmHr * 2.5)) * 100,
    0,
    100
  );

  // 3. Soil Moisture Saturation (20%)
  const soilScore = clamp(effectiveSoil, 0, 100);

  // 4. Drainage Stress (15%)
  const drainageStressScore = clamp(100 - effectiveDrainage, 0, 100);

  // 5. Terrain & Low Elevation Exposure (10%)
  // Low coastal cities (<15m) have higher hydrostatic retention than plateau cities (>400m)
  const elevationFactor =
    effectiveElev <= 15
      ? 80
      : effectiveElev <= 60
      ? 60
      : effectiveElev <= 250
      ? 45
      : 28;

  const currentScore = Math.round(
    clamp(
      rainIntensityScore * 0.3 +
        acc24Score * 0.25 +
        soilScore * 0.2 +
        drainageStressScore * 0.15 +
        elevationFactor * 0.1,
      0,
      100
    )
  );

  const contributingFactors: ContributingFactor[] = [
    {
      id: 'rain_intensity',
      label: 'Current Rainfall Intensity',
      weightPct: 30,
      normalizedScore: Math.round(rainIntensityScore),
      rawReading:
        rainfallMmHr !== null
          ? `${rainfallMmHr.toFixed(1)} mm/hr (Design cap ${city.drainageDesignMmHr} mm/hr)`
          : 'Unavailable',
      dataKind: 'observation',
      source: weatherSourceLabel,
    },
    {
      id: 'accumulated_24h',
      label: '24h Accumulated Rainfall',
      weightPct: 25,
      normalizedScore: Math.round(acc24Score),
      rawReading:
        accumulated24hMm !== null
          ? `${accumulated24hMm.toFixed(1)} mm / 24h`
          : 'Unavailable',
      dataKind: 'estimate',
      source: weatherSourceLabel,
    },
    {
      id: 'soil_moisture',
      label: 'Topsoil Moisture Saturation (0–7cm)',
      weightPct: 20,
      normalizedScore: Math.round(soilScore),
      rawReading:
        soilMoisturePct !== null ? `${Math.round(soilMoisturePct)}%` : 'Unavailable',
      dataKind: 'estimate',
      source: soilSourceLabel,
    },
    {
      id: 'drainage_stress',
      label: 'Municipal Drainage Stress',
      weightPct: 15,
      normalizedScore: Math.round(drainageStressScore),
      rawReading:
        drainageCapacityPct !== null
          ? `${drainageCapacityPct}% capacity remaining`
          : 'Unavailable',
      dataKind: 'estimate',
      source: `Modelled vs. ${city.municipalAuthority}`,
    },
    {
      id: 'terrain_elevation',
      label: 'Elevation & Basin Drainage Gradient',
      weightPct: 10,
      normalizedScore: Math.round(elevationFactor),
      rawReading: `${Math.round(effectiveElev)} m ASL`,
      dataKind: elevationM !== null ? 'observation' : 'estimate',
      source: elevationSourceLabel,
    },
  ];

  // Horizon Projections (6h, 12h, 24h) strictly driven by hourly forecast QPF
  const projectScoreAtHorizon = (hoursAhead: number): number => {
    if (!hourlyForecast.length) return currentScore;
    const slice = hourlyForecast.slice(0, hoursAhead);
    const maxHrRain = slice.reduce(
      (max, h) => Math.max(max, h.rainMm ?? 0),
      0
    );
    const avgProb =
      slice.reduce((sum, h) => sum + (h.rainProbPct ?? 0), 0) /
      Math.max(1, slice.length);
    const forecastCumRain = slice.reduce((sum, h) => sum + (h.rainMm ?? 0), 0);

    const projRainScore = clamp(
      (maxHrRain / Math.max(20, city.drainageDesignMmHr)) * 100,
      0,
      100
    );
    const projCumScore = clamp(
      ((effectiveAcc24 * 0.5 + forecastCumRain) /
        Math.max(50, city.drainageDesignMmHr * 2.5)) *
        100,
      0,
      100
    );
    const projSoil = clamp(
      effectiveSoil + Math.min(20, forecastCumRain * 0.25),
      0,
      100
    );
    const projDrainageStress = clamp(
      drainageStressScore + Math.min(25, forecastCumRain * 0.3) - (forecastCumRain < 2 ? 8 : 0),
      0,
      100
    );

    const raw =
      projRainScore * 0.3 +
      projCumScore * 0.25 +
      projSoil * 0.2 +
      projDrainageStress * 0.15 +
      elevationFactor * 0.1;

    // Slight probability damping if precipitation probability is very low
    const damped = maxHrRain > 0 ? raw : Math.min(raw, currentScore * 0.85 + avgProb * 0.12);
    return Math.round(clamp(damped, 0, 100));
  };

  const sixHourScore = projectScoreAtHorizon(6);
  const twelveHourScore = projectScoreAtHorizon(12);
  const twentyFourHourScore = projectScoreAtHorizon(24);

  const sixHourTimeline: SixHourRiskStep[] = Array.from({ length: 6 }, (_, i) => {
    const pt = hourlyForecast[i];
    const stepScore = projectScoreAtHorizon(i + 1);
    return {
      hourOffset: `+${i + 1}h`,
      timeLabel: pt?.hourLabel ?? `+${i + 1}h`,
      riskScore: stepScore,
      category: classifyRisk(stepScore),
      expectedRainMm: pt?.rainMm ?? null,
    };
  });

  const missingCount = [rainfallMmHr, soilMoisturePct, elevationM].filter(
    (v) => v === null
  ).length;
  const confidenceLabel: 'High' | 'Moderate' | 'Low' =
    missingCount === 0 && hourlyForecast.length >= 12
      ? 'High'
      : missingCount <= 1
      ? 'Moderate'
      : 'Low';

  const uncertaintyPlusMinus =
    confidenceLabel === 'High' ? 9 : confidenceLabel === 'Moderate' ? 14 : 22;

  const trend: 'rising' | 'steady' | 'falling' =
    sixHourScore - currentScore >= 5
      ? 'rising'
      : currentScore - sixHourScore >= 5
      ? 'falling'
      : 'steady';

  return {
    drainageCapacityPct,
    assessment: {
      currentScore,
      sixHourScore,
      twelveHourScore,
      twentyFourHourScore,
      category: classifyRisk(currentScore),
      confidenceLabel,
      uncertaintyPlusMinus,
      trend,
      sixHourTimeline,
      contributingFactors,
      methodologyNote:
        'Deterministic weighted index (30% rain intensity, 25% 24h accumulation, 20% topsoil moisture estimate, 15% modelled drainage stress, 10% elevation baseline). Not a calibrated municipal hydrodynamic simulation.',
    },
  };
}

export function computeZoneRisk(
  cityRiskScore: number,
  zone: MonitoringZoneDemo,
  rainfallMmHr: number | null,
  soilMoisturePct: number | null
): {
  score: number;
  category: RiskLevel;
  localSoilPct: number | null;
  localDrainagePct: number | null;
} {
  const adjusted = Math.round(
    clamp(cityRiskScore * zone.drainageSensitivity, 0, 100)
  );
  const localSoilPct =
    soilMoisturePct !== null
      ? Math.round(clamp(soilMoisturePct + zone.baseSoilOffsetPct, 0, 100))
      : null;
  const rain = rainfallMmHr ?? 0;
  const localDrainagePct = Math.round(
    clamp(100 - (adjusted * 0.72 + rain * 0.45), 6, 98)
  );
  return {
    score: adjusted,
    category: classifyRisk(adjusted),
    localSoilPct,
    localDrainagePct,
  };
}
