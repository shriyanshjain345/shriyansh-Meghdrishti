import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckSquare,
  CloudRain,
  Compass,
  Hospital,
  Map as MapIcon,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
} from 'lucide-react';
import type { CityId, NavPageId } from '../types/flood.ts';
import { CITY_MAP } from '../data/cities.ts';
import {
  AnimatedNumber,
  ScrollReveal,
  SlidingTabs,
  SpotlightCard,
} from '../components/MotionPrimitives.tsx';

interface EmergencyGuidePageProps {
  selectedCity: CityId;
  onNavigate: (page: NavPageId) => void;
}

type GuidePhase = 'before' | 'during' | 'after' | 'evacuation';

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
}

const CHECKLIST_STORAGE_KEY = 'meghdrishti_prep_checklist_v1';

const PREPAREDNESS_CHECKLIST: ChecklistItem[] = [
  {
    id: 'docs_waterproof',
    label: 'Seal ID, medical records & cash in waterproof pouches',
    detail: 'Keep Aadhaar, bank cards, prescriptions, and emergency cash in double-zipped plastic bags.',
  },
  {
    id: 'powerbank_torch',
    label: 'Charge phones, power banks & keep LED torch with spare cells',
    detail: 'Urban waterlogging often triggers precautionary feeder shutoffs by municipal discoms.',
  },
  {
    id: 'drinking_water',
    label: 'Store at least 3 days of potable drinking water & dry rations',
    detail: 'Keep 3–4 litres per person per day along with ORS packets and ready-to-eat food.',
  },
  {
    id: 'first_aid',
    label: 'Stock first-aid kit, antiseptics & essential prescription meds',
    detail: 'Include blister bandages, anti-fungal cream, fever tablets, and regular chronic medications.',
  },
  {
    id: 'vehicle_park',
    label: 'Move vehicles from basement parking to elevated ground',
    detail: 'Basement garages and underpasses flood first; relocate vehicles before intense rain bands arrive.',
  },
  {
    id: 'drains_clear',
    label: 'Clear terrace outlets, balcony drains & unplug ground-level sockets',
    detail: 'Prevent backflow into ground-floor wiring and keep circuit breakers accessible.',
  },
];

const PHASE_CONTENT: Record<
  GuidePhase,
  {
    title: string;
    subtitle: string;
    cards: Array<{ heading: string; points: string[] }>;
  }
> = {
  before: {
    title: 'Before Heavy Rainfall & Monsoon Alerts',
    subtitle: 'Proactive preparation when IMD issues Yellow, Orange, or Red heavy-rain advisories.',
    cards: [
      {
        heading: 'Home & Electrical Readiness',
        points: [
          'Inspect rooftop rainwater pipes, courtyard drains, and compound outlets for plastic/leaf blockages.',
          'Elevate electrical appliances, inverters, and important documents above historical watermarks.',
          'Identify the main MCB electrical switch and LPG cylinder valve so all household members can shut them off quickly.',
        ],
      },
      {
        heading: 'Commute & Neighbourhood Awareness',
        points: [
          'Note local low-lying railway underpasses, creek outfalls, and waterlogging bottlenecks on your daily commute.',
          'Save your municipal ward disaster control room number and locate the nearest high-ground hospital or civic shelter.',
          'Keep a grab-and-go emergency pouch ready by the exit door during peak monsoon weeks.',
        ],
      },
    ],
  },
  during: {
    title: 'During Active Urban Flooding & Waterlogging',
    subtitle: 'Immediate life-safety precautions while intense rain or street inundation is underway.',
    cards: [
      {
        heading: 'Walking & Road Safety',
        points: [
          'Do not walk or drive through moving floodwater or submerged railway/road underpasses — 30 cm of moving water can sweep a vehicle.',
          'Avoid open storm drains, dislodged manhole covers, and flooded pavements where cavities are hidden below murky water.',
          'Stay well clear of fallen overhead power lines, street-light poles, and submerged transformer enclosures.',
        ],
      },
      {
        heading: 'Inside Buildings & Basements',
        points: [
          'Evacuate basements and ground-level rooms immediately if water begins rising outside.',
          'Switch off the main electrical MCB if floodwater enters the ground floor or reaches wall outlets.',
          'Follow official IMD, NDMA (SACHET), and Municipal Corporation announcements rather than unverified social forwards.',
        ],
      },
    ],
  },
  after: {
    title: 'After Floodwaters Recede',
    subtitle: 'Health, structural, and electrical safety checks before returning to normal routines.',
    cards: [
      {
        heading: 'Structural & Electrical Inspection',
        points: [
          'Do not restore mains electricity until a qualified electrician verifies damp wiring, earthing, and distribution boards are dry.',
          'Watch for weakened compound walls, road sinkholes, and undermined pavements along stormwater drains.',
          'Photograph water damage for municipal relief claims or insurance documentation before clearing debris.',
        ],
      },
      {
        heading: 'Water & Vector-Borne Disease Prevention',
        points: [
          'Boil tap water or use chlorinated/sealed drinking water until municipal supply safety is confirmed.',
          'Disinfect floor surfaces and flush stagnant puddles to prevent leptospirosis, dengue, and cholera exposure.',
          'Seek medical care promptly at a nearby hospital if anyone develops fever, skin rashes, or cuts exposed to floodwater.',
        ],
      },
    ],
  },
  evacuation: {
    title: 'Safe Evacuation Guidance',
    subtitle: 'Structured steps when municipal authorities or NDRF/SDRF issue an evacuation notice.',
    cards: [
      {
        heading: 'Departure Protocol',
        points: [
          'Switch off electricity mains, gas regulators, and lock external doors before leaving.',
          'Carry your waterproof emergency bag, essential medicines, drinking water, and charged mobile phone.',
          'Use elevated arterial roads and avoid shortcuts near nallahs, riverbanks, or coastal tidal creeks.',
        ],
      },
      {
        heading: 'Reaching Relief Centres',
        points: [
          'Use MeghDrishti’s Relief Centres page to locate nearby municipal halls, hospitals, fire stations, and police posts.',
          'Inform a distant family contact of your route and the relief facility you are heading toward.',
          'Assist elderly neighbours, children, and persons with mobility needs while coordinating with local ward volunteers.',
        ],
      },
    ],
  },
};

const CITY_HELPLINES: Record<CityId, { controlRoom: string; helpline: string }> = {
  mumbai: { controlRoom: 'BMC Disaster Management Control Room', helpline: '1916 / 022-22694725' },
  delhi: { controlRoom: 'Delhi DDMA / MCD Flood Control Room', helpline: '1077 / 155305' },
  chennai: { controlRoom: 'Greater Chennai Corporation Flood Control', helpline: '1913 / 044-25619206' },
  bengaluru: { controlRoom: 'BBMP Control Room & Rain Helpline', helpline: '1533 / 080-22660000' },
  kolkata: { controlRoom: 'KMC Disaster & Drainage Control Room', helpline: '033-22861212 / 100' },
  jaipur: { controlRoom: 'Jaipur District & Nagar Nigam Flood Control', helpline: '1077 / 0141-2204475' },
  hyderabad: { controlRoom: 'GHMC / HYDRAA Disaster Control Room', helpline: '040-21111111 / 1077' },
  pune: { controlRoom: 'PMC Disaster Management Control Cell', helpline: '020-25501269 / 1077' },
  ahmedabad: { controlRoom: 'AMC Flood Control Room', helpline: '155303 / 079-25391811' },
};

export const EmergencyGuidePage: React.FC<EmergencyGuidePageProps> = ({
  selectedCity,
  onNavigate,
}) => {
  const [phase, setPhase] = useState<GuidePhase>('before');
  const [lastToggledId, setLastToggledId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checkedIds));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }, [checkedIds]);

  const toggleItem = (id: string) => {
    setLastToggledId(id);
    setCheckedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetChecklist = () => {
    setLastToggledId(null);
    setCheckedIds({});
  };

  const completedCount = PREPAREDNESS_CHECKLIST.filter((i) => Boolean(checkedIds[i.id])).length;
  const totalCount = PREPAREDNESS_CHECKLIST.length;
  const pctReady = Math.round((completedCount / totalCount) * 100);
  const allReady = completedCount === totalCount;
  const cityInfo = CITY_MAP[selectedCity];
  const cityHelpline = CITY_HELPLINES[selectedCity];
  const activePhase = PHASE_CONTENT[phase];

  return (
    <div className="space-y-6">
      {/* Header */}
      <ScrollReveal delayMs={0}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#0284C7] dark:text-cyan-400" />
              Urban Flood Emergency &amp; Preparedness Guide
            </h1>
            <p className="text-xs sm:text-sm text-[#475569] dark:text-slate-400 mt-0.5">
              Actionable safety guidance, India emergency helplines, and personal preparedness checklist for {cityInfo.name}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('relief')}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] dark:bg-cyan-600 dark:hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer shadow-xs"
            >
              <Hospital className="w-3.5 h-3.5" />
              <span>Find Nearby Relief Centres</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('map')}
              className="tactile-btn inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <MapIcon className="w-3.5 h-3.5 text-[#0284C7] dark:text-cyan-400" />
              <span>View Flood Risk Map</span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* National & City Emergency Helplines */}
      <ScrollReveal delayMs={50}>
        <SpotlightCard
          tactile={false}
          className="rounded-2xl glass-panel p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100 flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-[#DC2626] dark:text-red-400" />
              Official India &amp; Municipal Emergency Helplines
            </h2>
            <span className="text-xs text-[#64748B] dark:text-slate-400">Always dial 112 in immediate life-threatening emergencies</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SpotlightCard className="rounded-lg bg-[#FEF2F2] dark:bg-red-950/25 border border-[#FECACA] dark:border-red-500/35 p-3.5">
              <span className="text-[11px] font-semibold text-[#B91C1C] dark:text-red-300">National Emergency (ERSS)</span>
              <p className="text-2xl font-mono font-bold text-[#0F172A] dark:text-slate-100 mt-1">112</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Unified Police, Fire, Ambulance &amp; Rescue across India</p>
            </SpotlightCard>
            <SpotlightCard className="rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 p-3.5">
              <span className="text-[11px] font-semibold text-[#0284C7] dark:text-cyan-300">NDMA / Disaster Helpline</span>
              <p className="text-2xl font-mono font-bold text-[#0F172A] dark:text-slate-100 mt-1">1078 / 1077</p>
              <p className="text-xs text-[#475569] dark:text-slate-400 mt-1">National (1078) &amp; District Emergency Operations Centre (1077)</p>
            </SpotlightCard>
            <SpotlightCard className="rounded-lg bg-[#ECFDF5] dark:bg-slate-900/70 border border-[#A7F3D0] dark:border-slate-800 p-3.5">
              <span className="text-[11px] font-semibold text-[#047857] dark:text-emerald-300">Medical &amp; Fire Rescue</span>
              <p className="text-2xl font-mono font-bold text-[#0F172A] dark:text-slate-100 mt-1">108 · 101</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Emergency Ambulance (108) &amp; Fire Brigade (101)</p>
            </SpotlightCard>
            <SpotlightCard className="rounded-lg bg-[#E0F2FE]/70 dark:bg-cyan-950/25 border border-sky-200 dark:border-cyan-500/30 p-3.5">
              <span className="text-[11px] font-semibold text-[#0284C7] dark:text-cyan-300">{cityInfo.name} Control Room</span>
              <p className="text-base sm:text-lg font-mono font-bold text-[#0F172A] dark:text-slate-100 mt-1">{cityHelpline.helpline}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{cityHelpline.controlRoom}</p>
            </SpotlightCard>
          </div>
        </SpotlightCard>
      </ScrollReveal>

      {/* Guidance Phases + Interactive Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Phase Protocols */}
        <ScrollReveal delayMs={80} className="lg:col-span-7">
          <SpotlightCard
            tactile={false}
            className="h-full rounded-2xl glass-panel p-5 space-y-4"
          >
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
              <SlidingTabs
                layoutId="emergency-phase-tabs"
                activeId={phase}
                onChange={setPhase}
                items={[
                  { id: 'before', label: 'Before Rain', icon: CloudRain },
                  { id: 'during', label: 'During Flood', icon: AlertTriangle },
                  { id: 'after', label: 'After Receding', icon: Sparkles },
                  { id: 'evacuation', label: 'Evacuation', icon: Compass },
                ]}
              />
            </div>

            <div>
              <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
                {activePhase.title}
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">{activePhase.subtitle}</p>
            </div>

            <div className="space-y-3">
              {activePhase.cards.map((card) => (
                <div
                  key={card.heading}
                  className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-4 space-y-2"
                >
                  <h3 className="text-sm font-semibold text-[#0284C7] dark:text-cyan-300">{card.heading}</h3>
                  <ul className="space-y-1.5 text-xs sm:text-sm text-[#334155] dark:text-slate-300 list-disc list-inside leading-relaxed">
                    {card.points.map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </ScrollReveal>

        {/* Interactive Preparedness Checklist with Animated Strike-Through & Celebration */}
        <ScrollReveal delayMs={130} className="lg:col-span-5">
          <SpotlightCard
            tactile={false}
            className="h-full rounded-2xl glass-panel p-5 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-display font-semibold text-[#0F172A] dark:text-slate-100">
                    Household Readiness Checklist
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Progress saved locally on your device for offline monsoon access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetChecklist}
                  className="tactile-btn inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              </div>

              {/* Animated Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#475569] dark:text-slate-400">Preparedness Score</span>
                  <span className={`font-semibold ${allReady ? 'text-[#047857] dark:text-emerald-400' : 'text-[#0284C7] dark:text-cyan-300'}`}>
                    {completedCount} / {totalCount} (<AnimatedNumber value={pctReady} />%)
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      allReady ? 'bg-[#059669] dark:bg-emerald-500' : 'bg-[#0284C7] dark:bg-cyan-500'
                    }`}
                    style={{
                      width: `${pctReady}%`,
                    }}
                  />
                </div>
              </div>

              {allReady && (
                <div className="animate-check-pop rounded-lg bg-[#ECFDF5] dark:bg-emerald-950/35 border border-[#A7F3D0] dark:border-emerald-500/40 px-3 py-2.5 flex items-center gap-2.5 text-xs text-[#047857] dark:text-emerald-200">
                  <Award className="w-4 h-4 text-[#059669] dark:text-emerald-400 shrink-0" />
                  <span>
                    <strong>100% Household Readiness Achieved!</strong> Keep waterproof pouch &amp; charged power bank near the main exit.
                  </span>
                </div>
              )}

              <div className="space-y-2 pt-1">
                {PREPAREDNESS_CHECKLIST.map((item) => {
                  const checked = Boolean(checkedIds[item.id]);
                  const justPopped = lastToggledId === item.id && checked;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className={`tactile-btn w-full text-left rounded-lg border p-3 flex items-start gap-3 transition-colors cursor-pointer ${
                        checked
                          ? 'bg-[#ECFDF5] border-[#A7F3D0] dark:bg-emerald-950/20 dark:border-emerald-500/35'
                          : 'bg-slate-50 border-slate-200 hover:border-sky-300 dark:bg-slate-900/60 dark:border-slate-800 dark:hover:border-cyan-500/35'
                      } ${justPopped ? 'animate-check-pop' : ''}`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-[#047857] dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p
                          className={`text-xs font-semibold ${
                            checked ? 'text-[#047857] dark:text-emerald-200' : 'text-[#0F172A] dark:text-slate-200'
                          }`}
                        >
                          <span className={`animated-strike ${checked ? 'is-checked' : ''}`}>
                            {item.label}
                          </span>
                        </p>
                        <p className="text-[11px] text-[#475569] dark:text-slate-400 mt-0.5 leading-relaxed">
                          {item.detail}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-[#64748B] dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
              Guidance aligns with general NDMA Urban Flood Preparedness practices. Always prioritise on-ground local civil defence instructions.
            </p>
          </SpotlightCard>
        </ScrollReveal>
      </div>
    </div>
  );
};
