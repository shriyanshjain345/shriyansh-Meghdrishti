import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Compass,
  Droplets,
  Eye,
  EyeOff,
  FileImage,
  Flashlight,
  History,
  Info,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  SwitchCamera,
  Thermometer,
  Trash2,
  Upload,
  VideoOff,
  Wind,
  X,
} from 'lucide-react';
import { CITIES, CITY_MAP } from '../data/cities.ts';
import type {
  CityId,
  EnvVisionAnalysisReport,
  EnvVisionExternalContextResponse,
  EnvVisionHistoryRecord,
  EnvVisionLocationContext,
  EnvVisionWeatherContext,
  MeasuredAirQualityData,
  UnitsSystem,
} from '../types/flood.ts';
import {
  formatRain,
  formatTemperature,
  formatTimestampIST,
  formatWind,
  type ThemeMode,
} from '../components/RiskBadge.tsx';
import {
  buildEnvVisionRecommendations,
  captureFrameFromVideo,
  getConditionLabel,
  getIndicatorBoxColor,
  getPollutionIndicatorBadge,
  prepareImageFromFile,
  type PreparedVisionImage,
} from '../lib/envVisionHelpers.ts';
import {
  AccordionDrawer,
  AnimatedNumber,
  ScrollReveal,
  SlidingTabs,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

const HISTORY_STORAGE_KEY = 'meghdrishti_env_vision_history_v1';
const MAX_HISTORY_ITEMS = 15;

interface EnvVisionCameraPageProps {
  selectedCity: CityId;
  onSelectCity: (city: CityId) => void;
  units: UnitsSystem;
  theme: ThemeMode;
}

type CameraStage = 'idle' | 'starting' | 'live' | 'error';
type ActiveTab = 'camera' | 'history';

export const EnvVisionCameraPage: React.FC<EnvVisionCameraPageProps> = ({
  selectedCity,
  onSelectCity,
  units,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('camera');

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraStage, setCameraStage] = useState<CameraStage>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);

  // Image & Annotation state
  const [preparedImage, setPreparedImage] = useState<PreparedVisionImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showAnnotated, setShowAnnotated] = useState<boolean>(true);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisReport, setAnalysisReport] = useState<EnvVisionAnalysisReport | null>(null);

  // Location & External AQI / Weather state (privacy-first: GPS only requested on explicit click)
  const [locationCtx, setLocationCtx] = useState<EnvVisionLocationContext>(() => {
    const city = CITY_MAP[selectedCity];
    return {
      mode: 'city',
      label: `${city.name}, ${city.state}`,
      city: city.name,
      locality: null,
      lat: city.lat,
      lng: city.lng,
      permissionGranted: false,
    };
  });
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [aqiLoading, setAqiLoading] = useState<boolean>(false);
  const [airQuality, setAirQuality] = useState<MeasuredAirQualityData | null>(null);
  const [weatherCtx, setWeatherCtx] = useState<EnvVisionWeatherContext | null>(null);

  // Saved analysis history
  const [history, setHistory] = useState<EnvVisionHistoryRecord[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [viewingHistoryItem, setViewingHistoryItem] = useState<EnvVisionHistoryRecord | null>(null);

  // Sync localStorage when history changes
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore quota exceeded if storage is full
    }
  }, [history]);

  // Keep city mode synced when TopBar city changes (unless user explicitly switched to GPS or None)
  useEffect(() => {
    if (locationCtx.mode === 'city') {
      const city = CITY_MAP[selectedCity];
      setLocationCtx({
        mode: 'city',
        label: `${city.name}, ${city.state}`,
        city: city.name,
        locality: null,
        lat: city.lat,
        lng: city.lng,
        permissionGranted: false,
      });
    }
  }, [selectedCity, locationCtx.mode]);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchSupported(false);
    setTorchEnabled(false);
  }, []);

  // Ensure camera hardware stops when component unmounts or user switches to History tab
  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  useEffect(() => {
    if (activeTab !== 'camera' && cameraStage === 'live') {
      stopCameraStream();
      setCameraStage('idle');
    }
  }, [activeTab, cameraStage, stopCameraStream]);

  // Attach MediaStream to <video> element once live
  useEffect(() => {
    if (cameraStage === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        // Ignore autoplay promise rejection if user gesture already started stream
      });
    }
  }, [cameraStage]);

  const fetchExternalAirQuality = useCallback(async (loc: EnvVisionLocationContext): Promise<{
    aq: MeasuredAirQualityData | null;
    weather: EnvVisionWeatherContext | null;
    updatedLoc?: EnvVisionLocationContext;
  }> => {
    if (loc.mode === 'none' || loc.lat == null || loc.lng == null) {
      setAirQuality(null);
      setWeatherCtx(null);
      return { aq: null, weather: null };
    }

    setAqiLoading(true);
    try {
      const params = new URLSearchParams();
      if (loc.mode === 'gps' && loc.permissionGranted) {
        params.set('lat', String(loc.lat));
        params.set('lng', String(loc.lng));
        params.set('reverseGeocode', 'true');
      } else {
        params.set('cityId', selectedCity);
      }

      const res = await fetch(`/api/env-vision/air-quality?${params.toString()}`);
      const data = (await res.json()) as EnvVisionExternalContextResponse & { error?: string };

      if (!res.ok) {
        const unavailableAq: MeasuredAirQualityData = {
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
          pollutants: [],
          errorMessage: data?.error || `HTTP ${res.status}`,
        };
        setAirQuality(unavailableAq);
        setWeatherCtx(null);
        return { aq: unavailableAq, weather: null };
      }

      setAirQuality(data.airQuality);
      setWeatherCtx(data.weather);

      if (data.airQuality.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }

      let updatedLoc: EnvVisionLocationContext | undefined;
      if (loc.mode === 'gps' && data.locationLabel) {
        updatedLoc = {
          ...loc,
          label: data.locationLabel,
          city: data.resolvedCity,
          locality: data.resolvedLocality,
        };
        setLocationCtx(updatedLoc);
      }

      return { aq: data.airQuality, weather: data.weather, updatedLoc };
    } catch (err) {
      const unavailableAq: MeasuredAirQualityData = {
        available: false,
        source: 'Unavailable',
        stationOrScope: 'Network Error',
        measuredAt: null,
        aqi: null,
        aqiDisplay: null,
        aqiScale: null,
        regionStandard: null,
        aqiCategory: null,
        dominantPollutant: null,
        pollutants: [],
        errorMessage: err instanceof Error ? err.message : 'Unable to reach air quality API',
      };
      setAirQuality(unavailableAq);
      setWeatherCtx(null);
      return { aq: unavailableAq, weather: null };
    } finally {
      setAqiLoading(false);
    }
  }, [selectedCity]);

  // Fetch initial external AQI/weather context when location mode/city changes
  useEffect(() => {
    if (viewingHistoryItem) return;
    if (locationCtx.mode === 'city') {
      fetchExternalAirQuality(locationCtx);
    } else if (locationCtx.mode === 'none') {
      setAirQuality(null);
      setWeatherCtx(null);
    }
  }, [locationCtx.mode, selectedCity, viewingHistoryItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCamera = async (requestedFacing: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setImageError(null);
    setViewingHistoryItem(null);

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
      setCameraStage('error');
      setCameraError('Live camera access requires a secure HTTPS connection. Please upload a photograph instead.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStage('error');
      setCameraError('Camera capture API (getUserMedia) is not supported in this browser. Please upload a photograph below.');
      return;
    }

    stopCameraStream();
    setCameraStage('starting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: requestedFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setFacingMode(requestedFacing);
      setPreparedImage(null);
      setAnalysisReport(null);
      setAnalysisError(null);
      setCameraStage('live');

      // Inspect hardware torch capability if exposed by device track
      try {
        const videoTrack = stream.getVideoTracks()[0];
        const caps = (videoTrack?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(caps.torch));
        setTorchEnabled(false);
      } catch {
        setTorchSupported(false);
        setTorchEnabled(false);
      }

      // Check if multiple cameras exist for front/back toggle visibility
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch {
        setHasMultipleCameras(false);
      }
    } catch (err: any) {
      stopCameraStream();
      setCameraStage('error');
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied or blocked by browser/frame settings. You can allow camera access in browser permissions or upload a photograph instead.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('No camera hardware was detected on this device. Please upload an image file instead.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraError('Camera is currently in use by another application. Close the other app or upload an image.');
      } else {
        setCameraError(err?.message || 'Unable to start camera preview. Please upload a photograph instead.');
      }
    }
  };

  const handleSwitchCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    await openCamera(nextFacing);
  };

  const handleToggleTorch = async () => {
    if (!streamRef.current || !torchSupported) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack?.applyConstraints) return;
    const next = !torchEnabled;
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchEnabled(next);
    } catch {
      setTorchSupported(false);
      setTorchEnabled(false);
    }
  };

  const handleCapturePhoto = async () => {
    if (!videoRef.current) return;
    setImageError(null);
    setAnalysisError(null);
    try {
      const captured = await captureFrameFromVideo(videoRef.current);
      stopCameraStream();
      setCameraStage('idle');
      setPreparedImage(captured);
      setAnalysisReport(null);
      setShowAnnotated(true);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to capture photograph.');
    }
  };

  const handleFileSelected = async (file: File | undefined | null) => {
    if (!file) return;
    setImageError(null);
    setAnalysisError(null);
    setViewingHistoryItem(null);
    stopCameraStream();
    setCameraStage('idle');

    try {
      const prepared = await prepareImageFromFile(file);
      setPreparedImage(prepared);
      setAnalysisReport(null);
      setShowAnnotated(true);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Unable to process uploaded image.');
    }
  };

  const handleRetake = () => {
    setPreparedImage(null);
    setAnalysisReport(null);
    setAnalysisError(null);
    setImageError(null);
    setViewingHistoryItem(null);
  };

  const handleRequestGpsLocation = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser. Select a monitored city instead.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lng = Math.round(pos.coords.longitude * 10000) / 10000;
        const nextLoc: EnvVisionLocationContext = {
          mode: 'gps',
          label: `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`,
          lat,
          lng,
          permissionGranted: true,
        };
        setLocationCtx(nextLoc);
        setGpsLoading(false);
        await fetchExternalAirQuality(nextLoc);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsError('Location permission denied. Select a city below to fetch regional air quality data.');
        } else {
          setGpsError('Unable to determine GPS position. Select a city below instead.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const handleAnalyseEnvironment = async () => {
    if (!preparedImage) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setViewingHistoryItem(null);

    try {
      const visionPromise = fetch('/api/env-vision/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: preparedImage.base64,
          mimeType: preparedImage.mimeType,
        }),
      });

      const aqPromise =
        locationCtx.mode !== 'none'
          ? fetchExternalAirQuality(locationCtx)
          : Promise.resolve({ aq: null, weather: null, updatedLoc: undefined });

      const [visionRes, aqResult] = await Promise.all([visionPromise, aqPromise]);
      const visionJson = await visionRes.json();

      if (!visionRes.ok) {
        setAnalysisError(visionJson?.error || `Analysis failed with HTTP ${visionRes.status}`);
        return;
      }

      const report = visionJson as EnvVisionAnalysisReport;
      setAnalysisReport(report);
      setShowAnnotated(true);

      const finalAq = aqResult.aq ?? airQuality;
      const finalWeather = aqResult.weather ?? weatherCtx;
      const finalLoc = aqResult.updatedLoc ?? locationCtx;
      const recs = buildEnvVisionRecommendations(report, finalAq);

      const record: EnvVisionHistoryRecord = {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: report.analyzedAt || new Date().toISOString(),
        thumbnailDataUrl: preparedImage.thumbnailDataUrl,
        locationLabel: finalLoc.mode === 'none' ? null : finalLoc.label,
        locationMode: finalLoc.mode,
        analysis: report,
        airQuality: finalAq,
        weather: finalWeather,
        recommendations: recs,
      };

      setHistory((prev) => [record, ...prev].slice(0, MAX_HISTORY_ITEMS));
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Unable to reach environmental vision server.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleOpenHistoryRecord = (record: EnvVisionHistoryRecord) => {
    stopCameraStream();
    setCameraStage('idle');
    setViewingHistoryItem(record);
    setAnalysisReport(record.analysis);
    setAirQuality(record.airQuality);
    setWeatherCtx(record.weather);
    setShowAnnotated(true);
    setActiveTab('camera');
  };

  const handleDeleteHistoryRecord = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (viewingHistoryItem?.id === id) {
      setViewingHistoryItem(null);
      setAnalysisReport(null);
    }
  };

  // Active report & recommendations (either live session or opened from history)
  const activeReport = viewingHistoryItem ? viewingHistoryItem.analysis : analysisReport;
  const activeAq = viewingHistoryItem ? viewingHistoryItem.airQuality : airQuality;
  const activeWeather = viewingHistoryItem ? viewingHistoryItem.weather : weatherCtx;
  const activeDisplayImageUrl = viewingHistoryItem
    ? viewingHistoryItem.thumbnailDataUrl
    : preparedImage?.dataUrl ?? null;

  const recommendations = useMemo(
    () => (activeReport ? buildEnvVisionRecommendations(activeReport, activeAq) : []),
    [activeReport, activeAq]
  );

  const annotatedBoxes = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.detectedIndicators.filter(
      (ind) =>
        ind.detected &&
        ind.boundingBox &&
        ind.boundingBox.ymax > ind.boundingBox.ymin &&
        ind.boundingBox.xmax > ind.boundingBox.xmin
    );
  }, [activeReport]);

  const indicatorBadge = activeReport
    ? getPollutionIndicatorBadge(activeReport.visualPollutionIndicator)
    : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <ScrollReveal delayMs={0}>
        <SpotlightCard
          tactile={false}
          className="rounded-2xl glass-panel p-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                <Camera className="w-4 h-4" />
                <span>AI Environmental Vision · Smart Air Quality Camera</span>
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                AI Environmental Camera
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
                Capture or upload an outdoor photograph to screen for visible smoke plumes, road or construction dust,
                haze/smog, and fog layers using Gemini Vision—paired side-by-side with external measured AQI data.
              </p>
            </div>

            {/* Sub-navigation: Camera & Report vs Analysis History */}
            <SlidingTabs
              layoutId="env-vision-main-tabs"
              activeId={activeTab}
              onChange={setActiveTab}
              className="self-start lg:self-auto"
              items={[
                { id: 'camera', label: 'Camera & Analysis', icon: Camera },
                { id: 'history', label: `Analysis History (${history.length})`, icon: History },
              ]}
            />
          </div>
        </SpotlightCard>
      </ScrollReveal>

      {activeTab === 'history' ? (
        /* ================= ANALYSIS HISTORY VIEW ================= */
        <section className="rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Saved Environmental Vision Reports
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stored locally in your browser. Up to {MAX_HISTORY_ITEMS} recent analyses are retained.
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  if (viewingHistoryItem) setViewingHistoryItem(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-500/30 bg-[#FEF2F2] dark:bg-red-950/30 px-3 py-1.5 text-xs font-medium text-[#B91C1C] dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer self-start sm:self-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <History className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No environmental camera analyses saved yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Capture or upload a photograph in the Camera &amp; Analysis tab to generate and archive your first visual + AQI report.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('camera')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Open Environmental Camera
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {history.map((item) => {
                const badge = getPollutionIndicatorBadge(item.analysis.visualPollutionIndicator);
                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 overflow-hidden flex flex-col"
                  >
                    <div className="relative h-44 bg-slate-200 dark:bg-slate-950">
                      <img
                        src={item.thumbnailDataUrl}
                        alt={`Analysis from ${item.createdAt}`}
                        className="w-full h-full object-cover"
                      />
                      <span
                        className={`absolute top-2.5 left-2.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${badge.classes}`}
                      >
                        {getConditionLabel(item.analysis.visualCondition)}
                      </span>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{formatTimestampIST(item.createdAt)}</span>
                          <span>{Math.round(item.analysis.confidence * 100)}% conf.</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                          {item.analysis.visualConditionLabel}
                        </p>
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                          <MapPin className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400 shrink-0" />
                          <span className="truncate">
                            {item.locationLabel ? item.locationLabel : 'Location not provided'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          Measured AQI:{' '}
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
                            {item.airQuality?.available && item.airQuality.aqiDisplay
                              ? `${item.airQuality.aqiDisplay} (${item.airQuality.aqiCategory || 'Measured'})`
                              : 'DATA UNAVAILABLE'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleOpenHistoryRecord(item)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-3 py-2 text-xs font-semibold text-white cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Open Report
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistoryRecord(item.id)}
                          aria-label="Delete analysis record"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-500/40 text-slate-600 dark:text-slate-300 hover:text-[#B91C1C] dark:hover:text-red-300 p-2 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        /* ================= CAMERA, LOCATION & RESULTS VIEW ================= */
        <>
          {/* Location & Meteorological Context Strip */}
          <section className="rounded-2xl glass-panel p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                  <span>Location &amp; Atmospheric Context (For Measured AQI &amp; Weather)</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  GPS coordinates are only accessed when you explicitly click{' '}
                  <strong className="text-slate-800 dark:text-slate-200">Use GPS Location</strong>. Photograph analysis
                  runs independently of location.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Select city for external AQI"
                  value={locationCtx.mode === 'city' ? selectedCity : '__custom__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__none__') {
                      setLocationCtx({
                        mode: 'none',
                        label: 'No location selected',
                        lat: null,
                        lng: null,
                        permissionGranted: false,
                      });
                    } else if (val !== '__custom__') {
                      const cId = val as CityId;
                      onSelectCity(cId);
                      const city = CITY_MAP[cId];
                      setLocationCtx({
                        mode: 'city',
                        label: `${city.name}, ${city.state}`,
                        city: city.name,
                        locality: null,
                        lat: city.lat,
                        lng: city.lng,
                        permissionGranted: false,
                      });
                    }
                  }}
                  className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-[#0284C7] dark:focus:border-cyan-500 cursor-pointer"
                >
                  {locationCtx.mode === 'gps' && (
                    <option value="__custom__">GPS: {locationCtx.label}</option>
                  )}
                  {locationCtx.mode === 'none' && (
                    <option value="__custom__">Location Disabled (Visual Only)</option>
                  )}
                  {CITIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      City: {c.name}, {c.state}
                    </option>
                  ))}
                  <option value="__none__">No Location (Visual Only)</option>
                </select>

                <button
                  type="button"
                  onClick={handleRequestGpsLocation}
                  disabled={gpsLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 dark:border-cyan-500/30 bg-[#E0F2FE] dark:bg-cyan-500/15 hover:bg-sky-100 dark:hover:bg-cyan-500/25 px-3 py-2 text-xs font-semibold text-[#0284C7] dark:text-cyan-300 cursor-pointer disabled:opacity-60"
                >
                  {gpsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Compass className="w-3.5 h-3.5" />}
                  <span>Use GPS Location</span>
                </button>

                {locationCtx.mode !== 'none' && (
                  <button
                    type="button"
                    onClick={() => fetchExternalAirQuality(locationCtx)}
                    disabled={aqiLoading}
                    title="Refresh measured AQI & weather"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${aqiLoading ? 'animate-spin text-[#0284C7]' : ''}`} />
                    <span>Sync AQI</span>
                  </button>
                )}
              </div>
            </div>

            {gpsError && (
              <div className="rounded-lg bg-[#FFFBEB] dark:bg-amber-950/30 border border-[#FDE68A] dark:border-amber-500/30 px-3 py-2 text-xs text-[#B45309] dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{gpsError}</span>
              </div>
            )}

            {/* Weather & Dispersion Context */}
            {activeWeather?.available && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-3 py-2">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Thermometer className="w-3 h-3 text-[#0284C7] dark:text-cyan-400" />
                      <span>Temp</span>
                    </div>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {formatTemperature(activeWeather.temperatureC, units)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-3 py-2">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Droplets className="w-3 h-3 text-[#0284C7] dark:text-cyan-400" />
                      <span>Humidity</span>
                    </div>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {activeWeather.humidityPct !== null ? `${Math.round(activeWeather.humidityPct)}%` : 'Unavailable'}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-3 py-2">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Wind className="w-3 h-3 text-[#0284C7] dark:text-cyan-400" />
                      <span>Wind</span>
                    </div>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                      {formatWind(activeWeather.windKmh, units)}
                      {activeWeather.windCardinal ? ` ${activeWeather.windCardinal}` : ''}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-3 py-2">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <Droplets className="w-3 h-3 text-[#2563EB] dark:text-blue-400" />
                      <span>Recent Rain</span>
                    </div>
                    <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {(() => {
                        const r = formatRain(activeWeather.recentRainMm, units, false);
                        return r.unit ? `${r.value} ${r.unit}` : r.value;
                      })()}
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-6 rounded-lg bg-sky-50/70 dark:bg-slate-900/80 border border-sky-200/80 dark:border-slate-800 px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-semibold text-[#0284C7] dark:text-cyan-300">
                    Dispersion &amp; Visual Context ({activeWeather.source}):{' '}
                  </span>
                  {activeWeather.dispersionNote}
                </div>
              </div>
            )}
          </section>

          {viewingHistoryItem && (
            <div className="rounded-xl bg-[#E0F2FE] dark:bg-cyan-950/40 border border-sky-200 dark:border-cyan-500/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs text-[#0369A1] dark:text-cyan-200">
                <strong>Viewing Archived Report:</strong> Captured {formatTimestampIST(viewingHistoryItem.createdAt)}
                {viewingHistoryItem.locationLabel ? ` · ${viewingHistoryItem.locationLabel}` : ''}
              </div>
              <button
                type="button"
                onClick={handleRetake}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer self-start sm:self-auto"
              >
                <X className="w-3.5 h-3.5" />
                Return to Live Camera
              </button>
            </div>
          )}

          {/* ================= CAMERA & IMAGE CAPTURE STAGE ================= */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Large Camera Preview / Captured Image Stage */}
            <div className="lg:col-span-7 rounded-2xl glass-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {cameraStage === 'live'
                      ? 'Live Camera Viewfinder'
                      : activeDisplayImageUrl
                      ? 'Photograph Preview'
                      : 'Camera & Photograph Input'}
                  </span>
                  {preparedImage && !viewingHistoryItem && (
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {preparedImage.width}×{preparedImage.height}px · {(preparedImage.byteSize / 1024).toFixed(0)} KB
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {cameraStage === 'live' && (
                    <>
                      <button
                        type="button"
                        onClick={handleToggleTorch}
                        disabled={!torchSupported}
                        title={
                          torchSupported
                            ? torchEnabled
                              ? 'Turn Flashlight Off'
                              : 'Turn Flashlight On'
                            : 'Hardware flashlight/torch not exposed by this browser/camera'
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                          torchEnabled
                            ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        <Flashlight className="w-3.5 h-3.5 text-amber-400" />
                        <span>{torchEnabled ? 'Torch On' : 'Torch'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        title={hasMultipleCameras ? 'Switch Front / Back Camera' : 'Attempt Front / Back Switch'}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                        <span>{facingMode === 'environment' ? 'Back Cam' : 'Front Cam'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stopCameraStream();
                          setCameraStage('idle');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Close
                      </button>
                    </>
                  )}

                  {activeDisplayImageUrl && activeReport && (
                    <SlidingTabs
                      layoutId="env-vision-overlay-tabs"
                      activeId={showAnnotated ? 'annotated' : 'original'}
                      onChange={(mode) => setShowAnnotated(mode === 'annotated')}
                      items={[
                        { id: 'annotated', label: 'Annotated', icon: Eye },
                        { id: 'original', label: 'Original', icon: EyeOff },
                      ]}
                    />
                  )}
                </div>
              </div>

              {/* Viewport Body */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileSelected(file);
                }}
                className={`relative bg-slate-950 min-h-[340px] sm:min-h-[420px] flex items-center justify-center overflow-hidden ${
                  dragActive ? 'ring-2 ring-inset ring-cyan-400' : ''
                }`}
              >
                {cameraStage === 'live' ? (
                  <>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className="w-full max-h-[500px] object-contain"
                    />
                    {/* Futuristic Optical HUD Reticle */}
                    <div className="pointer-events-none absolute inset-4 sm:inset-6">
                      <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-400/80 rounded-tl" />
                      <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-400/80 rounded-tr" />
                      <span className="absolute bottom-14 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-400/80 rounded-bl" />
                      <span className="absolute bottom-14 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-400/80 rounded-br" />
                      <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-950/75 border border-cyan-500/35 px-2.5 py-1 text-[10px] font-mono text-cyan-300 backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        OPTICAL SENSOR · {facingMode === 'environment' ? 'REAR' : 'FRONT'}
                      </div>
                    </div>
                    {/* Bottom-anchored capture control */}
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-center gap-4">
                      <button
                        type="button"
                        onClick={handleCapturePhoto}
                        className="inline-flex items-center gap-2.5 rounded-full bg-white hover:bg-sky-50 text-slate-900 px-6 py-3 text-sm font-bold shadow-lg ring-4 ring-white/30 cursor-pointer transition-transform active:scale-95"
                      >
                        <Camera className="w-5 h-5 text-[#0284C7]" />
                        <span>Capture Photograph</span>
                      </button>
                    </div>
                  </>
                ) : activeDisplayImageUrl ? (
                  <div className="relative w-full flex items-center justify-center bg-slate-950">
                    <div className="relative inline-block max-w-full">
                      <img
                        src={activeDisplayImageUrl}
                        alt="Captured or uploaded outdoor environment"
                        className="block max-h-[500px] w-auto max-w-full object-contain"
                      />

                      {/* Animated Scanner Beam while Gemini Vision analyses */}
                      {analyzing && (
                        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-cyan-950/20">
                          <div className="scanner-beam h-12 w-full bg-gradient-to-b from-transparent via-cyan-400/45 to-transparent border-b-2 border-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.65)]" />
                          <div className="absolute top-3 left-3 rounded-md bg-slate-950/85 border border-cyan-500/45 px-2.5 py-1 text-[11px] font-mono text-cyan-300">
                            SCANNING ATMOSPHERIC INDICATORS...
                          </div>
                        </div>
                      )}

                      {/* Grounded SVG Bounding Box Overlay (0..1000 coordinate space) */}
                      {showAnnotated && annotatedBoxes.length > 0 && (
                        <svg
                          viewBox="0 0 1000 1000"
                          preserveAspectRatio="none"
                          className="absolute inset-0 w-full h-full pointer-events-none"
                        >
                          {annotatedBoxes.map((ind, idx) => {
                            const b = ind.boundingBox!;
                            const style = getIndicatorBoxColor(ind.type);
                            const width = Math.max(20, b.xmax - b.xmin);
                            const height = Math.max(20, b.ymax - b.ymin);
                            const labelY = b.ymin > 42 ? b.ymin - 8 : b.ymin + 26;
                            return (
                              <g key={`${ind.type}-${idx}`}>
                                <rect
                                  x={b.xmin}
                                  y={b.ymin}
                                  width={width}
                                  height={height}
                                  fill={style.fill}
                                  stroke={style.stroke}
                                  strokeWidth="4"
                                  strokeDasharray={ind.type === 'haze_smog' ? '10 6' : undefined}
                                  rx="6"
                                />
                                <rect
                                  x={b.xmin}
                                  y={Math.max(2, labelY - 24)}
                                  width={Math.min(990 - b.xmin, Math.max(180, ind.name.length * 11 + 64))}
                                  height="28"
                                  rx="4"
                                  fill={style.badgeBg}
                                />
                                <text
                                  x={b.xmin + 10}
                                  y={Math.max(20, labelY - 5)}
                                  fill="#FFFFFF"
                                  fontSize="17"
                                  fontWeight="700"
                                  fontFamily="system-ui, sans-serif"
                                >
                                  {ind.name} ({Math.round(ind.confidence * 100)}%)
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Idle / Upload Fallback Prompt */
                  <div className="p-6 sm:p-8 text-center max-w-md space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-cyan-400">
                      {cameraStage === 'starting' ? (
                        <Loader2 className="w-7 h-7 animate-spin" />
                      ) : cameraStage === 'error' ? (
                        <VideoOff className="w-7 h-7 text-amber-400" />
                      ) : (
                        <Camera className="w-7 h-7" />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-semibold text-white">
                        {cameraStage === 'starting'
                          ? 'Starting Camera Feed...'
                          : cameraStage === 'error'
                          ? 'Camera Access Unavailable — Upload Instead'
                          : 'Capture or Upload an Environmental Photograph'}
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {cameraError
                          ? cameraError
                          : 'Point your camera toward the sky, skyline, road, construction site, or visible plume, or drag & drop a JPEG, PNG, or WebP photograph.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => openCamera(facingMode)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Open Camera</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-100 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Upload Image</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Loading overlay during Gemini Vision analysis */}
                {analyzing && (
                  <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-6 text-center z-20">
                    <div className="relative">
                      <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-white">
                        Analysing Photograph with Gemini Vision...
                      </p>
                      <p className="text-xs text-slate-300 max-w-sm">
                        Screening for smoke plumes, road/construction dust, atmospheric haze, fog layers, and distant
                        visibility clarity.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Footer under Camera/Preview */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    handleFileSelected(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />

                <div className="flex flex-wrap items-center gap-2">
                  {cameraStage !== 'live' && (
                    <button
                      type="button"
                      onClick={() => openCamera(facingMode)}
                      className="tactile-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                      <span>{preparedImage ? 'Retake via Camera' : 'Open Camera'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#2563EB] dark:text-blue-400" />
                    <span>Upload Photo</span>
                  </button>

                  {preparedImage && (
                    <button
                      type="button"
                      onClick={handleRetake}
                      className="tactile-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>

                {preparedImage && !viewingHistoryItem && (
                  <button
                    type="button"
                    onClick={handleAnalyseEnvironment}
                    disabled={analyzing}
                    className="tactile-btn inline-flex items-center gap-2 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analysing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analyse Environment</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Annotation Legend / Honest Fallback Note */}
              {activeReport && activeDisplayImageUrl && (
                <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1222] text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400 shrink-0" />
                    {annotatedBoxes.length > 0 ? (
                      <span>
                        Showing {annotatedBoxes.length} localized region{' '}
                        {annotatedBoxes.length === 1 ? 'box' : 'boxes'}. Toggle Original Photo above to inspect unobstructed pixels.
                      </span>
                    ) : (
                      <span>
                        No discrete bounding boxes localized for this scene — see labelled textual observations in Card A.
                      </span>
                    )}
                  </div>
                </div>
              )}

              {(imageError || analysisError) && (
                <div className="p-3 bg-[#FEF2F2] dark:bg-red-950/30 border-t border-[#FECACA] dark:border-red-500/30 text-xs text-[#B91C1C] dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{imageError || analysisError}</span>
                </div>
              )}
            </div>

            {/* Right Guidance / Quick Status Panel */}
            <div className="lg:col-span-5 space-y-4">
              {/* Mandatory Scientific Disclaimer Card */}
              <div className="rounded-xl bg-[#FFFBEB] dark:bg-amber-950/25 border border-[#FDE68A] dark:border-amber-500/30 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#B45309] dark:text-amber-300">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Scientific Limitation Notice</span>
                </div>
                <p className="text-xs leading-relaxed text-[#78350F] dark:text-amber-100/90">
                  <strong>
                    A photograph can identify visible environmental indicators but cannot directly measure PM2.5, PM10,
                    AQI or harmful gas concentrations.
                  </strong>{' '}
                  MeghDrishti strictly separates visual image observations (Card A) from external monitoring station /
                  modelled air quality readings (Card B).
                </p>
              </div>

              {/* What Gemini Vision Inspects */}
              <div className="rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <FileImage className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
                  <span>Visual Screening Protocol</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Smoke &amp; Open Burning</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Plume colour, density, location, and stationary vs dispersing motion.
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Dust &amp; Construction</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Suspended road dust clouds, construction particulates, dusty surfaces.
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Haze &amp; Urban Smog</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Diffuse contrast loss across distant buildings vs localized plumes.
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">Fog / Mist vs False Positives</p>
                    <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                      Separates clouds, sunsets, night darkness, and indoor scenes honestly.
                    </p>
                  </div>
                </div>
              </div>

              {/* Compact Measured AQI Preview before / alongside analysis */}
              <div className="rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Active Reference AQI ({locationCtx.mode === 'none' ? 'Unset' : locationCtx.label})
                  </span>
                  {aqiLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0284C7]" />}
                </div>
                {locationCtx.mode === 'none' ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Select a monitored city or grant GPS permission above to pair visual analysis with official/external AQI measurements.
                  </p>
                ) : activeAq?.available ? (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {activeAq.aqiDisplay ?? '—'}
                        <span className="ml-2 text-xs font-sans font-medium text-slate-500 dark:text-slate-400">
                          {activeAq.aqiCategory}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {activeAq.source} · Dominant: {activeAq.dominantPollutant || 'Unavailable'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                    {aqiLoading ? 'Retrieving external air quality data...' : 'DATA UNAVAILABLE'}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ================= MANDATORY TWO-CARD RESULTS SECTION (CARD A vs CARD B) ================= */}
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            {/* CARD A: VISUAL ENVIRONMENTAL ANALYSIS */}
            <div className="rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#0284C7] dark:text-cyan-400">
                    CARD A · PHOTOGRAPH &amp; GEMINI VISION
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    VISUAL ENVIRONMENTAL ANALYSIS
                  </h2>
                </div>
                {indicatorBadge && (
                  <span className={`rounded-md border px-2.5 py-1 text-[11px] font-bold ${indicatorBadge.classes}`}>
                    {indicatorBadge.label}
                  </span>
                )}
              </div>

              {!activeReport ? (
                <div className="py-10 text-center space-y-2">
                  <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Awaiting Photograph Analysis
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                    Capture or upload an image and click <strong>Analyse Environment</strong> to generate structured
                    visual indicators, visibility assessment, and source cues.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* 1. ENVIRONMENTAL STATUS */}
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Environmental Status
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        Model: {activeReport.modelUsed}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Visual Condition</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {getConditionLabel(activeReport.visualCondition)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Visual Pollution Indicator</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 capitalize">
                          {activeReport.visualPollutionIndicator.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Classification Confidence</p>
                        <p className="font-mono text-sm font-bold text-[#0284C7] dark:text-cyan-400 mt-0.5">
                          <AnimatedNumber value={Math.round(activeReport.confidence * 100)} />%
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <strong className="text-slate-900 dark:text-slate-100">{activeReport.visualConditionLabel}:</strong>{' '}
                      {activeReport.sceneContext}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Image quality note: {activeReport.imageQualityNote}
                    </p>
                  </div>

                  {/* 2. VISIBLE POLLUTANTS AND INDICATORS (Accordion Drawer) */}
                  <AccordionDrawer
                    title="Visible Pollutants & Indicators"
                    subtitle="Smoke plumes, dust clouds, urban haze/smog, and fog/mist screening"
                    badge={
                      <span className="text-[11px] font-mono text-[#0284C7] dark:text-cyan-300">
                        {activeReport.detectedIndicators.filter((d) => d.detected).length} detected
                      </span>
                    }
                    defaultOpen
                  >
                    {activeReport.detectedIndicators.length === 0 ? (
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        No distinct pollution indicators observed in the supplied frame.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {activeReport.detectedIndicators.map((ind, idx) => (
                          <div
                            key={`${ind.type}-${idx}`}
                            className={`rounded-lg border p-3 space-y-1.5 ${
                              ind.detected
                                ? 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-700'
                                : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70 opacity-85'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    ind.detected ? 'bg-[#0284C7] dark:bg-cyan-400' : 'bg-slate-400'
                                  }`}
                                />
                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{ind.name}</span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] font-mono">
                                <span
                                  className={`px-1.5 py-0.5 rounded border ${
                                    ind.detected
                                      ? 'bg-sky-50 dark:bg-cyan-500/10 border-sky-200 dark:border-cyan-500/30 text-[#0284C7] dark:text-cyan-300'
                                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                                  }`}
                                >
                                  {ind.detected ? 'DETECTED' : 'NOT DETECTED'}
                                </span>
                                <span className="text-slate-600 dark:text-slate-300 capitalize">
                                  Severity: {ind.severity.replace('_', ' ')}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {Math.round(ind.confidence * 100)}%
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-slate-700 dark:text-slate-300">{ind.description}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>
                                <strong>Location:</strong> {ind.imageLocation}
                              </span>
                              {ind.smokeAppearance && (
                                <span>
                                  <strong>Appearance:</strong> {ind.smokeAppearance}
                                </span>
                              )}
                              {ind.movementOrDispersion && (
                                <span>
                                  <strong>Dispersion:</strong> {ind.movementOrDispersion}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionDrawer>

                  {/* 3. VISIBILITY ANALYSIS (Accordion Drawer) */}
                  <AccordionDrawer
                    title="Visibility Analysis"
                    badge={
                      <span className="text-[11px] font-semibold capitalize text-slate-700 dark:text-slate-200">
                        {activeReport.visibility.category} ·{' '}
                        {activeReport.visibility.visibilityReduced ? 'Reduced' : 'Clear'}
                      </span>
                    }
                    defaultOpen
                  >
                    <div className="space-y-2">
                      <p className="text-xs text-slate-700 dark:text-slate-300">{activeReport.visibility.description}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
                        <div>
                          <strong className="text-slate-800 dark:text-slate-200">Distant Object Clarity:</strong>{' '}
                          {activeReport.visibility.distantObjectClarity}
                        </div>
                        <div>
                          <strong className="text-slate-800 dark:text-slate-200">Atmospheric Obstruction:</strong>{' '}
                          {activeReport.visibility.atmosphericObstruction}
                        </div>
                      </div>
                    </div>
                  </AccordionDrawer>

                  {/* 4. POSSIBLE SOURCES (Accordion Drawer) */}
                  <AccordionDrawer
                    title="Possible Visual Sources"
                    subtitle="Reported only when directly supported by image evidence"
                    badge={
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {activeReport.possibleSources.length} notes
                      </span>
                    }
                    defaultOpen
                  >
                    <div className="space-y-2">
                      {activeReport.possibleSources.map((src, idx) => (
                        <div
                          key={`${src.source}-${idx}`}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 px-3 py-2.5 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{src.label}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">{src.evidence}</p>
                          </div>
                          {src.source !== 'unknown' && (
                            <span className="text-[11px] font-mono text-slate-500 shrink-0">
                              {Math.round(src.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </AccordionDrawer>

                  {/* 5. LIMITATIONS (Accordion Drawer) */}
                  <AccordionDrawer
                    title="Vision Analysis Limitations"
                    badge={
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {activeReport.limitations.length} caveats
                      </span>
                    }
                    defaultOpen={false}
                  >
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      {activeReport.limitations.map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </AccordionDrawer>
                </div>
              )}
            </div>

            {/* CARD B: MEASURED AIR QUALITY (OFFICIAL / API AIR QUALITY DATA) */}
            <SpotlightCard
              tactile={false}
              className="rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm p-5 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#2563EB] dark:text-blue-400">
                    CARD B · OFFICIAL / API AIR QUALITY DATA
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    MEASURED AIR QUALITY
                  </h2>
                </div>
                {activeAq?.available && activeAq.aqiCategory && (
                  <span className="rounded-md border border-sky-200 dark:border-cyan-500/30 bg-[#E0F2FE] dark:bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-[#0284C7] dark:text-cyan-300">
                    {activeAq.aqiCategory}
                  </span>
                )}
              </div>

              {locationCtx.mode === 'none' && !viewingHistoryItem ? (
                <div className="py-10 text-center space-y-3">
                  <MapPin className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Location Required for Measured Air Quality
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
                    Select a monitored Indian city or click <strong>Use GPS Location</strong> at the top of this page
                    to retrieve external AQI, PM2.5, PM10, NO2, O3, CO, and SO2 readings.
                  </p>
                </div>
              ) : aqiLoading && !activeAq ? (
                <div className="py-10 text-center space-y-2">
                  <Loader2 className="w-7 h-7 animate-spin text-[#0284C7] mx-auto" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Fetching official / API air quality measurements...
                  </p>
                </div>
              ) : !activeAq || !activeAq.available ? (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 text-center space-y-2">
                  <p className="font-mono text-base font-bold text-slate-800 dark:text-slate-200">
                    DATA UNAVAILABLE
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    {activeAq?.errorMessage ||
                      'No external air quality station or API readings are currently available for this location. Measurements are never derived from photographs.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Primary AQI Hero Block */}
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Air Quality Index (AQI)
                        </p>
                        <div className="flex items-baseline gap-2.5 mt-1">
                          <span className="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100">
                            {activeAq.aqiDisplay ?? 'Unavailable'}
                          </span>
                          <span className="text-sm font-semibold text-[#0284C7] dark:text-cyan-300">
                            {activeAq.aqiCategory || 'Measured'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Dominant Pollutant</p>
                        <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {activeAq.dominantPollutant || 'Unavailable'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Scale &amp; Standard:</strong>{' '}
                        {activeAq.aqiScale || activeAq.regionStandard || 'Unavailable'}
                      </div>
                      <div>
                        <strong className="text-slate-800 dark:text-slate-200">Measured At:</strong>{' '}
                        {activeAq.measuredAt ? formatTimestampIST(activeAq.measuredAt) : 'Unavailable'}
                      </div>
                      <div className="sm:col-span-2">
                        <strong className="text-slate-800 dark:text-slate-200">Data Source / Scope:</strong>{' '}
                        {activeAq.source} · {activeAq.stationOrScope}
                      </div>
                    </div>
                  </div>

                  {/* Individual Pollutants Grid */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Measured Pollutant Concentrations
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {activeAq.pollutants.map((p) => (
                        <div
                          key={p.code}
                          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {p.displayName}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {p.units || ''}
                            </span>
                          </div>
                          <p className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                            {p.value !== null ? p.value : 'Unavailable'}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1" title={p.fullName}>
                            {p.fullName}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Provider Notice if fallback was used */}
                  {activeAq.errorMessage && (
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-[#0284C7] shrink-0 mt-0.5" />
                      <span>Primary feed note: {activeAq.errorMessage}</span>
                    </div>
                  )}
                </div>
              )}
            </SpotlightCard>
          </section>

          {/* ================= PERSONALIZED RECOMMENDATIONS ================= */}
          {activeReport && (
            <section className="rounded-xl bg-white dark:bg-[#0b1222]/90 border border-slate-200 dark:border-slate-800/80 shadow-sm p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Personalized Environmental &amp; Exposure Guidance
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Each recommendation explicitly labels whether it is grounded in visual camera observations,
                    external measured AQI, or combined context.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {recommendations.map((rec, idx) => {
                  const priorityStyles =
                    rec.priority === 'advisory'
                      ? 'bg-[#FFF7ED] dark:bg-orange-950/25 border-[#FED7AA] dark:border-orange-500/30'
                      : rec.priority === 'caution'
                      ? 'bg-[#FFFBEB] dark:bg-amber-950/25 border-[#FDE68A] dark:border-amber-500/30'
                      : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800';
                  const basisLabel =
                    rec.basis === 'visual'
                      ? 'Visual Observation'
                      : rec.basis === 'measured_aqi'
                      ? 'Measured Air Quality'
                      : 'Combined Context';
                  return (
                    <div key={idx} className={`rounded-lg border p-4 space-y-1.5 ${priorityStyles}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          {rec.priority === 'info' ? (
                            <CheckCircle2 className="w-4 h-4 text-[#0284C7] dark:text-cyan-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0" />
                          )}
                          {rec.title}
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0">
                          {basisLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{rec.detail}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};
