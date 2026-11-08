/**
 * ============================================================================
 *  HOUSING — capacity, units, families and the pressure to build
 * ============================================================================
 *
 *  The planning brief, expressed as rules:
 *
 *    capacity = floor(area × floors × 0.7)      // 70 % is habitable
 *    1 square ≈ one resident's share
 *
 *  Buildings (in 128 px squares):
 *    small house      2×2, 1 floor  →  2 beds
 *    family house     3×3, 1 floor  →  6 beds
 *    small apartment  3×3, 3 floors → 18 beds
 *    large apartment  4×3, 4 floors → 33 beds
 *
 *  Each building is subdivided into UNITS of different sizes (studio 1–2,
 *  small 3–4, family 5–6, large 7–8). A household takes the SMALLEST unit that
 *  fits it, 10 % of units stay vacant for newcomers, and a household that finds
 *  no unit becomes homeless — which is the city's signal to build.
 *
 *  Land = building footprint + one square around it. Land per resident is the
 *  crowding metric: when it drops under the threshold the city must expand or
 *  add floors instead of packing people in.
 */
import { AgentData, LocationNode } from '../types/simulation';

/** One planning square (2 city cells). */
export const PX_PER_SQUARE = 128;
/** Share of the gross floor area that is habitable. */
export const HABITABLE_RATIO = 0.7;
/** Units kept empty for newcomers / moves. */
export const VACANCY_TARGET = 0.1;

export interface UnitSpec {
  kind: 'studio' | 'small' | 'family' | 'large';
  label: string;
  capacity: number;
}

export const UNIT_SPECS: UnitSpec[] = [
  { kind: 'studio', label: 'Studio', capacity: 2 },
  { kind: 'small', label: 'Small flat', capacity: 4 },
  { kind: 'family', label: 'Family flat', capacity: 6 },
  { kind: 'large', label: 'Large flat', capacity: 8 },
];

export interface BuildingType {
  id: string;
  label: string;
  squares: { w: number; h: number };
  floors: number;
}

export const BUILDING_TYPES: BuildingType[] = [
  { id: 'small_house', label: 'Small house', squares: { w: 2, h: 2 }, floors: 1 },
  { id: 'family_house', label: 'Family house', squares: { w: 3, h: 3 }, floors: 1 },
  { id: 'small_apartment', label: 'Small apartment', squares: { w: 3, h: 3 }, floors: 3 },
  { id: 'large_apartment', label: 'Large apartment', squares: { w: 4, h: 3 }, floors: 4 },
];

/** The brief's formula, applied to any footprint. */
export function capacityFromFootprint(widthPx: number, heightPx: number, floors: number): number {
  const w = widthPx / PX_PER_SQUARE;
  const h = heightPx / PX_PER_SQUARE;
  return Math.max(1, Math.floor(w * h * floors * HABITABLE_RATIO));
}

/** Storeys a venue actually has: homes 2, everything else 1 (visual massing). */
export function floorsOf(location: LocationNode): number {
  if (location.type === 'home') return 2;
  return 1;
}

export function homeCapacity(location: LocationNode): number {
  if (location.type !== 'home') return 0;
  return capacityFromFootprint(location.width, location.height, floorsOf(location));
}

/** Split a building's capacity into a realistic mix of units. */
export function unitPlan(capacity: number): UnitSpec[] {
  const units: UnitSpec[] = [];
  let left = capacity;
  while (left >= 8) {
    units.push(UNIT_SPECS[3]);
    left -= 8;
  }
  while (left >= 6) {
    units.push(UNIT_SPECS[2]);
    left -= 6;
  }
  while (left >= 4) {
    units.push(UNIT_SPECS[1]);
    left -= 4;
  }
  while (left >= 2) {
    units.push(UNIT_SPECS[0]);
    left -= 2;
  }
  return units;
}

export interface Household {
  id: string;
  memberIds: string[];
  size: number;
  homeId: string | null;
}

/**
 * Group citizens into households: spouses together with their children, single
 * adults alone. This is what "family size" means for unit allocation.
 */
export function buildHouseholds(agents: AgentData[]): Household[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]));
  const seen = new Set<string>();
  const households: Household[] = [];

  const collect = (agent: AgentData): string[] => {
    const members = new Set<string>([agent.id]);
    const spouse = agent.spouseId ? byId.get(agent.spouseId) : null;
    if (spouse) members.add(spouse.id);
    const partner = !spouse && agent.partnerId ? byId.get(agent.partnerId) : null;
    if (partner) members.add(partner.id);

    // Children living at home.
    for (const childId of agent.childIds ?? []) {
      const child = byId.get(childId);
      if (!child) continue;
      if (child.homeNodeId !== agent.homeNodeId) continue;
      if (child.age != null && child.age >= 18 && !child.isChild) continue;
      members.add(child.id);
    }
    return Array.from(members);
  };

  for (const agent of agents) {
    if (seen.has(agent.id)) continue;
    if (agent.isChild) {
      // A child whose parents are gone forms a one-person household.
      const parent = (agent.parentIds ?? []).map(id => byId.get(id)).find(Boolean);
      if (parent && byId.has(parent.id)) continue;
    }

    const memberIds = collect(agent);
    memberIds.forEach(id => seen.add(id));
    households.push({
      id: `hh_${agent.id}`,
      memberIds,
      size: memberIds.length,
      homeId: agent.homeNodeId ?? null,
    });
  }

  return households;
}

export interface Unit {
  id: string;
  homeId: string;
  kind: UnitSpec['kind'];
  label: string;
  capacity: number;
  occupants: string[];
}

export interface HousingPlan {
  units: Unit[];
  households: Household[];
  /** Households with no suitable unit. */
  homeless: Household[];
  /** Households whose unit is smaller than the family (should never happen). */
  crowded: Household[];
  totalBeds: number;
  /** Beds left unallocated: the 10 % vacancy buffer plus leftover capacity. */
  spareBeds: number;
  population: number;
  /** Plot area per resident (crowding proxy). */
  landPerResident: number;
  /** Suggested building type to commission next, when homes are short. */
  suggestion: string | null;
}

/**
 * Allocate households to units across the whole city.
 *
 * Rule: the smallest unit that fits the family, inside the family's own home
 * when possible. Each home only offers 90 % of its beds, so a newcomer always
 * has somewhere to go.
 */
export function planHousing(agents: AgentData[], locations: LocationNode[]): HousingPlan {
  const homes = locations.filter(location => location.type === 'home');
  const households = buildHouseholds(agents);

  const capacity = new Map<string, number>();
  for (const home of homes) {
    capacity.set(home.id, Math.floor(homeCapacity(home) * (1 - VACANCY_TARGET)));
  }

  const units: Unit[] = [];
  const homeless: Household[] = [];
  const crowded: Household[] = [];

  // Biggest families first: they are the hardest to place.
  const sorted = [...households].sort((a, b) => b.size - a.size);

  for (const household of sorted) {
    const need = Math.max(1, household.size); // one bed per person
    const label = need >= 7 ? 'Large flat' : need >= 5 ? 'Family flat' : need >= 3 ? 'Small flat' : 'Studio';

    const order = [household.homeId, ...homes.map(home => home.id)]
      .filter((id): id is string => !!id);

    let placed = false;
    for (const homeId of order) {
      const free = capacity.get(homeId) ?? 0;
      if (free < need) continue;

      capacity.set(homeId, free - need);
      units.push({
        id: `${homeId}_${household.id}`,
        homeId,
        kind: need >= 7 ? 'large' : need >= 5 ? 'family' : need >= 3 ? 'small' : 'studio',
        label,
        capacity: need,
        occupants: [...household.memberIds],
      });
      placed = true;
      break;
    }

    if (!placed) {
      homeless.push(household);
      if (household.size > 8) crowded.push(household);
    }
  }

  const totalBeds = homes.reduce((sum, home) => sum + homeCapacity(home), 0);
  const spareBeds = Array.from(capacity.values()).reduce((sum, beds) => sum + beds, 0);
  const plotArea = homes.reduce(
    (sum, home) => sum + (home.width + PX_PER_SQUARE) * (home.height + PX_PER_SQUARE),
    0,
  );

  const suggestion = homeless.length > 0
    ? (homeless.some(h => h.size >= 7) ? 'large_apartment' : 'small_apartment')
    : null;

  return {
    units,
    households,
    homeless,
    crowded,
    totalBeds,
    spareBeds,
    population: agents.length,
    landPerResident: agents.length > 0 ? Math.round(plotArea / agents.length) : 0,
    suggestion,
  };
}

/** The unit a given citizen lives in, if any. */
export function unitOf(plan: HousingPlan, agentId: string): Unit | null {
  return plan.units.find(unit => unit.occupants.includes(agentId)) ?? null;
}

/** Human-readable housing status for the inspector. */
export function housingStatus(plan: HousingPlan, agentId: string): { label: string; detail: string } {
  const unit = unitOf(plan, agentId);
  if (unit) {
    return { label: 'Housed', detail: `${unit.label} · ${unit.occupants.length}/${unit.capacity} people` };
  }
  const household = plan.households.find(h => h.memberIds.includes(agentId));
  if (household) {
    return {
      label: 'Homeless',
      detail: `Family of ${household.size} waiting for a ${household.size > 6 ? 'large' : 'family'} unit — the city needs to build.`,
    };
  }
  return { label: 'Unknown', detail: 'No household record.' };
}
