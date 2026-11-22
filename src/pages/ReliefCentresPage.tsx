import React, { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMapView,
  Pin,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  ExternalLink,
  Hospital,
  Info,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react';
import { CITIES, CITY_MAP } from '../data/cities.ts';
import type { CityId, ReliefCategory, ReliefPlace } from '../types/flood.ts';
import type { ThemeMode } from '../components/RiskBadge.tsx';
import {
  FlipCard,
  FlipHintBadge,
  ScrollReveal,
  SlidingTabs,
} from '../components/MotionPrimitives.tsx';

interface ReliefCentresPageProps {
  mapsApiKey: string | null;
  selectedCity: CityId;
  onSelectCity: (c: CityId) => void;
  theme: ThemeMode;
}

const CATEGORIES: Array<{ id: 'all' | ReliefCategory; label: string }> = [
  { id: 'all', label: 'All Facilities' },
  { id: 'hospital', label: 'Hospitals' },
  { id: 'fire_station', label: 'Fire Stations' },
  { id: 'police', label: 'Police / Emergency' },
  { id: 'shelter_civic', label: 'Civic & Relief Halls' },
];

export const ReliefCentresPage: React.FC<ReliefCentresPageProps> = ({
  mapsApiKey,
  selectedCity,
  onSelectCity,
  theme,
}) => {
  const city = CITY_MAP[selectedCity];
  const [category, setCategory] = useState<'all' | ReliefCategory>('all');
  const [queryInput, setQueryInput] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const [places, setPlaces] = useState<ReliefPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<ReliefPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cityId: selectedCity,
        category,
      });
      if (activeQuery) params.set('query', activeQuery);

      const resp = await fetch(`/api/places/relief?${params.toString()}`);
      const data = await resp.json();
      if (resp.status === 429 || data?.code === 'QUOTA_EXCEEDED') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        setError(data?.error || 'Google Places API quota reached.');
        setPlaces([]);
      } else if (!resp.ok) {
        setError(data?.error || `Places API returned HTTP ${resp.status}`);
        setPlaces([]);
      } else {
        const list: ReliefPlace[] = Array.isArray(data.places) ? data.places : [];
        setPlaces(list);
        setSelectedPlace(list[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load facilities');
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCity, category, activeQuery]);

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveQuery(queryInput.trim());
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <Hospital className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              Relief Centres &amp; Emergency Facilities
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-1">
              Live hospital, fire, police, and civic centre lookup powered by Google Places API (New). Flip any card for actions.
            </p>
          </div>

          <select
            value={selectedCity}
            onChange={(e) => onSelectCity(e.target.value as CityId)}
            aria-label="Select city for relief facilities"
            className="rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-sm px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 self-start cursor-pointer"
          >
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.state}
              </option>
            ))}
          </select>
        </div>
      </ScrollReveal>

      {/* Verification Disclaimer */}
      <ScrollReveal delayMs={40}>
        <div className="rounded-lg bg-[#FFFBEB] dark:bg-amber-950/25 border border-[#FDE68A] dark:border-amber-500/30 px-4 py-2.5 flex items-start gap-2.5 text-xs text-[#B45309] dark:text-amber-200/90">
          <Info className="w-4 h-4 text-[#D97706] dark:text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Verification Notice:</strong> Facility listings come directly from Google Places API (New). Operational capacity, bed availability, and official municipal designation as an active flood evacuation shelter are{' '}
            <strong>not</strong> verified in real time. Confirm active relief camps with local SDMA/NDMA helplines.
          </span>
        </div>
      </ScrollReveal>

      {/* Filters & Search */}
      <ScrollReveal delayMs={60}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <SlidingTabs
            layoutId="relief-category-tabs"
            activeId={category}
            onChange={(catId) => {
              setCategory(catId);
              setActiveQuery('');
              setQueryInput('');
            }}
            items={CATEGORIES}
          />

          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-80">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={`Search facilities in ${city.name}...`}
                className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#0284C7] dark:focus:border-cyan-500 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="tactile-btn rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              Search
            </button>
          </form>
        </div>
      </ScrollReveal>

      {error && (
        <div className="rounded-xl bg-[#FEF2F2] dark:bg-red-950/30 border border-[#FECACA] dark:border-red-500/40 p-4 flex items-center justify-between gap-3 text-xs text-[#B91C1C] dark:text-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#DC2626] dark:text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={loadPlaces}
            className="tactile-btn inline-flex items-center gap-1 rounded bg-red-600 text-white dark:bg-red-500/20 px-3 py-1.5 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Results 3D FlipCards List + Embedded Google Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 space-y-3 max-h-[540px] overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 animate-pulse" />
              ))}
            </div>
          ) : places.length === 0 ? (
            <div className="rounded-2xl glass-panel p-8 text-center text-xs text-[#64748B] dark:text-slate-400">
              {error ? 'Unable to load facilities.' : `No facilities returned for this query in ${city.name}.`}
            </div>
          ) : (
            places.map((place, idx) => {
              const active = selectedPlace?.id === place.id;
              return (
                <ScrollReveal key={place.id} delayMs={Math.min(idx * 45, 225)}>
                  <FlipCard
                    ariaLabel={`${place.name} relief facility card`}
                    className={active ? 'ring-2 ring-[#0284C7]/70 dark:ring-cyan-400/70' : ''}
                    onFlipChange={(flipped) => {
                      if (flipped) setSelectedPlace(place);
                    }}
                    front={
                      <div className="flex flex-col justify-between gap-2.5 h-full">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h2 className="text-sm font-semibold text-[#0F172A] dark:text-slate-100 truncate">
                              {place.name}
                            </h2>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <p className="text-[11px] text-[#0284C7] dark:text-cyan-300 font-medium capitalize">
                                {place.primaryTypeLabel}
                              </p>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold border ${
                                  place.category === 'shelter_civic'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/35'
                                    : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-cyan-500/15 dark:text-cyan-200 dark:border-cyan-500/30'
                                }`}
                              >
                                {place.category === 'shelter_civic'
                                  ? 'Civic Venue · Unverified Capacity'
                                  : 'Emergency Service'}
                              </span>
                            </div>
                          </div>
                          {place.openNow !== null && (
                            <span
                              className={`text-[11px] font-mono font-semibold shrink-0 ${
                                place.openNow ? 'text-[#047857] dark:text-emerald-400' : 'text-[#B45309] dark:text-amber-400'
                              }`}
                            >
                              {place.openNow ? 'Open Now' : 'Closed'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#475569] dark:text-slate-400 line-clamp-2">{place.address}</p>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
                          <button
                            type="button"
                            data-no-flip="true"
                            onClick={() => setSelectedPlace(place)}
                            className="tactile-btn inline-flex items-center gap-1 text-[#0284C7] dark:text-cyan-300 font-medium hover:underline cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>{active ? 'Pinned on Map' : 'Pin on Map'}</span>
                          </button>
                          <FlipHintBadge label="Flip for actions" />
                        </div>
                      </div>
                    }
                    back={
                      <div className="flex flex-col justify-between gap-2.5 h-full text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-[#0F172A] dark:text-slate-100 block truncate">
                              {place.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#64748B] dark:text-slate-400">
                              {place.lat.toFixed(4)}°N, {place.lng.toFixed(4)}°E
                            </span>
                          </div>
                          <FlipHintBadge flipped label="Front ↻" />
                        </div>

                        {place.phone ? (
                          <a
                            href={`tel:${place.phone.replace(/\s+/g, '')}`}
                            className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700 dark:text-slate-200 hover:text-[#0284C7] dark:hover:text-cyan-300"
                          >
                            <Phone className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
                            <span>{place.phone}</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-[#64748B] dark:text-slate-400">
                            Direct telephone not listed in Places directory
                          </span>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            data-no-flip="true"
                            onClick={() => setSelectedPlace(place)}
                            className="tactile-btn inline-flex items-center gap-1 rounded-lg bg-[#E0F2FE] dark:bg-cyan-500/15 border border-sky-200 dark:border-cyan-500/30 px-2.5 py-1.5 text-[11px] font-semibold text-[#0284C7] dark:text-cyan-300 cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" />
                            <span>Focus Map</span>
                          </button>
                          <a
                            href={place.directionsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tactile-btn inline-flex items-center gap-1 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Directions</span>
                          </a>
                          <a
                            href={place.googleMapsUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Maps</span>
                          </a>
                        </div>
                      </div>
                    }
                  />
                </ScrollReveal>
              );
            })
          )}
        </div>

        {/* Map View */}
        <div className="lg:col-span-7 rounded-2xl overflow-hidden border border-slate-200 dark:border-cyan-500/20 shadow-lg bg-slate-100 dark:bg-[#070c18] h-[420px] lg:h-[540px]">
          {!mapsApiKey ? (
            <div className="h-full flex items-center justify-center text-xs text-[#64748B] dark:text-slate-400 p-6 text-center">
              Google Maps API key unavailable. You can still use the Google Maps &amp; Directions links on each facility card.
            </div>
          ) : (
            <APIProvider apiKey={mapsApiKey} libraries={['marker']} language="en" region="IN">
              <GoogleMapView
                key={`relief-map-${theme}`}
                center={
                  selectedPlace
                    ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
                    : { lat: city.lat, lng: city.lng }
                }
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
                gestureHandling="greedy"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
              >
                {places.map((p) => {
                  const isSel = selectedPlace?.id === p.id;
                  return (
                    <AdvancedMarker
                      key={p.id}
                      position={{ lat: p.lat, lng: p.lng }}
                      title={p.name}
                      onClick={() => setSelectedPlace(p)}
                    >
                      <div className="relative flex items-center justify-center">
                        {isSel && (
                          <span
                            aria-hidden="true"
                            className="radar-ring absolute w-9 h-9 rounded-full bg-[#0284C7]/35 border border-[#0284C7]/60 pointer-events-none"
                          />
                        )}
                        <Pin
                          background={isSel ? '#0284C7' : '#2563EB'}
                          borderColor="#FFFFFF"
                          glyphColor="#FFFFFF"
                          scale={isSel ? 1.2 : 1}
                        />
                      </div>
                    </AdvancedMarker>
                  );
                })}

                {selectedPlace && (
                  <InfoWindow
                    position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                    onCloseClick={() => setSelectedPlace(null)}
                    maxWidth={250}
                  >
                    <div className="bg-white text-slate-900 p-1 space-y-1">
                      <div className="font-semibold text-xs text-slate-900">{selectedPlace.name}</div>
                      <div className="text-[11px] text-slate-600">{selectedPlace.address}</div>
                      <a
                        href={selectedPlace.directionsUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-[11px] font-semibold text-[#2563EB] underline"
                      >
                        Get Directions →
                      </a>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMapView>
            </APIProvider>
          )}
        </div>
      </div>
    </div>
  );
};
