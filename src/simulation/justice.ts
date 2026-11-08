/**
 * ============================================================================
 *  JUSTICE — crimes, victims, police response and consequences
 * ============================================================================
 *
 *  The psychology module decides that a person is ready to break the law; this
 *  module turns that decision into a case with a life of its own:
 *
 *      reported → dispatched → officer on scene → arrested | escaped
 *
 *  What happens along the way is what makes the city feel human:
 *    • witnesses are whoever was close enough to see it,
 *    • evidence grows with witnesses and the seriousness of the offence,
 *    • the nearest free officer is dispatched and must physically travel there,
 *    • the arrest chance depends on evidence, the suspect's nerve and the
 *      officer's presence,
 *    • an arrest means a fine, a criminal record, detention and shame,
 *    • an escape raises the suspect's confidence and the city's fear.
 *
 *  Every outcome is returned to the engine as an event so it can update the
 *  treasury, the notifications, the memories and the gazette.
 */
import { AgentData, SimulationTime } from '../types/simulation';
import { CITY_LOCATIONS } from './cityMap';
import { sendAgentToLocation } from './agentLogic';
import {
  applyArrestAftermath,
  applyCrimeAftermath,
  applyVictimAftermath,
  crimeTemptation,
  ensurePsyche,
  findCrimeOpportunity,
  updatePsyche,
  CrimePlan,
} from './psychology';

export type IncidentStatus = 'reported' | 'responding' | 'resolved';

export interface CrimeIncident {
  id: string;
  kind: 'crime' | 'accident';
  type: CrimePlan['type'] | 'workplace_accident';
  label: string;
  severity: 1 | 2 | 3;
  day: number;
  timeString: string;
  locationId: string;
  perpetratorId: string | null;
  victimId: string | null;
  witnesses: string[];
  evidence: number;
  status: IncidentStatus;
  officerId: string | null;
  outcome: 'arrest' | 'escape' | 'settled' | null;
  resolvedDay: number | null;
}

export interface JusticeEvent {
  kind: 'crime' | 'dispatch' | 'arrest' | 'escape' | 'release' | 'accident';
  message: string;
  icon: string;
  agentIds: string[];
  /** Money moved to the municipal treasury (fines). */
  fine?: number;
  /** Money returned to a victim. */
  restitution?: number;
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));

const CRIME_ICON: Record<string, string> = {
  shoplifting: '🛒',
  mugging: '🥷',
  vandalism: '🧱',
  assault: '🥊',
  workplace_accident: '🚑',
};

/** A crime is unlikely per tick, but 40 citizens adding up over a day is not. */
const BASE_CRIME_RATE = 0.0016;

export class JusticeSystem {
  public incidents: CrimeIncident[] = [];
  /** 0..100 public safety index shown in the HUD. */
  public safety = 74;
  public crimesToday = 0;
  public arrestsToday = 0;
  public totalCrimes = 0;
  public totalArrests = 0;

  private nextId = 1;
  private lastDay = 1;

  private id(prefix: string): string {
    this.nextId += 1;
    return `${prefix}_${this.nextId}`;
  }

  /** One cognitive tick (≈2 sim-minutes). */
  tick(agents: AgentData[], time: SimulationTime): JusticeEvent[] {
    const events: JusticeEvent[] = [];

    if (time.day !== this.lastDay) {
      this.lastDay = time.day;
      this.crimesToday = 0;
      this.arrestsToday = 0;
    }

    // 1. Everyone's inner state reacts to the city ---------------------------
    for (const agent of agents) updatePsyche(agent, time);

    // 2. Release anyone whose sentence is served ----------------------------
    for (const agent of agents) {
      if (agent.jailedUntil == null) continue;
      if (time.day < agent.jailedUntil) continue;
      agent.jailedUntil = undefined;
      agent.state = 'IDLE';
      agent.currentLocationId = 'police';
      agent.currentThought = 'Released. Walking out into a changed city.';
      agent.thoughtEmoji = '🚪';
      ensurePsyche(agent).stress = clamp((agent.psyche?.stress ?? 40) - 10);
      events.push({
        kind: 'release',
        message: `🔓 ${agent.name} was released from detention.`,
        icon: '🔓',
        agentIds: [agent.id],
      });
    }

    // 3. Who is tempted? ----------------------------------------------------
    const policeOnDuty = agents.filter(a => a.workNodeId === 'police' && !this.isDetained(a, time)).length;
    const tension = this.incidents.filter(i => i.day === time.day && i.status !== 'resolved').length;
    const ctx = { policePresence: policeOnDuty, neighbourhoodTension: tension };

    for (const agent of agents) {
      if (this.isDetained(agent, time)) continue;
      if (agent.isChild) continue;
      if (agent.state === 'TRAVELING' || agent.state === 'SLEEPING') continue;
      if (time.day - (agent.psyche?.lastCrimeDay ?? -999) < 1) continue; // at most one offence a day

      const temptation = crimeTemptation(agent, ctx);
      if (temptation < 0.08) continue;
      if (Math.random() > temptation * BASE_CRIME_RATE) continue;

      const plan = findCrimeOpportunity(agent, agents);
      if (!plan) continue;

      const incident = this.commit(agent, plan, agents, time);
      events.push({
        kind: 'crime',
        message: `${CRIME_ICON[plan.type] ?? '⚠️'} ${agent.name} ${plan.label}!`,
        icon: CRIME_ICON[plan.type] ?? '⚠️',
        agentIds: [agent.id, ...(plan.victimId ? [plan.victimId] : [])],
      });
      void incident;
    }

    // 4. Workplace accidents (rare, but they happen) ------------------------
    for (const agent of agents) {
      if (this.isDetained(agent, time)) continue;
      const place = CITY_LOCATIONS.find(l => l.id === agent.currentLocationId);
      if (!place || place.type !== 'construction_site') continue;
      if (agent.stats.energy > 28) continue;
      if (Math.random() > 0.0009) continue;

      agent.stats.energy = clamp(agent.stats.energy - 25);
      agent.stats.mood = clamp(agent.stats.mood - 15);
      agent.state = 'HEALING';
      const incident: CrimeIncident = {
        id: this.id('inc'),
        kind: 'accident',
        type: 'workplace_accident',
        label: `was injured at ${place.name}`,
        severity: 2,
        day: time.day,
        timeString: time.timeString,
        locationId: place.id,
        perpetratorId: null,
        victimId: agent.id,
        witnesses: [],
        evidence: 0.5,
        status: 'resolved',
        officerId: null,
        outcome: 'settled',
        resolvedDay: time.day,
      };
      this.incidents.push(incident);
      events.push({
        kind: 'accident',
        message: `🚑 ${agent.name} was injured at ${place.name} and rushed to hospital.`,
        icon: '🚑',
        agentIds: [agent.id],
      });
    }

    // 5. Police response ----------------------------------------------------
    for (const incident of this.incidents) {
      if (incident.status === 'resolved') continue;

      if (incident.status === 'reported') {
        const officer = this.findOfficer(agents, incident, time);
        if (!officer) continue;
        incident.status = 'responding';
        incident.officerId = officer.id;
        const place = CITY_LOCATIONS.find(l => l.id === incident.locationId);
        sendAgentToLocation(officer, incident.locationId, time);
        // NOTE: sendAgentToLocation switches the officer to TRAVELING — never
        // overwrite that state here or the officer would never actually move.
        officer.currentThought = `Responding to ${incident.label}`;
        officer.thoughtEmoji = '🚨';
        if (place) {
          ensurePsyche(officer).stress = clamp((officer.psyche?.stress ?? 30) + 6);
        }
        events.push({
          kind: 'dispatch',
          message: `🚨 Officer ${officer.name} dispatched to ${incident.label}.`,
          icon: '🚨',
          agentIds: [officer.id],
        });
        continue;
      }

      // On scene? The officer must physically arrive at the location.
      const officer = agents.find(a => a.id === incident.officerId);
      if (!officer) {
        incident.status = 'reported';
        incident.officerId = null;
        continue;
      }
      if (officer.currentLocationId !== incident.locationId) continue;

      this.resolve(incident, agents, time, events);
    }

    // 6. Safety index drifts toward calm unless the city is burning ---------
    this.safety = clamp(this.safety + (74 - this.safety) * 0.002 - 0.001);
    this.incidents = this.incidents.filter(
      incident => incident.resolvedDay == null || time.day - incident.resolvedDay < 3,
    );

    return events;
  }

  private isDetained(agent: AgentData, time: SimulationTime): boolean {
    return agent.jailedUntil != null && time.day < agent.jailedUntil;
  }

  private findOfficer(agents: AgentData[], incident: CrimeIncident, time: SimulationTime): AgentData | null {
    const place = CITY_LOCATIONS.find(l => l.id === incident.locationId);
    if (!place) return null;

    const available = agents.filter(agent =>
      agent.workNodeId === 'police'
      && !this.isDetained(agent, time)
      && !this.incidents.some(i => i.officerId === agent.id && i.status === 'responding'),
    );
    if (available.length === 0) return null;

    available.sort((a, b) =>
      Math.hypot(a.x - place.door.x, a.y - place.door.y) - Math.hypot(b.x - place.door.x, b.y - place.door.y),
    );
    return available[0];
  }

  /** Create the case, apply immediate consequences, notify the city. */
  private commit(
    agent: AgentData,
    plan: CrimePlan,
    agents: AgentData[],
    time: SimulationTime,
  ): CrimeIncident {
    const witnesses = agents
      .filter(other =>
        other.id !== agent.id
        && other.id !== plan.victimId
        && Math.hypot(other.x - agent.x, other.y - agent.y) < 150,
      )
      .map(other => other.id);

    const victim = plan.victimId ? agents.find(a => a.id === plan.victimId) ?? null : null;

    applyCrimeAftermath(agent, plan.severity);
    const psyche = ensurePsyche(agent);
    psyche.lastCrimeDay = time.day;

    if (victim) {
      applyVictimAftermath(victim, plan.severity);
      if (plan.type === 'mugging') {
        const taken = Math.round(Math.min(victim.stats.money * 0.35, 60));
        victim.stats.money = Math.max(0, victim.stats.money - taken);
        agent.stats.money += taken;
      }
      victim.memoryStream.unshift({
        id: `mem_crime_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timeString: time.timeString,
        day: time.day,
        simMinute: time.totalMinutes,
        category: 'event',
        text: `Was ${plan.label.replace(/^\w+/, 'victim of')} — feels unsafe and betrayed.`,
        importance: 'high',
      });
    }

    agent.memoryStream.unshift({
      id: `mem_crime_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timeString: time.timeString,
      day: time.day,
      simMinute: time.totalMinutes,
      category: 'moral',
      text: `Committed ${plan.type.replace('_', ' ')} (${plan.label}). Stress eased for a moment; the fear did not.`,
      importance: 'high',
    });

    const evidence = clamp(0.2 + witnesses.length * 0.13 + (plan.severity === 3 ? 0.2 : 0), 0, 0.95);

    const incident: CrimeIncident = {
      id: this.id('inc'),
      kind: 'crime',
      type: plan.type,
      label: plan.label,
      severity: plan.severity,
      day: time.day,
      timeString: time.timeString,
      locationId: plan.locationId,
      perpetratorId: agent.id,
      victimId: plan.victimId ?? null,
      witnesses,
      evidence,
      status: 'reported',
      officerId: null,
      outcome: null,
      resolvedDay: null,
    };

    this.incidents.push(incident);
    this.crimesToday += 1;
    this.totalCrimes += 1;
    this.safety = clamp(this.safety - 3 * plan.severity);
    return incident;
  }

  /** Officer on scene: investigate, then arrest or lose the suspect. */
  private resolve(
    incident: CrimeIncident,
    agents: AgentData[],
    time: SimulationTime,
    events: JusticeEvent[],
  ): void {
    const perpetrator = incident.perpetratorId ? agents.find(a => a.id === incident.perpetratorId) ?? null : null;
    const officer = incident.officerId ? agents.find(a => a.id === incident.officerId) ?? null : null;

    incident.status = 'resolved';
    incident.resolvedDay = time.day;

    // Send the officer back to the station afterwards.
    if (officer) {
      officer.state = 'IDLE';
      officer.currentThought = 'Report filed. Back on patrol.';
      officer.thoughtEmoji = '📋';
      sendAgentToLocation(officer, 'police', time);
    }

    if (!perpetrator) {
      incident.outcome = 'settled';
      return;
    }

    const nerve = (perpetrator.psyche?.impulse ?? 50) / 300;
    const officersNearby = agents.filter(agent =>
      agent.workNodeId === 'police'
      && Math.hypot(agent.x - perpetrator.x, agent.y - perpetrator.y) < 240,
    ).length;
    const arrestChance = clamp(0.3 + incident.evidence * 0.45 + officersNearby * 0.08 - nerve, 0.12, 0.94);

    if (Math.random() < arrestChance) {
      const fine = 40 * incident.severity;
      const restitution = incident.victimId ? Math.round(fine * 0.5) : 0;
      const days = incident.severity + 1;

      perpetrator.jailedUntil = time.day + days;
      perpetrator.state = 'CIVIC';
      perpetrator.currentLocationId = 'police';
      perpetrator.currentThought = 'Detained. Regretting every choice that led here.';
      perpetrator.thoughtEmoji = '🚔';
      applyArrestAftermath(perpetrator);

      perpetrator.record = perpetrator.record ?? [];
      perpetrator.record.unshift({
        day: time.day,
        type: incident.type,
        outcome: 'arrested',
        note: incident.label,
      });

      const victim = incident.victimId ? agents.find(a => a.id === incident.victimId) ?? null : null;
      if (victim && restitution > 0) victim.stats.money += restitution;

      incident.outcome = 'arrest';
      this.arrestsToday += 1;
      this.totalArrests += 1;
      this.safety = clamp(this.safety + 2);

      events.push({
        kind: 'arrest',
        message: `🚔 ${perpetrator.name} arrested for ${incident.type.replace('_', ' ')} (${incident.witnesses.length} witness${incident.witnesses.length === 1 ? '' : 'es'}). Fined $${fine}, ${days} day${days === 1 ? '' : 's'} detention.`,
        icon: '🚔',
        agentIds: [perpetrator.id, ...(officer ? [officer.id] : [])],
        fine,
        restitution,
      });
    } else {
      perpetrator.record = perpetrator.record ?? [];
      perpetrator.record.unshift({
        day: time.day,
        type: incident.type,
        outcome: 'escaped',
        note: incident.label,
      });
      ensurePsyche(perpetrator).suspicion = clamp((perpetrator.psyche?.suspicion ?? 0) + 10);
      incident.outcome = 'escape';
      this.safety = clamp(this.safety - 2);
      events.push({
        kind: 'escape',
        message: `🏃 ${perpetrator.name} slipped away before ${officer?.name ?? 'the officer'} arrived.`,
        icon: '🏃',
        agentIds: [perpetrator.id, ...(officer ? [officer.id] : [])],
      });
    }
  }

  /** Compact snapshot for the HUD. */
  summary() {
    const active = this.incidents.filter(i => i.status !== 'resolved').length;
    return {
      safety: Math.round(this.safety),
      crimesToday: this.crimesToday,
      arrestsToday: this.arrestsToday,
      activeIncidents: active,
      openCases: this.incidents.filter(i => i.status !== 'resolved'),
    };
  }
}

export const JUSTICE = new JusticeSystem();
