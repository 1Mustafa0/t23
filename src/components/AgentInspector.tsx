/**
 * ============================================================================
 *  AGENT INSPECTOR — the citizen profile drawer
 * ============================================================================
 *
 *  Sections (top → bottom): cognitive focus & location, moral alignment,
 *  HUMAN LIFE & RELATIONSHIPS (age/gender/children, live pregnancy progress,
 *  spouse/parents/siblings, "Closest Bonds" meters fed by relationships.ts),
 *  XP & builder mastery, needs & drives, wallet + municipal ledger, trust
 *  matrix, god-mode interventions, and the filterable memory stream.
 *
 *  Pure presentation: everything is derived in getFamilyView /
 *  getRelationshipSummaries; this component only renders.
 */
import React, { useState } from 'react';
import { AgentData, MemoryEntry } from '../types/simulation';
import { CITY_LOCATIONS } from '../simulation/cityMap';
import { getFamilyView, getRelationshipSummaries } from '../simulation/relationships';
import { 
  X, 
  Battery, 
  Smile, 
  Users, 
  DollarSign, 
  Navigation, 
  BrainCircuit, 
  Sparkles, 
  Send, 
  Coins, 
  BookOpen, 
  HeartHandshake,
  Compass,
  Utensils,
  Shield,
  Hammer,
  Award,
  Heart,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import { psycheSummary } from '../simulation/psychology';
import { soundEngine } from '../audio/soundEngine';

interface AgentInspectorProps {
  agent: AgentData | null;
  allAgents: AgentData[];
  currentDay: number;
  onClose: () => void;
  onDirectLocation: (agentId: string, locationId: string) => void;
  onGiveMoney: (agentId: string, amount: number) => void;
  onInspire: (agentId: string) => void;
}

export const AgentInspector: React.FC<AgentInspectorProps> = ({
  agent,
  allAgents,
  currentDay,
  onClose,
  onDirectLocation,
  onGiveMoney,
  onInspire
}) => {
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'social' | 'travel' | 'need' | 'event' | 'moral' | 'build'>('all');

  if (!agent) return null;

  const filteredMemories = agent.memoryStream.filter(m => {
    if (memoryFilter === 'all') return true;
    return m.category === memoryFilter;
  });

  const getStatColor = (value: number) => {
    if (value >= 70) return 'bg-emerald-500';
    if (value >= 35) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const currentLocationObj = CITY_LOCATIONS.find(l => l.id === agent.currentLocationId);
  const targetLocationObj = CITY_LOCATIONS.find(l => l.id === agent.targetLocationId);

  // Trust entries list
  const trustEntries = Object.entries(agent.trustScores || {});

  // Human life: family, romance and relationship bonds
  const familyView = getFamilyView(agent, allAgents, currentDay);
  const relationshipList = getRelationshipSummaries(agent, allAgents, currentDay, 5);
  const lifeStageIcon = familyView.age < 13 ? '🧒' : familyView.age < 18 ? '🎒' : familyView.age >= 60 ? '🧓' : agent.gender === 'female' ? '👩' : '👨';
  const relationshipStatusLabel =
    familyView.spouse ? 'Married' :
    relationshipList.some(r => r.stage === 'engaged') ? 'Engaged' :
    relationshipList.some(r => r.stage === 'dating') ? 'Dating' :
    familyView.children.length > 0 ? 'Parent' : 'Single';

  const renderFamilyChip = (person: AgentData, suffix?: string) => (
    <div
      key={person.id}
      className="flex items-center gap-1.5 p-1.5 bg-slate-900/80 rounded-lg border border-slate-700/50 min-w-0"
      title={`${person.name} (${person.personality})`}
    >
      <span
        className="w-4 h-4 rounded-full shrink-0 border border-white/30"
        style={{ backgroundColor: person.color }}
      />
      <span className="text-[11px] text-slate-200 truncate max-w-[110px]">{person.name}</span>
      {suffix && <span className="text-[10px] text-slate-500 shrink-0">{suffix}</span>}
    </div>
  );

  return (
    <div className="fixed top-0 right-0 w-full sm:w-96 h-full z-40 bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col transition-all duration-200 animate-in slide-in-from-right select-text">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shadow-inner border border-white/20 relative"
            style={{ backgroundColor: agent.color }}
          >
            {agent.avatarEmoji}
            {agent.role === 'builder' && (
              <span className="absolute -bottom-1 -right-1 text-xs bg-amber-400 text-slate-950 p-0.5 rounded-full shadow-sm">
                👷
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">{agent.name}</h2>
              <span className="text-xs text-amber-400 font-medium">({agent.personality})</span>
            </div>
            <p className="text-xs text-slate-400">{agent.profession}</p>
          </div>
        </div>

        <button
          onClick={() => {
            soundEngine.playClickSound();
            onClose();
          }}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          title="Close Inspector"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-4">
        {/* Current State & Cognitive Thought */}
        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5 text-amber-400" />
              Cognitive Focus
            </span>
            <span className="font-semibold text-amber-300 uppercase tracking-wider text-[11px]">
              {agent.state}
            </span>
          </div>

          <p className="text-xs text-slate-200 italic leading-relaxed">
            "{agent.currentThought}"
          </p>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50 text-[11px] text-slate-400">
            <Navigation className="w-3 h-3 text-sky-400 shrink-0" />
            <span>
              {agent.state === 'TRAVELING' && targetLocationObj
                ? `En route to ${targetLocationObj.name}`
                : currentLocationObj
                ? `Currently at ${currentLocationObj.name}`
                : 'Wandering city avenues'}
            </span>
          </div>
        </div>

        {/* Moral Spectrum & Human Nature Card */}
        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Heart className={`w-3.5 h-3.5 ${agent.moralAlignment === 'Altruistic' ? 'text-emerald-400 fill-emerald-400' : agent.moralAlignment === 'Selfish' ? 'text-rose-400 fill-rose-400' : 'text-sky-400'}`} />
              Moral Alignment
            </span>
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
              agent.moralAlignment === 'Altruistic'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/40'
                : agent.moralAlignment === 'Selfish'
                ? 'bg-rose-950 text-rose-300 border border-rose-600/40'
                : 'bg-sky-950 text-sky-300 border border-sky-600/40'
            }`}>
              {agent.moralAlignment}
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-snug">
            {agent.moralAlignment === 'Altruistic' && 'Altruistic Nature: Shares food and funds during neighborhood hardships, repairs public infrastructure at discount rates, and fosters high community trust.'}
            {agent.moralAlignment === 'Selfish' && 'Selfish Nature: Prioritizes personal wealth accumulation, charges high fees for services, avoids emergency contributions, and hoards resources.'}
            {agent.moralAlignment === 'Neutral' && 'Pragmatic Neutral: Fair trade pricing, balanced civic engagement, and reciprocal social trust.'}
          </p>

          <div className="flex items-center justify-between pt-1 border-t border-slate-700/50 text-[11px] text-slate-400">
            <span>Alignment Score:</span>
            <span className={`font-mono font-bold ${agent.moralScore > 0 ? 'text-emerald-400' : agent.moralScore < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              {agent.moralScore > 0 ? `+${agent.moralScore}` : agent.moralScore}
            </span>
          </div>
        </div>

        {/* Mind & Criminal Record — the citizen as a person */}
        <div className="p-3 bg-slate-800/80 rounded-xl border border-indigo-700/50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <span>🧠</span>
              Mind &amp; Record
            </span>
            {agent.jailedUntil != null && agent.jailedUntil > currentDay ? (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-rose-950 text-rose-300 border border-rose-600/50">
                Detained · {agent.jailedUntil - currentDay}d
              </span>
            ) : agent.record && agent.record.length > 0 ? (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-amber-950 text-amber-300 border border-amber-600/40">
                {agent.record.length} prior
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-600/40">
                Clean
              </span>
            )}
          </div>

          {[
            { label: 'Stress', value: agent.psyche?.stress ?? 0, color: 'bg-rose-400' },
            { label: 'Hope', value: agent.psyche?.hope ?? 0, color: 'bg-emerald-400' },
            { label: 'Impulse', value: agent.psyche?.impulse ?? 0, color: 'bg-amber-400' },
            { label: 'Resentment', value: agent.psyche?.resentment ?? 0, color: 'bg-fuchsia-400' },
            { label: 'Suspicion', value: agent.psyche?.suspicion ?? 0, color: 'bg-sky-400' },
          ].map(metric => (
            <div key={metric.label} className="flex items-center gap-2">
              <span className="w-20 text-[10px] text-slate-400">{metric.label}</span>
              <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className={`h-full ${metric.color}`} style={{ width: `${Math.max(2, Math.min(100, metric.value))}%` }} />
              </div>
              <span className="w-7 text-right text-[10px] font-mono text-slate-400">{Math.round(metric.value)}</span>
            </div>
          ))}

          <div className="flex items-center justify-between pt-1 border-t border-slate-700/50 text-[11px] text-slate-400">
            <span>Housing</span>
            <span className={`font-mono font-bold ${agent.housing === 'homeless' ? 'text-rose-300' : 'text-emerald-300'}`}>
              {agent.housing === 'homeless' ? '🏠❗ no unit' : (agent.housingUnit ?? '—')}
            </span>
          </div>

          {[
            { label: 'Honesty', value: agent.psyche?.values?.honesty ?? 0, color: 'bg-emerald-300' },
            { label: 'Compassion', value: agent.psyche?.values?.compassion ?? 0, color: 'bg-pink-300' },
            { label: 'Family', value: agent.psyche?.values?.family ?? 0, color: 'bg-amber-300' },
            { label: 'Ambition', value: agent.psyche?.values?.ambition ?? 0, color: 'bg-indigo-300' },
            { label: 'Dignity', value: agent.psyche?.values?.dignity ?? 0, color: 'bg-sky-300' },
          ].map(metric => (
            <div key={metric.label} className="flex items-center gap-2">
              <span className="w-20 text-[10px] text-slate-400">{metric.label}</span>
              <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                <div className={`h-full ${metric.color}`} style={{ width: `${Math.max(2, Math.min(100, metric.value))}%` }} />
              </div>
              <span className="w-7 text-right text-[10px] font-mono text-slate-400">{Math.round(metric.value)}</span>
            </div>
          ))}

          <p className="text-[11px] text-slate-400 italic leading-snug">
            {agent.psyche ? psycheSummary(agent) : 'steady'}
          </p>

          {agent.record && agent.record.length > 0 && (
            <div className="space-y-1 pt-1 border-t border-slate-700/60">
              {agent.record.slice(0, 3).map((entry, index) => (
                <div key={`${entry.day}-${index}`} className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-300">
                    Day {entry.day} · {entry.type.replace('_', ' ')}
                  </span>
                  <span className={entry.outcome === 'arrested' ? 'text-rose-300' : 'text-amber-300'}>
                    {entry.outcome}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Human Life: Age, Gender, Romance & Family */}
        <div className="p-3 bg-slate-800/80 rounded-xl border border-pink-800/40 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400" />
              Human Life & Relationships
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-pink-950 text-pink-300 border border-pink-600/40">
              {relationshipStatusLabel}
            </span>
          </div>

          {/* Age / gender / pregnancy summary */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1"><span className="text-xs">{lifeStageIcon}</span>Age:</span>
              <span className="font-mono font-bold text-amber-300">{familyView.age}</span>
            </div>
            <div className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">{agent.gender === 'female' ? '♀' : '♂'}Gender:</span>
              <span className="font-mono font-bold text-sky-300 capitalize">{agent.gender}</span>
            </div>
            <div className="p-1.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">👶Kids:</span>
              <span className="font-mono font-bold text-emerald-300">{familyView.children.length}</span>
            </div>
          </div>

          {/* Active pregnancy */}
          {familyView.pregnant && (
            <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-600/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-rose-200 font-semibold">
                <span>🤰 Expecting a baby{familyView.pregnancyPartnerName ? ` with ${familyView.pregnancyPartnerName}` : ''}</span>
                <span className="font-mono">
                  {familyView.pregnancyDaysRemaining != null ? `${familyView.pregnancyDaysRemaining}d to go` : ''}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-pink-300 transition-all duration-300"
                  style={{
                    width: `${Math.max(4, Math.min(100, ((familyView.pregnancyDaysElapsed ?? 0) / Math.max(1, (familyView.pregnancyDaysElapsed ?? 0) + (familyView.pregnancyDaysRemaining ?? 0))) * 100))}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Partner / spouse card */}
          {(familyView.spouse || familyView.partner) && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/80 border border-pink-700/40">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base border border-white/20 shrink-0"
                style={{ backgroundColor: (familyView.spouse ?? familyView.partner)!.color }}
              >
                {(familyView.spouse ?? familyView.partner)!.avatarEmoji}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-white font-semibold truncate">
                  {(familyView.spouse ?? familyView.partner)!.name}
                </p>
                <p className="text-[10px] text-pink-300 font-mono uppercase tracking-wider">
                  {familyView.spouse ? '💍 Spouse' : '❤️ Partner'}
                </p>
              </div>
            </div>
          )}

          {/* Family: parents, children, siblings */}
          {(familyView.parents.length > 0 || familyView.children.length > 0 || familyView.siblings.length > 0) && (
            <div className="space-y-1.5 pt-0.5">
              {familyView.parents.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Parents</p>
                  <div className="grid grid-cols-2 gap-1">{familyView.parents.map(p => renderFamilyChip(p))}</div>
                </div>
              )}
              {familyView.children.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Children</p>
                  <div className="grid grid-cols-2 gap-1">{familyView.children.map(c => renderFamilyChip(c, c.isChild ? '🧒' : undefined))}</div>
                </div>
              )}
              {familyView.siblings.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Siblings</p>
                  <div className="grid grid-cols-2 gap-1">{familyView.siblings.map(s => renderFamilyChip(s))}</div>
                </div>
              )}
            </div>
          )}

          {/* Closest bonds with live intimacy meters */}
          {relationshipList.length > 0 && (
            <div className="space-y-1.5 pt-1 border-t border-slate-700/50">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Closest Bonds</p>
              {relationshipList.map(rel => (
                <div key={rel.id} className="p-1.5 rounded-lg bg-slate-900/70 border border-slate-700/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0 border border-white/30" style={{ backgroundColor: rel.partnerColor }} />
                      <span className="text-slate-200 truncate">{rel.partnerName}</span>
                    </span>
                    <span className={`font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      rel.stage === 'married' ? 'bg-pink-950 text-pink-300' :
                      rel.stage === 'engaged' ? 'bg-rose-950 text-rose-300' :
                      rel.stage === 'dating' ? 'bg-red-950 text-red-300' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {rel.stageLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-slate-400">
                    <span>Chemistry {rel.attraction}%</span>
                    <span>Warmth {rel.affinity}</span>
                    <span>Romance {rel.romance}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="h-full bg-pink-500" style={{ width: `${rel.romance}%` }} />
                    <div className="h-full bg-sky-600" style={{ width: `${Math.max(0, rel.affinity / 2)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skill Growth & Capacity Expansion (XP System) */}
        <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              {agent.role === 'builder' ? 'Builder Guild Capacity' : 'Skill Mastery'}
            </span>
            <span className="font-mono text-amber-300 text-[11px] font-bold">
              Level {agent.level}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-medium">{agent.rankTitle}</span>
            <span className="font-mono text-[11px] text-slate-400">{agent.xp % 100} / 100 XP</span>
          </div>

          {/* XP Progress Bar */}
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${Math.max(6, Math.min(100, agent.xp % 100))}%` }}
            />
          </div>

          {agent.role === 'builder' && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/50 text-[11px] text-slate-400">
              <span>Construction Speed:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                +{Math.round((agent.buildSpeedMultiplier - 1) * 100)}% Bonus
              </span>
            </div>
          )}
        </div>

        {/* Dynamic Needs & Drives Vitals */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Needs & Drives
          </h3>

          {/* Energy */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Battery className="w-3.5 h-3.5 text-sky-400" />
                Energy
              </span>
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(agent.stats.energy)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${getStatColor(agent.stats.energy)}`}
                style={{ width: `${Math.max(4, Math.min(100, agent.stats.energy))}%` }}
              />
            </div>
          </div>

          {/* Hunger */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Utensils className="w-3.5 h-3.5 text-orange-400" />
                Hunger Satisfaction
              </span>
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(agent.stats.hunger)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${getStatColor(agent.stats.hunger)}`}
                style={{ width: `${Math.max(4, Math.min(100, agent.stats.hunger))}%` }}
              />
            </div>
          </div>

          {/* Mood */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Smile className="w-3.5 h-3.5 text-amber-400" />
                Mood
              </span>
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(agent.stats.mood)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${getStatColor(agent.stats.mood)}`}
                style={{ width: `${Math.max(4, Math.min(100, agent.stats.mood))}%` }}
              />
            </div>
          </div>

          {/* Social */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Users className="w-3.5 h-3.5 text-pink-400" />
                Social Connection
              </span>
              <span className="font-mono tabular-nums text-slate-200">
                {Math.round(agent.stats.social)}%
              </span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${getStatColor(agent.stats.social)}`}
                style={{ width: `${Math.max(4, Math.min(100, agent.stats.social))}%` }}
              />
            </div>
          </div>

          {/* Wallet / Money & Circular Economy Ledger */}
          <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Wallet Capital
              </span>
              <span className="font-mono font-bold text-emerald-400 text-sm tabular-nums">
                ${Math.round(agent.stats.money)}
              </span>
            </div>

            {/* Public vs Private Sector Classification */}
            <div className="pt-1.5 border-t border-slate-700/60 space-y-1 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Economic Sector:</span>
                <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[10px] uppercase border ${
                  agent.employerSector === 'public'
                    ? 'bg-indigo-950 text-indigo-300 border-indigo-700/50'
                    : 'bg-amber-950 text-amber-300 border-amber-700/50'
                }`}>
                  {agent.employerSector === 'public' ? '🏛️ Public Municipal' : '💼 Private Market'}
                </span>
              </div>

              {agent.isBusinessOwner && (
                <div className="flex items-center justify-between text-amber-300">
                  <span className="text-slate-400">Enterprise:</span>
                  <span className="font-semibold text-[11px] truncate max-w-[170px]">
                    👑 Owner of {agent.ownedLocationId?.replace('_', ' ')}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px]">
                <div className="p-1 rounded bg-slate-900 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Taxes Paid:</span>
                  <span className="font-mono font-bold text-amber-400">
                    ${Math.round(agent.taxesPaidTotal || 0)}
                  </span>
                </div>
                <div className="p-1 rounded bg-slate-900 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-400">Today's Net:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    +${Math.round(agent.earningsToday || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Social Trust Matrix */}
        {trustEntries.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              Interpersonal Trust Matrix
            </h3>
            <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-none pr-1">
              {trustEntries.map(([targetId, score]) => (
                <div key={targetId} className="flex items-center justify-between text-xs p-1.5 bg-slate-800/60 rounded border border-slate-700/40">
                  <span className="text-slate-300 font-mono text-[11px] truncate">{targetId.replace('agent_', '')}</span>
                  <span className={`font-mono font-bold text-[11px] ${score >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {score >= 0 ? `+${score} Trust` : `${score} Distrust`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* God Mode & Builder Directives */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Interventions & Jobs
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onGiveMoney(agent.id, 50)}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs rounded-lg border border-slate-700/60 transition-colors"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Give +$50</span>
            </button>
            <button
              onClick={() => onInspire(agent.id)}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs rounded-lg border border-slate-700/60 transition-colors"
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              <span>Inspire (+Mood)</span>
            </button>
          </div>

          {/* Send to Location dropdown/buttons */}
          <div className="pt-1">
            <label className="text-[11px] text-slate-400 block mb-1">
              {agent.role === 'builder' ? 'Assign Construction Plot / Location:' : 'Dispatch to Location:'}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {CITY_LOCATIONS.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => onDirectLocation(agent.id, loc.id)}
                  className={`p-1.5 rounded-md text-[11px] text-center border truncate transition-colors ${
                    loc.type === 'construction_site'
                      ? 'bg-amber-950/70 border-amber-500/60 text-amber-300 font-semibold hover:bg-amber-900'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700/40'
                  }`}
                  title={`Send ${agent.name} to ${loc.name}`}
                >
                  {loc.signEmoji} {loc.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Episodic Memory Stream */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-sky-400" />
              Memory Stream ({agent.memoryStream.length})
            </h3>
          </div>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-800/90 rounded-lg text-[11px] overflow-x-auto scrollbar-none">
            {(['all', 'social', 'moral', 'build', 'event'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setMemoryFilter(tab)}
                className={`px-2.5 py-1 capitalize rounded-md whitespace-nowrap transition-colors ${
                  memoryFilter === tab
                    ? 'bg-slate-700 text-amber-300 font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Memory Log Entries */}
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {filteredMemories.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center italic">
                No memories recorded in this category yet.
              </p>
            ) : (
              filteredMemories.map(mem => (
                <div 
                  key={mem.id}
                  className="p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/40 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono tabular-nums">{mem.timeString} · Day {mem.day}</span>
                    <span className="capitalize text-slate-500">{mem.category}</span>
                  </div>
                  <p className="text-slate-200 text-xs leading-snug">
                    {mem.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
