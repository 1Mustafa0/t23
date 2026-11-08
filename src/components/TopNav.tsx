/**
 * TopNav — simulation controls (pause/speed/sound), treasury & tax status,
 * city-event menu, language toggle, gazette button (with AI badge) and the
 * new-citizen entry point.
 */
import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  UserPlus, 
  Clock, 
  Sun, 
  CloudRain, 
  Zap, 
  Sparkles, 
  Snowflake, 
  Newspaper, 
  Globe,
  Flame,
  Coffee,
  Landmark,
  PartyPopper,
  ChevronDown,
  Hammer,
  TrendingUp,
  Coins,
  Building,
  HeartPulse,
  Home,
  UtensilsCrossed,
  Cpu,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Save,
  FolderOpen
} from 'lucide-react';
import { SimulationTime, WeatherType, CityEvent, UrbanPlanningMetrics } from '../types/simulation';
import type { AiStatus } from '../services/aiService';
import { soundEngine } from '../audio/soundEngine';
import { CITY_LOCATIONS } from '../simulation/cityMap';

interface TopNavProps {
  time: SimulationTime;
  weather: WeatherType;
  isPaused: boolean;
  speed: number;
  isMuted: boolean;
  language: 'ar' | 'en';
  activeEvent: CityEvent | null;
  showDensityHeatmap: boolean;
  urbanMetrics: UrbanPlanningMetrics;
  zoning?: { ok: number; warn: number; violations: number; top: string[] };
  justice?: { safety: number; crimesToday: number; arrestsToday: number; activeIncidents: number };
  aiStatus?: AiStatus;
  isGazetteLoading?: boolean;
  hasSavedProgress: boolean;
  saveStatus?: 'saved' | 'loaded' | 'error' | null;
  onTogglePlayPause: () => void;
  onSetSpeed: (speed: number) => void;
  onToggleMute: () => void;
  onOpenCreateModal: () => void;
  onOpenGazette: () => void;
  onToggleLanguage: () => void;
  onSaveProgress: () => void;
  onLoadProgress: () => void;
  onTriggerEvent: (type: CityEvent['type']) => void;
  onToggleDensityHeatmap: () => void;
  onCommissionProject?: () => void;
  onTriggerCrisis?: () => void;
  onSetTaxRate?: (rate: number) => void;
  onInjectStimulus?: (amount: number) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  time,
  weather,
  isPaused,
  speed,
  isMuted,
  language,
  activeEvent,
  showDensityHeatmap,
  urbanMetrics,
  zoning,
  justice,
  aiStatus,
  isGazetteLoading,
  hasSavedProgress,
  saveStatus,
  onTogglePlayPause,
  onSetSpeed,
  onToggleMute,
  onOpenCreateModal,
  onOpenGazette,
  onToggleLanguage,
  onSaveProgress,
  onLoadProgress,
  onTriggerEvent,
  onToggleDensityHeatmap,
  onCommissionProject,
  onTriggerCrisis,
  onSetTaxRate,
  onInjectStimulus
}) => {
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [isUrbanDashboardOpen, setIsUrbanDashboardOpen] = useState(false);
  const eventsMenuRef = useRef<HTMLDivElement | null>(null);
  const urbanDashboardRef = useRef<HTMLDivElement | null>(null);
  const speeds = [1, 2, 5, 10];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (eventsMenuRef.current && !eventsMenuRef.current.contains(e.target as Node)) {
        setIsEventsOpen(false);
      }
      if (urbanDashboardRef.current && !urbanDashboardRef.current.contains(e.target as Node)) {
        setIsUrbanDashboardOpen(false);
      }
    };
    if (isEventsOpen || isUrbanDashboardOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isEventsOpen, isUrbanDashboardOpen]);

  const getWeatherDisplay = () => {
    switch (weather) {
      case 'blizzard':
        return { icon: Snowflake, label: 'Blizzard', color: 'text-indigo-300' };
      case 'snow':
        return { icon: Snowflake, label: 'Snowfall', color: 'text-sky-300' };
      case 'storm':
      case 'rainy':
        return { icon: CloudRain, label: 'Rainstorm', color: 'text-sky-400' };
      case 'cloudy':
        return { icon: Zap, label: 'Overcast', color: 'text-slate-400' };
      case 'sunny':
      default:
        return { icon: Sun, label: 'Sunny', color: 'text-amber-400' };
    }
  };

  const weatherInfo = getWeatherDisplay();
  const WeatherIcon = weatherInfo.icon;

  const eventActions: Array<{
    type: CityEvent['type'];
    label: string;
    icon: React.ElementType;
    desc: string;
    color: string;
  }> = [
    { type: 'rainstorm', label: 'Rainstorm', icon: CloudRain, desc: 'Rain streaks & puddles', color: 'text-sky-400' },
    { type: 'snowstorm', label: 'Snowstorm', icon: Snowflake, desc: 'Snowflakes & winter caps', color: 'text-sky-300' },
    { type: 'city_decree', label: 'City Decree', icon: Landmark, desc: 'City Hall announcement', color: 'text-indigo-400' },
    { type: 'coffee_promo', label: 'Free Coffee', icon: Coffee, desc: 'Cozy Cafe morning rush', color: 'text-amber-400' },
    { type: 'power_outage', label: 'Power Outage', icon: Zap, desc: 'Tech Hub blackout', color: 'text-rose-400' },
    { type: 'festival', label: 'Park Festival', icon: PartyPopper, desc: 'Central Park gathering', color: 'text-purple-400' },
    { type: 'clear', label: 'Clear Sky / Reset', icon: Sun, desc: 'Reset weather & end events', color: 'text-amber-300' },
  ];

  return (
    <header className="flex items-center justify-between gap-4 px-5 py-2.5 bg-slate-900/98 backdrop-blur-md border-b border-slate-800 text-slate-100 shrink-0 z-30 select-none">
      {/* Zone 1: Wordmark & Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-950 font-bold text-base shadow-sm">
          🏙️
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap leading-tight">
            AgentVille 2D
          </span>
          <span className="text-[10px] text-slate-400 whitespace-nowrap leading-tight font-medium">
            Autonomous AI City Simulator
          </span>
        </div>
      </div>

      {/* Zone 2: Time, Weather, Play/Speed, Treasury & Urban Planning, Events */}
      <div className="flex items-center gap-3">
        {/* Time & Clock */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-800/90 rounded-lg border border-slate-700/60 text-xs">
          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-semibold text-slate-200 whitespace-nowrap">Day {time.day}</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono tabular-nums text-amber-300 font-semibold whitespace-nowrap">{time.timeString}</span>
        </div>

        {/* Weather Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800/90 rounded-lg border border-slate-700/60 text-xs">
          <WeatherIcon className={`w-3.5 h-3.5 ${weatherInfo.color}`} />
          <span className="text-slate-300 font-medium whitespace-nowrap">{weatherInfo.label}</span>
        </div>

        {/* Play / Pause & Speed Multipliers */}
        <div className="flex items-center gap-1 p-0.5 bg-slate-800/90 rounded-lg border border-slate-700/60">
          <button
            onClick={() => {
              soundEngine.playClickSound();
              onTogglePlayPause();
            }}
            title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
            className={`p-1.5 rounded-md transition-colors ${
              isPaused 
                ? 'bg-amber-500 text-slate-950 hover:bg-amber-400' 
                : 'text-slate-300 hover:text-white hover:bg-slate-700'
            }`}
          >
            {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3" />}
          </button>

          <div className="w-px h-3.5 bg-slate-700 mx-0.5" />

          {speeds.map(s => (
            <button
              key={s}
              onClick={() => {
                soundEngine.playClickSound();
                onSetSpeed(s);
              }}
              className={`px-1.5 py-0.5 text-xs font-mono font-medium rounded transition-colors ${
                speed === s
                  ? 'bg-slate-700 text-amber-300 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Audio Mute / Unmute */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          className={`p-1.5 rounded-lg border transition-colors ${
            isMuted 
              ? 'border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300' 
              : 'border-slate-700 bg-slate-800 text-amber-400 hover:text-amber-300'
          }`}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* ============================================================== */}
        {/* PUBLIC TREASURY & NEED-BASED URBAN PLANNING DASHBOARD TRIGGER  */}
        {/* ============================================================== */}
        <div className="relative" ref={urbanDashboardRef}>
          <button
            onClick={() => {
              soundEngine.playClickSound();
              setIsUrbanDashboardOpen(!isUrbanDashboardOpen);
            }}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
              isUrbanDashboardOpen
                ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 ring-1 ring-emerald-400/40'
                : 'bg-slate-800/90 border-slate-700/70 text-slate-200 hover:bg-slate-700 hover:border-slate-600'
            }`}
            title="Municipal Treasury & Need-Based Urban Planning Ledger"
          >
            <Landmark className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-emerald-300">
                ${Math.round(urbanMetrics.cityTreasury).toLocaleString()}
              </span>
              <span className="hidden md:inline text-[10px] px-1.5 py-0.2 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold">
                {Math.round(urbanMetrics.taxRate * 100)}% Tax
              </span>
            </div>
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isUrbanDashboardOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Urban Planning & Municipal Treasury Popover */}
          {isUrbanDashboardOpen && (
            <div className="absolute top-full mt-2 left-0 sm:-translate-x-1/4 w-88 sm:w-[420px] bg-slate-900/98 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-2xl p-4 space-y-4 z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold text-sm">
                    🏛️
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-xs leading-tight">Municipal Treasury & Urban Planning</h3>
                    <p className="text-[10px] text-slate-400 leading-tight">Public Infrastructure vs. Free Market Economy</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-950 text-emerald-300 border border-emerald-700/50">
                  Active Loop
                </span>
              </div>

              {/* Economic Overview Ledger */}
              <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-center">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Taxes Today</span>
                  <span className="font-mono text-xs font-bold text-emerald-400 flex items-center justify-center gap-0.5">
                    <ArrowUpRight className="w-3 h-3" />
                    +${Math.round(urbanMetrics.totalTaxesCollectedToday)}
                  </span>
                  <span className="text-[9px] text-slate-500 block">
                    {Math.round(urbanMetrics.taxRate * 100)}% inc + {Math.round(urbanMetrics.salesTaxRate * 100)}% sales
                  </span>
                </div>
                <div className="space-y-0.5 border-x border-slate-800 px-1">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Public Spending</span>
                  <span className="font-mono text-xs font-bold text-rose-400 flex items-center justify-center gap-0.5">
                    <ArrowDownRight className="w-3 h-3" />
                    -${Math.round(urbanMetrics.totalPublicExpenditureToday)}
                  </span>
                  <span className="text-[9px] text-slate-500 block">Civic infrastructure</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Private Revenue</span>
                  <span className="font-mono text-xs font-bold text-sky-400 flex items-center justify-center gap-0.5">
                    <TrendingUp className="w-3 h-3" />
                    +${Math.round(urbanMetrics.totalPrivateRevenueToday)}
                  </span>
                  <span className="text-[9px] text-slate-500 block">Commerce & Services</span>
                </div>
              </div>

              {/* Real-Time City Diagnostics & Need Deficits */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5">
                    <HeartPulse className="w-3.5 h-3.5 text-amber-400" />
                    Real-Time Need Deficits
                  </span>
                  <span className="text-[10px] lowercase text-slate-500">auto-triggers zoning &gt; 45%</span>
                </div>

                {/* Zoning compliance: the planning code audits itself every tick */}
                {zoning && (
                  <div
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-[11px] ${
                      zoning.violations > 0
                        ? 'bg-rose-950/40 border-rose-600/50 text-rose-200'
                        : zoning.warn > 0
                        ? 'bg-amber-950/30 border-amber-600/40 text-amber-200'
                        : 'bg-emerald-950/30 border-emerald-600/40 text-emerald-200'
                    }`}
                    title={zoning.top.length > 0 ? zoning.top.join('\n') : 'All planning rules satisfied'}
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span>🏘️</span>
                      Planning code
                    </span>
                    <span className="font-mono text-[10px]">
                      {zoning.violations > 0
                        ? `${zoning.violations} breach${zoning.violations === 1 ? '' : 'es'}`
                        : zoning.warn > 0
                        ? `${zoning.warn} warning${zoning.warn === 1 ? '' : 's'}`
                        : '✓ compliant'}
                    </span>
                  </div>
                )}

                <div className="space-y-2 text-xs">
                  {/* 1. Housing Deficit */}
                  <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 flex items-center gap-1.5 font-medium">
                        <Home className="w-3.5 h-3.5 text-pink-400" />
                        Housing Deficit:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${urbanMetrics.housingDeficit > 45 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {urbanMetrics.housingDeficit}%
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {urbanMetrics.housingDeficit > 45 ? '🚨 High Need (Triggers Condos)' : '✅ Adequate'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${urbanMetrics.housingDeficit > 45 ? 'bg-rose-500' : 'bg-pink-500'}`}
                        style={{ width: `${urbanMetrics.housingDeficit}%` }}
                      />
                    </div>
                  </div>

                  {/* 2. Healthcare Strain */}
                  <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 flex items-center gap-1.5 font-medium">
                        <HeartPulse className="w-3.5 h-3.5 text-cyan-400" />
                        Healthcare Strain:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${urbanMetrics.healthcareStrain > 45 ? 'text-rose-400' : 'text-slate-300'}`}>
                          {urbanMetrics.healthcareStrain}%
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {urbanMetrics.healthcareStrain > 45 ? '🚨 Overburdened (Triggers Clinic)' : '✅ Stable'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${urbanMetrics.healthcareStrain > 45 ? 'bg-rose-500' : 'bg-cyan-500'}`}
                        style={{ width: `${urbanMetrics.healthcareStrain}%` }}
                      />
                    </div>
                  </div>

                  {/* 3. Energy Grid Strain */}
                  <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 flex items-center gap-1.5 font-medium">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        Energy Grid Strain:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold ${urbanMetrics.energyStrain > 45 ? 'text-amber-400' : 'text-slate-300'}`}>
                          {urbanMetrics.energyStrain}%
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {urbanMetrics.energyStrain > 45 ? '⚡ Brownout Alert' : '✅ Grid Stable'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${urbanMetrics.energyStrain > 45 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${urbanMetrics.energyStrain}%` }}
                      />
                    </div>
                  </div>

                  {/* 4. Commercial & Tech Demand */}
                  <div className="p-2 bg-slate-800/60 rounded-lg border border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 flex items-center gap-1.5 font-medium">
                        <Cpu className="w-3.5 h-3.5 text-blue-400" />
                        Commercial & Tech Demand:
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-blue-300">
                          {urbanMetrics.commercialDemand}%
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {urbanMetrics.commercialDemand > 45 ? '🚀 Venture Surge' : 'Normal'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${urbanMetrics.commercialDemand}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Public vs Private Sector Zoning Directory */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Dynamic Zoning Allocations
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-indigo-950/40 border border-indigo-700/40">
                    <span className="font-bold text-indigo-300 flex items-center gap-1">
                      🏛️ Public Sector
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">
                      Solar Station & Community Clinic (Funded by City Treasury)
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-700/40">
                    <span className="font-bold text-amber-300 flex items-center gap-1">
                      💼 Private Sector
                    </span>
                    <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">
                      Modular Condos & AI Foundry (Funded by Private Capital)
                    </span>
                  </div>
                </div>
              </div>

              {/* Municipal Policy Controls */}
              <div className="p-2.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300">Municipal Income Tax Rate:</span>
                  <span className="font-mono font-bold text-amber-300">{Math.round(urbanMetrics.taxRate * 100)}%</span>
                </div>
                <div className="flex gap-2">
                  {[0.08, 0.12, 0.18].map(rate => (
                    <button
                      key={rate}
                      onClick={() => {
                        soundEngine.playClickSound();
                        if (onSetTaxRate) onSetTaxRate(rate);
                      }}
                      className={`flex-1 py-1 text-[11px] rounded font-semibold transition-colors ${
                        Math.abs(urbanMetrics.taxRate - rate) < 0.01
                          ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {Math.round(rate * 100)}%{rate === 0.08 ? ' (Low)' : rate === 0.12 ? ' (Std)' : ' (High)'}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    soundEngine.playCoinSound();
                    if (onInjectStimulus) onInjectStimulus(1000);
                  }}
                  className="w-full mt-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Inject $1,000 Municipal Treasury Grant</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Public safety: crimes, arrests and the live police response */}
        {justice && (
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${
              justice.safety >= 70
                ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-200'
                : justice.safety >= 45
                ? 'bg-amber-950/60 border-amber-600/50 text-amber-200'
                : 'bg-rose-950/60 border-rose-600/60 text-rose-200'
            }`}
            title={`Public safety ${justice.safety}% · ${justice.crimesToday} crime(s) today · ${justice.arrestsToday} arrest(s) · ${justice.activeIncidents} active incident(s)`}
          >
            <span>{justice.activeIncidents > 0 ? '🚨' : '🛡️'}</span>
            <span className="font-mono">{justice.safety}%</span>
            <span className="hidden lg:inline text-[10px] font-normal text-slate-300">
              {justice.crimesToday} crime{justice.crimesToday === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {/* City Events & Stimuli Dropdown */}
        <div className="relative" ref={eventsMenuRef}>
          <button
            onClick={() => {
              soundEngine.playClickSound();
              setIsEventsOpen(!isEventsOpen);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              activeEvent
                ? 'bg-amber-950/60 border-amber-500/80 text-amber-300 ring-1 ring-amber-400/40 shadow-sm'
                : isEventsOpen
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-slate-800 border-slate-700/70 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">City Events</span>
            {activeEvent && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
            <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isEventsOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Events Popover Menu */}
          {isEventsOpen && (
            <div className="absolute top-full mt-2 left-0 w-72 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl p-2.5 space-y-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 px-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  City Stimuli & God Mode
                </span>
                {activeEvent && (
                  <span className="text-[10px] font-mono text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-600/40">
                    {Math.max(1, Math.round(activeEvent.duration))}m left
                  </span>
                )}
              </div>

              {/* Event Buttons List */}
              <div className="grid grid-cols-1 gap-1">
                {eventActions.map(action => {
                  const Icon = action.icon;
                  const isActive = activeEvent?.type === action.type;
                  return (
                    <button
                      key={action.type}
                      onClick={() => {
                        soundEngine.playClickSound();
                        onTriggerEvent(action.type);
                        setIsEventsOpen(false);
                      }}
                      className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                        isActive
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${action.color}`} />
                        <div className="text-left">
                          <span className="font-semibold block leading-tight">{action.label}</span>
                          <span className="text-[10px] text-slate-400 block leading-tight">{action.desc}</span>
                        </div>
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-950 px-1.5 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Crisis Drill — damages the power grid and dispatches builders */}
              {onTriggerCrisis && (
                <div className="pt-1.5 border-t border-slate-800">
                  <button
                    onClick={() => {
                      soundEngine.playClickSound();
                      onTriggerCrisis();
                      setIsEventsOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-rose-400" />
                      <div className="text-left">
                        <span className="font-semibold block leading-tight">Crisis Drill</span>
                        <span className="text-[10px] text-rose-400/80 block leading-tight">Damage the grid & dispatch builders</span>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-rose-500 text-slate-950 font-bold">
                      ⚠️
                    </span>
                  </button>
                </div>
              )}

              {/* Commission Construction Quick Action */}
              {onCommissionProject && (
                <div className="pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      soundEngine.playClickSound();
                      onCommissionProject();
                      setIsEventsOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Hammer className="w-4 h-4 text-amber-400" />
                      <div className="text-left">
                        <span className="font-semibold block leading-tight">Commission Builder</span>
                        <span className="text-[10px] text-amber-400/80 block leading-tight">Deploy contractor to active plot</span>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-amber-500 text-slate-950 font-bold">
                      BUILD
                    </span>
                  </button>
                </div>
              )}

              {/* Density Heatmap Toggle inside Menu */}
              <div className="pt-1.5 border-t border-slate-800">
                <button
                  onClick={() => {
                    soundEngine.playClickSound();
                    onToggleDensityHeatmap();
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    showDensityHeatmap
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Flame className={`w-4 h-4 ${showDensityHeatmap ? 'text-amber-400 fill-amber-400 animate-pulse' : 'text-slate-400'}`} />
                    <div className="text-left">
                      <span className="font-semibold block leading-tight">Metropolis Heatmap</span>
                      <span className="text-[10px] text-slate-400 block leading-tight">Thermal traffic density</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${showDensityHeatmap ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'}`}>
                    {showDensityHeatmap ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Zone 3: Language, Gazette & New Citizen */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            soundEngine.playClickSound();
            onSaveProgress();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/80 transition-colors whitespace-nowrap shadow-sm"
          title="Save life progress in this browser"
        >
          <Save className={`w-3.5 h-3.5 ${saveStatus === 'saved' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="hidden lg:inline">
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Save'}
          </span>
        </button>

        <button
          onClick={() => {
            soundEngine.playClickSound();
            onLoadProgress();
          }}
          disabled={!hasSavedProgress}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700/80 transition-colors whitespace-nowrap shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800"
          title={hasSavedProgress ? 'Load saved life progress' : 'No saved progress yet'}
        >
          <FolderOpen className={`w-3.5 h-3.5 ${saveStatus === 'loaded' ? 'text-emerald-400' : 'text-sky-400'}`} />
          <span className="hidden lg:inline">{saveStatus === 'loaded' ? 'Loaded' : 'Load'}</span>
        </button>

        {/* Language Toggle (Arabic / English) */}
        <button
          onClick={() => {
            soundEngine.playClickSound();
            onToggleLanguage();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg border border-slate-700/80 transition-colors whitespace-nowrap shadow-sm"
          title="تبديل لغة الحوارات بين العربية والإنجليزية / Toggle Dialogue Language"
        >
          <Globe className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-sans">{language === 'ar' ? 'العربية' : 'English'}</span>
        </button>

        {/* City Gazette Button */}
        <button
          onClick={() => {
            soundEngine.playChatChime();
            onOpenGazette();
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white rounded-lg border border-slate-700/80 transition-colors whitespace-nowrap shadow-sm"
          title={
            aiStatus?.configured
              ? 'Read the 24-Hour City Gazette (Gemini live edition)'
              : 'Read the 24-Hour City Gazette (local edition)'
          }
        >
          {isGazetteLoading ? (
            <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          ) : (
            <Newspaper className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="hidden md:inline">City Gazette</span>
          <span
            className={`hidden lg:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
              aiStatus?.configured
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60'
                : 'bg-slate-900 text-slate-400 border-slate-700/70'
            }`}
            title={aiStatus?.reason || (aiStatus?.configured ? 'Gemini API connected' : 'Local templates')}
          >
            {aiStatus?.configured ? <Sparkles className="w-2.5 h-2.5" /> : <Cpu className="w-2.5 h-2.5" />}
            {aiStatus?.configured ? 'Gemini' : 'Local'}
          </span>
        </button>

        {/* New Citizen Spawn Button */}
        <button
          onClick={() => {
            soundEngine.playClickSound();
            onOpenCreateModal();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>New Citizen</span>
        </button>
      </div>
    </header>
  );
};

