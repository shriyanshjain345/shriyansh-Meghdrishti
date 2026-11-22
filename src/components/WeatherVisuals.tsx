import React from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';

export type WeatherVisualKind = 'clear' | 'clouds' | 'rain' | 'storm' | 'mist';

export function resolveWeatherVisualKind(
  conditionType?: string | null,
  conditionText?: string | null
): WeatherVisualKind {
  const combined = `${conditionType ?? ''} ${conditionText ?? ''}`.toLowerCase();
  if (
    combined.includes('thunder') ||
    combined.includes('storm') ||
    combined.includes('lightning') ||
    combined.includes('squall')
  ) {
    return 'storm';
  }
  if (
    combined.includes('rain') ||
    combined.includes('drizzle') ||
    combined.includes('shower') ||
    combined.includes('precipitation')
  ) {
    return 'rain';
  }
  if (
    combined.includes('fog') ||
    combined.includes('mist') ||
    combined.includes('haze') ||
    combined.includes('smoke')
  ) {
    return 'mist';
  }
  if (
    combined.includes('cloud') ||
    combined.includes('overcast') ||
    combined.includes('partly')
  ) {
    return 'clouds';
  }
  return 'clear';
}

const BACKDROP_IMAGES: Record<WeatherVisualKind, string> = {
  clear: '/src/assets/images/weather_hero_clear_1795344371918.jpg',
  rain: '/src/assets/images/weather_hero_rain_1795344371770.jpg',
  storm: '/src/assets/images/weather_hero_storm_1795344372226.jpg',
  clouds: '/src/assets/images/weather_hero_clouds_1795344372314.jpg',
  mist: '/src/assets/images/weather_hero_mist_1795344371915.jpg',
};

const RAIN_DROPS = [
  { left: '6%', delay: '0s', duration: '1.15s', height: 22 },
  { left: '14%', delay: '0.4s', duration: '0.95s', height: 28 },
  { left: '22%', delay: '0.15s', duration: '1.25s', height: 20 },
  { left: '31%', delay: '0.7s', duration: '1.05s', height: 26 },
  { left: '40%', delay: '0.25s', duration: '0.9s', height: 24 },
  { left: '51%', delay: '0.55s', duration: '1.1s', height: 30 },
  { left: '62%', delay: '0.1s', duration: '1.2s', height: 22 },
  { left: '71%', delay: '0.8s', duration: '0.95s', height: 26 },
  { left: '80%', delay: '0.35s', duration: '1.15s', height: 20 },
  { left: '89%', delay: '0.6s', duration: '1.0s', height: 28 },
  { left: '95%', delay: '0.2s', duration: '1.1s', height: 22 },
];

export const WeatherConditionIcon: React.FC<{
  conditionType?: string | null;
  conditionText?: string | null;
  isDaytime?: boolean | null;
  className?: string;
}> = ({ conditionType, conditionText, isDaytime = true, className = 'w-6 h-6' }) => {
  const txt = `${conditionType ?? ''} ${conditionText ?? ''}`.toLowerCase();
  if (txt.includes('thunder') || txt.includes('storm')) {
    return <CloudLightning className={`${className} text-violet-300`} />;
  }
  if (txt.includes('drizzle')) {
    return <CloudDrizzle className={`${className} text-sky-300`} />;
  }
  if (txt.includes('rain') || txt.includes('shower')) {
    return <CloudRain className={`${className} text-cyan-300`} />;
  }
  if (txt.includes('fog') || txt.includes('mist') || txt.includes('haze')) {
    return <CloudFog className={`${className} text-slate-300`} />;
  }
  if (txt.includes('partly') || txt.includes('mostly clear')) {
    return <CloudSun className={`${className} text-amber-300`} />;
  }
  if (txt.includes('cloud') || txt.includes('overcast')) {
    return <Cloud className={`${className} text-slate-200`} />;
  }
  if (isDaytime === false) {
    return <Moon className={`${className} text-cyan-200`} />;
  }
  return <Sun className={`${className} text-amber-300`} />;
};

export const WeatherAtmosphericBackdrop: React.FC<{
  conditionType?: string | null;
  conditionText?: string | null;
}> = ({ conditionType, conditionText }) => {
  const kind = resolveWeatherVisualKind(conditionType, conditionText);
  const bgUrl = BACKDROP_IMAGES[kind];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      {/* Realistic Weather Photography Base */}
      <img
        src={bgUrl}
        alt=""
        className="w-full h-full object-cover object-center opacity-55 dark:opacity-65 scale-[1.02] transition-opacity duration-700"
      />

      {/* Midnight Navy Atmospheric Gradient Scrim */}
      <div
        className="absolute inset-0"
        style={{
          background:
            kind === 'storm'
              ? 'linear-gradient(125deg, rgba(4, 8, 22, 0.92) 0%, rgba(12, 18, 44, 0.72) 55%, rgba(49, 46, 129, 0.52) 100%)'
              : kind === 'rain'
              ? 'linear-gradient(125deg, rgba(4, 8, 20, 0.90) 0%, rgba(8, 28, 56, 0.68) 55%, rgba(6, 78, 115, 0.45) 100%)'
              : kind === 'mist'
              ? 'linear-gradient(125deg, rgba(6, 11, 24, 0.90) 0%, rgba(15, 29, 52, 0.74) 60%, rgba(30, 58, 95, 0.45) 100%)'
              : kind === 'clouds'
              ? 'linear-gradient(125deg, rgba(5, 10, 24, 0.88) 0%, rgba(14, 29, 58, 0.68) 55%, rgba(30, 64, 175, 0.36) 100%)'
              : 'linear-gradient(125deg, rgba(4, 9, 24, 0.86) 0%, rgba(7, 29, 64, 0.62) 55%, rgba(2, 132, 199, 0.36) 100%)',
        }}
      />

      {/* Ambient Atmospheric Weather Particle Effects */}
      {(kind === 'rain' || kind === 'storm') && (
        <div className="absolute inset-0">
          {RAIN_DROPS.map((drop, i) => (
            <span
              key={i}
              className="weather-rain-streak absolute top-0 w-[1.5px] rounded-full bg-gradient-to-b from-transparent via-cyan-300/75 to-sky-100/20"
              style={{
                left: drop.left,
                height: `${drop.height}px`,
                animationDelay: drop.delay,
                animationDuration: drop.duration,
              }}
            />
          ))}
        </div>
      )}

      {kind === 'storm' && (
        <div className="weather-lightning-flash absolute inset-0 bg-gradient-to-tr from-violet-400/25 via-cyan-300/15 to-transparent" />
      )}

      {(kind === 'clouds' || kind === 'mist') && (
        <div className="weather-cloud-drift absolute -inset-x-10 top-0 h-full bg-gradient-to-r from-transparent via-cyan-200/8 to-transparent blur-2xl" />
      )}

      {kind === 'clear' && (
        <div className="weather-sun-aura absolute -top-16 -right-12 w-72 h-72 rounded-full bg-radial from-cyan-400/25 via-blue-500/10 to-transparent blur-2xl" />
      )}
    </div>
  );
};
