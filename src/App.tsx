import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { MobileBottomBar } from './components/MobileBottomBar.tsx';
import { ScrollProgressBar } from './components/MotionPrimitives.tsx';
import { OfflineIndicator } from './components/PWAInstallButton.tsx';
import { ToastProvider, useToast } from './components/ToastContext.tsx';
import type { ThemeMode } from './components/RiskBadge.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { LiveMonitoringPage } from './pages/LiveMonitoringPage.tsx';
import { InteractiveFloodMapPage } from './pages/InteractiveFloodMapPage.tsx';
import { AiPredictionsPage } from './pages/AiPredictionsPage.tsx';
import { WeatherIntelligencePage } from './pages/WeatherIntelligencePage.tsx';
import { CityComparisonPage } from './pages/CityComparisonPage.tsx';
import { HistoricalAnalysisPage } from './pages/HistoricalAnalysisPage.tsx';
import { ReliefCentresPage } from './pages/ReliefCentresPage.tsx';
import { EmergencyGuidePage } from './pages/EmergencyGuidePage.tsx';
import { ModelPerformancePage } from './pages/ModelPerformancePage.tsx';
import { EnvVisionCameraPage } from './pages/EnvVisionCameraPage.tsx';
import { AirQualityPage } from './pages/AirQualityPage.tsx';
import { AboutPage } from './pages/AboutPage.tsx';
import type {
  AiRiskAssessmentPayload,
  AiWeatherSummaryPayload,
  CityComparisonSummary,
  CityId,
  CityTelemetryResponse,
  NavPageId,
  UnitsSystem,
} from './types/flood.ts';

const THEME_STORAGE_KEY = 'meghdrishti_theme_v2';

function AppShell() {
  const { pushToast } = useToast();
  const [selectedCity, setSelectedCity] = useState<CityId>('mumbai');
  const [activePage, setActivePage] = useState<NavPageId>('overview');
  const [units, setUnits] = useState<UnitsSystem>('METRIC');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Midnight Navy Dark Mode is the MEGHDRISHTI 2.0 default; user may toggle live
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', isDark ? '#040814' : '#F8FAFC');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  // Maps API key resolution: Vite env var first, falling back to /api/config/maps
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || null
  );
  const [mapsKeyLoading, setMapsKeyLoading] = useState<boolean>(
    !import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  );

  // Tier 1 & Tier 2 GMP Demo Key Quota Exceeded state
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  // Live city telemetry state
  const [telemetry, setTelemetry] = useState<CityTelemetryResponse | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState<boolean>(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);

  // Comparison state (all 9 cities)
  const [comparison, setComparison] = useState<CityComparisonSummary[]>([]);
  const [comparisonLoading, setComparisonLoading] = useState<boolean>(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // AI flood risk assessment state & per-city cache
  const [aiCache, setAiCache] = useState<Partial<Record<CityId, AiRiskAssessmentPayload>>>({});
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI weather intelligence brief state & per-city cache
  const [weatherSummaryCache, setWeatherSummaryCache] = useState<
    Partial<Record<CityId, AiWeatherSummaryPayload>>
  >({});
  const [weatherSummaryLoading, setWeatherSummaryLoading] = useState<boolean>(false);
  const [weatherSummaryError, setWeatherSummaryError] = useState<string | null>(null);

  // Global GMP quota-exceeded event listener
  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  // Load Google Maps browser key from backend if not injected via VITE_GOOGLE_MAPS_API_KEY
  useEffect(() => {
    if (mapsApiKey) {
      setMapsKeyLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/config/maps')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.configured && data?.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {
        // Handled cleanly in map/relief components if key stays null
      })
      .finally(() => {
        if (!cancelled) setMapsKeyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mapsApiKey]);

  const fetchComparison = useCallback(async (forceRefresh = false) => {
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const res = await fetch(`/api/comparison${forceRefresh ? '?refresh=true' : ''}`);
      const data = await res.json();
      if (!res.ok) {
        setComparisonError(data?.error || `HTTP ${res.status}`);
      } else {
        setComparison(Array.isArray(data.cities) ? data.cities : []);
      }
    } catch (err) {
      setComparisonError(err instanceof Error ? err.message : 'Network error loading comparison');
    } finally {
      setComparisonLoading(false);
    }
  }, []);

  const fetchTelemetry = useCallback(
    async (cityId: CityId, forceRefresh = false) => {
      setTelemetryLoading(true);
      setTelemetryError(null);
      try {
        const res = await fetch(
          `/api/telemetry/${cityId}${forceRefresh ? '?refresh=true' : ''}`
        );
        const data = await res.json();
        if (!res.ok) {
          const msg = data?.error || `Telemetry feed returned HTTP ${res.status}`;
          setTelemetryError(msg);
          if (forceRefresh) {
            pushToast('Telemetry Sync Issue', msg, 'error');
          }
        } else {
          const payload = data as CityTelemetryResponse;
          setTelemetry(payload);
          if (
            payload.sources.weather.status === 'quota_exceeded' ||
            payload.sources.elevation.status === 'quota_exceeded'
          ) {
            setGmpQuotaExceeded(true);
          }
          if (forceRefresh) {
            pushToast(
              `${payload.city.name} Telemetry Synced`,
              `Updated ${payload.current.conditionText ?? 'live weather'} · Flood Index ${payload.risk.currentScore}/100`,
              'success'
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to connect to telemetry server';
        setTelemetryError(msg);
        if (forceRefresh) {
          pushToast('Connection Error', msg, 'error');
        }
      } finally {
        setTelemetryLoading(false);
      }
    },
    [pushToast]
  );

  const generateAiAssessment = useCallback(
    async (targetTelemetry: CityTelemetryResponse, force = false) => {
      const cityId = targetTelemetry.city.id;
      if (!force && aiCache[cityId]) {
        return;
      }
      setAiLoading(true);
      setAiError(null);
      try {
        const res = await fetch('/api/ai/risk-assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cityId, forceRefresh: force }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAiError(data?.error || `AI analysis returned HTTP ${res.status}`);
        } else {
          const assessment = data as AiRiskAssessmentPayload;
          setAiCache((prev) => ({ ...prev, [cityId]: assessment }));
        }
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'Unable to reach AI risk analysis endpoint');
      } finally {
        setAiLoading(false);
      }
    },
    [aiCache]
  );

  const generateWeatherSummary = useCallback(
    async (cityId: CityId, force = false) => {
      if (!force && weatherSummaryCache[cityId]) {
        return;
      }
      setWeatherSummaryLoading(true);
      setWeatherSummaryError(null);
      try {
        const res = await fetch('/api/ai/weather-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cityId, forceRefresh: force }),
        });
        const data = await res.json();
        if (!res.ok) {
          setWeatherSummaryError(data?.error || `Weather brief returned HTTP ${res.status}`);
        } else {
          const summary = data as AiWeatherSummaryPayload;
          setWeatherSummaryCache((prev) => ({ ...prev, [cityId]: summary }));
        }
      } catch (err) {
        setWeatherSummaryError(
          err instanceof Error ? err.message : 'Unable to generate weather brief'
        );
      } finally {
        setWeatherSummaryLoading(false);
      }
    },
    [weatherSummaryCache]
  );

  // Initial comparison load
  useEffect(() => {
    fetchComparison(false);
  }, [fetchComparison]);

  // Load city telemetry whenever selectedCity changes
  useEffect(() => {
    fetchTelemetry(selectedCity, false);
  }, [selectedCity, fetchTelemetry]);

  // Auto-generate AI city flood risk assessment when telemetry loads for a city without cached AI analysis
  useEffect(() => {
    if (
      telemetry &&
      telemetry.city.id === selectedCity &&
      !aiCache[selectedCity] &&
      !aiLoading &&
      !aiError
    ) {
      generateAiAssessment(telemetry, false);
    }
  }, [telemetry, selectedCity, aiCache, aiLoading, aiError, generateAiAssessment]);

  // Auto-generate AI Weather Intelligence brief when telemetry loads
  useEffect(() => {
    if (
      telemetry &&
      telemetry.city.id === selectedCity &&
      !weatherSummaryCache[selectedCity] &&
      !weatherSummaryLoading &&
      !weatherSummaryError
    ) {
      generateWeatherSummary(selectedCity, false);
    }
  }, [
    telemetry,
    selectedCity,
    weatherSummaryCache,
    weatherSummaryLoading,
    weatherSummaryError,
    generateWeatherSummary,
  ]);

  // Periodic 15-min background auto-sync when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchTelemetry(selectedCity, false);
      fetchComparison(false);
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedCity, fetchTelemetry, fetchComparison]);

  const handleSelectCity = (cityId: CityId) => {
    setAiError(null);
    setWeatherSummaryError(null);
    setSelectedCity(cityId);
  };

  const handleManualRefresh = () => {
    fetchTelemetry(selectedCity, true);
    fetchComparison(true);
  };

  const handleGenerateAiClick = (force = false) => {
    if (!telemetry) return;
    generateAiAssessment(telemetry, force);
  };

  const handleRefreshWeatherSummary = (force = false) => {
    generateWeatherSummary(selectedCity, force);
  };

  const currentAiAssessment = aiCache[selectedCity] ?? null;
  const currentWeatherSummary = weatherSummaryCache[selectedCity] ?? null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activePage]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#040814] text-[#0F172A] dark:text-slate-100 flex flex-col transition-colors duration-200">
        {/* GMP Demo Key Daily Quota Exceeded Sticky Banner */}
        {gmpQuotaExceeded && (
          <div
            role="alert"
            className="sticky top-0 z-50 w-full bg-[#FFFBEB]/95 dark:bg-amber-950/95 border-b border-[#FDE68A] dark:border-amber-500/50 px-4 py-2.5 text-xs text-[#92400E] dark:text-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 backdrop-blur-md"
          >
            <div className="flex items-start sm:items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Google Maps Demo Key daily quota reached (100 req/day).</strong>{' '}
                Weather telemetry automatically continues via Open-Meteo fallback.{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-semibold text-[#B45309] dark:text-amber-200 hover:text-[#78350F] dark:hover:text-white inline-flex items-center gap-1"
                >
                  Add your own Google Cloud API key to lift limits
                  <ExternalLink className="w-3 h-3" />
                </a>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGmpQuotaExceeded(false)}
              className="self-end sm:self-auto text-[#B45309] dark:text-amber-300 hover:text-[#78350F] dark:hover:text-white p-1 rounded cursor-pointer"
              aria-label="Dismiss quota notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          <Sidebar
            activePage={activePage}
            onSelectPage={setActivePage}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
            mobileOpen={mobileMenuOpen}
            onCloseMobile={() => setMobileMenuOpen(false)}
          />

          <div className="flex-1 flex flex-col min-w-0">
            <TopBar
              selectedCity={selectedCity}
              onSelectCity={handleSelectCity}
              telemetry={telemetry}
              loading={telemetryLoading}
              error={telemetryError}
              onRefresh={handleManualRefresh}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              units={units}
              onChangeUnits={setUnits}
              autoRefresh={autoRefresh}
              onToggleAutoRefresh={setAutoRefresh}
              onNavigate={setActivePage}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
            <ScrollProgressBar watchKey={activePage} />

            <OfflineIndicator />

            <main className="flex-1 p-4 sm:p-6 pb-24 lg:pb-8 max-w-[1600px] w-full mx-auto">
              {activePage === 'overview' && (
                <OverviewPage
                  telemetry={telemetry}
                  loading={telemetryLoading}
                  error={telemetryError}
                  onRetry={() => fetchTelemetry(selectedCity, true)}
                  comparison={comparison}
                  comparisonError={comparisonError}
                  aiAssessment={currentAiAssessment}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  onGenerateAi={handleGenerateAiClick}
                  weatherSummary={currentWeatherSummary}
                  weatherSummaryLoading={weatherSummaryLoading}
                  weatherSummaryError={weatherSummaryError}
                  onRefreshWeatherSummary={handleRefreshWeatherSummary}
                  onSelectCity={handleSelectCity}
                  onNavigate={setActivePage}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'live' && (
                <LiveMonitoringPage
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  telemetry={telemetry}
                  loading={telemetryLoading}
                  error={telemetryError}
                  onRefresh={() => fetchTelemetry(selectedCity, true)}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'map' && (
                <InteractiveFloodMapPage
                  mapsApiKey={mapsApiKey}
                  mapsKeyLoading={mapsKeyLoading}
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  telemetry={telemetry}
                  telemetryLoading={telemetryLoading}
                  comparison={comparison}
                  aiAssessment={currentAiAssessment}
                  aiLoading={aiLoading}
                  onRefresh={handleManualRefresh}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'predictions' && (
                <AiPredictionsPage
                  telemetry={telemetry}
                  aiAssessment={currentAiAssessment}
                  aiLoading={aiLoading}
                  aiError={aiError}
                  onGenerateAi={handleGenerateAiClick}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'weather' && (
                <WeatherIntelligencePage
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  telemetry={telemetry}
                  loading={telemetryLoading}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'air-quality' && (
                <AirQualityPage
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'comparison' && (
                <CityComparisonPage
                  comparison={comparison}
                  loading={comparisonLoading}
                  error={comparisonError}
                  onRefresh={() => fetchComparison(true)}
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  onNavigate={setActivePage}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'historical' && (
                <HistoricalAnalysisPage
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  theme={theme}
                />
              )}

              {activePage === 'relief' && (
                <ReliefCentresPage
                  mapsApiKey={mapsApiKey}
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  theme={theme}
                />
              )}

              {activePage === 'guide' && (
                <EmergencyGuidePage
                  selectedCity={selectedCity}
                  onNavigate={setActivePage}
                />
              )}

              {activePage === 'performance' && (
                <ModelPerformancePage
                  selectedCity={selectedCity}
                  telemetry={telemetry}
                  theme={theme}
                />
              )}

              {activePage === 'env-vision' && (
                <EnvVisionCameraPage
                  selectedCity={selectedCity}
                  onSelectCity={handleSelectCity}
                  units={units}
                  theme={theme}
                />
              )}

              {activePage === 'about' && (
                <AboutPage onNavigate={setActivePage} />
              )}
            </main>
          </div>
        </div>

        <MobileBottomBar
          activePage={activePage}
          onSelectPage={setActivePage}
          onOpenMore={() => setMobileMenuOpen(true)}
        />
      </div>
    </MotionConfig>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
