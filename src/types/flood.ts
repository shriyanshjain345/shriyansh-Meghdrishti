export type CityId =
  | 'jaipur'
  | 'mumbai'
  | 'delhi'
  | 'chennai'
  | 'bengaluru'
  | 'kolkata'
  | 'hyderabad'
  | 'pune'
  | 'ahmedabad';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

export type NavPageId =
  | 'overview'
  | 'live'
  | 'map'
  | 'predictions'
  | 'weather'
  | 'air-quality'
  | 'comparison'
  | 'historical'
  | 'relief'
  | 'guide'
  | 'performance'
  | 'env-vision'
  | 'about';

export type UnitsSystem = 'METRIC' | 'IMPERIAL';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface MonitoringZoneDemo {
  id: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
  elevationM: number;
  drainageSensitivity: number; // 0.8 (resilient) to 1.45 (low-lying bottleneck)
  baseSoilOffsetPct: number;
  description: string;
  polygon: LatLngPoint[];
  dataLabel: 'Demonstration Basin Polygon (Not an Official Flood Boundary)';
}

export interface CityConfig {
  id: CityId;
  name: string;
  state: string;
  lat: number;
  lng: number;
  defaultZoom: number;
  elevationBaselineM: number;
  drainageDesignMmHr: number;
  annualMonsoonNormalMm: number;
  municipalAuthority: string;
  terrainSummary: string;
  zones: MonitoringZoneDemo[];
}

export interface ApiChannelStatus {
  status: 'ok' | 'degraded' | 'unavailable' | 'quota_exceeded';
  provider: string;
  message?: string;
  lastChecked: string;
}

export interface HourlyPoint {
  timeIso: string;
  hourLabel: string;
  rainMm: number | null;
  rainProbPct: number | null;
  tempC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  pressureMb: number | null;
  conditionText: string | null;
  dataKind: 'forecast' | 'observation';
  source: string;
}

export interface DailyPoint {
  dateIso: string;
  dayLabel: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainSumMm: number | null;
  rainProbPct: number | null;
  windMaxKmh: number | null;
  conditionText: string | null;
  source: string;
}

export interface PublicWeatherAlert {
  alertId: string;
  title: string;
  eventType: string;
  areaName: string;
  severity: string;
  certainty: string;
  urgency: string;
  description: string;
  instructions: string[];
  startTime?: string;
  expirationTime?: string;
  dataSource: {
    publisher?: string;
    name: string;
    authorityUri: string;
  };
}

export interface ContributingFactor {
  id: string;
  label: string;
  weightPct: number;
  normalizedScore: number; // 0 to 100
  rawReading: string;
  dataKind: 'observation' | 'forecast' | 'estimate';
  source: string;
}

export interface SixHourRiskStep {
  hourOffset: string;
  timeLabel: string;
  riskScore: number;
  category: RiskLevel;
  expectedRainMm: number | null;
}

export interface FloodRiskAssessment {
  currentScore: number;
  sixHourScore: number;
  twelveHourScore: number;
  twentyFourHourScore: number;
  category: RiskLevel;
  confidenceLabel: 'High' | 'Moderate' | 'Low';
  uncertaintyPlusMinus: number;
  trend: 'rising' | 'steady' | 'falling';
  sixHourTimeline: SixHourRiskStep[];
  contributingFactors: ContributingFactor[];
  methodologyNote: string;
}

export interface CityTelemetryResponse {
  city: CityConfig;
  fetchedAt: string;
  cached: boolean;
  sources: {
    weather: ApiChannelStatus;
    soilMoisture: ApiChannelStatus;
    elevation: ApiChannelStatus;
    alerts: ApiChannelStatus;
  };
  current: {
    rainfallMmHr: number | null;
    accumulated24hMm: number | null;
    soilMoisturePct: number | null;
    drainageCapacityPct: number | null;
    elevationM: number | null;
    temperatureC: number | null;
    feelsLikeC: number | null;
    tempMaxC: number | null;
    tempMinC: number | null;
    humidityPct: number | null;
    windKmh: number | null;
    windGustKmh: number | null;
    windCardinal: string | null;
    pressureMb: number | null;
    cloudCoverPct: number | null;
    visibilityKm: number | null;
    uvIndex: number | null;
    dewPointC: number | null;
    isDaytime: boolean | null;
    conditionText: string | null;
    conditionType: string | null;
    trends: {
      rainfall: 'up' | 'down' | 'flat' | 'unavailable';
      soilMoisture: 'up' | 'down' | 'flat' | 'unavailable';
      drainage: 'up' | 'down' | 'flat' | 'unavailable';
      risk: 'up' | 'down' | 'flat' | 'unavailable';
    };
  };
  hourlyForecast: HourlyPoint[];
  dailyForecast: DailyPoint[];
  alerts: PublicWeatherAlert[];
  risk: FloodRiskAssessment;
}

export interface CityComparisonSummary {
  cityId: CityId;
  cityName: string;
  state: string;
  rainfallMmHr: number | null;
  accumulated24hMm: number | null;
  soilMoisturePct: number | null;
  drainageCapacityPct: number | null;
  floodRiskIndex: number | null;
  riskCategory: RiskLevel | 'UNAVAILABLE';
  temperatureC: number | null;
  tempMaxC?: number | null;
  tempMinC?: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  uvIndex?: number | null;
  conditionText: string | null;
  alertStatus: string;
  source: string;
  fetchedAt: string;
}

export interface AiRiskAssessmentPayload {
  cityId: CityId;
  cityName: string;
  generatedAt: string;
  model: string;
  plainLanguageSummary: string;
  technicalInterpretation: string;
  horizonForecasts: {
    sixHour: string;
    twelveHour: string;
    twentyFourHour: string;
  };
  keyDrivers: string[];
  preparednessActions: string[];
  uncertaintyAndLimitations: string;
  zoneExplanations?: Record<string, string>;
}

export type ReliefCategory =
  | 'hospital'
  | 'fire_station'
  | 'police'
  | 'shelter_civic';

export interface ReliefPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: ReliefCategory;
  primaryTypeLabel: string;
  phone: string | null;
  openNow: boolean | null;
  businessStatus: string | null;
  googleMapsUri: string;
  directionsUri: string;
}

export interface HistoricalDailyRecord {
  date: string;
  precipitationMm: number | null;
  rainMm: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
}

export interface HistoricalFloodEvent {
  id: string;
  cityId: CityId;
  cityName: string;
  dateLabel: string;
  year: number;
  recordedPeakRainMm24h: number | null;
  severity: RiskLevel;
  affectedLocalities: string[];
  summary: string;
  sourceCitation: string;
  recordStatus: 'Documented Reference Event' | 'Partial Gauge Record';
}

// --- AI Environmental Vision (Smart Air Quality Camera) ---

export type EnvVisionCondition =
  | 'clear'
  | 'hazy'
  | 'dusty'
  | 'smoke_visible'
  | 'foggy'
  | 'mixed'
  | 'unusable';

export type EnvVisionPollutionIndicatorLevel =
  | 'none_clear'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'
  | 'indeterminate';

export interface EnvVisionBoundingBox {
  ymin: number; // 0..1000 normalized
  xmin: number; // 0..1000 normalized
  ymax: number; // 0..1000 normalized
  xmax: number; // 0..1000 normalized
}

export interface EnvVisionDetectedIndicator {
  type:
    | 'smoke'
    | 'dust'
    | 'haze_smog'
    | 'fog_mist'
    | 'vehicle_exhaust'
    | 'industrial_plume'
    | 'open_burning'
    | 'construction_activity'
    | 'dense_traffic'
    | 'clear_sky'
    | 'other';
  name: string;
  detected: boolean;
  description: string;
  imageLocation: string;
  severity: 'none' | 'low' | 'moderate' | 'high' | 'very_high';
  confidence: number; // 0..1
  movementOrDispersion?: string | null;
  smokeAppearance?: string | null;
  boundingBox?: EnvVisionBoundingBox | null;
}

export interface EnvVisionPossibleSource {
  source: 'traffic' | 'construction' | 'industrial' | 'road_dust' | 'open_burning' | 'unknown';
  label: string;
  evidence: string;
  confidence: number; // 0..1
}

export interface EnvVisionAnalysisReport {
  visualCondition: EnvVisionCondition;
  visualConditionLabel: string;
  visualPollutionIndicator: EnvVisionPollutionIndicatorLevel;
  noClearPollutionIndicator: boolean;
  confidence: number; // 0..1
  sceneContext: string;
  imageQualityNote: string;
  detectedIndicators: EnvVisionDetectedIndicator[];
  visibility: {
    category: 'good' | 'moderate' | 'reduced' | 'poor' | 'indeterminate';
    distantObjectClarity: string;
    atmosphericObstruction: string;
    visibilityReduced: boolean;
    description: string;
  };
  possibleSources: EnvVisionPossibleSource[];
  limitations: string[];
  modelUsed: string;
  analyzedAt: string;
}

export interface PollutantMeasurement {
  code: 'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2';
  displayName: string;
  fullName: string;
  value: number | null;
  units: string | null;
  sources?: string | null;
  effects?: string | null;
}

export interface MeasuredAirQualityData {
  available: boolean;
  source: string;
  stationOrScope: string;
  measuredAt: string | null;
  aqi: number | null;
  aqiDisplay: string | null;
  aqiScale: string | null;
  regionStandard: string | null;
  aqiCategory: string | null;
  dominantPollutant: string | null;
  pollutants: PollutantMeasurement[];
  healthRecommendations?: {
    generalPopulation?: string;
    elderly?: string;
    lungDiseasePopulation?: string;
    heartDiseasePopulation?: string;
    athletes?: string;
    pregnantWomen?: string;
    children?: string;
  } | null;
  quotaExceeded?: boolean;
  errorMessage?: string | null;
}

export interface EnvVisionWeatherContext {
  available: boolean;
  temperatureC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
  windCardinal: string | null;
  recentRainMm: number | null;
  conditionText: string | null;
  source: string;
  dispersionNote: string;
}

export interface EnvVisionLocationContext {
  mode: 'gps' | 'city' | 'none';
  label: string;
  city?: string | null;
  locality?: string | null;
  lat?: number | null;
  lng?: number | null;
  permissionGranted: boolean;
}

export interface EnvVisionExternalContextResponse {
  locationLabel: string;
  resolvedCity: string | null;
  resolvedLocality: string | null;
  lat: number;
  lng: number;
  airQuality: MeasuredAirQualityData;
  weather: EnvVisionWeatherContext;
  fetchedAt: string;
}

export interface EnvVisionRecommendation {
  title: string;
  detail: string;
  basis: 'visual' | 'measured_aqi' | 'combined';
  priority: 'info' | 'caution' | 'advisory';
}

export interface EnvVisionHistoryRecord {
  id: string;
  createdAt: string;
  thumbnailDataUrl: string;
  locationLabel: string | null;
  locationMode: 'gps' | 'city' | 'none';
  analysis: EnvVisionAnalysisReport;
  airQuality: MeasuredAirQualityData | null;
  weather: EnvVisionWeatherContext | null;
  recommendations: EnvVisionRecommendation[];
}

// --- MEGHDRISHTI 2.0: Air Quality Intelligence, Weather Radar & AI Weather Brief ---

export interface AirQualityHistoryPoint {
  timeIso: string;
  hourLabel: string;
  aqi: number | null;
  pm25: number | null;
  pm10: number | null;
  category?: string | null;
}

export interface AirQualityIntelResponse {
  locationLabel: string;
  cityId: string | null;
  lat: number;
  lng: number;
  airQuality: MeasuredAirQualityData;
  weather: EnvVisionWeatherContext;
  history: AirQualityHistoryPoint[];
  historySource: string;
  fetchedAt: string;
}

export interface RadarFrameInfo {
  time: number;
  timeIso: string;
  labelIst: string;
  path: string;
  tileUrlTemplate: string;
  kind: 'past' | 'nowcast';
}

export interface RadarFramesResponse {
  available: boolean;
  host: string | null;
  frames: RadarFrameInfo[];
  generatedAt: number | null;
  attribution: string;
  reason?: string;
  fetchedAt: string;
}

export interface AiWeatherSummaryPayload {
  cityId: CityId;
  cityName: string;
  generatedAt: string;
  model: string;
  headline: string;
  summary: string;
  highlights: string[];
  advisoryNote: string;
}

