/**
 * ============================================================================
 *  APP — the top-level layout & cross-cutting wiring
 * ============================================================================
 *
 *  Layout (top → bottom):
 *    Canvas (the whole screen) → TopNav → Location Inspector (when clicked)
 *    → Agent Inspector (when a citizen is clicked) → Activity Ticker
 *    → Create-Citizen modal → City Gazette overlay.
 *
 *  Owns:
 *    • subscribes to globalSimulation for UI ticks (never mutates sim state)
 *    • AI status probe (Gemini vs Local badge in TopNav)
 *    • Gazette state: local generation via gazetteAnalyzer, async upgrade
 *      through /api/gazette when configured, mergeGazette() keeps local data
 *      as the reliable base and lets AI prose override the text.
 */
import React, { useEffect, useState } from 'react';
import { globalSimulation } from './simulation/simulationEngine';
import { CITY_LOCATIONS } from './simulation/cityMap';
import { CityCanvas } from './components/CityCanvas';
import { TopNav } from './components/TopNav';
import { AgentInspector } from './components/AgentInspector';
import { AgentCreatorModal } from './components/AgentCreatorModal';
import { CityGazetteModal } from './components/CityGazetteModal';
import { CityActivityTicker } from './components/CityActivityTicker';
import { GazetteEdition, GazetteStory, generateGazette } from './simulation/gazetteAnalyzer';
import { dialogueManager } from './simulation/agentDialogueManager';
import { AiStatus, GazetteAiResult, getAiStatus, requestGazette } from './services/aiService';
import { soundEngine } from './audio/soundEngine';
import { X, Send, Users, Sparkles } from 'lucide-react';

function mergeGazette(base: GazetteEdition, ai: GazetteAiResult): GazetteEdition {
  const validCategories: GazetteStory['category'][] = ['social', 'economy', 'health', 'civic'];
  const aiStories = (ai.stories || []).slice(0, 3).map((story, index) => {
    const fallback = base.stories[index] || base.stories[0];
    return {
      ...fallback,
      ...story,
      id: `ai_story_${index + 1}`,
      category: validCategories.includes(story.category as GazetteStory['category'])
        ? (story.category as GazetteStory['category'])
        : fallback.category,
    } as GazetteStory;
  });

  return {
    ...base,
    headlineOfTheDay: ai.headlineOfTheDay?.trim() || base.headlineOfTheDay,
    weatherSummary: ai.weatherSummary?.trim() || base.weatherSummary,
    stories: aiStories.length === 3 ? aiStories : base.stories,
    source: 'gemini',
  };
}

export default function App() {
  // Sync with global simulation state
  const [, setTick] = useState(0);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [inspectedLocationId, setInspectedLocationId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isGazetteOpen, setIsGazetteOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasSavedProgress, setHasSavedProgress] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'loaded' | 'error' | null>(null);
  const [language, setLanguage] = useState<'ar' | 'en'>(dialogueManager.getLanguage());
  const [aiStatus, setAiStatus] = useState<AiStatus>({
    configured: false,
    provider: 'local',
    model: null,
    reason: 'checking',
  });
  const [gazette, setGazette] = useState<GazetteEdition>(() =>
    generateGazette(globalSimulation.agents, globalSimulation.time, globalSimulation.notifications, dialogueManager.getLanguage())
  );
  const [isGazetteLoading, setIsGazetteLoading] = useState(false);

  useEffect(() => {
    // Restore the last life progression before starting the simulation loops.
    const restored = globalSimulation.loadProgress();
    setHasSavedProgress(globalSimulation.hasSavedProgress());
    if (restored) setTick(t => t + 1);

    // Subscribe before starting the simulation loops so no updates are missed.
    const unsubscribe = globalSimulation.subscribe(() => {
      setTick(t => t + 1);
    });

    globalSimulation.start();

    // Ask the server whether real Gemini is configured.
    void getAiStatus(true).then(setAiStatus);

    const persistProgress = () => {
      if (globalSimulation.saveProgress()) setHasSavedProgress(true);
    };
    const autosaveId = window.setInterval(persistProgress, 30_000);
    window.addEventListener('pagehide', persistProgress);

    return () => {
      window.clearInterval(autosaveId);
      window.removeEventListener('pagehide', persistProgress);
      persistProgress();
      unsubscribe();
      globalSimulation.stop();
    };
  }, []);

  useEffect(() => {
    if (!saveStatus) return;
    const timeoutId = window.setTimeout(() => setSaveStatus(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [saveStatus]);

  const selectedAgent = globalSimulation.agents.find(a => a.id === selectedAgentId) || null;
  const inspectedLocation = CITY_LOCATIONS.find(l => l.id === inspectedLocationId) || null;

  // Citizens currently at the inspected building
  const citizensAtBuilding = inspectedLocation
    ? globalSimulation.agents.filter(a => a.currentLocationId === inspectedLocation.id)
    : [];

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
  };

  const handleToggleLanguage = () => {
    const nextLang = language === 'ar' ? 'en' : 'ar';
    setLanguage(nextLang);
    dialogueManager.setLanguage(nextLang);
  };

  const handleSaveProgress = () => {
    const saved = globalSimulation.saveProgress();
    setHasSavedProgress(saved || globalSimulation.hasSavedProgress());
    setSaveStatus(saved ? 'saved' : 'error');
  };

  const handleLoadProgress = () => {
    const loaded = globalSimulation.loadProgress();
    setHasSavedProgress(globalSimulation.hasSavedProgress());
    setSaveStatus(loaded ? 'loaded' : 'error');
  };

  // Build the live fact sheet handed to Gemini. The local analyzer is always
  // rendered first, so the modal opens instantly even on a slow network.
  const buildGazettePayload = (base: GazetteEdition) => ({
    editionNumber: base.editionNumber,
    day: base.day,
    dateString: base.dateString,
    timeString: globalSimulation.time.timeString,
    weather: globalSimulation.weather,
    timeOfDay: globalSimulation.time.timeOfDay,
    language,
    population: globalSimulation.agents.length,
    treasury: Math.round(globalSimulation.urbanMetrics.cityTreasury),
    taxRate: Math.round(globalSimulation.urbanMetrics.taxRate * 100),
    metrics: {
      taxesCollectedToday: Math.round(globalSimulation.urbanMetrics.totalTaxesCollectedToday),
      publicExpenditureToday: Math.round(globalSimulation.urbanMetrics.totalPublicExpenditureToday),
      privateRevenueToday: Math.round(globalSimulation.urbanMetrics.totalPrivateRevenueToday),
      housingDeficit: Math.round(globalSimulation.urbanMetrics.housingDeficit),
      healthcareStrain: Math.round(globalSimulation.urbanMetrics.healthcareStrain),
      foodShortage: Math.round(globalSimulation.urbanMetrics.foodShortage),
      energyStrain: Math.round(globalSimulation.urbanMetrics.energyStrain),
      commercialDemand: Math.round(globalSimulation.urbanMetrics.commercialDemand),
    },
    quickStats: base.quickStats,
    citizens: globalSimulation.agents.slice(0, 40).map(a => ({
      name: a.name,
      profession: a.profession,
      mood: Math.round(a.stats.mood),
      money: Math.round(a.stats.money),
      memories: a.memoryStream.slice(0, 6).map(m => ({ category: m.category, text: m.text })),
    })),
    notifications: globalSimulation.notifications.slice(0, 20).map(n => ({
      type: n.type,
      message: n.message,
      icon: n.icon,
      timeString: n.timeString,
    })),
  });

  const handleOpenGazette = async () => {
    const base = generateGazette(
      globalSimulation.agents,
      globalSimulation.time,
      globalSimulation.notifications,
      language
    );
    setGazette(base);
    setIsGazetteOpen(true);

    const status = await getAiStatus();
    setAiStatus(status);
    if (!status.configured) return;

    setIsGazetteLoading(true);
    try {
      const ai = await requestGazette(buildGazettePayload(base));
      if (ai) setGazette(mergeGazette(base, ai));
    } finally {
      setIsGazetteLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. Sleek Compact Top Control Bar */}
      <TopNav
        time={globalSimulation.time}
        weather={globalSimulation.weather}
        isPaused={globalSimulation.isPaused}
        speed={globalSimulation.speedMultiplier}
        isMuted={isMuted}
        language={language}
        activeEvent={globalSimulation.activeEvent}
        showDensityHeatmap={globalSimulation.showDensityHeatmap}
        urbanMetrics={globalSimulation.urbanMetrics}
        zoning={globalSimulation.zoningSummary()}
        justice={globalSimulation.justiceSummary()}
        aiStatus={aiStatus}
        isGazetteLoading={isGazetteLoading}
        hasSavedProgress={hasSavedProgress}
        saveStatus={saveStatus}
        onTogglePlayPause={() => globalSimulation.togglePlayPause()}
        onSetSpeed={(speed) => globalSimulation.setSpeed(speed)}
        onToggleMute={handleToggleMute}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenGazette={handleOpenGazette}
        onToggleLanguage={handleToggleLanguage}
        onSaveProgress={handleSaveProgress}
        onLoadProgress={handleLoadProgress}
        onTriggerEvent={(type) => globalSimulation.triggerEvent(type)}
        onToggleDensityHeatmap={() => globalSimulation.toggleDensityHeatmap()}
        onCommissionProject={() => {
          const site = CITY_LOCATIONS.find(l => l.type === 'construction_site' && l.status !== 'completed');
          if (site) {
            globalSimulation.commissionConstruction(site.id);
            setInspectedLocationId(site.id);
          }
        }}
        onTriggerCrisis={() => globalSimulation.triggerInfrastructureCrisis()}
        onSetTaxRate={(rate) => globalSimulation.setTaxRate(rate)}
        onInjectStimulus={(amount) => globalSimulation.injectMunicipalStimulus(amount)}
      />

      {/* 2. Main Interactive Canvas Viewport (Maximized space, no borders) */}
      <main className="relative flex-1 w-full h-full overflow-hidden flex">
        <CityCanvas
          selectedAgentId={selectedAgentId}
          showDensityHeatmap={globalSimulation.showDensityHeatmap}
          onSelectAgent={(agentId) => {
            setSelectedAgentId(agentId);
            setInspectedLocationId(null);
          }}
          onSelectLocation={(locId) => {
            setInspectedLocationId(locId);
          }}
        />

        {/* Floating Building Inspector Card (when a building is clicked) */}
        {inspectedLocation && (
          <div className="absolute top-4 left-4 z-20 w-84 sm:w-96 bg-slate-900/98 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-4 text-xs space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-3xl">{inspectedLocation.signEmoji}</span>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-bold text-white text-sm">{inspectedLocation.name}</h3>
                    <span className={`text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded border ${
                      inspectedLocation.ownership === 'public'
                        ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                        : 'bg-amber-950 text-amber-300 border-amber-700/60'
                    }`}>
                      {inspectedLocation.ownership === 'public' ? '🏛️ Public Sector' : '💼 Private Market'}
                    </span>
                  </div>
                  <span className="text-amber-400 font-medium text-[11px] block mt-0.5">{inspectedLocation.perks}</span>
                </div>
              </div>
              <button
                onClick={() => setInspectedLocationId(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-300 leading-relaxed text-xs">
              {inspectedLocation.description}
            </p>

            {/* Economic & Sector Ownership Ledger */}
            <div className="p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Ownership / Authority:</span>
                <span className="font-semibold text-slate-200">
                  {inspectedLocation.ownerName || (inspectedLocation.ownership === 'public' ? 'Metropolis Municipality' : 'Private Syndicate')}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800/80 text-center text-[10px]">
                <div className="p-1 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Service Fee</span>
                  <span className="font-mono font-bold text-amber-300">
                    {inspectedLocation.servicePrice > 0 ? `$${inspectedLocation.servicePrice}` : 'Free'}
                  </span>
                </div>
                <div className="p-1 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Today's Revenue</span>
                  <span className="font-mono font-bold text-emerald-400">
                    +${Math.round(inspectedLocation.revenueToday || 0)}
                  </span>
                </div>
                <div className="p-1 rounded bg-slate-900 border border-slate-800">
                  <span className="text-slate-500 block">Customers</span>
                  <span className="font-mono font-bold text-sky-400">
                    {inspectedLocation.customersToday || 0}
                  </span>
                </div>
              </div>
              {inspectedLocation.fundingSource && (
                <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Financed By:</span>
                  <span className={`font-mono font-bold ${
                    inspectedLocation.fundingSource === 'treasury' ? 'text-indigo-300' : 'text-amber-300'
                  }`}>
                    {inspectedLocation.fundingSource === 'treasury' ? '🏛️ City Municipal Treasury' : `💼 Private Capital (${inspectedLocation.funderName || 'Investor'})`}
                  </span>
                </div>
              )}
            </div>

            {/* Dynamic Construction Status & Builder Commissioning for Construction Sites */}
            {inspectedLocation.type === 'construction_site' && (
              <div className="p-2.5 bg-slate-800/80 rounded-lg border border-amber-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Infrastructure Status
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                    inspectedLocation.status === 'damaged'
                      ? 'bg-rose-950 text-rose-300 border border-rose-600/50'
                      : inspectedLocation.status === 'completed'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/50'
                      : 'bg-amber-950 text-amber-300 border border-amber-600/50'
                  }`}>
                    {inspectedLocation.status === 'damaged' 
                      ? '⚠️ Damaged Grid' 
                      : inspectedLocation.status === 'completed'
                      ? '✅ Completed'
                      : '🔨 Under Construction'}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Build Progress:</span>
                    <span className="font-mono font-bold text-amber-300">{Math.round(inspectedLocation.buildProgress || 0)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        inspectedLocation.status === 'damaged'
                          ? 'bg-rose-500'
                          : inspectedLocation.buildProgress && inspectedLocation.buildProgress >= 100
                          ? 'bg-emerald-500'
                          : 'bg-amber-400'
                      }`}
                      style={{ width: `${Math.max(5, Math.min(100, inspectedLocation.buildProgress || 0))}%` }}
                    />
                  </div>
                </div>

                {inspectedLocation.status === 'damaged' ? (
                  <button
                    onClick={() => {
                      globalSimulation.repairInfrastructure(inspectedLocation.id);
                    }}
                    className="w-full py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span>🛠️ Dispatch Emergency Builder</span>
                  </button>
                ) : inspectedLocation.status !== 'completed' ? (
                  <button
                    onClick={() => {
                      globalSimulation.commissionConstruction(inspectedLocation.id);
                    }}
                    className="w-full py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span>🏗️ Commission Contractor ($180 - $240)</span>
                  </button>
                ) : (
                  <div className="text-emerald-400 font-semibold text-center text-[11px] py-0.5">
                    Civic Structure Active & Functional
                  </div>
                )}
              </div>
            )}

            {/* Occupants */}
            <div className="space-y-1 pt-1 border-t border-slate-800">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <Users className="w-3.5 h-3.5 text-sky-400" />
                Current Citizens Here ({citizensAtBuilding.length}):
              </span>
              {citizensAtBuilding.length === 0 ? (
                <span className="text-slate-500 italic block py-0.5">Quiet right now, no citizens present.</span>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {citizensAtBuilding.map(a => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelectedAgentId(a.id);
                        setInspectedLocationId(null);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 hover:border-amber-400"
                    >
                      <span>{a.avatarEmoji}</span>
                      <span>{a.name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Dispatch Selected Agent button if an agent is selected elsewhere */}
            {selectedAgent && selectedAgent.currentLocationId !== inspectedLocation.id && (
              <button
                onClick={() => {
                  globalSimulation.directAgent(selectedAgent.id, inspectedLocation.id);
                  setInspectedLocationId(null);
                }}
                className="w-full py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send {selectedAgent.name.split(' ')[0]} Here</span>
              </button>
            )}
          </div>
        )}

        {/* Selected Agent Inspector Side Drawer */}
        {selectedAgent && (
          <AgentInspector
            agent={selectedAgent}
            allAgents={globalSimulation.agents}
            currentDay={globalSimulation.time.day}
            onClose={() => setSelectedAgentId(null)}
            onDirectLocation={(agentId, locId) => globalSimulation.directAgent(agentId, locId)}
            onGiveMoney={(agentId, amount) => globalSimulation.giveMoneyToAgent(agentId, amount)}
            onInspire={(agentId) => globalSimulation.inspireAgent(agentId)}
          />
        )}
      </main>

      {/* 4. Bottom Activity Ticker & Citizen Switcher */}
      <CityActivityTicker
        agents={globalSimulation.agents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={(agentId) => {
          setSelectedAgentId(agentId);
          setInspectedLocationId(null);
        }}
        notifications={globalSimulation.notifications}
      />

      {/* 5. Create Citizen Modal */}
      <AgentCreatorModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSpawn={(data) => {
          const newAgent = globalSimulation.spawnCustomAgent(data);
          setSelectedAgentId(newAgent.id);
        }}
      />

      {/* 6. City Gazette 24-Hour Retrospective Overlay */}
      <CityGazetteModal
        isOpen={isGazetteOpen}
        onClose={() => {
          setIsGazetteOpen(false);
        }}
        gazette={gazette}
        isLoading={isGazetteLoading}
        aiProvider={gazette.source === 'gemini' ? 'gemini' : 'local'}
      />
    </div>
  );
}
