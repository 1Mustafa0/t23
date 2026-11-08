/**
 * ============================================================================
 *  URBAN PLAN — the city's zoning code
 * ============================================================================
 *
 *  The simulation can build, but a city that builds at random is just noise.
 *  This module encodes the planning brief as executable rules so every plot,
 *  every future commission and every audit agrees on the same standards:
 *
 *    RESIDENTIAL   off the arterials (quiet), 5–10 walking minutes from daily
 *                  services, close to green space, never beside industry.
 *    CIVIC/CENTRAL hospitals, city hall and markets sit on the arterial
 *                  network or at its intersections so everyone can reach them.
 *    SCHOOLS       inside the residential fabric, away from the fast streets.
 *    EMERGENCY     police/fire/ambulance on an arterial for response time.
 *    COMMERCE      on arterials and corners.
 *    INDUSTRY      city edge, close to the exit road, far from housing.
 *
 *  Distances are expressed in walking minutes with a single design convention
 *  (PX_PER_MINUTE) so the rules read like the brief instead of raw pixels.
 */
import { AgentData, DistrictId, LocationNode, NeedCategory } from '../types/simulation';

/** One walking minute ≈ 90 world px on the 3200×2432 map. */
export const PX_PER_MINUTE = 90;

/** The four arterial centre-lines laid out in layout.ts (ROADS.avenues). */
export const ARTERIALS = {
  x: [1024, 2176],
  y: [448, 1856],
};

export type ZoneKind =
  | 'residential'
  | 'civic'
  | 'healthcare'
  | 'employment'
  | 'commercial'
  | 'green'
  | 'industry';

/** What each district is FOR. The planner must not put offices in a quiet block. */
export const DISTRICT_ZONE: Record<DistrictId, ZoneKind> = {
  residential: 'residential',
  commercial: 'commercial',
  financial: 'employment',
  civic: 'civic',
  healthcare: 'healthcare',
  park: 'green',
};

/** Zone a venue belongs to, from its use (not from where it happens to sit). */
export function zoneOfLocation(loc: LocationNode): ZoneKind {
  switch (loc.type) {
    case 'home': return 'residential';
    case 'park': return 'green';
    case 'hospital':
    case 'wellness': return 'healthcare';
    case 'police':
    case 'cityhall':
    case 'library': return 'civic';
    case 'office': return 'employment';
    case 'market':
    case 'cafe':
    case 'bakery':
    case 'cinema': return 'commercial';
    case 'construction_site': return DISTRICT_ZONE[loc.districtId];
    default: return DISTRICT_ZONE[loc.districtId];
  }
}

export type FindingSeverity = 'ok' | 'warn' | 'violation';

export interface PlanFinding {
  id: string;
  locationId: string;
  locationName: string;
  zone: ZoneKind;
  rule: string;
  severity: FindingSeverity;
  /** Measured value in walking minutes (or px for edge distance). */
  value: number;
  limit: number;
  unit: 'min' | 'px';
  message: string;
}

function arterialDistance(x: number, y: number): number {
  let best = Infinity;
  for (const ax of ARTERIALS.x) best = Math.min(best, Math.abs(x - ax));
  for (const ay of ARTERIALS.y) best = Math.min(best, Math.abs(y - ay));
  return best;
}

function edgeDistance(loc: LocationNode): number {
  return Math.min(loc.x, loc.y, 3200 - (loc.x + loc.width), 2432 - (loc.y + loc.height));
}

function doorDistance(a: LocationNode, b: LocationNode): number {
  return Math.hypot(a.door.x - b.door.x, a.door.y - b.door.y);
}

function nearest(loc: LocationNode, pool: LocationNode[]): number {
  let best = Infinity;
  for (const other of pool) {
    if (other.id === loc.id) continue;
    best = Math.min(best, doorDistance(loc, other));
  }
  return best;
}

/**
 * The planning code, expressed as data. Each entry produces one line in the
 * audit report, so a reviewer can see exactly which clause a venue breaks.
 */
interface Rule {
  id: string;
  appliesTo: (loc: LocationNode) => boolean;
  /** 'min' = value must be ≥ limit, 'max' = value must be ≤ limit. */
  direction: 'min' | 'max';
  limit: number;
  unit: 'min' | 'px';
  measure: (loc: LocationNode, locations: LocationNode[]) => number;
  message: (loc: LocationNode, value: number, limit: number) => string;
}

const dailyServices = (locations: LocationNode[]) =>
  locations.filter(l => l.type === 'market' || l.type === 'cafe' || l.type === 'bakery' || l.type === 'hospital');

const greenSpaces = (locations: LocationNode[]) => locations.filter(l => l.type === 'park');

const RULES: Rule[] = [
  {
    id: 'home-quiet',
    appliesTo: l => l.type === 'home',
    direction: 'min',
    limit: 1.5,
    unit: 'min',
    measure: l => arterialDistance(l.door.x, l.door.y) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name}: ${v.toFixed(1)} min from an arterial (needs ≥ ${lim} — homes belong on quiet streets).`,
  },
  {
    id: 'home-daily-services',
    appliesTo: l => l.type === 'home',
    direction: 'max',
    limit: 10,
    unit: 'min',
    measure: l => nearest(l, dailyServices(locationsRef)) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name}: ${v.toFixed(1)} min walk to daily services (target ≤ ${lim}).`,
  },
  {
    id: 'home-green',
    appliesTo: l => l.type === 'home',
    direction: 'max',
    limit: 10,
    unit: 'min',
    measure: l => nearest(l, greenSpaces(locationsRef)) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name}: ${v.toFixed(1)} min walk to a park (target ≤ ${lim}).`,
  },
  {
    id: 'civic-on-arterial',
    appliesTo: l => l.type === 'cityhall' || l.type === 'hospital' || l.type === 'market',
    direction: 'max',
    limit: 3,
    unit: 'min',
    measure: l => arterialDistance(l.door.x, l.door.y) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name}: ${v.toFixed(1)} min from the arterial network (universal services target ≤ ${lim}).`,
  },
  {
    id: 'emergency-on-arterial',
    appliesTo: l => l.type === 'police',
    direction: 'max',
    limit: 2.5,
    unit: 'min',
    measure: l => arterialDistance(l.door.x, l.door.y) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name}: ${v.toFixed(1)} min from an arterial (response target ≤ ${lim}).`,
  },
  {
    id: 'commerce-on-arterial',
    appliesTo: l => ['office', 'bank', 'cinema', 'cafe', 'bakery'].includes(l.type),
    direction: 'max',
    limit: 3.5,
    unit: 'min',
    measure: l => arterialDistance(l.door.x, l.door.y) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name}: ${v.toFixed(1)} min from an arterial (commerce target ≤ ${lim}).`,
  },
  {
    id: 'school-quiet',
    appliesTo: l => l.type === 'library',
    direction: 'min',
    limit: 1.5,
    unit: 'min',
    measure: l => arterialDistance(l.door.x, l.door.y) / PX_PER_MINUTE,
    message: (l, v, lim) => `${l.name} (school wing): ${v.toFixed(1)} min from an arterial (child safety needs ≥ ${lim}).`,
  },
];

// `RULES` closures need the live location list; a module-scoped reference keeps
// the rule table declarative without threading the array through every entry.
let locationsRef: LocationNode[] = [];

/** Evaluate the whole city against the planning code. */
export function auditPlan(locations: LocationNode[]): PlanFinding[] {
  locationsRef = locations;
  const findings: PlanFinding[] = [];

  for (const loc of locations) {
    if (loc.type === 'park' || loc.type === 'construction_site') continue;
    for (const rule of RULES) {
      if (!rule.appliesTo(loc)) continue;
      const value = rule.measure(loc, locations);
      if (!Number.isFinite(value)) continue;
      const ok = rule.direction === 'min' ? value >= rule.limit : value <= rule.limit;
      findings.push({
        id: `${loc.id}:${rule.id}`,
        locationId: loc.id,
        locationName: loc.name,
        zone: zoneOfLocation(loc),
        rule: rule.id,
        severity: ok ? 'ok' : (value / rule.limit > 1.6 ? 'violation' : 'warn'),
        value,
        limit: rule.limit,
        unit: rule.unit,
        message: rule.message(loc, value, rule.limit),
      });
    }
  }

  return findings;
}

export function auditSummary(findings: PlanFinding[]) {
  return {
    total: findings.length,
    ok: findings.filter(f => f.severity === 'ok').length,
    warn: findings.filter(f => f.severity === 'warn').length,
    violations: findings.filter(f => f.severity === 'violation').length,
  };
}

// ---------------------------------------------------------------------------
// STARTER PROGRAMME — what a 40-citizen town needs before it grows
// ---------------------------------------------------------------------------

export interface ProgrammeRow {
  id: string;
  label: string;
  family: 'residential' | 'education' | 'health' | 'commerce' | 'civic' | 'employment' | 'leisure' | 'green' | 'industry';
  /** How many of this use a 40-person town needs. */
  at40: number;
  matches: (loc: LocationNode) => boolean;
  note: string;
}

export const STARTER_PROGRAMME: ProgrammeRow[] = [
  {
    id: 'housing', label: 'Housing', family: 'residential', at40: 4,
    matches: l => l.type === 'home',
    note: '4 blocks × 10 residents (≈4 per household) for 40 citizens.',
  },
  {
    id: 'school', label: 'School', family: 'education', at40: 1,
    matches: l => l.type === 'library',
    note: '~25% of the population are children; the library wing currently doubles as school.',
  },
  {
    id: 'clinic', label: 'Clinic / small hospital', family: 'health', at40: 1,
    matches: l => l.type === 'hospital' || l.type === 'wellness',
    note: 'Neighbourhood clinic inside the city, trauma hospital on the arterial.',
  },
  {
    id: 'market', label: 'Market / shops', family: 'commerce', at40: 2,
    matches: l => l.type === 'market' || l.type === 'bakery',
    note: 'Daily food within a 5–10 minute walk of every home.',
  },
  {
    id: 'civic', label: 'Civic administration', family: 'civic', at40: 1,
    matches: l => l.type === 'cityhall',
    note: 'City hall at the civic centre, on the arterial network.',
  },
  {
    id: 'jobs', label: 'Workplaces', family: 'employment', at40: 3,
    matches: l => l.type === 'office',
    note: '2–3 workplaces supply the 20–25 jobs a 40-person town needs.',
  },
  {
    id: 'cafe', label: 'Cafe / restaurant', family: 'leisure', at40: 1,
    matches: l => l.type === 'cafe' || l.type === 'cinema',
    note: 'Social anchor on the commercial high street.',
  },
  {
    id: 'park', label: 'Park', family: 'green', at40: 1,
    matches: l => l.type === 'park',
    note: 'Central green within 10 minutes of every home.',
  },
  {
    id: 'industry', label: 'Works yard / industry', family: 'industry', at40: 1,
    matches: l => l.type === 'construction_site' && l.districtId !== 'residential',
    note: 'Edge-of-town works with its own access road; never beside housing.',
  },
];

export function evaluateProgramme(locations: LocationNode[], population: number) {
  return STARTER_PROGRAMME.map(row => {
    const have = locations.filter(row.matches).length;
    const target = Math.max(1, Math.round(row.at40 * Math.max(0.25, population / 40)));
    return { ...row, have, target, gap: Math.max(0, target - have) };
  });
}

// ---------------------------------------------------------------------------
// EXPANSION POLICY — what to add, and when
// ---------------------------------------------------------------------------

export interface ExpansionStep {
  atPopulation: number;
  add: string;
  where: string;
  why: string;
  cost: number;
}

export const EXPANSION_STEPS: ExpansionStep[] = [
  { atPopulation: 60, add: '2 housing blocks (10 residents each)', where: 'Residential north-west, on the quiet loop', why: 'Keeps density low and preserves park access.', cost: 900 },
  { atPopulation: 60, add: '1 primary school', where: 'Inside the residential block, off the arterial', why: 'Child safety: no main-road crossings on the school walk.', cost: 1200 },
  { atPopulation: 70, add: '1 corner market', where: 'Residential edge at the arterial junction', why: 'Daily shopping inside the 10-minute walk radius.', cost: 600 },
  { atPopulation: 80, add: '1 police post + ambulance bay', where: 'On the arterial, at the industrial access road', why: 'Response time to both housing and industry.', cost: 1400 },
  { atPopulation: 90, add: 'Industry + works yard', where: 'South edge, beside the exit road', why: 'Jobs without noise near homes; freight never crosses the centre.', cost: 1800 },
  { atPopulation: 90, add: '1 clinic extension', where: 'Next to the hospital, arterial frontage', why: 'Healthcare strain rises with population density.', cost: 1000 },
];

export function expansionPlan(population: number): ExpansionStep[] {
  return EXPANSION_STEPS.filter(step => step.atPopulation >= population);
}

// ---------------------------------------------------------------------------
// PLOT SUITABILITY — used by the need-based urban planner
// ---------------------------------------------------------------------------

/**
 * How well a plot fits the use it would host. The urban planner multiplies a
 * plot's need-effectiveness by this score, so a clinic is never commissioned
 * in the middle of a quiet residential street if a civic plot is available.
 */
export function plotSuitability(loc: LocationNode, plannedType: string): number {
  const districtZone = DISTRICT_ZONE[loc.districtId];
  const useZone: ZoneKind =
    plannedType === 'home' ? 'residential'
    : plannedType === 'hospital' ? 'healthcare'
    : plannedType === 'school' ? 'civic'
    : plannedType === 'office' || plannedType === 'bank' ? 'employment'
    : plannedType === 'market' || plannedType === 'cafe' ? 'commercial'
    : districtZone;

  if (useZone === districtZone) return 1.25;

  // Neighbourhood services are welcome inside residential blocks, heavy uses not.
  if (districtZone === 'residential' && (useZone === 'healthcare' || useZone === 'commercial')) return 1.0;
  if (districtZone === 'civic' && useZone === 'healthcare') return 0.95;
  if (districtZone === 'employment' && useZone === 'commercial') return 1.0;

  return 0.6;
}

/** Convenience for UI lists: the three most urgent planning problems. */
export function criticalFindings(locations: LocationNode[], limit = 3): PlanFinding[] {
  return auditPlan(locations)
    .filter(f => f.severity !== 'ok')
    .sort((a, b) => (a.severity === 'violation' ? -1 : 1) - (b.severity === 'violation' ? -1 : 1))
    .slice(0, limit);
}

/** Population-derived need for school places (used by future expansion logic). */
export function schoolPlaces(population: number, agents: AgentData[]): { children: number; capacity: number } {
  const children = agents.filter(a => a.isChild).length;
  const schools = Math.round(population / 40);
  return { children, capacity: schools * 10 };
}

/** Re-exported so callers can reason about the same category keys. */
export type PlanNeed = NeedCategory;
