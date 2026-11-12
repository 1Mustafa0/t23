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

function computeMassing(loc: LocationNode, style: Typology): Massing {
  const bays = clamp(Math.round(loc.width / BAY_TARGET), 2, 6);
  const bayW = (loc.width - 24) / bays;
  const shopBand = style.storefront && loc.type !== 'market' ? 120 : 0;
  const rows = style.storefront ? 1 : style.floors;
  const regionTop = loc.y + 24;
  const regionBottom = loc.y + loc.height - 24 - shopBand;
  const floorH = Math.max(34, (regionBottom - regionTop) / rows);
  return { bays, bayW, rows, floorH, regionTop, regionBottom, shopBand };
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

function drawCornice(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w } = loc;
  const bandY = y + 7;

  ctx.fillStyle = style.trim;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, x + 3, bandY, w - 6, 11, 4);
  ctx.fill();
  ctx.stroke();

  // Shadow line under the cornice gives the facade depth.
  ctx.fillStyle = 'rgba(44, 62, 80, 0.12)';
  ctx.fillRect(x + 4, bandY + 11, w - 8, 3);

  if (style.dentils) {
    ctx.fillStyle = shade(style.trim, -0.22);
    for (let dx = x + 12; dx < x + w - 12; dx += 15) {
      ctx.fillRect(dx, bandY + 7, 7, 5);
    }
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
      if (f === rows - 1 && Math.abs(x + 12 + bayW * b + bayW / 2 - doorX) < winW * 0.9 + 16) continue;
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

function drawGableRoof(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w } = loc;
  const eave = 12;
  const ridge = 40;

  ctx.beginPath();
  ctx.moveTo(x - eave, y + 10);
  ctx.lineTo(x + w / 2, y - ridge);
  ctx.lineTo(x + w + eave, y + 10);
  ctx.closePath();
  ctx.fillStyle = style.roof;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.fill();
  ctx.stroke();

  // Fascia board along the eaves.
  ctx.strokeStyle = shade(style.roof, 0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - eave + 2, y + 10);
  ctx.lineTo(x + w + eave - 2, y + 10);
  ctx.stroke();

  // Shingle courses.
  ctx.strokeStyle = shade(style.roof, -0.2);
  ctx.lineWidth = 1.3;
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const ly = y + 10 - ridge * t;
    const half = (w / 2 + eave) * (1 - t);
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - half, ly);
    ctx.lineTo(x + w / 2 + half, ly);
    ctx.stroke();
  }

  if (loc.type === 'home') {
    const chimX = x + w - 64;
    ctx.fillStyle = '#9E3F2C';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.fillRect(chimX, y - 24, 20, 32);
    ctx.strokeRect(chimX, y - 24, 20, 32);
    ctx.fillStyle = '#7A2E1F';
    ctx.fillRect(chimX - 3, y - 28, 26, 6);
    ctx.strokeRect(chimX - 3, y - 28, 26, 6);
  }
}

function drawHipRoof(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w } = loc;
  const eave = 10;
  const ridge = 30;
  const inset = w * 0.24;

  ctx.beginPath();
  ctx.moveTo(x - eave, y + 10);
  ctx.lineTo(x + inset, y - ridge);
  ctx.lineTo(x + w - inset, y - ridge);
  ctx.lineTo(x + w + eave, y + 10);
  ctx.closePath();
  ctx.fillStyle = style.roof;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = shade(style.roof, -0.22);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - eave, y + 10);
  ctx.lineTo(x + inset, y - ridge);
  ctx.moveTo(x + w + eave, y + 10);
  ctx.lineTo(x + w - inset, y - ridge);
  ctx.stroke();

  // Ridge tile.
  ctx.strokeStyle = shade(style.roof, 0.25);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + inset, y - ridge + 1);
  ctx.lineTo(x + w - inset, y - ridge + 1);
  ctx.stroke();
}

function drawParapet(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w } = loc;

  ctx.fillStyle = shade(style.roof, 0.14);
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  roundRect(ctx, x - 5, y - 12, w + 10, 18, 4);
  ctx.fill();
  ctx.stroke();

  // Coping highlight.
  ctx.strokeStyle = shade(style.roof, 0.42);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 10.5);
  ctx.lineTo(x + w + 2, y - 10.5);
  ctx.stroke();

  const units = Math.max(1, Math.round(w / 140));
  for (let i = 0; i < units; i++) {
    const ux = x + 28 + i * ((w - 56) / units);
    ctx.fillStyle = '#B4C1C9';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.fillRect(ux, y - 26, 32, 13);
    ctx.strokeRect(ux, y - 26, 32, 13);
    ctx.beginPath();
    ctx.arc(ux + 16, y - 19.5, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (loc.type === 'office') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.74, y - 12);
    ctx.lineTo(x + w * 0.74, y - 48);
    ctx.moveTo(x + w * 0.74 - 9, y - 42);
    ctx.lineTo(x + w * 0.74 + 9, y - 42);
    ctx.stroke();
  }
}

function drawSawtoothRoof(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, y, width: w } = loc;
  const teeth = Math.max(3, Math.round(w / 88));
  const step = w / teeth;
  ctx.fillStyle = style.roof;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 10);
  for (let i = 0; i < teeth; i++) {
    ctx.lineTo(x + step * i + step * 0.52, y - 30);
    ctx.lineTo(x + step * (i + 1), y + 10);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < teeth; i++) {
    ctx.beginPath();
    ctx.moveTo(x + step * i + step * 0.58, y - 22);
    ctx.lineTo(x + step * (i + 1) - 5, y + 5);
    ctx.stroke();
  }
}

function drawMarquee(ctx: CanvasRenderingContext2D, loc: LocationNode, style: Typology): void {
  const { x, width: w } = loc;
  const bandY = loc.y - 36;

  ctx.fillStyle = style.roof;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  roundRect(ctx, x + 10, bandY, w - 20, 26, 5);
  ctx.fill();
  ctx.stroke();

  const bulbs = Math.max(6, Math.round((w - 36) / 24));
  for (let i = 0; i < bulbs; i++) {
    ctx.fillStyle = '#FFE082';
    ctx.beginPath();
    ctx.arc(x + 22 + i * ((w - 44) / (bulbs - 1)), bandY + 13, 3.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vertical fin sign announcing the picture house.
  ctx.fillStyle = style.accent;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  roundRect(ctx, x + 16, bandY - 20, 30, 18, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎬', x + 31, bandY - 10.5);
  ctx.textBaseline = 'alphabetic';
}

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
  const cx = x + w / 2;
  const cy = massing.regionTop + massing.floorH * 0.5;

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

    // Flagpole on the parapet.
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x + w - 34, y - 12);
    ctx.lineTo(x + w - 34, y - 62);
    ctx.stroke();
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.moveTo(x + w - 34, y - 62);
    ctx.lineTo(x + w - 6, y - 54);
    ctx.lineTo(x + w - 34, y - 46);
    ctx.closePath();
    ctx.fill();
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

function drawSnowCap(ctx: CanvasRenderingContext2D, loc: LocationNode): void {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
  ctx.strokeStyle = 'rgba(44, 62, 80, 0.35)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, loc.x - 3, loc.y - 5, loc.width + 6, 10, 5);
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
// ENTRY POINT
// ---------------------------------------------------------------------------

function drawBuildingLocal(
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

  const massing = computeMassing(loc, style);

  drawContactShadow(ctx, loc);
  drawShell(ctx, loc, style);
  drawSideReveal(ctx, loc);
  drawTexture(ctx, loc, style);
  drawPilasters(ctx, loc, style, massing.bays);
  drawOpenings(ctx, loc, style, massing, opts.isNight);
  drawCornice(ctx, loc, style);
  drawPlinth(ctx, loc, style);
  drawGroundShadow(ctx, loc);

  const doorCenterX = clamp(loc.door.x, loc.x + 44, loc.x + loc.width - 44);

  if (style.storefront) drawShopfront(ctx, loc, style, opts.isNight, doorCenterX);
  drawEntrance(ctx, loc, style, opts.isNight, style.storefront);
  drawSignature(ctx, loc, style, opts.isNight, massing);

  switch (style.roofKind) {
    case 'gable': drawGableRoof(ctx, loc, style); break;
    case 'hip': drawHipRoof(ctx, loc, style); break;
    case 'flat': drawParapet(ctx, loc, style); break;
    case 'sawtooth': drawSawtoothRoof(ctx, loc, style); break;
    case 'marquee': drawMarquee(ctx, loc, style); break;
    case 'portico': drawHipRoof(ctx, loc, style); drawPortico(ctx, loc, style, doorCenterX); break;
    case 'shopfront': drawParapet(ctx, loc, style); break;
    default: break;
  }

  if (loc.type === 'home') {
    const phase = (opts.smokeTimer % 1.6) / 1.6;
    for (let i = 0; i < 3; i++) {
      const t = (phase + i / 3) % 1;
      ctx.fillStyle = `rgba(236, 239, 241, ${0.5 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(loc.x + loc.width - 54 + Math.sin(opts.smokeTimer * 2 + i) * 5, loc.y - 34 - t * 34, 5 + t * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const reading = readService(loc, opts);

  if (opts.isSnowing) drawSnowCap(ctx, loc);

  if (opts.selectedLocationId === loc.id) drawSelection(ctx, loc);
}

/**
 * Second pass: venue plates are drawn after every building so a label is
 * never clipped by the roof of the neighbouring block.
 */
function drawBuildingLabelLocal(
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


/**
 * Rotate each building so its architectural front faces the street-side door.
 * East/west lots use a quarter-turn and swapped local dimensions; this keeps
 * the rendered footprint inside the original world-space lot.
 */
interface FacadeTransform {
  centerX: number;
  centerY: number;
  angle: number;
  localLocation: LocationNode;
}

function orientBuildingToDoor(loc: LocationNode): FacadeTransform {
  const centerX = loc.x + loc.width / 2;
  const centerY = loc.y + loc.height / 2;
  const distances = [
    { side: 'south' as const, distance: Math.abs(loc.door.y - (loc.y + loc.height)) },
    { side: 'north' as const, distance: Math.abs(loc.door.y - loc.y) },
    { side: 'east' as const, distance: Math.abs(loc.door.x - (loc.x + loc.width)) },
    { side: 'west' as const, distance: Math.abs(loc.door.x - loc.x) },
  ];
  const side = distances.reduce((best, item) => item.distance < best.distance ? item : best).side;

  // In local renderer space every front door is on the south edge.
  const angle = side === 'north' ? Math.PI
    : side === 'east' ? -Math.PI / 2
    : side === 'west' ? Math.PI / 2
    : 0;
  const quarterTurn = side === 'east' || side === 'west';
  const localWidth = quarterTurn ? loc.height : loc.width;
  const localHeight = quarterTurn ? loc.width : loc.height;
  const dx = loc.door.x - centerX;
  const dy = loc.door.y - centerY;

  let doorX = dx;
  let doorY = dy;
  if (side === 'north') {
    doorX = -dx;
    doorY = -dy;
  } else if (side === 'east') {
    doorX = -dy;
    doorY = dx;
  } else if (side === 'west') {
    doorX = dy;
    doorY = -dx;
  }

  return {
    centerX,
    centerY,
    angle,
    localLocation: {
      ...loc,
      x: -localWidth / 2,
      y: -localHeight / 2,
      width: localWidth,
      height: localHeight,
      door: { x: doorX, y: doorY },
    },
  };
}

/** Draw a building with its front aligned to its actual street-facing door. */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  opts: BuildingRenderOptions,
): void {
  const transform = orientBuildingToDoor(loc);
  ctx.save();
  ctx.translate(transform.centerX, transform.centerY);
  ctx.rotate(transform.angle);
  drawBuildingLocal(ctx, transform.localLocation, opts);
  ctx.restore();
}

/** Keep facade labels and live service plates aligned with the rotated building. */
export function drawBuildingLabel(
  ctx: CanvasRenderingContext2D,
  loc: LocationNode,
  opts: BuildingRenderOptions,
): void {
  const transform = orientBuildingToDoor(loc);
  ctx.save();
  ctx.translate(transform.centerX, transform.centerY);
  ctx.rotate(transform.angle);
  drawBuildingLabelLocal(ctx, transform.localLocation, opts);
  ctx.restore();
}
