/**
 * ============================================================================
 *  PSYCHOLOGY — the inner life of every citizen
 * ============================================================================
 *
 *  Each citizen is not a script that walks to the bakery; it is a person with a
 *  mental state that the simulation feeds every tick:
 *
 *      stress      pressure from unmet needs, debt, bad housing, recent harm
 *      impulse     low self-control (personality + youth + drink of despair)
 *      resentment  "the city failed me" — accumulated grievance
 *      hope        belief that effort pays off; the main brake on crime
 *      suspicion   how closely the police already watch this citizen
 *
 *  From that state the citizen DECIDES. Most decisions are lawful (go to work,
 *  eat, sleep). When stress is high, hope is low, morals are weak and an
 *  opportunity is close, the same person may steal, mug, vandalise or lash out.
 *  That decision is the seam where psychology meets the justice system
 *  (see justice.ts): crimes create victims, witnesses, police response and
 *  consequences, which in turn feed back into the psyche.
 */
import { AgentData, LocationNode, SimulationTime } from '../types/simulation';
import { CITY_LOCATIONS } from './cityMap';

export interface CrimePlan {
  type: 'shoplifting' | 'mugging' | 'vandalism' | 'assault';
  /** Where it happens. */
  locationId: string;
  /** Victim, when the crime is against a person. */
  victimId?: string;
  /** 1 (petty) .. 3 (serious) */
  severity: 1 | 2 | 3;
  label: string;
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

/** Create a psyche for a citizen who has none (fresh spawn / legacy save). */
export function ensurePsyche(agent: AgentData): NonNullable<AgentData['psyche']> {
  if (agent.psyche) return agent.psyche;

  const moral = agent.moralScore ?? 0;
  agent.psyche = {
    stress: clamp(30 + (100 - agent.stats.mood) * 0.35),
    impulse: clamp(
      40
      + (agent.personality === 'Ambitious' ? 18 : 0)
      + (agent.personality === 'Chill' ? -12 : 0)
      + (agent.personality === 'Empathetic' ? -8 : 0)
      + (agent.personality === 'Creative' ? 6 : 0)
      - moral * 0.12,
    ),
    resentment: clamp(20 - moral * 0.25),
    hope: clamp(55 + moral * 0.2),
    suspicion: 0,
    values: deriveValues(agent),
    lastCrimeDay: -999,
  };
  if (!agent.record) agent.record = [];
  return agent.psyche;
}

/**
 * Values are not random numbers: they follow from temperament, moral compass
 * and life stage, then drift with what the city does to the person.
 */
export function deriveValues(agent: AgentData): NonNullable<AgentData['psyche']>['values'] {
  const moral = agent.moralScore ?? 0;
  const personality = agent.personality;
  const young = (agent.age ?? 30) < 26 ? 6 : 0;

  return {
    honesty: clamp(55 + moral * 0.3 + (personality === 'Analytical' ? 8 : 0) - young),
    compassion: clamp(
      50 + moral * 0.35
      + (personality === 'Empathetic' ? 22 : 0)
      + (personality === 'Chill' ? 6 : 0)
      - (personality === 'Ambitious' ? 12 : 0),
    ),
    family: clamp(
      55 + (agent.spouseId ? 12 : 0) + (agent.childIds?.length ?? 0) * 4
      + (personality === 'Empathetic' ? 8 : 0)
      + (personality === 'Chill' ? 8 : 0)
      - (personality === 'Ambitious' ? 10 : 0)
      - young,
    ),
    ambition: clamp(
      45 + (personality === 'Ambitious' ? 28 : 0) + (personality === 'Creative' ? 8 : 0)
      - (personality === 'Chill' ? 16 : 0) + (moral < -20 ? 8 : 0),
    ),
    dignity: clamp(50 + moral * 0.2 + (personality === 'Introvert' ? 6 : 0)),
  };
}

/**
 * Advance the psyche by one cognitive tick (≈2 sim-minutes). Everything that
 * happens in the city reaches the person here: hunger, debt, a bad shift, a
 * rainy week, a kind neighbour, a crime they witnessed.
 */
export function updatePsyche(agent: AgentData, time: SimulationTime): void {
  const psyche = ensurePsyche(agent);
  if (!psyche.values) psyche.values = deriveValues(agent);
  const { energy, hunger, mood, money } = agent.stats;

  // --- Pressure -----------------------------------------------------------
  const hungerPressure = Math.max(0, 55 - hunger);
  const moneyPressure = Math.max(0, 60 - money);
  const exhaustion = Math.max(0, 45 - energy);
  const misery = Math.max(0, 45 - mood);
  const pressure = hungerPressure * 0.5 + moneyPressure * 0.4 + exhaustion * 0.25 + misery * 0.5;

  const moodSupport = mood * 0.25 + energy * 0.12;
  const incomeSupport = Math.min(30, money * 0.06);

  psyche.stress = clamp(psyche.stress + (pressure - moodSupport) * 0.045 - 0.35);
  psyche.hope = clamp(psyche.hope + (incomeSupport + moodSupport * 0.4 - pressure * 0.35) * 0.02 - 0.1);
  psyche.resentment = clamp(
    psyche.resentment + (psyche.stress > 60 ? 0.05 : -0.04) + (money < 25 ? 0.03 : 0),
  );
  psyche.impulse = clamp(
    psyche.impulse + (psyche.stress > 55 ? 0.04 : -0.03) + (ageFactor(agent) * 0.01),
  );

  // Suspicion cools when nothing happens for a while.
  if (time.day - psyche.lastCrimeDay > 2) {
    psyche.suspicion = clamp(psyche.suspicion - 0.05);
  }
}

function ageFactor(agent: AgentData): number {
  return agent.age != null && agent.age < 26 ? 1 : 0;
}

export interface CrimeContext {
  /** How many officers are visibly on patrol (0..5). */
  policePresence: number;
  /** Recent crimes in the neighbourhood raise the temperature. */
  neighbourhoodTension: number;
}

/**
 * Probability that this citizen, right now, decides to break the law.
 * Deliberately low per tick: a crime is an EVENT, not a routine.
 */
export function crimeTemptation(agent: AgentData, ctx: CrimeContext): number {
  const psyche = ensurePsyche(agent);

  const economic = Math.max(0, 55 - agent.stats.money) / 55;
  const impulse = psyche.impulse / 100;
  const resentment = psyche.resentment / 100;
  const hopeless = (100 - psyche.hope) / 100;
  const tension = Math.min(1, ctx.neighbourhoodTension / 3);

  // Values are the strongest brake a human has: an honest person resists even
  // when broke, while a dishonest one needs far less pressure.
  const honesty = psyche.values?.honesty ?? clamp(50 + (agent.moralScore ?? 0) * 0.3);
  const moralBrake = 0.3 + (honesty / 100) * 0.7;
  // Police presence deters, but it never makes a desperate person an angel:
  // three officers on duty cut temptation by roughly a third.
  const policeBrake = 1 - Math.min(0.45, ctx.policePresence * 0.12);
  const suspicionBrake = 1 - Math.min(0.7, psyche.suspicion / 140);

  const raw = economic * 0.34 + impulse * 0.22 + resentment * 0.16 + hopeless * 0.16 + tension * 0.12;
  return clamp(raw * moralBrake * policeBrake * suspicionBrake, 0, 1);
}

/** A concrete opportunity, if one exists nearby. */
export function findCrimeOpportunity(agent: AgentData, agents: AgentData[]): CrimePlan | null {
  const here = CITY_LOCATIONS.find(l => l.id === agent.currentLocationId);
  const poor = agent.stats.money < 35;
  const hungry = agent.stats.hunger < 30;
  const angry = agent.stats.mood < 30;

  // Mugging: a wealthy, isolated citizen close by.
  const target = agents.find(other =>
    other.id !== agent.id &&
    Math.hypot(other.x - agent.x, other.y - agent.y) < 90 &&
    other.stats.money > 120 &&
    other.state !== 'TRAVELING',
  );
  if (target && !hungry) {
    return {
      type: 'mugging',
      locationId: agent.currentLocationId ?? 'park',
      victimId: target.id,
      severity: 2,
      label: `mugged ${target.name}`,
    };
  }

  // Shoplifting at a commercial venue.
  if (here && (here.type === 'market' || here.type === 'cafe' || here.type === 'bakery') && (poor || hungry)) {
    return {
      type: 'shoplifting',
      locationId: here.id,
      severity: 1,
      label: `shoplifted at ${here.name}`,
    };
  }

  // Vandalism when furious and standing next to a building.
  if (angry && here) {
    return {
      type: 'vandalism',
      locationId: here.id,
      severity: 1,
      label: `vandalised ${here.name}`,
    };
  }

  // Assault: rage with someone in reach.
  if (agent.stats.mood < 18) {
    const victim = agents.find(other =>
      other.id !== agent.id && Math.hypot(other.x - agent.x, other.y - agent.y) < 70,
    );
    if (victim) {
      return {
        type: 'assault',
        locationId: agent.currentLocationId ?? 'park',
        victimId: victim.id,
        severity: 3,
        label: `assaulted ${victim.name}`,
      };
    }
  }

  return null;
}

/** The immediate emotional aftershock of committing a crime. */
export function applyCrimeAftermath(agent: AgentData, severity: number): void {
  const psyche = ensurePsyche(agent);
  psyche.stress = clamp(psyche.stress - 8 + severity * 2);
  psyche.hope = clamp(psyche.hope - severity * 3);
  psyche.resentment = clamp(psyche.resentment + severity * 2);
  psyche.impulse = clamp(psyche.impulse + 2);
  psyche.suspicion = clamp(psyche.suspicion + 8 + severity * 4);
  // Crossing the line erodes honesty and self-respect a little every time.
  psyche.values.honesty = clamp(psyche.values.honesty - 2 - severity);
  psyche.values.dignity = clamp(psyche.values.dignity - 1 - severity);
}

/** Being caught is a shock: shame, deterrence, and a hit to hope. */
export function applyArrestAftermath(agent: AgentData): void {
  const psyche = ensurePsyche(agent);
  psyche.stress = clamp(psyche.stress + 12);
  psyche.hope = clamp(psyche.hope - 12);
  psyche.impulse = clamp(psyche.impulse - 10);
  psyche.suspicion = clamp(psyche.suspicion + 15);
  psyche.resentment = clamp(psyche.resentment + 6);
  psyche.values.dignity = clamp(psyche.values.dignity - 8);
  psyche.values.honesty = clamp(psyche.values.honesty + 3);
}

/** Being a victim leaves a mark on mood, trust and mental health. */
export function applyVictimAftermath(victim: AgentData, severity: number): void {
  const psyche = ensurePsyche(victim);
  victim.stats.mood = clamp(victim.stats.mood - 12 * severity, 0, 100);
  psyche.stress = clamp(psyche.stress + 10 * severity);
  psyche.hope = clamp(psyche.hope - 4 * severity);
  psyche.resentment = clamp(psyche.resentment + 3 * severity);
}

/** Short human-readable description of what this citizen is going through. */
export function psycheSummary(agent: AgentData): string {
  const psyche = ensurePsyche(agent);
  const parts: string[] = [];
  if (psyche.stress > 70) parts.push('under heavy stress');
  else if (psyche.stress > 45) parts.push('tense');
  if (psyche.hope < 25) parts.push('losing hope');
  else if (psyche.hope > 70) parts.push('hopeful');
  if (psyche.resentment > 55) parts.push('resentful of the city');
  if (psyche.impulse > 70) parts.push('impulsive');
  if (psyche.suspicion > 45) parts.push('watched by the police');
  return parts.length ? parts.join(', ') : 'steady';
}

/** Location lookup helper used by the justice system. */
export function locationById(id: string): LocationNode | undefined {
  return CITY_LOCATIONS.find(loc => loc.id === id);
}
