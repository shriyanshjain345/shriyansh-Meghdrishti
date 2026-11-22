import React, { useId } from 'react';

interface BrandMarkProps {
  className?: string;
}

/**
 * Standalone futuristic MEGHDRISHTI icon mark combining a minimalist cloud,
 * interlocking water droplet, and subtle AI / radar signal arcs.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'w-8 h-8' }) => {
  const uid = useId().replace(/:/g, '');
  const bgId = `md-bg-${uid}`;
  const rimId = `md-rim-${uid}`;
  const radarId = `md-radar-${uid}`;
  const cloudFillId = `md-cf-${uid}`;
  const cloudStrokeId = `md-cs-${uid}`;
  const dropFillId = `md-df-${uid}`;
  const dropStrokeId = `md-ds-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={bgId} cx="35%" cy="22%" r="85%">
          <stop offset="0%" stopColor="#0F234B" />
          <stop offset="55%" stopColor="#071128" />
          <stop offset="100%" stopColor="#030712" />
        </radialGradient>

        <linearGradient id={rimId} x1="40" y1="32" x2="472" y2="480" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#2563EB" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.55" />
        </linearGradient>

        <linearGradient id={radarId} x1="140" y1="90" x2="372" y2="160" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="52%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#8B5CF6" />
        </linearGradient>

        <linearGradient id={cloudFillId} x1="100" y1="150" x2="412" y2="314" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" stopOpacity="0.94" />
          <stop offset="55%" stopColor="#0284C7" stopOpacity="0.94" />
          <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id={cloudStrokeId} x1="98" y1="150" x2="414" y2="314" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="55%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>

        <linearGradient id={dropFillId} x1="256" y1="204" x2="256" y2="410" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="52%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>

        <linearGradient id={dropStrokeId} x1="188" y1="220" x2="324" y2="404" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A5F3FC" />
          <stop offset="60%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#C4B5FD" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="116" fill={`url(#${bgId})`} />
      <rect x="10" y="10" width="492" height="492" rx="106" stroke={`url(#${rimId})`} strokeWidth="4" />

      <path
        d="M142 128C174 93 213 76 256 76C299 76 338 93 370 128"
        stroke={`url(#${radarId})`}
        strokeWidth="11"
        strokeLinecap="round"
        strokeOpacity="0.5"
      />
      <path
        d="M178 158C201 134 227 122 256 122C285 122 311 134 334 158"
        stroke={`url(#${radarId})`}
        strokeWidth="12"
        strokeLinecap="round"
      />

      <path
        d="M156 314C120 314 98 290 98 258C98 228 122 204 156 202C172 164 210 148 256 148C302 148 340 164 356 202C390 204 414 228 414 258C414 290 392 314 356 314H156Z"
        fill={`url(#${cloudFillId})`}
        stroke={`url(#${cloudStrokeId})`}
        strokeWidth="8"
        strokeLinejoin="round"
      />

      <path
        d="M256 204C256 204 188 286 188 342C188 379.5 218.5 410 256 410C293.5 410 324 379.5 324 342C324 286 256 204 256 204Z"
        fill="#060E22"
        stroke="#060E22"
        strokeWidth="22"
        strokeLinejoin="round"
      />

      <path
        d="M256 204C256 204 188 286 188 342C188 379.5 218.5 410 256 410C293.5 410 324 379.5 324 342C324 286 256 204 256 204Z"
        fill={`url(#${dropFillId})`}
        stroke={`url(#${dropStrokeId})`}
        strokeWidth="7"
        strokeLinejoin="round"
      />

      <path
        d="M223 331C230 315 242 306 256 306C270 306 282 315 289 331"
        stroke="#E0F2FE"
        strokeWidth="7"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <path
        d="M229 361C236 371 246 376 256 376C266 376 276 371 283 361"
        stroke="#DDD6FE"
        strokeWidth="6"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />
      <circle cx="256" cy="341" r="13" fill="#F8FAFC" />
      <circle cx="256" cy="341" r="22" stroke="#A5F3FC" strokeOpacity="0.48" strokeWidth="3" />
    </svg>
  );
};

interface BrandWordmarkProps {
  className?: string;
}

export const BrandWordmark: React.FC<BrandWordmarkProps> = ({ className = 'text-sm' }) => (
  <span
    className={`font-display font-extrabold tracking-[0.09em] uppercase leading-none select-none whitespace-nowrap ${className}`}
  >
    <span className="text-slate-900 dark:text-slate-50">MEGH</span>
    <span className="bg-gradient-to-r from-[#0284C7] via-[#2563EB] to-[#7C3AED] dark:from-[#22D3EE] dark:via-[#38BDF8] dark:to-[#A78BFA] bg-clip-text text-transparent">
      DRISHTI
    </span>
  </span>
);

interface BrandLogoProps {
  variant?: 'full' | 'compact' | 'icon';
  showTagline?: boolean;
  iconClassName?: string;
  wordmarkClassName?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'full',
  showTagline = true,
  iconClassName,
  wordmarkClassName,
}) => {
  if (variant === 'icon') {
    return (
      <BrandMark
        className={
          iconClassName ??
          'w-8 h-8 rounded-lg shrink-0 shadow-[0_0_16px_rgba(34,211,238,0.22)]'
        }
      />
    );
  }

  if (variant === 'compact') {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap shrink-0">
        <BrandMark
          className={
            iconClassName ??
            'w-7 h-7 rounded-lg shrink-0 shadow-[0_0_12px_rgba(34,211,238,0.2)]'
          }
        />
        <BrandWordmark className={wordmarkClassName ?? 'text-[13px] sm:text-sm'} />
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <BrandMark
        className={
          iconClassName ??
          'w-8 h-8 rounded-xl shrink-0 shadow-[0_0_16px_rgba(34,211,238,0.25)]'
        }
      />
      <div className="min-w-0">
        <BrandWordmark className={wordmarkClassName ?? 'text-[13px] block truncate'} />
        {showTagline && (
          <span className="text-[9.5px] font-medium tracking-[0.12em] uppercase text-slate-500 dark:text-slate-400 block truncate mt-1">
            Monitor · Predict · Prepare
          </span>
        )}
      </div>
    </div>
  );
};
