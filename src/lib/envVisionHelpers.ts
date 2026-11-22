import type {
  EnvVisionAnalysisReport,
  EnvVisionCondition,
  EnvVisionPollutionIndicatorLevel,
  EnvVisionRecommendation,
  MeasuredAirQualityData,
} from '../types/flood.ts';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB

export interface PreparedVisionImage {
  dataUrl: string;
  base64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  byteSize: number;
  thumbnailDataUrl: string;
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image file.'));
    img.src = src;
  });
}

function renderCanvasScaled(
  img: HTMLImageElement,
  maxDim: number,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  quality: number
): { dataUrl: string; width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable.');
  }
  ctx.drawImage(img, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL(mimeType, quality),
    width,
    height,
  };
}

export async function prepareImageFromFile(file: File): Promise<PreparedVisionImage> {
  const normalizedType = file.type.toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(normalizedType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    throw new Error('Unsupported file format. Please upload a JPEG, PNG, or WebP photograph.');
  }
  if (file.size === 0) {
    throw new Error('The selected file is empty.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Original image exceeds 20 MB. Please choose a smaller photograph.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await loadImageElement(rawDataUrl);
  const thumb = renderCanvasScaled(img, 260, 'image/jpeg', 0.72);

  // Use original if already <= 4 MB and <= 1800px; otherwise resize smoothly to <= 1600px JPEG
  const rawBase64 = rawDataUrl.split(',')[1] || '';
  const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
  if (file.size <= 4 * 1024 * 1024 && maxDim <= 1800) {
    return {
      dataUrl: rawDataUrl,
      base64: rawBase64,
      mimeType: normalizedType as 'image/jpeg' | 'image/png' | 'image/webp',
      width: img.naturalWidth,
      height: img.naturalHeight,
      byteSize: file.size,
      thumbnailDataUrl: thumb.dataUrl,
    };
  }

  const scaled = renderCanvasScaled(img, 1600, 'image/jpeg', 0.86);
  const scaledBase64 = scaled.dataUrl.split(',')[1] || '';
  const byteSize = estimateBase64Bytes(scaledBase64);
  if (byteSize > MAX_IMAGE_BYTES) {
    const tight = renderCanvasScaled(img, 1280, 'image/jpeg', 0.78);
    const tightBase64 = tight.dataUrl.split(',')[1] || '';
    return {
      dataUrl: tight.dataUrl,
      base64: tightBase64,
      mimeType: 'image/jpeg',
      width: tight.width,
      height: tight.height,
      byteSize: estimateBase64Bytes(tightBase64),
      thumbnailDataUrl: thumb.dataUrl,
    };
  }

  return {
    dataUrl: scaled.dataUrl,
    base64: scaledBase64,
    mimeType: 'image/jpeg',
    width: scaled.width,
    height: scaled.height,
    byteSize,
    thumbnailDataUrl: thumb.dataUrl,
  };
}

export async function captureFrameFromVideo(video: HTMLVideoElement): Promise<PreparedVisionImage> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Camera stream is not ready yet. Please wait a moment and try again.');
  }
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to access canvas for image capture.');
  ctx.drawImage(video, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  const base64 = dataUrl.split(',')[1] || '';

  // Thumbnail
  const thumbScale = Math.min(1, 260 / Math.max(video.videoWidth, video.videoHeight));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(video.videoWidth * thumbScale));
  thumbCanvas.height = Math.max(1, Math.round(video.videoHeight * thumbScale));
  const tCtx = thumbCanvas.getContext('2d');
  tCtx?.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);

  return {
    dataUrl,
    base64,
    mimeType: 'image/jpeg',
    width,
    height,
    byteSize: estimateBase64Bytes(base64),
    thumbnailDataUrl: thumbCanvas.toDataURL('image/jpeg', 0.72),
  };
}

export function getPollutionIndicatorBadge(level: EnvVisionPollutionIndicatorLevel): {
  label: string;
  classes: string;
} {
  switch (level) {
    case 'none_clear':
      return {
        label: 'NO CLEAR VISUAL POLLUTION INDICATOR',
        classes:
          'text-[#047857] bg-[#ECFDF5] border-[#A7F3D0] dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30',
      };
    case 'low':
      return {
        label: 'LOW VISUAL INDICATOR',
        classes:
          'text-[#047857] bg-[#ECFDF5] border-[#A7F3D0] dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-500/30',
      };
    case 'moderate':
      return {
        label: 'MODERATE VISUAL INDICATOR',
        classes:
          'text-[#B45309] bg-[#FFFBEB] border-[#FDE68A] dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30',
      };
    case 'high':
      return {
        label: 'HIGH VISUAL INDICATOR',
        classes:
          'text-[#C2410C] bg-[#FFF7ED] border-[#FED7AA] dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/30',
      };
    case 'very_high':
      return {
        label: 'VERY HIGH VISUAL INDICATOR',
        classes:
          'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA] dark:text-red-300 dark:bg-red-500/10 dark:border-red-500/30',
      };
    default:
      return {
        label: 'INDETERMINATE / UNUSABLE',
        classes:
          'text-slate-700 bg-slate-100 border-slate-300 dark:text-slate-300 dark:bg-slate-800/70 dark:border-slate-700',
      };
  }
}

export function getConditionLabel(cond: EnvVisionCondition): string {
  switch (cond) {
    case 'clear':
      return 'Clear';
    case 'hazy':
      return 'Hazy';
    case 'dusty':
      return 'Dusty';
    case 'smoke_visible':
      return 'Smoke Visible';
    case 'foggy':
      return 'Foggy / Mist';
    case 'mixed':
      return 'Mixed Indicators';
    default:
      return 'Indeterminate / Unusable';
  }
}

export function getIndicatorBoxColor(type: string): {
  stroke: string;
  fill: string;
  badgeBg: string;
} {
  switch (type) {
    case 'smoke':
    case 'open_burning':
    case 'industrial_plume':
      return {
        stroke: '#DC2626',
        fill: 'rgba(220, 38, 38, 0.12)',
        badgeBg: '#DC2626',
      };
    case 'dust':
    case 'construction_activity':
      return {
        stroke: '#D97706',
        fill: 'rgba(217, 119, 6, 0.14)',
        badgeBg: '#D97706',
      };
    case 'haze_smog':
    case 'vehicle_exhaust':
    case 'dense_traffic':
      return {
        stroke: '#7C3AED',
        fill: 'rgba(124, 58, 237, 0.10)',
        badgeBg: '#7C3AED',
      };
    case 'fog_mist':
      return {
        stroke: '#0D9488',
        fill: 'rgba(13, 148, 136, 0.10)',
        badgeBg: '#0D9488',
      };
    default:
      return {
        stroke: '#0284C7',
        fill: 'rgba(2, 132, 199, 0.10)',
        badgeBg: '#0284C7',
      };
  }
}

export function buildEnvVisionRecommendations(
  analysis: EnvVisionAnalysisReport | null,
  airQuality: MeasuredAirQualityData | null
): EnvVisionRecommendation[] {
  const recs: EnvVisionRecommendation[] = [];

  if (analysis) {
    const activeTypes = new Set(analysis.detectedIndicators.filter((i) => i.detected).map((i) => i.type));

    if (activeTypes.has('smoke') || activeTypes.has('open_burning') || activeTypes.has('industrial_plume')) {
      recs.push({
        title: 'Avoid Suspected Smoke Plumes',
        detail:
          'Visible smoke indicators were detected in the frame. Avoid approaching the suspected emission or burning source, move upwind if outdoors, and keep windows closed nearby.',
        basis: 'visual',
        priority: 'advisory',
      });
    }

    if (activeTypes.has('dust') || activeTypes.has('construction_activity')) {
      recs.push({
        title: 'Minimize Dust Exposure',
        detail:
          'Visible suspended dust or construction/road particulates appear in the scene. Consider wearing a snug particulate mask (N95/FFP2) and limiting prolonged exertion in dusty surroundings.',
        basis: 'visual',
        priority: 'caution',
      });
    }

    if (activeTypes.has('haze_smog')) {
      recs.push({
        title: 'Reduced Visibility & Urban Haze Precaution',
        detail:
          'Diffuse haze reduces distant visual clarity. Sensitive individuals (asthma, elderly, children) should check measured local AQI before planning vigorous outdoor activity.',
        basis: 'visual',
        priority: 'caution',
      });
    }

    if (activeTypes.has('fog_mist')) {
      recs.push({
        title: 'Low-Visibility Commute Caution',
        detail:
          'Fog or mist layers reduce visual contrast. Use low-beam headlights when driving and confirm whether local humidity or particulate levels are elevated.',
        basis: 'visual',
        priority: 'info',
      });
    }

    if (analysis.noClearPollutionIndicator && analysis.visualCondition === 'clear') {
      recs.push({
        title: 'Visually Clear Sky Does Not Guarantee Safe Air',
        detail:
          'No clear visual pollution indicator was seen in this photograph, but invisible gases (O3, NO2, CO, SO2) and fine PM2.5 particles cannot be detected visually. Rely on measured station data below.',
        basis: 'visual',
        priority: 'info',
      });
    } else if (analysis.visualCondition === 'unusable') {
      recs.push({
        title: 'Capture a Clear Outdoor View for Better Visual Screening',
        detail:
          'The image appears indoor, very dark, or visually unclear. Retake a well-lit outdoor photograph showing the sky, horizon, or roadway for reliable visual indicator detection.',
        basis: 'visual',
        priority: 'info',
      });
    }
  }

  if (airQuality?.available && typeof airQuality.aqi === 'number') {
    const aqi = airQuality.aqi;
    const isUniversal = (airQuality.regionStandard || '').toLowerCase().includes('universal');
    const elevated = isUniversal ? aqi < 60 : aqi > 100; // Note: UAQI 100 is best (0 worst), whereas US/India AQI > 100 is elevated

    if (airQuality.healthRecommendations?.generalPopulation) {
      recs.push({
        title: `Official Health Guidance (${airQuality.aqiCategory || 'Measured AQI'})`,
        detail: airQuality.healthRecommendations.generalPopulation,
        basis: 'measured_aqi',
        priority: elevated ? 'advisory' : 'info',
      });
      if (airQuality.healthRecommendations.lungDiseasePopulation && elevated) {
        recs.push({
          title: 'Guidance for Sensitive Groups',
          detail: airQuality.healthRecommendations.lungDiseasePopulation,
          basis: 'measured_aqi',
          priority: 'advisory',
        });
      }
    } else if (elevated) {
      recs.push({
        title: `Elevated Measured AQI (${airQuality.aqiDisplay ?? aqi} · ${airQuality.aqiCategory || 'Unhealthy'})`,
        detail:
          'External air quality monitoring indicates elevated particulate or gas burden. Sensitive groups should reduce prolonged outdoor exertion and consider indoor filtration.',
        basis: 'measured_aqi',
        priority: 'advisory',
      });
    } else {
      recs.push({
        title: `Measured Air Quality (${airQuality.aqiDisplay ?? aqi} · ${airQuality.aqiCategory || 'Within Moderate/Good Band'})`,
        detail:
          'Current external monitoring shows lower ambient AQI burden at this location, though localized roadside smoke or dust plumes may still pose short-range exposure risks.',
        basis: 'combined',
        priority: 'info',
      });
    }
  } else {
    recs.push({
      title: 'Measured AQI Unavailable for Final Health Determination',
      detail:
        'Select a monitored city or allow location access to cross-check visual observations against actual PM2.5, PM10, and AQI station readings.',
      basis: 'combined',
      priority: 'info',
    });
  }

  return recs;
}
