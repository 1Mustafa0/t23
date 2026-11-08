/**
 * ============================================================================
 *  AGENT LOGIC — the cognitive brain of every citizen
 * ============================================================================
 *
 *  Responsibilities (kept deliberately separate from rendering & movement):
 *    • INITIAL_AGENTS / createInitialAgents : the founding 40 citizens & their
 *      full AgentData population (including human-life fields).
 *    • tickAgent : ONE cognitive step (2 sim-minutes) for ONE agent:
 *         1) travel latency (movementSystem owns real locomotion)
 *         2) chat cooldown
 *         3) location behaviour (building progress, wages+income-tax,
 *            shop purchases+sales-tax, healthcare, banking…)
 *         4) natural needs decay
 *         5) utility-based goal selection (evaluateAgentGoal)
 *         6) proximity chats — moral dilemmas, dialogue templates, AND the
 *            human-relationship bookkeeping (registerInteraction).
 *      Everything tickAgent produces (speech, sounds, taxes, memory, chat
 *      metadata, relationship milestones) is RETURNED; SimulationEngine owns
 *      applying it. Pure-ish per agent, mutates only that agent.
 *    • evaluateAgentGoal : utility engine = deficits × personality weights,
 *      with a dedicated early-out for children (school/park/home day).
 *
 *  Imports notes:
 *    • relationships  – human bonds (see relationships.ts header)
 *    • dialogueManager – bilingual small-talk templates
 *    • schedule       – shared 08:00–18:00 working-hour policy
 */
import { 
  AgentData, 
  AgentState, 
  AgentRole,
  Gender,
  MoralAlignment,
  MemoryEntry, 
  PersonalityTrait, 
  SpeechBubble, 
  SimulationTime, 
  CityEvent,
  LocationNode
} from '../types/simulation';
import { CITY_LOCATIONS, LOCATION_NAV_TARGETS, findPath, CITY_WIDTH, CITY_HEIGHT } from './cityMap';
import { dialogueManager } from './agentDialogueManager';
import { generateExchange } from './mindVoice';
import { soundEngine } from '../audio/soundEngine';
import { isWorkHours } from './schedule';
import {
  generateRomanticExchange,
  getRelationshipBetween,
  inferGender,
  registerInteraction,
  RelationshipEvent,
} from './relationships';

// ---------------------------------------------------------------------------
// SECTION 1: FOUNDING POPULATION DATA (40 citizens)
// ---------------------------------------------------------------------------

/** The human blueprint each founding citizen is created from (see INITIAL_AGENTS). */
export interface InitialAgentProfile {
  id: string;
  name: string;
  profession: string;
  color: string;
  avatarEmoji: string;
  personality: PersonalityTrait;
  homeNodeId: string;
  workNodeId: string;
  role?: AgentRole;
  gender?: Gender;
  age?: number;
  moralAlignment?: MoralAlignment;
  moralScore?: number;
  stats: { energy: number; hunger?: number; mood: number; social: number; money: number };
  state: AgentState;
}

export const INITIAL_AGENTS: InitialAgentProfile[] = [
  // 1-10: Pioneers, Builders & Leaders
  {
    id: 'agent_alex',
    name: 'Alex Rivera',
    profession: 'AI Hacker & Tech Lead',
    color: '#3B82F6',
    avatarEmoji: '⚡',
    personality: 'Creative',
    homeNodeId: 'home_sunset',
    workNodeId: 'office',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 10,
    stats: { energy: 78, hunger: 75, mood: 85, social: 55, money: 160 },
    state: 'WORKING',
  },
  {
    id: 'agent_sofia',
    name: 'Sofia Chen',
    profession: 'Master Barista & Roaster',
    color: '#EC4899',
    avatarEmoji: '☕',
    personality: 'Extrovert',
    homeNodeId: 'home_maple',
    workNodeId: 'cafe',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 80,
    stats: { energy: 88, hunger: 85, mood: 92, social: 80, money: 110 },
    state: 'WORKING',
  },
  {
    id: 'agent_marcus',
    name: 'Marcus Vance',
    profession: 'Venture Trader',
    color: '#F59E0B',
    avatarEmoji: '💼',
    personality: 'Ambitious',
    homeNodeId: 'home_pine',
    workNodeId: 'bank',
    role: 'citizen',
    moralAlignment: 'Selfish',
    moralScore: -70,
    stats: { energy: 65, hunger: 60, mood: 72, social: 45, money: 340 },
    state: 'WORKING',
  },
  {
    id: 'agent_elena',
    name: 'Dr. Elena Rostova',
    profession: 'Chief Trauma Physician',
    color: '#10B981',
    avatarEmoji: '🩺',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'hospital',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 90,
    stats: { energy: 82, hunger: 75, mood: 86, social: 65, money: 230 },
    state: 'WORKING',
  },
  {
    id: 'agent_patrick',
    name: 'Patrick Murphy',
    profession: 'Civic Master Builder',
    color: '#F59E0B',
    avatarEmoji: '👷',
    personality: 'Chill',
    homeNodeId: 'home_pine',
    workNodeId: 'site_solar',
    role: 'builder',
    moralAlignment: 'Altruistic',
    moralScore: 85,
    stats: { energy: 90, hunger: 85, mood: 88, social: 65, money: 190 },
    state: 'BUILDING',
  },
  {
    id: 'agent_oliver',
    name: 'Oliver Bennett',
    profession: 'Commercial Contractor',
    color: '#3730A3',
    avatarEmoji: '🏗️',
    personality: 'Ambitious',
    homeNodeId: 'home_sunset',
    workNodeId: 'site_tech',
    role: 'builder',
    moralAlignment: 'Selfish',
    moralScore: -65,
    stats: { energy: 85, hunger: 80, mood: 77, social: 63, money: 350 },
    state: 'BUILDING',
  },
  {
    id: 'agent_viktor',
    name: 'Viktor Ramos',
    profession: 'Heavy Infrastructure Engineer',
    color: '#D97706',
    avatarEmoji: '👷‍♂️',
    personality: 'Analytical',
    homeNodeId: 'home_maple',
    workNodeId: 'site_clinic',
    role: 'builder',
    moralAlignment: 'Neutral',
    moralScore: 5,
    stats: { energy: 88, hunger: 75, mood: 82, social: 50, money: 180 },
    state: 'BUILDING',
  },
  {
    id: 'agent_leo',
    name: 'Leo Tanaka',
    profession: 'Landscape Architect',
    color: '#8B5CF6',
    avatarEmoji: '🌿',
    personality: 'Introvert',
    homeNodeId: 'home_sunset',
    workNodeId: 'park',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 60,
    stats: { energy: 72, hunger: 65, mood: 90, social: 38, money: 95 },
    state: 'RELAXING',
  },
  {
    id: 'agent_maya',
    name: 'Maya Patel',
    profession: 'Artisan Pastry Chef',
    color: '#F97316',
    avatarEmoji: '🥐',
    personality: 'Chill',
    homeNodeId: 'home_maple',
    workNodeId: 'bakery',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 65,
    stats: { energy: 70, hunger: 90, mood: 84, social: 62, money: 140 },
    state: 'WORKING',
  },
  {
    id: 'agent_tariq',
    name: 'Tariq Mansoor',
    profession: 'Lead Detective',
    color: '#3B82F6',
    avatarEmoji: '🕵️',
    personality: 'Analytical',
    homeNodeId: 'home_pine',
    workNodeId: 'police',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 15,
    stats: { energy: 85, hunger: 70, mood: 78, social: 50, money: 185 },
    state: 'WORKING',
  },

  // 11-20: Commerce, Culture, & Civic Pillars
  {
    id: 'agent_layla',
    name: 'Layla Al-Nuaimi',
    profession: 'City Council Speaker',
    color: '#6366F1',
    avatarEmoji: '🏛️',
    personality: 'Extrovert',
    homeNodeId: 'home_garden',
    workNodeId: 'cityhall',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 85,
    stats: { energy: 75, hunger: 70, mood: 88, social: 75, money: 260 },
    state: 'WORKING',
  },
  {
    id: 'agent_julian',
    name: 'Julian Thorne',
    profession: 'Corporate Strategist',
    color: '#4F46E5',
    avatarEmoji: '📊',
    personality: 'Ambitious',
    homeNodeId: 'home_sunset',
    workNodeId: 'office_corp',
    role: 'citizen',
    moralAlignment: 'Selfish',
    moralScore: -60,
    stats: { energy: 68, hunger: 65, mood: 75, social: 58, money: 310 },
    state: 'WORKING',
  },
  {
    id: 'agent_chloe',
    name: 'Chloe Dubois',
    profession: 'Head Librarian & Archivist',
    color: '#0284C7',
    avatarEmoji: '📚',
    personality: 'Introvert',
    homeNodeId: 'home_maple',
    workNodeId: 'library',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 20,
    stats: { energy: 76, hunger: 70, mood: 89, social: 42, money: 105 },
    state: 'WORKING',
  },
  {
    id: 'agent_omar',
    name: 'Omar Farooq',
    profession: 'Organic Produce Trader',
    color: '#16A34A',
    avatarEmoji: '🍎',
    personality: 'Chill',
    homeNodeId: 'home_pine',
    workNodeId: 'market',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 70,
    stats: { energy: 80, hunger: 85, mood: 82, social: 70, money: 155 },
    state: 'WORKING',
  },
  {
    id: 'agent_zara',
    name: 'Zara Sterling',
    profession: 'Holistic Therapist',
    color: '#14B8A6',
    avatarEmoji: '💆',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'wellness',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 85,
    stats: { energy: 86, hunger: 80, mood: 94, social: 74, money: 175 },
    state: 'WORKING',
  },
  {
    id: 'agent_lucas',
    name: 'Lucas Silva',
    profession: 'Cinema Projectionist',
    color: '#9333EA',
    avatarEmoji: '🎬',
    personality: 'Creative',
    homeNodeId: 'home_sunset',
    workNodeId: 'cinema',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 0,
    stats: { energy: 72, hunger: 65, mood: 88, social: 60, money: 120 },
    state: 'WORKING',
  },
  {
    id: 'agent_nina',
    name: 'Nina Petrov',
    profession: 'Robotics Engineer',
    color: '#2563EB',
    avatarEmoji: '🤖',
    personality: 'Analytical',
    homeNodeId: 'home_maple',
    workNodeId: 'office',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 10,
    stats: { energy: 74, hunger: 70, mood: 80, social: 46, money: 220 },
    state: 'WORKING',
  },
  {
    id: 'agent_ethan',
    name: 'Ethan Cross',
    profession: 'Securities Broker',
    color: '#CA8A04',
    avatarEmoji: '🪙',
    personality: 'Ambitious',
    homeNodeId: 'home_pine',
    workNodeId: 'bank',
    role: 'citizen',
    moralAlignment: 'Selfish',
    moralScore: -55,
    stats: { energy: 69, hunger: 60, mood: 76, social: 52, money: 330 },
    state: 'WORKING',
  },
  {
    id: 'agent_amira',
    name: 'Amira Kassam',
    profession: 'Emergency Paramedic',
    color: '#06B6D4',
    avatarEmoji: '🚑',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'hospital',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 85,
    stats: { energy: 81, hunger: 75, mood: 85, social: 68, money: 190 },
    state: 'WORKING',
  },
  {
    id: 'agent_felix',
    name: 'Felix Moreau',
    profession: 'Botanical Researcher',
    color: '#059669',
    avatarEmoji: '🌱',
    personality: 'Introvert',
    homeNodeId: 'home_sunset',
    workNodeId: 'park',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 70,
    stats: { energy: 77, hunger: 70, mood: 91, social: 40, money: 115 },
    state: 'RELAXING',
  },

  // 21-30: Urban Dynamics & Guild Contractors
  {
    id: 'agent_hana',
    name: 'Hana Takahashi',
    profession: 'Chamber Music Violinist',
    color: '#D946EF',
    avatarEmoji: '🎻',
    personality: 'Creative',
    homeNodeId: 'home_maple',
    workNodeId: 'park',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 65,
    stats: { energy: 73, hunger: 70, mood: 93, social: 66, money: 130 },
    state: 'RELAXING',
  },
  {
    id: 'agent_liam',
    name: 'Liam O’Connor',
    profession: 'Public Safety Patrol',
    color: '#1D4ED8',
    avatarEmoji: '👮',
    personality: 'Analytical',
    homeNodeId: 'home_pine',
    workNodeId: 'police',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 20,
    stats: { energy: 86, hunger: 75, mood: 81, social: 54, money: 175 },
    state: 'WORKING',
  },
  {
    id: 'agent_samantha',
    name: 'Samantha Reed',
    profession: 'Bakery Confectioner',
    color: '#FB923C',
    avatarEmoji: '🧁',
    personality: 'Chill',
    homeNodeId: 'home_garden',
    workNodeId: 'bakery',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 60,
    stats: { energy: 71, hunger: 85, mood: 87, social: 64, money: 145 },
    state: 'WORKING',
  },
  {
    id: 'agent_karim',
    name: 'Karim Nasser',
    profession: 'Urban Construction Foreman',
    color: '#EA580C',
    avatarEmoji: '🔨',
    personality: 'Chill',
    homeNodeId: 'home_sunset',
    workNodeId: 'site_condo',
    role: 'builder',
    moralAlignment: 'Altruistic',
    moralScore: 75,
    stats: { energy: 84, hunger: 80, mood: 84, social: 60, money: 210 },
    state: 'BUILDING',
  },
  {
    id: 'agent_zoe',
    name: 'Zoe Brooks',
    profession: 'Cybersecurity Analyst',
    color: '#3B82F6',
    avatarEmoji: '🛡️',
    personality: 'Analytical',
    homeNodeId: 'home_maple',
    workNodeId: 'office',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 10,
    stats: { energy: 75, hunger: 70, mood: 82, social: 49, money: 235 },
    state: 'WORKING',
  },
  {
    id: 'agent_dylan',
    name: 'Dylan Hayes',
    profession: 'Espresso Artisan',
    color: '#B45309',
    avatarEmoji: '☕',
    personality: 'Extrovert',
    homeNodeId: 'home_pine',
    workNodeId: 'cafe',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 70,
    stats: { energy: 85, hunger: 80, mood: 90, social: 78, money: 115 },
    state: 'WORKING',
  },
  {
    id: 'agent_fatima',
    name: 'Fatima Zahra',
    profession: 'Diplomatic Council Secretary',
    color: '#4338CA',
    avatarEmoji: '📜',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'cityhall',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 80,
    stats: { energy: 78, hunger: 75, mood: 87, social: 73, money: 250 },
    state: 'WORKING',
  },
  {
    id: 'agent_ryan',
    name: 'Ryan Cooper',
    profession: 'Fintech Hedge Strategist',
    color: '#1E3A8A',
    avatarEmoji: '📈',
    personality: 'Ambitious',
    homeNodeId: 'home_sunset',
    workNodeId: 'office_corp',
    role: 'citizen',
    moralAlignment: 'Selfish',
    moralScore: -75,
    stats: { energy: 66, hunger: 60, mood: 74, social: 50, money: 375 },
    state: 'WORKING',
  },
  {
    id: 'agent_grace',
    name: 'Grace Hopper-Lee',
    profession: 'Research Data Archivist',
    color: '#0369A1',
    avatarEmoji: '🔍',
    personality: 'Introvert',
    homeNodeId: 'home_maple',
    workNodeId: 'library',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 15,
    stats: { energy: 79, hunger: 70, mood: 86, social: 44, money: 130 },
    state: 'WORKING',
  },
  {
    id: 'agent_yasmin',
    name: 'Yasmin Qureshi',
    profession: 'Clinical Acupuncturist',
    color: '#0F766E',
    avatarEmoji: '🪡',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'wellness',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 85,
    stats: { energy: 89, hunger: 75, mood: 95, social: 72, money: 180 },
    state: 'WORKING',
  },

  // 31-40: Specialists & Neighborhood Leaders
  {
    id: 'agent_brandon',
    name: 'Brandon Lee',
    profession: 'Arcade Gaming Host',
    color: '#7C3AED',
    avatarEmoji: '🕹️',
    personality: 'Creative',
    homeNodeId: 'home_sunset',
    workNodeId: 'cinema',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 5,
    stats: { energy: 79, hunger: 70, mood: 86, social: 65, money: 135 },
    state: 'WORKING',
  },
  {
    id: 'agent_clara',
    name: 'Clara Schumann',
    profession: 'Farmers Market Manager',
    color: '#F59E0B',
    avatarEmoji: '🌻',
    personality: 'Extrovert',
    homeNodeId: 'home_maple',
    workNodeId: 'market',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 75,
    stats: { energy: 83, hunger: 85, mood: 85, social: 77, money: 170 },
    state: 'WORKING',
  },
  {
    id: 'agent_arthur',
    name: 'Arthur Pendelton',
    profession: 'Senior Portfolio Auditor',
    color: '#B45309',
    avatarEmoji: '📑',
    personality: 'Analytical',
    homeNodeId: 'home_pine',
    workNodeId: 'bank',
    role: 'citizen',
    moralAlignment: 'Selfish',
    moralScore: -50,
    stats: { energy: 67, hunger: 60, mood: 73, social: 48, money: 360 },
    state: 'WORKING',
  },
  {
    id: 'agent_nadia',
    name: 'Nadia Benali',
    profession: 'Community Relations Officer',
    color: '#2563EB',
    avatarEmoji: '🤝',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'police',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 90,
    stats: { energy: 80, hunger: 75, mood: 86, social: 76, money: 185 },
    state: 'WORKING',
  },
  {
    id: 'agent_kevin',
    name: 'Kevin Zhang',
    profession: 'Cloud Infrastructure Architect',
    color: '#1E40AF',
    avatarEmoji: '☁️',
    personality: 'Creative',
    homeNodeId: 'home_sunset',
    workNodeId: 'office',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 10,
    stats: { energy: 76, hunger: 70, mood: 81, social: 52, money: 240 },
    state: 'WORKING',
  },
  {
    id: 'agent_isabel',
    name: 'Isabel Gomez',
    profession: 'Head ER Trauma Nurse',
    color: '#0891B2',
    avatarEmoji: '🩹',
    personality: 'Empathetic',
    homeNodeId: 'home_maple',
    workNodeId: 'hospital',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 95,
    stats: { energy: 84, hunger: 75, mood: 88, social: 71, money: 195 },
    state: 'WORKING',
  },
  {
    id: 'agent_david',
    name: 'David Kim',
    profession: 'Film Critic & Essayist',
    color: '#9333EA',
    avatarEmoji: '🎥',
    personality: 'Analytical',
    homeNodeId: 'home_pine',
    workNodeId: 'cinema',
    role: 'citizen',
    moralAlignment: 'Neutral',
    moralScore: 0,
    stats: { energy: 73, hunger: 65, mood: 84, social: 55, money: 140 },
    state: 'EATING',
  },
  {
    id: 'agent_noor',
    name: 'Noor Al-Mansouri',
    profession: 'Environmental Ecologist',
    color: '#15803D',
    avatarEmoji: '🦆',
    personality: 'Chill',
    homeNodeId: 'home_garden',
    workNodeId: 'park',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 80,
    stats: { energy: 87, hunger: 75, mood: 96, social: 45, money: 125 },
    state: 'RELAXING',
  },
  {
    id: 'agent_salma',
    name: 'Salma El-Sayed',
    profession: 'Chocolatier & Confectioner',
    color: '#B91C1C',
    avatarEmoji: '🍫',
    personality: 'Creative',
    homeNodeId: 'home_maple',
    workNodeId: 'bakery',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 70,
    stats: { energy: 82, hunger: 85, mood: 89, social: 68, money: 150 },
    state: 'WORKING',
  },
  {
    id: 'agent_diana',
    name: 'Diana Prince',
    profession: 'Mindfulness & Meditation Coach',
    color: '#0D9488',
    avatarEmoji: '🧘',
    personality: 'Empathetic',
    homeNodeId: 'home_garden',
    workNodeId: 'wellness',
    role: 'citizen',
    moralAlignment: 'Altruistic',
    moralScore: 90,
    stats: { energy: 91, hunger: 80, mood: 97, social: 72, money: 190 },
    state: 'WORKING',
  }
];

// ---------------------------------------------------------------------------
// SECTION 2: MEMORY HELPERS
// ---------------------------------------------------------------------------

/**
 * Create one episodic memory entry. `trustImpact` (optional) both records the
 * social deed AND mutates the target citizen's trust matrix when applied.
 */
export function createMemory(
  time: SimulationTime,
  category: MemoryEntry['category'],
  text: string,
  importance: MemoryEntry['importance'] = 'medium',
  trustImpact?: { targetAgentId: string; delta: number }
): MemoryEntry {
  return {
    id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timeString: time.timeString,
    day: time.day,
    simMinute: time.totalMinutes,
    category,
    text,
    importance,
    trustImpact
  };
}

// ---------------------------------------------------------------------------
// SECTION 3: WORLD POPULATION FACTORY
// ---------------------------------------------------------------------------

/**
 * Instantiate the 40 founding citizens as fully-populated agents scattered
 * across the real-scale 3200×2400 city.
 *
 * Each profile gets: a spawn spot at its workplace (except sleeping/eating/
 * relaxing starters), employment sector derived from the workplace, builder
 * levels & titles, wage by profession, a memory of the first morning, and the
 * complete human-life block (gender inferred from the name, adult age, and a
 * birthDay back-dated so getAgentAge() returns that same age on Day 1).
 */
export function createInitialAgents(time: SimulationTime): AgentData[] {
  return INITIAL_AGENTS.map((base, idx) => {
    // Where the citizen starts the day depends on their declared state.
    let locId = base.workNodeId;
    if (base.state === 'RELAXING') locId = 'park';
    if (base.state === 'EATING') locId = (idx % 2 === 0) ? 'cafe' : 'bakery';
    if (base.state === 'SHOPPING') locId = (idx % 2 === 0) ? 'market' : 'cinema';
    if (base.state === 'SLEEPING') locId = base.homeNodeId;
    if (base.state === 'BUILDING') locId = base.workNodeId;

    // Find the location and pick a doorway/patio pixel to stand on.
    const loc = CITY_LOCATIONS.find(l => l.id === locId) || CITY_LOCATIONS[0];
    const initialPos = loc.patioSpots.length > 0 
      ? loc.patioSpots[idx % loc.patioSpots.length] 
      : loc.door;

    const role: AgentRole = base.role || 'citizen';
    const isBuilder = role === 'builder';
    const level = isBuilder ? (idx % 2 === 0 ? 2 : 3) : 1;
    const rankTitle = isBuilder
      ? (level >= 3 ? 'Master Architect' : level === 2 ? 'Journeyman Contractor' : 'Apprentice Builder')
      : 'Citizen Specialist';

    const moralAlignment: MoralAlignment = base.moralAlignment || 'Neutral';
    const moralScore = base.moralScore ?? (moralAlignment === 'Altruistic' ? 75 : moralAlignment === 'Selfish' ? -70 : 0);

    // Human life data: deterministic gender by name, varied adult ages.
    const gender: Gender = base.gender ?? inferGender(base.name);
    const age = base.age ?? (24 + ((idx * 7 + 5) % 20));
    const birthDay = time.day - age * 365;

    const publicWorkplaces = ['hospital', 'police', 'cityhall', 'library', 'site_solar', 'site_clinic', 'park'];
    const employerSector: 'public' | 'private' = publicWorkplaces.includes(base.workNodeId) ? 'public' : 'private';

    const ownedLoc = CITY_LOCATIONS.find(l => l.ownerAgentId === base.id);
    const isBusinessOwner = !!ownedLoc;
    const ownedLocationId = ownedLoc ? ownedLoc.id : null;

    let dailyWage = 18;
    if (base.workNodeId === 'office' || base.workNodeId === 'bank' || base.workNodeId === 'office_corp') dailyWage = 25;
    else if (base.workNodeId === 'hospital' || base.workNodeId === 'police' || isBuilder) dailyWage = 22;
    else if (base.workNodeId === 'cityhall' || base.workNodeId === 'library') dailyWage = 20;
    else if (base.workNodeId === 'cafe' || base.workNodeId === 'bakery' || base.workNodeId === 'market' || base.workNodeId === 'cinema') dailyWage = 16;

    const initialMemories: MemoryEntry[] = [
      createMemory(time, 'event', `Woke up in ${base.homeNodeId.replace('_', ' ')} with ${moralAlignment} ideals for Day ${time.day}.`, 'low'),
      createMemory(time, 'travel', `Traveled through the city avenues to ${loc.name}.`, 'low'),
    ];

    if (isBuilder) {
      initialMemories.unshift(
        createMemory(time, 'build', `Equipped toolkit as a certified ${rankTitle}. Ready to construct city infrastructure!`, 'high')
      );
    }

    return {
      ...base,
      employerSector,
      isBusinessOwner,
      ownedLocationId,
      dailyWage,
      taxesPaidTotal: 0,
      earningsToday: 0,
      role,
      xp: isBuilder ? level * 100 - 40 : 20,
      level,
      rankTitle,
      buildSpeedMultiplier: 1.0 + (level - 1) * 0.35,
      moralAlignment,
      moralScore,
      trustScores: {},
      stats: {
        energy: base.stats.energy,
        hunger: base.stats.hunger ?? 80,
        mood: base.stats.mood,
        social: base.stats.social,
        money: base.stats.money
      },
      x: initialPos.x,
      y: initialPos.y,
      targetX: initialPos.x,
      targetY: initialPos.y,
      targetLocationId: null,
      currentLocationId: loc.id,
      path: [],
      pathIndex: 0,
      speed: 2.3 + (idx % 4) * 0.25,
      facing: (idx % 2 === 0) ? 'right' : 'left',
      walkCycle: Math.random() * Math.PI * 2,
      bobOffset: 0,
      isCarryingUmbrella: false,
      isCarryingHammer: isBuilder && base.state === 'BUILDING',
      chattingWithId: null,
      chatCooldown: 0,
      currentThought: isBuilder 
        ? `Preparing blueprint inspection at ${loc.name}`
        : `Starting morning routine at ${loc.name}`,
      thoughtEmoji: isBuilder ? '🔨' : base.avatarEmoji,
      memoryStream: initialMemories,

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
  });
}

// ---------------------------------------------------------------------------
// SECTION 4: TRAVEL COMMANDED BY THE BEHAVIOUR ENGINE
// ---------------------------------------------------------------------------

/**
 * Send one agent walking to a destination. Builds a grid path plus a final
 * human arrival spot (door or a patio), switches the caller to TRAVELING, and
 * writes a "began journey" memory. Real locomotion advances one step per
 * movementSystem frame — this only lays the plan.
 */
export function sendAgentToLocation(agent: AgentData, destinationNodeId: string, time: SimulationTime): void {
  const targetLoc = CITY_LOCATIONS.find(l => l.id === destinationNodeId);
  if (!targetLoc) return;

  const targetNavNodeId = LOCATION_NAV_TARGETS[destinationNodeId] || targetLoc.id;
  const path = findPath(agent.x, agent.y, targetNavNodeId);

  // Pick an arrival spot (door or patio spot)
  const finalSpot = targetLoc.patioSpots.length > 0
    ? targetLoc.patioSpots[Math.floor(Math.random() * targetLoc.patioSpots.length)]
    : targetLoc.door;

  path.push({ x: finalSpot.x, y: finalSpot.y });

  agent.path = path;
  agent.pathIndex = 0;
  agent.targetLocationId = destinationNodeId;
  agent.state = 'TRAVELING';
  agent.currentThought = `Walking to ${targetLoc.name}`;
  agent.thoughtEmoji = '🚶';
  agent.currentLocationId = null;

  agent.memoryStream.unshift(
    createMemory(time, 'travel', `Began journey towards ${targetLoc.name} (${targetLoc.districtName}).`, 'low')
  );
  if (agent.memoryStream.length > 80) {
    agent.memoryStream.pop();
  }
}

// ---------------------------------------------------------------------------
// SECTION 5: UTILITY-BASED GOAL ENGINE (decideAgentGoal)
// ---------------------------------------------------------------------------
//
// Every time an IDLE (or restless) agent asks "what now?", we score each life
// need as an utility and pick the best:
//
//     score(needs)  =  deficit × personality/life-weight × bonus
//
//       sleep : energy   × night/exhaustion weight × Chill multiplier
//       eat   : hunger   × starvation weight
//       work  : money    × morality weight + on-clock bonus (≈40)
//       social: social   × Extrovert weight
//       relax : mood
//
// A low absolute threshold (>50 / >45) keeps citizens from ping-ponging
// between venues every tick; ties resolve by natural need desperation.
// Children short-circuit the whole engine with their own simple routine.
export function evaluateAgentGoal(
  agent: AgentData,
  time: SimulationTime,
  activeEvent: CityEvent | null
): { destination: string; state: AgentState; thought: string; emoji: string } | null {
  // Children live a different day: school in the morning, play in the
  // afternoon, dinner with the family and bed at night. They never work.
  if (agent.isChild) {
    const isNightChild = time.hour >= 21 || time.hour < 7;
    if (isNightChild || agent.stats.energy < 25) {
      return {
        destination: agent.homeNodeId || 'home_sunset',
        state: 'SLEEPING',
        thought: 'Heading home for Dinner & bedtime stories with the family.',
        emoji: '🛌'
      };
    }
    if (agent.stats.hunger < 45 || (time.hour >= 18 && time.hour < 21)) {
      return {
        destination: 'bakery',
        state: 'EATING',
        thought: 'Craving a warm pastry after a long day of play.',
        emoji: '🥐'
      };
    }
    if (time.hour >= 8 && time.hour < 14) {
      if (agent.currentLocationId !== 'library') {
        return {
          destination: 'library',
          state: 'RELAXING',
          thought: 'Off to the school wing at the library for today\'s lessons.',
          emoji: '🎒'
        };
      }
      agent.state = 'RELAXING';
      agent.currentThought = 'Learning eternally useful things at the library school.';
      agent.thoughtEmoji = '📖';
      return null;
    }
    if (agent.currentLocationId !== 'park') {
      return {
        destination: 'park',
        state: 'RELAXING',
        thought: 'The lagoon swans are out! Time to play with friends.',
        emoji: '🪁'
      };
    }
    agent.state = 'RELAXING';
    agent.currentThought = 'Playing near the grand lagoon & watching the swans.';
    agent.thoughtEmoji = '🧒';
    return null;
  }

  // A citizen with no unit does not pretend to have a home: they sleep rough
  // in the park until the city builds or a family takes them in.
  if (agent.housing === 'homeless') {
    const nightFalls = time.hour >= 21 || time.hour < 7;
    if (nightFalls || agent.stats.energy < 35) {
      if (agent.currentLocationId !== 'park') {
        return {
          destination: 'park',
          state: 'SLEEPING',
          thought: 'No home of my own — sleeping on a park bench tonight.',
          emoji: '🏠',
        };
      }
      agent.state = 'SLEEPING';
      agent.currentThought = 'Sleeping rough in the park, hoping for a home.';
      agent.thoughtEmoji = '🏠';
      return null;
    }
  }

  // If agent is a Builder with an active construction or damaged site in city
  if (agent.role === 'builder') {
    // `planned` sites are unfunded zoning plots. Builders must never start
    // them directly; only the need-based urban planner can commission them.
    const activeSite = CITY_LOCATIONS.find(l =>
      l.type === 'construction_site' &&
      (l.status === 'under_construction' || l.status === 'damaged') &&
      (!l.assignedBuilderId || l.assignedBuilderId === agent.id)
    );

    // If builder has sufficient energy, constructing is high priority utility
    if (activeSite && agent.stats.energy > 30 && agent.stats.hunger > 30) {
      if (agent.currentLocationId !== activeSite.id) {
        return {
          destination: activeSite.id,
          state: 'BUILDING',
          thought: `Assigned to construct ${activeSite.name}`,
          emoji: '🔨'
        };
      }
    }
  }

  // Calculate need deficits expressed as 0..100 "how much do I lack" values
  const energyDeficit = 100 - agent.stats.energy;
  const hungerDeficit = 100 - agent.stats.hunger;
  const moneyDeficit = Math.max(0, 100 - agent.stats.money);
  const socialDeficit = 100 - agent.stats.social;
  const moodDeficit = 100 - agent.stats.mood;

  // Life context that biases the utilities.
  // NOTE: `isWithinWorkday` (9–17) is the goal engine's own softer window;
  // the wage-paying shift policy (08–18) lives in schedule.isWorkHours —
  // they intentionally overlap but answer different questions.
  const isNight = time.hour >= 22 || time.hour < 7;
  const isWithinWorkday = time.hour >= 9 && time.hour <= 17;

  // 1. Sleep Utility: nonzero weight all day (1.0), then boosted by night or
  //    severe exhaustion; Chill personalities mind sleep a little more.
  const sleepWeight = isNight ? 3.0 : agent.stats.energy < 25 ? 3.5 : 1.0;
  const sleepUtility = energyDeficit * sleepWeight * (agent.personality === 'Chill' ? 1.2 : 1.0);

  // 2. Hunger Utility: slowly matters... until it really matters (<25 → famine).
  const hungerWeight = agent.stats.hunger < 25 ? 3.8 : 1.3;
  const hungerUtility = hungerDeficit * hungerWeight;

  // 3. Work/Money Utility: selfish agents crave wealth (×1.9), normal ones
  //    less (×1.2), and being inside the workday adds a strong context bonus —
  //    unless a power outage makes working pointless.
  const moneyWeight = agent.moralAlignment === 'Selfish' ? 1.9 : 1.2;
  const workTimingBonus = (isWithinWorkday && activeEvent?.type !== 'power_outage') ? 40 : 0;
  const workUtility = moneyDeficit * moneyWeight + workTimingBonus;

  // 4. Social Utility: Extroverts need people ×2.25 more than Introverts.
  const socialWeight = agent.personality === 'Extrovert' ? 1.8 : 0.8;
  const socialUtility = socialDeficit * socialWeight;

  // 5. Relaxation Utility: elevated mood deficits push towards leisure venues.
  const relaxUtility = moodDeficit * 1.1;

  // Rank all five needs and interpret only the winner — but only act on it if
  // it actually clears its own threshold, otherwise stay put (return null).
  const utilities = [
    { type: 'sleep', score: sleepUtility },
    { type: 'eat', score: hungerUtility },
    { type: 'work', score: workUtility },
    { type: 'social', score: socialUtility },
    { type: 'relax', score: relaxUtility },
  ];

  utilities.sort((a, b) => b.score - a.score);
  const topNeed = utilities[0];

  // --- Resolve the winning need into (destination, state, thought) ---------
  if (topNeed.type === 'sleep' && sleepUtility > 50) {
    return {
      destination: agent.homeNodeId || 'home_sunset',
      state: 'SLEEPING',
      thought: 'Heading home to recharge energy in bed.',
      emoji: '🛌'
    };
  }

  if (topNeed.type === 'eat' && hungerUtility > 45) {
    const foodVenues = ['cafe', 'bakery', 'market'];
    const pick = foodVenues[Math.floor(Math.random() * foodVenues.length)];
    return {
      destination: pick,
      state: 'EATING',
      thought: `Craving a warm meal at ${pick}.`,
      emoji: pick === 'cafe' ? '☕' : pick === 'bakery' ? '🥐' : '🍎'
    };
  }

  if (topNeed.type === 'work' && isWithinWorkday && activeEvent?.type !== 'power_outage') {
    const workDest = agent.role === 'builder' ? 'site_solar' : (agent.workNodeId || 'office');
    return {
      destination: workDest,
      state: agent.role === 'builder' ? 'BUILDING' : 'WORKING',
      thought: `Punching in for shift at ${workDest}.`,
      emoji: agent.role === 'builder' ? '🔨' : '💼'
    };
  }

  if (topNeed.type === 'social' && socialUtility > 45) {
    const socialHubs = ['cafe', 'park', 'cinema', 'bakery'];
    const pick = socialHubs[Math.floor(Math.random() * socialHubs.length)];
    return {
      destination: pick,
      state: pick === 'cinema' || pick === 'park' ? 'RELAXING' : 'EATING',
      thought: `Looking to socialize and connect at ${pick}.`,
      emoji: '💬'
    };
  }

  if (topNeed.type === 'relax' && relaxUtility > 45) {
    const relaxHubs = ['park', 'wellness', 'library'];
    const pick = relaxHubs[Math.floor(Math.random() * relaxHubs.length)];
    return {
      destination: pick,
      state: pick === 'wellness' ? 'HEALING' : 'RELAXING',
      thought: `Need peaceful relaxation at ${pick}.`,
      emoji: '🌸'
    };
  }

  return null;
}

export interface EconomicDelta {
  incomeTax?: number;
  salesTax?: number;
  publicExpense?: number;
  privateRevenue?: number;
  publicRevenue?: number;
}

export interface TickEconomy {
  /** Live municipal income-tax rate, e.g. 0.12 */
  incomeTaxRate: number;
  /** Live municipal sales-tax rate, e.g. 0.05 */
  salesTaxRate: number;
  /** Simulation minutes advanced by this logic step (used to pro-rate daily wages) */
  minutesAdvanced: number;
}

export interface ConversationInfo {
  partnerId: string;
  locationType: string;
  locationName: string;
  isMoral: boolean;
}

const DEFAULT_ECONOMY: TickEconomy = {
  incomeTaxRate: 0.12,
  salesTaxRate: 0.05,
  minutesAdvanced: 2,
};

// ---------------------------------------------------------------------------
// SECTION 6: COMMERCIAL CHECKOUT — one shared money path for every venue
// ---------------------------------------------------------------------------

/**
 * Shared checkout for every privately-owned venue (cafe, bakery, market,
 * cinema, wellness). Previously this exact block was copy-pasted five times;
 * now it is one function so the circular economy can only ever behave one way:
 *
 *   1. the customer pays (no affordability checking here — callers decide),
 *   2. the venue books live revenue + a customer,
 *   3. sales tax is deducted straight to the municipality,
 *   4. the after-tax revenue is pocketed by the venue's citizen owner, if
 *      someone owns it (ownership comes from cityMap data).
 */
function checkoutPrivateVisit(
  agent: AgentData,
  loc: LocationNode,
  allAgents: AgentData[],
  price: number,
  salesTaxRate: number,
  economicDelta: EconomicDelta,
): void {
  agent.stats.money -= price;
  loc.revenueToday = (loc.revenueToday || 0) + price;
  loc.customersToday = (loc.customersToday || 0) + 1;
  const salesTax = Math.round(price * salesTaxRate * 100) / 100;
  const netRevenue = price - salesTax;
  economicDelta.salesTax = (economicDelta.salesTax || 0) + salesTax;
  economicDelta.privateRevenue = (economicDelta.privateRevenue || 0) + netRevenue;
  if (loc.ownerAgentId) {
    const owner = allAgents.find(a => a.id === loc.ownerAgentId);
    if (owner) {
      owner.stats.money += netRevenue;
      owner.earningsToday = (owner.earningsToday || 0) + netRevenue;
    }
  }
}

// ---------------------------------------------------------------------------
// SECTION 7: TICK AGENT — one cognitive step for one citizen
// ---------------------------------------------------------------------------

/**
 * ONE cognitive step (≈2 sim-minutes) for ONE agent, invoked by SimulationEngine
 * on the 1-second logic cycle. Reads the world read-only EXCEPT for this agent
 * (and the venue it visits) and returns everything to be applied globally.
 *
 * Pipeline (see the file header for the numbered overview):
 *   1 — traveling agents wait (movementSystem owns locomotion)
 *   2 — chat cooldown / ending a chat
 *   3 — location behaviour: build progress + wages + purchases + healing
 *   4 — natural needs decay while awake
 *   5 — IDLE agents re-plan through evaluateAgentGoal (with a 18% restlessness
 *       roll so workers occasionally wander even mid-state)
 *   6 — proximity chats: moral dilemmas, couple dialogue and relationship
 *       bookkeeping (registerInteraction), producing speech bubbles.
 */
export function tickAgent(
  agent: AgentData,
  allAgents: AgentData[],
  time: SimulationTime,
  activeEvent: CityEvent | null,
  activeSpeechBubbles: SpeechBubble[],
  economy: TickEconomy = DEFAULT_ECONOMY
): {
  speechToAdd: SpeechBubble[];
  soundToPlay?: string;
  notification?: string;
  economicDelta?: EconomicDelta;
  conversation?: ConversationInfo;
  relationshipEvents?: RelationshipEvent[];
} {
  let soundToPlay: string | undefined = undefined;
  let notification: string | undefined = undefined;
  let conversation: ConversationInfo | undefined = undefined;
  let relationshipEvents: RelationshipEvent[] | undefined;
  const createdBubbles: SpeechBubble[] = [];
  const economicDelta: EconomicDelta = {};
  const incomeTaxRate = Math.max(0, economy.incomeTaxRate);
  const salesTaxRate = Math.max(0, economy.salesTaxRate);
  const minutesAdvanced = Math.max(0.01, economy.minutesAdvanced);

  // Weather umbrella check
  agent.isCarryingUmbrella = activeEvent?.type === 'rainstorm' || activeEvent?.type === 'snowstorm';

  // 1. Movement is owned by movementSystem on the high-frequency simulation
  // loop. The logic tick only waits for the arrival state to change.
  if (agent.state === 'TRAVELING') {
    return { speechToAdd: createdBubbles, soundToPlay, notification };
  }

  // 2. Chatting cooldown ticks
  if (agent.chatCooldown > 0) {
    agent.chatCooldown--;
  }

  if (agent.state === 'CHATTING') {
    if (agent.chatCooldown <= 0) {
      agent.state = 'IDLE';
      agent.chattingWithId = null;
    }
    return { speechToAdd: createdBubbles, soundToPlay, notification };
  }

  // 3. Needs Satisfaction & Behavior at Location
  if (agent.currentLocationId) {
    const loc = CITY_LOCATIONS.find(l => l.id === agent.currentLocationId);

    // Any employee standing at their own workplace during work hours is on
    // shift — including cafe staff, bankers, nurses, police and wellness staff.
    const isWorkerShift = !!loc &&
      isWorkHours(time) &&
      agent.workNodeId === loc.id &&
      loc.type !== 'construction_site' &&
      loc.type !== 'home';

    // --- CONSTRUCTION SITES & BUILDER PROGRESSION ---
    if (loc?.type === 'construction_site') {
      const siteIsActive = loc.status === 'under_construction' || loc.status === 'damaged';
      const builderIsAssigned = !loc.assignedBuilderId || loc.assignedBuilderId === agent.id;

      // Planned plots are not funded yet. Only commissioned/damaged sites can
      // be worked on, which prevents builders from bypassing the planner.
      if (agent.role === 'builder' && siteIsActive && builderIsAssigned) {
        agent.state = 'BUILDING';
        agent.isCarryingHammer = true;

        const previousProgress = loc.buildProgress || 0;
        const buildSpeed = 3.5 * agent.buildSpeedMultiplier;
        const nextProgress = Math.min(100, previousProgress + buildSpeed);
        loc.buildProgress = nextProgress;

        // Persist under_construction while work is ongoing.
        if (nextProgress < 100) {
          loc.status = 'under_construction';
        }

        // Gain Builder XP
        agent.xp += 12;
        agent.stats.energy = Math.max(10, agent.stats.energy - 1.5);
        agent.stats.hunger = Math.max(10, agent.stats.hunger - 1.2);
        agent.currentThought = `Erecting scaffolding & structural framing (${Math.round(nextProgress)}%).`;
        agent.thoughtEmoji = '🔨';

        // XP Leveling up check
        const nextLevelXP = agent.level * 100;
        if (agent.xp >= nextLevelXP && agent.level < 5) {
          agent.level++;
          agent.buildSpeedMultiplier += 0.25;
          agent.rankTitle = agent.level >= 4 ? 'Master Architect' : agent.level === 3 ? 'Senior Contractor' : 'Journeyman Builder';
          agent.memoryStream.unshift(
            createMemory(time, 'build', `Level Up! Promoted to ${agent.rankTitle} (Level ${agent.level}). Construction speed +25%!`, 'high')
          );
          soundEngine.playCoinSound();
          notification = `👷 ${agent.name} leveled up to Level ${agent.level}! Rank: ${agent.rankTitle}`;
        }

        // Project Completion Milestone — fires exactly once, on the transition
        // from <100 to 100. The old code marked the site completed first, so
        // this branch was unreachable.
        if (nextProgress >= 100 && previousProgress < 100) {
          loc.status = 'completed';
          loc.buildProgress = 100;
          loc.assignedBuilderId = null;
          agent.activeProjectId = null;
          agent.isCarryingHammer = false;
          agent.state = 'IDLE';

          // Moral Pricing & Economic Impact
          const baseFee = loc.constructionCost || 200;
          let fee = baseFee;
          let moralNote = '';

          if (agent.moralAlignment === 'Altruistic') {
            fee = Math.round(baseFee * 0.7); // 30% Altruistic discount for public good
            moralNote = `Delivered ${loc.name} at a 30% civic discount ($${fee}). Citizens rejoice!`;
          } else if (agent.moralAlignment === 'Selfish') {
            fee = Math.round(baseFee * 1.6); // 60% price gouging
            moralNote = `Price-gouged the contract for ${loc.name}, taking a handsome profit of $${fee}.`;
          } else {
            moralNote = `Successfully completed ${loc.name} at standard union rate ($${fee}).`;
          }

          const builderTax = Math.round(fee * incomeTaxRate * 10) / 10;
          const builderNet = fee - builderTax;
          agent.stats.money += builderNet;
          agent.taxesPaidTotal = (agent.taxesPaidTotal || 0) + builderTax;
          agent.earningsToday = (agent.earningsToday || 0) + builderNet;

          economicDelta.incomeTax = (economicDelta.incomeTax || 0) + builderTax;
          // The funder already paid constructionCost when commissioning the
          // project, so charging the treasury again here double-counted it.

          agent.memoryStream.unshift(
            createMemory(time, 'build', moralNote, 'high')
          );
          soundEngine.playEventHorn();
          notification = `🎉 ${loc.name} has been completed by ${agent.name}! ${moralNote}`;
        }
      } else if (agent.role === 'builder' && loc.status === 'planned') {
        agent.currentThought = `${loc.name} is waiting for municipal/private funding.`;
        agent.thoughtEmoji = '📋';
      }
    }
    // --- RESIDENTIAL HOMES (SLEEP & REST) ---
    else if (loc?.type === 'home') {
      if (agent.state === 'SLEEPING') {
        agent.stats.energy = Math.min(100, agent.stats.energy + 10);
        agent.stats.hunger = Math.max(10, agent.stats.hunger - 0.4);
        agent.stats.mood = Math.min(100, agent.stats.mood + 3);
        agent.currentThought = 'Sleeping peacefully in cozy bed.';
        agent.thoughtEmoji = '💤';

        if (agent.stats.energy >= 95 && (time.hour >= 7 && time.hour < 22)) {
          agent.state = 'IDLE';
          agent.currentThought = 'Woke up fully refreshed and energized!';
          agent.thoughtEmoji = '☀️';
          agent.memoryStream.unshift(
            createMemory(time, 'need', 'Woke up from a restful sleep, feeling 100% recharged.', 'medium')
          );
        }
      } else {
        agent.stats.energy = Math.min(100, agent.stats.energy + 4);
        agent.currentThought = 'Resting in the residential lounge.';
        agent.thoughtEmoji = '🛋️';
      }
    }
    // --- WORKPLACES (WAGES, LIVE INCOME TAX & CIRCULAR ECONOMY) ---
    else if (isWorkerShift && loc) {
      if (activeEvent?.type === 'power_outage' && loc.sector === 'economic') {
        agent.state = 'IDLE';
        agent.currentThought = 'Workplace power is down! Pausing sprint.';
        agent.thoughtEmoji = '⚡';
      } else {
        agent.stats.energy = Math.max(0, agent.stats.energy - 2.5);
        agent.stats.hunger = Math.max(0, agent.stats.hunger - 1.8);

        // Daily wage is pro-rated across an 8-hour (480 sim-minute) shift, so
        // the treasury is not drained once per real second. The rate comes
        // from the live municipal tax slider.
        const wageShare = Math.min(1, minutesAdvanced / 480);
        const grossWage = Math.round((agent.dailyWage || 18) * wageShare * 100) / 100;
        const incomeTax = Math.round(grossWage * incomeTaxRate * 100) / 100;
        const netWage = Math.round((grossWage - incomeTax) * 100) / 100;

        agent.stats.money += netWage;
        agent.taxesPaidTotal = (agent.taxesPaidTotal || 0) + incomeTax;
        agent.earningsToday = (agent.earningsToday || 0) + netWage;
        agent.stats.social = Math.max(0, agent.stats.social - 0.8);
        agent.xp += 5;
        agent.currentThought = `Productive work shift ($+${netWage.toFixed(2)}, ${Math.round(incomeTaxRate * 100)}% tax: $${incomeTax.toFixed(2)}).`;
        agent.thoughtEmoji = '💼';

        economicDelta.incomeTax = (economicDelta.incomeTax || 0) + incomeTax;
        if (loc.ownership === 'public') {
          economicDelta.publicExpense = (economicDelta.publicExpense || 0) + grossWage;
        }

        if (Math.random() < 0.08) soundToPlay = 'coin';

        if (agent.stats.energy <= 20) {
          agent.state = 'IDLE';
          agent.currentThought = 'Exhausted from shift, heading home to rest.';
          agent.thoughtEmoji = '🥱';
        }
      }
    }
    // --- CAFE & BAKERY (FOOD, COMMERCE & SALES TAX) ---
    else if (loc?.type === 'cafe') {
      agent.stats.hunger = Math.min(100, agent.stats.hunger + 30);
      agent.stats.energy = Math.min(100, agent.stats.energy + 5);
      agent.stats.mood = Math.min(100, agent.stats.mood + 5);
      agent.stats.social = Math.min(100, agent.stats.social + 4);
      // Coffee is free for everyone during a promotion event (price 0 → no visit checkout).
      const price = activeEvent?.type === 'coffee_promo' ? 0 : (loc.servicePrice || 3);
      if (price > 0 && agent.stats.money >= price) {
        checkoutPrivateVisit(agent, loc, allAgents, price, salesTaxRate, economicDelta);
      }
      agent.currentThought = 'Sipping artisan coffee & hot pastries at Cozy Cafe.';
      agent.thoughtEmoji = '☕';
    }
    else if (loc?.type === 'bakery') {
      agent.stats.hunger = Math.min(100, agent.stats.hunger + 35);
      agent.stats.energy = Math.min(100, agent.stats.energy + 6);
      agent.stats.mood = Math.min(100, agent.stats.mood + 6);
      const price = loc.servicePrice || 3;
      if (agent.stats.money >= price) {
        checkoutPrivateVisit(agent, loc, allAgents, price, salesTaxRate, economicDelta);
      }
      agent.currentThought = 'Enjoying warm croissants & freshly baked treats.';
      agent.thoughtEmoji = '🥐';
    }
    // --- MARKET (GROCERIES & COMMERCE) ---
    else if (loc?.type === 'market') {
      agent.stats.hunger = Math.min(100, agent.stats.hunger + 25);
      agent.stats.mood = Math.min(100, agent.stats.mood + 4);
      const price = loc.servicePrice || 3;
      if (agent.stats.money >= price) {
        checkoutPrivateVisit(agent, loc, allAgents, price, salesTaxRate, economicDelta);
      }
      agent.currentThought = 'Browsing fresh artisan produce & organic groceries.';
      agent.thoughtEmoji = '🍎';
    }
    // --- PARK (RELAXATION & NATURE - PUBLIC MUNICIPAL) ---
    else if (loc?.type === 'park') {
      agent.stats.mood = Math.min(100, agent.stats.mood + 6);
      agent.stats.social = Math.min(100, agent.stats.social + 3);
      agent.stats.energy = Math.min(100, agent.stats.energy + 2);
      agent.currentThought = 'Strolling around the grand lagoon & watching swans.';
      agent.thoughtEmoji = '🌿';
    }
    // --- CINEMA (EVENING ENTERTAINMENT - PRIVATE) ---
    else if (loc?.type === 'cinema') {
      agent.stats.mood = Math.min(100, agent.stats.mood + 9);
      agent.stats.social = Math.min(100, agent.stats.social + 4);
      const price = loc.servicePrice || 4;
      if (agent.stats.money >= price) {
        checkoutPrivateVisit(agent, loc, allAgents, price, salesTaxRate, economicDelta);
      }
      agent.currentThought = 'Watching cinematic premiere & playing arcade games.';
      agent.thoughtEmoji = '🍿';
    }
    // --- HEALTHCARE & CLINIC (PUBLIC SECTOR MUNICIPAL) ---
    else if (loc?.type === 'hospital') {
      agent.stats.mood = Math.min(100, agent.stats.mood + 8);
      agent.stats.energy = Math.min(100, agent.stats.energy + 10);
      // Public healthcare: the small copay flows to MUNICIPAL revenue
      // (publicRevenue), not through the private sales-tax pipeline.
      const copay = loc.servicePrice || 2;
      if (agent.stats.money >= copay) {
        agent.stats.money -= copay;
        loc.revenueToday = (loc.revenueToday || 0) + copay;
        loc.customersToday = (loc.customersToday || 0) + 1;
        economicDelta.publicRevenue = (economicDelta.publicRevenue || 0) + copay;
      }
      agent.currentThought = 'Receiving subsidized public healthcare recovery.';
      agent.thoughtEmoji = '🩺';
    }
    else if (loc?.type === 'wellness') {
      agent.stats.mood = Math.min(100, agent.stats.mood + 8);
      agent.stats.energy = Math.min(100, agent.stats.energy + 8);
      const price = loc.servicePrice || 5;
      if (agent.stats.money >= price) {
        checkoutPrivateVisit(agent, loc, allAgents, price, salesTaxRate, economicDelta);
      }
      agent.currentThought = 'Relaxing in private hydrotherapy & wellness lounge.';
      agent.thoughtEmoji = '💆';
    }
    // --- FINANCIAL BANK ---
    else if (loc?.type === 'bank') {
      agent.stats.mood = Math.min(100, agent.stats.mood + 4);
      // Only well-off visitors (>$260) put $15 of excess cash aside — a small
      // wealth sink that keeps rich citizens from hoarding forever.
      if (agent.stats.money > 260) {
        agent.stats.money -= 15;
        soundToPlay = 'coin';
      }
      agent.currentThought = 'Auditing financial portfolio & savings vault.';
      agent.thoughtEmoji = '🏦';
    }
  }

  // 4. Natural Needs Decay (per logic tick when awake)
  if (agent.state !== 'SLEEPING') {
    agent.stats.energy = Math.max(0, agent.stats.energy - 0.35);
    agent.stats.hunger = Math.max(0, agent.stats.hunger - 0.45);
    agent.stats.social = Math.max(0, agent.stats.social - 0.35);
    
    // Low hunger penalty
    if (agent.stats.hunger < 25) {
      agent.stats.mood = Math.max(5, agent.stats.mood - 0.5);
    } else {
      agent.stats.mood = Math.max(10, agent.stats.mood - 0.1);
    }
  }

  // 5. Utility-Based Goal Engine Selection
  if (agent.state === 'IDLE' || (agent.state !== 'SLEEPING' && agent.state !== 'BUILDING' && Math.random() < 0.18)) {
    const goal = evaluateAgentGoal(agent, time, activeEvent);
    if (goal && goal.destination !== agent.currentLocationId) {
      sendAgentToLocation(agent, goal.destination, time);
      agent.state = 'TRAVELING';
      agent.currentThought = goal.thought;
      agent.thoughtEmoji = goal.emoji;
    }
  }

  // 6. Throttled Proximity & Moral Problem-Solving Interactions
  if (
    agent.state !== 'TRAVELING' && 
    agent.state !== 'SLEEPING' && 
    agent.chatCooldown <= 0
  ) {
    // Optimized nearest neighbor check
    const nearbyAgent = allAgents.find(other => {
      if (other.id === agent.id) return false;
      if (other.state === 'TRAVELING' || other.state === 'SLEEPING') return false;
      if (other.chatCooldown > 0) return false;
      return Math.hypot(other.x - agent.x, other.y - agent.y) < 70;
    });

    if (nearbyAgent && Math.random() < 0.28) {
      agent.state = 'CHATTING';
      agent.chattingWithId = nearbyAgent.id;
      agent.chatCooldown = 30; // ~6 simulation ticks

      nearbyAgent.state = 'CHATTING';
      nearbyAgent.chattingWithId = agent.id;
      nearbyAgent.chatCooldown = 30;

      agent.stats.social = Math.min(100, agent.stats.social + 15);
      nearbyAgent.stats.social = Math.min(100, nearbyAgent.stats.social + 15);

      const curLoc = CITY_LOCATIONS.find(l => l.id === agent.currentLocationId);
      const locType = curLoc?.type || 'street';
      const locName = curLoc?.name || 'Avenue';

      // --- MORAL DILEMMA CHECK: Altruism vs Selfishness ---
      const neighborInCrisis = nearbyAgent.stats.hunger < 25 || nearbyAgent.stats.money < 20 || nearbyAgent.stats.energy < 20;

      let customTextA: string | null = null;
      let customTextB: string | null = null;
      let isMoralExchange = false;

      if (neighborInCrisis) {
        if (agent.moralAlignment === 'Altruistic' && agent.stats.money >= 20) {
          // Altruistic aid
          agent.stats.money -= 20;
          nearbyAgent.stats.money += 20;
          nearbyAgent.stats.hunger = Math.min(100, nearbyAgent.stats.hunger + 30);
          agent.stats.mood = Math.min(100, agent.stats.mood + 12);
          nearbyAgent.stats.mood = Math.min(100, nearbyAgent.stats.mood + 15);

          // Update trust score
          nearbyAgent.trustScores[agent.id] = (nearbyAgent.trustScores[agent.id] || 0) + 20;

          isMoralExchange = true;
          customTextA = `Hey ${nearbyAgent.name.split(' ')[0]}, you look famished! Take this $20 and grab a warm meal. 🤝`;
          customTextB = `Thank you so much, ${agent.name.split(' ')[0]}! Your kindness saved my day! ❤️`;

          agent.memoryStream.unshift(
            createMemory(time, 'moral', `Altruistic deed: Donated $20 to help ${nearbyAgent.name} during hardship.`, 'high', { targetAgentId: nearbyAgent.id, delta: 20 })
          );
          nearbyAgent.memoryStream.unshift(
            createMemory(time, 'moral', `Received $20 aid and meal help from generous ${agent.name}. Trust increased (+20)!`, 'high', { targetAgentId: agent.id, delta: 20 })
          );
          soundToPlay = 'coin';
        } else if (agent.moralAlignment === 'Selfish') {
          // Selfish refusal
          isMoralExchange = true;
          nearbyAgent.trustScores[agent.id] = (nearbyAgent.trustScores[agent.id] || 0) - 20;
          customTextA = `Stop begging, ${nearbyAgent.name.split(' ')[0]}. Handouts breed laziness. Go work! 💸`;
          customTextB = `Wow ${agent.name.split(' ')[0]}, so greedy... I won't forget this cold shoulder. 😒`;

          agent.memoryStream.unshift(
            createMemory(time, 'moral', `Refused to give handouts to ${nearbyAgent.name}. Personal wealth comes first.`, 'medium', { targetAgentId: nearbyAgent.id, delta: -10 })
          );
          nearbyAgent.memoryStream.unshift(
            createMemory(time, 'moral', `Asked ${agent.name} for help but got mocked. Trust decreased (-20).`, 'high', { targetAgentId: agent.id, delta: -20 })
          );
        }
      }

      // Default dialogue fallback if no crisis exchange triggered.
      // Every line is generated from BOTH minds (posture, values, dominant
      // need, bond, recent life events) — see mindVoice.ts.
      if (!customTextA || !customTextB) {
        const exchange = generateExchange(agent, nearbyAgent, {
          locationType: locType,
          locationName: locName,
          event: activeEvent,
          language: dialogueManager.getLanguage(),
          day: time.day,
        });
        customTextA = exchange.textA;
        customTextB = exchange.textB;
      }

      // Human relationship bookkeeping: this real contact grows familiarity,
      // warmth, trust — and may spark dating between two compatible singles.
      relationshipEvents = registerInteraction(agent, nearbyAgent, time);

      // Social memory is the data source for the Gazette's "most sociable
      // citizen" analysis. It was previously never written, so that story was
      // permanently static.
      const cleanLine = (line: string) =>
        line.replace(/^[^:]{1,60}:\s*/, '').replace(/^["']|["']$/g, '').trim().slice(0, 180);

      agent.memoryStream.unshift(
        createMemory(
          time,
          'social',
          `Conversed with ${nearbyAgent.name} at ${locName}: "${cleanLine(customTextA)}"`,
          'medium',
          { targetAgentId: nearbyAgent.id, delta: isMoralExchange ? 10 : 3 }
        )
      );
      nearbyAgent.memoryStream.unshift(
        createMemory(
          time,
          'social',
          `Conversed with ${agent.name} at ${locName}: "${cleanLine(customTextB)}"`,
          'medium',
          { targetAgentId: agent.id, delta: isMoralExchange ? 10 : 3 }
        )
      );
      if (agent.memoryStream.length > 80) agent.memoryStream.pop();
      if (nearbyAgent.memoryStream.length > 80) nearbyAgent.memoryStream.pop();

      conversation = {
        partnerId: nearbyAgent.id,
        locationType: locType,
        locationName: locName,
        isMoral: isMoralExchange,
      };

      const now = Date.now();
      createdBubbles.push(
        {
          id: `bubble_${now}_A`,
          speakerId: agent.id,
          targetId: nearbyAgent.id,
          text: customTextA,
          duration: 5000,
          startTime: now,
          color: agent.color
        },
        {
          id: `bubble_${now}_B`,
          speakerId: nearbyAgent.id,
          targetId: agent.id,
          text: customTextB,
          duration: 5000,
          startTime: now + 500,
          color: nearbyAgent.color
        }
      );

      soundToPlay = soundToPlay || 'chat';
    }
  }

  return { speechToAdd: createdBubbles, soundToPlay, notification, economicDelta, conversation, relationshipEvents };
}
