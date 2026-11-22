import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMapView,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  CloudRain,
  Compass,
  Droplets,
  ExternalLink,
  Gauge,
  Globe2,
  Info,
  Layers,
  LocateFixed,
  MapPin,
  Maximize2,
  Minimize2,
  Mountain,
  Navigation,
  Pause,
  Phone,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Waves,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CITIES, CITY_MAP } from '../data/cities.ts';
import { computeZoneRisk } from '../lib/riskModel.ts';
import type {
  AiRiskAssessmentPayload,
  CityComparisonSummary,
  CityId,
  CityTelemetryResponse,
  MonitoringZoneDemo,
  RadarFrameInfo,
  RadarFramesResponse,
  ReliefPlace,
  RiskLevel,
  UnitsSystem,
} from '../types/flood.ts';
import {
  formatRain,
  formatTemperature,
  formatTimestampIST,
  RISK_STYLES,
  RiskStatusIndicator,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  AnimatedNumber,
  ScrollReveal,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface InteractiveFloodMapPageProps {
  mapsApiKey: string | null;
  mapsKeyLoading: boolean;
  selectedCity: CityId;
  onSelectCity: (c: CityId) => void;
  telemetry: CityTelemetryResponse | null;
  telemetryLoading?: boolean;
  comparison?: CityComparisonSummary[];
  aiAssessment: AiRiskAssessmentPayload | null;
  aiLoading?: boolean;
  onRefresh?: () => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

type SelectedItem =
  | {
      kind: 'zone';
      zone: MonitoringZoneDemo;
      score: number;
      category: RiskLevel;
      localSoilPct: number | null;
      localDrainagePct: number | null;
    }
  | { kind: 'relief'; place: ReliefPlace };

type PlaybackSpeed = 0.5 | 1 | 2;

const MAX_NATIVE_RADAR_ZOOM = 7;
const MAX_RADAR_CACHE_ENTRIES = 420;
const radarImageCache: Record<string, Promise<HTMLImageElement | null>> = {};
const radarCacheOrder: string[] = [];

function loadRadarTileImage(url: string): Promise<HTMLImageElement | null> {
  if (Object.prototype.hasOwnProperty.call(radarImageCache, url)) {
    return radarImageCache[url];
  }
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  radarImageCache[url] = promise;
  radarCacheOrder.push(url);
  if (radarCacheOrder.length > MAX_RADAR_CACHE_ENTRIES) {
    const oldest = radarCacheOrder.shift();
    if (oldest) {
      delete radarImageCache[oldest];
    }
  }
  return promise;
}

function latLngToTileCoord(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 1 << zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

class RainViewerTileLayer implements google.maps.MapType {
  tileSize: google.maps.Size;
  alt: string | null = 'RainViewer Precipitation Radar';
  maxZoom = 18;
  minZoom = 0;
  name: string | null = 'PrecipitationRadar';
  projection: google.maps.Projection | null = null;
  radius = 6378137;
  private tileUrlTemplate: string;

  constructor(tileSize: google.maps.Size, tileUrlTemplate: string) {
    this.tileSize = tileSize;
    this.tileUrlTemplate = tileUrlTemplate;
  }

  getTile(coord: google.maps.Point, zoom: number, ownerDocument: Document): HTMLElement {
    const container = ownerDocument.createElement('div');
    container.style.width = `${this.tileSize.width}px`;
    container.style.height = `${this.tileSize.height}px`;
    container.style.position = 'relative';
    container.style.pointerEvents = 'none';
    container.style.opacity = 'var(--radar-opacity, 0.72)';
    container.style.transition = 'opacity 140ms ease';
    container.dataset.disposed = '0';

    if (!coord || zoom < this.minZoom || zoom > this.maxZoom) {
      return container;
    }

    const worldTiles = 1 << zoom;
    if (coord.y < 0 || coord.y >= worldTiles) {
      return container;
    }

    const wrappedX = ((coord.x % worldTiles) + worldTiles) % worldTiles;

    // RainViewer public free API only serves native tiles up to z=7;
    // higher map zooms cleanly slice & bilinearly upscale the parent z=7 tile
    // so RainViewer's "Zoom level not supported" tile never appears.
    const nativeZoom = Math.min(zoom, MAX_NATIVE_RADAR_ZOOM);
    const zoomDiff = zoom - nativeZoom;
    const scale = 1 << zoomDiff;
    const srcX = Math.floor(wrappedX / scale);
    const srcY = Math.floor(coord.y / scale);
    const subX = wrappedX % scale;
    const subY = coord.y % scale;

    const url = this.tileUrlTemplate
      .replace('{z}', String(nativeZoom))
      .replace('{x}', String(srcX))
      .replace('{y}', String(srcY));

    const canvas = ownerDocument.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    canvas.style.width = '256px';
    canvas.style.height = '256px';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    container.appendChild(canvas);

    loadRadarTileImage(url).then((img) => {
      if (!img || container.dataset.disposed === '1') return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 256, 256);
      if (scale === 1) {
        ctx.drawImage(img, 0, 0, 256, 256);
      } else {
        const sw = 256 / scale;
        const sh = 256 / scale;
        const sx = subX * sw;
        const sy = subY * sh;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 256, 256);
      }
    });

    return container;
  }

  releaseTile(tile: Element): void {
    (tile as HTMLElement).dataset.disposed = '1';
  }
}

const PrecipitationRadarOverlay: React.FC<{
  frame: RadarFrameInfo | null;
  visible: boolean;
}> = ({ frame, visible }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !visible || !frame) return;

    const layer = new RainViewerTileLayer(
      new google.maps.Size(256, 256),
      frame.tileUrlTemplate
    );

    map.overlayMapTypes.insertAt(0, layer);
    return () => {
      const idx = map.overlayMapTypes.getArray().indexOf(layer);
      if (idx !== -1) {
        map.overlayMapTypes.removeAt(idx);
      }
    };
  }, [map, mapsLib, frame, visible]);

  return null;
};

const FloodZonePolygons: React.FC<{
  zones: Array<{
    zone: MonitoringZoneDemo;
    score: number;
    category: RiskLevel;
    localSoilPct: number | null;
    localDrainagePct: number | null;
  }>;
  visible: boolean;
  selectedZoneId: string | null;
  onSelectZone: (item: SelectedItem) => void;
}> = ({ zones, visible, selectedZoneId, onSelectZone }) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib || !visible) return;

    const polygons: google.maps.Polygon[] = [];
    for (const z of zones) {
      const color = RISK_STYLES[z.category].hex;
      const isSelected = selectedZoneId === z.zone.id;
      const poly = new mapsLib.Polygon({
        paths: z.zone.polygon,
        strokeColor: color,
        strokeOpacity: isSelected ? 0.96 : 0.78,
        strokeWeight: isSelected ? 3 : 2,
        fillColor: color,
        fillOpacity: isSelected ? 0.34 : 0.18,
        map,
        clickable: true,
      });

      poly.addListener('click', () => {
        onSelectZone({
          kind: 'zone',
          zone: z.zone,
          score: z.score,
          category: z.category,
          localSoilPct: z.localSoilPct,
          localDrainagePct: z.localDrainagePct,
        });
      });

      polygons.push(poly);
    }

    return () => {
      for (const p of polygons) {
        google.maps.event.clearInstanceListeners(p);
        p.setMap(null);
      }
    };
  }, [map, mapsLib, zones, visible, selectedZoneId, onSelectZone]);

  return null;
};

const MapCameraController: React.FC<{
  center: { lat: number; lng: number };
  zoom: number;
  mapTypeId: string;
  onMapReady: (map: google.maps.Map | null) => void;
  onZoomChange: (zoom: number) => void;
}> = ({ center, zoom, mapTypeId, onMapReady, onZoomChange }) => {
  const map = useMap();

  useEffect(() => {
    onMapReady(map ?? null);
    return () => onMapReady(null);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(zoom);
  }, [map, center, zoom]);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapTypeId);
  }, [map, mapTypeId]);

  useEffect(() => {
    if (!map) return;
    const updateZoom = () => {
      const z = map.getZoom();
      if (typeof z === 'number') {
        onZoomChange(Math.round(z));
      }
    };
    updateZoom();
    const listener = map.addListener('zoom_changed', updateZoom);
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, onZoomChange]);

  return null;
};

function getRiskGlowHex(level: RiskLevel | 'UNAVAILABLE'): string {
  if (level === 'UNAVAILABLE') return '#64748B';
  return RISK_STYLES[level].hex;
}

export const InteractiveFloodMapPage: React.FC<InteractiveFloodMapPageProps> = ({
  mapsApiKey,
  mapsKeyLoading,
  selectedCity,
  onSelectCity,
  telemetry,
  telemetryLoading = false,
  comparison = [],
  aiAssessment,
  aiLoading = false,
  onRefresh,
  units,
  theme,
}) => {
  const city = CITY_MAP[selectedCity];
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  const [indiaOverview, setIndiaOverview] = useState(false);
  const [mapTypeId, setMapTypeId] = useState<'roadmap' | 'satellite' | 'terrain' | 'hybrid'>(
    'roadmap'
  );
  const [showRadar, setShowRadar] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showRelief, setShowRelief] = useState(false);
  const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [liveZoom, setLiveZoom] = useState<number>(city.defaultZoom + 1);

  // Live Precipitation Radar state (RainViewer API)
  const [radarData, setRadarData] = useState<RadarFramesResponse | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarOpacity, setRadarOpacity] = useState(0.72);
  const [activeFrameIdx, setActiveFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

  // Relief Centres (Places API New)
  const [reliefPlaces, setReliefPlaces] = useState<ReliefPlace[]>([]);
  const [reliefLoading, setReliefLoading] = useState(false);
  const [reliefError, setReliefError] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  const fetchRadarFrames = useCallback(async () => {
    setRadarLoading(true);
    try {
      const resp = await fetch('/api/radar/frames');
      const data = (await resp.json()) as RadarFramesResponse;
      setRadarData(data);
      if (data.available && data.frames.length > 0) {
        const lastPastIdx = data.frames.reduce(
          (acc, f, idx) => (f.kind === 'past' ? idx : acc),
          data.frames.length - 1
        );
        setActiveFrameIdx(lastPastIdx);
      }
    } catch {
      setRadarData({
        available: false,
        host: null,
        frames: [],
        generatedAt: null,
        attribution: 'RainViewer Public Precipitation Radar',
        reason: 'Unable to contact radar frames endpoint.',
        fetchedAt: new Date().toISOString(),
      });
    } finally {
      setRadarLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRadarFrames();
  }, [fetchRadarFrames]);

  // Preload parent z=7 radar tiles around active city across all real frames for smooth playback
  useEffect(() => {
    const frames = radarData?.frames;
    if (!frames || frames.length === 0 || !showRadar) return;
    const base = latLngToTileCoord(city.lat, city.lng, MAX_NATIVE_RADAR_ZOOM);
    for (const f of frames) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const url = f.tileUrlTemplate
            .replace('{z}', String(MAX_NATIVE_RADAR_ZOOM))
            .replace('{x}', String(base.x + dx))
            .replace('{y}', String(base.y + dy));
          void loadRadarTileImage(url);
        }
      }
    }
  }, [radarData, city.lat, city.lng, showRadar]);

  // Animate radar frames at selected playback speed
  useEffect(() => {
    const frameCount = radarData?.frames.length ?? 0;
    if (!isPlaying || !showRadar || frameCount < 2) return;
    const intervalMs = playbackSpeed === 0.5 ? 1600 : playbackSpeed === 2 ? 450 : 880;
    const timer = setInterval(() => {
      setActiveFrameIdx((prev) => (prev + 1) % frameCount);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, showRadar, radarData?.frames.length, playbackSpeed]);

  // Escape exits fullscreen radar HUD
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen]);

  const computedZones = useMemo(() => {
    const baseScore = telemetry?.risk.currentScore ?? 22;
    const baseRain = telemetry?.current.rainfallMmHr ?? null;
    const baseSoil = telemetry?.current.soilMoisturePct ?? null;
    return city.zones.map((zone) => {
      const r = computeZoneRisk(baseScore, zone, baseRain, baseSoil);
      return { zone, ...r };
    });
  }, [city, telemetry]);

  const prevCityRef = useRef<CityId>(selectedCity);

  useEffect(() => {
    if (computedZones.length === 0) return;
    const cityChanged = prevCityRef.current !== selectedCity;
    prevCityRef.current = selectedCity;

    setSelectedItem((prev) => {
      if (!cityChanged && prev?.kind === 'relief') {
        return prev;
      }
      if (!cityChanged && prev?.kind === 'zone') {
        const matched = computedZones.find((z) => z.zone.id === prev.zone.id);
        if (matched) {
          return {
            kind: 'zone',
            zone: matched.zone,
            score: matched.score,
            category: matched.category,
            localSoilPct: matched.localSoilPct,
            localDrainagePct: matched.localDrainagePct,
          };
        }
      }
      const first = computedZones[0];
      return {
        kind: 'zone',
        zone: first.zone,
        score: first.score,
        category: first.category,
        localSoilPct: first.localSoilPct,
        localDrainagePct: first.localDrainagePct,
      };
    });
  }, [selectedCity, computedZones]);

  const loadReliefMarkers = useCallback(async () => {
    setReliefLoading(true);
    setReliefError(null);
    try {
      const resp = await fetch(
        `/api/places/relief?cityId=${encodeURIComponent(selectedCity)}&category=all`
      );
      const data = await resp.json();
      if (resp.status === 429 || data?.code === 'QUOTA_EXCEEDED') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        setReliefError(data?.error || 'Google Places API quota reached.');
        setReliefPlaces([]);
      } else if (!resp.ok) {
        setReliefError(data?.error || `Places API returned ${resp.status}`);
        setReliefPlaces([]);
      } else {
        setReliefPlaces(Array.isArray(data.places) ? data.places : []);
      }
    } catch (err) {
      setReliefError(err instanceof Error ? err.message : 'Failed to load relief facilities');
      setReliefPlaces([]);
    } finally {
      setReliefLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    if (showRelief && !indiaOverview) {
      loadReliefMarkers();
    }
  }, [showRelief, indiaOverview, selectedCity, loadReliefMarkers]);

  const comparisonByCity = useMemo(() => {
    const dict: Record<string, CityComparisonSummary> = {};
    for (const item of comparison) {
      dict[item.cityId] = item;
    }
    return dict;
  }, [comparison]);

  const sortedCitySummaries = useMemo(() => {
    return CITIES.map((c) => {
      const summary = comparisonByCity[c.id];
      return {
        city: c,
        summary,
        score: summary?.floodRiskIndex ?? null,
        category: (summary?.riskCategory ?? 'UNAVAILABLE') as RiskLevel | 'UNAVAILABLE',
      };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [comparisonByCity]);

  const indiaRiskCounts = useMemo(() => {
    const counts: Record<RiskLevel | 'UNAVAILABLE', number> = {
      SEVERE: 0,
      HIGH: 0,
      MODERATE: 0,
      LOW: 0,
      UNAVAILABLE: 0,
    };
    for (const item of sortedCitySummaries) {
      counts[item.category] += 1;
    }
    return counts;
  }, [sortedCitySummaries]);

  const cameraCenter = useMemo(
    () => (indiaOverview ? { lat: 21.8, lng: 79.1 } : { lat: city.lat, lng: city.lng }),
    [indiaOverview, city.lat, city.lng]
  );
  const cameraZoom = indiaOverview ? 5 : city.defaultZoom + 1;

  const handleMapReady = useCallback((m: google.maps.Map | null) => {
    mapInstanceRef.current = m;
  }, []);

  const handleZoomIn = () => {
    const m = mapInstanceRef.current;
    if (!m) return;
    const z = m.getZoom() ?? cameraZoom;
    m.setZoom(Math.min(17, z + 1));
  };

  const handleZoomOut = () => {
    const m = mapInstanceRef.current;
    if (!m) return;
    const z = m.getZoom() ?? cameraZoom;
    m.setZoom(Math.max(4, z - 1));
  };

  const handleRecenter = () => {
    const m = mapInstanceRef.current;
    if (!m) return;
    m.panTo(cameraCenter);
    m.setZoom(cameraZoom);
  };

  const handleSelectZoneWithPan = useCallback((item: SelectedItem) => {
    setSelectedItem(item);
    const m = mapInstanceRef.current;
    if (!m) return;
    if (item.kind === 'zone') {
      m.panTo({ lat: item.zone.lat, lng: item.zone.lng });
    } else {
      m.panTo({ lat: item.place.lat, lng: item.place.lng });
    }
  }, []);

  const rainDisplay = formatRain(telemetry?.current.rainfallMmHr, units, true);
  const tempDisplay = formatTemperature(telemetry?.current.temperatureC, units);
  const radarFrames = radarData?.frames ?? [];
  const activeFrame = radarFrames[activeFrameIdx] ?? null;

  // Circular SVG Flood-Risk Gauge geometry for selected zone
  const zoneScore = selectedItem?.kind === 'zone' ? selectedItem.score : telemetry?.risk.currentScore ?? 0;
  const zoneCategory: RiskLevel =
    selectedItem?.kind === 'zone' ? selectedItem.category : telemetry?.risk.category ?? 'LOW';
  const gaugeHex = RISK_STYLES[zoneCategory].hex;
  const gaugeRadius = 54;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugePct = Math.max(4, Math.min(100, zoneScore));
  const gaugeDashoffset = gaugeCircumference - (gaugePct / 100) * gaugeCircumference;

  const activeLayerCount =
    (showRadar ? 1 : 0) + (showZones ? 1 : 0) + (showMarkers ? 1 : 0) + (showRelief ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Compact Atmospheric Header */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Live Meteorological Radar
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                {indiaOverview ? 'All 9 Indian Basins' : `${city.name}, ${city.state}`}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-white tracking-tight mt-0.5 flex items-center gap-2">
              <Radar className="w-5 h-5 text-[#0284C7] dark:text-cyan-400 shrink-0" />
              <span>Weather Radar &amp; Flood Risk Map</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {telemetry && !indiaOverview && (
              <div className="hidden md:flex items-center gap-3 rounded-xl glass-panel px-3 py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <CloudRain className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                  <span className="font-mono font-semibold tabular-nums">
                    {rainDisplay.value === 'Unavailable'
                      ? 'N/A'
                      : `${rainDisplay.value} ${rainDisplay.unit}`}
                  </span>
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <span className="font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                  {tempDisplay}
                </span>
                <span className="text-slate-300 dark:text-slate-700">|</span>
                <RiskStatusIndicator level={telemetry.risk.category} />
              </div>
            )}

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={telemetryLoading}
                className="tactile-btn inline-flex items-center gap-1.5 rounded-xl glass-panel px-3 py-2 text-xs font-medium text-slate-700 dark:text-cyan-200 hover:border-sky-300 dark:hover:border-cyan-400/45 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400 ${
                    telemetryLoading ? 'animate-spin' : ''
                  }`}
                />
                <span>Sync</span>
              </button>
            )}
          </div>
        </div>
      </ScrollReveal>

      {/* Main Radar Cockpit Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left/Center: Immersive Map + Floating Glass HUD + Horizontal Radar Timeline */}
        <div
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 bg-[#040814] p-2.5 sm:p-4 flex flex-col gap-3'
              : 'lg:col-span-8 flex flex-col gap-3'
          }
        >
          {/* Error / Unavailable Banners (Only displayed if needed) */}
          {reliefError && showRelief && !indiaOverview && (
            <div className="rounded-xl bg-[#FFFBEB] dark:bg-amber-950/40 border border-[#FDE68A] dark:border-amber-500/35 px-3.5 py-2 text-xs text-[#B45309] dark:text-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
              <span>Relief centres lookup error: {reliefError}</span>
            </div>
          )}

          {showRadar && radarData && !radarData.available && (
            <div className="rounded-xl bg-[#FFFBEB] dark:bg-amber-950/40 border border-[#FDE68A] dark:border-amber-500/35 px-3.5 py-2 text-xs text-[#B45309] dark:text-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
                <span>
                  Precipitation radar feed unavailable: {radarData.reason ?? 'Upstream unreachable.'} Showing base map and live telemetry without synthetic radar imagery.
                </span>
              </div>
              <button
                type="button"
                onClick={fetchRadarFrames}
                className="shrink-0 rounded-lg px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-[11px] font-semibold cursor-pointer"
              >
                Retry Radar
              </button>
            </div>
          )}

          {/* Immersive Google Map Canvas */}
          <div
            style={{ '--radar-opacity': radarOpacity } as React.CSSProperties}
            className={`relative rounded-3xl overflow-hidden border border-slate-300/70 dark:border-cyan-500/25 shadow-2xl bg-slate-100 dark:bg-[#050b18] w-full ${
              isFullscreen ? 'flex-1 min-h-0' : 'h-[520px] sm:h-[600px] lg:h-[650px]'
            }`}
          >
            {mapsKeyLoading ? (
              <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <RefreshCw className="w-5 h-5 animate-spin text-[#0284C7] dark:text-cyan-400" />
                <span>Initializing Weather Radar &amp; Google Maps Platform...</span>
              </div>
            ) : !mapsApiKey ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-[#D97706] dark:text-amber-400" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Google Maps API Key Not Available
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md">
                  Enable Google Maps Platform in AI Studio or configure VITE_GOOGLE_MAPS_API_KEY in Settings &gt; Secrets to render the interactive radar map.
                </p>
              </div>
            ) : (
              <APIProvider
                apiKey={mapsApiKey}
                libraries={['maps', 'marker', 'places']}
                language="en"
                region="IN"
              >
                <GoogleMapView
                  key={`gmap-${theme}`}
                  defaultCenter={cameraCenter}
                  defaultZoom={cameraZoom}
                  minZoom={4}
                  maxZoom={17}
                  mapId="DEMO_MAP_ID"
                  colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
                  gestureHandling="greedy"
                  disableDefaultUI={true}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <MapCameraController
                    center={cameraCenter}
                    zoom={cameraZoom}
                    mapTypeId={mapTypeId}
                    onMapReady={handleMapReady}
                    onZoomChange={setLiveZoom}
                  />

                  <PrecipitationRadarOverlay
                    frame={activeFrame}
                    visible={showRadar && Boolean(radarData?.available)}
                  />

                  <FloodZonePolygons
                    zones={computedZones}
                    visible={showZones && !indiaOverview}
                    selectedZoneId={selectedItem?.kind === 'zone' ? selectedItem.zone.id : null}
                    onSelectZone={handleSelectZoneWithPan}
                  />

                  {/* India Overview Markers for all 9 Cities */}
                  {indiaOverview &&
                    CITIES.map((c) => {
                      const summary = comparisonByCity[c.id];
                      const level = (summary?.riskCategory ?? 'UNAVAILABLE') as
                        | RiskLevel
                        | 'UNAVAILABLE';
                      const score = summary?.floodRiskIndex;
                      const hex = getRiskGlowHex(level);
                      const isActiveCity = c.id === selectedCity;
                      return (
                        <AdvancedMarker
                          key={c.id}
                          position={{ lat: c.lat, lng: c.lng }}
                          title={`${c.name}, ${c.state} — ${level}`}
                          onClick={() => {
                            onSelectCity(c.id);
                            setIndiaOverview(false);
                          }}
                        >
                          <button
                            type="button"
                            className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
                            aria-label={`Inspect ${c.name} radar and flood risk`}
                          >
                            <div className="relative flex items-center justify-center">
                              {(isActiveCity || level === 'HIGH' || level === 'SEVERE') && (
                                <span
                                  aria-hidden="true"
                                  className="radar-ring absolute w-9 h-9 rounded-full pointer-events-none"
                                  style={{
                                    backgroundColor: `${hex}38`,
                                    border: `1.5px solid ${hex}`,
                                  }}
                                />
                              )}
                              <span
                                className="relative w-4 h-4 rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-125"
                                style={{
                                  backgroundColor: hex,
                                  boxShadow: `0 0 14px ${hex}`,
                                }}
                              />
                            </div>
                            <span className="mt-1 px-2 py-0.5 rounded-md bg-slate-950/88 text-white border border-white/20 text-[10px] font-semibold whitespace-nowrap shadow-md backdrop-blur-md">
                              {c.name}
                              {score !== null && score !== undefined ? (
                                <span className="ml-1 font-mono" style={{ color: hex === '#64748B' ? '#cbd5e1' : hex }}>
                                  {score}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </AdvancedMarker>
                      );
                    })}

                  {/* Local Demonstration Monitoring Nodes */}
                  {!indiaOverview &&
                    showMarkers &&
                    computedZones.map((item) => {
                      const color = RISK_STYLES[item.category].hex;
                      const isHighOrSevere =
                        item.category === 'HIGH' || item.category === 'SEVERE';
                      const isSelZone =
                        selectedItem?.kind === 'zone' && selectedItem.zone.id === item.zone.id;
                      return (
                        <AdvancedMarker
                          key={item.zone.id}
                          position={{ lat: item.zone.lat, lng: item.zone.lng }}
                          title={`${item.zone.name} (${item.category})`}
                          onClick={() =>
                            handleSelectZoneWithPan({
                              kind: 'zone',
                              zone: item.zone,
                              score: item.score,
                              category: item.category,
                              localSoilPct: item.localSoilPct,
                              localDrainagePct: item.localDrainagePct,
                            })
                          }
                        >
                          <button
                            type="button"
                            className="group relative flex flex-col items-center cursor-pointer focus:outline-none"
                            aria-label={`Select zone ${item.zone.name}`}
                          >
                            <div className="relative flex items-center justify-center">
                              {(isHighOrSevere || isSelZone) && (
                                <span
                                  aria-hidden="true"
                                  className="radar-ring absolute w-11 h-11 rounded-full pointer-events-none"
                                  style={{
                                    backgroundColor: `${color}3d`,
                                    border: `1.5px solid ${color}`,
                                  }}
                                />
                              )}
                              <span
                                className={`relative rounded-full border-2 border-white flex items-center justify-center transition-transform group-hover:scale-115 ${
                                  isSelZone ? 'w-6 h-6' : 'w-4 h-4'
                                }`}
                                style={{
                                  backgroundColor: color,
                                  boxShadow: `0 0 18px ${color}`,
                                }}
                              >
                                {isSelZone && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </span>
                            </div>
                            <span
                              className={`mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shadow-md backdrop-blur-md transition-opacity ${
                                isSelZone
                                  ? 'bg-slate-950/92 text-cyan-200 border border-cyan-400/45 opacity-100'
                                  : 'bg-slate-950/80 text-slate-200 border border-white/15 opacity-85 group-hover:opacity-100'
                              }`}
                            >
                              {item.zone.name.split(' - ')[0]} ·{' '}
                              <span className="font-mono font-bold">{item.score}</span>
                            </span>
                          </button>
                        </AdvancedMarker>
                      );
                    })}

                  {/* Relief Centre Markers from Places API */}
                  {!indiaOverview &&
                    showRelief &&
                    reliefPlaces.map((place) => {
                      const isSelRelief =
                        selectedItem?.kind === 'relief' && selectedItem.place.id === place.id;
                      return (
                        <AdvancedMarker
                          key={place.id}
                          position={{ lat: place.lat, lng: place.lng }}
                          title={place.name}
                          onClick={() => handleSelectZoneWithPan({ kind: 'relief', place })}
                        >
                          <div className="relative flex items-center justify-center">
                            {isSelRelief && (
                              <span
                                aria-hidden="true"
                                className="radar-ring absolute w-9 h-9 rounded-full bg-blue-500/35 border border-blue-400 pointer-events-none"
                              />
                            )}
                            <span
                              className={`rounded-lg border-2 border-white bg-[#2563EB] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 ${
                                isSelRelief ? 'w-6 h-6' : 'w-5 h-5'
                              }`}
                              style={{ boxShadow: '0 0 12px rgba(37,99,235,0.65)' }}
                            >
                              <ShieldCheck className="w-3 h-3" />
                            </span>
                          </div>
                        </AdvancedMarker>
                      );
                    })}

                  {/* InfoWindow for Active Selection */}
                  {!indiaOverview && selectedItem && (
                    <InfoWindow
                      position={
                        selectedItem.kind === 'zone'
                          ? { lat: selectedItem.zone.lat, lng: selectedItem.zone.lng }
                          : { lat: selectedItem.place.lat, lng: selectedItem.place.lng }
                      }
                      onCloseClick={() => setSelectedItem(null)}
                      maxWidth={255}
                    >
                      {selectedItem.kind === 'zone' ? (
                        <div className="bg-white text-slate-900 p-1 space-y-1">
                          <div className="font-semibold text-xs text-slate-900">
                            {selectedItem.zone.name}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {selectedItem.zone.locality}
                          </div>
                          <div className="text-xs font-mono font-bold text-slate-900">
                            Index: {selectedItem.score}/100 ({selectedItem.category})
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Demonstration basin node · Elev {selectedItem.zone.elevationM} m
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white text-slate-900 p-1 space-y-1">
                          <div className="font-semibold text-xs text-slate-900">
                            {selectedItem.place.name}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {selectedItem.place.primaryTypeLabel}
                          </div>
                          <div className="text-[11px] text-slate-700">
                            {selectedItem.place.address}
                          </div>
                          <a
                            href={selectedItem.place.directionsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-[11px] font-semibold text-[#2563EB] underline"
                          >
                            Open Directions →
                          </a>
                        </div>
                      )}
                    </InfoWindow>
                  )}
                </GoogleMapView>
              </APIProvider>
            )}

            {/* TOP-LEFT FLOATING GLASS CONTROL HUD */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[calc(100%-64px)]">
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl glass-panel-elevated p-1.5 shadow-xl">
                {/* City Focus vs India Overview Switch */}
                <div className="inline-flex rounded-xl bg-slate-100/90 dark:bg-slate-900/90 p-0.5 border border-slate-200/80 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIndiaOverview(false)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                      !indiaOverview
                        ? 'bg-[#0284C7] text-white dark:bg-cyan-500 dark:text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>City</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIndiaOverview(true)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                      indiaOverview
                        ? 'bg-[#0284C7] text-white dark:bg-cyan-500 dark:text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Globe2 className="w-3 h-3" />
                    <span>India (9)</span>
                  </button>
                </div>

                {/* 9-City Selector */}
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    onSelectCity(e.target.value as CityId);
                    setIndiaOverview(false);
                  }}
                  aria-label="Select monitoring city on map"
                  className="rounded-xl bg-slate-50 dark:bg-slate-900/95 border border-slate-200 dark:border-cyan-500/25 px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.state})
                    </option>
                  ))}
                </select>

                {/* Base Map Style Selector */}
                <div className="hidden md:inline-flex items-center rounded-xl bg-slate-100/90 dark:bg-slate-900/90 p-0.5 border border-slate-200/80 dark:border-slate-800">
                  {(['roadmap', 'satellite', 'terrain', 'hybrid'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMapTypeId(mode)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                        mapTypeId === mode
                          ? 'bg-white dark:bg-cyan-500/20 text-[#0284C7] dark:text-cyan-200 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Layers Drawer Toggle */}
                <button
                  type="button"
                  onClick={() => setLayersDrawerOpen((v) => !v)}
                  aria-expanded={layersDrawerOpen}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold border transition-colors cursor-pointer ${
                    layersDrawerOpen
                      ? 'bg-[#E0F2FE] border-sky-300 text-[#0284C7] dark:bg-cyan-500/20 dark:border-cyan-400/50 dark:text-cyan-200'
                      : 'bg-slate-50 dark:bg-slate-900/90 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-cyan-400/40'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                  <span>Layers ({activeLayerCount})</span>
                  {(reliefLoading || radarLoading) && (
                    <RefreshCw className="w-3 h-3 animate-spin text-[#0284C7] dark:text-cyan-400" />
                  )}
                </button>
              </div>

              {/* Expandable Floating Layer & Style Control Popover */}
              {layersDrawerOpen && (
                <div className="rounded-2xl glass-panel-elevated p-3 w-72 sm:w-80 space-y-3 shadow-2xl">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
                    <span className="inline-flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                      Radar &amp; Overlay Controls
                    </span>
                    <button
                      type="button"
                      onClick={() => setLayersDrawerOpen(false)}
                      className="text-[11px] text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>

                  {/* Mobile Map Style Picker */}
                  <div className="md:hidden grid grid-cols-4 gap-1">
                    {(['roadmap', 'satellite', 'terrain', 'hybrid'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setMapTypeId(mode)}
                        className={`py-1.5 rounded-lg text-[10px] font-medium capitalize border cursor-pointer ${
                          mapTypeId === mode
                            ? 'bg-[#E0F2FE] border-sky-300 text-[#0284C7] dark:bg-cyan-500/20 dark:border-cyan-400/40 dark:text-cyan-200'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <label className="flex items-center justify-between rounded-xl px-2.5 py-2 bg-slate-50/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        Precipitation Radar
                      </span>
                      <input
                        type="checkbox"
                        checked={showRadar}
                        onChange={(e) => {
                          setShowRadar(e.target.checked);
                          if (!e.target.checked) setIsPlaying(false);
                        }}
                        className="accent-[#0284C7] dark:accent-cyan-400 rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl px-2.5 py-2 bg-slate-50/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        Flood Risk Zones (Demo)
                      </span>
                      <input
                        type="checkbox"
                        checked={showZones}
                        onChange={(e) => setShowZones(e.target.checked)}
                        className="accent-[#0284C7] dark:accent-cyan-400 rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl px-2.5 py-2 bg-slate-50/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        Monitoring Nodes (Demo)
                      </span>
                      <input
                        type="checkbox"
                        checked={showMarkers}
                        onChange={(e) => setShowMarkers(e.target.checked)}
                        className="accent-[#0284C7] dark:accent-cyan-400 rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between rounded-xl px-2.5 py-2 bg-slate-50/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 cursor-pointer">
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        Relief Centres (Places API)
                      </span>
                      <input
                        type="checkbox"
                        checked={showRelief}
                        onChange={(e) => setShowRelief(e.target.checked)}
                        className="accent-[#2563EB] rounded cursor-pointer"
                      />
                    </label>
                  </div>

                  {showRadar && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600 dark:text-slate-400">Radar Opacity</span>
                        <span className="font-mono font-semibold text-[#0284C7] dark:text-cyan-300 tabular-nums">
                          {Math.round(radarOpacity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.25}
                        max={0.95}
                        step={0.05}
                        value={radarOpacity}
                        onChange={(e) => setRadarOpacity(Number(e.target.value))}
                        aria-label="Radar overlay opacity"
                        className="w-full accent-[#0284C7] dark:accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TOP-RIGHT FLOATING GLASS CAMERA & FULLSCREEN CONTROLS */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
              <div className="rounded-2xl glass-panel-elevated p-1 flex flex-col items-center gap-0.5 shadow-xl">
                <button
                  type="button"
                  onClick={handleZoomIn}
                  aria-label="Zoom in map"
                  title="Zoom in"
                  className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-[#0284C7] dark:hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono font-semibold text-slate-500 dark:text-cyan-300/85 tabular-nums select-none">
                  z{liveZoom}
                </span>
                <button
                  type="button"
                  onClick={handleZoomOut}
                  aria-label="Zoom out map"
                  title="Zoom out"
                  className="p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-[#0284C7] dark:hover:text-cyan-300 transition-colors cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleRecenter}
                aria-label="Recenter map view"
                title="Recenter map"
                className="rounded-xl glass-panel-elevated p-2.5 text-slate-700 dark:text-slate-200 hover:text-[#0284C7] dark:hover:text-cyan-300 shadow-xl transition-colors cursor-pointer"
              >
                <LocateFixed className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreen((v) => !v)}
                aria-label={isFullscreen ? 'Exit full screen radar' : 'Enter full screen radar'}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Radar'}
                className="rounded-xl glass-panel-elevated p-2.5 text-slate-700 dark:text-cyan-300 hover:text-[#0284C7] dark:hover:text-white shadow-xl transition-colors cursor-pointer"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* BOTTOM-LEFT RAIN INTENSITY & RISK LEGEND OVERLAY */}
            <div className="absolute bottom-3 left-3 z-10 rounded-2xl glass-panel-elevated px-3 py-2.5 text-[11px] space-y-2 max-w-[260px] shadow-xl">
              <div>
                <div className="flex items-center justify-between gap-2 font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  <span>Rain Intensity</span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-cyan-300/80">
                    dBZ / mm·h⁻¹
                  </span>
                </div>
                <div
                  aria-label="Precipitation intensity spectrum from light to intense"
                  className="h-2 w-full rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #38bdf8 0%, #22d3ee 25%, #fde047 52%, #f97316 74%, #ef4444 90%, #c084fc 100%)',
                  }}
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                  <span>Light</span>
                  <span>Moderate</span>
                  <span>Heavy</span>
                  <span>Intense</span>
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-200/80 dark:border-slate-800 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#059669] inline-block" />
                  <span>LOW (0–24)</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#D97706] inline-block" />
                  <span>MOD (25–49)</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#EA580C] inline-block" />
                  <span>HIGH (50–74)</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#DC2626] inline-block" />
                  <span>SEV (75–100)</span>
                </div>
              </div>
            </div>

            {/* BOTTOM-RIGHT ACTIVE MODE STATUS BADGE */}
            {activeFrame && showRadar && radarData?.available && (
              <div className="hidden sm:flex items-center gap-2 absolute bottom-3 right-3 z-10 rounded-xl glass-panel-elevated px-3 py-1.5 text-[11px] shadow-xl">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeFrame.kind === 'nowcast'
                      ? 'bg-violet-400 animate-pulse'
                      : 'bg-cyan-400 animate-pulse'
                  }`}
                />
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {activeFrame.kind === 'nowcast' ? 'FORECAST NOWCAST' : 'OBSERVED SWEEP'}
                </span>
                <span className="font-mono text-[#0284C7] dark:text-cyan-300">
                  {activeFrame.labelIst}
                </span>
              </div>
            )}
          </div>

          {/* HORIZONTAL RADAR PLAYBACK TIMELINE CONSOLE (BELOW MAP) */}
          {showRadar && radarData?.available && radarFrames.length > 0 && (
            <SpotlightCard
              tactile={false}
              className="rounded-2xl glass-panel-elevated p-3.5 sm:p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-slate-900 dark:text-white">
                    <Radar className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                    Radar Sweep Timeline
                  </span>
                  {activeFrame && (
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold border ${
                        activeFrame.kind === 'nowcast'
                          ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400/35'
                          : 'bg-cyan-500/15 text-sky-700 dark:text-cyan-200 border-cyan-400/35'
                      }`}
                    >
                      {activeFrame.kind === 'nowcast' ? 'NOWCAST FORECAST' : 'OBSERVED'} ·{' '}
                      {activeFrame.labelIst}
                    </span>
                  )}
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    Frame {activeFrameIdx + 1}/{radarFrames.length}
                  </span>
                </div>

                {/* Playback Controls + Speed Selector */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveFrameIdx(
                          (prev) => (prev - 1 + radarFrames.length) % radarFrames.length
                        );
                      }}
                      aria-label="Previous radar frame"
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-[#0284C7] dark:hover:text-cyan-300 cursor-pointer"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      aria-label={isPlaying ? 'Pause radar playback' : 'Play radar playback'}
                      className="tactile-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-500 dark:hover:bg-cyan-400 text-white dark:text-slate-950 font-semibold text-xs shadow-md shadow-cyan-500/20 cursor-pointer"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" />
                          <span>Play</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveFrameIdx((prev) => (prev + 1) % radarFrames.length);
                      }}
                      aria-label="Next radar frame"
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:text-[#0284C7] dark:hover:text-cyan-300 cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Speed Control */}
                  <div
                    role="group"
                    aria-label="Radar playback speed"
                    className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-900/90 p-0.5 border border-slate-200 dark:border-slate-800"
                  >
                    {([0.5, 1, 2] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setPlaybackSpeed(speed)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                          playbackSpeed === speed
                            ? 'bg-white dark:bg-cyan-500/25 text-[#0284C7] dark:text-cyan-200 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        {speed}x
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={fetchRadarFrames}
                    disabled={radarLoading}
                    title="Refresh RainViewer radar timestamps"
                    aria-label="Refresh radar timestamps"
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-[#0284C7] dark:hover:text-cyan-300 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${radarLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Horizontal Interactive Timestamp Strip */}
              <div className="grid grid-cols-3 sm:grid-cols-9 gap-1.5">
                {radarFrames.map((frame, idx) => {
                  const isActive = idx === activeFrameIdx;
                  const isNowcast = frame.kind === 'nowcast';
                  return (
                    <button
                      key={`${frame.time}-${frame.kind}`}
                      type="button"
                      onClick={() => {
                        setIsPlaying(false);
                        setActiveFrameIdx(idx);
                      }}
                      className={`group rounded-xl px-2 py-2 text-left border transition-all cursor-pointer ${
                        isActive
                          ? isNowcast
                            ? 'bg-violet-500/20 border-violet-400 text-violet-900 dark:text-violet-100 shadow-[0_0_16px_rgba(139,92,246,0.25)]'
                            : 'bg-[#E0F2FE] dark:bg-cyan-500/20 border-sky-400 dark:border-cyan-400 text-[#0F172A] dark:text-white shadow-[0_0_16px_rgba(34,211,238,0.22)]'
                          : 'bg-slate-50 dark:bg-slate-900/65 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-sky-300 dark:hover:border-cyan-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-[9px] font-mono font-bold uppercase ${
                            isNowcast
                              ? 'text-violet-600 dark:text-violet-300'
                              : 'text-[#0284C7] dark:text-cyan-400'
                          }`}
                        >
                          {isNowcast ? 'Fcst' : 'Obs'}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive
                              ? isNowcast
                                ? 'bg-violet-400'
                                : 'bg-cyan-400'
                              : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        />
                      </div>
                      <div className="text-[11px] font-mono font-semibold tabular-nums mt-0.5 truncate">
                        {frame.labelIst.replace(' IST', '')}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/70 dark:border-slate-800/80">
                <span>
                  {radarData.attribution} · Tiles upscaled cleanly beyond native z7 resolution
                </span>
                <span className="font-mono tabular-nums">
                  Feed Synced: {formatTimestampIST(radarData.fetchedAt)}
                </span>
              </div>
            </SpotlightCard>
          )}
        </div>

        {/* Right Side Panel: Live Zone Intelligence OR India Summary OR Relief Facility */}
        {!isFullscreen && (
          <SpotlightCard
            tactile={false}
            className="lg:col-span-4 rounded-3xl glass-panel-elevated p-5 flex flex-col justify-between gap-4"
          >
            {indiaOverview ? (
              /* INDIA OVERVIEW SUMMARY PANEL */
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                      India Basin Network
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      9 Cities Monitored
                    </span>
                  </div>
                  <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                    National City-Risk Summary
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Click any marker on the map or select a city below to zoom into local radar and basin intelligence.
                  </p>
                </div>

                {/* Risk Tier Count Strip */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(['SEVERE', 'HIGH', 'MODERATE', 'LOW'] as const).map((tier) => (
                    <div
                      key={tier}
                      className="rounded-xl bg-slate-50 dark:bg-slate-900/75 border border-slate-200 dark:border-slate-800 py-2 px-1"
                    >
                      <div
                        className="font-mono text-lg font-bold tabular-nums"
                        style={{ color: RISK_STYLES[tier].hex }}
                      >
                        {indiaRiskCounts[tier]}
                      </div>
                      <div className="text-[9px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                        {tier}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Clickable Ranked City Risk List */}
                <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-0.5">
                  {sortedCitySummaries.map(({ city: c, summary, score, category }) => {
                    const hex = getRiskGlowHex(category);
                    const isSelected = c.id === selectedCity;
                    const rainStr =
                      summary?.rainfallMmHr !== null && summary?.rainfallMmHr !== undefined
                        ? formatRain(summary.rainfallMmHr, units, true)
                        : null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onSelectCity(c.id);
                          setIndiaOverview(false);
                        }}
                        className={`w-full rounded-xl px-3 py-2.5 text-left border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-[#E0F2FE] border-sky-300 dark:bg-cyan-500/15 dark:border-cyan-400/45'
                            : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-800/75'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: hex, boxShadow: `0 0 8px ${hex}` }}
                            />
                            <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                              {c.name}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {c.state}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 pl-4.5 truncate">
                            {rainStr ? `${rainStr.value} ${rainStr.unit}` : 'Rain N/A'} ·{' '}
                            {summary?.conditionText ?? 'Observed'}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                            {score !== null ? score : '—'}
                            <span className="text-[10px] font-normal text-slate-500">/100</span>
                          </div>
                          <div
                            className="text-[10px] font-mono font-bold"
                            style={{ color: hex }}
                          >
                            {category}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : selectedItem?.kind === 'zone' ? (
              /* LIVE ZONE INTELLIGENCE PANEL */
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                      Demonstration Zone Intelligence
                    </span>
                    <RiskStatusIndicator level={selectedItem.category} />
                  </div>
                  <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white leading-snug">
                    {selectedItem.zone.name}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedItem.zone.locality} · {city.name}, {city.state}
                  </p>
                </div>

                {/* Animated Circular Flood-Risk Gauge */}
                <div className="rounded-2xl bg-slate-50/90 dark:bg-slate-900/75 border border-slate-200 dark:border-cyan-500/20 p-4 flex items-center justify-between gap-4">
                  <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 132 132">
                      <circle
                        cx="66"
                        cy="66"
                        r={gaugeRadius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="10"
                        className="text-slate-200 dark:text-slate-800/90"
                      />
                      <circle
                        cx="66"
                        cy="66"
                        r={gaugeRadius}
                        fill="none"
                        stroke={gaugeHex}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={gaugeCircumference}
                        strokeDashoffset={gaugeDashoffset}
                        style={{
                          transition:
                            'stroke-dashoffset 0.85s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.35s ease',
                          filter: `drop-shadow(0 0 8px ${gaugeHex}70)`,
                        }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        Risk Score
                      </span>
                      <span className="font-mono text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums leading-none mt-0.5">
                        <AnimatedNumber value={selectedItem.score} />
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                        / 100
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 min-w-0 flex-1">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Model Confidence
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {telemetry?.risk.confidenceLabel ?? 'Moderate'} (±
                        {telemetry?.risk.uncertaintyPlusMinus ?? 14} pts)
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Basin Sensitivity
                      </div>
                      <div className="text-xs font-mono font-semibold text-[#0284C7] dark:text-cyan-300 mt-0.5">
                        ×{selectedItem.zone.drainageSensitivity.toFixed(2)} multiplier
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                      Heuristic index — not an official flood depth sensor.
                    </div>
                  </div>
                </div>

                {/* 4 Compact Glass Telemetry Cards */}
                <dl className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-xl bg-slate-50/90 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800/90 p-3">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Rainfall</span>
                      <CloudRain className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                    </dt>
                    <dd className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-1 tabular-nums">
                      {rainDisplay.value === 'Unavailable'
                        ? 'N/A'
                        : `${rainDisplay.value} ${rainDisplay.unit}`}
                    </dd>
                    <span className="text-[9px] font-mono uppercase text-[#0284C7] dark:text-cyan-400/90">
                      Observed
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50/90 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800/90 p-3">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Soil Moisture</span>
                      <Droplets className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                    </dt>
                    <dd className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-1 tabular-nums">
                      {selectedItem.localSoilPct !== null
                        ? `${selectedItem.localSoilPct}%`
                        : 'N/A'}
                    </dd>
                    <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400">
                      Model Estimate
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50/90 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800/90 p-3">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Drainage</span>
                      <Waves className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    </dt>
                    <dd className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-1 tabular-nums">
                      {selectedItem.localDrainagePct !== null
                        ? `${selectedItem.localDrainagePct}%`
                        : 'N/A'}
                    </dd>
                    <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400">
                      Model Headroom
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50/90 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800/90 p-3">
                    <dt className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                      <span>Elevation</span>
                      <Mountain className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    </dt>
                    <dd className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-1 tabular-nums">
                      {selectedItem.zone.elevationM} m ASL
                    </dd>
                    <span className="text-[9px] font-mono uppercase text-slate-500 dark:text-slate-400">
                      Terrain Baseline
                    </span>
                  </div>
                </dl>

                {/* AI Explanation Section (Violet/Cyan AI Accent) */}
                <div className="rounded-2xl bg-violet-50/80 dark:bg-gradient-to-br dark:from-violet-950/35 dark:to-cyan-950/25 border border-violet-200 dark:border-violet-400/30 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold text-violet-700 dark:text-violet-300">
                      <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      AI ESTIMATE · ZONE RATIONALE
                    </span>
                    {aiAssessment?.model && (
                      <span className="text-[10px] font-mono text-violet-600/80 dark:text-violet-300/75">
                        {aiAssessment.model}
                      </span>
                    )}
                  </div>

                  {aiLoading ? (
                    <div className="flex items-center gap-2 text-xs text-violet-800 dark:text-violet-200 py-1">
                      <BrainCircuit className="w-3.5 h-3.5 animate-pulse" />
                      <span>Synthesizing Gemini zone assessment...</span>
                    </div>
                  ) : aiAssessment?.zoneExplanations?.[selectedItem.zone.id] ? (
                    <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                      {aiAssessment.zoneExplanations[selectedItem.zone.id]}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {selectedItem.zone.description}
                    </p>
                  )}

                  {aiAssessment?.zoneExplanations?.[selectedItem.zone.id] && (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed pt-1.5 border-t border-violet-200/70 dark:border-violet-500/20">
                      {selectedItem.zone.description}
                    </p>
                  )}
                </div>

                {/* Contributing Factors Visualization */}
                {telemetry?.risk.contributingFactors &&
                  telemetry.risk.contributingFactors.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                          Contributing Drivers
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          City Baseline Weights
                        </span>
                      </div>

                      <div className="space-y-2">
                        {telemetry.risk.contributingFactors.map((factor) => {
                          const pct = Math.max(4, Math.min(100, factor.normalizedScore));
                          const barColor =
                            factor.normalizedScore >= 75
                              ? '#ef4444'
                              : factor.normalizedScore >= 50
                              ? '#f97316'
                              : factor.normalizedScore >= 25
                              ? '#eab308'
                              : '#06b6d4';
                          return (
                            <div key={factor.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-slate-700 dark:text-slate-300 truncate">
                                  {factor.label}{' '}
                                  <span className="font-mono text-[10px] text-slate-400">
                                    ({factor.weightPct}%)
                                  </span>
                                </span>
                                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                                  {factor.normalizedScore}/100
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, backgroundColor: barColor }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {/* Interactive Zone Switcher */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900 dark:text-slate-200">
                      Zones in {city.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      Click to inspect
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {computedZones.map((item) => {
                      const active = selectedItem.zone.id === item.zone.id;
                      return (
                        <button
                          key={item.zone.id}
                          type="button"
                          onClick={() =>
                            handleSelectZoneWithPan({
                              kind: 'zone',
                              zone: item.zone,
                              score: item.score,
                              category: item.category,
                              localSoilPct: item.localSoilPct,
                              localDrainagePct: item.localDrainagePct,
                            })
                          }
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs text-left border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#E0F2FE] border-sky-300 text-slate-900 font-semibold dark:bg-cyan-500/15 dark:border-cyan-400/45 dark:text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900/55 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/75'
                          }`}
                        >
                          <span className="truncate pr-2">{item.zone.name}</span>
                          <span className="inline-flex items-center gap-2 shrink-0">
                            <span className="font-mono text-[11px] tabular-nums">{item.score}</span>
                            <RiskStatusIndicator level={item.category} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : selectedItem?.kind === 'relief' ? (
              /* GOOGLE PLACES RELIEF FACILITY VIEW */
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => {
                    if (computedZones[0]) {
                      const first = computedZones[0];
                      handleSelectZoneWithPan({
                        kind: 'zone',
                        zone: first.zone,
                        score: first.score,
                        category: first.category,
                        localSoilPct: first.localSoilPct,
                        localDrainagePct: first.localDrainagePct,
                      });
                    } else {
                      setSelectedItem(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0284C7] dark:text-cyan-300 hover:underline cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Zone Intelligence</span>
                </button>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-[#2563EB] dark:text-blue-400">
                    Google Places Relief Facility
                  </div>
                  <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">
                    {selectedItem.place.name}
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {selectedItem.place.primaryTypeLabel}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-900/65 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2 text-xs">
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedItem.place.address}
                  </p>
                  {selectedItem.place.phone && (
                    <p className="font-mono text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                      <span>{selectedItem.place.phone}</span>
                    </p>
                  )}
                  {selectedItem.place.openNow !== null && (
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        selectedItem.place.openNow
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {selectedItem.place.openNow ? 'Open Now' : 'Currently Closed / Check Hours'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={selectedItem.place.directionsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Get Directions</span>
                  </a>
                  <a
                    href={selectedItem.place.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>View on Google Maps</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-12 text-center space-y-2">
                <Compass className="w-6 h-6 mx-auto text-[#0284C7] dark:text-cyan-400" />
                <p>
                  Click any flood-risk zone polygon, monitoring node, or relief marker on the map to inspect live intelligence.
                </p>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              <span>Telemetry Sync</span>
              <span>{formatTimestampIST(telemetry?.fetchedAt)}</span>
            </div>
          </SpotlightCard>
        )}
      </div>

      {/* Compact Data Provenance & Attribution Footer */}
      {!isFullscreen && (
        <div className="rounded-2xl glass-panel px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex items-start sm:items-center gap-2">
            <Info className="w-4 h-4 text-[#0284C7] dark:text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="text-slate-800 dark:text-slate-200">Data Layers:</strong>{' '}
              Precipitation sweeps from <strong className="text-[#0284C7] dark:text-cyan-300">RainViewer</strong> (Observed + Nowcast); basin polygons &amp; micro-nodes are{' '}
              <strong className="text-[#0284C7] dark:text-cyan-300">demonstration layers</strong> (not official NDMA, CWC, or municipal flood-inundation boundaries); zone explanations are{' '}
              <strong className="text-violet-700 dark:text-violet-300">AI Estimates</strong>.
            </span>
          </div>
          <span className="font-mono text-[10px] text-slate-500 dark:text-slate-500 shrink-0">
            Map tiles &copy; Google Maps Platform
          </span>
        </div>
      )}
    </div>
  );
};
