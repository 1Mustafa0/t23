/**
 * ============================================================================
 *  WORLD TYPES — every shape shared between simulation, server and UI
 * ============================================================================
 *
 *  Conventions worth knowing before editing anything here:
 *    • AgentData is the WHOLE living person: economy (wages/taxes/ownership),
 *      morality, stats, spatial state, memory stream AND the human-life block
 *      (gender/age/family/pregnancy — see the end of the interface). Optional
 *      fields only exist so older serialization still loads; running code
 *      always fills them (createInitialAgents / initializeRelationships).
 *    • SimulationTime: totalMinutes is the master clock; hour/minute/day are
 *      DERIVED from it every tick (never write them separately).
 *    • LocationNode doubles as a static building AND its live state
 *      (revenueToday, buildProgress, status…) because the map is one
 *      immutable world definition mutated by the simulation in-place.
 *    • MemoryEntry.category drives the inspector memory filter tabs.
 */

// Weather affects umbrella carrying, movement mood, gazette and events.
export type WeatherType = 'sunny' | 'rainy' | 'storm' | 'snow' | 'blizzard' | 'cloudy';

// Biological sex — used by the human reproduction rules (relationships.ts).
export type Gender = 'female' | 'male';

export type AgentState = 
  | 'IDLE' 
  | 'TRAVELING' 
  | 'WORKING' 
  | 'SLEEPING' 
  | 'CHATTING' 
  | 'EATING' 
  | 'RELAXING' 
  | 'SHOPPING'
  | 'HEALING'
  | 'BANKING'
  | 'CIVIC'
  | 'BUILDING'
  | 'REPAIRING'
  | 'HELPING';

export type PersonalityTrait = 
  | 'Creative' 
  | 'Ambitious' 
  | 'Introvert' 
  | 'Extrovert' 
  | 'Empathetic' 
  | 'Analytical' 
  | 'Chill';

// ============================================================================
// CITIZEN NEED TYPES — explicit, enumerated needs that drive urban planning
// ============================================================================

export type NeedCategory = 
  | 'housing'      // need for shelter/rest
  | 'healthcare'   // need for medical attention
  | 'food'         // need for nutrition
  | 'energy'       // need for power/infrastructure
  | 'commerce'     // need for jobs/innovation;

export interface NeedMetric {
  category: NeedCategory;
  level: number;    // 0-100, higher = more urgent deficit
  lastUpdated: number; // simulation minutes ago
}

export interface BuildingNeedImpact {
  // Which need categories this building addresses
  addresses: NeedCategory[];
  
  // How effectively it addresses each need (0-1, higher = more effective)
  effectiveness: Record<NeedCategory, number>;
  
  // Capacity: how many citizens this building serves at full effectiveness
  capacity: number;
  
  // Cost to build/maintain
  constructionCost: number;
  operatingCost: number;
  
  // Sector ownership preference
  preferredSector: 'public' | 'private';
}

export type MoralAlignment = 'Altruistic' | 'Neutral' | 'Selfish';

/**
 * The citizen's inner life. Every person carries a small psychological model
 * that the simulation updates each tick from real conditions (money, hunger,
 * mood, housing, recent events). The psyche is what turns a need into a
 * decision — including the decision to break the law.
 */
export interface HumanValues {
  /** Resistance to theft, lies and shortcuts. */
  honesty: number;
  /** Willingness to help others at a personal cost. */
  compassion: number;
  /** Commitment to home, partner and children. */
  family: number;
  /** Drive for status, money and mastery at work. */
  ambition: number;
  /** Self-respect and sensitivity to shame. */
  dignity: number;
}

export interface Psyche {
  /** 0..100 — pressure from unmet needs and bad events. */
  stress: number;
  /** 0..100 — willingness to act on impulse (low self-control). */
  impulse: number;
  /** 0..100 — grievance against the city: "the system failed me". */
  resentment: number;
  /** 0..100 — belief that tomorrow can be better. */
  hope: number;
  /** 0..100 — police attention on this citizen. */
  suspicion: number;
  /** The citizen's value system: what they consider worth doing. */
  values: HumanValues;
  /** Day of the last offence (cooldown / escalation). */
  lastCrimeDay: number;
}

export interface CrimeRecord {
  day: number;
  type: string;
  outcome: 'arrested' | 'escaped';
  note: string;
}

export type AgentRole = 'citizen' | 'builder';

export interface AgentStats {
  energy: number;   // 0 - 100
  hunger: number;   // 0 - 100 (100 = full, 0 = starving)
  mood: number;     // 0 - 100
  social: number;   // 0 - 100
  money: number;    // Currency ($)
}

export interface MemoryEntry {
  id: string;
  timeString: string;
  day: number;
  /** Absolute simulation minute when this was stored (see SimulationTime.totalMinutes). */
  simMinute?: number;
  category: 'social' | 'travel' | 'need' | 'event' | 'work' | 'moral' | 'build';
  text: string;
  importance: 'low' | 'medium' | 'high';
  trustImpact?: { targetAgentId: string; delta: number };
}

export interface SpeechBubble {
  id: string;
  speakerId: string;
  targetId?: string;
  text: string;
  duration: number; // in milliseconds
  startTime: number;
  color: string;
}

export interface Waypoint {
  x: number;
  y: number;
}

export type DistrictId = 'residential' | 'commercial' | 'financial' | 'civic' | 'healthcare' | 'park';

export type SectorType = 'public' | 'private';

export interface DistrictInfo {
  id: DistrictId;
  name: string;
  nameAr: string;
  description: string;
  color: string;
  center: Waypoint;
}

export interface UrbanPlanningMetrics {
  cityTreasury: number;
  taxRate: number; // e.g. 0.12 (12%)
  salesTaxRate: number; // e.g. 0.05 (5%)
  totalTaxesCollectedToday: number;
  totalPublicExpenditureToday: number;
  totalPrivateRevenueToday: number;
  housingDeficit: number;     // 0 - 100%
  healthcareStrain: number;   // 0 - 100%
  foodShortage: number;       // 0 - 100%
  energyStrain: number;       // 0 - 100%
  commercialDemand: number;   // 0 - 100%
}

export interface LocationNode {
  id: string;
  name: string;
  type: 'cafe' | 'office' | 'home' | 'park' | 'hospital' | 'market' | 'bank' | 'police' | 'cityhall' | 'bakery' | 'cinema' | 'library' | 'wellness' | 'construction_site';
  sector: 'residential' | 'economic' | 'social' | 'healthcare' | 'civic';
  districtId: DistrictId;
  districtName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  door: Waypoint;
  patioSpots: Waypoint[];
  accentColor: string;
  roofColor: string;
  description: string;
  perks: string;
  signEmoji: string;
  isIndoor: boolean;
  
  // Public vs Private Sector & Economy
  ownership: SectorType; // 'public' (Municipal) vs 'private' (Free Market)
  ownerAgentId?: string | null;
  ownerName?: string;
  servicePrice: number;
  operatingCost: number;
  revenueToday: number;
  customersToday: number;
  demandScore: number;
  fundingSource?: 'treasury' | 'private_capital';
  funderName?: string;

  // Dynamic infrastructure state
  status?: 'completed' | 'under_construction' | 'damaged' | 'planned';
  buildProgress?: number; // 0 - 100%
  assignedBuilderId?: string | null;
  constructionCost?: number;
  // 🆕 Need Impact Connection — which citizen needs this building addresses (optional for backward compatibility)
  needImpact?: BuildingNeedImpact;
}

export interface ConstructionProject {
  id: string;
  name: string;
  nameAr: string;
  type: 'solar_station' | 'community_clinic' | 'highrise_condos' | 'tech_foundry' | 'botanical_pavilion' | 'farmers_depot';
  districtId: DistrictId;
  targetLocationId: string;
  sector: SectorType;
  fundingSource: 'treasury' | 'private_capital';
  funderName: string;
  funderAgentId?: string | null;
  description: string;
  cost: number;
  progress: number; // 0 - 100%
  status: 'planned' | 'in_progress' | 'completed' | 'damaged';
  assignedBuilderId: string | null;
  requestedByAgentId: string | null;
  icon: string;
  perkReward: string;
}

export interface AgentData {
  id: string;
  name: string;
  profession: string;
  color: string;
  avatarEmoji: string;
  personality: PersonalityTrait;
  homeNodeId: string;
  workNodeId: string;
  
  // Sector & Economic Data
  employerSector: SectorType;
  isBusinessOwner?: boolean;
  ownedLocationId?: string | null;
  dailyWage: number;
  taxesPaidTotal: number;
  earningsToday: number;

  // Role & Skills (Builder & XP system)
  role: AgentRole;
  xp: number;
  level: number;
  rankTitle: string;
  buildSpeedMultiplier: number;
  
  // Moral Spectrum
  moralAlignment: MoralAlignment;
  moralScore: number; // -100 (Selfish) to +100 (Altruistic)
  trustScores: Record<string, number>; // maps other agentId -> trust delta (-50 to +50)
  
  // Dynamic stats (Energy, Hunger, Mood, Social, Money)
  stats: AgentStats;
  
  // Cognitive / Spatial State
  state: AgentState;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  targetLocationId: string | null;
  currentLocationId: string | null;
  activeProjectId?: string | null;
  path: Waypoint[];
  pathIndex: number;
  speed: number;
  
  // Movement animation
  facing: 'left' | 'right';
  walkCycle: number;
  bobOffset: number;
  isCarryingUmbrella: boolean;
  isCarryingHammer: boolean;
  
  // Conversation & Social
  chattingWithId: string | null;
  chatCooldown: number; // ticks before agent can chat again
  currentThought: string;
  thoughtEmoji: string;
  
  // Episodic Memory Stream
  memoryStream: MemoryEntry[];

  // Human Life & Relationships
  gender: Gender;
  age: number; // years
  birthDay: number; // simulation day of birth (used to derive/decorate age)
  partnerId: string | null; // dating / engaged partner
  spouseId: string | null; // married partner
  parentIds: string[];
  motherId?: string; // direct mother link ('' unknown) — set on birth
  fatherId?: string; // direct father link ('' unknown) — set on birth
  childIds: string[];
  siblingIds: string[];
  isPregnant: boolean;
  pregnancyStartedDay: number | null;
  pregnancyDueDay: number | null;
  pregnancyPartnerId: string | null;
  lastFamilyDecisionDay: number;
  lastChildBirthDay: number;
  isChild?: boolean;

  /** Inner life (see Psyche). Optional so old saves still load. */
  psyche?: Psyche;
  /** Criminal history, newest first. */
  record?: CrimeRecord[];
  /** Simulation day until which the citizen is detained. */
  jailedUntil?: number;
  /** Housing outcome from the housing plan. */
  housing?: 'housed' | 'homeless';
  /** Human-readable unit the citizen lives in. */
  housingUnit?: string;
  /** Government-built home paid back in instalments. */
  mortgage?: { remaining: number; daily: number } | null;
}

export interface CityEvent {
  id: string;
  name: string;
  type: 'rainstorm' | 'snowstorm' | 'coffee_promo' | 'power_outage' | 'festival' | 'city_decree' | 'clear' | 'infrastructure_crisis';
  duration: number; // in simulation minutes
  description: string;
  active: boolean;
  icon: string;
}

export interface SimulationTime {
  totalMinutes: number;
  day: number;
  hour: number;
  minute: number;
  timeString: string;
  timeOfDay: 'dawn' | 'day' | 'sunset' | 'night';
  lightLevel: number; // 0 (midnight) to 1 (high noon)
}

export interface TrafficPoint {
  x: number;
  y: number;
  weight: number;
  simMinute: number;
  isSocial: boolean;
}


