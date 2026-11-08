import {
  AgentData,
  Gender,
  MemoryEntry,
  MoralAlignment,
  PersonalityTrait,
  SimulationTime,
} from '../types/simulation';

/**
 * ============================================================================
 *  HUMAN RELATIONSHIPS & FAMILY LIFE
 * ============================================================================
 *
 *  This module is the single source of truth for human life in AgentVille:
 *  friendship, courtship, marriage, pregnancy, birth and aging.
 *
 *  Design principles (deliberately human, not mechanical):
 *
 *  1. ATTRACTION IS DNA, NOT MOOD
 *     Each pair of citizens has a fixed "chemistry" derived deterministically
 *     from their IDs (the same two people always have the same spark), blended
 *     with personality compatibility, moral values and age compatibility.
 *
 *  2. BONDS GROW FROM REAL CONTACT
 *     Every chat (registerInteraction) grows familiarity, warmth and trust.
 *     Romance can only spark between two SINGLE, ADULT, UNRELATED citizens
 *     whose attraction exceeds a threshold. No contact = the bond decays.
 *
 *  3. COURTSHIP HAS STAGES, NOT TELEPORTS
 *     stranger -> acquaintance -> friend -> dating -> engaged -> married.
 *     Each milestone needs time AND a healthy bond, then a probabilistic
 *     "life event" roll each day. Couples who neglect each other break up.
 *
 *  4. REPRODUCTION REALISTIC CRITERIA (all must hold, evaluated daily):
 *       - a married couple (both spouses committed to each other)
 *       - opposite biological sexes
 *       - mother aged 18-42, father aged 18-60
 *       - mother not already pregnant
 *       - >= 60 days since the mother's last birth, < 4 kids per couple
 *       - family wealth >= 150, average mood >= 46, mother energy >= 35
 *       - mother not starving
 *       - population below the city cap
 *     ...and then a weighted chance per day (stability, wealth, mood).
 *     Pregnancy lasts 30 sim-days; children reach adulthood after 18 sim-days
 *     on an accelerated clock, so a whole generation is observable in one
 *     sitting instead of requiring ~2 simulated years.
 *
 *  5. CHILDREN ARE PEOPLE
 *     Newborns inherit a blended color, personality (with mutation) and moral
 *     tendency from their parents, carry the family surname, and are linked
 *     to parents + siblings so future generations inherit the family web.
 *     They live a child's day (school / park / home) and grow into adults.
 *
 *  HOW THE ENGINE USES THIS MODULE
 *       - on start:              initializeRelationships() seeds couples
 *       - on every agent chat:   registerInteraction() (agentLogic.tickAgent)
 *       - on every new sim-day:  processDailyRelationships()
 *       - birth events:          engine spawns the child via spawnNewborn()
 *       - inspector UI reads:    getFamilyView(), getRelationshipSummaries()
 *       - couples who chat:      generateRomanticExchange() warm dialogue
 */

// ---------------------------------------------------------------------------
// SECTION 1: PUBLIC TYPES
// ---------------------------------------------------------------------------

/** Lifecycle of one bond between two citizens. */
export type RelationshipStage =
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'dating'
  | 'engaged'
  | 'married';

/** Full state of one pair. Stored in the module-level map, keyed by pair. */
export interface Relationship {
  id: string;          // "aId::bId" with sorted IDs — same pair, one key
  aId: string;
  bId: string;
  familiarity: number; // 0..100  — how well they know each other
  affinity: number;    // -100..100 — warmth / emotional bond
  trust: number;       // -100..100 — built by kind deeds, burned by refusals
  romance: number;     // 0..100  — only grows for eligible romantic pairs
  attraction: number;  // 0..100  — stable pair chemistry (never rerolled)
  stage: RelationshipStage;
  relationshipStartDay: number | null; // first day of dating
  engagementStartDay: number | null;
  marriageDay: number | null;
  lastInteractionDay: number;
  interactions: number;
}

/** Everything the engine needs to spawn a real child citizen. */
export interface NewbornProfile {
  id: string;
  name: string;
  gender: Gender;
  age: number;         // always 0 at birth
  birthDay: number;    // simulation day of birth
  color: string;       // blend of both parents' colors
  avatarEmoji: string; // '🧒' until adulthood
  personality: PersonalityTrait;
  moralAlignment: MoralAlignment;
  moralScore: number;
  parentIds: string[];
  motherId: string;
  fatherId: string;    // '' when unknown (single-parent birth)
  homeNodeId: string;  // the family home
  siblingIds: string[];
}

export type RelationshipEventType =
  | 'dating'
  | 'engaged'
  | 'married'
  | 'breakup'
  | 'pregnancy'
  | 'birth';

/** A milestone the simulation produced; the engine announces + applies it. */
export interface RelationshipEvent {
  type: RelationshipEventType;
  message: string;      // human-readable notification line
  icon: string;
  agentIds: string[];   // everyone involved (incl. the newborn for births)
  childProfile?: NewbornProfile; // present on 'birth' events only
}

/** UI-read summary of one bond, for the inspector's "Closest Bonds" list. */
export interface RelationshipSummary {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerColor: string;
  stage: RelationshipStage;
  stageLabel: string;
  attraction: number;
  affinity: number;
  romance: number;
  trust: number;
  familiarity: number;
  lastInteractionDay: number;
}

/** Everything the inspector shows about one citizen's family situation. */
export interface FamilyView {
  age: number;
  partner: AgentData | null;   // dating / engaged partner
  spouse: AgentData | null;    // married partner
  parents: AgentData[];
  children: AgentData[];
  siblings: AgentData[];
  pregnant: boolean;
  pregnancyDaysElapsed: number | null;
  pregnancyDaysRemaining: number | null;
  pregnancyPartnerName: string | null;
}

// ---------------------------------------------------------------------------
// SECTION 2: TUNABLE HUMAN-RULES CONSTANTS
// ---------------------------------------------------------------------------

export const RELATIONSHIP_CONSTANTS = {
  // Courtship eligibility
  adultAge: 18,
  maxDatingAgeGap: 12,          // years — realistic dating window
  minAttractionForRomance: 56,  // below this, a pair stays platonic forever

  // Milestone gates (time AND bond quality).
  // NOTE: one simulation day is ~12 real minutes at 1x, so these are tuned so a
  // full courtship (friend → dating → engaged → married) fits in ~3 weeks of
  // simulated life instead of a whole simulated year.
  datingToEngagementDays: 6,
  engagementToMarriageDays: 4,
  minRomanceForEngagement: 68,
  minRomanceForMarriage: 72,
  breakupRomanceThreshold: 10,  // engagement/romance under this = drift apart
  engagementBreakupRomance: 18, // a cold engagement below this is called off
  engagementBreakupAffinity: 8,

  // Reproduction (all criteria must hold; see header note #4)
  pregnancyDays: 30,            // ~1 month of simulation time
  minMotherAge: 18,
  maxMotherAge: 42,
  minFatherAge: 18,
  maxFatherAge: 60,
  maxChildrenPerCouple: 4,
  childSpacingDays: 60,         // min. gap between pregnancies for one mother

  // Children grow on an accelerated clock so a generation is observable inside
  // one sitting: `childhoodDays` sim-days after birth they turn 18 and start a
  // normal adult life (their birthDay is re-stamped onto the standard calendar).
  childhoodDays: 18,
  minFamilyWealth: 150,
  minFamilyMood: 46,
  minMotherEnergy: 35,
  conceptionBaseChance: 0.18,   // per day, before stability/wealth/mood modifiers
  populationCap: 90,

  // Decay ("out of sight, out of mind")
  decayPerIdleDay: 0.4,         // scales with each idle day, capped at 4
} as const;

/**
 * Personality compatibility matrix (0..100, symmetric).
 * Read as PERSONALITY_COMPATIBILITY[a][b]: how naturally two temperaments fit.
 * e.g. Empathetic+Empathetic = 82 (deep mutual care),
 *      Ambitious+Empathetic  = 42 (drive vs. care friction).
 */
const PERSONALITY_COMPATIBILITY: Record<PersonalityTrait, Record<PersonalityTrait, number>> = {
  Creative:   { Creative: 78, Ambitious: 62, Introvert: 60, Extrovert: 72, Empathetic: 76, Analytical: 58, Chill: 68 },
  Ambitious:  { Creative: 62, Ambitious: 55, Introvert: 45, Extrovert: 60, Empathetic: 42, Analytical: 68, Chill: 40 },
  Introvert:  { Creative: 60, Ambitious: 45, Introvert: 80, Extrovert: 48, Empathetic: 68, Analytical: 70, Chill: 72 },
  Extrovert:  { Creative: 72, Ambitious: 60, Introvert: 48, Extrovert: 76, Empathetic: 74, Analytical: 42, Chill: 66 },
  Empathetic: { Creative: 76, Ambitious: 42, Introvert: 68, Extrovert: 74, Empathetic: 82, Analytical: 55, Chill: 74 },
  Analytical: { Creative: 58, Ambitious: 68, Introvert: 70, Extrovert: 42, Empathetic: 55, Analytical: 72, Chill: 52 },
  Chill:      { Creative: 68, Ambitious: 40, Introvert: 72, Extrovert: 66, Empathetic: 74, Analytical: 52, Chill: 80 },
};

/** Known first names → gender. Lets every citizen get a sensible gender. */
const FEMALE_NAMES = new Set([
  'sofia', 'elena', 'maya', 'layla', 'chloe', 'zara', 'nina', 'amira', 'hana',
  'samantha', 'zoe', 'fatima', 'grace', 'yasmin', 'clara', 'nadia', 'isabel',
  'noor', 'salma', 'diana', 'sara', 'lina', 'nora', 'amal', 'mila', 'aya',
  'yara', 'emma', 'leila', 'mariam', 'olivia', 'ava',
]);
const MALE_NAMES = new Set([
  'alex', 'marcus', 'patrick', 'oliver', 'viktor', 'leo', 'tariq', 'julian',
  'omar', 'lucas', 'ethan', 'felix', 'liam', 'karim', 'dylan', 'ryan',
  'brandon', 'arthur', 'kevin', 'david', 'adam', 'zain', 'yusuf', 'noah',
  'ali', 'samir', 'kareem', 'elias', 'rami', 'daniel', 'john', 'james',
]);

/** Name pools for newborns (children keep the family surname). */
const CHILD_FEMALE_NAMES = ['Lina', 'Nora', 'Amal', 'Sara', 'Mila', 'Aya', 'Yara', 'Hana', 'Emma', 'Leila', 'Mariam', 'Olivia'];
const CHILD_MALE_NAMES = ['Adam', 'Omar', 'Zain', 'Yusuf', 'Noah', 'Ali', 'Samir', 'Kareem', 'Leo', 'Elias', 'Rami', 'Daniel'];

const ALL_PERSONALITIES: PersonalityTrait[] = [
  'Creative', 'Ambitious', 'Introvert', 'Extrovert', 'Empathetic', 'Analytical', 'Chill',
];

/**
 * The relationship store. Module-level on purpose: bonds exist between
 * citizens, not inside them, and survive the same session even if the pair
 * only meets occasionally. Key = sorted "aId::bId" so lookup order never
 * matters.
 */
const relationshipStore = new Map<string, Relationship>();

let childCounter = 0; // unique child ids across the whole session

// ---------------------------------------------------------------------------
// SECTION 3: SMALL PURE HELPERS
// ---------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join('::');
}

/**
 * Stable per-pair chemistry (FNV-1a hash of the sorted pair, 0..99).
 * Deterministic: Elen+Zara will never "reroll" their spark between sessions
 * of the same simulation, yet different pairs get varied chemistry.
 */
function pairChemistry(aId: string, bId: string): number {
  const source = [aId, bId].sort().join('|');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

/**
 * How well two moral alignments coexist as partners.
 * Same strong values attract; altruist + selfish actively repel (14).
 */
function moralSynergy(a: MoralAlignment, b: MoralAlignment): number {
  if (a === b) return a === 'Neutral' ? 52 : 72;
  if ((a === 'Altruistic' && b === 'Selfish') || (a === 'Selfish' && b === 'Altruistic')) {
    return 14;
  }
  return 55;
}

/**
 * Derive a gender from a citizen's first name. Falls back to a deterministic
 * split for unknown names so custom spawns still get varied genders.
 */
export function inferGender(name: string): Gender {
  const first = name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
  if (FEMALE_NAMES.has(first)) return 'female';
  if (MALE_NAMES.has(first)) return 'male';
  return (first.length + first.charCodeAt(0)) % 2 === 0 ? 'female' : 'male';
}

/**
 * Current age in years, derived ONLY from birthDay (365 sim-days = 1 year).
 *
 * WARNING: never add the stored `agent.age` to elapsed years — agent.age is
 * the snapshot taken when birthDay was assigned, so summing them
 * double-counts every year and instantly ages mothers out of their fertile
 * window (this exact bug was found and fixed during verification).
 */
export function getAgentAge(agent: AgentData, currentDay: number): number {
  if (agent.birthDay == null) {
    return Math.max(0, agent.age ?? 25); // legacy fallback, no birth day known
  }
  const elapsedDays = Math.max(0, currentDay - agent.birthDay);

  // Children grow on an accelerated clock: `childhoodDays` simulation days
  // take them from 0 to 18. Without this a child would need 18 * 365 sim-days
  // to become an adult, i.e. generations were unobservable in practice.
  if (agent.isChild) {
    const adultAge = RELATIONSHIP_CONSTANTS.adultAge;
    return Math.min(
      adultAge - 1,
      Math.floor((elapsedDays / RELATIONSHIP_CONSTANTS.childhoodDays) * adultAge),
    );
  }

  return Math.floor(elapsedDays / 365);
}

export function isAdult(agent: AgentData, currentDay: number): boolean {
  return !agent.isChild && getAgentAge(agent, currentDay) >= RELATIONSHIP_CONSTANTS.adultAge;
}

/**
 * Pair chemistry 0..100, blended from four human factors plus a small
 * bonus for neighbours (people who literally live around the corner).
 */
export function computeAttraction(a: AgentData, b: AgentData): number {
  const personality = PERSONALITY_COMPATIBILITY[a.personality][b.personality];
  const moral = moralSynergy(a.moralAlignment, b.moralAlignment);
  const ageGap = Math.abs((a.age ?? 25) - (b.age ?? 25));
  const ageScore = clamp(100 - ageGap * 6, 0, 100); // 6 minors per year of gap
  const chemistry = pairChemistry(a.id, b.id);
  const sharedHome = a.homeNodeId === b.homeNodeId ? 6 : 0;

  return clamp(
    Math.round(personality * 0.32 + moral * 0.24 + ageScore * 0.18 + chemistry * 0.26 + sharedHome),
    0,
    100,
  );
}

/** Direct family link (parent/child/sibling). Romance between them: never. */
export function isFamily(a: AgentData, b: AgentData): boolean {
  return (
    a.parentIds.includes(b.id) || b.parentIds.includes(a.id) ||
    a.childIds.includes(b.id) || b.childIds.includes(a.id) ||
    a.siblingIds.includes(b.id) || b.siblingIds.includes(a.id)
  );
}

/**
 * Human courtship gate-keeping. Returns WHY a pair cannot date, so future
 * features (UI hints, debug tools) can display the reason.
 */
export function canBeRomantic(
  a: AgentData,
  b: AgentData,
  currentDay: number,
): { ok: boolean; reason?: string } {
  if (a.id === b.id) return { ok: false, reason: 'same person' };
  if (a.isChild || b.isChild) return { ok: false, reason: 'children cannot date' };
  if (!isAdult(a, currentDay) || !isAdult(b, currentDay)) {
    return { ok: false, reason: 'both must be adults' };
  }
  if (isFamily(a, b)) return { ok: false, reason: 'family members' };
  if (a.spouseId || b.spouseId) return { ok: false, reason: 'already married' };
  if ((a.partnerId && a.partnerId !== b.id) || (b.partnerId && b.partnerId !== a.id)) {
    return { ok: false, reason: 'already in a relationship' };
  }
  if (Math.abs(getAgentAge(a, currentDay) - getAgentAge(b, currentDay)) > RELATIONSHIP_CONSTANTS.maxDatingAgeGap) {
    return { ok: false, reason: 'incompatible age gap' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SECTION 4: RELATIONSHIP STORE (GET / CREATE)
// ---------------------------------------------------------------------------

/** Get the unique bond record for a pair, creating a fresh one if needed. */
function ensureRelationship(a: AgentData, b: AgentData, currentDay: number): Relationship {
  const id = pairKey(a.id, b.id);
  let relationship = relationshipStore.get(id);

  if (!relationship) {
    const [aId, bId] = [a.id, b.id].sort();
    relationship = {
      id,
      aId,
      bId,
      familiarity: 0,
      affinity: 0,
      trust: 0,
      romance: 0,
      attraction: computeAttraction(a, b), // chemistry is fixed at first sight
      stage: 'stranger',
      relationshipStartDay: null,
      engagementStartDay: null,
      marriageDay: null,
      lastInteractionDay: currentDay,
      interactions: 0,
    };
    relationshipStore.set(id, relationship);
  }

  return relationship;
}

/** Peek at an existing bond without creating one (used for dialogue flavor). */
export function getRelationshipBetween(a: AgentData, b: AgentData): Relationship | null {
  return relationshipStore.get(pairKey(a.id, b.id)) ?? null;
}

/** Write an episodic memory, trimmed to the same 35-entry cap as the rest of the sim. */
function addMemory(
  agent: AgentData,
  time: SimulationTime,
  category: MemoryEntry['category'],
  text: string,
  importance: MemoryEntry['importance'] = 'medium',
) {
  agent.memoryStream.unshift({
    id: `mem_rel_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timeString: time.timeString,
    day: time.day,
    simMinute: time.totalMinutes,
    category,
    text,
    importance,
  });
  if (agent.memoryStream.length > 80) agent.memoryStream.pop();
}

/** Advance to a milestone stage and stamp the correct start-day field. */
function setStage(relationship: Relationship, stage: RelationshipStage, day: number) {
  relationship.stage = stage;
  if (stage === 'dating') relationship.relationshipStartDay = day;
  if (stage === 'engaged') relationship.engagementStartDay = day;
  if (stage === 'married') relationship.marriageDay = day;
}

/** End a romance: stage falls back to 'friend', romance is wiped. */
function breakUp(relationship: Relationship, a: AgentData, b: AgentData, time: SimulationTime): RelationshipEvent {
  relationship.stage = 'friend';
  relationship.romance = 0;
  relationship.affinity = Math.max(0, relationship.affinity - 20);
  relationship.relationshipStartDay = null;
  relationship.engagementStartDay = null;
  relationship.marriageDay = null;

  if (a.partnerId === b.id) a.partnerId = null;
  if (b.partnerId === a.id) b.partnerId = null;

  addMemory(a, time, 'social', `Broke up with ${b.name}. The spark faded and the relationship ended.`, 'high');
  addMemory(b, time, 'social', `Broke up with ${a.name}. We decided to go our separate ways.`, 'high');

  return {
    type: 'breakup',
    message: `💔 ${a.name} and ${b.name} ended their relationship.`,
    icon: '💔',
    agentIds: [a.id, b.id],
  };
}

// ---------------------------------------------------------------------------
// SECTION 5: LIVE CONTACT (called on every real chat)
// ---------------------------------------------------------------------------

/**
 * Record one genuine social contact between two citizens.
 *
 * Grows familiarity / warmth / trust by how compatible they are and how good
 * their moods are. Strangers become acquaintances, acquaintances become
 * friends — and if chemistry allows, feelings can spill into a first date.
 *
 * Returns the milestones produced by THIS contact (e.g. "started dating") so
 * the engine can announce them.
 */
export function registerInteraction(
  a: AgentData,
  b: AgentData,
  time: SimulationTime,
): RelationshipEvent[] {
  if (a.id === b.id) return [];

  const day = time.day;
  const relationship = ensureRelationship(a, b, day);
  const events: RelationshipEvent[] = [];
  const family = isFamily(a, b);
  const averageMood = (a.stats.mood + b.stats.mood) / 2;

  // --- Basic bond growth -----------------------------------------------------
  relationship.interactions += 1;
  relationship.familiarity = clamp(relationship.familiarity + 3.2, 0, 100);
  // Warmth grows with chemistry; bad-mood meetings grow it less.
  relationship.affinity = clamp(
    relationship.affinity + (relationship.attraction - 42) / 12 + (averageMood - 50) / 90,
    -100,
    100,
  );
  // Altruists earn trust faster (kind people are easy to trust).
  relationship.trust = clamp(
    relationship.trust + (a.moralAlignment === 'Altruistic' || b.moralAlignment === 'Altruistic' ? 0.9 : 0.45),
    -100,
    100,
  );
  relationship.lastInteractionDay = day;

  // --- Platonic milestones ----------------------------------------------------
  if (relationship.stage === 'stranger' && relationship.familiarity >= 7) {
    relationship.stage = 'acquaintance';
  }
  if (
    (relationship.stage === 'stranger' || relationship.stage === 'acquaintance') &&
    relationship.familiarity >= 18 &&
    relationship.affinity >= 24
  ) {
    relationship.stage = 'friend';
  }

  // Family bonds stop here: kinship grows familiarity, never romance.
  if (family) return events;

  // --- Romance (only for eligible singles) -------------------------------------
  const romanticEligibility = canBeRomantic(a, b, day);

  if (romanticEligibility.ok) {
    const spark = Math.max(0, relationship.attraction - RELATIONSHIP_CONSTANTS.minAttractionForRomance);
    if (spark > 0) {
      relationship.romance = clamp(relationship.romance + 1.2 + spark / 30, 0, 100);
    }

    // The leap from friendship to dating: needs attraction + warmth + enough
    // accumulated feelings, then a probabilistic "ask them out" moment.
    if (
      (relationship.stage === 'acquaintance' || relationship.stage === 'friend') &&
      relationship.attraction >= RELATIONSHIP_CONSTANTS.minAttractionForRomance &&
      relationship.affinity >= 20 &&
      relationship.romance >= 18 &&
      Math.random() < 0.14
    ) {
      setStage(relationship, 'dating', day);
      a.partnerId = b.id;
      b.partnerId = a.id;
      a.stats.mood = clamp(a.stats.mood + 10, 0, 100);
      b.stats.mood = clamp(b.stats.mood + 10, 0, 100);
      addMemory(a, time, 'social', `Started dating ${b.name}. We felt an instant, natural connection.`, 'high');
      addMemory(b, time, 'social', `Started dating ${a.name}. The chemistry was too strong to ignore.`, 'high');
      events.push({
        type: 'dating',
        message: `❤️ ${a.name} and ${b.name} are now dating!`,
        icon: '❤️',
        agentIds: [a.id, b.id],
      });
    }
  }

  // --- Existing couples enjoy each other's company -----------------------------
  if (relationship.stage === 'dating' || relationship.stage === 'engaged') {
    relationship.romance = clamp(relationship.romance + 0.7, 0, 100);
    relationship.affinity = clamp(relationship.affinity + 0.5, -100, 100);
  } else if (relationship.stage === 'married' && (a.spouseId === b.id || b.spouseId === a.id)) {
    relationship.romance = clamp(relationship.romance + 0.45, 0, 100);
    relationship.affinity = clamp(relationship.affinity + 0.6, -100, 100);
  }

  return events;
}

// ---------------------------------------------------------------------------
// SECTION 6: DAILY FAMILY LIFE (called once per simulation day)
// ---------------------------------------------------------------------------

/**
 * The once-a-day heartbeat of human life:
 *   1. every stored bond decays when neglected and advances when healthy
 *   2. married couples may conceive (strict criteria, see header)
 *   3. pregnancies that reached their due day produce a birth event
 *   4. children age; on their 18th "birthday" they become adults
 *
 * Returns events; the engine turns them into notifications + newborn agents.
 */
export function processDailyRelationships(
  agents: AgentData[],
  time: SimulationTime,
): RelationshipEvent[] {
  const day = time.day;
  const events: RelationshipEvent[] = [];
  const byId = new Map(agents.map(agent => [agent.id, agent]));

  // --- 1. Bonds: decay + milestones -------------------------------------------
  for (const relationship of Array.from(relationshipStore.values())) {
    const a = byId.get(relationship.aId);
    const b = byId.get(relationship.bId);
    if (!a || !b) {
      relationshipStore.delete(relationship.id); // a citizen vanished
      continue;
    }

    const idleDays = Math.max(0, day - relationship.lastInteractionDay);
    const cohabiting = a.homeNodeId === b.homeNodeId;

    if (relationship.stage === 'married' && cohabiting) {
      // Married couples living together share daily life: their bond is fed
      // by cohabitation itself and is immune to "no chat" decay.
      relationship.lastInteractionDay = day;
      relationship.affinity = clamp(relationship.affinity + 0.35, -100, 100);
      relationship.romance = clamp(relationship.romance + 0.18, 0, 100);
    } else if (idleDays >= 2) {
      // "Out of sight, out of mind": neglect erodes everything, romance first.
      const decay = Math.min(4, (idleDays - 1) * RELATIONSHIP_CONSTANTS.decayPerIdleDay);
      relationship.familiarity = clamp(relationship.familiarity - decay * 0.45, 0, 100);
      relationship.trust = clamp(relationship.trust - decay * 0.25, -100, 100);
      relationship.affinity = clamp(
        relationship.affinity - decay * (relationship.stage === 'married' ? 0.35 : 0.6),
        -100,
        100,
      );
      if (relationship.stage === 'dating' || relationship.stage === 'engaged' || relationship.stage === 'married') {
        relationship.romance = clamp(
          relationship.romance - decay * (relationship.stage === 'married' ? 0.2 : 0.5),
          0,
          100,
        );
      }
    }

    // Platonic drift (same gates as the live path, slightly friendlier).
    if (relationship.stage === 'stranger' && relationship.familiarity >= 6) {
      relationship.stage = 'acquaintance';
    }
    if (
      (relationship.stage === 'stranger' || relationship.stage === 'acquaintance') &&
      relationship.familiarity >= 20 &&
      relationship.affinity >= 28
    ) {
      relationship.stage = 'friend';
    }

    // --- Dating: either drift to a proposal, or break up ----------------------
    if (relationship.stage === 'dating') {
      const datingDays = relationship.relationshipStartDay != null ? day - relationship.relationshipStartDay : 0;
      const compatibility = PERSONALITY_COMPATIBILITY[a.personality][b.personality];

      if (relationship.romance < RELATIONSHIP_CONSTANTS.breakupRomanceThreshold && relationship.affinity < 5) {
        events.push(breakUp(relationship, a, b, time));
        continue;
      }

      if (
        datingDays >= RELATIONSHIP_CONSTANTS.datingToEngagementDays &&
        relationship.romance >= RELATIONSHIP_CONSTANTS.minRomanceForEngagement &&
        relationship.affinity >= 48 &&
        Math.random() < 0.18 + compatibility / 500
      ) {
        setStage(relationship, 'engaged', day);
        a.partnerId = b.id;
        b.partnerId = a.id;
        a.stats.mood = clamp(a.stats.mood + 8, 0, 100);
        b.stats.mood = clamp(b.stats.mood + 8, 0, 100);
        addMemory(a, time, 'social', `Got engaged to ${b.name}! We are planning a life together.`, 'high');
        addMemory(b, time, 'social', `Got engaged to ${a.name}! A new chapter begins.`, 'high');
        events.push({
          type: 'engaged',
          message: `💍 ${a.name} and ${b.name} are engaged!`,
          icon: '💍',
          agentIds: [a.id, b.id],
        });
      } else {
        // Compatible couples keep falling a little deeper every day.
        relationship.romance = clamp(relationship.romance + 0.2 + compatibility / 1000, 0, 100);
      }
    }

    // --- Engaged: a cold engagement can be called off, a warm one produces a wedding
    if (relationship.stage === 'engaged') {
      const engagedDays = relationship.engagementStartDay != null ? day - relationship.engagementStartDay : 0;
      const compatibility = PERSONALITY_COMPATIBILITY[a.personality][b.personality];

      // Escape hatch: without this an engaged couple whose romance decayed
      // while they stopped meeting was stuck at the altar forever.
      if (
        relationship.romance < RELATIONSHIP_CONSTANTS.engagementBreakupRomance &&
        relationship.affinity < RELATIONSHIP_CONSTANTS.engagementBreakupAffinity
      ) {
        events.push(breakUp(relationship, a, b, time));
        continue;
      }

      if (
        engagedDays >= RELATIONSHIP_CONSTANTS.engagementToMarriageDays &&
        relationship.romance >= RELATIONSHIP_CONSTANTS.minRomanceForMarriage &&
        relationship.affinity >= 52 &&
        Math.random() < 0.22 + compatibility / 500
      ) {
        setStage(relationship, 'married', day);
        a.spouseId = b.id;
        b.spouseId = a.id;
        a.partnerId = null;
        b.partnerId = null;

        // A married couple builds one shared home.
        const sharedHome = a.homeNodeId || b.homeNodeId;
        a.homeNodeId = sharedHome;
        b.homeNodeId = sharedHome;

        a.stats.mood = clamp(a.stats.mood + 12, 0, 100);
        b.stats.mood = clamp(b.stats.mood + 12, 0, 100);
        addMemory(a, time, 'social', `Married ${b.name}. We now share a home and a future.`, 'high');
        addMemory(b, time, 'social', `Married ${a.name}. Our families and friends celebrated with us.`, 'high');
        events.push({
          type: 'married',
          message: `💒 ${a.name} and ${b.name} got married!`,
          icon: '💒',
          agentIds: [a.id, b.id],
        });
      } else {
        // Fiancés who keep seeing each other keep kindling the romance while
        // they plan the wedding, so a healthy engagement always reaches the
        // altar instead of slowly decaying into a dead end.
        relationship.romance = clamp(relationship.romance + 0.25 + compatibility / 1200, 0, 100);
        relationship.affinity = clamp(relationship.affinity + 0.15, -100, 100);
      }
    }

    // --- Married: daily family planning opportunity ---------------------------
    if (relationship.stage === 'married') {
      // Married life never lets romance fall to zero; cohabiting couples carve
      // out small daily joys together.
      relationship.romance = clamp(Math.max(relationship.romance, 48) + 0.06, 0, 100);
      tryConception(relationship, a, b, agents, time, events);
    }
  }

  // --- 2. Births: every pregnancy that reached its due day ---------------------
  for (const mother of agents) {
    if (!mother.isPregnant || mother.pregnancyDueDay == null) continue;
    if (day < mother.pregnancyDueDay) continue;
    // Respect the city population cap (count births already scheduled today).
    const birthsScheduledToday = events.filter(event => event.type === 'birth').length;
    if (agents.length + birthsScheduledToday >= RELATIONSHIP_CONSTANTS.populationCap) continue;

    const father = mother.pregnancyPartnerId ? byId.get(mother.pregnancyPartnerId) ?? null : null;

    const newborn = createNewbornProfile(mother, father, time);

    // ended pregnancy bookkeeping
    mother.isPregnant = false;
    mother.pregnancyStartedDay = null;
    mother.pregnancyDueDay = null;
    mother.pregnancyPartnerId = null;
    mother.lastChildBirthDay = day;
    if (!mother.childIds.includes(newborn.id)) mother.childIds.push(newborn.id);

    if (father && !father.childIds.includes(newborn.id)) father.childIds.push(newborn.id);

    // Birth is joyful but exhausting.
    if (father) father.stats.mood = clamp(father.stats.mood + 20, 0, 100);
    mother.stats.mood = clamp(mother.stats.mood + 20, 0, 100);
    mother.stats.energy = clamp(mother.stats.energy - 18, 0, 100);

    // Siblings on BOTH sides are linked to the new baby (blended families).
    for (const siblingId of newborn.siblingIds) {
      const sibling = byId.get(siblingId);
      if (sibling && !sibling.siblingIds.includes(newborn.id)) {
        sibling.siblingIds.push(newborn.id);
      }
    }

    const childWord = newborn.gender === 'female' ? 'daughter' : 'son';
    addMemory(mother, time, 'event', `Gave birth to a healthy ${childWord}, ${newborn.name}.`, 'high');
    if (father) {
      addMemory(father, time, 'event', `Became a parent to a healthy ${childWord}, ${newborn.name}.`, 'high');
    }

    events.push({
      type: 'birth',
      message: `👶 ${mother.name}${father ? ` and ${father.name}` : ''} welcomed ${newborn.name} into the world!`,
      icon: '👶',
      agentIds: father ? [mother.id, father.id, newborn.id] : [mother.id, newborn.id],
      childProfile: newborn, // the engine spawns this as a real citizen
    });
  }

  // --- 3. Children grow; on adulthood they start a real life ------------------
  for (const agent of agents) {
    if (!agent.isChild) continue;
    const newAge = getAgentAge(agent, day);
    const grownUp = day - (agent.birthDay ?? day) >= RELATIONSHIP_CONSTANTS.childhoodDays;
    if (!grownUp && newAge <= (agent.age ?? 0)) continue;

    agent.age = grownUp ? RELATIONSHIP_CONSTANTS.adultAge : newAge;
    if (grownUp) {
      // Re-stamp the birthday onto the standard calendar so every later age
      // calculation (courtship, fertility windows…) continues from 18 cleanly.
      agent.birthDay = day - RELATIONSHIP_CONSTANTS.adultAge * 365;
      agent.isChild = false;
      agent.profession = 'Young Professional';
      agent.rankTitle = 'Citizen Specialist';
      agent.workNodeId = 'office';
      agent.avatarEmoji = agent.gender === 'female' ? '👩' : '👨';
      agent.currentThought = 'Grown up and ready to build an independent life!';
      addMemory(agent, time, 'event', 'Reached adulthood and started an independent life in AgentVille.', 'high');
    }
  }

  return events;
}

/**
 * Family-planning dice roll for one married couple. Every realistic criterion
 * must hold BEFORE the probability is even considered (see file header #4).
 */
function tryConception(
  relationship: Relationship,
  a: AgentData,
  b: AgentData,
  agents: AgentData[],
  time: SimulationTime,
  events: RelationshipEvent[],
) {
  const day = time.day;

  // Natural biology: one female, one male, both committed spouses.
  const mother = a.gender === 'female' ? a : b.gender === 'female' ? b : null;
  const father = a.gender === 'male' ? a : b.gender === 'male' ? b : null;
  if (!mother || !father) return;
  if (mother.isPregnant) return;
  if (mother.spouseId !== father.id || father.spouseId !== mother.id) return;

  // Fertile age windows.
  const motherAge = getAgentAge(mother, day);
  const fatherAge = getAgentAge(father, day);
  if (motherAge < RELATIONSHIP_CONSTANTS.minMotherAge || motherAge > RELATIONSHIP_CONSTANTS.maxMotherAge) return;
  if (fatherAge < RELATIONSHIP_CONSTANTS.minFatherAge || fatherAge > RELATIONSHIP_CONSTANTS.maxFatherAge) return;

  // Family planning limits: kids per couple, spacing, city capacity.
  if (mother.childIds.length >= RELATIONSHIP_CONSTANTS.maxChildrenPerCouple) return;
  if (mother.lastChildBirthDay > 0 && day - mother.lastChildBirthDay < RELATIONSHIP_CONSTANTS.childSpacingDays) return;
  if (agents.length >= RELATIONSHIP_CONSTANTS.populationCap) return;

  // Adds up: can this family actually afford / handle a child right now?
  const combinedWealth = mother.stats.money + father.stats.money;
  const averageMood = (mother.stats.mood + father.stats.mood) / 2;
  if (combinedWealth < RELATIONSHIP_CONSTANTS.minFamilyWealth) return;
  if (averageMood < RELATIONSHIP_CONSTANTS.minFamilyMood) return;
  if (mother.stats.energy < RELATIONSHIP_CONSTANTS.minMotherEnergy) return;
  if (mother.stats.hunger < 25) return;

  // The better the marriage (romance + warmth), the more likely they try.
  // A couple's family values matter too: a family-minded pair plans children,
  // a career-obsessed one keeps postponing.
  const stability = clamp((relationship.romance + relationship.affinity) / 2, 0, 100);
  const familyValue = ((mother.psyche?.values?.family ?? 55) + (father.psyche?.values?.family ?? 55)) / 2;
  const chance =
    RELATIONSHIP_CONSTANTS.conceptionBaseChance *
    (0.5 + stability / 100) *                    // stable marriage: up to ×1.5
    (0.7 + Math.min(0.6, combinedWealth / 1000)) // comfortable finances: up to ×1.3
    * (0.7 + averageMood / 200)                  // happy household: up to ×1.2
    * (0.65 + familyValue / 150);                // family values: ×0.65 … ×1.3

  if (Math.random() > chance) return;

  // Conception! The mother now carries the pregnancy for `pregnancyDays`
  // simulation days (see RELATIONSHIP_CONSTANTS).
  mother.isPregnant = true;
  mother.pregnancyStartedDay = day;
  mother.pregnancyDueDay = day + RELATIONSHIP_CONSTANTS.pregnancyDays;
  mother.pregnancyPartnerId = father.id;
  mother.lastFamilyDecisionDay = day;
  mother.stats.mood = clamp(mother.stats.mood + 10, 0, 100);
  father.stats.mood = clamp(father.stats.mood + 10, 0, 100);

  addMemory(mother, time, 'event', `Discovered she is pregnant with ${father.name}'s child. The family is expecting a baby.`, 'high');
  addMemory(father, time, 'event', `Learned that ${mother.name} is pregnant. We are expecting a child together.`, 'high');

  events.push({
    type: 'pregnancy',
    message: `🤰 ${mother.name} and ${father.name} are expecting a baby!`,
    icon: '🤰',
    agentIds: [mother.id, father.id],
  });
}

// ---------------------------------------------------------------------------
// SECTION 7: NEWBORN GENERATION (heredity)
// ---------------------------------------------------------------------------

/** Family surname = last name token of the father, else the mother's. */
function familySurname(a: AgentData, b: AgentData | null): string {
  const lastOf = (agent: AgentData | null) => {
    if (!agent) return '';
    const parts = agent.name.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1].replace(/[^\p{L}'-]/gu, '') : '';
  };
  return lastOf(b) || lastOf(a) || 'Ville';
}

/**
 * Mix both parents' colors ± a small random wiggle, so siblings from the same
 * parents still look related but never identical.
 */
function blendColors(colorA: string, colorB: string): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return null;
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  };
  const a = parse(colorA);
  const b = parse(colorB);
  if (!a || !b) return colorA;

  const mix = (x: number, y: number) => {
    const value = Math.round((x + y) / 2 + (Math.random() - 0.5) * 24);
    return clamp(value, 0, 255).toString(16).padStart(2, '0');
  };
  return `#${mix(a.r, b.r)}${mix(a.g, b.g)}${mix(a.b, b.b)}`;
}

/**
 * Personality heredity: 40% the mother's, 35% the father's, 25% a random
 * recombination — families resemble but children are their own people.
 */
function inheritPersonality(mother: AgentData, father: AgentData | null): PersonalityTrait {
  const roll = Math.random();
  if (roll < 0.4) return mother.personality;
  if (roll < 0.75 && father) return father.personality;
  return ALL_PERSONALITIES[Math.floor(Math.random() * ALL_PERSONALITIES.length)];
}

/**
 * Build the full profile of a child about to be born. The engine turns this
 * into a living AgentData via `spawnNewborn`. Pure-ish: it does NOT mutate
 * the parents — the birth loop does that, so conception→birth stays readable.
 */
export function createNewbornProfile(
  mother: AgentData,
  father: AgentData | null,
  time: SimulationTime,
): NewbornProfile {
  childCounter += 1;

  const gender: Gender = Math.random() < 0.5 ? 'female' : 'male';
  const firstNamePool = gender === 'female' ? CHILD_FEMALE_NAMES : CHILD_MALE_NAMES;
  const firstName = firstNamePool[Math.floor(Math.random() * firstNamePool.length)];

  // Moral compass: average of the parents ± genetic noise.
  const inheritedMoralScore = clamp(
    (mother.moralScore + (father?.moralScore ?? mother.moralScore)) / 2 + (Math.random() * 30 - 15),
    -100,
    100,
  );
  const moralAlignment: MoralAlignment =
    inheritedMoralScore > 30 ? 'Altruistic' : inheritedMoralScore < -30 ? 'Selfish' : 'Neutral';

  // All existing children of either parent are this baby's siblings.
  const siblingIds = Array.from(new Set([...mother.childIds, ...(father?.childIds ?? [])]));

  return {
    id: `agent_child_${time.day}_${childCounter}`,
    name: `${firstName} ${familySurname(mother, father)}`,
    gender,
    age: 0,
    birthDay: time.day,
    color: father ? blendColors(mother.color, father.color) : mother.color,
    avatarEmoji: '🧒',
    personality: inheritPersonality(mother, father),
    moralAlignment,
    moralScore: Math.round(inheritedMoralScore),
    parentIds: father ? [mother.id, father.id] : [mother.id],
    motherId: mother.id,
    fatherId: father?.id ?? '',
    homeNodeId: mother.homeNodeId || father?.homeNodeId || 'home_sunset',
    siblingIds,
  };
}

// ---------------------------------------------------------------------------
// SECTION 8: INITIAL WORLD SEEDING
// ---------------------------------------------------------------------------

/**
 * Prepare every citizen for human life, then seed a few existing relationships
 * so the city feels alive on Day 1 (3 married couples sharing homes, one
 * engaged pair, one dating pair). Also acts as a safety net: any agent that
 * reached the engine without relationship fields gets sensible defaults.
 */
export function initializeRelationships(agents: AgentData[], time: SimulationTime): void {
  // --- Safety net: default relationship fields -------------------------------
  for (const agent of agents) {
    if (!agent.gender) agent.gender = inferGender(agent.name);
    if (agent.age == null) agent.age = 25 + Math.floor(Math.random() * 18);
    if (agent.birthDay == null) agent.birthDay = time.day - agent.age * 365;
    if (!agent.parentIds) agent.parentIds = [];
    if (!agent.childIds) agent.childIds = [];
    if (!agent.siblingIds) agent.siblingIds = [];
    if (agent.partnerId === undefined) agent.partnerId = null;
    if (agent.spouseId === undefined) agent.spouseId = null;
    if (agent.isPregnant === undefined) agent.isPregnant = false;
    if (agent.pregnancyStartedDay === undefined) agent.pregnancyStartedDay = null;
    if (agent.pregnancyDueDay === undefined) agent.pregnancyDueDay = null;
    if (agent.pregnancyPartnerId === undefined) agent.pregnancyPartnerId = null;
    if (agent.lastFamilyDecisionDay == null) agent.lastFamilyDecisionDay = 0;
    if (agent.lastChildBirthDay == null) agent.lastChildBirthDay = 0;
  }

  // --- Seed couples -------------------------------------------------------------
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const seedCouples: Array<{ a: string; b: string; stage: 'dating' | 'engaged' | 'married' }> = [
    { a: 'agent_alex',   b: 'agent_sofia', stage: 'married' }, // 3 married couples,
    { a: 'agent_tariq',  b: 'agent_layla', stage: 'married' }, // all sharing a home…
    { a: 'agent_julian', b: 'agent_chloe', stage: 'married' },
    { a: 'agent_leo',    b: 'agent_maya',  stage: 'engaged' },
    { a: 'agent_lucas',  b: 'agent_hana',  stage: 'dating'  },
  ];

  for (const seed of seedCouples) {
    const a = byId.get(seed.a);
    const b = byId.get(seed.b);
    if (!a || !b) continue;

    const relationship = ensureRelationship(a, b, time.day);
    relationship.familiarity = 90;
    relationship.affinity = seed.stage === 'married' ? 74 : seed.stage === 'engaged' ? 68 : 58;
    relationship.trust = 78;
    relationship.romance = seed.stage === 'married' ? 82 : seed.stage === 'engaged' ? 74 : 55;
    relationship.attraction = Math.max(relationship.attraction, seed.stage === 'married' ? 62 : 58);
    relationship.lastInteractionDay = time.day;
    relationship.interactions = 80;

    if (seed.stage === 'dating') {
      setStage(relationship, 'dating', time.day - 32);
      a.partnerId = b.id;
      b.partnerId = a.id;
    } else if (seed.stage === 'engaged') {
      setStage(relationship, 'engaged', time.day - 20);
      relationship.relationshipStartDay = time.day - 90;
      a.partnerId = b.id;
      b.partnerId = a.id;
    } else {
      setStage(relationship, 'married', time.day - 400);
      relationship.relationshipStartDay = time.day - 700;
      relationship.engagementStartDay = time.day - 500;
      a.spouseId = b.id;
      b.spouseId = a.id;
      a.partnerId = null;
      b.partnerId = null;
      const sharedHome = a.homeNodeId || b.homeNodeId;
      a.homeNodeId = sharedHome;
      b.homeNodeId = sharedHome;
    }
  }
}

// ---------------------------------------------------------------------------
// SECTION 8b: SAVE / LOAD SUPPORT
// ---------------------------------------------------------------------------
//
// Bonds live in a module-level map, NOT inside AgentData, so the engine must
// serialize them explicitly. Without this every reload reset all couples to
// "stranger" while their spouseId fields survived — marriages were then
// permanently sterile because conception requires a married bond record.

export interface RelationshipSnapshot {
  version: 1;
  childCounter: number;
  bonds: Relationship[];
}

/** Serialize the whole store (bonds + child-id counter) for persistence. */
export function exportRelationships(): RelationshipSnapshot {
  return {
    version: 1,
    childCounter,
    bonds: Array.from(relationshipStore.values()).map(bond => ({ ...bond })),
  };
}

/**
 * Restore a previously exported snapshot. Invalid payloads are rejected
 * without touching the live store. When `agents` is provided, bonds pointing at
 * citizens who no longer exist are dropped and bonds implied by partnerId /
 * spouseId are rebuilt.
 */
export function importRelationships(snapshot: unknown, agents?: AgentData[]): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const data = snapshot as Partial<RelationshipSnapshot>;
  if (data.version !== 1 || !Array.isArray(data.bonds)) return false;

  const restored = new Map<string, Relationship>();
  for (const bond of data.bonds) {
    if (!bond || typeof bond.aId !== 'string' || typeof bond.bId !== 'string') continue;
    if (bond.aId === bond.bId) continue;
    const key = pairKey(bond.aId, bond.bId);
    restored.set(key, { ...bond, id: key });
  }

  relationshipStore.clear();
  for (const [key, bond] of restored) relationshipStore.set(key, bond);

  if (Number.isFinite(data.childCounter)) {
    childCounter = Math.max(childCounter, Math.floor(data.childCounter as number));
  }
  if (agents) reconcileRelationships(agents);
  return true;
}

/**
 * Make the store agree with the living population:
 *   • drop bonds whose citizens vanished,
 *   • rebuild a missing bond for every partnerId / spouseId pair (old saves
 *     written before relationships were persisted, custom spawns, etc.).
 */
export function reconcileRelationships(agents: AgentData[]): void {
  const byId = new Map(agents.map(agent => [agent.id, agent]));

  for (const [key, bond] of Array.from(relationshipStore.entries())) {
    if (!byId.has(bond.aId) || !byId.has(bond.bId)) relationshipStore.delete(key);
  }

  for (const agent of agents) {
    const partnerId = agent.spouseId || agent.partnerId;
    if (!partnerId || partnerId === agent.id) continue;
    const partner = byId.get(partnerId);
    if (!partner) continue;
    if (relationshipStore.has(pairKey(agent.id, partnerId))) continue;

    const relationship = ensureRelationship(agent, partner, 1);
    relationship.familiarity = 70;
    relationship.affinity = 60;
    relationship.trust = 60;
    relationship.romance = 55;
    relationship.interactions = 20;
    relationship.lastInteractionDay = 1;
    relationship.relationshipStartDay = relationship.relationshipStartDay ?? 1;
    setStage(relationship, agent.spouseId ? 'married' : 'dating', 1);
  }
}

// ---------------------------------------------------------------------------
// SECTION 9: UI READ MODELS (inspector)
// ---------------------------------------------------------------------------

/** Resolve one citizen's whole family situation for the inspector panel. */
export function getFamilyView(agent: AgentData, agents: AgentData[], currentDay: number): FamilyView {
  const byId = new Map(agents.map(item => [item.id, item]));
  const resolve = (id: string) => byId.get(id) ?? null;
  const resolveList = (ids: string[]) =>
    ids.map(id => byId.get(id)).filter((item): item is AgentData => !!item);

  return {
    age: getAgentAge(agent, currentDay),
    partner: agent.partnerId ? resolve(agent.partnerId) : null,
    spouse: agent.spouseId ? resolve(agent.spouseId) : null,
    parents: resolveList(agent.parentIds),
    children: resolveList(agent.childIds),
    siblings: resolveList(agent.siblingIds),
    pregnant: !!agent.isPregnant,
    pregnancyDaysElapsed: agent.isPregnant && agent.pregnancyStartedDay != null
      ? Math.max(0, currentDay - agent.pregnancyStartedDay)
      : null,
    pregnancyDaysRemaining: agent.isPregnant && agent.pregnancyDueDay != null
      ? Math.max(0, agent.pregnancyDueDay - currentDay)
      : null,
    pregnancyPartnerName: agent.pregnancyPartnerId ? resolve(agent.pregnancyPartnerId)?.name ?? null : null,
  };
}

const STAGE_LABELS: Record<RelationshipStage, string> = {
  stranger: 'Stranger',
  acquaintance: 'Acquaintance',
  friend: 'Friend',
  dating: 'Dating',
  engaged: 'Engaged',
  married: 'Married',
};

/**
 * The citizen's most meaningful bonds (partners/spouses always included,
 * then the warmest friends), sorted by romance + warmth, limited for UI.
 */
export function getRelationshipSummaries(
  agent: AgentData,
  agents: AgentData[],
  currentDay: number,
  limit = 6,
): RelationshipSummary[] {
  const byId = new Map(agents.map(item => [item.id, item]));
  const summaries: RelationshipSummary[] = [];

  for (const relationship of relationshipStore.values()) {
    if (relationship.aId !== agent.id && relationship.bId !== agent.id) continue;

    const partnerId = relationship.aId === agent.id ? relationship.bId : relationship.aId;
    const partner = byId.get(partnerId);
    if (!partner) continue;

    // A bond must be either currently active (partner/spouse/romantic) or at
    // least touched (an acquaintanceship with real history behind it).
    const isRomantic =
      relationship.stage === 'dating' ||
      relationship.stage === 'engaged' ||
      relationship.stage === 'married';
    const isCurrentPartnerField = agent.partnerId === partnerId || agent.spouseId === partnerId;
    if (!isRomantic && !isCurrentPartnerField && (relationship.stage === 'stranger' || relationship.interactions === 0)) {
      continue;
    }

    summaries.push({
      id: relationship.id,
      partnerId,
      partnerName: partner.name,
      partnerColor: partner.color,
      stage: relationship.stage,
      stageLabel: STAGE_LABELS[relationship.stage],
      attraction: Math.round(relationship.attraction),
      affinity: Math.round(relationship.affinity),
      romance: Math.round(relationship.romance),
      trust: Math.round(relationship.trust),
      familiarity: Math.round(relationship.familiarity),
      lastInteractionDay: relationship.lastInteractionDay,
    });
  }

  summaries.sort((a, b) => b.romance + b.affinity - (a.romance + a.affinity));
  return summaries.slice(0, limit);
}

// ---------------------------------------------------------------------------
// SECTION 10: DIALOGUE FLAVOR FOR COUPLES
// ---------------------------------------------------------------------------

/**
 * Partners say something genuinely warm when they meet, instead of the generic
 * city small-talk. Bilingual to match the dialogue manager (Arabic default).
 * Returns null when the pair is not a couple, so callers can fall back.
 */
export function generateRomanticExchange(
  a: AgentData,
  b: AgentData,
  language: 'ar' | 'en',
): { textA: string; textB: string } | null {
  const relationship = getRelationshipBetween(a, b);
  if (!relationship) return null;
  const isCouple =
    relationship.stage === 'dating' ||
    relationship.stage === 'engaged' ||
    relationship.stage === 'married';
  if (!isCouple) return null;

  const isAr = language === 'ar';
  const A = a.name.split(' ')[0]; // first names keep the lines intimate
  const B = b.name.split(' ')[0];

  if (relationship.stage === 'married') {
    return isAr
      ? {
          textA: `يا ${B}، مهما كانت ضوضاء المدينة، بيتنا معك هو أهدأ مكان في العالم.`,
          textB: `وأنت يا ${A} سبب ابتسامتي كل صباح. لن ننسى أن نمرّ على المخبز معاً اليوم.`,
        }
      : {
          textA: `No matter how loud the city gets, ${B}, home is the quietest place in the world with you.`,
          textB: `And you are the reason I smile every morning, ${A}. Let's stop by the bakery together today.`,
        };
  }

  if (relationship.stage === 'engaged') {
    return isAr
      ? {
          textA: `أعدّ الأيام يا ${B} حتى نبدأ حياتنا معاً. كل تفصيل صغير نخطط له يسعدني.`,
          textB: `وأنا كذلك يا ${A}. لم أكن أتخيل أن أحبّ أحداً بهذا العمق.`,
        }
      : {
          textA: `I'm counting the days until we start our life together, ${B}. Every little plan makes me happy.`,
          textB: `Me too, ${A}. I never imagined loving anyone this deeply.`,
        };
  }

  // Newly dating: light, hopeful, a little shy.
  return isAr
    ? {
        textA: `كل لقاء معك يضيء يومي يا ${B}. هل نشرب قهوة معاً بعد العمل؟`,
        textB: `بكل سرور يا ${A}! وجودك يجعل الأمور البسيطة أجمل بكثير.`,
      }
    : {
        textA: `Every time I run into you, ${B}, my whole day gets brighter. Coffee after work?`,
        textB: `I'd love that, ${A}. You make the simple things feel special.`,
      };
}
