/**
 * ============================================================================
 *  ROAD NETWORK — the city's circulation skeleton
 * ============================================================================
 *
 *  One authoritative description of every carriageway, junction, bus stop and
 *  signal, shared by the road renderer and the traffic simulation. Before this
 *  module the map drew roads as decorative rectangles while vehicles drove on
 *  hard-coded guesses; now geometry and behaviour read the same data.
 *
 *  Hierarchy (as a real town would be planned):
 *    • ARTERIAL  4 lanes, 88 px, signals at junctions  — x=1024/2176, y=448/1856
 *    • COLLECTOR 2 lanes, 34 px, give-way            — service streets
 *    • FRONTAGE  footpaths from the kerb to a door   — drawn per building
 */
import { Waypoint } from '../types/simulation';

export type RoadKind = 'arterial' | 'collector';
export type Axis = 'h' | 'v';

export interface RoadNode {
  id: string;
  x: number;
  y: number;
  /** Signals belong to junctions only. */
  signal?: boolean;
}

export interface RoadEdge {
  id: string;
  from: string;
  to: string;
  axis: Axis;
  kind: RoadKind;
  /** Carriageway width in px (kerb to kerb). */
  width: number;
  lanes: number;
  /** Comfortable cruising speed in px per real second at 1x. */
  speed: number;
}

export interface BusStop {
  id: string;
  name: string;
  route: string;
  x: number;
  y: number;
  /** Which way the shelter faces. */
  facing: 'n' | 's' | 'e' | 'w';
}

export interface TrafficSignal {
  nodeId: string;
  /** Seconds into the cycle; shared clock, driven by the renderer/sim. */
  cycle: number;
}

export const ROAD_NODES: RoadNode[] = [
  // Four arterial junctions.
  { id: 'j_nw', x: 1024, y: 448, signal: true },
  { id: 'j_ne', x: 2176, y: 448, signal: true },
  { id: 'j_sw', x: 1024, y: 1856, signal: true },
  { id: 'j_se', x: 2176, y: 1856, signal: true },
  // Perimeter tie-ins so the ring reads as a through-route.
  { id: 'p_n_w', x: 40, y: 448 },
  { id: 'p_n_e', x: 3160, y: 448 },
  { id: 'p_s_w', x: 40, y: 1856 },
  { id: 'p_s_e', x: 3160, y: 1856 },
  { id: 'p_w_n', x: 1024, y: 40 },
  { id: 'p_w_s', x: 1024, y: 2392 },
  { id: 'p_e_n', x: 2176, y: 40 },
  { id: 'p_e_s', x: 2176, y: 2392 },
];

export const ROAD_EDGES: RoadEdge[] = [
  // Northern avenue (west ↔ east)
  { id: 'av_n_w', from: 'p_n_w', to: 'j_nw', axis: 'h', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  { id: 'av_n_m', from: 'j_nw', to: 'j_ne', axis: 'h', kind: 'arterial', width: 88, lanes: 4, speed: 70 },
  { id: 'av_n_e', from: 'j_ne', to: 'p_n_e', axis: 'h', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  // Southern avenue
  { id: 'av_s_w', from: 'p_s_w', to: 'j_sw', axis: 'h', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  { id: 'av_s_m', from: 'j_sw', to: 'j_se', axis: 'h', kind: 'arterial', width: 88, lanes: 4, speed: 70 },
  { id: 'av_s_e', from: 'j_se', to: 'p_s_e', axis: 'h', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  // Western boulevard
  { id: 'bv_w_n', from: 'p_w_n', to: 'j_nw', axis: 'v', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  { id: 'bv_w_m', from: 'j_nw', to: 'j_sw', axis: 'v', kind: 'arterial', width: 88, lanes: 4, speed: 70 },
  { id: 'bv_w_s', from: 'j_sw', to: 'p_w_s', axis: 'v', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  // Eastern boulevard
  { id: 'bv_e_n', from: 'p_e_n', to: 'j_ne', axis: 'v', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
  { id: 'bv_e_m', from: 'j_ne', to: 'j_se', axis: 'v', kind: 'arterial', width: 88, lanes: 4, speed: 70 },
  { id: 'bv_e_s', from: 'j_se', to: 'p_e_s', axis: 'v', kind: 'arterial', width: 88, lanes: 4, speed: 62 },
];

export const BUS_STOPS: BusStop[] = [
  { id: 'stop_west', name: 'Sunset Hills', route: 'L1', x: 1024, y: 900, facing: 'w' },
  { id: 'stop_north', name: 'Civic Plaza', route: 'L1', x: 1600, y: 448, facing: 'n' },
  { id: 'stop_east', name: 'Tech Corridor', route: 'L1', x: 2176, y: 1100, facing: 'e' },
  { id: 'stop_south', name: 'Lifeline Hospital', route: 'L1', x: 1600, y: 1856, facing: 's' },
];

export const SIGNALS: TrafficSignal[] = ROAD_NODES
  .filter(node => node.signal)
  .map(node => ({ nodeId: node.id, cycle: 0 }));

const NODE_BY_ID = new Map(ROAD_NODES.map(node => [node.id, node]));

export function nodeAt(id: string): RoadNode {
  return NODE_BY_ID.get(id) ?? ROAD_NODES[0];
}

/** Vehicles drive on the right: offset from the centreline by a lane. */
export function laneOffset(edge: RoadEdge, direction: 1 | -1): number {
  // Right-hand traffic: heading +x rides +y, heading +y rides -x.
  const magnitude = edge.kind === 'arterial' ? 22 : 9;
  if (edge.axis === 'h') return direction === 1 ? magnitude : -magnitude;
  return direction === 1 ? -magnitude : magnitude;
}

/** Centre-line point at a given distance along an edge. */
export function pointOnEdge(edge: RoadEdge, distance: number): Waypoint {
  const a = nodeAt(edge.from);
  const b = nodeAt(edge.to);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const t = Math.max(0, Math.min(1, distance / length));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function edgeLength(edge: RoadEdge): number {
  const a = nodeAt(edge.from);
  const b = nodeAt(edge.to);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** A drivable polyline: edge ids in travel order. */
export interface Route {
  id: string;
  edges: string[];
  /** Stops (bus stop ids or synthetic waypoints) along the route. */
  stops?: string[];
  loop: boolean;
}

const EDGE_BY_ID = new Map(ROAD_EDGES.map(edge => [edge.id, edge]));

export interface RouteSample {
  x: number;
  y: number;
  heading: number;
  /** Distance remaining to the next signal on a red phase, if any. */
  edgeId: string;
  kind: RoadKind;
  speed: number;
}

/** Sample a route by distance; returns the CENTRE-LINE point and heading. */
export function sampleRoute(route: Route, travelled: number): RouteSample | null {
  let remaining = travelled;
  for (const edgeId of route.edges) {
    const edge = EDGE_BY_ID.get(edgeId);
    if (!edge) continue;
    const length = edgeLength(edge);
    if (remaining > length) {
      remaining -= length;
      continue;
    }
    const a = nodeAt(edge.from);
    const b = nodeAt(edge.to);
    const base = pointOnEdge(edge, remaining);
    const heading = Math.atan2(b.y - a.y, b.x - a.x);
    return {
      x: base.x,
      y: base.y,
      heading,
      edgeId,
      kind: edge.kind,
      speed: edge.speed,
    };
  }
  return null;
}

export function routeLength(route: Route): number {
  return route.edges.reduce((sum, id) => {
    const edge = EDGE_BY_ID.get(id);
    return sum + (edge ? edgeLength(edge) : 0);
  }, 0);
}

// ---------------------------------------------------------------------------
// The pre-authored routes that make the city feel inhabited
// ---------------------------------------------------------------------------

export const ROUTES = {
  /** City bus loop: the four arterial junctions, stopping at every shelter. */
  busLoop: {
    id: 'L1',
    edges: ['av_n_m', 'bv_e_m', 'av_s_m', 'bv_w_m'],
    stops: BUS_STOPS.map(stop => stop.id),
    loop: true,
  } as Route,
  /** Taxi circuit — shorter, cuts across the civic centre. */
  taxiLoop: {
    id: 'T1',
    edges: ['av_n_w', 'bv_w_m', 'av_s_w'],
    loop: false,
  } as Route,
  /** Delivery run between the market quarter and the eastern works. */
  deliveryLoop: {
    id: 'D1',
    edges: ['bv_w_n', 'av_n_m', 'bv_e_n'],
    loop: false,
  } as Route,
  /** Emergency response: hospital (south-east) to the civic centre. */
  emergencyRun: {
    id: 'E1',
    edges: ['bv_e_m', 'av_n_m'],
    loop: false,
  } as Route,
};

/** Nearest bus stop to a world point (used for waiting citizens + dispatch). */
export function nearestBusStop(x: number, y: number): BusStop {
  let best = BUS_STOPS[0];
  let bestDistance = Infinity;
  for (const stop of BUS_STOPS) {
    const d = Math.hypot(stop.x - x, stop.y - y);
    if (d < bestDistance) {
      bestDistance = d;
      best = stop;
    }
  }
  return best;
}
