/**
 * ============================================================================
 *  SIMULATION ENGINE — the single source of truth for the whole city
 * ============================================================================
 *
 *  Everything the UI sees is read from this class; the renderer is read-only.
 *
 *  Loops (owned here, driven by start()):
 *    • LOGIC TICK   (1s, runs speedMultiplier times): each call to
 *      stepSimulation() advances the clock by 2 sim-minutes and runs the
 *      full agent pipeline:
 *          clock recompute → day transition (daily books + relationship
 *          heartbeat via processDailyRelationships) → event lifetime →
 *          expired bubbles → per-agent tickAgent() (speech/taxes/conversations
 *          + Gemini dialogue upgrade) → traffic heatmap samples → urban
 *          metrics → need-based urban planner (treasury & private funding).
 *    • MOVEMENT LOOP (requestAnimationFrame, ~60fps): delegate to
 *      movementSystem.advanceAllAgentMovement — the ONLY code that ever
 *      mutates agent x/y. Pausing freezes both loops.
 *
 *  Other responsibilities: notifications feed, god-mode tools (events, cash,
 *  inspiration, dispatch, tax sliders), construction commissioning, custom
 *  spawn, and the family feature set (applyRelationshipEvents, spawnNewborn,
 *  advanceDays fast-forward for verifying romances/pregnancies/births).
 */
import { 
  AgentData, 
  CityEvent, 
  SimulationTime, 
  SpeechBubble, 
  WeatherType,
  PersonalityTrait,
  LocationNode,
  TrafficPoint,
  UrbanPlanningMetrics,
  NeedCategory,
  BuildingNeedImpact
} from '../types/simulation';
import { createInitialAgents, tickAgent, createMemory, sendAgentToLocation, ConversationInfo } from './agentLogic';
import { CITY_LOCATIONS } from './cityMap';
import { auditPlan, auditSummary, plotSuitability, PlanFinding } from './urbanPlan';
import { soundEngine } from '../audio/soundEngine';
import { advanceAllAgentMovement } from './movementSystem';
import { TRAFFIC } from './vehicleSystem';
import { JUSTICE } from './justice';
import { HousingPlan, planHousing } from './housing';
import { ensurePsyche } from './psychology';
import { getAiStatus, requestDialogueEnhancement } from '../services/aiService';
import { dialogueManager } from './agentDialogueManager';
import {
  exportRelationships,
  importRelationships,
  inferGender,
  initializeRelationships,
  NewbornProfile,
  processDailyRelationships,
  reconcileRelationships,
  RelationshipEvent,
} from './relationships';

export interface ActivityNotification {
  id: string;
  timeString: string;
  /** Absolute simulation minute the notice was raised (for time-window queries). */
  totalMinutes: number;
  message: string;
  type: 'social' | 'event' | 'work' | 'godmode';
  icon: string;
}

type SavedLocationState = Pick<
  LocationNode,
  | 'id'
  | 'revenueToday'
  | 'customersToday'
  | 'demandScore'
  | 'fundingSource'
  | 'funderName'
  | 'ownerAgentId'
  | 'ownerName'
  | 'status'
  | 'buildProgress'
  | 'assignedBuilderId'
>;

interface SimulationSaveData {
  version: 1;
  savedAt: string;
  agents: AgentData[];
  time: SimulationTime;
  weather: WeatherType;
  activeEvent: CityEvent | null;
  notifications: ActivityNotification[];
  showDensityHeatmap: boolean;
  trafficHistory: TrafficPoint[];
  urbanMetrics: UrbanPlanningMetrics;
  isPaused: boolean;
  speedMultiplier: number;
  locations: SavedLocationState[];
  /** Serialized relationship store — bonds are NOT part of AgentData. */
  relationships?: unknown;
}

const SAVE_STORAGE_KEY = 'agentville.simulation-progress.v1';

export class SimulationEngine {
  public agents: AgentData[] = [];
  public time: SimulationTime;
  public weather: WeatherType = 'sunny';
  public activeEvent: CityEvent | null = null;
  public activeSpeechBubbles: SpeechBubble[] = [];
  public notifications: ActivityNotification[] = [];
  public showDensityHeatmap: boolean = false;
  public trafficHistory: TrafficPoint[] = [];
  /** Latest housing allocation (units, households, homeless). */
  public housing: HousingPlan | null = null;
  /** Short-lived world-space badges (births, promotions…) drawn by the canvas. */
  public celebrations: Array<{ x: number; y: number; icon: string; until: number }> = [];

  // Public vs Private Sector Economics & Need-Based Urban Planning
  public urbanMetrics: UrbanPlanningMetrics = {
    cityTreasury: 12500,
    taxRate: 0.12, // 12% income tax
    salesTaxRate: 0.05, // 5% sales tax
    totalTaxesCollectedToday: 0,
    totalPublicExpenditureToday: 0,
    totalPrivateRevenueToday: 0,
    housingDeficit: 35,
    healthcareStrain: 28,
    foodShortage: 20,
    energyStrain: 25,
    commercialDemand: 42,
  };
  
  public isPaused: boolean = false;
  public speedMultiplier: number = 1; // 1x, 2x, 5x, 10x
  
  private tickIntervalId: number | null = null;
  private movementFrameId: number | null = null;
  private lastMovementTs = 0;
  private aiInFlight = false;
  private lastAiRequestAt = 0;
  private onStateChangeListeners: (() => void)[] = [];

  constructor() {
    this.time = {
      totalMinutes: 8 * 60 + 30, // Starts at 08:30 AM
      day: 1,
      hour: 8,
      minute: 30,
      timeString: '08:30 AM',
      timeOfDay: 'day',
      lightLevel: 0.9,
    };

    this.agents = createInitialAgents(this.time);
    initializeRelationships(this.agents, this.time);
    
    // Seed initial 10-minute traffic points around initial agent positions
    this.agents.forEach(agent => {
      for (let m = 0; m < 5; m++) {
        this.trafficHistory.push({
          x: agent.x + (Math.random() - 0.5) * 18,
          y: agent.y + (Math.random() - 0.5) * 18,
          weight: 2.2,
          simMinute: this.time.totalMinutes - m,
          isSocial: true
        });
      }
    });

    this.addNotification(`Metropolis awakened! ${this.agents.length} autonomous citizens active across 6 districts.`, 'event', '🏙️');
  }

  public subscribe(listener: () => void) {
    this.onStateChangeListeners.push(listener);
    return () => {
      this.onStateChangeListeners = this.onStateChangeListeners.filter(l => l !== listener);
    };
  }

  /** Fan the new engine state out to every subscribed UI listener. */
  private notify() {
    this.onStateChangeListeners.forEach(fn => fn());
  }

  // -----------------------------------------------------------------------
  // CLOCK HELPERS (shared by the live loop and fast-forward)
  // -----------------------------------------------------------------------

  /**
   * Recompute every DERIVED clock field from `totalMinutes` — the single
   * master clock (per the types/simulation.ts convention): day, hour, minute,
   * display string, timeOfDay band and scene lightLevel.
   */
  private reconcileClockFromTotalMinutes(): void {
    const totalHours = Math.floor(this.time.totalMinutes / 60);
    this.time.day = Math.floor(totalHours / 24) + 1;
    this.time.hour = totalHours % 24;
    this.time.minute = this.time.totalMinutes % 60;

    const period = this.time.hour >= 12 ? 'PM' : 'AM';
    const displayHour = this.time.hour % 12 === 0 ? 12 : this.time.hour % 12;
    const displayMinute = `${this.time.minute}`.padStart(2, '0');
    this.time.timeString = `${displayHour}:${displayMinute} ${period}`;

    if (this.time.hour >= 6 && this.time.hour < 11) {
      this.time.timeOfDay = 'dawn';
      this.time.lightLevel = 0.5 + ((this.time.hour - 6) / 5) * 0.45; // sunrise ramp
    } else if (this.time.hour >= 11 && this.time.hour < 17) {
      this.time.timeOfDay = 'day';
      this.time.lightLevel = 0.95;
    } else if (this.time.hour >= 17 && this.time.hour < 21) {
      this.time.timeOfDay = 'sunset';
      this.time.lightLevel = 0.95 - ((this.time.hour - 17) / 4) * 0.55; // dusk ramp
    } else {
      this.time.timeOfDay = 'night';
      this.time.lightLevel = 0.22;
    }
  }

  /**
   * Zero all DAILY counters the moment a new simulation day begins: venue
   * takings, per-citizen earnings and the municipal books. This is what makes
   * "today" mean anything at all in the economy.
   */
  private resetDailyBooks(): void {
    CITY_LOCATIONS.forEach(l => {
      l.revenueToday = 0;
      l.customersToday = 0;
    });
    this.agents.forEach(a => {
      a.earningsToday = 0;
    });
    this.urbanMetrics.totalTaxesCollectedToday = 0;
    this.urbanMetrics.totalPublicExpenditureToday = 0;
    this.urbanMetrics.totalPrivateRevenueToday = 0;
  }

  /** Bind the two engine loops. Safe to call repeatedly (stops first). */
  public start() {
    this.stop();

    // Decoupled logic tick: one second of real time = `speedMultiplier`
    // cognitive steps (each step = 2 simulation minutes). This makes the speed
    // buttons accelerate the whole simulation, not just the clock.
    this.tickIntervalId = window.setInterval(() => {
      if (this.isPaused) return;
      const steps = Math.max(1, Math.round(this.speedMultiplier));
      for (let i = 0; i < steps; i++) {
        this.stepSimulation(i === steps - 1);
      }
    }, 1000);

    // High-frequency movement loop. The renderer never mutates agents.
    this.lastMovementTs = 0;
    const movementLoop = (timestamp: number) => {
      const deltaMs = this.lastMovementTs === 0 ? 16 : timestamp - this.lastMovementTs;
      this.lastMovementTs = timestamp;

      if (!this.isPaused) {
        TRAFFIC.step(deltaMs, {
          speedMultiplier: this.speedMultiplier,
          activeEvent: this.activeEvent,
          agents: this.agents,
        });
        for (const agent of this.agents) {
          if (agent.jailedUntil != null && this.time.day < agent.jailedUntil) agent.state = 'CIVIC';
        }
        const arrived = advanceAllAgentMovement(this.agents, deltaMs, this.time, this.speedMultiplier);
        if (arrived.length > 0) this.notify();
      }

      this.movementFrameId = window.requestAnimationFrame(movementLoop);
    };
    this.movementFrameId = window.requestAnimationFrame(movementLoop);
  }

  public stop() {
    if (this.tickIntervalId !== null) {
      clearInterval(this.tickIntervalId);
      this.tickIntervalId = null;
    }
    if (this.movementFrameId !== null) {
      cancelAnimationFrame(this.movementFrameId);
      this.movementFrameId = null;
    }
    this.lastMovementTs = 0;
  }

  /** Save the complete persistent city state in this browser. */
  public saveProgress(): boolean {
    try {
      const saveData: SimulationSaveData = {
        version: 1,
        savedAt: new Date().toISOString(),
        agents: this.agents,
        time: this.time,
        weather: this.weather,
        activeEvent: this.activeEvent,
        notifications: this.notifications,
        showDensityHeatmap: this.showDensityHeatmap,
        trafficHistory: this.trafficHistory,
        urbanMetrics: this.urbanMetrics,
        isPaused: this.isPaused,
        speedMultiplier: this.speedMultiplier,
        relationships: exportRelationships(),
        locations: CITY_LOCATIONS.map(location => ({
          id: location.id,
          revenueToday: location.revenueToday,
          customersToday: location.customersToday,
          demandScore: location.demandScore,
          fundingSource: location.fundingSource,
          funderName: location.funderName,
          ownerAgentId: location.ownerAgentId,
          ownerName: location.ownerName,
          status: location.status,
          buildProgress: location.buildProgress,
          assignedBuilderId: location.assignedBuilderId,
        })),
      };

      window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saveData));
      return true;
    } catch {
      // Storage can be unavailable or full; leave the live simulation running.
      return false;
    }
  }

  /** Restore the last saved city state. Returns false if no valid save exists. */
  public loadProgress(): boolean {
    let saveData: SimulationSaveData;
    try {
      const rawSave = window.localStorage.getItem(SAVE_STORAGE_KEY);
      if (!rawSave) return false;

      const parsed = JSON.parse(rawSave) as SimulationSaveData;
      const validWeather: WeatherType[] = ['sunny', 'rainy', 'storm', 'snow', 'blizzard', 'cloudy'];
      if (
        parsed?.version !== 1 ||
        !Array.isArray(parsed.agents) ||
        !parsed.agents.every(agent => agent && typeof agent.id === 'string' && agent.stats) ||
        !parsed.time ||
        !Number.isFinite(parsed.time.totalMinutes) ||
        !validWeather.includes(parsed.weather) ||
        !Array.isArray(parsed.notifications) ||
        !Array.isArray(parsed.trafficHistory) ||
        !Array.isArray(parsed.locations) ||
        !parsed.urbanMetrics ||
        typeof parsed.isPaused !== 'boolean' ||
        ![1, 2, 5, 10].includes(parsed.speedMultiplier)
      ) {
        return false;
      }
      saveData = parsed;
    } catch {
      return false;
    }

    const wasRunning = this.tickIntervalId !== null || this.movementFrameId !== null;
    if (wasRunning) this.stop();

    this.agents = saveData.agents;
    // Bonds are stored separately from citizens: restore them (or rebuild the
    // ones implied by spouseId/partnerId for saves written by older builds).
    if (!importRelationships(saveData.relationships, this.agents)) {
      reconcileRelationships(this.agents);
    }
    this.time = { ...saveData.time };
    this.reconcileClockFromTotalMinutes();
    this.weather = saveData.weather;
    this.activeEvent = saveData.activeEvent;
    this.activeSpeechBubbles = [];
    this.notifications = saveData.notifications.slice(0, 40);
    this.showDensityHeatmap = saveData.showDensityHeatmap;
    this.trafficHistory = saveData.trafficHistory;
    this.urbanMetrics = { ...this.urbanMetrics, ...saveData.urbanMetrics };
    this.isPaused = saveData.isPaused;
    this.speedMultiplier = saveData.speedMultiplier;

    for (const savedLocation of saveData.locations) {
      const location = CITY_LOCATIONS.find(candidate => candidate.id === savedLocation.id);
      if (!location) continue;
      location.revenueToday = savedLocation.revenueToday;
      location.customersToday = savedLocation.customersToday;
      location.demandScore = savedLocation.demandScore;
      location.fundingSource = savedLocation.fundingSource;
      location.funderName = savedLocation.funderName;
      location.ownerAgentId = savedLocation.ownerAgentId;
      location.ownerName = savedLocation.ownerName;
      location.status = savedLocation.status;
      location.buildProgress = savedLocation.buildProgress;
      location.assignedBuilderId = savedLocation.assignedBuilderId;
    }

    if (wasRunning) this.start();
    this.notify();
    return true;
  }

  public hasSavedProgress(): boolean {
    try {
      return window.localStorage.getItem(SAVE_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  public togglePlayPause() {
    this.isPaused = !this.isPaused;
    this.lastMovementTs = 0;
    this.notify();
  }

  public setSpeed(multiplier: number) {
    this.speedMultiplier = multiplier;
    this.notify();
  }

  // Progress time & cognitive ticks
  public stepSimulation(notifyUi: boolean = true) {
    // 1. Advance simulation clock. One cognitive step = 2 simulation minutes;
    // the outer 1-second timer runs `speedMultiplier` steps per second.
    const minutesToAdd = 2;
    this.time.totalMinutes += minutesToAdd;
    const prevDay = this.time.day;
    this.reconcileClockFromTotalMinutes();

    // Day transition: reconcile municipal books & reset daily counters,
    // then run the once-per-day human life heartbeat (family events).
    if (this.time.day !== prevDay) {
      this.resetDailyBooks();
      this.addNotification(`🌅 Day ${this.time.day} begins: Daily municipal accounts balanced.`, 'event', '🏛️');

      // Daily human life: relationship decay & milestones, courtship progress,
      // family planning, pregnancies reaching term and births.
      const familyEvents = processDailyRelationships(this.agents, this.time);
      this.applyRelationshipEvents(familyEvents);

      // Housing market: collect instalments, then react to any shortage.
      this.collectMortgages();
      this.housingPressure();
    }

    // 2. Manage active event duration
    if (this.activeEvent) {
      this.activeEvent.duration -= minutesToAdd;
      if (this.activeEvent.duration <= 0) {
        this.addNotification(`Global Event "${this.activeEvent.name}" has concluded.`, 'event', '✨');
        this.activeEvent = null;
        if (this.weather === 'storm' || this.weather === 'rainy' || this.weather === 'snow' || this.weather === 'blizzard') {
          this.weather = 'sunny';
        }
      }
    }

    // 3. Prune expired speech bubbles
    const now = Date.now();
    this.activeSpeechBubbles = this.activeSpeechBubbles.filter(
      b => now - b.startTime < b.duration
    );
    this.celebrations = this.celebrations.filter(c => c.until > now);

    // 4. Tick all Agents on Logic Loop & Reconcile Economic Flow
    for (const agent of this.agents) {
      // Citizens in detention are out of circulation until released.
      if (agent.jailedUntil != null && this.time.day < agent.jailedUntil) {
        agent.state = 'CIVIC';
        agent.currentLocationId = 'police';
        continue;
      }
      const { speechToAdd, soundToPlay, notification, economicDelta, conversation, relationshipEvents } = tickAgent(
        agent,
        this.agents,
        this.time,
        this.activeEvent,
        this.activeSpeechBubbles,
        {
          incomeTaxRate: this.urbanMetrics.taxRate,
          salesTaxRate: this.urbanMetrics.salesTaxRate,
          minutesAdvanced: minutesToAdd,
        }
      );

      // Accumulate real-time taxes, public expenditures and private commercial profits
      if (economicDelta) {
        const taxCollected = (economicDelta.incomeTax || 0) + (economicDelta.salesTax || 0);
        this.urbanMetrics.totalTaxesCollectedToday += taxCollected;
        this.urbanMetrics.cityTreasury += taxCollected + (economicDelta.publicRevenue || 0);
        this.urbanMetrics.totalPublicExpenditureToday += (economicDelta.publicExpense || 0);
        this.urbanMetrics.cityTreasury = Math.max(0, this.urbanMetrics.cityTreasury - (economicDelta.publicExpense || 0));
        this.urbanMetrics.totalPrivateRevenueToday += (economicDelta.privateRevenue || 0);
      }

      if (speechToAdd.length > 0) {
        this.activeSpeechBubbles.push(...speechToAdd);
        const speaker = agent.name;
        this.addNotification(`${speaker}: "${speechToAdd[0].text}"`, 'social', '💬');

        // Upgrade the template exchange with real Gemini dialogue when the
        // server has an API key. Moral dilemmas keep their authored text.
        if (conversation && !conversation.isMoral) {
          void this.enhanceDialogueWithGemini(agent, conversation, speechToAdd);
        }
      }

      if (notification) {
        this.addNotification(notification, 'work', '👷');
      }

      if (relationshipEvents && relationshipEvents.length > 0) {
        this.applyRelationshipEvents(relationshipEvents);
      }

      if (soundToPlay === 'chat') soundEngine.playChatChime();
      else if (soundToPlay === 'coin') soundEngine.playCoinSound();
      else if (soundToPlay === 'coffee') soundEngine.playCoffeeChime();
    }

    // 4.5 JUSTICE — psychology, crime, police response, detention.
    // Crimes are committed by citizens whose psyche tipped over; officers are
    // dispatched physically and the outcome (arrest/escape) changes the city.
    const justiceEvents = JUSTICE.tick(this.agents, this.time);
    for (const event of justiceEvents) {
      const type = event.kind === 'arrest' || event.kind === 'crime' ? 'event' : 'social';
      this.addNotification(event.message, type, event.icon);
      if (event.fine) this.urbanMetrics.cityTreasury += event.fine;
    }

    // 5. Track Citizen Traffic & Social Density
    for (const agent of this.agents) {
      const isSocial = agent.state === 'CHATTING' || agent.state === 'EATING' || agent.state === 'RELAXING';
      const weight = isSocial ? 2.8 : agent.state === 'TRAVELING' ? 1.0 : 1.4;
      this.trafficHistory.push({
        x: agent.x,
        y: agent.y,
        weight,
        simMinute: this.time.totalMinutes,
        isSocial
      });
    }

    // Prune traffic older than 10 simulation minutes
    const tenMinCutoff = this.time.totalMinutes - 10;
    this.trafficHistory = this.trafficHistory.filter(p => p.simMinute >= tenMinCutoff);
    if (this.trafficHistory.length > 2000) {
      this.trafficHistory = this.trafficHistory.slice(this.trafficHistory.length - 2000);
    }

    // 6. Update Live Urban Deficits & Trigger Need-Based Municipal/Private Zoning
    this.refreshHousing();
    this.updateUrbanPlanningMetrics();
    this.runNeedBasedUrbanPlanner();

    // Notify UI for inspector updates periodically (once per timer burst).
    if (notifyUi) this.notify();
  }

  /**
   * Replace a template conversation with a Gemini-authored exchange.
   * Failures are silent: the local template stays on screen, so the
   * simulation never depends on network availability.
   */
  private async enhanceDialogueWithGemini(
    agent: AgentData,
    conversation: ConversationInfo,
    bubbles: SpeechBubble[]
  ) {
    if (this.aiInFlight) return;
    const now = Date.now();
    if (now - this.lastAiRequestAt < 3000) return;

    const status = await getAiStatus();
    if (!status.configured) return;

    const partner = this.agents.find(a => a.id === conversation.partnerId);
    if (!partner) return;

    this.aiInFlight = true;
    this.lastAiRequestAt = Date.now();
    try {
      // Give the model the same inner context the local mind generator uses,
      // so an upgraded line stays in character for THAT citizen.
      const mindBrief = (a: AgentData, b: AgentData) => ({
        name: a.name,
        profession: a.profession,
        personality: a.personality,
        moralAlignment: a.moralAlignment,
        age: a.age,
        mood: Math.round(a.stats.mood),
        energy: Math.round(a.stats.energy),
        hunger: Math.round(a.stats.hunger),
        money: Math.round(a.stats.money),
        stress: Math.round(a.psyche?.stress ?? 0),
        hope: Math.round(a.psyche?.hope ?? 0),
        values: a.psyche?.values ?? null,
        recentMemory: a.memoryStream[0]?.text ?? null,
        bondWithOther: a.spouseId === b.id ? 'spouse' : a.partnerId === b.id ? 'partner' : 'acquaintance',
      });

      const result = await requestDialogueEnhancement({
        agentA: mindBrief(agent, partner),
        agentB: mindBrief(partner, agent),
        locationType: conversation.locationType,
        locationName: conversation.locationName,
        event: this.activeEvent?.name ?? null,
        weather: this.weather,
        timeOfDay: this.time.timeOfDay,
        language: dialogueManager.getLanguage(),
      });

      if (!result) return;
      const [bubbleA, bubbleB] = bubbles;
      if (bubbleA && this.activeSpeechBubbles.includes(bubbleA)) {
        bubbleA.text = result.textA;
        bubbleA.startTime = Date.now();
        bubbleA.duration = 8000;
      }
      if (bubbleB && this.activeSpeechBubbles.includes(bubbleB)) {
        bubbleB.text = result.textB;
        bubbleB.startTime = Date.now() + 400;
        bubbleB.duration = 8000;
      }
      this.notify();
    } catch {
      // Network/API error: keep the deterministic local dialogue.
    } finally {
      this.aiInFlight = false;
    }
  }

  // -----------------------------------------------------------------------
  // CORPORATE ECONOMICS — live deficit metrics feeding the urban planner
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // HOUSING — capacity, allocation and the pressure to build
  // -----------------------------------------------------------------------

  private refreshHousing() {
    const plan = planHousing(this.agents, CITY_LOCATIONS);
    this.housing = plan;

    const housed = new Set<string>();
    const unitByAgent = new Map<string, string>();
    for (const unit of plan.units) {
      for (const id of unit.occupants) {
        housed.add(id);
        unitByAgent.set(id, `${unit.label} (${unit.occupants.length}/${unit.capacity})`);
      }
    }
    for (const agent of this.agents) {
      agent.housing = housed.has(agent.id) ? 'housed' : 'homeless';
      agent.housingUnit = unitByAgent.get(agent.id);
    }
  }

  /** Instalments for government-built homes flow back into the treasury. */
  private collectMortgages() {
    for (const agent of this.agents) {
      const mortgage = agent.mortgage;
      if (!mortgage || mortgage.remaining <= 0) continue;
      const pay = Math.min(mortgage.daily, agent.stats.money);
      if (pay <= 0) {
        agent.stats.mood = Math.max(0, agent.stats.mood - 2);
        ensurePsyche(agent).stress = Math.min(100, (agent.psyche?.stress ?? 40) + 2);
        continue;
      }
      agent.stats.money -= pay;
      mortgage.remaining = Math.max(0, mortgage.remaining - pay);
      this.urbanMetrics.cityTreasury += pay;
      if (mortgage.remaining <= 0) {
        agent.mortgage = null;
        this.addNotification(`🏠 ${agent.name} finished paying off their home.`, 'event', '🏠');
      }
    }
  }

  /**
   * Shortage response, in the brief's priority order:
   *   municipal treasury → private investor → government loan with instalments.
   * If no plot is free, the city says so instead of silently crowding people.
   */
  private housingPressure() {
    const plan = this.housing;
    if (!plan || plan.homeless.length === 0) return;

    const homelessCount = plan.homeless.reduce((sum, household) => sum + household.size, 0);
    const site = CITY_LOCATIONS.find(l => l.id === 'site_condo');
    if (!site || site.status !== 'planned') {
      this.addNotification(
        `🏠 ${homelessCount} citizen(s) have no home. No free residential plot — the city must expand.`,
        'event',
        '🏠',
      );
      return;
    }

    const cost = site.constructionCost ?? 900;
    const investor = this.agents
      .filter(a => a.stats.money >= cost + 80 && !a.mortgage)
      .sort((a, b) => b.stats.money - a.stats.money)[0];

    if (this.urbanMetrics.cityTreasury >= cost) {
      site.fundingSource = 'treasury';
      site.funderName = 'Municipal Housing Programme';
      this.urbanMetrics.cityTreasury -= cost;
      this.urbanMetrics.totalPublicExpenditureToday += cost;
      this.commissionConstruction(site.id);
      this.addNotification(
        `🏛️ Municipal housing programme: ${homelessCount} homeless citizen(s) — ${site.name} commissioned.`,
        'event',
        '🏠',
      );
      return;
    }

    if (investor) {
      investor.stats.money -= cost;
      site.fundingSource = 'private_capital';
      site.funderName = investor.name;
      site.ownerAgentId = investor.id;
      this.commissionConstruction(site.id);
      this.addNotification(
        `💼 ${investor.name} is building ${site.name} to house ${homelessCount} citizen(s).`,
        'work',
        '🏠',
      );
      return;
    }

    const family = plan.homeless[0];
    const payer = this.agents.find(agent => agent.id === family.memberIds[0]);
    if (!payer) return;

    payer.mortgage = { remaining: cost, daily: Math.ceil(cost / 120) };
    site.fundingSource = 'treasury';
    site.funderName = `Housing loan — ${payer.name}`;
    this.commissionConstruction(site.id);
    this.addNotification(
      `🏦 ${payer.name}'s family gets a home on credit: $${cost} repaid at $${Math.ceil(cost / 120)}/day.`,
      'event',
      '🏠',
    );
  }

  /**
   * Recompute the five live city deficits (housing, healthcare, food, energy,
   * commercial demand) from REAL population + infrastructure state, so the
   * need-based planner below can react to actual citizen suffering rather
   * than random numbers. Minimum values keep bars from hitting rock bottom.
   */
  public updateUrbanPlanningMetrics() {
    const pop = this.agents.length || 1;
    let totalEnergy = 0;
    let totalHunger = 0;
    let totalMood = 0;
    let totalMoney = 0;
    let crisisAgentsCount = 0;

    for (const a of this.agents) {
      totalEnergy += a.stats.energy;
      totalHunger += a.stats.hunger;
      totalMood += a.stats.mood;
      totalMoney += a.stats.money;
      if (a.stats.energy < 25 || a.stats.hunger < 25) {
        crisisAgentsCount++;
      }
    }

    const avgEnergy = totalEnergy / pop;
    const avgHunger = totalHunger / pop;
    const avgMood = totalMood / pop;

    // 1. Housing Deficit: unit capacity vs real households (housing.ts)
    const plan = this.housing;
    const homelessPeople = plan ? plan.homeless.reduce((sum, household) => sum + household.size, 0) : 0;
    const housingCapacity = plan ? plan.totalBeds : pop;
    const capacityRatio = Math.max(0, (pop - housingCapacity) / pop);
    this.urbanMetrics.housingDeficit = Math.min(
      100,
      Math.max(10, Math.round(capacityRatio * 70 + (homelessPeople / pop) * 100 + (100 - avgEnergy) * 0.3)),
    );

    // 2. Healthcare Strain: Average fatigue, crisis counts, hospital load
    const hospital = CITY_LOCATIONS.find(l => l.id === 'hospital');
    const hospitalCustomers = hospital?.customersToday || 0;
    this.urbanMetrics.healthcareStrain = Math.min(
      100, 
      Math.max(8, Math.round((100 - avgEnergy) * 0.6 + (crisisAgentsCount / pop) * 40 + Math.min(25, hospitalCustomers * 2)))
    );

    // 3. Food Shortage / Food Security Strain:
    this.urbanMetrics.foodShortage = Math.min(100, Math.max(5, Math.round((100 - avgHunger) * 1.1)));

    // 4. Energy & Infrastructure Strain:
    const solarSite = CITY_LOCATIONS.find(l => l.id === 'site_solar');
    let baseEnergyStrain = 20;
    if (solarSite?.status === 'damaged') baseEnergyStrain = 90;
    else if (solarSite?.status === 'under_construction') baseEnergyStrain = 55;
    else if (solarSite?.status === 'planned') baseEnergyStrain = 70;
    else if (solarSite?.status === 'completed') baseEnergyStrain = 12;
    if (this.activeEvent?.type === 'power_outage') baseEnergyStrain = 95;
    this.urbanMetrics.energyStrain = baseEnergyStrain;

    // 5. Commercial & Innovation Demand:
    const completedTech = CITY_LOCATIONS.filter(l => l.id === 'site_tech' && l.status === 'completed').length;
    this.urbanMetrics.commercialDemand = Math.min(
      100, 
      Math.max(15, Math.round((100 - avgMood) * 0.5 + (completedTech === 0 ? 25 : 5) + Math.min(30, (totalMoney / (pop * 200)) * 30)))
    );
  }

  // -----------------------------------------------------------------------
  // NEED-BASED URBAN PLANNER — the city that builds itself when it hurts
  // -----------------------------------------------------------------------

  /**
   * Runs every 10 simulation minutes. Uses a priority-based system where
   * the city evaluates all active citizen needs and commissions construction
   * of buildings that directly address the most urgent deficits.
   *
   * PLANNING LOGIC:
   * 1. Calculate need urgency from citizen metrics (hunger, energy, mood, etc.)
   * 2. Score each available building plot by how well it addresses top needs
   * 3. Public plots (treasury-funded) address societal needs
   * 4. Private plots (capital-funded) address economic/innovation needs
   * 5. Build the highest-scoring eligible plot
   *
   * This replaces fixed-threshold checking with dynamic need-based decisions.
   */
  public runNeedBasedUrbanPlanner() {
    // Evaluates every 10 simulation minutes
    if (this.time.minute % 10 !== 0) return;

    const pop = this.agents.length || 1;

    // ---- Step 1: Recalculate all need metrics from citizen state ----
    let totalEnergy = 0;
    let totalHunger = 0;
    let totalMood = 0;
    let crisisAgentsCount = 0;

    for (const a of this.agents) {
      totalEnergy += a.stats.energy;
      totalHunger += a.stats.hunger;
      totalMood += a.stats.mood;
      if (a.stats.energy < 25 || a.stats.hunger < 25) {
        crisisAgentsCount++;
      }
    }

    const avgEnergy = totalEnergy / pop;
    const avgHunger = totalHunger / pop;
    const avgMood = totalMood / pop;

    // Compute five need urgenceis (0-100, higher = more urgent)
    // Housing: unit capacity from the housing model, not a fixed beds-per-building guess
    const plan = this.housing;
    const homelessPeople = plan ? plan.homeless.reduce((sum, household) => sum + household.size, 0) : 0;
    const housingCapacity = plan ? plan.totalBeds : 0;
    const housingDeficit = Math.min(100, Math.round((Math.max(0, pop - housingCapacity) / Math.max(1, pop)) * 100 + (homelessPeople / Math.max(1, pop)) * 60));

    // Healthcare: combination of low energy, crisis agents, hospital load
    const hospital = CITY_LOCATIONS.find(l => l.id === 'hospital');
    const hospitalCustomers = hospital?.customersToday || 0;
    const healthcareStrain = Math.min(
      100,
      Math.max(8, Math.round((100 - avgEnergy) * 0.6 + (crisisAgentsCount / pop) * 40 + Math.min(25, hospitalCustomers * 2)))
    );

    // Food: inverse of average hunger
    const foodShortage = Math.min(100, Math.max(5, Math.round((100 - avgHunger) * 1.1)));

    // Energy: based on solar status + active events
    const solarSite = CITY_LOCATIONS.find(l => l.id === 'site_solar');
    let baseEnergyStrain = 20;
    if (solarSite?.status === 'damaged') baseEnergyStrain = 90;
    else if (solarSite?.status === 'under_construction') baseEnergyStrain = 55;
    else if (solarSite?.status === 'planned') baseEnergyStrain = 70;
    else if (solarSite?.status === 'completed') baseEnergyStrain = 12;
    if (this.activeEvent?.type === 'power_outage') baseEnergyStrain = 95;
    const energyStrain = baseEnergyStrain;

    // Commercial/Innovation demand based on mood and tech presence
    const completedTech = CITY_LOCATIONS.filter(l => l.id === 'site_tech' && l.status === 'completed').length;
    
    // Calculate total money from all agents
    let totalMoney = 0;
    for (const a of this.agents) {
      totalMoney += a.stats.money;
    }
    
    const commercialDemand = Math.min(
      100,
      Math.max(15, Math.round((100 - avgMood) * 0.5 + (completedTech === 0 ? 25 : 5) + Math.min(30, (totalMoney / (pop * 200)) * 30)))
    );

    // ---- Step 2: Identify top 2-3 urgent needs ----
    const needUrgency: Array<{ category: NeedCategory; urgency: number }> = [];

    // Housing (if deficit > 30)
    if (housingDeficit >= 30) {
      needUrgency.push({ category: 'housing', urgency: Math.round(housingDeficit) });
    }
    // Healthcare (if strain > 40)
    if (healthcareStrain >= 40) {
      needUrgency.push({ category: 'healthcare', urgency: healthcareStrain });
    }
    // Food (if shortage > 40)
    if (foodShortage >= 40) {
      needUrgency.push({ category: 'food', urgency: foodShortage });
    }
    // Energy (if strain > 40)
    if (energyStrain >= 40) {
      needUrgency.push({ category: 'energy', urgency: energyStrain });
    }
    // Commerce (if demand > 45)
    if (commercialDemand >= 45) {
      needUrgency.push({ category: 'commerce', urgency: commercialDemand });
    }

    // Sort by urgency descending and take top 3
    needUrgency.sort((a, b) => b.urgency - a.urgency);
    const topNeeds = needUrgency.slice(0, 3);

    // ---- Step 3: Score available building plots against top needs ----
    // Gather all construction-site plots that are planned
    const availablePlots = CITY_LOCATIONS.filter(l => 
      l.type === 'construction_site' && l.status === 'planned'
    );

    // Score each plot based on needImpact effectiveness
    const plotScores: Array<{ plot: LocationNode; totalEffectiveness: number; addressedNeeds: NeedCategory[] }> = [];

    for (const plot of availablePlots) {
      if (!plot.needImpact) continue;

      let totalEffectiveness = 0;
      let addressedNeeds: NeedCategory[] = [];

      // For each top need, check if this plot addresses it
      for (const topNeed of topNeeds) {
        const impact = plot.needImpact.effectiveness[topNeed.category];
        if (impact && impact > 0) {
          totalEffectiveness += impact * topNeed.urgency / 100; // weight by urgency
          addressedNeeds.push(topNeed.category);
        }
      }

      // Also add a small bonus for public plots when treasury is healthy
      if (plot.needImpact.preferredSector === 'public' && this.urbanMetrics.cityTreasury > 500) {
        totalEffectiveness *= 1.1; // 10% boost for public projects
      }

      // Zoning: a plot is only as good as its district. A clinic belongs on a
      // civic/arterial plot, not in the middle of a quiet residential street.
      const plannedType = plot.id === 'site_clinic' ? 'hospital' : plot.id === 'site_condo' ? 'home' : 'office';
      totalEffectiveness *= plotSuitability(plot, plannedType);

      if (totalEffectiveness > 0) {
        plotScores.push({ plot, totalEffectiveness, addressedNeeds });
      }
    }

    // Sort plots by total effectiveness (highest first)
    plotScores.sort((a, b) => b.totalEffectiveness - a.totalEffectiveness);

    // ---- Step 4: Commission the top-scoring plot ----
    if (plotScores.length > 0) {
      const topPlot = plotScores[0].plot;
      // All plots in plotScores have needImpact (filtered at scoring step)
      const addressedNeedCategories = topPlot.needImpact!.addresses;
      const primaryNeed = topNeeds.find(n => addressedNeedCategories.includes(n.category));

      // Determine sector based on plot preference and available funds
      const isPublicProject = topPlot.needImpact!.preferredSector === 'public';
      const treasuryEnough = isPublicProject && this.urbanMetrics.cityTreasury >= topPlot.needImpact!.constructionCost;
      const privateInvestors = this.agents.filter(a => a.employerSector === 'private' && a.stats.money >= topPlot.needImpact!.constructionCost);

      if (isPublicProject && treasuryEnough) {
        // Public sector: treasury pays
        const cost = topPlot.needImpact!.constructionCost;
        this.urbanMetrics.cityTreasury -= cost;
        this.urbanMetrics.totalPublicExpenditureToday += cost;
        topPlot.fundingSource = 'treasury';
        topPlot.funderName = 'Municipal City Treasury';

        this.commissionConstruction(topPlot.id);
        this.addNotification(
          `🏛️ MUNICIPAL DECREE: ${primaryNeed!.urgency >= 70 ? 'Critical ' : ''}${this.needCategoryToArabic(primaryNeed!.category)} strain addressed. ${topPlot.name} commissioned from City Treasury $${cost}!`,
          'event',
          '🏗️'
        );
      } else if (!isPublicProject && privateInvestors.length > 0) {
        // Private sector: richest investor pays
        const investor = privateInvestors.sort((a, b) => b.stats.money - a.stats.money)[0];
        const cost = topPlot.needImpact!.constructionCost;
        investor.stats.money -= cost;
        topPlot.fundingSource = 'private_capital';
        topPlot.funderName = investor.name;
        topPlot.ownerAgentId = investor.id;
        topPlot.ownerName = `${investor.name} Properties`;

        investor.memoryStream.unshift(
          createMemory(this.time, 'build', `Invested $${cost} of personal wealth into developing ${topPlot.name} to alleviate ${this.needCategoryToArabic(primaryNeed!.category)} deficit.`, 'high')
        );

        // The investor PAYS, the guild BUILDS. Passing the investor id here used
        // to assign a banker/hedge-fund manager as the site's builder, so the
        // plot sat at its seed progress forever.
        this.commissionConstruction(topPlot.id);
        this.addNotification(
          `💼 PRIVATE ENTERPRISE: ${primaryNeed!.urgency >= 70 ? 'Critical ' : ''}${this.needCategoryToArabic(primaryNeed!.category)} deficit alleviated. ${investor.name} funded $${cost} for ${topPlot.name}!`,
          'work',
          '🏗️'
        );
      } else if (isPublicProject) {
        // Treasury too low for public, try private
        // Do nothing - wait for treasury to recover or private investment
      }
    }
  }

  /**
   * Convert NeedCategory to Arabic description for notifications
   */
  private needCategoryToArabic(category: NeedCategory): string {
    const map: Record<NeedCategory, string> = {
      housing: 'سكن',
      healthcare: 'رعاية صحية',
      food: 'طعام',
      energy: 'طاقة',
      commerce: 'تجارة وابتكار'
    };
    return map[category] || category;
  }

  // -----------------------------------------------------------------------
  // ZONING — the planning code, readable by the UI and the dev console
  // -----------------------------------------------------------------------

  /** Full audit of the current plan against the zoning code. */
  public zoningFindings(): PlanFinding[] {
    return auditPlan(CITY_LOCATIONS);
  }

  public zoningSummary(): { total: number; ok: number; warn: number; violations: number; top: string[] } {
    const findings = this.zoningFindings();
    const summary = auditSummary(findings);
    const top = findings
      .filter(finding => finding.severity !== 'ok')
      .sort((a, b) => Number(b.severity === 'violation') - Number(a.severity === 'violation'))
      .slice(0, 3)
      .map(finding => finding.message);
    return { ...summary, top };
  }

  // -----------------------------------------------------------------------
  // JUSTICE — public safety snapshot for the HUD
  // -----------------------------------------------------------------------

  public justiceSummary() {
    return JUSTICE.summary();
  }

  // -----------------------------------------------------------------------
  // GOD MODE — municipal controls used from the UI (TopNav / Inspector)
  // -----------------------------------------------------------------------

  /** Clamp & apply the municipal income-tax rate (2%..35%), live. */
  public setTaxRate(newRate: number) {
    this.urbanMetrics.taxRate = Math.max(0.02, Math.min(0.35, newRate));
    soundEngine.playCoinSound();
    this.addNotification(`🏛️ City Council adjusted Municipal Tax Rate to ${Math.round(this.urbanMetrics.taxRate * 100)}%`, 'event', '⚖️');
    this.notify();
  }

  /** Treasury top-up straight into municipal reserves. */
  public injectMunicipalStimulus(amount: number = 1000) {
    this.urbanMetrics.cityTreasury += amount;
    soundEngine.playCoinSound();
    this.addNotification(`🏛️ Treasury Stimulus: Injected $${amount} into Municipal Reserves!`, 'godmode', '💰');
    this.notify();
  }

  /**
   * Put a construction plot under active development. Payment rules:
   * public plots draw from the treasury exactly ONCE (the funder is recorded
   * on the plot, so builders completing it will not double-charge), private
   * plots default to guild capital. Falls back to any free builder when
   * none is named.
   */
  public commissionConstruction(locationId: string, builderId?: string) {
    const loc = CITY_LOCATIONS.find(l => l.id === locationId);
    if (!loc || loc.status === 'completed') return;

    // Public projects are paid from the treasury exactly once. Private plots
    // are funded by private capital; the UI button does not create free money.
    if (loc.ownership === 'public' && loc.fundingSource !== 'treasury') {
      const cost = loc.constructionCost || 180;
      if (this.urbanMetrics.cityTreasury < cost) {
        this.addNotification('🏛️ Treasury funds are insufficient to commission this public project.', 'event', '⚠️');
        this.notify();
        return;
      }
      this.urbanMetrics.cityTreasury -= cost;
      this.urbanMetrics.totalPublicExpenditureToday += cost;
      loc.fundingSource = 'treasury';
      loc.funderName = 'City Municipal Treasury';
    } else if (!loc.fundingSource) {
      loc.fundingSource = 'private_capital';
      loc.funderName = loc.funderName || 'Private Guild Contract';
    }

    loc.status = 'under_construction';
    loc.buildProgress = Math.max(10, loc.buildProgress || 0);

    // Assign builder — a builder id is only honoured if it really is a builder.
    const requested = builderId ? this.agents.find(a => a.id === builderId) : null;
    const builder = (requested && requested.role === 'builder')
      ? requested
      : this.agents.find(a => a.role === 'builder' && (!a.activeProjectId || a.activeProjectId === loc.id));

    if (builder) {
      loc.assignedBuilderId = builder.id;
      builder.activeProjectId = loc.id;
      // sendAgentToLocation sets TRAVELING; do not overwrite it, or the
      // movement system will never pick the agent up.
      sendAgentToLocation(builder, loc.id, this.time);
      builder.currentThought = `Contract accepted! Traveling to construct ${loc.name}.`;
      builder.thoughtEmoji = '🔨';
      soundEngine.playClickSound();
      this.addNotification(`🏗️ Commissioned ${builder.name} (${builder.rankTitle}) to construct ${loc.name}!`, 'work', '👷');
      this.notify();
    }
  }

  /** Send the first available builder to patch a damaged site. */
  public repairInfrastructure(locationId: string) {
    const loc = CITY_LOCATIONS.find(l => l.id === locationId);
    if (!loc) return;

    loc.status = 'under_construction';
    loc.buildProgress = Math.min(90, Math.max(10, loc.buildProgress || 10));
    const builder = this.agents.find(a => a.role === 'builder');
    if (builder) {
      loc.assignedBuilderId = builder.id;
      builder.activeProjectId = loc.id;
      sendAgentToLocation(builder, loc.id, this.time);
      builder.currentThought = `Emergency repair dispatch to ${loc.name}`;
      builder.thoughtEmoji = '🛠️';
      soundEngine.playEventHorn();
      this.addNotification(`🛠️ Dispatched Builder ${builder.name} to repair damaged ${loc.name}!`, 'work', '🚨');
      this.notify();
    }
  }

  /**
   * Crisis drill: break the solar grid so builders must react. Altruistic
   * builders volunteer; selfish ones only watch (their fee is unaffordable).
   */
  public triggerInfrastructureCrisis() {
    const targetSite = CITY_LOCATIONS.find(l => l.id === 'site_solar') || CITY_LOCATIONS[0];
    targetSite.status = 'damaged';
    targetSite.buildProgress = 40;

    soundEngine.playEventHorn();
    this.addNotification(`⚠️ CRITICAL CRISIS: Power Grid Damaged at ${targetSite.name}! Builders required immediately.`, 'event', '⚡');
    
    // Altruistic builders volunteer, selfish builders demand double fee
    const builders = this.agents.filter(a => a.role === 'builder');
    builders.forEach(b => {
      if (b.moralAlignment === 'Altruistic') {
        sendAgentToLocation(b, targetSite.id, this.time);
        b.currentThought = `Volunteering emergency repairs at ${targetSite.name} to restore city grid!`;
        b.thoughtEmoji = '⚡';
      }
    });

    this.notify();
  }

  /** Flip the traffic density heatmap overlay on/off. */
  public toggleDensityHeatmap() {
    this.showDensityHeatmap = !this.showDensityHeatmap;
    soundEngine.playClickSound();
    this.addNotification(
      this.showDensityHeatmap 
        ? '🔥 Citizen Density Heatmap active (10-min traffic window)' 
        : 'Citizen Density Heatmap hidden',
      'godmode',
      '🔥'
    );
    this.notify();
  }

  /**
   * Trigger a god-mode city event by type. Each entry defines a CityEvent
   * that lasts real simulation minutes and drives agent behaviour (umbrellas
   * in rain, free coffee, idle workers during outages…) plus weather changes
   * where relevant. Every citizen writes the event into their memory.
   */
  public triggerEvent(type: CityEvent['type']) {
    soundEngine.playEventHorn();

    if (type === 'clear') {
      this.activeEvent = null;
      this.weather = 'sunny';
      this.addNotification('Weather cleared: Warm sunshine returns to the city!', 'godmode', '☀️');
      this.notify();
      return;
    }

    if (type === 'rainstorm') {
      this.weather = 'storm';
      this.activeEvent = {
        id: `evt_${Date.now()}`,
        name: 'Sudden Rainstorm',
        type: 'rainstorm',
        duration: 90, // 90 sim minutes
        description: 'Heavy rain showers. Citizens head indoors or pop open umbrellas!',
        active: true,
        icon: '🌧️'
      };
      this.addNotification('🌧️ Thunderstorm warning! Rain pours over the avenues.', 'godmode', '🌧️');
    } else if (type === 'coffee_promo') {
      this.activeEvent = {
        id: `evt_${Date.now()}`,
        name: 'Free Coffee Promo',
        type: 'coffee_promo',
        duration: 120,
        description: 'Cozy Cafe announced free cinnamon lattes for all citizens!',
        active: true,
        icon: '☕'
      };
      this.addNotification('☕ Free Coffee Alert! Citizens flock towards Cozy Cafe.', 'godmode', '☕');
    } else if (type === 'power_outage') {
      this.activeEvent = {
        id: `evt_${Date.now()}`,
        name: 'Grid Power Outage',
        type: 'power_outage',
        duration: 90,
        description: 'Office power is down! Tech Hub workers taking an outdoor recess.',
        active: true,
        icon: '⚡'
      };
      this.addNotification('⚡ Power outage strikes Tech Hub! Workers head out.', 'godmode', '⚡');
    } else if (type === 'snowstorm') {
      this.weather = 'snow';
      this.activeEvent = {
        id: `evt_${Date.now()}`,
        name: 'Winter Snowstorm',
        type: 'snowstorm',
        duration: 110,
        description: 'Fluttering snowflakes blanket the city! Citizens seek hot cocoa or cozy fires.',
        active: true,
        icon: '❄️'
      };
      this.addNotification('❄️ Winter Snowstorm alert! Fluffy snow particles falling across town.', 'godmode', '❄️');
    } else if (type === 'city_decree') {
      this.activeEvent = {
        id: `evt_${Date.now()}`,
        name: 'City Hall Civic Decree',
        type: 'city_decree',
        duration: 100,
        description: 'City Hall announces a major municipal initiative! Citizens assemble at the civic square.',
        active: true,
        icon: '🏛️'
      };
      this.addNotification('🏛️ Official City Hall decree proclaimed by the mayor! Citizens gathering.', 'godmode', '🏛️');
    } else if (type === 'festival') {
      this.activeEvent = {
        id: `evt_${Date.now()}`,
        name: 'Spring Music Festival',
        type: 'festival',
        duration: 150,
        description: 'Live acoustic melodies and food trucks gathering at Central Park.',
        active: true,
        icon: '🎪'
      };
      this.addNotification('🎪 Central Park Spring Festival kicked off with live music!', 'godmode', '🎪');
    } else if (type === 'infrastructure_crisis') {
      this.triggerInfrastructureCrisis();
      return;
    }

    // Add memory to all citizens
    this.agents.forEach(agent => {
      agent.memoryStream.unshift(
        createMemory(this.time, 'event', `Citywide event: ${this.activeEvent?.name}!`, 'high')
      );
    });

    this.notify();
  }

  // -----------------------------------------------------------------------
  // GOD MODE — citizen-level interventions (Inspector buttons)
  // -----------------------------------------------------------------------

  /** Order one citizen (via UI) to walk somewhere specific. */
  public directAgent(agentId: string, locationId: string) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      sendAgentToLocation(agent, locationId, this.time);
      soundEngine.playClickSound();
      this.addNotification(`God Mode: Directed ${agent.name} to travel to ${locationId}.`, 'godmode', '📍');
      this.notify();
    }
  }

  /** Gift cash to one citizen (recorded in their memory). */
  public giveMoneyToAgent(agentId: string, amount: number) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.stats.money += amount;
      agent.memoryStream.unshift(
        createMemory(this.time, 'event', `Received a surprise gift of $${amount}!`, 'high')
      );
      soundEngine.playCoinSound();
      this.addNotification(`Gifted $${amount} to ${agent.name}.`, 'godmode', '💰');
      this.notify();
    }
  }

  /** Instantly lift one citizen's mood (+35) and energy (+20). */
  public inspireAgent(agentId: string) {
    const agent = this.agents.find(a => a.id === agentId);
    if (agent) {
      agent.stats.mood = Math.min(100, agent.stats.mood + 35);
      agent.stats.energy = Math.min(100, agent.stats.energy + 20);
      agent.currentThought = 'Feeling an unexpected rush of divine inspiration!';
      agent.thoughtEmoji = '✨';
      agent.memoryStream.unshift(
        createMemory(this.time, 'event', `Felt a sudden burst of pure inspiration and joy.`, 'high')
      );
      soundEngine.playChatChime();
      this.addNotification(`Inspired ${agent.name}! (+35 Mood, +20 Energy)`, 'godmode', '✨');
      this.notify();
    }
  }

  /**
   * Spawn a brand-new adult citizen from the Create-Citizen modal. Personality
   * drives a moral alignment guess (Empathetic/Creative → altruistic,
   * Ambitious → selfish), builder professions get their own role & tools, and
   * the full human-life block is filled (name-derived gender, back-dated
   * birthDay) so the newcomer can date, marry and reproduce from day one.
   */
  public spawnCustomAgent(data: {
    name: string;
    profession: string;
    personality: PersonalityTrait;
    color: string;
    avatarEmoji: string;
  }) {
    const id = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isBuilder = data.profession.toLowerCase().includes('builder') || 
                      data.profession.toLowerCase().includes('contractor') || 
                      data.profession.toLowerCase().includes('architect') ||
                      data.profession.toLowerCase().includes('engineer');
    
    // Pick moral alignment based on personality
    const moralAlignment = data.personality === 'Empathetic' || data.personality === 'Creative'
      ? 'Altruistic'
      : data.personality === 'Ambitious'
      ? 'Selfish'
      : 'Neutral';

    // Human life data for the newcomer
    const gender = inferGender(data.name);
    const age = 22 + Math.floor(Math.random() * 24);
    const birthDay = this.time.day - age * 365;

    const newAgent: AgentData = {
      id,
      name: data.name,
      profession: data.profession,
      personality: data.personality,
      color: data.color,
      avatarEmoji: data.avatarEmoji,
      homeNodeId: 'home_sunset',
      workNodeId: isBuilder ? 'site_solar' : 'office',
      role: isBuilder ? 'builder' : 'citizen',
      employerSector: isBuilder ? 'private' : 'public',
      dailyWage: isBuilder ? 32 : 18,
      taxesPaidTotal: 0,
      earningsToday: 0,
      xp: 0,
      level: 1,
      rankTitle: isBuilder ? 'Apprentice Builder' : 'Civic Novice',
      buildSpeedMultiplier: 1.0,
      moralAlignment,
      moralScore: moralAlignment === 'Altruistic' ? 30 : moralAlignment === 'Selfish' ? -30 : 0,
      trustScores: {},
      stats: {
        energy: 85,
        hunger: 85,
        mood: 90,
        social: 70,
        money: 100
      },
      state: 'IDLE',
      x: 1600, // Central park entrance
      y: 780,
      targetX: 1600,
      targetY: 780,
      targetLocationId: null,
      currentLocationId: 'park',
      path: [],
      pathIndex: 0,
      speed: 2.3,
      facing: 'right',
      walkCycle: 0,
      bobOffset: 0,
      isCarryingUmbrella: this.weather === 'storm',
      isCarryingHammer: isBuilder,
      chattingWithId: null,
      chatCooldown: 10,
      currentThought: `Just arrived in AgentVille! Excited to explore the town.`,
      thoughtEmoji: data.avatarEmoji,
      memoryStream: [
        createMemory(this.time, 'event', `Moved into AgentVille as a ${data.profession}!`, 'high')
      ],

      // Human relationships & family
      gender,
      age,
      birthDay,
      partnerId: null,
      spouseId: null,
      parentIds: [],
      childIds: [],
      siblingIds: [],
      isPregnant: false,
      pregnancyStartedDay: null,
      pregnancyDueDay: null,
      pregnancyPartnerId: null,
      lastFamilyDecisionDay: 0,
      lastChildBirthDay: 0,
      isChild: false,
    };

    this.agents.push(newAgent);
    soundEngine.playChatChime();
    this.addNotification(`New citizen moved in: Welcome ${newAgent.name} (${newAgent.profession})!`, 'social', '🎉');
    this.notify();
    return newAgent;
  }

  /**
   * Fan out relationship milestones to the UI: notifications for humans to
   * read, and actual newborn agents for births.
   */
  private applyRelationshipEvents(events: RelationshipEvent[]) {
    for (const event of events) {
      if (event.type === 'birth' && event.childProfile) {
        this.spawnNewborn(event.childProfile);
      }
      this.addNotification(event.message, 'social', event.icon);
    }
    if (events.length > 0) this.notify();
  }

  /**
   * Turn a birth profile into a real living child citizen: spawned at the
   * family home, slower walker, no job (the library = children's school),
   * happy & healthy baseline stats, and the complete family links.
   */
  public spawnNewborn(profile: NewbornProfile) {
    const home = CITY_LOCATIONS.find(l => l.id === profile.homeNodeId) || CITY_LOCATIONS[0];
    const spawnSpot = home.patioSpots.length > 0 ? home.patioSpots[0] : home.door;

    const child: AgentData = {
      id: profile.id,
      name: profile.name,
      profession: 'Kindergarten Kid',
      color: profile.color,
      avatarEmoji: profile.avatarEmoji,
      personality: profile.personality,
      homeNodeId: profile.homeNodeId,
      workNodeId: 'library', // the library doubles as the children's school
      role: 'citizen',
      employerSector: 'public',
      dailyWage: 0,
      taxesPaidTotal: 0,
      earningsToday: 0,
      xp: 0,
      level: 1,
      rankTitle: 'Kid',
      buildSpeedMultiplier: 1.0,
      moralAlignment: profile.moralAlignment,
      moralScore: profile.moralScore,
      trustScores: {},
      stats: { energy: 90, hunger: 85, mood: 95, social: 80, money: 5 },
      state: 'IDLE',
      x: spawnSpot.x + 12,
      y: spawnSpot.y + 12,
      targetX: spawnSpot.x + 12,
      targetY: spawnSpot.y + 12,
      targetLocationId: null,
      currentLocationId: home.id,
      path: [],
      pathIndex: 0,
      speed: 1.7, // small legs walk slower
      facing: Math.random() < 0.5 ? 'left' : 'right',
      walkCycle: Math.random() * Math.PI * 2,
      bobOffset: 0,
      isCarryingUmbrella: false,
      isCarryingHammer: false,
      chattingWithId: null,
      chatCooldown: 20,
      currentThought: 'Just born! Taking in the bright, big world.',
      thoughtEmoji: '👶',
      memoryStream: [
        createMemory(this.time, 'event', `Born in AgentVille to a loving family on Day ${this.time.day}.`, 'high')
      ],

      // Human relationships & family
      gender: profile.gender,
      age: profile.age,
      birthDay: profile.birthDay,
      partnerId: null,
      spouseId: null,
      parentIds: [...profile.parentIds],
      motherId: profile.motherId,
      fatherId: profile.fatherId, // '' when the father is unknown
      childIds: [],
      siblingIds: [...profile.siblingIds],
      isPregnant: false,
      pregnancyStartedDay: null,
      pregnancyDueDay: null,
      pregnancyPartnerId: null,
      lastFamilyDecisionDay: 0,
      lastChildBirthDay: 0,
      isChild: true,
    };

    this.agents.push(child);
    this.celebrations.push({ x: child.x, y: child.y, icon: '👶', until: Date.now() + 9000 });
    this.trafficHistory.push({
      x: child.x,
      y: child.y,
      weight: 2.2,
      simMinute: this.time.totalMinutes,
      isSocial: true
    });
  }

  /**
   * Verification / storytelling helper (also exposed on `window.__agentville`
   * in dev): fast-forward whole days without simulating every 2-minute step.
   * Only the daily human life cycle runs, so romances, pregnancies and births
   * can be observed instantly.
   */
  public advanceDays(days: number) {
    const startedDay = this.time.day;
    const startedPopulation = this.agents.length;
    const targetDay = startedDay + Math.max(0, Math.floor(days));

    while (this.time.day < targetDay) {
      // Skip straight to the next day, exactly like a normal day transition.
      this.time.totalMinutes += 24 * 60;
      this.reconcileClockFromTotalMinutes();
      this.resetDailyBooks();

      const familyEvents = processDailyRelationships(this.agents, this.time);
      this.applyRelationshipEvents(familyEvents);
    }

    this.addNotification(
      `⏩ Fast-forwarded ${this.time.day - startedDay} day(s): population ${startedPopulation} → ${this.agents.length}.`,
      'godmode',
      '⏩'
    );
    this.notify();
  }

  private addNotification(message: string, type: ActivityNotification['type'], icon: string) {
    this.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      timeString: this.time.timeString,
      totalMinutes: this.time.totalMinutes,
      message,
      type,
      icon
    });
    if (this.notifications.length > 80) {
      this.notifications.pop();
    }
  }
}

export const globalSimulation = new SimulationEngine();
