import React from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Compass,
  Database,
  Info,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import type { NavPageId } from '../types/flood.ts';
import { ScrollReveal, SpotlightCard } from '../components/MotionPrimitives.tsx';
import { BrandMark, BrandWordmark } from '../components/BrandLogo.tsx';

interface AboutPageProps {
  onNavigate: (page: NavPageId) => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <ScrollReveal delayMs={0}>
        <SpotlightCard
          tactile={false}
          className="rounded-2xl glass-panel p-6 space-y-3"
        >
          <div className="flex items-center gap-3.5">
            <BrandMark className="w-11 h-11 rounded-xl shrink-0 shadow-[0_0_20px_rgba(34,211,238,0.28)]" />
            <div>
              <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex flex-wrap items-center gap-2">
                <BrandWordmark className="text-xl sm:text-2xl" />
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  — Weather, Environmental &amp; Urban Flood Intelligence
                </span>
              </h1>
              <p className="text-xs sm:text-sm font-medium text-[#0284C7] dark:text-cyan-400">
                Monitor. Predict. Prepare.
              </p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-[#334155] dark:text-slate-300 leading-relaxed max-w-3xl">
            MeghDrishti (“Cloud Vision”) is an atmospheric weather intelligence, air quality, radar, and urban flood-preparedness platform built for nine major Indian metropolitan basins: Mumbai, Delhi, Chennai, Bengaluru, Kolkata, Jaipur, Hyderabad, Pune, and Ahmedabad.
          </p>
        </SpotlightCard>
      </ScrollReveal>

      {/* Problem Statement & Purpose */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ScrollReveal delayMs={50}>
          <SpotlightCard className="h-full rounded-2xl glass-panel p-5 space-y-3">
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <Compass className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
              The Indian Urban Flood Challenge
            </h2>
            <p className="text-xs sm:text-sm text-[#334155] dark:text-slate-300 leading-relaxed">
              Rapidly urbanizing Indian cities face short-duration, high-intensity monsoon cloudbursts colliding with sealed concrete surfaces, encroached lake/wetland catchments, and colonial- or mid-century stormwater drains designed for 25–50 mm/hr rainfall peaks.
            </p>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 leading-relaxed">
              Coastal metropolises (Mumbai, Chennai, Kolkata) experience compounded tidal locking when storm surges coincide with creek outfalls, while inland cities (Delhi, Bengaluru, Jaipur, Hyderabad, Pune, Ahmedabad) encounter rapid runoff accumulation in underpasses, river corridors, and topographic bowls.
            </p>
          </SpotlightCard>
        </ScrollReveal>

        <ScrollReveal delayMs={100}>
          <SpotlightCard className="h-full rounded-2xl glass-panel p-5 space-y-3">
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
              Technology &amp; Architecture
            </h2>
            <ul className="space-y-2 text-xs sm:text-sm text-[#334155] dark:text-slate-300 list-disc list-inside leading-relaxed">
              <li>
                <strong className="text-[#0F172A] dark:text-slate-100">Atmospheric Weather Shell:</strong> React 19, TypeScript, Tailwind CSS v4 glassmorphism, Recharts telemetry &amp; AQI visualisations, and offline-ready Progressive Web App (PWA) caching.
              </li>
              <li>
                <strong className="text-[#0F172A] dark:text-slate-100">Server-Side Proxy &amp; Cache:</strong> Express + Node.js API layer handling Gemini Vision/Weather briefs, quota-conscious TTL caching, RainViewer radar frames, and Air Quality aggregation.
              </li>
              <li>
                <strong className="text-[#0F172A] dark:text-slate-100">Geospatial Radar &amp; Mapping:</strong> Google Maps JavaScript API via <code className="text-[#0284C7] dark:text-cyan-300 font-mono text-xs">@vis.gl/react-google-maps</code> with animated precipitation radar tiles, full-screen HUD, and demonstration basin zones.
              </li>
            </ul>
          </SpotlightCard>
        </ScrollReveal>
      </section>

      {/* Data Sources & AI Methodology */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <article className="rounded-2xl glass-panel p-5 space-y-3">
          <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
            Data Sources &amp; Attribution
          </h2>
          <div className="space-y-2.5 text-xs text-[#334155] dark:text-slate-300">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3">
              <p className="font-semibold text-[#0F172A] dark:text-slate-100">Google Maps Platform</p>
              <p className="text-[#475569] dark:text-slate-400 mt-0.5">
                Current &amp; forecast meteorology (Weather API), ambient Air Quality &amp; 24h pollutant trends (Air Quality API), terrain elevation sampling (Elevation API), interactive basemaps (Maps JS API), and nearby hospitals, fire stations, police posts &amp; civic shelters (Places API New).
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3">
              <p className="font-semibold text-[#0F172A] dark:text-slate-100">Open-Meteo, CAMS &amp; RainViewer Radar</p>
              <p className="text-[#475569] dark:text-slate-400 mt-0.5">
                Hourly &amp; 24-hour meteorological variables, topsoil moisture estimates, CAMS air quality fallback, ERA5 historical daily rainfall reanalysis records, and live RainViewer precipitation radar tiles.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-3">
              <p className="font-semibold text-[#0F172A] dark:text-slate-100">Documented Historical Flood Records</p>
              <p className="text-[#475569] dark:text-slate-400 mt-0.5">
                Curated reference summaries citing India Meteorological Department (IMD), NDMA, and state disaster reports (2005–2023).
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl glass-panel p-5 space-y-3">
          <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
            AI Methodology &amp; Scientific Honesty
          </h2>
          <p className="text-xs sm:text-sm text-[#334155] dark:text-slate-300 leading-relaxed">
            MeghDrishti enforces a strict separation between <strong>deterministic hydrological scoring</strong> and <strong>Gemini natural-language interpretation</strong>:
          </p>
          <ul className="space-y-2 text-xs text-[#334155] dark:text-slate-300 list-disc list-inside leading-relaxed">
            <li>
              Risk scores (0–100) are calculated transparently from weighted meteorological, soil saturation, modelled drainage stress, and elevation inputs before any LLM call runs.
            </li>
            <li>
              <code className="text-[#0284C7] dark:text-cyan-300 font-mono">gemini-4-hydrogen</code> receives only verified readings, explicit unavailability markers, and computed scores—returning structured explanations without inventing sensor readings or claiming calibrated accuracy.
            </li>
            <li>
              Demonstration flood polygons on the map represent illustrative low-lying urban basins and are never misrepresented as official municipal flood-hazard boundaries.
            </li>
          </ul>
          <div className="pt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('performance')}
              className="tactile-btn rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-[#0284C7] dark:text-cyan-300 cursor-pointer"
            >
              Inspect Model Performance Audit →
            </button>
            <button
              type="button"
              onClick={() => onNavigate('predictions')}
              className="tactile-btn rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              View AI Predictions →
            </button>
          </div>
        </article>
      </section>

      {/* Limitations & Future Roadmap */}
      <section className="rounded-2xl glass-panel p-5 space-y-3">
        <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0284C7] dark:text-cyan-400" />
          Known Limitations &amp; Future Roadmap
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#334155] dark:text-slate-300 leading-relaxed">
          <div className="space-y-1.5">
            <h3 className="font-semibold text-[#0F172A] dark:text-slate-100">Current Limitations</h3>
            <ul className="list-disc list-inside space-y-1 text-[#475569] dark:text-slate-400">
              <li>Does not run a 2D shallow-water hydrodynamic PDE mesh or municipal sewer-pipe SCADA model.</li>
              <li>Sub-city flood zones are demonstration monitoring nodes, not ward-by-ward surveyed floodplains.</li>
              <li>Nearby civic halls/schools listed as potential relief venues do not expose real-time bed or occupancy availability.</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-[#0F172A] dark:text-slate-100">Planned Future Upgrades</h3>
            <ul className="list-disc list-inside space-y-1 text-[#475569] dark:text-slate-400">
              <li>Integration with municipal Automatic Weather Stations (AWS) and IoT drain-level sensors.</li>
              <li>Coastal high-tide lock coupling using INCOIS tide tables for Mumbai, Chennai, and Kolkata.</li>
              <li>Out-of-sample monsoon backtesting against ward complaint registries for formal F1 and RMSE calibration.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Official Disclaimer */}
      <div className="rounded-xl bg-[#FFFBEB] dark:bg-amber-950/25 border border-[#FDE68A] dark:border-amber-500/35 p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#D97706] dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-[#B45309] dark:text-amber-100/90 space-y-1 leading-relaxed">
          <p className="font-semibold text-[#92400E] dark:text-amber-200 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            Decision-Support &amp; Informational Disclaimer
          </p>
          <p className="text-[#92400E]/90 dark:text-amber-200/80">
            MeghDrishti is an informational and situational-awareness application. It is NOT an official warning system of the India Meteorological Department (IMD), Central Water Commission (CWC), National Disaster Management Authority (NDMA), or any Municipal Corporation. For emergency action, always follow official government alerts and dial 112.
          </p>
        </div>
      </div>
    </div>
  );
};
