import { AgentData, LocationNode, SimulationTime } from '../types/simulation';
import { CITY_LOCATIONS } from './cityMap';
import { createMemory } from './agentLogic';
import { isWorkHours } from './schedule';

/**
 * Movement System
 * ---------------
 * The single source of truth for agent locomotion.
 *
 * The renderer is read-only: it never advances `agent.x/y`, `pathIndex` or
 * `walkCycle`. This module is driven by SimulationEngine's high-frequency loop,
 * so pausing / changing speed affects both the simulation clock and movement
 * consistently.
 */

const WORLD_SPEED_PER_UNIT = 24; // world pixels per second at 1x for speed = 1
const MAX_FRAME_DELTA_MS = 100; // avoid teleporting after tab throttling

export interface MovementResult {
  arrived: boolean;
  locationId?: string;
}

function finishArrival(agent: AgentData, time: SimulationTime): void {
  const destinationId = agent.targetLocationId;
  const reachedLoc = destinationId
    ? CITY_LOCATIONS.find(l => l.id === destinationId)
    : undefined;

  agent.state = 'IDLE';
  agent.currentLocationId = destinationId;
  agent.targetLocationId = null;
  agent.path = [];
  agent.pathIndex = 0;
  agent.bobOffset = 0;
  agent.isCarryingHammer = false;

  if (!reachedLoc) return;

  agent.currentThought = `Arrived at ${reachedLoc.name}`;
  agent.thoughtEmoji = reachedLoc.signEmoji;

  agent.memoryStream.unshift(
    createMemory(time, 'travel', `Reached destination: ${reachedLoc.name}.`, 'low')
  );
  if (agent.memoryStream.length > 80) agent.memoryStream.pop();

  const onShift = isWorkHours(time) && agent.workNodeId === reachedLoc.id;
  const constructionActive =
    reachedLoc.status === 'under_construction' || reachedLoc.status === 'damaged';

  if (reachedLoc.type === 'construction_site') {
    if (agent.role === 'builder' && constructionActive) {
      agent.state = 'BUILDING';
      agent.isCarryingHammer = true;
    }
    return;
  }

  // Employees who arrive during their shift are workers, not customers.
  if (onShift) {
    agent.state = 'WORKING';
    return;
  }

  switch (reachedLoc.type) {
    case 'home':
      if (agent.stats.energy < 30 || time.hour >= 22 || time.hour < 7) {
        agent.state = 'SLEEPING';
      }
      break;
    case 'office':
      agent.state = 'WORKING';
      break;
    case 'cafe':
    case 'bakery':
      agent.state = 'EATING';
      break;
    case 'market':
      agent.state = 'SHOPPING';
      break;
    case 'cinema':
    case 'park':
      agent.state = 'RELAXING';
      break;
    case 'hospital':
    case 'wellness':
      agent.state = 'HEALING';
      break;
    case 'bank':
      agent.state = 'BANKING';
      break;
    case 'cityhall':
    case 'library':
    case 'police':
      agent.state = 'CIVIC';
      break;
    default:
      break;
  }
}

/**
 * Advance one agent along its path.
 *
 * @param deltaMs real elapsed milliseconds since the previous movement frame
 * @param speedMultiplier global simulation speed (1x, 2x, 5x, 10x)
 */
export function advanceAgentMovement(
  agent: AgentData,
  deltaMs: number,
  time: SimulationTime,
  speedMultiplier: number
): MovementResult {
  if (agent.state !== 'TRAVELING') return { arrived: false };

  if (!agent.path.length || agent.pathIndex >= agent.path.length) {
    finishArrival(agent, time);
    return { arrived: true, locationId: agent.currentLocationId || undefined };
  }

  const frameMs = Math.min(Math.max(deltaMs, 0), MAX_FRAME_DELTA_MS);
  const speed = agent.speed * WORLD_SPEED_PER_UNIT * (frameMs / 1000) * Math.max(1, speedMultiplier);
  let remaining = speed;

  while (remaining > 0 && agent.pathIndex < agent.path.length) {
    const targetPoint = agent.path[agent.pathIndex];
    const dx = targetPoint.x - agent.x;
    const dy = targetPoint.y - agent.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= 0.001) {
      agent.x = targetPoint.x;
      agent.y = targetPoint.y;
      agent.pathIndex++;
      continue;
    }

    if (dx !== 0) agent.facing = dx >= 0 ? 'right' : 'left';

    if (dist <= remaining) {
      agent.x = targetPoint.x;
      agent.y = targetPoint.y;
      remaining -= dist;
      agent.pathIndex++;
    } else {
      agent.x += (dx / dist) * remaining;
      agent.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }

  agent.walkCycle += speed * 0.09;
  agent.bobOffset = Math.sin(agent.walkCycle) * 2.2;

  if (agent.pathIndex >= agent.path.length) {
    finishArrival(agent, time);
    return { arrived: true, locationId: agent.currentLocationId || undefined };
  }

  return { arrived: false };
}

/**
 * Advance every traveling agent. The engine calls this on its movement loop,
 * never from the canvas renderer.
 */
export function advanceAllAgentMovement(
  agents: AgentData[],
  deltaMs: number,
  time: SimulationTime,
  speedMultiplier: number
): AgentData[] {
  const arrived: AgentData[] = [];
  for (const agent of agents) {
    if (advanceAgentMovement(agent, deltaMs, time, speedMultiplier).arrived) {
      arrived.push(agent);
    }
  }
  return arrived;
}

export function getLocationForAgent(agent: AgentData): LocationNode | undefined {
  return CITY_LOCATIONS.find(l => l.id === agent.currentLocationId);
}
