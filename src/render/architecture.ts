/**
 * ============================================================================
 *  ARCHITECTURE — the city's building grammar (v2)
 * ============================================================================
 *
 *  One deterministic, data-driven renderer replaces the old mixture of pasted
 *  PNG sprites and 700 lines of hand-drawn if/else. Every venue is composed
 *  from the same architectural order, so the skyline reads as ONE designed
 *  city instead of a sticker album:
 *
 *    1. LOT        graded apron + contact shadow (grounds the mass)
 *    2. PLINTH     stone base course + ground line
 *    3. FACADE     bay × floor module, pilasters, string courses, siding
 *    4. OPENINGS   windows / shopfront signboard, deterministic day-night light
 *    5. ROOF       typology cap (gable, hip, parapet, sawtooth, marquee…)
 *    6. ENTRANCE   portal + steps + canopy projected from the REAL `door`
 *    7. SIGNAGE    name plate + sector chip
 *    8. SERVICE    live need plaque: served / capacity for the need category
 *                  this building addresses (`needImpact.addresses`)
 *    9. STATUS     snow cap, construction scaffold, damage, selection, hover
 *
 *  Conventions: world pixels on the 64 px grid, one ink colour, one outline
 *  weight, one typographic scale. Nothing here mutates simulation state.
 */
import { LocationNode } from '../types/simulation';

const INK = '#2c3e50';
const LINE = 2.5;
const RADIUS = 10;
const BAY_TARGET = 84;   // preferred bay width  → rich, windowed facades
const FLOOR_TARGET = 82; // preferred floor height

/** Deterministic 0..1 hash — the same building always lights the same windows. */
function hash01(seed: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Shift a colour toward white (t>0) or black (t<0). */
function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (t >= 0) return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  const k = 1 + t;
  return rgbToHex(r * k, g * k, b * k);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

// ---------------------------------------------------------------------------
// TYPOLOGY LIBRARY — materials, massing and roof per building use
// ---------------------------------------------------------------------------

export type RoofKind = 'gable' | 'flat' | 'hip' | 'shopfront' | 'sawtooth' | 'marquee' | 'portico';

interface Typology {
  wall: string;
  roof: string;
  trim: string;
  glass: string;
  accent: string;
  roofKind: RoofKind;
  floors: number;
  storefront: boolean;
  pilasters: boolean;
  dentils: boolean;
  texture: 'siding' | 'brick' | 'panel' | 'stone' | 'none';
}

const TYPOLOGIES: Record<string, Typology> = {
  home: {
    wall: '#F2DFC0', roof: '#BF4B33', trim: '#FFF6E6', glass: '#CFE6F2', accent: '#D9654B',
    roofKind: 'gable', floors: 2, storefront: false, pilasters: false, dentils: false, texture: 'siding',
  },
  cafe: {
    wall: '#EFCB9B', roof: '#A8422C', trim: '#FFF1DC', glass: '#DCEFF8', accent: '#C9483F',
    roofKind: 'shopfront', floors: 2, storefront: true, pilasters: false, dentils: false, texture: 'brick',
  },
  bakery: {
    wall: '#F3D7A6', roof: '#BC6C25', trim: '#FFF4E2', glass: '#DCEFF8', accent: '#D9822B',
    roofKind: 'shopfront', floors: 2, storefront: true, pilasters: false, dentils: false, texture: 'brick',
  },
  market: {
    wall: '#E9D6B4', roof: '#5E8352', trim: '#F7EEDC', glass: '#DCEFF8', accent: '#4C9A5A',
    roofKind: 'sawtooth', floors: 1, storefront: true, pilasters: false, dentils: false, texture: 'none',
  },
  cinema: {
    wall: '#DCCEEA', roof: '#4A3466', trim: '#F6F0FB', glass: '#DCEFF8', accent: '#7E57C2',
    roofKind: 'marquee', floors: 2, storefront: true, pilasters: false, dentils: false, texture: 'none',
  },
  office: {
    wall: '#B9CBD6', roof: '#2F4356', trim: '#EAF2F6', glass: '#9FCADF', accent: '#2563EB',
    roofKind: 'flat', floors: 3, storefront: false, pilasters: false, dentils: false, texture: 'panel',
  },
  bank: {
    wall: '#E9DFC7', roof: '#33427A', trim: '#FBF6EA', glass: '#C6E0EE', accent: '#B08A3E',
    roofKind: 'portico', floors: 2, storefront: false, pilasters: true, dentils: true, texture: 'stone',
  },
  cityhall: {
    wall: '#E9E1CE', roof: '#3B4CA8', trim: '#FBF7EC', glass: '#C6E0EE', accent: '#4F46E5',
    roofKind: 'portico', floors: 2, storefront: false, pilasters: true, dentils: true, texture: 'stone',
  },
  library: {
    wall: '#EBDCBF', roof: '#6D4C41', trim: '#FBF5E7', glass: '#C6E0EE', accent: '#0284C7',
    roofKind: 'hip', floors: 2, storefront: false, pilasters: true, dentils: true, texture: 'stone',
  },
  hospital: {
    wall: '#E9F2F3', roof: '#0E7C86', trim: '#FFFFFF', glass: '#C4E6EE', accent: '#06B6D4',
    roofKind: 'flat', floors: 3, storefront: false, pilasters: false, dentils: false, texture: 'panel',
  },
  police: {
    wall: '#CDD8DF', roof: '#26364A', trim: '#EFF4F7', glass: '#B4D2E2', accent: '#1D4ED8',
    roofKind: 'flat', floors: 2, storefront: false, pilasters: false, dentils: false, texture: 'stone',
  },
  wellness: {
    wall: '#DCEBE0', roof: '#3E7C59', trim: '#F4FAF6', glass: '#CBE8DD', accent: '#14B8A6',
    roofKind: 'hip', floors: 2, storefront: false, pilasters: false, dentils: false, texture: 'none',
  },
};

const DEFAULT_TYPOLOGY = TYPOLOGIES.office;

const NEED_META: Record<string, { icon: string; color: string; label: string; short: string }> = {
  housing: { icon: '🏠', color: '#EC4899', label: 'Housing', short: 'homes' },
  healthcare: { icon: '🩺', color: '#06B6D4', label: 'Healthcare', short: 'beds' },
  food: { icon: '🍎', color: '#16A34A', label: 'Food', short: 'servings' },
  energy: { icon: '⚡', color: '#F59E0B', label: 'Energy', short: 'supply' },
  commerce: { icon: '💼', color: '#2563EB', label: 'Commerce', short: 'counters' },
};

export interface BuildingRenderOptions {
  isNight: boolean;
  isSnowing: boolean;
  /** Scene clock used for chimney smoke (pauses with the simulation). */
  smokeTimer: number;
  /** Citizens whose `homeNodeId` is this building. */
  homeOccupancy: Record<string, number>;
  /** Citizens currently inside (service load). */
  visitors: Record<string, number>;
  /** Camera zoom, so hover cards keep a constant screen size. */
  zoom?: number;
  selectedLocationId?: string | null;
  hoveredLocationId?: string | null;
}

interface Massing {
  bays: number;
  bayW: number;
  /** Number of window rows above the (optional) shop band. */
  rows: number;
  floorH: number;
  regionTop: number;
  regionBottom: number;
  /** Reserved ground-floor height for shopfront buildings. */
  shopBand: number;
}

/**
 * `loc` here is the visible WALL rectangle (the south elevation), not the whole
 * footprint — see `wallRect()`. The roof is drawn separately from above.
 */
function computeMassing(loc: LocationNode, style: Typology): Massing {
  const bays = clamp(Math.round(loc.width / BAY_TARGET), 2, 6);
  const bayW = (loc.width - 24) / bays;
  const shopBand = style.storefront ? 122 : 0;
  // A market has only its stall band; other shops get one window row above it.
  const rows = style.storefront ? (loc.type === 'market' ? 0 : 1) : style.floors;
  const regionTop = loc.y + 14;
  const regionBottom = loc.y + loc.height - (style.storefront ? 0 : 20) - shopBand;
  const floorH = Math.max(30, (regionBottom - regionTop) / Math.max(1, rows));
  return { bays, bayW, rows, floorH, regionTop, regionBottom, shopBand };
}

// ---------------------------------------------------------------------------
// 3D MASSING — roof seen from above + the south wall seen by the camera
// ---------------------------------------------------------------------------

type Side = 'north' | 'east' | 'south' | 'west';

/** Which edge of the footprint the REAL door (used by pathfinding) sits on. */
function frontSide(loc: LocationNode): Side {
  const dN = Math.abs(loc.door.y - loc.y);
  const dS = Math.abs(loc.door.y - (loc.y + loc.height));
  const dW = Math.abs(loc.door.x - loc.x);
  const dE = Math.abs(loc.door.x - (loc.x + loc.width));
  const m = Math.min(dN, dS, dW, dE);
  if (m === dS) return 'south';
  if (m === dN) return 'north';
  if (m === dE) return 'east';
  return 'west';
}

/** Height of the visible wall: floors × storey, shop bands included. */
function wallHeightFor(loc: LocationNode, style: Typology, shop: boolean): number {
  const raw = shop
    ? (loc.type === 'market' ? 152 : 188)
    : style.floors >= 3 ? 160 : style.floors === 2 ? 124 : 100;
  return Math.min(raw, loc.height - 48); // always leave a readable roof
}

/** The wall as a rectangle glued to the bottom of the footprint. */
function wallRect(loc: LocationNode, wallH: number): LocationNode {
  return { ...loc, y: loc.y + loc.height - wallH, height: wallH };
}

// ---------------------------------------------------------------------------
// 1–2. LOT, SHADOW, SHELL
// ---------------------------------------------------------------------------

function drawLot(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  ctx.fillStyle = 'rgba(120, 140, 110, 0.16)';
  roundRect(ctx, loc.x - 9, loc.y - 4, loc.width + 18, loc.height + 16, 14);
  ctx.fill();
}

function drawContactShadow(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  ctx.fillStyle = 'rgba(15, 23, 42, 0.09)';
  roundRect(ctx, loc.x + 8, loc.y + 12, loc.width, loc.height + 4, 16);
  ctx.fill();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.13)';
  roundRect(ctx, loc.x + 3, loc.y + 7, loc.width, loc.height, 14);
  ctx.fill();
}

function drawGroundShadow(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  const { x, y, width: w, height: h } = loc;
  const grad = ctx.createLinearGradient(x, y + h, x, y + h + 14);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x + 10, y + h, w - 20, 14);
}

function drawSideReveal(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  ctx.fillStyle = 'rgba(44, 62, 80, 0.07)';
  ctx.fillRect(loc.x + 2, loc.y + 18, 7, loc.height - 34);
}

function drawShell(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w, height: h } = loc;
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, shade(style.wall, 0.10));
  body.addColorStop(0.55, style.wall);
  body.addColorStop(1, shade(style.wall, -0.12));

  ctx.fillStyle = body;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  roundRect(ctx, x, y, w, h, RADIUS);
  ctx.fill();
  ctx.stroke();
}

function drawTexture(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  if (style.texture === 'none') return;
  const { x, y, width: w, height: h } = loc;

  ctx.save();
  roundRect(ctx, x, y, w, h, RADIUS);
  ctx.clip();

  if (style.texture === 'siding') {
    ctx.strokeStyle = 'rgba(122, 96, 64, 0.13)';
    ctx.lineWidth = 1.2;
    for (let ly = y + 10; ly < y + h - 16; ly += 9) {
      ctx.beginPath();
      ctx.moveTo(x + 2, ly);
      ctx.lineTo(x + w - 2, ly);
      ctx.stroke();
    }
  } else if (style.texture === 'brick') {
    ctx.strokeStyle = 'rgba(120, 70, 40, 0.12)';
    ctx.lineWidth = 1;
    let row = 0;
    for (let ly = y + 12; ly < y + h - 16; ly += 10, row++) {
      ctx.beginPath();
      ctx.moveTo(x + 2, ly);
      ctx.lineTo(x + w - 2, ly);
      ctx.stroke();
      const offset = row % 2 === 0 ? 0 : 11;
      for (let bx = x + 14 + offset; bx < x + w - 6; bx += 22) {
        ctx.beginPath();
        ctx.moveTo(bx, ly);
        ctx.lineTo(bx, ly + 10);
        ctx.stroke();
      }
    }
  } else if (style.texture === 'panel') {
    ctx.strokeStyle = 'rgba(44, 62, 80, 0.10)';
    ctx.lineWidth = 1.2;
    for (let px = x + 30; px < x + w - 10; px += 30) {
      ctx.beginPath();
      ctx.moveTo(px, y + 8);
      ctx.lineTo(px, y + h - 14);
      ctx.stroke();
    }
    for (let py = y + 30; py < y + h - 14; py += 26) {
      ctx.beginPath();
      ctx.moveTo(x + 6, py);
      ctx.lineTo(x + w - 6, py);
      ctx.stroke();
    }
  } else if (style.texture === 'stone') {
    ctx.strokeStyle = 'rgba(120, 110, 90, 0.14)';
    ctx.lineWidth = 1;
    for (let py = y + 26; py < y + h - 16; py += 26) {
      ctx.beginPath();
      ctx.moveTo(x + 4, py);
      ctx.lineTo(x + w - 4, py);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawPlinth(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w, height: h } = loc;
  const plinthH = 16;

  ctx.save();
  roundRect(ctx, x, y + h - plinthH, w, plinthH, RADIUS);
  ctx.clip();
  ctx.fillStyle = shade(style.wall, -0.26);
  ctx.fillRect(x, y + h - plinthH, w, plinthH);
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + h - plinthH);
  ctx.lineTo(x + w - 1, y + h - plinthH);
  ctx.stroke();

  // Ground line: the building meets the street here.
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h);
  ctx.lineTo(x + w - 4, y + h);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(44, 62, 80, 0.30)';
  ctx.lineWidth = 1;
  for (let jx = x + 46; jx < x + w - 12; jx += 46) {
    ctx.beginPath();
    ctx.moveTo(jx, y + h - plinthH + 3);
    ctx.lineTo(jx, y + h - 3);
    ctx.stroke();
  }
}

function drawPilasters(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology, bays: number): void {
  if (!style.pilasters) return;
  const { x, y, width: w, height: h } = loc;
  const inner = w - 20;
  const bayW = inner / bays;
  for (let b = 1; b < bays; b++) {
    const px = x + 10 + bayW * b - 5;
    ctx.fillStyle = shade(style.wall, 0.12);
    ctx.fillRect(px, y + 20, 10, h - 38);
    ctx.strokeStyle = 'rgba(44, 62, 80, 0.30)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(px, y + 20, 10, h - 38);
    // capital + base of each pilaster
    ctx.fillStyle = shade(style.wall, 0.20);
    ctx.fillRect(px - 2, y + 18, 14, 5);
    ctx.fillRect(px - 2, y + h - 22, 14, 5);
  }
}

// ---------------------------------------------------------------------------
// 4. OPENINGS
// ---------------------------------------------------------------------------

function drawWindow(
  ctx: CanvasRenderingContext2D,
  wx: number,
  wy: number,
  ww: number,
  wh: number,
  lit: boolean,
  style: Typology,
  isNight: boolean,
  arched: boolean,
): void {
  const glass = isNight ? (lit ? '#FFD86E' : '#2C3E55') : (lit ? '#D6EBF7' : style.glass);

  // Reveal: a darker jamb makes the opening read as a hole in the wall.
  ctx.fillStyle = 'rgba(44, 62, 80, 0.16)';
  ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 5);

  ctx.fillStyle = glass;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;

  ctx.beginPath();
  if (arched) {
    ctx.moveTo(wx, wy + wh);
    ctx.lineTo(wx, wy + wh * 0.45);
    ctx.quadraticCurveTo(wx + ww / 2, wy - wh * 0.22, wx + ww, wy + wh * 0.45);
    ctx.lineTo(wx + ww, wy + wh);
    ctx.closePath();
  } else {
    ctx.roundRect(wx, wy, ww, wh, Math.min(3, ww / 8));
  }
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = isNight && lit ? 'rgba(120, 72, 20, 0.50)' : 'rgba(44, 62, 80, 0.42)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy + (arched ? wh * 0.26 : 3));
  ctx.lineTo(wx + ww / 2, wy + wh - 3);
  ctx.moveTo(wx + 3, wy + wh * 0.56);
  ctx.lineTo(wx + ww - 3, wy + wh * 0.56);
  ctx.stroke();

  if (!isNight) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(wx + ww * 0.24, wy + wh * 0.34);
    ctx.lineTo(wx + ww * 0.4, wy + wh * 0.2);
    ctx.stroke();
  }

  // Stone sill.
  ctx.fillStyle = shade(style.wall, -0.18);
  ctx.fillRect(wx - 3, wy + wh, ww + 6, 3);
}

function drawOpenings(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  massing: Massing,
  isNight: boolean,
  doorOnWall: boolean,
): void {
  const { x, width: w } = loc;
  const { bays, bayW, rows, floorH, regionTop, regionBottom } = massing;
  const winW = Math.min(58, bayW * 0.62);
  const winH = Math.min(54, floorH * 0.64);
  const arched = loc.type === 'library' || loc.type === 'cityhall' || loc.type === 'bank';
  const emblemTypes = ['hospital', 'police', 'library', 'bank', 'cityhall', 'wellness'];
  const hasEmblem = emblemTypes.includes(loc.type);
  const centerBay = Math.floor(bays / 2);
  const doorX = clamp(loc.door.x, loc.x + 40, loc.x + loc.width - 40);

  for (let f = 0; f < rows; f++) {
    for (let b = 0; b < bays; b++) {
      // The entrance keeps its own clear bay on the ground floor…
      // (only when the door really is on this wall — otherwise the wall is a flank)
      if (doorOnWall && f === rows - 1 && Math.abs(x + 12 + bayW * b + bayW / 2 - doorX) < winW * 0.9 + 16) continue;
      // …and the civic emblem gets a medallion bay on the top floor.
      if (hasEmblem && f === 0 && b === centerBay) continue;

      const cx = x + 12 + bayW * b + bayW / 2;
      const cy = regionTop + floorH * f + floorH / 2;
      const lit = hash01(loc.id, f * 31 + b * 7) > 0.4;
      drawWindow(
        ctx,
        cx - winW / 2,
        cy - winH / 2,
        winW,
        winH,
        lit,
        style,
        isNight,
        arched,
      );

      // Residential shutter wings + window box read as "home", not "office".
      if (loc.type === 'home') {
        ctx.fillStyle = '#7C8B78';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.fillRect(cx - winW / 2 - 10, cy - winH / 2, 8, winH);
        ctx.strokeRect(cx - winW / 2 - 10, cy - winH / 2, 8, winH);
        ctx.fillRect(cx + winW / 2 + 2, cy - winH / 2, 8, winH);
        ctx.strokeRect(cx + winW / 2 + 2, cy - winH / 2, 8, winH);

        ctx.strokeStyle = 'rgba(44, 62, 80, 0.35)';
        ctx.lineWidth = 1;
        for (let sy = cy - winH / 2 + 5; sy < cy + winH / 2 - 3; sy += 6) {
          ctx.beginPath();
          ctx.moveTo(cx - winW / 2 - 9, sy);
          ctx.lineTo(cx - winW / 2 - 3, sy);
          ctx.moveTo(cx + winW / 2 + 3, sy);
          ctx.lineTo(cx + winW / 2 + 9, sy);
          ctx.stroke();
        }

        ctx.fillStyle = '#8D6E63';
        ctx.fillRect(cx - winW / 2 - 2, cy + winH / 2 + 2, winW + 4, 5);
      }
    }
  }

  // String courses between floors.
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.20)';
  ctx.lineWidth = 1.4;
  for (let f = 1; f < rows; f++) {
    const ly = regionTop + floorH * f - 3;
    ctx.beginPath();
    ctx.moveTo(x + 8, ly);
    ctx.lineTo(x + w - 8, ly);
    ctx.stroke();
  }
  void regionBottom;
}

function drawShopfront(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  isNight: boolean,
  doorCenterX: number,
): void {
  const { x, y, width: w, height: h } = loc;
  const left = x + 12;
  const right = x + w - 12;
  const boardH = 20;
  const boardY = y + h - 122;
  const awningY = boardY + boardH + 3;
  const awningH = 12;
  const glassTop = awningY + awningH + 12;
  const glassH = 44;
  const kickY = glassTop + glassH;

  // --- FASCIA SIGNBOARD -----------------------------------------------------
  ctx.fillStyle = style.accent;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, left, boardY, right - left, boardH, 4);
  ctx.fill();
  ctx.stroke();

  // Raised lettering panel inside the fascia.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  roundRect(ctx, left + 5, boardY + 4, right - left - 10, boardH - 8, 3);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const signText = loc.name.toUpperCase();
  const maxTextW = right - left - 24;
  let fontSize = 11;
  let textW = ctx.measureText(signText).width;
  while (textW > maxTextW && fontSize > 8) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
    textW = ctx.measureText(signText).width;
  }
  ctx.fillText(signText, (left + right) / 2, boardY + boardH / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';

  // --- PROJECTING AWNING ----------------------------------------------------
  ctx.fillStyle = style.roof;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, left - 3, awningY, right - left + 6, awningH, 3);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  roundRect(ctx, left - 3, awningY, right - left + 6, awningH, 3);
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  for (let sx = left - 3; sx < right + 3; sx += 20) {
    ctx.fillRect(sx, awningY, 9, awningH);
  }
  ctx.restore();

  // Scalloped valance.
  const scallopW = 18;
  const count = Math.max(3, Math.floor((right - left) / scallopW));
  const stepW = (right - left) / count;
  for (let i = 0; i < count; i++) {
    const sx = left + i * stepW;
    ctx.fillStyle = i % 2 === 0 ? '#FFFFFF' : style.roof;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sx, awningY + awningH);
    ctx.lineTo(sx + stepW, awningY + awningH);
    ctx.quadraticCurveTo(sx + stepW / 2, awningY + awningH + 10, sx, awningY + awningH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // --- GLAZED BAND ----------------------------------------------------------
  // One continuous shop window across the whole frontage: the entrance is a
  // portal cut INTO it, so the composition stays balanced no matter which side
  // the building's real door sits on.
  const bayW = right - left;
  ctx.fillStyle = isNight ? '#F7C86A' : style.glass;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(left, glassTop, bayW, glassH, 3);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(left, glassTop, bayW, glassH, 3);
  ctx.clip();

  // Counter + interior goods silhouette.
  ctx.fillStyle = 'rgba(44, 62, 80, 0.16)';
  ctx.fillRect(left, glassTop + glassH - 14, bayW, 14);
  ctx.fillStyle = isNight ? 'rgba(70, 45, 12, 0.35)' : 'rgba(44, 62, 80, 0.10)';
  ctx.fillRect(left + 10, glassTop + glassH - 26, bayW - 20, 11);

  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = isNight ? '#3B2A12' : 'rgba(44, 62, 80, 0.22)';
    ctx.beginPath();
    ctx.arc(left + 40 + i * ((bayW - 80) / 2), glassTop + glassH - 34, 4.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Mullions every ~78 px keep the glazing human-scaled.
  const mullions = Math.max(2, Math.round(bayW / 78));
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.38)';
  ctx.lineWidth = 1.4;
  for (let m = 1; m < mullions; m++) {
    const mx = left + (bayW * m) / mullions;
    ctx.beginPath();
    ctx.moveTo(mx, glassTop + 2);
    ctx.lineTo(mx, glassTop + glassH - 2);
    ctx.stroke();
  }

  if (!isNight) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + bayW * 0.12, glassTop + glassH * 0.72);
    ctx.lineTo(left + bayW * 0.26, glassTop + glassH * 0.2);
    ctx.stroke();
  }

  // Stall kickplate: ties the glazing down to the plinth so the shopfront
  // doesn't float inside the wall.
  ctx.fillStyle = shade(style.wall, -0.30);
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.fillRect(left - 2, kickY, right - left + 4, Math.max(4, y + h - 16 - kickY));
  ctx.beginPath();
  ctx.moveTo(left - 2, kickY);
  ctx.lineTo(right + 2, kickY);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// 6. ENTRANCE
// ---------------------------------------------------------------------------

function drawEntrance(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  isNight: boolean,
  shopfront = false,
): number {
  const { x, y, width: w, height: h } = loc;
  const doorCenterX = clamp(loc.door.x, x + 40, x + w - 40);
  const doorW = loc.type === 'market' ? 46 : 44;
  const doorH = shopfront ? 50 : 56;
  const doorX = doorCenterX - doorW / 2;
  const doorY = y + h - (shopfront ? 16 : 20) - doorH;

  // Recess behind the leaf so the doorway reads as an opening, not a sticker.
  ctx.fillStyle = 'rgba(15, 23, 42, 0.30)';
  roundRect(ctx, doorX - 4, doorY - 5, doorW + 8, doorH + 6, 4);
  ctx.fill();

  if (!shopfront) {
    // Two thin steps for civic / residential thresholds.
    ctx.fillStyle = shade(style.wall, -0.24);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    roundRect(ctx, doorX - 12, y + h - 15, doorW + 24, 7, 2);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, doorX - 5, y + h - 22, doorW + 10, 7, 2);
    ctx.fill();
    ctx.stroke();
  }

  // Door leaf with a lower panel and a brass handle.
  ctx.fillStyle = '#6B4A32';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(doorX, doorY, doorW, doorH, 5);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 240, 214, 0.30)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(doorX + 9, doorY + 9);
  ctx.lineTo(doorX + 9, doorY + doorH - 9);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.strokeRect(doorX + 7, doorY + doorH * 0.55, doorW - 14, doorH * 0.36);

  ctx.fillStyle = '#F4C430';
  ctx.beginPath();
  ctx.arc(doorX + doorW - 10, doorY + doorH * 0.5, 2.8, 0, Math.PI * 2);
  ctx.fill();

  if (shopfront) {
    // Flush shop doorway: slim frame + two planters, no projecting canopy
    // (the awning already shades the shopfront).
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    roundRect(ctx, doorX - 3, doorY - 4, doorW + 6, doorH + 4, 3);
    ctx.stroke();

    [-1, 1].forEach(dir => {
      const px = doorCenterX + dir * (doorW / 2 + 16);
      ctx.fillStyle = '#B5651D';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px - 8, doorY + doorH - 6);
      ctx.lineTo(px - 6, doorY + doorH - 20);
      ctx.lineTo(px + 6, doorY + doorH - 20);
      ctx.lineTo(px + 8, doorY + doorH - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#4C9A5A';
      ctx.beginPath();
      ctx.arc(px, doorY + doorH - 26, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
  } else {
    // Canopy slab + brackets.
    const canopyW = doorW + 34;
    const canopyY = doorY - 22;
    ctx.fillStyle = style.roof;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    roundRect(ctx, doorCenterX - canopyW / 2, canopyY, canopyW, 9, 3);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1.8;
    [-1, 1].forEach(dir => {
      const bx = doorCenterX + dir * (doorW / 2 + 5);
      ctx.beginPath();
      ctx.moveTo(bx, canopyY + 9);
      ctx.lineTo(bx + dir * 6, canopyY + 20);
      ctx.stroke();
    });

    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.fillRect(doorCenterX - canopyW / 2 + 4, canopyY + 9, canopyW - 8, 4);
  }

  if (isNight) {
    const glow = ctx.createRadialGradient(doorCenterX, y + h - 2, 5, doorCenterX, y + h - 2, 68);
    glow.addColorStop(0, 'rgba(255, 214, 122, 0.40)');
    glow.addColorStop(1, 'rgba(255, 214, 122, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(doorCenterX, y + h + 2, 68, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return doorCenterX;
}

// ---------------------------------------------------------------------------
// 5. ROOFS
// ---------------------------------------------------------------------------

function drawPortico(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  doorCenterX: number,
): void {
  const { y, width: w, height: h } = loc;
  const porchW = Math.min(w * 0.44, 180);
  const porchX = doorCenterX - porchW / 2;
  const porchY = y + h - 122;

  // Steps.
  ctx.fillStyle = shade(style.trim, -0.16);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  for (let s = 2; s >= 0; s--) {
    ctx.beginPath();
    ctx.roundRect(porchX - s * 7, y + h - 24 + s * 6, porchW + s * 14, 9, 2);
    ctx.fill();
    ctx.stroke();
  }

  // Columns.
  const columns = 4;
  const colW = 11;
  for (let c = 0; c < columns; c++) {
    const cx = porchX + 14 + c * ((porchW - 28 - colW) / (columns - 1));
    ctx.fillStyle = shade(style.trim, 0.06);
    ctx.fillRect(cx, porchY + 16, colW, 82);
    ctx.strokeRect(cx, porchY + 16, colW, 82);
    ctx.fillStyle = shade(style.trim, 0.24);
    ctx.fillRect(cx - 2, porchY + 12, colW + 4, 5);
    ctx.fillRect(cx - 2, porchY + 94, colW + 4, 5);
  }

  // Entablature + pediment.
  ctx.fillStyle = style.trim;
  ctx.beginPath();
  ctx.roundRect(porchX, porchY, porchW, 16, 3);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(porchX - 7, porchY);
  ctx.lineTo(porchX + porchW / 2, porchY - 26);
  ctx.lineTo(porchX + porchW + 7, porchY);
  ctx.closePath();
  ctx.fillStyle = shade(style.wall, 0.18);
  ctx.fill();
  ctx.stroke();

  // Tympanum detail.
  ctx.strokeStyle = 'rgba(44,62,80,0.35)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(porchX + 14, porchY - 3);
  ctx.lineTo(porchX + porchW / 2, porchY - 17);
  ctx.lineTo(porchX + porchW - 14, porchY - 3);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// SIGNATURES (per-use emblems)
// ---------------------------------------------------------------------------

function drawSignature(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  isNight: boolean,
  massing: Massing,
): void {
  const { x, y, width: w } = loc;
  // Centre of the medallion bay that drawOpenings leaves free (even bay counts
  // would otherwise put the emblem on the mullion between two windows).
  const cx = x + 12 + massing.bayW * Math.floor(massing.bays / 2) + massing.bayW / 2;
  const cy = massing.regionTop + massing.floorH * 0.5;

  // Emblems were authored for a taller facade; keep them inside one storey.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.8, 0.8);
  ctx.translate(-cx, -cy);

  if (loc.type === 'hospital') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    roundRect(ctx, cx - 19, cy - 19, 38, 38, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#E53935';
    ctx.fillRect(cx - 5, cy - 13, 10, 26);
    ctx.fillRect(cx - 13, cy - 5, 26, 10);
  }

  if (loc.type === 'police') {
    if (isNight) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.006);
      ctx.fillStyle = `rgba(59, 130, 246, ${0.22 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(cx, cy, 26 + pulse * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = isNight ? '#1D4ED8' : '#3B82F6';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
  }

  if (loc.type === 'library') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    roundRect(ctx, cx - 20, cy - 16, 40, 32, 3);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx, cy + 12);
    ctx.moveTo(cx - 12, cy - 8);
    ctx.lineTo(cx - 12, cy + 10);
    ctx.moveTo(cx + 12, cy - 8);
    ctx.lineTo(cx + 12, cy + 10);
    ctx.stroke();
  }

  if (loc.type === 'bank') {
    ctx.fillStyle = '#E8DCC0';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    roundRect(ctx, cx - 21, cy - 17, 42, 34, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
  }

  if (loc.type === 'cityhall') {
    ctx.fillStyle = '#FFF8E1';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy - 10);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + 7, cy + 4);
    ctx.stroke();
  }

  if (loc.type === 'wellness') {
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const wy = cy - 10 + i * 9;
      ctx.beginPath();
      ctx.moveTo(cx - 22, wy);
      ctx.quadraticCurveTo(cx - 11, wy - 6, cx, wy);
      ctx.quadraticCurveTo(cx + 11, wy + 6, cx + 22, wy);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/** City-hall flagpole, planted on the roof (the roof is inside the footprint). */
function drawFlag(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  const px = loc.x + loc.width - 40;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(px, loc.y + 34);
  ctx.lineTo(px, loc.y - 14);
  ctx.stroke();
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.moveTo(px, loc.y - 14);
  ctx.lineTo(px + 26, loc.y - 7);
  ctx.lineTo(px, loc.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// 7. SIGNAGE
// ---------------------------------------------------------------------------

function drawNameBadge(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  topY: number,
): void {
  const label = `${loc.signEmoji} ${loc.name}`;
  ctx.font = 'bold 12px system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
  const badgeW = Math.min(loc.width + 56, textW + 32);
  const badgeH = 24;
  const bx = loc.x + (loc.width - badgeW) / 2;
  const by = topY - badgeH - 8;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
  roundRect(ctx, bx + 2, by + 3, badgeW, badgeH, 12);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  roundRect(ctx, bx, by, badgeW, badgeH, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = loc.ownership === 'public' ? '#4F46E5' : '#F59E0B';
  ctx.beginPath();
  ctx.arc(bx + 12, by + badgeH / 2, 3.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText(label, bx + badgeW / 2 + 5, by + badgeH / 2 + 0.5);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = style.accent;
  roundRect(ctx, bx + 4, by + badgeH - 2.5, badgeW - 8, 2.5, 1);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// 8. NEED SERVICE PLAQUE — the functional link to citizen needs
// ---------------------------------------------------------------------------

interface ServiceReading {
  need: string | null;
  load: number;
  capacity: number;
  served: number;
  unit: 'residents' | 'visitors' | 'progress';
  label: string;
  detail: string;
}

function readService(loc: LocationNode, opts: BuildingRenderOptions): ServiceReading {
  if (loc.type === 'construction_site') {
    const progress = Math.round(loc.buildProgress ?? 0);
    const need = loc.needImpact?.addresses[0] ?? null;
    return {
      need,
      load: clamp(progress / 100, 0, 1),
      capacity: 100,
      served: progress,
      unit: 'progress',
      label: loc.status === 'damaged' ? 'Repairing' : 'Under construction',
      detail: `${progress}% complete · ${loc.fundingSource === 'treasury' ? 'public funds' : 'private capital'}`,
    };
  }

  if (loc.type === 'home') {
    const residents = opts.homeOccupancy[loc.id] ?? 0;
    return {
      need: 'housing',
      load: residents / 10,
      capacity: 10,
      served: residents,
      unit: 'residents',
      label: 'Housing',
      detail: `${residents}/10 residents`,
    };
  }

  const need = loc.needImpact?.addresses[0] ?? null;
  const capacity = Math.max(4, Math.min(30, loc.needImpact?.capacity ?? 20));
  const served = opts.visitors[loc.id] ?? 0;
  const meta = need ? NEED_META[need] : null;
  return {
    need,
    load: served / capacity,
    capacity,
    served,
    unit: 'visitors',
    label: meta?.label ?? 'Service',
    detail: `${served}/${capacity} ${meta?.short ?? 'places'}`,
  };
}

function needColor(reading: ServiceReading, loc: LocationNode): string {
  if (reading.unit === 'progress') return loc.status === 'damaged' ? '#EF4444' : '#F59E0B';
  if (reading.load >= 0.98) return '#EF4444';
  if (reading.load > 0.66) return '#F59E0B';
  const meta = reading.need ? NEED_META[reading.need] : null;
  return meta?.color ?? '#10B981';
}

/**
 * Venue identification is a slim FASCIA BAND on the building, not a floating
 * card. In a dense terraced street external plates always collide, so the name
 * and the live need meter live inside the facade where they cannot overlap a
 * neighbour.
 */
function drawVenuePlate(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  reading: ServiceReading,
  hovered = false,
): void {
  const meta = reading.need ? NEED_META[reading.need] : null;
  const bandW = Math.min(loc.width - 20, 220);
  const bandH = 18;
  const bx = loc.x + (loc.width - bandW) / 2;
  const by = loc.y + 15;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  roundRect(ctx, bx, by, bandW, bandH, 3);
  ctx.fill();
  ctx.stroke();

  // Identity strip.
  ctx.fillStyle = style.accent;
  roundRect(ctx, bx, by, 3.5, bandH, 1.5);
  ctx.fill();

  ctx.font = 'bold 10px system-ui, sans-serif';
  let name = loc.name;
  const maxNameW = bandW - 52;
  while (ctx.measureText(name).width > maxNameW && name.length > 4) {
    name = name.slice(0, -2);
  }
  if (name !== loc.name) name = `${name.trimEnd()}…`;

  ctx.fillStyle = loc.ownership === 'public' ? '#4F46E5' : '#F59E0B';
  ctx.beginPath();
  ctx.arc(bx + 9, by + 8.5, 2.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, bx + 15, by + 8.5);

  // Live need meter along the bottom edge of the band.
  const barX = bx + 4;
  const barY = by + bandH - 5;
  const barW = bandW - 8;
  ctx.fillStyle = 'rgba(44, 62, 80, 0.14)';
  roundRect(ctx, barX, barY, barW, 3, 1.5);
  ctx.fill();
  ctx.fillStyle = needColor(reading, loc);
  roundRect(ctx, barX, barY, Math.max(3, barW * clamp(reading.load, 0, 1)), 3, 1.5);
  ctx.fill();

  if (meta) {
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(meta.icon, bx + bandW - 7, by + 8.5);
  }
  ctx.textBaseline = 'alphabetic';

  if (hovered) {
    // Single floating detail chip, only for the hovered building.
    const chipW = 190;
    const chipH = 34;
    const cx = clamp(loc.x + loc.width / 2 - chipW / 2, loc.x - 10, loc.x + loc.width - chipW + 10);
    const cy = loc.y - chipH - 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    roundRect(ctx, cx, cy, chipW, chipH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${meta?.label ?? 'Service'} · ${reading.detail}`, cx + 9, cy + 12);
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(`load ${Math.round(reading.load * 100)}% · ${loc.customersToday ?? 0} visits`, cx + 9, cy + 24);
    ctx.textBaseline = 'alphabetic';
  }
}

/** Hover card: name, need served, live load, sector and today's traffic. */
function drawHoverCard(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  reading: ServiceReading,
  style: Typology,
  zoom: number,
): void {
  const scale = 1 / Math.max(0.35, zoom); // constant screen size at any zoom
  const cardW = 250 * scale;
  const cardH = 96 * scale;
  const cx = loc.x + loc.width / 2;
  const cy = loc.y - 46 * scale;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  roundRect(ctx, -cardW / 2, -cardH, cardW, cardH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = style.accent;
  roundRect(ctx, -cardW / 2, -cardH, 5, cardH, 2.5);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`${loc.signEmoji} ${loc.name}`, -cardW / 2 + 16, -cardH + 20);

  ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
  ctx.font = '12px system-ui, sans-serif';
  const sector = loc.ownership === 'public' ? 'Municipal (public)' : 'Free market (private)';
  ctx.fillText(`${reading.label} · ${reading.detail}`, -cardW / 2 + 16, -cardH + 42);
  ctx.fillText(sector, -cardW / 2 + 16, -cardH + 60);

  ctx.fillStyle = needColor(reading, loc);
  ctx.fillText(`Load ${Math.round(reading.load * 100)}%  ·  ${loc.customersToday ?? 0} visits today`, -cardW / 2 + 16, -cardH + 78);

  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------------------
// 9. STATUS
// ---------------------------------------------------------------------------

function drawSnowCap(ctx: CanvasRenderingContext2D, roof: RoofRect): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.35)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, roof.x + 3, roof.y + 3, roof.w - 6, roof.h - 10, 6);
  ctx.fill();
  ctx.stroke();
}

function drawSelection(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  ctx.save();
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 7]);
  ctx.lineDashOffset = -(Date.now() * 0.02) % 17;
  roundRect(ctx, loc.x - 11, loc.y - 13, loc.width + 22, loc.height + 26, 14);
  ctx.stroke();
  ctx.restore();
}

function drawConstruction(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  const { x, y, width: w, height: h } = loc;
  const progress = clamp(loc.buildProgress ?? 0, 0, 100);
  const damaged = loc.status === 'damaged';

  ctx.fillStyle = damaged ? 'rgba(120, 72, 60, 0.24)' : 'rgba(160, 132, 92, 0.26)';
  roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 12);
  ctx.fill();

  // Compacted earth + survey grid.
  ctx.strokeStyle = 'rgba(120, 96, 60, 0.25)';
  ctx.lineWidth = 1;
  for (let gx = x + 12; gx < x + w - 8; gx += 32) {
    ctx.beginPath();
    ctx.moveTo(gx, y + 6);
    ctx.lineTo(gx, y + h - 6);
    ctx.stroke();
  }

  ctx.fillStyle = '#C9B79A';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, x + 8, y + h - 32, w - 16, 28, 4);
  ctx.fill();
  ctx.stroke();

  const builtH = (h - 52) * (progress / 100);
  if (builtH > 2) {
    ctx.fillStyle = damaged ? '#A9A9A9' : '#DCD0BC';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.fillRect(x + 18, y + h - 32 - builtH, w - 36, builtH);
    ctx.strokeRect(x + 18, y + h - 32 - builtH, w - 36, builtH);

    ctx.strokeStyle = 'rgba(44, 62, 80, 0.32)';
    ctx.lineWidth = 1.4;
    for (let fy = y + h - 32 - builtH + 24; fy < y + h - 32; fy += 28) {
      ctx.beginPath();
      ctx.moveTo(x + 18, fy);
      ctx.lineTo(x + w - 18, fy);
      ctx.stroke();
    }
  }

  // Scaffold frame.
  ctx.strokeStyle = '#B08968';
  ctx.lineWidth = 2.2;
  for (let sx = x + 28; sx < x + w - 20; sx += 58) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h - 32);
    ctx.lineTo(sx, y + 30);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 30);
  ctx.lineTo(x + w - 20, y + 30);
  ctx.stroke();

  if (progress > 8) {
    const cx = x + w - 48;
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, y + h - 32);
    ctx.lineTo(cx, y - 40);
    ctx.lineTo(cx - 56, y - 40);
    ctx.stroke();
  }

  if (damaged) {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x + 6, y + 18, w - 12, 28, 4);
    ctx.clip();
    for (let s = -h; s < w + h; s += 26) {
      ctx.fillStyle = s % 52 === 0 ? '#FBBF24' : '#1F2937';
      ctx.beginPath();
      ctx.moveTo(x + s, y + 18);
      ctx.lineTo(x + s + 13, y + 18);
      ctx.lineTo(x + s + 13 - 22, y + 46);
      ctx.lineTo(x + s - 22, y + 46);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  const pillW = Math.min(w - 24, 210);
  const pillX = x + (w - pillW) / 2;
  const pillY = y + h + 12;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, pillX, pillY, pillW, 26, 13);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = damaged ? '#EF4444' : '#10B981';
  roundRect(ctx, pillX + 3, pillY + 3, Math.max(6, (pillW - 6) * (progress / 100)), 20, 10);
  ctx.fill();
  ctx.fillStyle = damaged ? '#7F1D1D' : '#064E3B';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    damaged ? `⚠ REPAIR ${Math.round(progress)}%` : `🔨 BUILD ${Math.round(progress)}%`,
    pillX + pillW / 2,
    pillY + 13.5,
  );
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------------------
// ROOFS SEEN FROM ABOVE
// ---------------------------------------------------------------------------

interface RoofRect { x: number; y: number; w: number; h: number }

/** Roof outline: footprint + eaves, reaching down over the top of the wall. */
function roofRectFor(loc: LocationNode, wallTop: number): RoofRect {
  return { x: loc.x - 6, y: loc.y, w: loc.width + 12, h: wallTop - loc.y + 8 };
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function drawRoofTop(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  R: RoofRect,
): void {
  const { x: rx, y: ry, w: rw, h: rh } = R;
  const roof = style.roof;
  const midY = ry + rh / 2;

  const outline = () => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = LINE;
    roundRect(ctx, rx, ry, rw, rh, 6);
    ctx.stroke();
  };

  switch (style.roofKind) {
    case 'gable':
    case 'shopfront': {
      if (style.roofKind === 'shopfront') {
        drawFlatRoof(ctx, loc, style, R);
        return;
      }
      // Pitched roof, ridge running along the street: back slope catches the
      // light, the camera-side slope is a little darker.
      const ridgeY = ry + rh * 0.42;
      ctx.save();
      roundRect(ctx, rx, ry, rw, rh, 6);
      ctx.clip();
      ctx.fillStyle = shade(roof, 0.12);
      ctx.fillRect(rx, ry, rw, ridgeY - ry);
      ctx.fillStyle = shade(roof, -0.07);
      ctx.fillRect(rx, ridgeY, rw, ry + rh - ridgeY);
      ctx.strokeStyle = shade(roof, -0.24);
      ctx.lineWidth = 1.2;
      for (let ly = ry + 8; ly < ry + rh; ly += 9) {
        if (Math.abs(ly - ridgeY) < 4) continue;
        ctx.beginPath();
        ctx.moveTo(rx, ly);
        ctx.lineTo(rx + rw, ly);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = shade(roof, 0.42);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(rx + 4, ridgeY);
      ctx.lineTo(rx + rw - 4, ridgeY);
      ctx.stroke();
      outline();

      if (loc.type === 'home') {
        const cx = loc.x + loc.width - 64;
        const cy = ry + 10;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
        ctx.fillRect(cx + 4, cy + 6, 22, 26);
        ctx.fillStyle = '#9E3F2C';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.fillRect(cx, cy, 20, 24);
        ctx.strokeRect(cx, cy, 20, 24);
        ctx.fillStyle = '#3B2A25';
        ctx.fillRect(cx + 4, cy + 4, 12, 9);
      }
      return;
    }

    case 'hip':
    case 'portico': {
      const ins = Math.min(rw * 0.28, rh * 0.95);
      const P: [number, number] = [rx + ins, midY];
      const Q: [number, number] = [rx + rw - ins, midY];
      fillPoly(ctx, [[rx, ry], [rx + rw, ry], Q, P], shade(roof, 0.12));
      fillPoly(ctx, [[rx, ry + rh], [rx + rw, ry + rh], Q, P], shade(roof, -0.06));
      fillPoly(ctx, [[rx, ry], [rx, ry + rh], P], shade(roof, 0.02));
      fillPoly(ctx, [[rx + rw, ry], [rx + rw, ry + rh], Q], shade(roof, -0.16));
      ctx.strokeStyle = shade(roof, 0.42);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.lineTo(Q[0], Q[1]);
      ctx.stroke();
      outline();
      return;
    }

    case 'sawtooth': {
      const teeth = Math.max(3, Math.round(rw / 80));
      const step = rw / teeth;
      for (let i = 0; i < teeth; i++) {
        const sx = rx + step * i;
        // sloped steel sheet, then the north-light glazing strip
        ctx.fillStyle = shade(roof, i % 2 ? -0.04 : 0.04);
        ctx.fillRect(sx, ry, step * 0.62, rh);
        ctx.fillStyle = '#CFE9DE';
        ctx.fillRect(sx + step * 0.62, ry, step * 0.38, rh);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sx + step * 0.7, ry + 3);
        ctx.lineTo(sx + step * 0.7, ry + rh - 3);
        ctx.stroke();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx, ry, step, rh);
      }
      outline();
      return;
    }

    case 'marquee':
    case 'flat':
    default:
      drawFlatRoof(ctx, loc, style, R);
  }
}

/** Flat roof: membrane, raised coping and the plant that sits on it. */
function drawFlatRoof(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  R: RoofRect,
): void {
  const { x: rx, y: ry, w: rw, h: rh } = R;

  ctx.fillStyle = shade(style.roof, 0.1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  roundRect(ctx, rx, ry, rw, rh, 6);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = shade(style.roof, 0.45);
  ctx.lineWidth = 4;
  roundRect(ctx, rx + 6, ry + 6, rw - 12, rh - 12, 3);
  ctx.stroke();

  ctx.fillStyle = shade(style.roof, -0.04);
  roundRect(ctx, rx + 10, ry + 10, rw - 20, rh - 20, 2);
  ctx.fill();

  // Standing seams + a drainage fall line keep a big flat roof from reading as a slab.
  ctx.save();
  roundRect(ctx, rx + 10, ry + 10, rw - 20, rh - 20, 2);
  ctx.clip();
  ctx.strokeStyle = shade(style.roof, 0.16);
  ctx.lineWidth = 1.4;
  for (let sx = rx + 34; sx < rx + rw - 10; sx += 28) {
    ctx.beginPath();
    ctx.moveTo(sx, ry + 10);
    ctx.lineTo(sx, ry + rh - 10);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(style.roof, -0.2);
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(rx + 14, ry + rh * 0.62);
  ctx.lineTo(rx + rw - 14, ry + rh * 0.62);
  ctx.stroke();
  ctx.restore();

  // Plant on the LEFT and RIGHT ends only: the venue plate sits mid-roof.
  const unit = (ux: number, uy: number, i: number) => {
    ctx.fillStyle = '#B4C1C9';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.fillRect(ux, uy, 26, 16);
    ctx.strokeRect(ux, uy, 26, 16);
    ctx.beginPath();
    ctx.arc(ux + 13, uy + 8, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    void i;
  };
  const uy = ry + Math.max(14, rh - 40);
  unit(rx + 18, uy, 0);
  if (rw > 300) unit(rx + rw - 44, uy - (hash01(loc.id, 9) > 0.5 ? 0 : 4), 1);

  if (loc.type === 'hospital' && rh > 70) {
    const r = Math.min(30, rh / 2 - 12);
    const hx = rx + rw - 64;
    const hy = ry + rh / 2;
    ctx.fillStyle = '#F5F8FA';
    ctx.strokeStyle = '#E53935';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#E53935';
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', hx, hy + 1);
    ctx.textBaseline = 'alphabetic';
  }

  if (loc.type === 'office') {
    // PV rows
    ctx.fillStyle = '#2F4E73';
    ctx.strokeStyle = '#9FC3E8';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const px = rx + rw - 120 + i * 32;
      ctx.fillRect(px, ry + 18, 26, 14);
      ctx.strokeRect(px, ry + 18, 26, 14);
    }
  }
}

/**
 * Shop awning / cinema marquee seen from above on the REAL front edge, for
 * buildings whose shopfront does not face the camera.
 */
function drawEdgeAwning(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  side: Side,
  wallTop: number,
): void {
  const cinema = loc.type === 'cinema';
  const depth = 15;
  const horizontal = side === 'north';
  const start = horizontal ? loc.x + 4 : loc.y + 4;
  const end = horizontal ? loc.x + loc.width - 4 : wallTop - 2;
  const stripe = 16;

  ctx.save();
  for (let p = start, i = 0; p < end; p += stripe, i++) {
    const len = Math.min(stripe, end - p);
    ctx.fillStyle = cinema ? (i % 2 ? '#2D1F47' : '#4A3466') : (i % 2 ? '#FFFFFF' : style.roof);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    let bx: number;
    let by: number;
    let bw: number;
    let bh: number;
    if (side === 'north') { bx = p; by = loc.y - 6; bw = len; bh = depth; }
    else if (side === 'east') { bx = loc.x + loc.width - depth + 6; by = p; bw = depth; bh = len; }
    else { bx = loc.x - 6; by = p; bw = depth; bh = len; }
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    if (cinema && i % 2 === 0) {
      ctx.fillStyle = '#FFE082';
      ctx.beginPath();
      ctx.arc(horizontal ? bx + bw / 2 : bx + bw / 2 + (side === 'east' ? 3 : -3),
        horizontal ? by + 3 : by + bh / 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Porch over the real door for any frontage that is not the camera-side wall:
 * a projecting canopy + stone steps at `loc.door`, which is exactly where the
 * citizens walk in.
 */
function drawPortal(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  style: Typology,
  side: Side,
  isNight: boolean,
): void {
  const { x: dx, y: dy } = loc.door;
  const along = 64;
  const out = 24;
  const horizontal = side === 'north';

  // rectangles are expressed as [x, y, w, h]
  let canopy: [number, number, number, number];
  let steps: [number, number, number, number];
  if (side === 'north') {
    canopy = [dx - along / 2, dy - out, along, out];
    steps = [dx - along / 2 + 8, dy - out - 9, along - 16, out + 9];
  } else if (side === 'east') {
    canopy = [dx, dy - along / 2, out, along];
    steps = [dx, dy - along / 2 + 8, out + 9, along - 16];
  } else {
    canopy = [dx - out, dy - along / 2, out, along];
    steps = [dx - out - 9, dy - along / 2 + 8, out + 9, along - 16];
  }

  if (isNight) {
    const gx = side === 'east' ? dx + 18 : side === 'west' ? dx - 18 : dx;
    const gy = side === 'north' ? dy - 18 : dy;
    const glow = ctx.createRadialGradient(gx, gy, 4, gx, gy, 62);
    glow.addColorStop(0, 'rgba(255, 214, 122, 0.42)');
    glow.addColorStop(1, 'rgba(255, 214, 122, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gx, gy, 62, 0, Math.PI * 2);
    ctx.fill();
  }

  // stone steps
  ctx.fillStyle = shade(style.wall, -0.18);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.fillRect(...steps);
  ctx.strokeRect(...steps);
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.35)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    if (horizontal) {
      const ly = steps[1] + (steps[3] * i) / 3;
      ctx.moveTo(steps[0], ly);
      ctx.lineTo(steps[0] + steps[2], ly);
    } else {
      const lx = steps[0] + (steps[2] * i) / 3;
      ctx.moveTo(lx, steps[1]);
      ctx.lineTo(lx, steps[1] + steps[3]);
    }
    ctx.stroke();
  }

  // canopy slab with its own cast shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
  ctx.fillRect(canopy[0] + 3, canopy[1] + 4, canopy[2], canopy[3]);
  ctx.fillStyle = style.roof;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, ...canopy, 3);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = shade(style.roof, 0.4);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(canopy[0] + 4, canopy[1] + 4);
    ctx.lineTo(canopy[0] + canopy[2] - 4, canopy[1] + 4);
  } else {
    const ex = side === 'east' ? canopy[0] + canopy[2] - 4 : canopy[0] + 4;
    ctx.moveTo(ex, canopy[1] + 4);
    ctx.lineTo(ex, canopy[1] + canopy[3] - 4);
  }
  ctx.stroke();

  // two posts on the outer corners
  ctx.fillStyle = style.trim;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  const posts: Array<[number, number]> = side === 'north'
    ? [[canopy[0] + 3, canopy[1] + 3], [canopy[0] + canopy[2] - 3, canopy[1] + 3]]
    : side === 'east'
      ? [[canopy[0] + canopy[2] - 3, canopy[1] + 3], [canopy[0] + canopy[2] - 3, canopy[1] + canopy[3] - 3]]
      : [[canopy[0] + 3, canopy[1] + 3], [canopy[0] + 3, canopy[1] + canopy[3] - 3]];
  posts.forEach(([px, py]) => {
    ctx.beginPath();
    ctx.arc(px, py, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// ENTRY POINT
// ---------------------------------------------------------------------------

export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  opts: BuildingRenderOptions,
): void {
  if (loc.type === 'park') return;

  const isSite = loc.type === 'construction_site';
  const completedSite = isSite && loc.status === 'completed';
  const resolvedType = completedSite
    ? (loc.id === 'site_clinic' ? 'hospital' : loc.id === 'site_condo' ? 'home' : 'office')
    : loc.type;
  const style = TYPOLOGIES[resolvedType] ?? DEFAULT_TYPOLOGY;

  drawLot(ctx, loc);

  if (isSite && !completedSite) {
    drawContactShadow(ctx, loc);
    drawConstruction(ctx, loc);
    drawNameBadge(ctx, loc, style, loc.y + loc.height + 78);
    if (opts.selectedLocationId === loc.id) drawSelection(ctx, loc);
    return;
  }

  // --- Massing -------------------------------------------------------------
  // The footprint (loc) is split into a ROOF seen from above (north part) and
  // the south WALL the camera looks at. The entrance is built on the edge the
  // real door is on, so what you see is where citizens actually walk in.
  const side = frontSide(loc);
  const southFront = side === 'south';
  const shop = style.storefront && southFront;
  // A shop whose real front is north/east/west keeps its shop identity on the
  // roof edge (awning), while its visible south wall is a plain flank.
  const wallStyle: Typology = shop ? style : { ...style, storefront: false };
  const wallH = wallHeightFor(loc, wallStyle, shop);
  const wall = wallRect(loc, wallH);
  const roofR = roofRectFor(loc, wall.y);
  const massing = computeMassing(wall, wallStyle);

  drawContactShadow(ctx, loc);
  drawShell(ctx, wall, wallStyle);
  drawSideReveal(ctx, wall);
  drawTexture(ctx, wall, wallStyle);
  drawPilasters(ctx, wall, wallStyle, massing.bays);
  drawOpenings(ctx, wall, wallStyle, massing, opts.isNight, southFront);
  drawPlinth(ctx, wall, wallStyle);
  drawGroundShadow(ctx, wall);

  const doorCenterX = clamp(loc.door.x, loc.x + 44, loc.x + loc.width - 44);

  if (shop) drawShopfront(ctx, wall, wallStyle, opts.isNight, doorCenterX);
  if (southFront) drawEntrance(ctx, wall, wallStyle, opts.isNight, shop);
  drawSignature(ctx, wall, wallStyle, opts.isNight, massing);

  drawRoofTop(ctx, loc, style, roofR);

  // Eave shadow on the wall directly below the roof edge.
  const eave = ctx.createLinearGradient(0, wall.y + 8, 0, wall.y + 22);
  eave.addColorStop(0, 'rgba(15, 23, 42, 0.30)');
  eave.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = eave;
  ctx.fillRect(loc.x + 2, wall.y + 8, loc.width - 4, 14);

  if (southFront) {
    if (style.roofKind === 'portico') drawPortico(ctx, wall, style, doorCenterX);
  } else {
    if (style.storefront) drawEdgeAwning(ctx, loc, style, side, wall.y);
    drawPortal(ctx, loc, style, side, opts.isNight);
  }

  if (loc.type === 'cityhall') drawFlag(ctx, loc);

  if (loc.type === 'home') {
    const phase = (opts.smokeTimer % 1.6) / 1.6;
    for (let i = 0; i < 3; i++) {
      const t = (phase + i / 3) % 1;
      ctx.fillStyle = `rgba(236, 239, 241, ${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(loc.x + loc.width - 54 + Math.sin(opts.smokeTimer * 2 + i) * 5, loc.y + 8 - t * 30, 5 + t * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const reading = readService(loc, opts);

  if (opts.isSnowing) drawSnowCap(ctx, roofR);

  if (opts.selectedLocationId === loc.id) drawSelection(ctx, loc);
}

/**
 * Second pass: venue plates are drawn after every building so a label is
 * never clipped by the roof of the neighbouring block.
 */
export function drawBuildingLabel(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  opts: BuildingRenderOptions,
): void {
  if (loc.type === 'park') return;
  if (loc.type === 'construction_site' && loc.status !== 'completed') return;

  const completedSite = loc.type === 'construction_site';
  const resolvedType = completedSite
    ? (loc.id === 'site_clinic' ? 'hospital' : loc.id === 'site_condo' ? 'home' : 'office')
    : loc.type;
  const style = TYPOLOGIES[resolvedType] ?? DEFAULT_TYPOLOGY;
  drawVenuePlate(ctx, loc, style, readService(loc, opts), opts.hoveredLocationId === loc.id);
}
