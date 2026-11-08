/**
 * ============================================================================
 *  GRID-BASED CITY LAYOUT â€” frontage packing
 * ============================================================================
 *
 *  Blocks are the planning unit; buildings are packed onto a precise frontage
 *  line instead of floating in the middle of a plot. Rules:
 *
 *    â€¢ every block has ONE street frontage (its `front`), so a row of
 *      buildings reads as a continuous street wall;
 *    â€¢ a 34 px setback holds a 24 px pedestrian promenade + threshold â€” no
 *      empty lawn between a building and the road;
 *    â€¢ neighbours in a row sit 14 px apart (party-wall alley), never with a
 *      random green gap;
 *    â€¢ when a row is full the next row starts behind it with a 40 px service
 *      alley, still parallel to the street.
 *
 *  Doors and patio spots are generated on the street-facing facade, and the
 *  resulting promenades are exported for the renderer and the walk graph.
 */
export const GRID = 64;

export type Cell = { gx: number; gy: number; w: number; h: number };
export type StreetSide = 'north' | 'east' | 'south' | 'west';
export type Zone = 'commercial' | 'government' | 'innovation' | 'residential' | 'service' | 'park';

export const toPx = ({ gx, gy, w, h }: Cell) => ({
  x: gx * GRID,
  y: gy * GRID,
  w: w * GRID,
  h: h * GRID,
});

// The existing avenue network remains in place; coordinates document its
// centerlines and lane hierarchy while lots and buildings use the 64px grid.
export const ROADS = {
  avenues: {
    vertical: [{ x: 16 * GRID, lanes: 2 }, { x: 34 * GRID, lanes: 2 }],
    horizontal: [{ y: 7 * GRID, lanes: 2 }, { y: 29 * GRID, lanes: 2 }],
  },
  streets: {
    // One-lane frontage and block-edge streets, all positioned on grid lines.
    vertical: [
      { x: 15 * GRID, y1: 6 * GRID, y2: 28 * GRID },
      { x: 49.5 * GRID, y1: 6 * GRID, y2: 28 * GRID },
    ],
    horizontal: [
      { y: 6 * GRID, x1: 0, x2: 50 * GRID },
      { y: 26 * GRID, x1: 0, x2: 15 * GRID },
      { y: 27.5 * GRID, x1: 35 * GRID, x2: 50 * GRID },
    ],
  },
} as const;

/** Dimensional standards shared by every block. */
export const LAYOUT_STANDARDS = {
  /** Distance from the block edge to the building face. */
  setback: 34,
  /** Depth of the pedestrian promenade inside the setback. */
  promenade: 24,
  /** Gap between neighbouring buildings in a row (party-wall alley). */
  partyWall: 14,
  /** Gap between rows inside a deep block. */
  rowGap: 60,
  /** Side margin inside a block. */
  margin: 20,
} as const;

/** Party-wall gap: roofs overhang ~40 px on north/south fronts, so east/west
 *  frontages (where neighbours stack vertically on screen) need more room. */
function partyWallFor(front: StreetSide): number {
  return front === 'east' || front === 'west' ? 50 : LAYOUT_STANDARDS.partyWall;
}

export interface BuildingSlot {
  id: string;
}

export interface CityBlock {
  id: string;
  cell: Cell;
  zone: Zone;
  /** The street this block fronts; every building in it faces this way. */
  front: StreetSide;
  slots: BuildingSlot[];
}

/** A pedestrian promenade strip, drawn by the renderer and used by the walk graph. */
export interface Frontage {
  blockId: string;
  side: StreetSide;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Centre line for the walk graph. */
  axisY?: number;
  axisX?: number;
}

// Blocks and the street each one fronts. Order of `slots` is the packing order.
export const BLOCKS: CityBlock[] = [
  { id: 'market-north', cell: { gx: 0, gy: 0, w: 15, h: 6 }, zone: 'commercial', front: 'south', slots: [{ id: 'cafe' }, { id: 'market' }] },
  { id: 'market-south', cell: { gx: 0, gy: 8, w: 15, h: 6 }, zone: 'commercial', front: 'north', slots: [{ id: 'bakery' }, { id: 'cinema' }] },
  { id: 'civic-north', cell: { gx: 17, gy: 0, w: 16, h: 6 }, zone: 'government', front: 'south', slots: [{ id: 'cityhall' }, { id: 'library' }] },
  { id: 'civic-south', cell: { gx: 17, gy: 8, w: 16, h: 4 }, zone: 'government', front: 'north', slots: [{ id: 'site_solar' }] },
  { id: 'innovation-north', cell: { gx: 35, gy: 0, w: 15, h: 6 }, zone: 'innovation', front: 'south', slots: [{ id: 'office' }, { id: 'bank' }] },
  { id: 'innovation-south', cell: { gx: 35, gy: 8, w: 15, h: 6 }, zone: 'innovation', front: 'north', slots: [{ id: 'office_corp' }, { id: 'site_tech' }] },
  { id: 'sunset-inner', cell: { gx: 0, gy: 14, w: 15, h: 14 }, zone: 'residential', front: 'east', slots: [{ id: 'home_sunset' }, { id: 'home_maple' }, { id: 'home_pine' }, { id: 'home_garden' }] },
  { id: 'sunset-south', cell: { gx: 0, gy: 30, w: 15, h: 8 }, zone: 'residential', front: 'north', slots: [{ id: 'site_clinic' }, { id: 'site_condo' }] },
  { id: 'lifeline-inner', cell: { gx: 35, gy: 14, w: 15, h: 14 }, zone: 'service', front: 'west', slots: [{ id: 'wellness' }] },
  { id: 'lifeline-south', cell: { gx: 35, gy: 30, w: 15, h: 8 }, zone: 'service', front: 'north', slots: [{ id: 'hospital' }, { id: 'police' }] },
];

interface Placed {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pack a block's buildings into rows along its frontage, front row first.
 * Returns positions plus the promenade strip the row faces.
 */
function packBlock(
  block: CityBlock,
  sizes: Map<string, { w: number; h: number }>,
): { placed: Placed[]; frontage: Frontage } {
  const { x, y, w, h } = toPx(block.cell);
  const { setback, partyWall, rowGap, margin } = LAYOUT_STANDARDS;
  const gap = partyWallFor(block.front);
  void partyWall;
  const horizontalFront = block.front === 'north' || block.front === 'south';
  const along = horizontalFront ? w : h; // length of the frontage line
  const depth = horizontalFront ? h : w; // how deep the block is

  const usable = along - margin * 2;
  const placed: Placed[] = [];
  let cursor = 0; // distance along the frontage
  let row = 0; // 0 = front row
  let rowDepth = 0; // depth consumed by the current row

  for (const slot of block.slots) {
    const size = sizes.get(slot.id) ?? { w: 380, h: 240 };
    const width = horizontalFront ? size.w : size.h;
    const depthSize = horizontalFront ? size.h : size.w;

    if (cursor + width > usable && cursor > 0) {
      cursor = 0;
      row += 1;
      rowDepth += depthSize + rowGap;
    }

    // Position along the frontage.
    const alongStart = margin + cursor;
    // Position across it: front row hugs the setback, later rows go deeper.
    const acrossStart = setback + rowDepth;

    let px: number;
    let py: number;
    if (block.front === 'south') {
      px = x + alongStart;
      py = y + h - acrossStart - depthSize;
    } else if (block.front === 'north') {
      px = x + alongStart;
      py = y + acrossStart;
    } else if (block.front === 'east') {
      px = x + w - acrossStart - depthSize;
      py = y + alongStart;
    } else {
      px = x + acrossStart;
      py = y + alongStart;
    }

    placed.push({ id: slot.id, x: px, y: py, w: size.w, h: size.h });
    cursor += width + gap;
    rowDepth = Math.max(rowDepth, 0);
    void depth;
  }

  // Promenade strip: the whole setback is paved, so no lawn sliver is left
  // between a building and the street.
  const strip = LAYOUT_STANDARDS.setback;
  let frontage: Frontage;
  if (block.front === 'south') {
    frontage = { blockId: block.id, side: 'south', x, y: y + h - strip, w, h: strip };
  } else if (block.front === 'north') {
    frontage = { blockId: block.id, side: 'north', x, y, w, h: strip };
  } else if (block.front === 'east') {
    frontage = { blockId: block.id, side: 'east', x: x + w - strip, y, w: strip, h };
  } else {
    frontage = { blockId: block.id, side: 'west', x, y, w: strip, h };
  }

  return { placed, frontage };
}

function makeFrontDoor(p: Placed, front: StreetSide) {
  switch (front) {
    case 'north': return { x: p.x + p.w / 2, y: p.y };
    case 'east': return { x: p.x + p.w, y: p.y + p.h / 2 };
    case 'south': return { x: p.x + p.w / 2, y: p.y + p.h };
    case 'west': return { x: p.x, y: p.y + p.h / 2 };
  }
}

function makePatioSpots(p: Placed, front: StreetSide) {
  const fractions = [0.3, 0.5, 0.7];
  const out = 22;
  switch (front) {
    case 'north': return fractions.map(f => ({ x: p.x + p.w * f, y: p.y - out }));
    case 'east': return fractions.map(f => ({ x: p.x + p.w + out, y: p.y + p.h * f }));
    case 'south': return fractions.map(f => ({ x: p.x + p.w * f, y: p.y + p.h + out }));
    case 'west': return fractions.map(f => ({ x: p.x - out, y: p.y + p.h * f }));
  }
}

/** Promenades produced by the last layout pass (used by the renderer + graph). */
export const FRONTAGES: Frontage[] = [];

/**
 * Place every known building on its block frontage. Footprints are preserved;
 * only position, door and patio change â€” and they always face the street.
 */
export function applyCityLayout<T extends {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  door: { x: number; y: number };
  patioSpots: { x: number; y: number }[];
}>(locations: T[]): T[] {
  const byId = new Map(locations.map(location => [location.id, location]));
  const sizes = new Map<string, { w: number; h: number }>();
  for (const location of locations) {
    sizes.set(location.id, { w: location.width, h: location.height });
  }

  FRONTAGES.length = 0;

  for (const block of BLOCKS) {
    const { placed, frontage } = packBlock(block, sizes);
    FRONTAGES.push(frontage);

    for (const p of placed) {
      const location = byId.get(p.id);
      if (!location) continue;
      location.x = p.x;
      location.y = p.y;
      location.door = makeFrontDoor(p, block.front);
      location.patioSpots = makePatioSpots(p, block.front);
    }
  }

  // The park keeps its authored footprint.
  void locations;
  return locations;
}

