

import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { CITY_MAP, CITIES, HISTORICAL_FLOOD_EVENTS } from '../src/data/cities.js';
import { computeFloodRisk, computeDrainageCapacityPct, classifyRisk } from '../src/lib/riskModel.js';
import type {
  AiRiskAssessmentPayload,
  AiWeatherSummaryPayload,
  AirQualityHistoryPoint,
  AirQualityIntelResponse,
  ApiChannelStatus,
  CityComparisonSummary,
  CityId,
  CityTelemetryResponse,
  DailyPoint,
  EnvVisionAnalysisReport,
  EnvVisionBoundingBox,
  EnvVisionExternalContextResponse,
  EnvVisionWeatherContext,
  HistoricalDailyRecord,
  HourlyPoint,
  MeasuredAirQualityData,
  PollutantMeasurement,
  PublicWeatherAlert,
  RadarFrameInfo,
  RadarFramesResponse,
  ReliefCategory,
  ReliefPlace,
} from '../src/types/flood.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MAPS_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

function getMapsApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Simple TTL in-memory cache to protect API quotas (especially 100 req/day demo GMP keys)
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}
const memoryCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  memoryCache.set(key, {
    value,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

function isValidCityId(id: string): id is CityId {
  return Object.prototype.hasOwnProperty.call(CITY_MAP, id);
}

// WMO weather code mapping for Open-Meteo fallback/supplement
function describeWmoCode(code: number | null | undefined): { text: string; type: string } {
  if (code === null || code === undefined) return { text: 'Unknown', type: 'UNKNOWN' };
  if (code === 0) return { text: 'Clear sky', type: 'CLEAR' };
  if (code <= 3) return { text: code === 1 ? 'Mainly clear' : code === 2 ? 'Partly cloudy' : 'Overcast', type: 'CLOUDY' };
  if (code === 45 || code === 48) return { text: 'Fog / Mist', type: 'FOG' };
  if (code >= 51 && code <= 57) return { text: 'Drizzle', type: 'DRIZZLE' };
  if (code >= 61 && code <= 67) return { text: code >= 65 ? 'Heavy rain' : 'Rain', type: 'RAIN' };
  if (code >= 71 && code <= 77) return { text: 'Snow / Sleet', type: 'SNOW' };
  if (code >= 80 && code <= 82) return { text: code === 82 ? 'Violent rain showers' : 'Rain showers', type: 'RAIN_SHOWERS' };
  if (code >= 95) return { text: 'Thunderstorm', type: 'THUNDERSTORM' };
  return { text: 'Cloudy', type: 'CLOUDY' };
}

function degreesToCardinal(deg: number | null | undefined): string | null {
  if (deg === null || deg === undefined || Number.isNaN(deg)) return null;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) / 22.5)) % 16];
}

// Fetch Google Maps Elevation API with 24h cache
async function fetchCityElevation(cityId: CityId, lat: number, lng: number): Promise<{
  elevationM: number | null;
  status: ApiChannelStatus;
}> {
  const cacheKey = `elev:${cityId}`;
  const cached = getCached<{ elevationM: number | null; status: ApiChannelStatus }>(cacheKey);
  if (cached) return cached;

  const mapsKey = getMapsApiKey();
  const now = new Date().toISOString();
  if (!mapsKey) {
    return {
      elevationM: null,
      status: {
        status: 'unavailable',
        provider: 'Google Elevation API',
        message: 'Google Maps API key not configured',
        lastChecked: now,
      },
    };
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/elevation/json');
    url.searchParams.set('locations', `${lat},${lng}`);
    url.searchParams.set('key', mapsKey);
    url.searchParams.set('solution_id', MAPS_SOLUTION_ID);

    const resp = await fetch(url.toString(), {
      headers: { 'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID },
    });
    const data = await resp.json() as {
      status?: string;
      error_message?: string;
      results?: Array<{ elevation?: number }>;
    };

    if (resp.status === 429 || data.status === 'OVER_DAILY_LIMIT' || data.status === 'OVER_QUERY_LIMIT') {
      const res = {
        elevationM: null,
        status: {
          status: 'quota_exceeded' as const,
          provider: 'Google Elevation API',
          message: data.error_message || 'Google Elevation API quota exceeded',
          lastChecked: now,
        },
      };
      setCached(cacheKey, res, 10 * 60 * 1000);
      return res;
    }

    if (data.status === 'OK' && typeof data.results?.[0]?.elevation === 'number') {
      const res = {
        elevationM: Math.round(data.results[0].elevation * 10) / 10,
        status: {
          status: 'ok' as const,
          provider: 'Google Elevation API',
          lastChecked: now,
        },
      };
      setCached(cacheKey, res, 24 * 60 * 60 * 1000);
      return res;
    }

    const res = {
      elevationM: null,
      status: {
        status: 'unavailable' as const,
        provider: 'Google Elevation API',
        message: data.error_message || `Elevation status: ${data.status ?? resp.status}`,
        lastChecked: now,
      },
    };
    setCached(cacheKey, res, 15 * 60 * 1000);
    return res;
  } catch (err) {
    return {
      elevationM: null,
      status: {
        status: 'unavailable',
        provider: 'Google Elevation API',
        message: err instanceof Error ? err.message : 'Network error',
        lastChecked: now,
      },
    };
  }
}

// Fetch Google Weather API (current + 24h + 7d + publicAlerts)
async function fetchGoogleWeather(lat: number, lng: number) {
  const apiKey = getMapsApiKey();
  const now = new Date().toISOString();
  if (!apiKey) {
    return { ok: false as const, quotaExceeded: false, message: 'Google Maps API key not configured', checkedAt: now };
  }

  const headers = { 'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID };
  const makeUrl = (endpoint: string, extraParams?: Record<string, string>) => {
    const u = new URL(`https://weather.googleapis.com/v1/${endpoint}`);
    u.searchParams.set('key', apiKey);
    u.searchParams.set('location.latitude', String(lat));
    u.searchParams.set('location.longitude', String(lng));
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) u.searchParams.set(k, v);
    }
    return u.toString();
  };

  try {
    const [currResp, hoursResp, daysResp, alertsResp] = await Promise.all([
      fetch(makeUrl('currentConditions:lookup'), { headers }),
      fetch(makeUrl('forecast/hours:lookup', { hours: '24', pageSize: '24' }), { headers }),
      fetch(makeUrl('forecast/days:lookup', { days: '7', pageSize: '7' }), { headers }),
      fetch(makeUrl('publicAlerts:lookup', { languageCode: 'en' }), { headers }),
    ]);

    if (currResp.status === 429 || hoursResp.status === 429) {
      return {
        ok: false as const,
        quotaExceeded: true,
        message: 'Google Weather API quota limit reached (HTTP 429)',
        checkedAt: now,
      };
    }

    if (!currResp.ok) {
      const errBody = await currResp.text().catch(() => '');
      const isQuota = errBody.includes('RESOURCE_EXHAUSTED');
      return {
        ok: false as const,
        quotaExceeded: isQuota,
        message: `Google Weather API returned ${currResp.status}${errBody ? `: ${errBody.slice(0, 140)}` : ''}`,
        checkedAt: now,
      };
    }

    const currentData = await currResp.json();
    const hoursData = hoursResp.ok ? await hoursResp.json() : null;
    const daysData = daysResp.ok ? await daysResp.json() : null;
    const alertsData = alertsResp.ok ? await alertsResp.json() : null;

    return {
      ok: true as const,
      checkedAt: now,
      currentData,
      hoursData,
      daysData,
      alertsData,
    };
  } catch (err) {
    return {
      ok: false as const,
      quotaExceeded: false,
      message: err instanceof Error ? err.message : 'Google Weather fetch failed',
      checkedAt: now,
    };
  }
}

// Fetch Open-Meteo (soil moisture + past 24h rain + weather fallback)
async function fetchOpenMeteo(lat: number, lng: number) {
  const now = new Date().toISOString();
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,dew_point_2m,uv_index'
    );
    url.searchParams.set(
      'hourly',
      'precipitation,precipitation_probability,temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,weather_code,soil_moisture_0_to_7cm'
    );
    url.searchParams.set(
      'daily',
      'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code,uv_index_max'
    );
    url.searchParams.set('timezone', 'Asia/Kolkata');
    url.searchParams.set('past_days', '1');
    url.searchParams.set('forecast_days', '7');

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      return { ok: false as const, message: `Open-Meteo HTTP ${resp.status}`, checkedAt: now };
    }
    const data = await resp.json();
    return { ok: true as const, data, checkedAt: now };
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : 'Open-Meteo unavailable',
      checkedAt: now,
    };
  }
}

function formatIstHourLabel(isoTime: string): string {
  try {
    const d = new Date(isoTime);
    if (Number.isNaN(d.getTime())) return isoTime.slice(11, 16);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return isoTime;
  }
}

function formatDayLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return isoDate;
  }
}

async function buildCityTelemetry(cityId: CityId, bypassCache = false): Promise<CityTelemetryResponse> {
  const city = CITY_MAP[cityId];
  const cacheKey = `telemetry:${cityId}`;

  if (!bypassCache) {
    const existing = getCached<CityTelemetryResponse>(cacheKey);
    if (existing) {
      return { ...existing, cached: true };
    }
  } else {
    // Enforce 45s cooldown even on manual refresh to avoid quota abuse
    const recent = getCached<CityTelemetryResponse>(cacheKey);
    if (recent && Date.now() - new Date(recent.fetchedAt).getTime() < 45 * 1000) {
      return { ...recent, cached: true };
    }
  }

  const [googleRes, omRes, elevRes] = await Promise.all([
    fetchGoogleWeather(city.lat, city.lng),
    fetchOpenMeteo(city.lat, city.lng),
    fetchCityElevation(city.id, city.lat, city.lng),
  ]);

  const nowIso = new Date().toISOString();

  // Extract soil moisture and past-24h accumulated rainfall from Open-Meteo
  let soilMoisturePct: number | null = null;
  let accumulated24hMm: number | null = null;
  let omCurrentHourIdx = -1;

  if (omRes.ok && omRes.data?.hourly?.time) {
    const times: string[] = omRes.data.hourly.time;
    const nowMs = Date.now();
    // Find index closest to current hour
    let bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const tMs = new Date(`${times[i]}+05:30`).getTime();
      const diff = Math.abs(nowMs - tMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        omCurrentHourIdx = i;
      }
    }
    if (omCurrentHourIdx >= 0) {
      const smArr: Array<number | null> = omRes.data.hourly.soil_moisture_0_to_7cm ?? [];
      const rawSm = smArr[omCurrentHourIdx];
      if (typeof rawSm === 'number') {
        // Volumetric m³/m³ (typical 0.05 dry to 0.45 saturated) -> relative saturation %
        soilMoisturePct = Math.round(Math.min(100, Math.max(0, (rawSm / 0.45) * 100)));
      }
      const precArr: Array<number | null> = omRes.data.hourly.precipitation ?? [];
      const startIdx = Math.max(0, omCurrentHourIdx - 23);
      let sum = 0;
      let hasAny = false;
      for (let i = startIdx; i <= omCurrentHourIdx; i++) {
        if (typeof precArr[i] === 'number') {
          sum += precArr[i] as number;
          hasAny = true;
        }
      }
      if (hasAny) {
        accumulated24hMm = Math.round(sum * 10) / 10;
      }
    }
  }

  const soilStatus: ApiChannelStatus =
    soilMoisturePct !== null
      ? { status: 'ok', provider: 'Open-Meteo Land Hydrology (0–7cm)', lastChecked: nowIso }
      : {
          status: 'unavailable',
          provider: 'Open-Meteo Land Hydrology',
          message: omRes.ok ? 'Soil moisture reading missing' : omRes.message,
          lastChecked: nowIso,
        };

  // Weather Data (Primary: Google Weather API, Fallback: Open-Meteo)
  let rainfallMmHr: number | null = null;
  let temperatureC: number | null = null;
  let feelsLikeC: number | null = null;
  let tempMaxC: number | null = null;
  let tempMinC: number | null = null;
  let humidityPct: number | null = null;
  let windKmh: number | null = null;
  let windGustKmh: number | null = null;
  let windCardinal: string | null = null;
  let pressureMb: number | null = null;
  let cloudCoverPct: number | null = null;
  let visibilityKm: number | null = null;
  let uvIndex: number | null = null;
  let dewPointC: number | null = null;
  let isDaytime: boolean | null = null;
  let conditionText: string | null = null;
  let conditionType: string | null = null;
  let hourlyForecast: HourlyPoint[] = [];
  let dailyForecast: DailyPoint[] = [];
  let alerts: PublicWeatherAlert[] = [];
  let weatherStatus: ApiChannelStatus;
  let alertsStatus: ApiChannelStatus;

  if (googleRes.ok) {
    const c = googleRes.currentData;
    rainfallMmHr = typeof c?.precipitation?.qpf?.quantity === 'number' ? c.precipitation.qpf.quantity : 0;
    if (typeof c?.currentConditionsHistory?.qpf?.quantity === 'number') {
      accumulated24hMm = Math.round(c.currentConditionsHistory.qpf.quantity * 10) / 10;
    }
    temperatureC = typeof c?.temperature?.degrees === 'number' ? c.temperature.degrees : null;
    feelsLikeC = typeof c?.feelsLikeTemperature?.degrees === 'number' ? c.feelsLikeTemperature.degrees : null;
    humidityPct = typeof c?.relativeHumidity === 'number' ? c.relativeHumidity : null;
    windKmh = typeof c?.wind?.speed?.value === 'number' ? c.wind.speed.value : null;
    windGustKmh = typeof c?.wind?.gust?.value === 'number' ? c.wind.gust.value : null;
    windCardinal = c?.wind?.direction?.cardinal ?? degreesToCardinal(c?.wind?.direction?.degrees);
    pressureMb = typeof c?.airPressure?.meanSeaLevelMillibars === 'number' ? Math.round(c.airPressure.meanSeaLevelMillibars * 10) / 10 : null;
    cloudCoverPct = typeof c?.cloudCover === 'number' ? c.cloudCover : null;
    visibilityKm = typeof c?.visibility?.distance === 'number' ? c.visibility.distance : null;
    uvIndex = typeof c?.uvIndex === 'number' ? c.uvIndex : null;
    dewPointC = typeof c?.dewPoint?.degrees === 'number' ? c.dewPoint.degrees : null;
    isDaytime = typeof c?.isDaytime === 'boolean' ? c.isDaytime : null;
    conditionText = c?.weatherCondition?.description?.text ?? null;
    conditionType = c?.weatherCondition?.type ?? null;

    // 24h Hourly Forecast from Google Weather
    const gHours = Array.isArray(googleRes.hoursData?.forecastHours) ? googleRes.hoursData.forecastHours : [];
    hourlyForecast = gHours.slice(0, 24).map((h: any) => ({
      timeIso: h?.interval?.startTime ?? nowIso,
      hourLabel: formatIstHourLabel(h?.interval?.startTime ?? nowIso),
      rainMm: typeof h?.precipitation?.qpf?.quantity === 'number' ? h.precipitation.qpf.quantity : null,
      rainProbPct: typeof h?.precipitation?.probability?.percent === 'number' ? h.precipitation.probability.percent : null,
      tempC: typeof h?.temperature?.degrees === 'number' ? h.temperature.degrees : null,
      humidityPct: typeof h?.relativeHumidity === 'number' ? h.relativeHumidity : null,
      windKmh: typeof h?.wind?.speed?.value === 'number' ? h.wind.speed.value : null,
      pressureMb: typeof h?.airPressure?.meanSeaLevelMillibars === 'number' ? h.airPressure.meanSeaLevelMillibars : null,
      conditionText: h?.weatherCondition?.description?.text ?? null,
      dataKind: 'forecast' as const,
      source: 'Google Weather API',
    }));

    // Daily Forecast from Google Weather
    const gDays = Array.isArray(googleRes.daysData?.forecastDays) ? googleRes.daysData.forecastDays : [];
    dailyForecast = gDays.slice(0, 7).map((d: any) => {
      const dateStr = d?.displayDate
        ? `${d.displayDate.year}-${String(d.displayDate.month).padStart(2, '0')}-${String(d.displayDate.day).padStart(2, '0')}`
        : d?.interval?.startTime ?? nowIso;
      const dayRain = d?.daytimeForecast?.precipitation?.qpf?.quantity ?? 0;
      const nightRain = d?.nighttimeForecast?.precipitation?.qpf?.quantity ?? 0;
      const dayProb = d?.daytimeForecast?.precipitation?.probability?.percent ?? 0;
      const nightProb = d?.nighttimeForecast?.precipitation?.probability?.percent ?? 0;
      return {
        dateIso: dateStr,
        dayLabel: formatDayLabel(dateStr),
        tempMaxC: typeof d?.maxTemperature?.degrees === 'number' ? d.maxTemperature.degrees : null,
        tempMinC: typeof d?.minTemperature?.degrees === 'number' ? d.minTemperature.degrees : null,
        rainSumMm: Math.round((dayRain + nightRain) * 10) / 10,
        rainProbPct: Math.max(dayProb, nightProb),
        windMaxKmh: typeof d?.daytimeForecast?.wind?.speed?.value === 'number' ? d.daytimeForecast.wind.speed.value : null,
        conditionText: d?.daytimeForecast?.weatherCondition?.description?.text ?? null,
        source: 'Google Weather API',
      };
    });

    tempMaxC =
      typeof c?.currentConditionsHistory?.maxTemperature?.degrees === 'number'
        ? c.currentConditionsHistory.maxTemperature.degrees
        : dailyForecast[0]?.tempMaxC ?? null;
    tempMinC =
      typeof c?.currentConditionsHistory?.minTemperature?.degrees === 'number'
        ? c.currentConditionsHistory.minTemperature.degrees
        : dailyForecast[0]?.tempMinC ?? null;

    if (uvIndex === null && omRes.ok && typeof omRes.data?.current?.uv_index === 'number') {
      uvIndex = Math.round(omRes.data.current.uv_index * 10) / 10;
    }

    // Public Alerts from Google Weather
    const rawAlerts = Array.isArray(googleRes.alertsData?.weatherAlerts) ? googleRes.alertsData.weatherAlerts : [];
    alerts = rawAlerts.map((a: any) => ({
      alertId: a.alertId ?? String(Math.random()),
      title: a.alertTitle?.text ?? 'Weather Alert',
      eventType: a.eventType ?? 'ADVISORY',
      areaName: a.areaName ?? city.name,
      severity: a.severity ?? 'UNKNOWN',
      certainty: a.certainty ?? 'UNKNOWN',
      urgency: a.urgency ?? 'UNKNOWN',
      description: a.description ?? '',
      instructions: Array.isArray(a.instruction) ? a.instruction : [],
      startTime: a.startTime,
      expirationTime: a.expirationTime,
      dataSource: {
        publisher: a.dataSource?.publisher,
        name: a.dataSource?.name ?? 'Meteorological Authority',
        authorityUri: a.dataSource?.authorityUri ?? 'https://mausam.imd.gov.in/',
      },
    }));

    weatherStatus = {
      status: 'ok',
      provider: 'Google Weather API',
      lastChecked: googleRes.checkedAt,
    };
    alertsStatus = {
      status: googleRes.alertsData ? 'ok' : 'degraded',
      provider: 'Google Weather Public Alerts',
      message: alerts.length === 0 ? 'No active official alerts for coordinates' : undefined,
      lastChecked: googleRes.checkedAt,
    };
  } else if (omRes.ok && omRes.data?.current) {
    // Transparent fallback to Open-Meteo
    const cur = omRes.data.current;
    const wmo = describeWmoCode(cur.weather_code);
    rainfallMmHr = typeof cur.precipitation === 'number' ? cur.precipitation : null;
    temperatureC = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null;
    feelsLikeC = typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : null;
    humidityPct = typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null;
    windKmh = typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null;
    windGustKmh = typeof cur.wind_gusts_10m === 'number' ? cur.wind_gusts_10m : null;
    windCardinal = degreesToCardinal(cur.wind_direction_10m);
    pressureMb = typeof cur.surface_pressure === 'number' ? Math.round(cur.surface_pressure * 10) / 10 : null;
    cloudCoverPct = typeof cur.cloud_cover === 'number' ? cur.cloud_cover : null;
    uvIndex = typeof cur.uv_index === 'number' ? Math.round(cur.uv_index * 10) / 10 : null;
    dewPointC = typeof cur.dew_point_2m === 'number' ? Math.round(cur.dew_point_2m * 10) / 10 : null;
    isDaytime = typeof cur.is_day === 'number' ? cur.is_day === 1 : null;
    conditionText = wmo.text;
    conditionType = wmo.type;

    if (omCurrentHourIdx >= 0 && omRes.data?.hourly?.time) {
      const h = omRes.data.hourly;
      for (let i = omCurrentHourIdx; i < Math.min(h.time.length, omCurrentHourIdx + 24); i++) {
        const hw = describeWmoCode(h.weather_code?.[i]);
        hourlyForecast.push({
          timeIso: `${h.time[i]}+05:30`,
          hourLabel: formatIstHourLabel(`${h.time[i]}+05:30`),
          rainMm: typeof h.precipitation?.[i] === 'number' ? h.precipitation[i] : null,
          rainProbPct: typeof h.precipitation_probability?.[i] === 'number' ? h.precipitation_probability[i] : null,
          tempC: typeof h.temperature_2m?.[i] === 'number' ? h.temperature_2m[i] : null,
          humidityPct: typeof h.relative_humidity_2m?.[i] === 'number' ? h.relative_humidity_2m[i] : null,
          windKmh: typeof h.wind_speed_10m?.[i] === 'number' ? h.wind_speed_10m[i] : null,
          pressureMb: typeof h.surface_pressure?.[i] === 'number' ? h.surface_pressure[i] : null,
          conditionText: hw.text,
          dataKind: 'forecast',
          source: 'Open-Meteo Forecast',
        });
      }
    }

    if (omRes.data?.daily?.time) {
      const d = omRes.data.daily;
      // Skip yesterday (past_days=1 puts index 0 as yesterday)
      for (let i = 1; i < Math.min(d.time.length, 8); i++) {
        const dw = describeWmoCode(d.weather_code?.[i]);
        dailyForecast.push({
          dateIso: d.time[i],
          dayLabel: formatDayLabel(d.time[i]),
          tempMaxC: typeof d.temperature_2m_max?.[i] === 'number' ? d.temperature_2m_max[i] : null,
          tempMinC: typeof d.temperature_2m_min?.[i] === 'number' ? d.temperature_2m_min[i] : null,
          rainSumMm: typeof d.precipitation_sum?.[i] === 'number' ? d.precipitation_sum[i] : null,
          rainProbPct: typeof d.precipitation_probability_max?.[i] === 'number' ? d.precipitation_probability_max[i] : null,
          windMaxKmh: typeof d.wind_speed_10m_max?.[i] === 'number' ? d.wind_speed_10m_max[i] : null,
          conditionText: dw.text,
          source: 'Open-Meteo Forecast',
        });
      }
    }

    tempMaxC = dailyForecast[0]?.tempMaxC ?? null;
    tempMinC = dailyForecast[0]?.tempMinC ?? null;

    weatherStatus = {
      status: googleRes.quotaExceeded ? 'quota_exceeded' : 'degraded',
      provider: 'Open-Meteo (Fallback — Google Weather unavailable)',
      message: googleRes.message,
      lastChecked: nowIso,
    };
    alertsStatus = {
      status: 'unavailable',
      provider: 'Google Weather Public Alerts',
      message: googleRes.message,
      lastChecked: nowIso,
    };
  } else {
    weatherStatus = {
      status: googleRes.quotaExceeded ? 'quota_exceeded' : 'unavailable',
      provider: 'Unavailable',
      message: `${googleRes.message}; ${omRes.ok ? '' : omRes.message}`,
      lastChecked: nowIso,
    };
    alertsStatus = {
      status: 'unavailable',
      provider: 'Google Weather Public Alerts',
      message: googleRes.message,
      lastChecked: nowIso,
    };
  }

  // Elevation fallback if Google Elevation API was unavailable, clearly labelled
  let elevationM = elevRes.elevationM;
  let elevationStatus = elevRes.status;
  if (elevationM === null && omRes.ok && typeof omRes.data?.elevation === 'number') {
    elevationM = omRes.data.elevation;
    elevationStatus = {
      status: 'degraded',
      provider: 'Open-Meteo DEM (Google Elevation unavailable)',
      message: elevRes.status.message,
      lastChecked: nowIso,
    };
  }

  const { drainageCapacityPct, assessment } = computeFloodRisk({
    city,
    rainfallMmHr,
    accumulated24hMm,
    soilMoisturePct,
    elevationM,
    hourlyForecast,
    weatherSourceLabel: weatherStatus.provider,
    soilSourceLabel: soilStatus.provider,
    elevationSourceLabel: elevationStatus.provider,
  });

  // Trends computed from first 3 forecast hours vs current
  const nextRain = hourlyForecast[1]?.rainMm ?? null;
  const rainTrend =
    rainfallMmHr === null || nextRain === null
      ? 'unavailable'
      : nextRain - rainfallMmHr > 0.4
      ? 'up'
      : rainfallMmHr - nextRain > 0.4
      ? 'down'
      : 'flat';

  const riskTrend =
    assessment.trend === 'rising' ? 'up' : assessment.trend === 'falling' ? 'down' : 'flat';

  const payload: CityTelemetryResponse = {
    city,
    fetchedAt: nowIso,
    cached: false,
    sources: {
      weather: weatherStatus,
      soilMoisture: soilStatus,
      elevation: elevationStatus,
      alerts: alertsStatus,
    },
    current: {
      rainfallMmHr,
      accumulated24hMm,
      soilMoisturePct,
      drainageCapacityPct,
      elevationM,
      temperatureC,
      feelsLikeC,
      tempMaxC,
      tempMinC,
      humidityPct,
      windKmh,
      windGustKmh,
      windCardinal,
      pressureMb,
      cloudCoverPct,
      visibilityKm,
      uvIndex,
      dewPointC,
      isDaytime,
      conditionText,
      conditionType,
      trends: {
        rainfall: rainTrend,
        soilMoisture: soilMoisturePct !== null ? (rainTrend === 'up' ? 'up' : 'flat') : 'unavailable',
        drainage: drainageCapacityPct !== null ? (rainTrend === 'up' ? 'down' : 'flat') : 'unavailable',
        risk: riskTrend,
      },
    },
    hourlyForecast,
    dailyForecast,
    alerts,
    risk: assessment,
  };

  setCached(cacheKey, payload, 20 * 60 * 1000);
  return payload;
}

// --- AI Environmental Vision Helpers (Google Air Quality API + Weather + Reverse Geocoding) ---

function formatPollutantUnit(units: string | null | undefined): string {
  if (!units) return '';
  if (units === 'MICROGRAMS_PER_CUBIC_METER') return 'µg/m³';
  if (units === 'PARTS_PER_BILLION') return 'ppb';
  if (units === 'PARTS_PER_MILLION') return 'ppm';
  return units;
}

function buildDispersionNote(
  windKmh: number | null,
  humidityPct: number | null,
  recentRainMm: number | null
): string {
  const parts: string[] = [];
  if (typeof windKmh === 'number') {
    if (windKmh < 7) {
      parts.push(`Light wind (${windKmh.toFixed(1)} km/h) reduces horizontal dispersion, allowing smoke, road dust, or urban haze to linger near ground level.`);
    } else if (windKmh < 18) {
      parts.push(`Moderate wind (${windKmh.toFixed(1)} km/h) partially disperses visible plumes and suspended dust downwind.`);
    } else {
      parts.push(`Breezy conditions (${windKmh.toFixed(1)} km/h) promote faster dilution of smoke plumes, though dry gusts can also lift loose surface dust.`);
    }
  }
  if (typeof humidityPct === 'number' && humidityPct >= 78) {
    parts.push(`High relative humidity (${Math.round(humidityPct)}%) increases hygroscopic aerosol swelling and morning mist/fog formation, which can visually resemble haze.`);
  }
  if (typeof recentRainMm === 'number' && recentRainMm > 0.5) {
    parts.push(`Recent rainfall (${recentRainMm.toFixed(1)} mm) tends to wash out coarse dust and soluble particulates via wet deposition.`);
  }
  if (parts.length === 0) {
    return 'Wind speed, direction, relative humidity, and recent rainfall strongly influence whether smoke, dust, or haze accumulates or disperses visually.';
  }
  return parts.join(' ');
}

function normalizePollutantSlots(rawMap: Partial<Record<'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2', PollutantMeasurement>>): PollutantMeasurement[] {
  const defs: Array<{ code: 'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2'; displayName: string; fullName: string }> = [
    { code: 'pm25', displayName: 'PM2.5', fullName: 'Fine particulate matter (<2.5 µm)' },
    { code: 'pm10', displayName: 'PM10', fullName: 'Coarse particulate matter (<10 µm)' },
    { code: 'no2', displayName: 'NO2', fullName: 'Nitrogen dioxide' },
    { code: 'o3', displayName: 'O3', fullName: 'Ozone' },
    { code: 'co', displayName: 'CO', fullName: 'Carbon monoxide' },
    { code: 'so2', displayName: 'SO2', fullName: 'Sulfur dioxide' },
  ];
  return defs.map((d) => {
    const found = rawMap[d.code];
    return (
      found ?? {
        code: d.code,
        displayName: d.displayName,
        fullName: d.fullName,
        value: null,
        units: null,
        sources: null,
        effects: null,
      }
    );
  });
}

async function fetchGoogleAirQuality(lat: number, lng: number): Promise<MeasuredAirQualityData> {
  const mapsKey = getMapsApiKey();
  const emptyPollutants = normalizePollutantSlots({});
  if (!mapsKey) {
    return {
      available: false,
      source: 'Google Maps Platform Air Quality API',
      stationOrScope: 'Unconfigured',
      measuredAt: null,
      aqi: null,
      aqiDisplay: null,
      aqiScale: null,
      regionStandard: null,
      aqiCategory: null,
      dominantPollutant: null,
      pollutants: emptyPollutants,
      healthRecommendations: null,
      errorMessage: 'Google Maps API key is not configured on the server.',
    };
  }

  try {
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${encodeURIComponent(mapsKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      },
      body: JSON.stringify({
        universalAqi: true,
        location: { latitude: lat, longitude: lng },
        extraComputations: [
          'HEALTH_RECOMMENDATIONS',
          'DOMINANT_POLLUTANT_CONCENTRATION',
          'POLLUTANT_CONCENTRATION',
          'LOCAL_AQI',
          'POLLUTANT_ADDITIONAL_INFO',
        ],
        languageCode: 'en',
      }),
    });

    if (resp.status === 429) {
      return {
        available: false,
        source: 'Google Maps Platform Air Quality API',
        stationOrScope: 'Quota Reached',
        measuredAt: null,
        aqi: null,
        aqiDisplay: null,
        aqiScale: null,
        regionStandard: null,
        aqiCategory: null,
        dominantPollutant: null,
        pollutants: emptyPollutants,
        healthRecommendations: null,
        quotaExceeded: true,
        errorMessage: 'Google Maps Air Quality API quota limit reached.',
      };
    }

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => '');
      return {
        available: false,
        source: 'Google Maps Platform Air Quality API',
        stationOrScope: 'API Error',
        measuredAt: null,
        aqi: null,
        aqiDisplay: null,
        aqiScale: null,
        regionStandard: null,
        aqiCategory: null,
        dominantPollutant: null,
        pollutants: emptyPollutants,
        healthRecommendations: null,
        quotaExceeded: errTxt.includes('RESOURCE_EXHAUSTED'),
        errorMessage: `Google Air Quality API returned HTTP ${resp.status}`,
      };
    }

    const data = (await resp.json()) as {
      dateTime?: string;
      regionCode?: string;
      indexes?: Array<{
        code?: string;
        displayName?: string;
        aqi?: number;
        aqiDisplay?: string;
        category?: string;
        dominantPollutant?: string;
      }>;
      pollutants?: Array<{
        code?: string;
        displayName?: string;
        fullName?: string;
        concentration?: { value?: number; units?: string };
        additionalInfo?: { sources?: string; effects?: string };
      }>;
      healthRecommendations?: MeasuredAirQualityData['healthRecommendations'];
    };

    const indexes = Array.isArray(data.indexes) ? data.indexes : [];
    const localIndex = indexes.find((i) => i.code && i.code !== 'uaqi');
    const uaqiIndex = indexes.find((i) => i.code === 'uaqi');
    const primaryIndex = localIndex ?? uaqiIndex ?? indexes[0];

    const pollMap: Partial<Record<'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2', PollutantMeasurement>> = {};
    for (const p of data.pollutants ?? []) {
      const code = p.code?.toLowerCase() as 'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2' | undefined;
      if (!code || !['pm25', 'pm10', 'no2', 'o3', 'co', 'so2'].includes(code)) continue;
      pollMap[code] = {
        code,
        displayName: p.displayName ?? code.toUpperCase(),
        fullName: p.fullName ?? code.toUpperCase(),
        value: typeof p.concentration?.value === 'number' ? Math.round(p.concentration.value * 100) / 100 : null,
        units: formatPollutantUnit(p.concentration?.units),
        sources: p.additionalInfo?.sources ?? null,
        effects: p.additionalInfo?.effects ?? null,
      };
    }

    const scaleText =
      localIndex && uaqiIndex
        ? `${localIndex.displayName || localIndex.code} (${localIndex.aqiDisplay ?? localIndex.aqi}) · Universal AQI (${uaqiIndex.aqiDisplay ?? uaqiIndex.aqi})`
        : primaryIndex?.displayName || 'Universal AQI (0–100)';

    return {
      available: Boolean(primaryIndex),
      source: 'Google Maps Platform Air Quality API',
      stationOrScope: `Coordinate grid (${lat.toFixed(3)}°, ${lng.toFixed(3)}°) · Region ${String(data.regionCode || 'IN').toUpperCase()}`,
      measuredAt: data.dateTime ?? new Date().toISOString(),
      aqi: typeof primaryIndex?.aqi === 'number' ? primaryIndex.aqi : null,
      aqiDisplay: primaryIndex?.aqiDisplay ?? (typeof primaryIndex?.aqi === 'number' ? String(primaryIndex.aqi) : null),
      aqiScale: scaleText,
      regionStandard: localIndex ? `${localIndex.displayName} (${String(data.regionCode || 'IN').toUpperCase()})` : 'Google Universal AQI',
      aqiCategory: primaryIndex?.category ?? null,
      dominantPollutant: primaryIndex?.dominantPollutant ? primaryIndex.dominantPollutant.toUpperCase() : null,
      pollutants: normalizePollutantSlots(pollMap),
      healthRecommendations: data.healthRecommendations ?? null,
      errorMessage: null,
    };
  } catch (err) {
    return {
      available: false,
      source: 'Google Maps Platform Air Quality API',
      stationOrScope: 'Network Error',
      measuredAt: null,
      aqi: null,
      aqiDisplay: null,
      aqiScale: null,
      regionStandard: null,
      aqiCategory: null,
      dominantPollutant: null,
      pollutants: emptyPollutants,
      healthRecommendations: null,
      errorMessage: err instanceof Error ? err.message : 'Air Quality API fetch failed',
    };
  }
}

async function fetchOpenMeteoAirQualityFallback(lat: number, lng: number, gmpReason?: string | null): Promise<MeasuredAirQualityData> {
  const emptyPollutants = normalizePollutantSlots({});
  try {
    const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set(
      'current',
      'pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi'
    );
    url.searchParams.set('timezone', 'Asia/Kolkata');

    const resp = await fetch(url.toString());
    if (!resp.ok) {
      return {
        available: false,
        source: 'Unavailable (Google AQ & Open-Meteo AQ unavailable)',
        stationOrScope: 'Unavailable',
        measuredAt: null,
        aqi: null,
        aqiDisplay: null,
        aqiScale: null,
        regionStandard: null,
        aqiCategory: null,
        dominantPollutant: null,
        pollutants: emptyPollutants,
        healthRecommendations: null,
        errorMessage: `${gmpReason ? `${gmpReason}; ` : ''}Open-Meteo Air Quality returned HTTP ${resp.status}`,
      };
    }

    const data = (await resp.json()) as {
      current?: {
        time?: string;
        pm10?: number;
        pm2_5?: number;
        carbon_monoxide?: number;
        nitrogen_dioxide?: number;
        sulphur_dioxide?: number;
        ozone?: number;
        us_aqi?: number;
        european_aqi?: number;
      };
    };

    const cur = data.current;
    if (!cur) {
      return {
        available: false,
        source: 'Open-Meteo CAMS Air Quality',
        stationOrScope: 'Unavailable',
        measuredAt: null,
        aqi: null,
        aqiDisplay: null,
        aqiScale: null,
        regionStandard: null,
        aqiCategory: null,
        dominantPollutant: null,
        pollutants: emptyPollutants,
        healthRecommendations: null,
        errorMessage: 'No current air quality observations returned for coordinates.',
      };
    }

    const usAqi = typeof cur.us_aqi === 'number' ? Math.round(cur.us_aqi) : null;
    const category =
      usAqi === null
        ? null
        : usAqi <= 50
        ? 'Good'
        : usAqi <= 100
        ? 'Moderate'
        : usAqi <= 150
        ? 'Unhealthy for Sensitive Groups'
        : usAqi <= 200
        ? 'Unhealthy'
        : usAqi <= 300
        ? 'Very Unhealthy'
        : 'Hazardous';

    const pollMap: Partial<Record<'pm25' | 'pm10' | 'no2' | 'o3' | 'co' | 'so2', PollutantMeasurement>> = {
      pm25: {
        code: 'pm25',
        displayName: 'PM2.5',
        fullName: 'Fine particulate matter (<2.5 µm)',
        value: typeof cur.pm2_5 === 'number' ? Math.round(cur.pm2_5 * 10) / 10 : null,
        units: 'µg/m³',
      },
      pm10: {
        code: 'pm10',
        displayName: 'PM10',
        fullName: 'Coarse particulate matter (<10 µm)',
        value: typeof cur.pm10 === 'number' ? Math.round(cur.pm10 * 10) / 10 : null,
        units: 'µg/m³',
      },
      no2: {
        code: 'no2',
        displayName: 'NO2',
        fullName: 'Nitrogen dioxide',
        value: typeof cur.nitrogen_dioxide === 'number' ? Math.round(cur.nitrogen_dioxide * 10) / 10 : null,
        units: 'µg/m³',
      },
      o3: {
        code: 'o3',
        displayName: 'O3',
        fullName: 'Ozone',
        value: typeof cur.ozone === 'number' ? Math.round(cur.ozone * 10) / 10 : null,
        units: 'µg/m³',
      },
      co: {
        code: 'co',
        displayName: 'CO',
        fullName: 'Carbon monoxide',
        value: typeof cur.carbon_monoxide === 'number' ? Math.round(cur.carbon_monoxide * 10) / 10 : null,
        units: 'µg/m³',
      },
      so2: {
        code: 'so2',
        displayName: 'SO2',
        fullName: 'Sulfur dioxide',
        value: typeof cur.sulphur_dioxide === 'number' ? Math.round(cur.sulphur_dioxide * 10) / 10 : null,
        units: 'µg/m³',
      },
    };

    // Determine dominant particulate/gas indicator strictly from highest ratio against WHO/EPA reference
    let dominant: string | null = null;
    if (typeof cur.pm2_5 === 'number' && typeof cur.pm10 === 'number') {
      dominant = cur.pm2_5 / 15 >= cur.pm10 / 45 ? 'PM2.5' : 'PM10';
    }

    return {
      available: true,
      source: 'Open-Meteo CAMS Atmospheric Feed (Google Air Quality API fallback)',
      stationOrScope: `CAMS atmospheric grid (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`,
      measuredAt: cur.time ? `${cur.time}+05:30` : new Date().toISOString(),
      aqi: usAqi,
      aqiDisplay: usAqi !== null ? String(usAqi) : null,
      aqiScale:
        typeof cur.european_aqi === 'number'
          ? `US EPA AQI (0–500) · EU EAQI ${Math.round(cur.european_aqi)}`
          : 'US EPA AQI (0–500)',
      regionStandard: 'US EPA AQI Scale (CAMS Reanalysis / Modelled Feed)',
      aqiCategory: category,
      dominantPollutant: dominant,
      pollutants: normalizePollutantSlots(pollMap),
      healthRecommendations: null,
      errorMessage: gmpReason || null,
    };
  } catch (err) {
    return {
      available: false,
      source: 'Unavailable',
      stationOrScope: 'Unavailable',
      measuredAt: null,
      aqi: null,
      aqiDisplay: null,
      aqiScale: null,
      regionStandard: null,
      aqiCategory: null,
      dominantPollutant: null,
      pollutants: emptyPollutants,
      healthRecommendations: null,
      errorMessage: err instanceof Error ? err.message : 'Air quality feed unavailable',
    };
  }
}

async function reverseGeocodeCoordinates(
  lat: number,
  lng: number
): Promise<{ label: string | null; city: string | null; locality: string | null }> {
  const mapsKey = getMapsApiKey();
  if (!mapsKey) {
    return { label: null, city: null, locality: null };
  }
  try {
    const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
    url.searchParams.set('location.latitude', String(lat));
    url.searchParams.set('location.longitude', String(lng));
    url.searchParams.set('languageCode', 'en');

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': mapsKey,
        'X-Goog-FieldMask': 'results.placeId,results.formattedAddress,results.addressComponents',
        'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
      },
    });
    if (!resp.ok) return { label: null, city: null, locality: null };

    const data = (await resp.json()) as {
      results?: Array<{
        formattedAddress?: string;
        addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
      }>;
    };

    const first = data.results?.[0];
    if (!first) return { label: null, city: null, locality: null };
    const comps = first.addressComponents ?? [];
    const localityComp = comps.find(
      (c) =>
        c.types?.includes('sublocality_level_1') ||
        c.types?.includes('sublocality') ||
        c.types?.includes('neighborhood')
    );
    const cityComp = comps.find(
      (c) => c.types?.includes('locality') || c.types?.includes('administrative_area_level_2')
    );
    const stateComp = comps.find((c) => c.types?.includes('administrative_area_level_1'));

    const locality = localityComp?.longText ?? null;
    const city = cityComp?.longText ?? null;
    const state = stateComp?.shortText ?? stateComp?.longText ?? null;
    const labelParts = [locality, city, state].filter(Boolean);
    return {
      label: labelParts.length > 0 ? labelParts.join(', ') : first.formattedAddress ?? null,
      city,
      locality,
    };
  } catch {
    return { label: null, city: null, locality: null };
  }
}

async function fetchEnvWeatherContext(lat: number, lng: number): Promise<EnvVisionWeatherContext> {
  const [googleRes, omRes] = await Promise.all([fetchGoogleWeather(lat, lng), fetchOpenMeteo(lat, lng)]);

  if (googleRes.ok) {
    const c = googleRes.currentData;
    const temperatureC = typeof c?.temperature?.degrees === 'number' ? c.temperature.degrees : null;
    const humidityPct = typeof c?.relativeHumidity === 'number' ? c.relativeHumidity : null;
    const windKmh = typeof c?.wind?.speed?.value === 'number' ? c.wind.speed.value : null;
    const windCardinal = c?.wind?.direction?.cardinal ?? degreesToCardinal(c?.wind?.direction?.degrees);
    const recentRainMm =
      typeof c?.currentConditionsHistory?.qpf?.quantity === 'number'
        ? Math.round(c.currentConditionsHistory.qpf.quantity * 10) / 10
        : typeof c?.precipitation?.qpf?.quantity === 'number'
        ? c.precipitation.qpf.quantity
        : null;
    const conditionText = c?.weatherCondition?.description?.text ?? null;
    return {
      available: true,
      temperatureC,
      humidityPct,
      windKmh,
      windCardinal,
      recentRainMm,
      conditionText,
      source: 'Google Weather API',
      dispersionNote: buildDispersionNote(windKmh, humidityPct, recentRainMm),
    };
  }

  if (omRes.ok && omRes.data?.current) {
    const cur = omRes.data.current;
    const wmo = describeWmoCode(cur.weather_code);
    const temperatureC = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null;
    const humidityPct = typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null;
    const windKmh = typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null;
    const windCardinal = degreesToCardinal(cur.wind_direction_10m);
    const recentRainMm = typeof cur.precipitation === 'number' ? cur.precipitation : null;
    return {
      available: true,
      temperatureC,
      humidityPct,
      windKmh,
      windCardinal,
      recentRainMm,
      conditionText: wmo.text,
      source: 'Open-Meteo Weather Feed',
      dispersionNote: buildDispersionNote(windKmh, humidityPct, recentRainMm),
    };
  }

  return {
    available: false,
    temperatureC: null,
    humidityPct: null,
    windKmh: null,
    windCardinal: null,
    recentRainMm: null,
    conditionText: null,
    source: 'Unavailable',
    dispersionNote: buildDispersionNote(null, null, null),
  };
}

async function startServer() {
  const app = express();
  const standardJsonParser = express.json({ limit: '1mb' });
  const visionJsonParser = express.json({ limit: '9mb' });
  app.use((req, res, next) => {
    if (req.path === '/api/env-vision/analyze') {
      return visionJsonParser(req, res, next);
    }
    return standardJsonParser(req, res, next);
  });

  // Maps client configuration endpoint (if runtime secret wasn't baked with VITE_ prefix)
  app.get('/api/config/maps', (_req: Request, res: Response) => {
    const key = getMapsApiKey();
    res.json({
      configured: Boolean(key),
      apiKey: key || null,
    });
  });

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      mapsConfigured: Boolean(getMapsApiKey()),
    });
  });

  // City Live Telemetry & Forecast
  app.get('/api/telemetry/:cityId', async (req: Request, res: Response) => {
    const cityId = String(req.params.cityId || '').toLowerCase();
    if (!isValidCityId(cityId)) {
      res.status(400).json({ error: `Unsupported city '${cityId}'. Supported: ${CITIES.map((c) => c.id).join(', ')}` });
      return;
    }
    const refresh = req.query.refresh === 'true';
    try {
      const data = await buildCityTelemetry(cityId, refresh);
      res.json(data);
    } catch (err) {
      res.status(502).json({
        error: 'Failed to retrieve meteorological telemetry',
        details: err instanceof Error ? err.message : 'Unknown upstream error',
      });
    }
  });

  // Batch City Comparison across all 9 Indian cities (1 Open-Meteo batch call + cached Google enrichment)
  app.get('/api/comparison', async (req: Request, res: Response) => {
    const cacheKey = 'comparison:all:v2';
    const refresh = req.query.refresh === 'true';
    if (!refresh) {
      const cached = getCached<{ cities: CityComparisonSummary[]; fetchedAt: string; source: string }>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    try {
      const lats = CITIES.map((c) => c.lat).join(',');
      const lngs = CITIES.map((c) => c.lng).join(',');
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lats);
      url.searchParams.set('longitude', lngs);
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,uv_index');
      url.searchParams.set('hourly', 'precipitation,soil_moisture_0_to_7cm');
      url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
      url.searchParams.set('timezone', 'Asia/Kolkata');
      url.searchParams.set('past_days', '1');
      url.searchParams.set('forecast_days', '2');

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        res.status(502).json({ error: `Comparison upstream returned HTTP ${resp.status}` });
        return;
      }
      const raw = await resp.json();
      const list = Array.isArray(raw) ? raw : [raw];
      const nowIso = new Date().toISOString();

      const summaries: CityComparisonSummary[] = CITIES.map((city, idx) => {
        const cachedCity = getCached<CityTelemetryResponse>(`telemetry:${city.id}`);
        if (cachedCity && !refresh) {
          return {
            cityId: city.id,
            cityName: city.name,
            state: city.state,
            rainfallMmHr: cachedCity.current.rainfallMmHr,
            accumulated24hMm: cachedCity.current.accumulated24hMm,
            soilMoisturePct: cachedCity.current.soilMoisturePct,
            drainageCapacityPct: cachedCity.current.drainageCapacityPct,
            floodRiskIndex: cachedCity.risk.currentScore,
            riskCategory: cachedCity.risk.category,
            temperatureC: cachedCity.current.temperatureC,
            tempMaxC: cachedCity.current.tempMaxC,
            tempMinC: cachedCity.current.tempMinC,
            humidityPct: cachedCity.current.humidityPct,
            windKmh: cachedCity.current.windKmh,
            uvIndex: cachedCity.current.uvIndex,
            conditionText: cachedCity.current.conditionText,
            alertStatus:
              cachedCity.alerts.length > 0
                ? cachedCity.alerts[0].title
                : cachedCity.risk.category === 'SEVERE' || cachedCity.risk.category === 'HIGH'
                ? `${cachedCity.risk.category} Risk Watch`
                : 'No Active Alerts',
            source: cachedCity.sources.weather.provider,
            fetchedAt: cachedCity.fetchedAt,
          };
        }

        const item = list[idx];
        if (!item?.current) {
          return {
            cityId: city.id,
            cityName: city.name,
            state: city.state,
            rainfallMmHr: null,
            accumulated24hMm: null,
            soilMoisturePct: null,
            drainageCapacityPct: null,
            floodRiskIndex: null,
            riskCategory: 'UNAVAILABLE',
            temperatureC: null,
            tempMaxC: null,
            tempMinC: null,
            humidityPct: null,
            windKmh: null,
            uvIndex: null,
            conditionText: null,
            alertStatus: 'Telemetry Unavailable',
            source: 'Unavailable',
            fetchedAt: nowIso,
          };
        }

        const cur = item.current;
        const wmo = describeWmoCode(cur.weather_code);
        const times: string[] = item.hourly?.time ?? [];
        const nowMs = Date.now();
        let curHourIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < times.length; i++) {
          const diff = Math.abs(nowMs - new Date(`${times[i]}+05:30`).getTime());
          if (diff < bestDiff) {
            bestDiff = diff;
            curHourIdx = i;
          }
        }
        const rawSm = item.hourly?.soil_moisture_0_to_7cm?.[curHourIdx];
        const soilPct =
          typeof rawSm === 'number'
            ? Math.round(Math.min(100, Math.max(0, (rawSm / 0.45) * 100)))
            : null;
        let acc24 = 0;
        const precArr: Array<number | null> = item.hourly?.precipitation ?? [];
        for (let i = Math.max(0, curHourIdx - 23); i <= curHourIdx; i++) {
          acc24 += precArr[i] ?? 0;
        }
        acc24 = Math.round(acc24 * 10) / 10;

        const rainHr = typeof cur.precipitation === 'number' ? cur.precipitation : null;
        const { drainageCapacityPct, assessment } = computeFloodRisk({
          city,
          rainfallMmHr: rainHr,
          accumulated24hMm: acc24,
          soilMoisturePct: soilPct,
          elevationM: city.elevationBaselineM,
          hourlyForecast: [],
          weatherSourceLabel: 'Open-Meteo Multi-City Feed',
          soilSourceLabel: 'Open-Meteo Land Hydrology',
          elevationSourceLabel: 'City Baseline Elevation',
        });

        // daily index 1 corresponds to today because past_days=1
        const todayMax = typeof item.daily?.temperature_2m_max?.[1] === 'number' ? item.daily.temperature_2m_max[1] : null;
        const todayMin = typeof item.daily?.temperature_2m_min?.[1] === 'number' ? item.daily.temperature_2m_min[1] : null;

        return {
          cityId: city.id,
          cityName: city.name,
          state: city.state,
          rainfallMmHr: rainHr,
          accumulated24hMm: acc24,
          soilMoisturePct: soilPct,
          drainageCapacityPct,
          floodRiskIndex: assessment.currentScore,
          riskCategory: assessment.category,
          temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
          tempMaxC: todayMax,
          tempMinC: todayMin,
          humidityPct: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
          windKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
          uvIndex: typeof cur.uv_index === 'number' ? Math.round(cur.uv_index * 10) / 10 : null,
          conditionText: wmo.text,
          alertStatus:
            assessment.category === 'SEVERE' || assessment.category === 'HIGH'
              ? `${assessment.category} Risk Watch`
              : 'Normal Monitoring',
          source: 'Open-Meteo Multi-City Feed',
          fetchedAt: nowIso,
        };
      });

      const responseObj = {
        cities: summaries,
        fetchedAt: nowIso,
        source: 'Open-Meteo + Cached Google Weather Telemetry',
      };
      setCached(cacheKey, responseObj, 10 * 60 * 1000);
      res.json(responseObj);
    } catch (err) {
      res.status(502).json({
        error: 'Failed to retrieve multi-city comparison data',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // Gemini AI Structured Flood Risk Explanation & Assessment
  app.post('/api/ai/risk-assessment', async (req: Request, res: Response) => {
    const cityIdRaw = String(req.body?.cityId || '').toLowerCase();
    const forceRefresh = Boolean(req.body?.forceRefresh);
    if (!isValidCityId(cityIdRaw)) {
      res.status(400).json({ error: `Invalid cityId '${cityIdRaw}'` });
      return;
    }

    const cacheKey = `ai:${cityIdRaw}`;
    if (!forceRefresh) {
      const cached = getCached<AiRiskAssessmentPayload>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    try {
      const telemetry = await buildCityTelemetry(cityIdRaw, false);
      const city = telemetry.city;

      const promptPayload = {
        city: city.name,
        state: city.state,
        terrainSummary: city.terrainSummary,
        municipalAuthority: city.municipalAuthority,
        drainageDesignThresholdMmHr: city.drainageDesignMmHr,
        observations: {
          rainfallIntensityMmHr: telemetry.current.rainfallMmHr,
          temperatureC: telemetry.current.temperatureC,
          humidityPct: telemetry.current.humidityPct,
          windKmh: telemetry.current.windKmh,
          pressureMb: telemetry.current.pressureMb,
          condition: telemetry.current.conditionText,
          elevationM: telemetry.current.elevationM,
          weatherSource: telemetry.sources.weather.provider,
        },
        estimates: {
          accumulated24hMm: telemetry.current.accumulated24hMm,
          soilMoisturePct: telemetry.current.soilMoisturePct,
          modelledDrainageCapacityPct: telemetry.current.drainageCapacityPct,
        },
        deterministicRiskModel: {
          currentScore: telemetry.risk.currentScore,
          sixHourForecastScore: telemetry.risk.sixHourScore,
          twelveHourForecastScore: telemetry.risk.twelveHourScore,
          twentyFourHourForecastScore: telemetry.risk.twentyFourHourScore,
          category: telemetry.risk.category,
          confidence: telemetry.risk.confidenceLabel,
          uncertaintyPlusMinus: telemetry.risk.uncertaintyPlusMinus,
          contributingFactors: telemetry.risk.contributingFactors,
        },
        next6HoursForecast: telemetry.hourlyForecast.slice(0, 6).map((h) => ({
          hour: h.hourLabel,
          rainMm: h.rainMm,
          probPct: h.rainProbPct,
        })),
        activeAlerts: telemetry.alerts.map((a) => ({ title: a.title, severity: a.severity })),
        demonstrationLocalZones: city.zones.map((z) => ({
          id: z.id,
          name: z.name,
          locality: z.locality,
          elevationM: z.elevationM,
          drainageSensitivity: z.drainageSensitivity,
        })),
      };

      const requestConfig = {
        systemInstruction:
          'You are MEGHDRISHTI Hydrological Risk Explainer for Indian cities. STRICT RULES: (1) Never invent meteorological readings, radar data, or sensor measurements that are null or absent in the input JSON. (2) Clearly distinguish between Observed Conditions, Weather Forecasts, and Model Estimates. (3) Never claim to be an official IMD or NDMA emergency-warning authority. (4) Keep explanations concise, scientifically grounded, and practical for Indian citizens and urban disaster teams.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plainLanguageSummary: {
              type: Type.STRING,
              description: '2-3 sentence citizen-friendly summary of current rainfall and flood risk conditions.',
            },
            technicalInterpretation: {
              type: Type.STRING,
              description: 'Concise hydrological interpretation referencing rainfall vs drainage design threshold, soil saturation, and terrain.',
            },
            horizonForecasts: {
              type: Type.OBJECT,
              properties: {
                sixHour: { type: Type.STRING, description: 'Explanation of the +6h risk trajectory.' },
                twelveHour: { type: Type.STRING, description: 'Explanation of the +12h risk trajectory.' },
                twentyFourHour: { type: Type.STRING, description: 'Explanation of the +24h risk trajectory.' },
              },
              required: ['sixHour', 'twelveHour', 'twentyFourHour'],
            },
            keyDrivers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-4 concise bullet drivers citing exact input readings.',
            },
            preparednessActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-4 actionable preparedness steps appropriate to the current risk level.',
            },
            uncertaintyAndLimitations: {
              type: Type.STRING,
              description: 'Transparent statement of forecast uncertainty, missing sensors, and decision-support limitations.',
            },
            zoneNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  zoneId: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['zoneId', 'explanation'],
              },
            },
          },
          required: [
            'plainLanguageSummary',
            'technicalInterpretation',
            'horizonForecasts',
            'keyDrivers',
            'preparednessActions',
            'uncertaintyAndLimitations',
            'zoneNotes',
          ],
        },
      };

      const contentsPrompt = `Analyze this urban flood telemetry & deterministic risk model output for ${city.name}, India and produce a structured, transparent explanation:\n\n${JSON.stringify(promptPayload, null, 2)}`;

      let usedModel = 'gemini-4-hydrogen';
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: contentsPrompt,
          config: {
            ...requestConfig,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          usedModel = 'gemini-3.1-flash-lite';
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: contentsPrompt,
            config: {
              ...requestConfig,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        } else {
          throw primaryErr;
        }
      }

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as {
        plainLanguageSummary: string;
        technicalInterpretation: string;
        horizonForecasts: { sixHour: string; twelveHour: string; twentyFourHour: string };
        keyDrivers: string[];
        preparednessActions: string[];
        uncertaintyAndLimitations: string;
        zoneNotes?: Array<{ zoneId: string; explanation: string }>;
      };

      const zoneExplanations: Record<string, string> = {};
      if (Array.isArray(parsed.zoneNotes)) {
        for (const z of parsed.zoneNotes) {
          zoneExplanations[z.zoneId] = z.explanation;
        }
      }

      const result: AiRiskAssessmentPayload = {
        cityId: city.id,
        cityName: city.name,
        generatedAt: new Date().toISOString(),
        model: usedModel,
        plainLanguageSummary: parsed.plainLanguageSummary,
        technicalInterpretation: parsed.technicalInterpretation,
        horizonForecasts: parsed.horizonForecasts,
        keyDrivers: parsed.keyDrivers,
        preparednessActions: parsed.preparednessActions,
        uncertaintyAndLimitations: parsed.uncertaintyAndLimitations,
        zoneExplanations,
      };

      setCached(cacheKey, result, 20 * 60 * 1000);
      res.json(result);
    } catch (err: any) {
      const msg = err?.message || 'Gemini AI request failed';
      const status = err?.status || (msg.includes('403') || msg.includes('PERMISSION_DENIED') ? 403 : msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429 : 502);
      res.status(status).json({
        error:
          status === 403 || status === 400
            ? 'Gemini API authentication error. Please verify GEMINI_API_KEY in Settings > Secrets.'
            : status === 429
            ? 'Gemini API rate/quota limit reached. Please retry shortly or check quota in Settings > Secrets.'
            : `Gemini AI assessment failed: ${msg}`,
        code: status === 429 ? 'QUOTA_EXCEEDED' : 'AI_ERROR',
      });
    }
  });

  // Google Places API (New) Proxy for Relief Centres & Emergency Facilities
  app.get('/api/places/relief', async (req: Request, res: Response) => {
    const cityIdRaw = String(req.query.cityId || 'mumbai').toLowerCase();
    const category = String(req.query.category || 'all') as ReliefCategory | 'all';
    const searchQuery = String(req.query.query || '').trim().slice(0, 80);

    if (!isValidCityId(cityIdRaw)) {
      res.status(400).json({ error: `Invalid cityId '${cityIdRaw}'` });
      return;
    }

    const city = CITY_MAP[cityIdRaw];
    const cacheKey = `places:${cityIdRaw}:${category}:${searchQuery.toLowerCase()}`;
    const cached = getCached<{ places: ReliefPlace[]; source: string; fetchedAt: string }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const mapsKey = getMapsApiKey();
    if (!mapsKey) {
      res.status(503).json({
        error: 'Google Maps API key is not configured on the server.',
        code: 'MAPS_KEY_MISSING',
      });
      return;
    }

    const fieldMask =
      'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.nationalPhoneNumber,places.googleMapsUri,places.googleMapsLinks,places.businessStatus,places.currentOpeningHours.openNow';

    try {
      const fetchPlacesCall = async (
        endpoint: 'places:searchNearby' | 'places:searchText',
        body: Record<string, unknown>,
        mappedCategory: ReliefCategory
      ): Promise<{ places: ReliefPlace[]; quotaExceeded?: boolean; errorMsg?: string }> => {
        const resp = await fetch(`https://places.googleapis.com/v1/${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': fieldMask,
            'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
          },
          body: JSON.stringify(body),
        });

        const data = await resp.json() as any;
        if (resp.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED') {
          return { places: [], quotaExceeded: true, errorMsg: data?.error?.message || 'Places API quota exceeded' };
        }
        if (!resp.ok) {
          return { places: [], errorMsg: data?.error?.message || `Places API HTTP ${resp.status}` };
        }

        const items = Array.isArray(data.places) ? data.places : [];
        const mapped: ReliefPlace[] = items
          .filter((p: any) => p.location?.latitude && p.location?.longitude)
          .map((p: any) => {
            const lat = p.location.latitude;
            const lng = p.location.longitude;
            const pid = p.id || p.name?.replace('places/', '') || '';
            const directionsUri =
              p.googleMapsLinks?.directionsUri ||
              `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${pid ? `&destination_place_id=${encodeURIComponent(pid)}` : ''}`;
            const googleMapsUri =
              p.googleMapsUri ||
              p.googleMapsLinks?.placeUri ||
              `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
            return {
              id: pid || `${lat}-${lng}`,
              name: p.displayName?.text || 'Unnamed Facility',
              address: p.formattedAddress || `${city.name}, ${city.state}`,
              lat,
              lng,
              category: mappedCategory,
              primaryTypeLabel: p.primaryTypeDisplayName?.text || p.primaryType || mappedCategory.replace('_', ' '),
              phone: p.nationalPhoneNumber ?? null,
              openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
              businessStatus: p.businessStatus ?? null,
              googleMapsUri,
              directionsUri,
            };
          });
        return { places: mapped };
      };

      let results: ReliefPlace[] = [];
      if (searchQuery) {
        const resText = await fetchPlacesCall(
          'places:searchText',
          {
            textQuery: `${searchQuery} ${city.name} India`,
            maxResultCount: 12,
            locationBias: {
              circle: {
                center: { latitude: city.lat, longitude: city.lng },
                radius: 25000.0,
              },
            },
          },
          category === 'all' ? 'hospital' : category
        );
        if (resText.quotaExceeded) {
          res.status(429).json({ error: resText.errorMsg, code: 'QUOTA_EXCEEDED' });
          return;
        }
        if (resText.errorMsg && resText.places.length === 0) {
          res.status(502).json({ error: resText.errorMsg });
          return;
        }
        results = resText.places;
      } else if (category === 'shelter_civic') {
        const resShelter = await fetchPlacesCall(
          'places:searchText',
          {
            textQuery: `emergency disaster relief centre public shelter community hall ${city.name}`,
            maxResultCount: 10,
            locationBias: {
              circle: {
                center: { latitude: city.lat, longitude: city.lng },
                radius: 20000.0,
              },
            },
          },
          'shelter_civic'
        );
        if (resShelter.quotaExceeded) {
          res.status(429).json({ error: resShelter.errorMsg, code: 'QUOTA_EXCEEDED' });
          return;
        }
        if (resShelter.errorMsg && resShelter.places.length === 0) {
          res.status(502).json({ error: resShelter.errorMsg });
          return;
        }
        results = resShelter.places;
      } else if (category === 'hospital' || category === 'fire_station' || category === 'police') {
        const resNearby = await fetchPlacesCall(
          'places:searchNearby',
          {
            includedTypes: [category],
            maxResultCount: 12,
            rankPreference: 'DISTANCE',
            locationRestriction: {
              circle: {
                center: { latitude: city.lat, longitude: city.lng },
                radius: 15000.0,
              },
            },
          },
          category
        );
        if (resNearby.quotaExceeded) {
          res.status(429).json({ error: resNearby.errorMsg, code: 'QUOTA_EXCEEDED' });
          return;
        }
        if (resNearby.errorMsg && resNearby.places.length === 0) {
          res.status(502).json({ error: resNearby.errorMsg });
          return;
        }
        results = resNearby.places;
      } else {
        // 'all' — fetch compact balanced batch (2 calls: hospitals + fire/police) to respect demo quota
        const [hospRes, emergRes] = await Promise.all([
          fetchPlacesCall(
            'places:searchNearby',
            {
              includedTypes: ['hospital'],
              maxResultCount: 6,
              rankPreference: 'DISTANCE',
              locationRestriction: {
                circle: {
                  center: { latitude: city.lat, longitude: city.lng },
                  radius: 12000.0,
                },
              },
            },
            'hospital'
          ),
          fetchPlacesCall(
            'places:searchNearby',
            {
              includedTypes: ['fire_station', 'police'],
              maxResultCount: 6,
              rankPreference: 'DISTANCE',
              locationRestriction: {
                circle: {
                  center: { latitude: city.lat, longitude: city.lng },
                  radius: 15000.0,
                },
              },
            },
            'fire_station'
          ),
        ]);

        if (hospRes.quotaExceeded || emergRes.quotaExceeded) {
          res.status(429).json({
            error: hospRes.errorMsg || emergRes.errorMsg || 'Google Places API quota exceeded',
            code: 'QUOTA_EXCEEDED',
          });
          return;
        }
        if (hospRes.errorMsg && emergRes.errorMsg && hospRes.places.length === 0 && emergRes.places.length === 0) {
          res.status(502).json({ error: hospRes.errorMsg });
          return;
        }
        const taggedEmerg = emergRes.places.map((p) => ({
          ...p,
          category: (p.primaryTypeLabel.toLowerCase().includes('police') ? 'police' : 'fire_station') as ReliefCategory,
        }));
        results = [...hospRes.places, ...taggedEmerg];
      }

      const payload = {
        places: results,
        source: 'Google Places API (New)',
        fetchedAt: new Date().toISOString(),
      };
      setCached(cacheKey, payload, 6 * 60 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Google Places API query failed',
      });
    }
  });

  // Historical Rainfall Archive (Open-Meteo ERA5/Archive + Documented Flood Events)
  app.get('/api/historical/:cityId', async (req: Request, res: Response) => {
    const cityId = String(req.params.cityId || '').toLowerCase();
    if (!isValidCityId(cityId)) {
      res.status(400).json({ error: `Invalid cityId '${cityId}'` });
      return;
    }

    const city = CITY_MAP[cityId];
    const yesterday = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const defaultEnd = yesterday.toISOString().slice(0, 10);
    const defaultStartDate = new Date(yesterday.getTime() - 90 * 24 * 60 * 60 * 1000);
    const defaultStart = defaultStartDate.toISOString().slice(0, 10);

    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.startDate || ''))
      ? String(req.query.startDate)
      : defaultStart;
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.endDate || ''))
      ? String(req.query.endDate)
      : defaultEnd;

    const cacheKey = `hist:${cityId}:${startDate}:${endDate}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const url = new URL('https://archive-api.open-meteo.com/v1/archive');
      url.searchParams.set('latitude', String(city.lat));
      url.searchParams.set('longitude', String(city.lng));
      url.searchParams.set('start_date', startDate);
      url.searchParams.set('end_date', endDate);
      url.searchParams.set('daily', 'precipitation_sum,rain_sum,temperature_2m_max,temperature_2m_min');
      url.searchParams.set('timezone', 'Asia/Kolkata');

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        res.status(502).json({ error: `Historical archive returned HTTP ${resp.status}`, details: txt.slice(0, 150) });
        return;
      }

      const data = await resp.json() as {
        daily?: {
          time: string[];
          precipitation_sum: Array<number | null>;
          rain_sum: Array<number | null>;
          temperature_2m_max: Array<number | null>;
          temperature_2m_min: Array<number | null>;
        };
      };

      const times = data.daily?.time ?? [];
      const dailyRecords: HistoricalDailyRecord[] = times.map((date, idx) => ({
        date,
        precipitationMm: data.daily?.precipitation_sum?.[idx] ?? null,
        rainMm: data.daily?.rain_sum?.[idx] ?? null,
        tempMaxC: data.daily?.temperature_2m_max?.[idx] ?? null,
        tempMinC: data.daily?.temperature_2m_min?.[idx] ?? null,
      }));

      // Calculate weekly and monthly aggregations
      const validPrecip = dailyRecords.filter((r) => typeof r.precipitationMm === 'number');
      const totalMm = validPrecip.reduce((s, r) => s + (r.precipitationMm ?? 0), 0);
      const meanDailyMm = validPrecip.length > 0 ? totalMm / validPrecip.length : 0;

      const anomalies = dailyRecords.map((r) => ({
        date: r.date,
        precipitationMm: r.precipitationMm,
        anomalyMm:
          typeof r.precipitationMm === 'number'
            ? Math.round((r.precipitationMm - meanDailyMm) * 10) / 10
            : null,
      }));

      const weeklyMap: Record<string, { weekLabel: string; totalMm: number; days: number }> = {};
      for (const r of dailyRecords) {
        const d = new Date(r.date);
        const dayOfWeek = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        if (!weeklyMap[key]) {
          weeklyMap[key] = { weekLabel: key, totalMm: 0, days: 0 };
        }
        if (typeof r.precipitationMm === 'number') {
          weeklyMap[key].totalMm = Math.round((weeklyMap[key].totalMm + r.precipitationMm) * 10) / 10;
          weeklyMap[key].days += 1;
        }
      }

      const monthlyMap: Record<string, { monthLabel: string; totalMm: number; rainyDays: number }> = {};
      for (const r of dailyRecords) {
        const key = r.date.slice(0, 7);
        if (!monthlyMap[key]) {
          monthlyMap[key] = { monthLabel: key, totalMm: 0, rainyDays: 0 };
        }
        if (typeof r.precipitationMm === 'number') {
          monthlyMap[key].totalMm = Math.round((monthlyMap[key].totalMm + r.precipitationMm) * 10) / 10;
          if (r.precipitationMm >= 2.5) monthlyMap[key].rainyDays += 1;
        }
      }

      const payload = {
        cityId: city.id,
        cityName: city.name,
        startDate,
        endDate,
        source: 'Open-Meteo Historical Weather Archive (ERA5 Reanalysis)',
        meanDailyMm: Math.round(meanDailyMm * 10) / 10,
        totalPeriodMm: Math.round(totalMm * 10) / 10,
        dailyRecords,
        weeklyTrends: Object.values(weeklyMap),
        monthlyTrends: Object.values(monthlyMap),
        anomalies,
        documentedEvents: HISTORICAL_FLOOD_EVENTS.filter((e) => e.cityId === city.id),
        allDocumentedEvents: HISTORICAL_FLOOD_EVENTS,
      };

      setCached(cacheKey, payload, 6 * 60 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: 'Failed to retrieve historical precipitation archive',
        details: err instanceof Error ? err.message : 'Network error',
      });
    }
  });

  // --- AI Environmental Vision: Gemini Multimodal Image Analysis ---
  app.post('/api/env-vision/analyze', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    const rawMime = String(req.body?.mimeType || '').toLowerCase().trim();
    const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedMimes.has(rawMime)) {
      res.status(400).json({
        error: 'Unsupported image format. Please capture or upload a JPEG, PNG, or WebP photograph.',
      });
      return;
    }

    let rawBase64 = String(req.body?.imageBase64 || '').trim();
    const dataUrlPrefixMatch = rawBase64.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
    if (dataUrlPrefixMatch) {
      rawBase64 = dataUrlPrefixMatch[2];
    }

    if (!rawBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(rawBase64)) {
      res.status(400).json({ error: 'Invalid base64 image payload.' });
      return;
    }

    const cleanBase64 = rawBase64.replace(/[\r\n]/g, '');
    const decodedBytes = Buffer.from(cleanBase64, 'base64').length;
    if (decodedBytes < 128) {
      res.status(400).json({ error: 'Uploaded image appears empty or corrupted.' });
      return;
    }
    if (decodedBytes > 6 * 1024 * 1024) {
      res.status(413).json({ error: 'Image exceeds 6 MB maximum size. Please upload a smaller image.' });
      return;
    }

    try {
      const systemInstruction = `You are MEGHDRISHTI Environmental Vision Analyst, a careful scientific computer-vision inspector.
Analyze ONLY the provided photograph for visible environmental indicators (smoke, dust, haze/smog, fog/mist, vehicle exhaust, industrial plumes, open burning, construction activity, dense traffic, or clear sky).

STRICT SCIENTIFIC HONESTY RULES:
1. NEVER invent or infer numeric PM2.5, PM10, AQI, NO2, O3, CO, or SO2 concentrations from a photograph. Always note in limitations that a photograph cannot measure invisible gas or particulate mass concentrations.
2. NEVER automatically classify natural clouds, shadows, golden-hour/sunset sky colours, ordinary light mist, night-time darkness/camera noise, or indoor scenes as air pollution.
3. If the sky/environment looks visually clean with good distant clarity, OR if it is an indoor scene, night-time darkness without visible smoke/dust, or a blurry/unusable image, set "noClearPollutionIndicator" to true.
   - For clear sky/clean visibility: visualCondition = "clear", visualPollutionIndicator = "none_clear".
   - For blurry, pitch dark, lens-blocked, or indoor images where outdoor air cannot be assessed: visualCondition = "unusable", visualPollutionIndicator = "indeterminate", visibility.category = "indeterminate".
4. Distinguish categories carefully:
   - SMOKE DETECTION: Distinct plumes, colour/density (white/grey/dark), approximate image location, stationary vs dispersing, and possible source ONLY if visually supported in the frame.
   - DUST DETECTION: Dust clouds, suspended particulate haze near ground/roads, road dust, construction dust, or dust-coated surroundings.
   - HAZE & SMOG: Diffuse atmospheric obscuration reducing contrast of distant skylines/buildings uniformly, vs localized smoke plumes.
   - FOG & MIST: Cool/moisture-laden low-visibility layers; explain cues distinguishing fog from pollution haze when visual evidence permits.
5. BOUNDING BOXES: Only include "boundingBox" ({ ymin, xmin, ymax, xmax } in integer 0..1000 normalized image coordinates) when an indicator occupies a clearly localizable region (e.g., a smoke plume, localized dust cloud, or distinct horizon haze band). Set boundingBox to null if the feature is absent or cannot be reliably localized. NEVER fabricate bounding boxes.
6. POSSIBLE SOURCES: Only list traffic, construction, industrial, road_dust, or open_burning when directly supported by visible evidence in the image. Otherwise return a single entry with source = "unknown", label = "Unknown / Not visually determinable", explaining why.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          visualCondition: {
            type: Type.STRING,
            description: 'One of: clear, hazy, dusty, smoke_visible, foggy, mixed, unusable',
          },
          visualConditionLabel: {
            type: Type.STRING,
            description: 'Human-readable status such as "Clear Sky / Good Visibility", "Urban Haze / Reduced Visibility", "Visible Smoke Plume", "Road / Construction Dust", "Foggy / Mist Layer", "Mixed Indicators", or "No Clear Visual Pollution Indicator (Indoor / Blurry / Dark)".',
          },
          visualPollutionIndicator: {
            type: Type.STRING,
            description: 'One of: none_clear, low, moderate, high, very_high, indeterminate',
          },
          noClearPollutionIndicator: {
            type: Type.BOOLEAN,
            description: 'True when no clear visible pollution indicator is present (clean sky, ordinary clouds, sunset tint, indoor scene, dark night, or unusable photo).',
          },
          confidence: {
            type: Type.NUMBER,
            description: 'Overall classification confidence between 0.0 and 1.0.',
          },
          sceneContext: {
            type: Type.STRING,
            description: 'Brief neutral description of what the photograph depicts (e.g., outdoor skyline, urban intersection, indoor room, night street, clear afternoon sky).',
          },
          imageQualityNote: {
            type: Type.STRING,
            description: 'Brief assessment of lighting, focus, dynamic range, or obstructions affecting visual reliability.',
          },
          detectedIndicators: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description: 'One of: smoke, dust, haze_smog, fog_mist, vehicle_exhaust, industrial_plume, open_burning, construction_activity, dense_traffic, clear_sky, other',
                },
                name: { type: Type.STRING },
                detected: { type: Type.BOOLEAN },
                description: { type: Type.STRING },
                imageLocation: { type: Type.STRING, description: 'Where in the frame (e.g., "upper-left skyline", "road surface foreground", "across distant horizon", "none").' },
                severity: { type: Type.STRING, description: 'One of: none, low, moderate, high, very_high' },
                confidence: { type: Type.NUMBER },
                movementOrDispersion: { type: Type.STRING, nullable: true },
                smokeAppearance: { type: Type.STRING, nullable: true },
                boundingBox: {
                  type: Type.OBJECT,
                  nullable: true,
                  properties: {
                    ymin: { type: Type.INTEGER },
                    xmin: { type: Type.INTEGER },
                    ymax: { type: Type.INTEGER },
                    xmax: { type: Type.INTEGER },
                  },
                  required: ['ymin', 'xmin', 'ymax', 'xmax'],
                },
              },
              required: ['type', 'name', 'detected', 'description', 'imageLocation', 'severity', 'confidence'],
            },
          },
          visibility: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING, description: 'One of: good, moderate, reduced, poor, indeterminate' },
              distantObjectClarity: { type: Type.STRING },
              atmosphericObstruction: { type: Type.STRING },
              visibilityReduced: { type: Type.BOOLEAN },
              description: { type: Type.STRING },
            },
            required: ['category', 'distantObjectClarity', 'atmosphericObstruction', 'visibilityReduced', 'description'],
          },
          possibleSources: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING, description: 'One of: traffic, construction, industrial, road_dust, open_burning, unknown' },
                label: { type: Type.STRING },
                evidence: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
              },
              required: ['source', 'label', 'evidence', 'confidence'],
            },
          },
          limitations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: [
          'visualCondition',
          'visualConditionLabel',
          'visualPollutionIndicator',
          'noClearPollutionIndicator',
          'confidence',
          'sceneContext',
          'imageQualityNote',
          'detectedIndicators',
          'visibility',
          'possibleSources',
          'limitations',
        ],
      };

      const imagePart = {
        inlineData: {
          mimeType: rawMime,
          data: cleanBase64,
        },
      };
      const textPart = {
        text: 'Inspect this photograph for visible environmental and air-clarity indicators (smoke plumes, dust clouds/road dust, atmospheric haze/smog, fog/mist, exhaust, construction dust, or clear visibility). Return only grounded visual observations in the requested JSON schema.',
      };

      let usedModel = 'gemini-4-hydrogen';
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts: [imagePart, textPart] },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          usedModel = 'gemini-3.1-flash-lite';
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: { parts: [imagePart, textPart] },
            config: {
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          });
        } else {
          throw primaryErr;
        }
      }

      const rawText = (response.text ?? '').trim();
      const parsed = JSON.parse(rawText) as Omit<EnvVisionAnalysisReport, 'modelUsed' | 'analyzedAt'>;

      const sanitizeBox = (box: EnvVisionBoundingBox | null | undefined): EnvVisionBoundingBox | null => {
        if (!box) return null;
        const ymin = Math.max(0, Math.min(1000, Math.round(Number(box.ymin))));
        const xmin = Math.max(0, Math.min(1000, Math.round(Number(box.xmin))));
        const ymax = Math.max(0, Math.min(1000, Math.round(Number(box.ymax))));
        const xmax = Math.max(0, Math.min(1000, Math.round(Number(box.xmax))));
        if (!Number.isFinite(ymin) || !Number.isFinite(xmin) || !Number.isFinite(ymax) || !Number.isFinite(xmax)) {
          return null;
        }
        if (ymax - ymin < 25 || xmax - xmin < 25) return null;
        return { ymin, xmin, ymax, xmax };
      };

      const mandatoryLimitation =
        'A photograph can identify visible environmental indicators but cannot directly measure PM2.5, PM10, AQI or harmful gas concentrations.';
      const rawLimits = Array.isArray(parsed.limitations) ? parsed.limitations.filter(Boolean) : [];
      const limitations = rawLimits.some((l) => l.toLowerCase().includes('pm2.5'))
        ? rawLimits
        : [mandatoryLimitation, ...rawLimits];

      const report: EnvVisionAnalysisReport = {
        ...parsed,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        detectedIndicators: Array.isArray(parsed.detectedIndicators)
          ? parsed.detectedIndicators.map((ind) => ({
              ...ind,
              confidence: Math.max(0, Math.min(1, Number(ind.confidence) || 0)),
              boundingBox: ind.detected ? sanitizeBox(ind.boundingBox) : null,
            }))
          : [],
        possibleSources:
          Array.isArray(parsed.possibleSources) && parsed.possibleSources.length > 0
            ? parsed.possibleSources.map((s) => ({
                ...s,
                confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
              }))
            : [
                {
                  source: 'unknown',
                  label: 'Unknown / Not visually determinable',
                  evidence: 'No identifiable pollution source is directly visible in the photograph.',
                  confidence: 0,
                },
              ],
        limitations,
        modelUsed: usedModel,
        analyzedAt: new Date().toISOString(),
      };

      res.json(report);
    } catch (err: any) {
      const msg = err?.message || 'Gemini Vision analysis failed';
      const status =
        err?.status ||
        (msg.includes('403') || msg.includes('PERMISSION_DENIED')
          ? 403
          : msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
          ? 429
          : 502);
      res.status(status).json({
        error:
          status === 403 || status === 400
            ? 'Gemini API authentication error. Please verify GEMINI_API_KEY in Settings > Secrets.'
            : status === 429
            ? 'Gemini API quota limit reached. Please retry shortly or verify quota in Settings > Secrets.'
            : `Environmental image analysis failed: ${msg}`,
        code: status === 429 ? 'QUOTA_EXCEEDED' : 'VISION_ERROR',
      });
    }
  });

  // --- AI Environmental Vision: Official/External Measured Air Quality + Weather + Optional Reverse Geocoding ---
  app.get('/api/env-vision/air-quality', async (req: Request, res: Response) => {
    const cityIdRaw = String(req.query.cityId || '').toLowerCase().trim();
    const latParam = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
    const lngParam = req.query.lng !== undefined ? Number(req.query.lng) : NaN;
    const reverseGeo = req.query.reverseGeocode === 'true';

    let lat: number;
    let lng: number;
    let defaultLabel: string;

    if (Number.isFinite(latParam) && Number.isFinite(lngParam)) {
      if (latParam < -90 || latParam > 90 || lngParam < -180 || lngParam > 180) {
        res.status(400).json({ error: 'Coordinates out of valid geographic bounds.' });
        return;
      }
      lat = latParam;
      lng = lngParam;
      defaultLabel = `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
    } else if (cityIdRaw && isValidCityId(cityIdRaw)) {
      const city = CITY_MAP[cityIdRaw];
      lat = city.lat;
      lng = city.lng;
      defaultLabel = `${city.name}, ${city.state}`;
    } else {
      res.status(400).json({
        error: 'Location required. Select a city or grant location permission to fetch air quality measurements.',
      });
      return;
    }

    const cacheKey = `env-aq:${lat.toFixed(3)}:${lng.toFixed(3)}:${reverseGeo ? 'rg' : 'no'}`;
    const cached = getCached<EnvVisionExternalContextResponse>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const [gmpAq, weather, geo] = await Promise.all([
        fetchGoogleAirQuality(lat, lng),
        fetchEnvWeatherContext(lat, lng),
        reverseGeo
          ? reverseGeocodeCoordinates(lat, lng)
          : Promise.resolve({ label: null, city: null, locality: null }),
      ]);

      let airQuality = gmpAq;
      if (!gmpAq.available) {
        const fallbackAq = await fetchOpenMeteoAirQualityFallback(lat, lng, gmpAq.errorMessage);
        if (fallbackAq.available) {
          airQuality = {
            ...fallbackAq,
            quotaExceeded: gmpAq.quotaExceeded || fallbackAq.quotaExceeded,
          };
        }
      }

      const payload: EnvVisionExternalContextResponse = {
        locationLabel: geo.label ?? defaultLabel,
        resolvedCity: geo.city,
        resolvedLocality: geo.locality,
        lat,
        lng,
        airQuality,
        weather,
        fetchedAt: new Date().toISOString(),
      };

      setCached(cacheKey, payload, 15 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: 'Failed to retrieve external air quality and meteorological context',
        details: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  // --- MEGHDRISHTI 2.0: Dedicated Air Quality Intelligence (Current + 24h History) ---
  app.get('/api/air-quality', async (req: Request, res: Response) => {
    const cityIdRaw = String(req.query.cityId || '').toLowerCase().trim();
    const latParam = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
    const lngParam = req.query.lng !== undefined ? Number(req.query.lng) : NaN;
    const refresh = req.query.refresh === 'true';

    let lat: number;
    let lng: number;
    let locationLabel: string;
    let resolvedCityId: string | null = null;

    if (Number.isFinite(latParam) && Number.isFinite(lngParam)) {
      if (latParam < -90 || latParam > 90 || lngParam < -180 || lngParam > 180) {
        res.status(400).json({ error: 'Coordinates out of valid bounds.' });
        return;
      }
      lat = latParam;
      lng = lngParam;
      locationLabel = `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
    } else if (cityIdRaw && isValidCityId(cityIdRaw)) {
      const city = CITY_MAP[cityIdRaw];
      lat = city.lat;
      lng = city.lng;
      locationLabel = `${city.name}, ${city.state}`;
      resolvedCityId = city.id;
    } else {
      const fallbackCity = CITY_MAP.mumbai;
      lat = fallbackCity.lat;
      lng = fallbackCity.lng;
      locationLabel = `${fallbackCity.name}, ${fallbackCity.state}`;
      resolvedCityId = fallbackCity.id;
    }

    const cacheKey = `aq-intel:v1:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    if (!refresh) {
      const cached = getCached<AirQualityIntelResponse>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    const fetchAqHistory = async (): Promise<{ points: AirQualityHistoryPoint[]; source: string }> => {
      const mapsKey = getMapsApiKey();
      if (mapsKey) {
        try {
          const resp = await fetch(
            `https://airquality.googleapis.com/v1/history:lookup?key=${encodeURIComponent(mapsKey)}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
              },
              body: JSON.stringify({
                hours: 24,
                pageSize: 24,
                location: { latitude: lat, longitude: lng },
                universalAqi: true,
                extraComputations: ['LOCAL_AQI', 'POLLUTANT_CONCENTRATION'],
                languageCode: 'en',
              }),
            }
          );
          if (resp.ok) {
            const histData = (await resp.json()) as {
              hoursInfo?: Array<{
                dateTime?: string;
                indexes?: Array<{ code?: string; aqi?: number; category?: string }>;
                pollutants?: Array<{ code?: string; concentration?: { value?: number } }>;
              }>;
            };
            const list = Array.isArray(histData.hoursInfo) ? histData.hoursInfo : [];
            if (list.length > 0) {
              const points: AirQualityHistoryPoint[] = list
                .slice()
                .reverse()
                .map((h) => {
                  const idxs = h.indexes ?? [];
                  const primary = idxs.find((i) => i.code && i.code !== 'uaqi') ?? idxs[0];
                  const pm25 = h.pollutants?.find((p) => p.code?.toLowerCase() === 'pm25')?.concentration?.value ?? null;
                  const pm10 = h.pollutants?.find((p) => p.code?.toLowerCase() === 'pm10')?.concentration?.value ?? null;
                  const iso = h.dateTime ?? new Date().toISOString();
                  return {
                    timeIso: iso,
                    hourLabel: formatIstHourLabel(iso),
                    aqi: typeof primary?.aqi === 'number' ? primary.aqi : null,
                    pm25: typeof pm25 === 'number' ? Math.round(pm25 * 10) / 10 : null,
                    pm10: typeof pm10 === 'number' ? Math.round(pm10 * 10) / 10 : null,
                    category: primary?.category ?? null,
                  };
                });
              return { points, source: 'Google Maps Platform Air Quality History API (24h)' };
            }
          }
        } catch {
          // Fall back cleanly to Open-Meteo CAMS history below
        }
      }

      try {
        const omUrl = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
        omUrl.searchParams.set('latitude', String(lat));
        omUrl.searchParams.set('longitude', String(lng));
        omUrl.searchParams.set('hourly', 'pm10,pm2_5,us_aqi');
        omUrl.searchParams.set('past_days', '1');
        omUrl.searchParams.set('forecast_days', '1');
        omUrl.searchParams.set('timezone', 'Asia/Kolkata');

        const omResp = await fetch(omUrl.toString());
        if (omResp.ok) {
          const omJson = (await omResp.json()) as {
            hourly?: {
              time?: string[];
              pm10?: Array<number | null>;
              pm2_5?: Array<number | null>;
              us_aqi?: Array<number | null>;
            };
          };
          const times = omJson.hourly?.time ?? [];
          const nowMs = Date.now();
          let curIdx = times.length - 1;
          let bestDiff = Infinity;
          for (let i = 0; i < times.length; i++) {
            const diff = Math.abs(nowMs - new Date(`${times[i]}+05:30`).getTime());
            if (diff < bestDiff) {
              bestDiff = diff;
              curIdx = i;
            }
          }
          const start = Math.max(0, curIdx - 23);
          const points: AirQualityHistoryPoint[] = [];
          for (let i = start; i <= curIdx; i++) {
            const iso = `${times[i]}+05:30`;
            points.push({
              timeIso: iso,
              hourLabel: formatIstHourLabel(iso),
              aqi: typeof omJson.hourly?.us_aqi?.[i] === 'number' ? Math.round(omJson.hourly.us_aqi[i] as number) : null,
              pm25: typeof omJson.hourly?.pm2_5?.[i] === 'number' ? Math.round((omJson.hourly.pm2_5[i] as number) * 10) / 10 : null,
              pm10: typeof omJson.hourly?.pm10?.[i] === 'number' ? Math.round((omJson.hourly.pm10[i] as number) * 10) / 10 : null,
              category: null,
            });
          }
          if (points.length > 0) {
            return { points, source: 'Open-Meteo CAMS Atmospheric Reanalysis (24h)' };
          }
        }
      } catch {
        // Return empty array transparently if both fail
      }
      return { points: [], source: 'Historical trend unavailable' };
    };

    try {
      const [gmpAq, weather, histRes, geo] = await Promise.all([
        fetchGoogleAirQuality(lat, lng),
        fetchEnvWeatherContext(lat, lng),
        fetchAqHistory(),
        Number.isFinite(latParam) && Number.isFinite(lngParam)
          ? reverseGeocodeCoordinates(lat, lng)
          : Promise.resolve({ label: null, city: null, locality: null }),
      ]);

      let airQuality = gmpAq;
      if (!gmpAq.available) {
        const fallbackAq = await fetchOpenMeteoAirQualityFallback(lat, lng, gmpAq.errorMessage);
        if (fallbackAq.available) {
          airQuality = {
            ...fallbackAq,
            quotaExceeded: gmpAq.quotaExceeded || fallbackAq.quotaExceeded,
          };
        }
      }

      const payload: AirQualityIntelResponse = {
        locationLabel: geo.label ?? locationLabel,
        cityId: resolvedCityId,
        lat,
        lng,
        airQuality,
        weather,
        history: histRes.points,
        historySource: histRes.source,
        fetchedAt: new Date().toISOString(),
      };

      setCached(cacheKey, payload, 15 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error: 'Failed to retrieve Air Quality Intelligence',
        details: err instanceof Error ? err.message : 'Upstream error',
      });
    }
  });

  // --- MEGHDRISHTI 2.0: Live Precipitation Radar Frames (RainViewer API) ---
  app.get('/api/radar/frames', async (_req: Request, res: Response) => {
    const cacheKey = 'radar:rainviewer:v1';
    const cached = getCached<RadarFramesResponse>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const nowIso = new Date().toISOString();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const resp = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const fail: RadarFramesResponse = {
          available: false,
          host: null,
          frames: [],
          generatedAt: null,
          attribution: 'RainViewer Weather Radar API',
          reason: `Radar feed returned HTTP ${resp.status}.`,
          fetchedAt: nowIso,
        };
        setCached(cacheKey, fail, 2 * 60 * 1000);
        res.json(fail);
        return;
      }

      const data = (await resp.json()) as {
        host?: string;
        generated?: number;
        radar?: {
          past?: Array<{ time: number; path: string }>;
          nowcast?: Array<{ time: number; path: string }>;
        };
      };

      const host = data.host || 'https://tilecache.rainviewer.com';
      const past = Array.isArray(data.radar?.past) ? data.radar!.past : [];
      const nowcast = Array.isArray(data.radar?.nowcast) ? data.radar!.nowcast : [];

      const mapFrame = (f: { time: number; path: string }, kind: 'past' | 'nowcast'): RadarFrameInfo => {
        const timeIso = new Date(f.time * 1000).toISOString();
        return {
          time: f.time,
          timeIso,
          labelIst: `${formatIstHourLabel(timeIso)} IST`,
          path: f.path,
          tileUrlTemplate: `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
          kind,
        };
      };

      const frames: RadarFrameInfo[] = [
        ...past.slice(-6).map((f) => mapFrame(f, 'past')),
        ...nowcast.slice(0, 3).map((f) => mapFrame(f, 'nowcast')),
      ];

      const payload: RadarFramesResponse = {
        available: frames.length > 0,
        host,
        frames,
        generatedAt: data.generated ?? null,
        attribution: 'RainViewer Public Precipitation Radar',
        reason: frames.length === 0 ? 'No active radar frames returned.' : undefined,
        fetchedAt: nowIso,
      };
      setCached(cacheKey, payload, 5 * 60 * 1000);
      res.json(payload);
    } catch (err) {
      const fail: RadarFramesResponse = {
        available: false,
        host: null,
        frames: [],
        generatedAt: null,
        attribution: 'RainViewer Public Precipitation Radar',
        reason: err instanceof Error ? `Radar layer unreachable: ${err.message}` : 'Radar layer unavailable',
        fetchedAt: nowIso,
      };
      setCached(cacheKey, fail, 2 * 60 * 1000);
      res.json(fail);
    }
  });

  // --- MEGHDRISHTI 2.0: Gemini Grounded Weather Intelligence Summary ---
  app.post('/api/ai/weather-summary', async (req: Request, res: Response) => {
    const cityIdRaw = String(req.body?.cityId || '').toLowerCase();
    const forceRefresh = Boolean(req.body?.forceRefresh);
    if (!isValidCityId(cityIdRaw)) {
      res.status(400).json({ error: `Invalid cityId '${cityIdRaw}'` });
      return;
    }

    const cacheKey = `ai-weather:${cityIdRaw}`;
    if (!forceRefresh) {
      const cached = getCached<AiWeatherSummaryPayload>(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured on the server.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    try {
      const telemetry = await buildCityTelemetry(cityIdRaw, false);
      const city = telemetry.city;

      const inputSummary = {
        city: city.name,
        state: city.state,
        current: {
          temperatureC: telemetry.current.temperatureC,
          feelsLikeC: telemetry.current.feelsLikeC,
          tempMaxC: telemetry.current.tempMaxC,
          tempMinC: telemetry.current.tempMinC,
          condition: telemetry.current.conditionText,
          rainfallMmHr: telemetry.current.rainfallMmHr,
          accumulated24hMm: telemetry.current.accumulated24hMm,
          humidityPct: telemetry.current.humidityPct,
          windKmh: telemetry.current.windKmh,
          windCardinal: telemetry.current.windCardinal,
          uvIndex: telemetry.current.uvIndex,
          visibilityKm: telemetry.current.visibilityKm,
          pressureMb: telemetry.current.pressureMb,
        },
        nextHours: telemetry.hourlyForecast.slice(0, 8).map((h) => ({
          hour: h.hourLabel,
          tempC: h.tempC,
          rainMm: h.rainMm,
          probPct: h.rainProbPct,
          condition: h.conditionText,
        })),
        floodRiskScore: telemetry.risk.currentScore,
        floodRiskCategory: telemetry.risk.category,
        activeAlerts: telemetry.alerts.map((a) => a.title),
      };

      const config = {
        systemInstruction:
          'You are MEGHDRISHTI Weather Intelligence Briefer. Summarize ONLY the weather & flood telemetry provided in the JSON input. Never invent readings that are null. Write clear, crisp, natural meteorological prose useful for daily planning in India.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: 'Crisp 6-10 word headline of current sky and weather outlook.' },
            summary: { type: Type.STRING, description: '2 concise sentences summarizing current conditions, temperature feel, and next-8h rain/sky trend.' },
            highlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 short practical highlights (commute, rain window, UV/humidity/wind).',
            },
            advisoryNote: { type: Type.STRING, description: '1 sentence transparent note referencing official IMD / local alerts status.' },
          },
          required: ['headline', 'summary', 'highlights', 'advisoryNote'],
        },
      };

      let usedModel = 'gemini-4-hydrogen';
      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Provide a live weather briefing for ${city.name}:\n${JSON.stringify(inputSummary, null, 2)}`,
          config: { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
        });
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
          usedModel = 'gemini-3.1-flash-lite';
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Provide a live weather briefing for ${city.name}:\n${JSON.stringify(inputSummary, null, 2)}`,
            config: { ...config, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
          });
        } else {
          throw primaryErr;
        }
      }

      const parsed = JSON.parse((response.text ?? '').trim()) as Omit<
        AiWeatherSummaryPayload,
        'cityId' | 'cityName' | 'generatedAt' | 'model'
      >;

      const result: AiWeatherSummaryPayload = {
        cityId: city.id,
        cityName: city.name,
        generatedAt: new Date().toISOString(),
        model: usedModel,
        headline: parsed.headline,
        summary: parsed.summary,
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        advisoryNote: parsed.advisoryNote,
      };
      setCached(cacheKey, result, 20 * 60 * 1000);
      res.json(result);
    } catch (err: any) {
      const msg = err?.message || 'Gemini weather summary failed';
      res.status(err?.status || 502).json({ error: msg });
    }
  });

  // Export a configured Express app for Vercel Serverless Functions
async function createApp() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  return app;
}

const appPromise = createApp();

if (!process.env.VERCEL) {
  appPromise.then((readyApp) => {
    readyApp.listen(PORT, '0.0.0.0', () => {
      console.log(`MEGHDRISHTI server listening on http://0.0.0.0:${PORT}`);
    });
  });
}

export default appPromise;
