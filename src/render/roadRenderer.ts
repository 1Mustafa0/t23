/**
 * ============================================================================
 *  ROAD RENDERER — the carriageway, drawn like a street plan
 * ============================================================================
 *
 *  Reads roadNetwork.ts and paints in strict layers so nothing bleeds through:
 *
 *    1. FOOTWAYS   one band per edge (kerb + paving joints)
 *    2. CARRIAGEWAYS  asphalt + lane discipline (double-yellow, dashed lanes)
 *    3. JUNCTIONS  asphalt box, corner kerbs, stop lines, zebra crossings,
 *                  signal heads showing the LIVE phase
 *    4. FURNITURE  lamps, gullies, bus shelters with route flags
 *
 *  Geometry and traffic behaviour read the same node/edge data, so a vehicle
 *  always drives exactly where the road is drawn.
 */
import { BUS_STOPS, ROAD_EDGES, ROAD_NODES, nodeAt } from '../simulation/roadNetwork';
import type { TrafficSystem } from '../simulation/vehicleSystem';
import { FRONTAGES, ROADS } from '../layout';

const INK = '#26323f';
const PAVING = '#ded7cb';
const PAVING_SNOW = '#eef2f6';
const ASPHALT = '#49535d';
const ASPHALT_SNOW = '#5b6670';

export interface RoadRenderOptions {
  isNight: boolean;
  isSnowing: boolean;
  traffic: TrafficSystem;
  clock: number;
  view: { x0: number; y0: number; x1: number; y1: number };
}

const inView = (view: RoadRenderOptions['view'], x: number, y: number, pad = 140) =>
  x >= view.x0 - pad && x <= view.x1 + pad && y >= view.y0 - pad && y <= view.y1 + pad;

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

function edgeBounds(edgeId: string) {
  const edge = ROAD_EDGES.find(e => e.id === edgeId);
  if (!edge) return null;
  const a = nodeAt(edge.from);
  const b = nodeAt(edge.to);
  return { edge, a, b, horizontal: edge.axis === 'h' };
}

// ---------------------------------------------------------------------------
// 1. FOOTWAYS
// ---------------------------------------------------------------------------

function drawFootway(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  const walk = 16;
  ctx.fillStyle = opts.isSnowing ? PAVING_SNOW : PAVING;

  for (const edge of ROAD_EDGES) {
    const a = nodeAt(edge.from);
    const b = nodeAt(edge.to);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (!inView(opts.view, midX, midY, Math.hypot(b.x - a.x, b.y - a.y) / 2)) continue;

    const half = edge.width / 2 + walk;
    if (edge.axis === 'h') {
      ctx.fillRect(Math.min(a.x, b.x), a.y - half, Math.abs(b.x - a.x), half * 2);
    } else {
      ctx.fillRect(a.x - half, Math.min(a.y, b.y), half * 2, Math.abs(b.y - a.y));
    }
  }

  // Paving joints + kerb shadow, clipped out of the junction boxes later.
  ctx.strokeStyle = 'rgba(38, 50, 63, 0.13)';
  ctx.lineWidth = 1;
  for (const edge of ROAD_EDGES) {
    const a = nodeAt(edge.from);
    const b = nodeAt(edge.to);
    const half = edge.width / 2;
    if (edge.axis === 'h') {
      for (let x = Math.min(a.x, b.x) + 10; x < Math.max(a.x, b.x) - 6; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, a.y - half - 14);
        ctx.lineTo(x, a.y - half - 2);
        ctx.moveTo(x, a.y + half + 2);
        ctx.lineTo(x, a.y + half + 14);
        ctx.stroke();
      }
    } else {
      for (let y = Math.min(a.y, b.y) + 10; y < Math.max(a.y, b.y) - 6; y += 26) {
        ctx.beginPath();
        ctx.moveTo(a.x - half - 14, y);
        ctx.lineTo(a.x - half - 2, y);
        ctx.moveTo(a.x + half + 2, y);
        ctx.lineTo(a.x + half + 14, y);
        ctx.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. CARRIAGEWAYS
// ---------------------------------------------------------------------------

function drawCarriageways(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  ctx.fillStyle = opts.isSnowing ? ASPHALT_SNOW : ASPHALT;

  for (const edge of ROAD_EDGES) {
    const a = nodeAt(edge.from);
    const b = nodeAt(edge.to);
    if (edge.axis === 'h') {
      ctx.fillRect(Math.min(a.x, b.x), a.y - edge.width / 2, Math.abs(b.x - a.x), edge.width);
    } else {
      ctx.fillRect(a.x - edge.width / 2, Math.min(a.y, b.y), edge.width, Math.abs(b.y - a.y));
    }
  }
}

function drawLaneMarkings(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  for (const edge of ROAD_EDGES) {
    const a = nodeAt(edge.from);
    const b = nodeAt(edge.to);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (!inView(opts.view, midX, midY, Math.hypot(b.x - a.x, b.y - a.y) / 2)) continue;

    const horizontal = edge.axis === 'h';
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);

    // Double-yellow centreline.
    ctx.strokeStyle = '#e9b949';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(x0, a.y - 2.6);
      ctx.lineTo(x1, a.y - 2.6);
      ctx.moveTo(x0, a.y + 2.6);
      ctx.lineTo(x1, a.y + 2.6);
    } else {
      ctx.moveTo(a.x - 2.6, y0);
      ctx.lineTo(a.x - 2.6, y1);
      ctx.moveTo(a.x + 2.6, y0);
      ctx.lineTo(a.x + 2.6, y1);
    }
    ctx.stroke();

    // Dashed lane dividers at ±quarter width.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 18]);
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(x0, a.y - edge.width / 4);
      ctx.lineTo(x1, a.y - edge.width / 4);
      ctx.moveTo(x0, a.y + edge.width / 4);
      ctx.lineTo(x1, a.y + edge.width / 4);
    } else {
      ctx.moveTo(a.x - edge.width / 4, y0);
      ctx.lineTo(a.x - edge.width / 4, y1);
      ctx.moveTo(a.x + edge.width / 4, y0);
      ctx.lineTo(a.x + edge.width / 4, y1);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------------------
// 3. JUNCTIONS
// ---------------------------------------------------------------------------

function drawCrosswalk(
  ctx: CanvasRenderingContext2D,
  jx: number,
  jy: number,
  half: number,
  alongX: boolean,
): void {
  // Bars lie in the direction pedestrians walk.
  const span = half * 2 - 10;
  const bars = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < bars; i++) {
    const offset = -half + 8 + i * ((span - 6) / (bars - 1));
    if (alongX) {
      // Crossing the E-W carriageway: bar runs north-south.
      roundRect(ctx, jx + offset - 3, jy - half + 6, 6, half * 2 - 12, 1.5);
    } else {
      // Crossing the N-S carriageway: bar runs east-west.
      roundRect(ctx, jx - half + 6, jy + offset - 3, half * 2 - 12, 6, 1.5);
    }
    ctx.fill();
  }
}

function drawJunction(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions, jx: number, jy: number): void {
  const size = 88;
  const half = size / 2;

  // Asphalt box.
  ctx.fillStyle = opts.isSnowing ? ASPHALT_SNOW : ASPHALT;
  ctx.fillRect(jx - half, jy - half, size, size);

  // Stop lines just before each crossing.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(jx - half + 6, jy - half - 20);
  ctx.lineTo(jx + half - 6, jy - half - 20);
  ctx.moveTo(jx - half + 6, jy + half + 20);
  ctx.lineTo(jx + half - 6, jy + half + 20);
  ctx.moveTo(jx - half - 20, jy - half + 6);
  ctx.lineTo(jx - half - 20, jy + half - 6);
  ctx.moveTo(jx + half + 20, jy - half + 6);
  ctx.lineTo(jx + half + 20, jy + half - 6);
  ctx.stroke();

  // Zebra crossings: east/west of the box cross the E-W road (bars N-S);
  // north/south of the box cross the N-S road (bars E-W).
  drawCrosswalk(ctx, jx - half - 58, jy, half - 6, true);
  drawCrosswalk(ctx, jx + half + 58, jy, half - 6, true);
  drawCrosswalk(ctx, jx, jy - half - 58, half - 6, false);
  drawCrosswalk(ctx, jx, jy + half + 58, half - 6, false);

  // Signal heads: one per approach, showing the current phase.
  const heads: Array<{ x: number; y: number; axis: 'ns' | 'ew' }> = [
    { x: jx + half + 14, y: jy + half + 14, axis: 'ew' },
    { x: jx - half - 14, y: jy - half - 14, axis: 'ns' },
  ];
  for (const head of heads) {
    const state = opts.traffic.signalFor(head.axis);
    ctx.fillStyle = '#25303b';
    roundRect(ctx, head.x - 6, head.y - 13, 12, 28, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    (['red', 'amber', 'green'] as const).forEach((name, index) => {
      const lit = state === name;
      const colour = name === 'red' ? '#ef4444' : name === 'amber' ? '#f59e0b' : '#22c55e';
      ctx.fillStyle = lit ? colour : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(head.x, head.y - 7 + index * 7, 3.4, 0, Math.PI * 2);
      ctx.fill();
      if (lit && opts.isNight) {
        ctx.fillStyle = `${colour}55`;
        ctx.beginPath();
        ctx.arc(head.x, head.y - 7 + index * 7, 10, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 4. FURNITURE
// ---------------------------------------------------------------------------

function drawLamps(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  const lamp = (x: number, y: number) => {
    if (!inView(opts.view, x, y, 60)) return;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 20);
    ctx.stroke();
    ctx.fillStyle = opts.isNight ? '#fde68a' : '#f1f5f9';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y - 22, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (opts.isNight) {
      ctx.fillStyle = 'rgba(253, 230, 138, 0.15)';
      ctx.beginPath();
      ctx.arc(x, y - 22, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  for (let x = 160; x < 3100; x += 240) {
    lamp(x, 448 + 60);
    lamp(x, 1856 - 60);
  }
  for (let y = 160; y < 2350; y += 240) {
    lamp(1024 + 60, y);
    lamp(2176 - 60, y);
  }
}

function drawDrains(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
  for (let x = 220; x < 3100; x += 200) {
    if (!inView(opts.view, x, 448, 40)) continue;
    ctx.beginPath();
    ctx.ellipse(x, 448 + 42, 5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, 1856 - 42, 5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = 240; y < 2300; y += 200) {
    if (!inView(opts.view, 1024, y, 40)) continue;
    ctx.beginPath();
    ctx.ellipse(1024 + 42, y, 2.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(2176 - 42, y, 2.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBusShelters(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  for (const stop of BUS_STOPS) {
    if (!inView(opts.view, stop.x, stop.y, 100)) continue;
    const vertical = stop.facing === 'e' || stop.facing === 'w';
    const w = vertical ? 22 : 54;
    const h = vertical ? 54 : 22;
    const offset = 62;
    const cx = stop.x + (stop.facing === 'e' ? offset : stop.facing === 'w' ? -offset : 0);
    const cy = stop.y + (stop.facing === 's' ? offset : stop.facing === 'n' ? -offset : 0);
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    roundRect(ctx, x + 2, y + 3, w, h, 5);
    ctx.fill();
    ctx.fillStyle = '#eef4f7';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.8;
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.stroke();

    // Bench along the back edge.
    ctx.fillStyle = '#5b7183';
    if (vertical) ctx.fillRect(x + 4, y + h - 10, w - 8, 4);
    else ctx.fillRect(x + w - 10, y + 4, 4, h - 8);

    // Route flag.
    ctx.fillStyle = '#2E7D6B';
    roundRect(ctx, cx - 10, y - 13, 20, 11, 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stop.route, cx, y - 7.4);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawCollectors(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  const width = 30;
  ctx.fillStyle = opts.isSnowing ? ASPHALT_SNOW : '#525c66';

  for (const road of ROADS.streets.horizontal) {
    ctx.fillRect(road.x1, road.y - width / 2, road.x2 - road.x1, width);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(road.x1, road.y - width / 2, road.x2 - road.x1, width);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([9, 12]);
    ctx.beginPath();
    ctx.moveTo(road.x1, road.y);
    ctx.lineTo(road.x2, road.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const road of ROADS.streets.vertical) {
    ctx.fillRect(road.x - width / 2, road.y1, width, road.y2 - road.y1);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(road.x - width / 2, road.y1, width, road.y2 - road.y1);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([9, 12]);
    ctx.beginPath();
    ctx.moveTo(road.x, road.y1);
    ctx.lineTo(road.x, road.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Pedestrian promenades: a paved strip in front of every block, so buildings
 * meet the street through a walkway instead of a strip of empty lawn.
 */
export function drawPromenades(
  ctx: CanvasRenderingContext2D,
  opts: { isSnowing: boolean; isNight: boolean },
): void {
  for (const strip of FRONTAGES) {
    const { x, y, w, h } = strip;
    ctx.fillStyle = opts.isSnowing ? '#e8eef4' : '#d9d3c6';
    ctx.fillRect(x, y, w, h);

    // Kerb edge on the street side.
    const kerb = 3;
    ctx.fillStyle = opts.isSnowing ? '#cfd8e0' : '#bdb5a6';
    if (strip.side === 'south') ctx.fillRect(x, y + h - kerb, w, kerb);
    else if (strip.side === 'north') ctx.fillRect(x, y, w, kerb);
    else if (strip.side === 'east') ctx.fillRect(x + w - kerb, y, kerb, h);
    else ctx.fillRect(x, y, kerb, h);

    // Paving joints.
    ctx.strokeStyle = 'rgba(38, 50, 63, 0.14)';
    ctx.lineWidth = 1;
    if (strip.side === 'south' || strip.side === 'north') {
      for (let px = x + 12; px < x + w - 4; px += 24) {
        ctx.beginPath();
        ctx.moveTo(px, y + 2);
        ctx.lineTo(px, y + h - 2);
        ctx.stroke();
      }
    } else {
      for (let py = y + 12; py < y + h - 4; py += 24) {
        ctx.beginPath();
        ctx.moveTo(x + 2, py);
        ctx.lineTo(x + w - 2, py);
        ctx.stroke();
      }
    }
  }
}

/** Paint the whole road hierarchy. */
export function drawRoadNetwork(ctx: CanvasRenderingContext2D, opts: RoadRenderOptions): void {
  drawCollectors(ctx, opts);
  drawFootway(ctx, opts);
  drawCarriageways(ctx, opts);
  drawLaneMarkings(ctx, opts);

  for (const node of ROAD_NODES) {
    if (!node.signal) continue;
    if (!inView(opts.view, node.x, node.y, 160)) continue;
    drawJunction(ctx, opts, node.x, node.y);
  }

  drawDrains(ctx, opts);
  drawLamps(ctx, opts);
  drawBusShelters(ctx, opts);
}
