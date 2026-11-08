/**
 * ============================================================================
 *  TRAFFIC — functional vehicles, not scenery
 * ============================================================================
 *
 *  Every vehicle on the map has a job:
 *
 *    BUS        runs the L1 loop, dwells at each shelter with hazards on
 *    TAXI       cruises the boulevards looking for fares
 *    VAN/TRUCK  delivery runs between the market quarter and the works
 *    POLICE     patrols; dispatched to the active event district
 *    AMBULANCE  patrols near the hospital; dispatched to the same incident
 *    FIRE       stands by at the depot, dispatched to structure incidents
 *
 *  Movement is distance-along-route with lane offset, signals hold vehicles on
 *  red, buses dwell at stops, and service vehicles run lights + sirens while
 *  dispatched. All timing is in real milliseconds scaled by the sim speed, so
 *  pausing the city freezes the traffic too.
 */
import { AgentData, CityEvent } from '../types/simulation';
import {
  BUS_STOPS,
  ROAD_NODES,
  Route,
  ROUTES,
  edgeLength,
  routeLength,
  sampleRoute,
} from './roadNetwork';

export type VehicleKind = 'car' | 'taxi' | 'bus' | 'police' | 'ambulance' | 'fire' | 'van' | 'truck';

export interface TrafficVehicle {
  id: string;
  kind: VehicleKind;
  color: string;
  route: Route;
  /** Distance travelled along the route, in px. */
  distance: number;
  direction: 1 | -1;
  /** Current speed in px per real second at 1x. */
  speed: number;
  x: number;
  y: number;
  heading: number;
  /** Real-time ms until this vehicle may move again (bus dwell / red light). */
  holdUntil: number;
  /** Emergency lights + siren state. */
  emergency: boolean;
  dispatched: boolean;
  label?: string;
}

export interface TrafficContext {
  speedMultiplier: number;
  activeEvent: CityEvent | null;
  agents: AgentData[];
}

const CYCLE_MS = 16000; // one full signal cycle
const NS_GREEN_MS = 7000; // north-south green window
const AMBER_MS = 1200;

const VEHICLE_COLORS: Record<VehicleKind, string> = {
  car: '#E4E9EE',
  taxi: '#F6C445',
  bus: '#2E7D6B',
  police: '#1D4ED8',
  ambulance: '#F8FAFC',
  fire: '#C62828',
  van: '#94A3B8',
  truck: '#64748B',
};

const SERVICE_LABELS: Partial<Record<VehicleKind, string>> = {
  bus: 'L1 CITY LOOP',
  police: 'POLICE',
  ambulance: 'EMS',
  fire: 'FIRE',
};

function makeVehicle(
  id: string,
  kind: VehicleKind,
  route: Route,
  startDistance: number,
  direction: 1 | -1 = 1,
): TrafficVehicle {
  const sample = sampleRoute(route, startDistance);
  return {
    id,
    kind,
    color: VEHICLE_COLORS[kind],
    route,
    distance: startDistance,
    direction,
    speed: kind === 'bus' ? 46 : kind === 'truck' ? 44 : kind === 'van' ? 52 : 58,
    x: sample?.x ?? 0,
    y: sample?.y ?? 0,
    heading: sample?.heading ?? 0,
    holdUntil: 0,
    emergency: false,
    dispatched: false,
    label: SERVICE_LABELS[kind],
  };
}

export class TrafficSystem {
  public vehicles: TrafficVehicle[] = [];
  /** Simulation clock in ms — paused when the city is paused. */
  public clock = 0;

  private lastEventKey: string | null = null;
  private nextId = 0;

  constructor() {
    this.seed();
  }

  private seed(): void {
    const busLoop = ROUTES.busLoop;
    const loopLength = routeLength(busLoop);

    this.vehicles = [
      makeVehicle(this.id('bus'), 'bus', busLoop, 0),
      makeVehicle(this.id('bus'), 'bus', busLoop, loopLength * 0.5),
      makeVehicle(this.id('taxi'), 'taxi', ROUTES.taxiLoop, 120),
      makeVehicle(this.id('taxi'), 'taxi', ROUTES.taxiLoop, 620),
      makeVehicle(this.id('van'), 'van', ROUTES.deliveryLoop, 80),
      makeVehicle(this.id('truck'), 'truck', ROUTES.deliveryLoop, 900),
      makeVehicle(this.id('police'), 'police', ROUTES.taxiLoop, 1400),
      makeVehicle(this.id('ambulance'), 'ambulance', ROUTES.emergencyRun, 40),
      makeVehicle(this.id('fire'), 'fire', ROUTES.emergencyRun, 700),
      makeVehicle(this.id('car'), 'car', ROUTES.taxiLoop, 300),
      makeVehicle(this.id('car'), 'car', ROUTES.taxiLoop, 1800),
      makeVehicle(this.id('car'), 'car', ROUTES.busLoop, loopLength * 0.25),
    ];
  }

  private id(kind: string): string {
    this.nextId += 1;
    return `${kind}_${this.nextId}`;
  }

  /** Signal phase for an axis at the current clock. */
  signalFor(axis: 'ns' | 'ew'): 'green' | 'amber' | 'red' {
    const t = this.clock % CYCLE_MS;
    if (t < NS_GREEN_MS) return axis === 'ns' ? 'green' : 'red';
    if (t < NS_GREEN_MS + AMBER_MS) return axis === 'ns' ? 'amber' : 'red';
    if (t < NS_GREEN_MS * 2 + AMBER_MS) return axis === 'ew' ? 'green' : 'red';
    return axis === 'ew' ? 'amber' : 'red';
  }

  /**
   * Advance every vehicle. `dtMs` is real elapsed time; the sim speed scales
   * how far they travel. Paused vehicles never move.
   */
  step(dtMs: number, ctx: TrafficContext): void {
    const dt = Math.max(0, Math.min(64, dtMs)) * Math.max(0, ctx.speedMultiplier);
    this.clock += dt;

    this.syncDispatch(ctx);

    for (const vehicle of this.vehicles) {
      this.advance(vehicle, dt, ctx);
    }
  }

  /** Emergency response follows the city's actual event state. */
  private syncDispatch(ctx: TrafficContext): void {
    const event = ctx.activeEvent;
    const key = event ? `${event.id}:${event.type}` : 'calm';
    if (key === this.lastEventKey) return;
    this.lastEventKey = key;

    const serviceKinds: VehicleKind[] = ['police', 'ambulance', 'fire'];
    for (const vehicle of this.vehicles) {
      if (!serviceKinds.includes(vehicle.kind)) continue;
      vehicle.dispatched = !!event;
      vehicle.emergency = !!event && event.type !== 'coffee_promo' && event.type !== 'clear';
      // Dispatched units run a touch faster; otherwise they cruise.
      vehicle.speed = vehicle.emergency ? 78 : 54;
    }
  }

  private advance(vehicle: TrafficVehicle, dt: number, ctx: TrafficContext): void {
    if (this.clock < vehicle.holdUntil) return;

    const length = routeLength(vehicle.route);
    if (length <= 0) return;

    // --- Red-light discipline on the arterial junctions --------------------
    const ahead = this.approachingSignal(vehicle);
    if (ahead && !ahead.green) {
      vehicle.holdUntil = this.clock + 120;
      return;
    }

    // --- Bus dwell at shelters ---------------------------------------------
    if (vehicle.kind === 'bus') {
      const stop = BUS_STOPS.find(s => Math.hypot(s.x - vehicle.x, s.y - vehicle.y) < 42);
      if (stop) {
        vehicle.holdUntil = this.clock + 2600;
        vehicle.emergency = false;
        this.boardPassengers(vehicle.x, vehicle.y, ctx.agents);
      }
    }

    vehicle.distance += vehicle.speed * (dt / 1000) * vehicle.direction;

    if (vehicle.route.loop) {
      vehicle.distance = ((vehicle.distance % length) + length) % length;
    } else if (vehicle.distance > length) {
      vehicle.distance = length;
      vehicle.direction = -1;
    } else if (vehicle.distance < 0) {
      vehicle.distance = 0;
      vehicle.direction = 1;
    }

    const sample = sampleRoute(vehicle.route, vehicle.distance);
    if (!sample) return;

    // Keep right: offset perpendicular to the direction of travel.
    const heading = vehicle.direction === 1 ? sample.heading : sample.heading + Math.PI;
    const lane = vehicle.kind === 'bus' ? 26 : 20;
    vehicle.x = sample.x - Math.sin(heading) * lane;
    vehicle.y = sample.y + Math.cos(heading) * lane;
    vehicle.heading = heading;
  }

  /** Is this vehicle rolling up to a red light? */
  private approachingSignal(vehicle: TrafficVehicle): { green: boolean } | null {
    for (const node of ROAD_NODES) {
      if (!node.signal) continue;
      const dx = node.x - vehicle.x;
      const dy = node.y - vehicle.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 66 || distance < 30) continue;

      // Only stop if the junction is actually ahead of the nose.
      const forwardX = Math.cos(vehicle.heading);
      const forwardY = Math.sin(vehicle.heading);
      if (dx * forwardX + dy * forwardY <= 0) continue;

      const axis = Math.abs(forwardX) > Math.abs(forwardY) ? 'ew' : 'ns';
      const phase = this.signalFor(axis);
      return { green: phase === 'green' };
    }
    return null;
  }

  /**
   * Citizens standing at a dwelling bus are treated as boarding: a small
   * comfort/energy top-up and a city-wide ridership counter. This is the
   * functional link between public transport and the simulation.
   */
  public ridersServed = 0;

  private boardPassengers(x: number, y: number, agents: AgentData[]): void {
    let boarded = 0;
    for (const agent of agents) {
      if (agent.state !== 'TRAVELING' && agent.state !== 'IDLE') continue;
      if (Math.hypot(agent.x - x, agent.y - y) > 74) continue;
      agent.stats.social = Math.min(100, agent.stats.social + 2.5);
      agent.stats.energy = Math.min(100, agent.stats.energy + 1.2);
      boarded += 1;
    }
    if (boarded > 0) this.ridersServed += boarded;
  }

  /** Vehicles currently inside the viewport — cheap culling for the renderer. */
  visible(x0: number, y0: number, x1: number, y1: number): TrafficVehicle[] {
    return this.vehicles.filter(v => v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1);
  }

  /** Number of citizens the bus network is currently serving (for the HUD). */
  transitRidership(agents: AgentData[]): number {
    return agents.filter(a => a.state === 'TRAVELING').length;
  }
}

export const TRAFFIC = new TrafficSystem();

/** Re-export for renderers that want the route distances. */
export { edgeLength };
