/**
 * ============================================================================
 *  CITY CANVAS — the big read-only renderer
 * ============================================================================
 *
 *  Draws the whole 3200×2400 world every frame: districts, roads, buildings
 *  (with live construction progress), density-traffic heatmap (cached
 *  offscreen canvas), chibi citizens, speech bubbles, rain/snow particles and
 *  the mini radar. Handles camera (pan/zoom/fit) and click hit-testing that
 *  lifts citizens/locations to the inspectors ABOVE it.
 *
 *  CONTRACT: it NEVER mutates simulation state. Agent x/y, walk cycles and
 *  ambient freeze behaviour all come from globalSimulation / movementSystem;
 *  pausing simply freezes rendering of motion.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { DRAWING_COLORS } from '../theme';
import {
  loadSprite,
  preloadSceneSprites,
  TREE_SPRITES,
} from '../sprites';
import { drawBuilding, drawBuildingLabel } from '../render/architecture';
import { drawGround } from '../render/ground';
import { drawRoadNetwork, drawPromenades } from '../render/roadRenderer';
import { drawVehicle } from '../render/vehicleRenderer';
import { TRAFFIC } from '../simulation/vehicleSystem';
import { JUSTICE } from '../simulation/justice';
import { globalSimulation } from '../simulation/simulationEngine';
import { 
  CITY_LOCATIONS, 
  CITY_DISTRICTS, 
  DISTRICT_RECTS,
  CITY_WIDTH, 
  CITY_HEIGHT, 
  TILE_SIZE 
} from '../simulation/cityMap';
import { ROADS, FRONTAGES } from '../layout';
import { AgentData, LocationNode, SpeechBubble, DistrictInfo, DistrictId } from '../types/simulation';import { soundEngine } from '../audio/soundEngine';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Compass, 
  Flame, 
  Navigation, 
  Map as MapIcon, 
  ChevronDown, 
  Layers
} from 'lucide-react';

interface CityCanvasProps {
  selectedAgentId: string | null;
  showDensityHeatmap?: boolean;
  onSelectAgent: (agentId: string | null) => void;
  onSelectLocation?: (locationId: string) => void;
}

// Consistent Cozy Vector Cartoon Color Palette & Style Constants
const OUTLINE_COLOR = DRAWING_COLORS.outline;
const OUTLINE_WIDTH = 2.5;
const [WEST_AVENUE, EAST_AVENUE] = ROADS.avenues.vertical.map(road => road.x);
const [NORTH_AVENUE, SOUTH_AVENUE] = ROADS.avenues.horizontal.map(road => road.y);

const ROAD_SEGMENTS = [
  ...ROADS.avenues.vertical.map(road => ({ x1: road.x, y1: 20, x2: road.x, y2: CITY_HEIGHT - 20 })),
  ...ROADS.avenues.horizontal.map(road => ({ x1: 20, y1: road.y, x2: CITY_WIDTH - 20, y2: road.y })),
  ...ROADS.streets.vertical.map(road => ({ x1: road.x, y1: road.y1, x2: road.x, y2: road.y2 })),
  ...ROADS.streets.horizontal.map(road => ({ x1: road.x1, y1: road.y, x2: road.x2, y2: road.y })),
];

function nearestRoadPoint(x: number, y: number) {
  let closest = { x, y };
  let minDistance = Infinity;
  for (const segment of ROAD_SEGMENTS) {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - segment.x1) * dx + (y - segment.y1) * dy) / lengthSquared));
    const point = { x: segment.x1 + t * dx, y: segment.y1 + t * dy };
    const distance = Math.hypot(x - point.x, y - point.y);
    if (distance < minDistance) {
      closest = point;
      minDistance = distance;
    }
  }
  return closest;
}

// Static Tree Coordinates scattered across districts and parks for charming vector nature
const STATIC_TREES = [
  // Commercial District Trees
  { x: 80, y: 140, scale: 1.0 },
  { x: 520, y: 140, scale: 0.9 },
  { x: 970, y: 160, scale: 1.1 },
  { x: 80, y: 460, scale: 0.85 },
  { x: 520, y: 460, scale: 0.95 },
  { x: 970, y: 460, scale: 1.05 },
  { x: 80, y: 800, scale: 1.0 },
  { x: 520, y: 800, scale: 0.9 },

  // Civic Plaza Trees & Courtyard
  { x: 1080, y: 160, scale: 1.1 },
  { x: 1400, y: 140, scale: 1.0 },
  { x: 1800, y: 140, scale: 1.0 },
  { x: 2120, y: 160, scale: 1.15 },
  { x: 1250, y: 440, scale: 0.9 },
  { x: 1950, y: 440, scale: 0.9 },

  // Financial & Tech District Trees
  { x: 2220, y: 150, scale: 1.0 },
  { x: 2580, y: 140, scale: 0.95 },
  { x: 3080, y: 150, scale: 1.1 },
  { x: 2220, y: 460, scale: 0.85 },
  { x: 3080, y: 460, scale: 1.0 },
  { x: 2220, y: 800, scale: 0.95 },
  { x: 3080, y: 800, scale: 1.05 },

  // Central Grand Park Perimeter & Lake Grove
  { x: 1100, y: 780, scale: 1.2 },
  { x: 1240, y: 780, scale: 1.1 },
  { x: 1380, y: 780, scale: 1.0 },
  { x: 1820, y: 780, scale: 1.05 },
  { x: 1960, y: 780, scale: 1.15 },
  { x: 2100, y: 780, scale: 1.25 },
  { x: 1100, y: 920, scale: 1.1 },
  { x: 2100, y: 920, scale: 1.1 },
  { x: 1100, y: 1560, scale: 1.15 },
  { x: 2100, y: 1560, scale: 1.2 },
  { x: 1120, y: 1700, scale: 1.2 },
  { x: 1260, y: 1700, scale: 1.05 },
  { x: 1400, y: 1700, scale: 1.0 },
  { x: 1800, y: 1700, scale: 1.1 },
  { x: 1940, y: 1700, scale: 1.15 },
  { x: 2080, y: 1700, scale: 1.2 },
  { x: 1200, y: 1150, scale: 1.0 },
  { x: 1220, y: 1350, scale: 1.05 },
  { x: 1980, y: 1150, scale: 1.0 },
  { x: 1980, y: 1350, scale: 1.1 },

  // Residential District Garden Trees
  { x: 80, y: 1450, scale: 1.1 },
  { x: 520, y: 1450, scale: 1.0 },
  { x: 970, y: 1450, scale: 1.15 },
  { x: 80, y: 1840, scale: 0.9 },
  { x: 520, y: 1840, scale: 0.95 },
  { x: 970, y: 1840, scale: 1.05 },
  { x: 80, y: 2250, scale: 1.2 },
  { x: 380, y: 2280, scale: 1.0 },
  { x: 680, y: 2280, scale: 1.1 },
  { x: 970, y: 2250, scale: 1.15 },

  // Healthcare District Serenity Trees
  { x: 2220, y: 1450, scale: 1.0 },
  { x: 2600, y: 1450, scale: 0.95 },
  { x: 3080, y: 1450, scale: 1.1 },
  { x: 2220, y: 1840, scale: 0.9 },
  { x: 3080, y: 1840, scale: 1.0 },
  { x: 2220, y: 2260, scale: 1.15 },
  { x: 2650, y: 2280, scale: 1.05 },
  { x: 3080, y: 2260, scale: 1.2 },
];

/**
 * Tree placement guard: a tree may only stand on free ground. Anything that
 * falls on a carriageway, footway, promenade or a building plot is dropped,
 * which fixes trees growing out of the asphalt.
 */
const TREE_SPOTS = (() => {
  const blocked: Array<{ x: number; y: number; w: number; h: number }> = [];

  const mark = (x: number, y: number, w: number, h: number) => blocked.push({ x, y, w, h });

  // Building plots (+ a little margin for the party walls).
  CITY_LOCATIONS.forEach(loc => mark(loc.x - 12, loc.y - 12, loc.width + 24, loc.height + 24));
  // Promenades.
  FRONTAGES.forEach(f => mark(f.x - 6, f.y - 6, f.w + 12, f.h + 12));
  // Arterial corridors (88 px carriageway + 16 px footway + margin).
  [1024, 2176].forEach(x => mark(x - 66, 0, 132, 2432));
  [448, 1856].forEach(y => mark(0, y - 66, 3200, 132));
  // Collector streets (30 px + footway).
  ROADS.streets.horizontal.forEach(r => mark(r.x1, r.y - 26, r.x2 - r.x1, 52));
  ROADS.streets.vertical.forEach(r => mark(r.x - 26, r.y1, 52, r.y2 - r.y1));

  const inside = (x: number, y: number) =>
    blocked.some(rect => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h);

  return STATIC_TREES.filter(tree => !inside(tree.x, tree.y));
})();


export const CityCanvas: React.FC<CityCanvasProps> = ({
  selectedAgentId,
  showDensityHeatmap,
  onSelectAgent,
  onSelectLocation
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // 1. Camera & Mouse State
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 0.55,
    minZoom: 0.3,
    maxZoom: 3.0,
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    hasDragged: false,
    mouseDownPos: { x: 0, y: 0 }
  });

  // UI state
  const [zoomLevel, setZoomLevel] = useState<number>(55);
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null);
  // Hover is consumed inside the rAF loop, which must not restart on every
  // mouse move — a ref carries the latest value without re-subscribing.
  const hoveredBuildingRef = useRef<string | null>(null);
  const [isMiniMapExpanded, setIsMiniMapExpanded] = useState<boolean>(true);
  const [activeDistrictFilter, setActiveDistrictFilter] = useState<DistrictId | null>(null);

  // Live vehicles state
  // Vehicle state now lives in the traffic system (src/simulation/vehicleSystem).

  // Cached offscreen density heatmap. Rebuilt only when the traffic sample set
  // changes, never on every animation frame.
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapSignatureRef = useRef<string>('');

  useEffect(() => {
    preloadSceneSprites();
  }, []);

  // Particle systems
  const particlesRef = useRef<{
    rain: { x: number; y: number; speed: number; len: number; angle: number }[];
    snow: { x: number; y: number; radius: number; speed: number; wobble: number; wobbleSpeed: number; opacity: number }[];
    splashes: { x: number; y: number; r: number; maxR: number; opacity: number }[];
    waterRipple: { x: number; y: number; r: number; maxR: number; opacity: number }[];
    smokePuffs: { x: number; y: number; r: number; opacity: number; vy: number; vx: number }[];
  }>({
    rain: Array.from({ length: 280 }, () => ({
      x: Math.random() * CITY_WIDTH,
      y: Math.random() * CITY_HEIGHT,
      speed: 14 + Math.random() * 6,
      len: 14 + Math.random() * 8,
      angle: 0.16
    })),
    snow: Array.from({ length: 320 }, () => ({
      x: Math.random() * CITY_WIDTH,
      y: Math.random() * CITY_HEIGHT,
      radius: 2.2 + Math.random() * 3.0,
      speed: 1.0 + Math.random() * 1.8,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.04,
      opacity: 0.7 + Math.random() * 0.3
    })),
    splashes: [],
    waterRipple: [
      { x: 1460, y: 1200, r: 8, maxR: 45, opacity: 0.7 },
      { x: 1640, y: 1300, r: 14, maxR: 50, opacity: 0.6 },
      { x: 1780, y: 1180, r: 6, maxR: 38, opacity: 0.7 }
    ],
    smokePuffs: [
      { x: 200, y: 1600, r: 4, opacity: 0.8, vy: -0.6, vx: 0.1 },
      { x: 205, y: 1585, r: 7, opacity: 0.6, vy: -0.6, vx: 0.2 },
      { x: 212, y: 1565, r: 10, opacity: 0.35, vy: -0.6, vx: 0.3 }
    ]
  });

  // Focus camera on an agent
  const focusOnAgent = useCallback((agent: AgentData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    cameraRef.current.x = viewW / 2 - agent.x * cameraRef.current.zoom;
    cameraRef.current.y = viewH / 2 - agent.y * cameraRef.current.zoom;
  }, []);

  // Jump camera to a specific district
  const jumpToDistrict = useCallback((districtId: DistrictId) => {
    const district = CITY_DISTRICTS.find(d => d.id === districtId);
    const canvas = canvasRef.current;
    if (!district || !canvas) return;

    soundEngine.playClickSound();
    setActiveDistrictFilter(districtId);

    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    const targetZoom = 0.80;

    cameraRef.current.zoom = targetZoom;
    cameraRef.current.x = viewW / 2 - district.center.x * targetZoom;
    cameraRef.current.y = viewH / 2 - district.center.y * targetZoom;
    setZoomLevel(Math.round(targetZoom * 100));
  }, []);

  // Fit Whole City (3200x2432)
  const centerCamera = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;

    const scaleX = viewW / CITY_WIDTH;
    const scaleY = viewH / CITY_HEIGHT;
    // Fit means the WHOLE city must be visible: take the smaller scale (the
    // binding axis) so nothing is cropped. Previously `Math.max` filled one
    // axis and cut the other one off.
    const fitZoom = Math.min(scaleX, scaleY, 1);

    cameraRef.current.zoom = fitZoom;
    cameraRef.current.x = (viewW - CITY_WIDTH * fitZoom) / 2;
    cameraRef.current.y = (viewH - CITY_HEIGHT * fitZoom) / 2;
    setZoomLevel(Math.round(fitZoom * 100));
    setActiveDistrictFilter(null);
  }, []);

  // Sync selectedAgentId
  useEffect(() => {
    if (selectedAgentId) {
      const agent = globalSimulation.agents.find(a => a.id === selectedAgentId);
      if (agent) {
        focusOnAgent(agent);
      }
    }
  }, [selectedAgentId, focusOnAgent]);

  // Responsive resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      centerCamera();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [centerCamera]);

  // -------------------------------------------------------------
  // MAIN 60FPS RAF CANVAS RENDER LOOP (Cozy Vector Cartoon Engine)
  // -------------------------------------------------------------
  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let duckT = 0;
    let smokeTimer = 0;

    // Delta-time bookkeeping: every ambient animation is expressed per 60 Hz
    // frame, then scaled by the real elapsed time so a 144 Hz monitor does not
    // run the city 2.4x faster than a 60 Hz one.
    let lastTs = 0;
    let animClockMs = 0;

    const render = (ts: number = 0) => {
      const frameNow = ts || (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const rawDelta = lastTs === 0 ? 16.6667 : frameNow - lastTs;
      lastTs = frameNow;
      const deltaMs = Math.max(0, Math.min(64, rawDelta)); // clamp after tab throttling
      const frameScale = deltaMs / 16.6667;                // 1.0 at 60 fps
      const paused = globalSimulation.isPaused;
      const motionScale = paused ? 0 : frameScale;
      if (!paused) animClockMs += deltaMs;

      if (!paused) {
        duckT += 0.02 * frameScale;
        smokeTimer += 0.02 * frameScale;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width;
      const height = canvas.height;
      const viewW = canvas.clientWidth;
      const viewH = canvas.clientHeight;

      const weather = globalSimulation.weather;
      const isSnowing = weather === 'snow' || weather === 'blizzard';
      const isRaining = weather === 'storm' || weather === 'rainy';
      const isNight = globalSimulation.time.lightLevel < 0.5;

      // View Frustum Culling bounds in world coordinates
      const zoom = cameraRef.current.zoom;
      const margin = 200;
      const camLeft = -cameraRef.current.x / zoom - margin;
      const camTop = -cameraRef.current.y / zoom - margin;
      const camRight = camLeft + viewW / zoom + 2 * margin;
      const camBottom = camTop + viewH / zoom + 2 * margin;

      const inFrustum = (x: number, y: number, w = 0, h = 0) => {
        return x + w >= camLeft && x <= camRight && y + h >= camTop && y <= camBottom;
      };

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Apply DPR and Camera transformations
      ctx.scale(dpr, dpr);
      ctx.translate(cameraRef.current.x, cameraRef.current.y);
      ctx.scale(zoom, zoom);

      // =========================================================
      // 1. MEADOW GROUND
      //
      // Organic tonal patches + meadow detail (src/render/ground.ts) instead
      // of the old 100 px checkerboard.
      // =========================================================
      drawGround(ctx, {
        isSnowing,
        view: { x0: camLeft, y0: camTop, x1: camRight, y1: camBottom }
      });

      // Distinct district ground languages make the map readable at a glance,
      // even when the camera is zoomed all the way out.
      CITY_DISTRICTS.forEach(d => {
        ctx.save();
        const drect = DISTRICT_RECTS[d.id];
        if (!drect) return;
        ctx.fillStyle = d.color + '14';
        ctx.fillRect(drect.x, drect.y, drect.w, drect.h);
        ctx.strokeStyle = d.color + '75';
        ctx.lineWidth = 6;
        ctx.setLineDash([18, 14]);
        ctx.strokeRect(drect.x + 12, drect.y + 12, drect.w - 24, drect.h - 24);
        ctx.setLineDash([]);

        if (d.id === 'financial') {
          ctx.strokeStyle = '#60a5fa55';
          ctx.lineWidth = 3;
          for (let x = drect.x + 70; x < drect.x + drect.w; x += 160) {
            ctx.beginPath();
            ctx.moveTo(x, drect.y + 30);
            ctx.lineTo(x, drect.y + drect.h - 30);
            ctx.stroke();
          }
        } else if (d.id === 'commercial') {
          ctx.fillStyle = '#fbbf2440';
          for (let x = drect.x + 55; x < drect.x + drect.w; x += 130) {
            for (let y = drect.y + 75; y < drect.y + drect.h; y += 130) {
              ctx.beginPath();
              ctx.arc(x, y, 7, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else if (d.id === 'healthcare') {
          ctx.strokeStyle = '#67e8f955';
          ctx.lineWidth = 4;
          for (let x = drect.x + 90; x < drect.x + drect.w; x += 220) {
            for (let y = drect.y + 100; y < drect.y + drect.h; y += 220) {
              ctx.beginPath();
              ctx.moveTo(x - 12, y);
              ctx.lineTo(x + 12, y);
              ctx.moveTo(x, y - 12);
              ctx.lineTo(x, y + 12);
              ctx.stroke();
            }
          }
        } else if (d.id === 'residential') {
          ctx.strokeStyle = '#f9a8d455';
          ctx.lineWidth = 3;
          for (let y = drect.y + 70; y < drect.y + drect.h; y += 150) {
            ctx.beginPath();
            ctx.arc(drect.x + drect.w / 2, y, 360, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();
          }
        }
        ctx.restore();
      });

      // =========================================================
      // 2. ROAD NETWORK
      //
      // One hierarchy for the whole city: arterial carriageways with lane
      // discipline and signals, collector streets, footways, zebra crossings,
      // bus shelters and street furniture. Geometry and traffic share
      // src/simulation/roadNetwork.ts, so what you see is what drives.
      // =========================================================
      drawRoadNetwork(ctx, {
        isNight,
        isSnowing,
        traffic: TRAFFIC,
        clock: TRAFFIC.clock,
        view: { x0: camLeft, y0: camTop, x1: camRight, y1: camBottom }
      });

      // Paved promenade between every building frontage and the carriageway.
      drawPromenades(ctx, { isSnowing, isNight });

      // Footway tone reused by the door paths below.
      const sidewalkColor = isSnowing ? DRAWING_COLORS.terrain.sidewalk.snow : DRAWING_COLORS.terrain.sidewalk.base;

      // Cobblestone Paved Paths from Roads to Building Doors
      CITY_LOCATIONS.forEach(loc => {
        if (loc.type === 'park') return;
        const streetPoint = nearestRoadPoint(loc.door.x, loc.door.y);
        ctx.lineCap = 'round';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(loc.door.x, loc.door.y);
        ctx.lineTo(streetPoint.x, streetPoint.y);
        ctx.stroke();
        ctx.strokeStyle = sidewalkColor;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(loc.door.x, loc.door.y);
        ctx.lineTo(streetPoint.x, streetPoint.y);
        ctx.stroke();

        ctx.fillStyle = sidewalkColor;
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(loc.door.x - 18, loc.door.y - 12, 36, 24, 4);
        ctx.fill();
        ctx.stroke();
      });

      // =========================================================
      // 3. CENTRAL PARK & DUCK POND (Animal Crossing Aesthetic)
      // =========================================================
      const park = CITY_LOCATIONS.find(l => l.id === 'park')!;
      if (inFrustum(park.x - 20, park.y - 20, park.width + 40, park.height + 40)) {
        ctx.save();

        // Park lawn soft drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        ctx.roundRect(park.x + 8, park.y + 10, park.width, park.height, 42);
        ctx.fill();

        // Park vibrant manicured lawn
        ctx.fillStyle = isSnowing ? DRAWING_COLORS.terrain.grass.parkSnow : DRAWING_COLORS.terrain.grass.park;
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.beginPath();
        ctx.roundRect(park.x, park.y, park.width, park.height, 42);
        ctx.fill();
        ctx.stroke();

        // Curving Cobblestone Walking Loop
        ctx.strokeStyle = isSnowing ? '#e0e0e0' : '#efebe9';
        ctx.lineWidth = 28;
        ctx.beginPath();
        ctx.ellipse(park.x + park.width / 2, park.y + park.height / 2, 420, 320, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Outer outline of walking loop
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(park.x + park.width / 2, park.y + park.height / 2, 434, 334, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(park.x + park.width / 2, park.y + park.height / 2, 406, 306, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Round Duck Pond with cyan water (#4fc3f7) and dark blue inner rim (#0288d1)
        const pondCenterX = park.x + park.width / 2;
        const pondCenterY = park.y + park.height / 2;

        // Pond bank rim
        ctx.fillStyle = DRAWING_COLORS.terrain.water.bank;
        ctx.beginPath();
        ctx.ellipse(pondCenterX, pondCenterY, 300, 220, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.stroke();

        // Deep water rim
        ctx.fillStyle = DRAWING_COLORS.terrain.water.rim;
        ctx.beginPath();
        ctx.ellipse(pondCenterX, pondCenterY, 290, 210, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sparkling cyan surface
        ctx.fillStyle = isSnowing ? DRAWING_COLORS.terrain.water.snowSurface : DRAWING_COLORS.terrain.water.surface;
        ctx.beginPath();
        ctx.ellipse(pondCenterX, pondCenterY, 280, 200, 0, 0, Math.PI * 2);
        ctx.fill();

        // Water ripple highlights
        particlesRef.current.waterRipple.forEach(rip => {
          rip.r += 0.28 * frameScale;
          rip.opacity = Math.max(0, 1 - rip.r / rip.maxR);
          if (rip.r >= rip.maxR) {
            rip.r = 4;
            rip.opacity = 0.8;
          }
          ctx.strokeStyle = `rgba(255, 255, 255, ${rip.opacity * 0.75})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(rip.x, rip.y, rip.r, rip.r * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        });

        // Floating Lily Pads & Pink Lotus Flowers
        const lilyPads = [
          { x: pondCenterX - 180, y: pondCenterY - 60, r: 16, flower: true },
          { x: pondCenterX - 200, y: pondCenterY + 40, r: 14, flower: false },
          { x: pondCenterX + 160, y: pondCenterY - 80, r: 18, flower: true },
          { x: pondCenterX + 190, y: pondCenterY + 50, r: 15, flower: false },
          { x: pondCenterX - 40, y: pondCenterY + 120, r: 17, flower: true },
          { x: pondCenterX + 70, y: pondCenterY + 110, r: 13, flower: false },
        ];

        lilyPads.forEach(pad => {
          ctx.fillStyle = '#66bb6a';
          ctx.strokeStyle = OUTLINE_COLOR;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(pad.x, pad.y, pad.r, 0.25 * Math.PI, 1.95 * Math.PI);
          ctx.lineTo(pad.x, pad.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Pink Lotus Flower on select lily pads
          if (pad.flower) {
            ctx.fillStyle = '#f06292';
            ctx.beginPath();
            ctx.arc(pad.x - 2, pad.y - 2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffeb3b';
            ctx.beginPath();
            ctx.arc(pad.x - 2, pad.y - 2, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        });

        // Cute Swimming Yellow Cartoon Ducks with Orange Beaks
        const duck1X = pondCenterX - 80 + Math.sin(duckT) * 45;
        const duck1Y = pondCenterY + Math.cos(duckT) * 30;
        
        // Wake ripple behind duck 1
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(duck1X - 8, duck1Y + 3, 6, 0.4 * Math.PI, 1.6 * Math.PI);
        ctx.stroke();

        // Duck 1 body
        ctx.fillStyle = '#ffeb3b';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(duck1X, duck1Y, 11, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Duck 1 head & eye
        ctx.beginPath();
        ctx.arc(duck1X + 8, duck1Y - 4, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = OUTLINE_COLOR;
        ctx.beginPath();
        ctx.arc(duck1X + 9, duck1Y - 5, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Duck 1 orange beak
        ctx.fillStyle = '#ff9800';
        ctx.beginPath();
        ctx.moveTo(duck1X + 13, duck1Y - 4);
        ctx.lineTo(duck1X + 19, duck1Y - 3);
        ctx.lineTo(duck1X + 13, duck1Y - 1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Wooden Arch Footbridge over the Pond
        ctx.fillStyle = '#8d6e63';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.beginPath();
        ctx.roundRect(pondCenterX - 24, pondCenterY - 210, 48, 420, 10);
        ctx.fill();
        ctx.stroke();

        // Wooden deck planks
        ctx.fillStyle = '#d7ccc8';
        for (let by = pondCenterY - 195; by < pondCenterY + 195; by += 16) {
          ctx.fillRect(pondCenterX - 20, by, 40, 9);
          ctx.strokeRect(pondCenterX - 20, by, 40, 9);
        }

        // Wooden Park Benches around the pond
        const benches = [
          { x: pondCenterX - 340, y: pondCenterY - 100, angle: 0 },
          { x: pondCenterX - 340, y: pondCenterY + 100, angle: 0 },
          { x: pondCenterX + 320, y: pondCenterY - 100, angle: 0 },
          { x: pondCenterX + 320, y: pondCenterY + 100, angle: 0 },
          { x: pondCenterX - 100, y: pondCenterY - 260, angle: 1.57 },
          { x: pondCenterX + 100, y: pondCenterY - 260, angle: 1.57 },
        ];

        benches.forEach(bench => {
          ctx.save();
          ctx.translate(bench.x, bench.y);
          ctx.rotate(bench.angle);
          ctx.fillStyle = '#795548';
          ctx.strokeStyle = OUTLINE_COLOR;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.roundRect(-16, -6, 32, 12, 3);
          ctx.fill();
          ctx.stroke();
          // Seat slat
          ctx.fillStyle = '#a1887f';
          ctx.fillRect(-14, -4, 28, 4);
          ctx.restore();
        });

        // Victorian Park Gazebo
        const gazX = pondCenterX - 220;
        const gazY = pondCenterY - 140;
        ctx.fillStyle = '#fff9c4';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.beginPath();
        ctx.arc(gazX, gazY, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e91e63';
        ctx.beginPath();
        ctx.moveTo(gazX - 36, gazY + 8);
        ctx.lineTo(gazX, gazY - 32);
        ctx.lineTo(gazX + 36, gazY + 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      // =========================================================
      // 4. ROUND LAYERED CARTOON TREES & VEGETATION
      // =========================================================
      TREE_SPOTS.forEach(tree => {
        if (!inFrustum(tree.x - 50, tree.y - 70, 100, 120)) return;

        const treeSprite = loadSprite(isSnowing ? TREE_SPRITES.snowy : TREE_SPRITES.leafy);
        if (treeSprite.complete && treeSprite.naturalWidth > 0) {
          const s = tree.scale;
          ctx.drawImage(treeSprite, tree.x - 50 * s, tree.y - 70 * s, 100 * s, 120 * s);
          return;
        }

        ctx.save();
        const tx = tree.x;
        const ty = tree.y;
        const s = tree.scale;

        // Soft ground shadow beneath tree
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.beginPath();
        ctx.ellipse(tx, ty + 18 * s, 26 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sturdy brown cartoon trunk with dark vector outline
        ctx.fillStyle = '#795548';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.beginPath();
        ctx.roundRect(tx - 6 * s, ty - 6 * s, 12 * s, 24 * s, 3 * s);
        ctx.fill();
        ctx.stroke();

        // Trunk wood knot
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(tx, ty + 4 * s, 2.5 * s, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();

        // Overlapping vibrant green foliage spheres
        const foliageColor1 = isSnowing ? '#b0bec5' : '#4caf50';
        const foliageColor2 = isSnowing ? '#cfd8dc' : '#81c784';
        const foliageColor3 = isSnowing ? '#eceff1' : '#a5d6a7';

        // Bottom left foliage circle
        ctx.fillStyle = foliageColor1;
        ctx.beginPath();
        ctx.arc(tx - 14 * s, ty - 16 * s, 19 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Bottom right foliage circle
        ctx.fillStyle = foliageColor1;
        ctx.beginPath();
        ctx.arc(tx + 14 * s, ty - 16 * s, 19 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Center main foliage circle
        ctx.fillStyle = foliageColor2;
        ctx.beginPath();
        ctx.arc(tx, ty - 26 * s, 23 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cute curved glint highlight on top foliage
        ctx.strokeStyle = isSnowing ? '#ffffff' : foliageColor3;
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.arc(tx - 4 * s, ty - 32 * s, 14 * s, 1.1 * Math.PI, 1.7 * Math.PI);
        ctx.stroke();

        // Fluffy snow cap in winter
        if (isSnowing) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(tx, ty - 42 * s, 12 * s, 0, Math.PI * 2);
          ctx.arc(tx - 10 * s, ty - 36 * s, 9 * s, 0, Math.PI * 2);
          ctx.arc(tx + 10 * s, ty - 36 * s, 9 * s, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      // =========================================================
      // 5. TRAFFIC — functional vehicles on the road network
      //
      // Buses dwell at shelters, taxis cruise, service units run lights when
      // dispatched. Positions come from src/simulation/vehicleSystem.ts; this
      // loop only paints them (pausing freezes traffic with the city).
      // =========================================================
      TRAFFIC.visible(camLeft, camTop, camRight, camBottom).forEach(vehicle => {
        drawVehicle(ctx, vehicle, isNight, TRAFFIC.clock);
      });
      // =========================================================
      // 6. ARCHITECTURAL SKYLINE
      //
      // Every venue is drawn by src/render/architecture.ts so the whole city
      // obeys ONE set of massing, material, opening and signage rules instead
      // of a pile of pasted sprites. The renderer stays read-only: it only
      // samples simulation state (night, weather, who is inside).
      // =========================================================
      const homeOccupancy: Record<string, number> = {};
      const visitors: Record<string, number> = {};
      for (const agent of globalSimulation.agents) {
        if (agent.homeNodeId) {
          homeOccupancy[agent.homeNodeId] = (homeOccupancy[agent.homeNodeId] || 0) + 1;
        }
        if (agent.currentLocationId) {
          visitors[agent.currentLocationId] = (visitors[agent.currentLocationId] || 0) + 1;
        }
      }

      const buildingOpts = {
        isNight,
        isSnowing,
        smokeTimer,
        homeOccupancy,
        visitors,
        zoom,
        hoveredLocationId: hoveredBuildingRef.current
      };

      CITY_LOCATIONS.forEach(loc => {
        if (loc.type === 'park') return;
        if (!inFrustum(loc.x - 40, loc.y - 80, loc.width + 80, loc.height + 130)) return;
        drawBuilding(ctx, loc, buildingOpts);
      });

      // Labels are a second pass so a neighbour's roof never clips a plate.
      CITY_LOCATIONS.forEach(loc => {
        if (loc.type === 'park') return;
        if (!inFrustum(loc.x - 60, loc.y - 40, loc.width + 120, loc.height + 180)) return;
        drawBuildingLabel(ctx, loc, buildingOpts);
      });

      // =========================================================
      // 6.5 CITIZEN DENSITY / TRAFFIC HEATMAP
      //
      // The heatmap is pre-rendered into a low-resolution offscreen canvas and
      // only rebuilt when new traffic samples arrive. Drawing it is then a
      // single drawImage call per frame.
      // =========================================================
      if (globalSimulation.showDensityHeatmap) {
        const points = globalSimulation.trafficHistory;
        const totalWeight = points.reduce((acc, p) => acc + p.weight, 0);
        const signature = `${points.length}:${Math.round(totalWeight)}`;

        if (!heatmapCanvasRef.current || heatmapSignatureRef.current !== signature) {
          const off = heatmapCanvasRef.current ?? document.createElement('canvas');
          const scale = 0.25;
          off.width = Math.max(1, Math.floor(CITY_WIDTH * scale));
          off.height = Math.max(1, Math.floor(CITY_HEIGHT * scale));

          const hctx = off.getContext('2d');
          if (hctx) {
            hctx.clearRect(0, 0, off.width, off.height);
            const maxWeight = points.reduce((acc, p) => Math.max(acc, p.weight), 1);
            hctx.globalCompositeOperation = 'lighter';

            points.forEach(p => {
              const intensity = Math.min(1, p.weight / maxWeight);
              const radius = (10 + 20 * intensity) * scale * 2;
              const hue = 210 - 210 * intensity;
              const grad = hctx.createRadialGradient(
                p.x * scale, p.y * scale, 0,
                p.x * scale, p.y * scale, radius
              );
              grad.addColorStop(0, `hsla(${hue}, 100%, 60%, 0.55)`);
              grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
              hctx.fillStyle = grad;
              hctx.beginPath();
              hctx.arc(p.x * scale, p.y * scale, radius, 0, Math.PI * 2);
              hctx.fill();
            });

            hctx.globalCompositeOperation = 'source-over';
          }

          heatmapCanvasRef.current = off;
          heatmapSignatureRef.current = signature;
        }

        if (heatmapCanvasRef.current) {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(heatmapCanvasRef.current, 0, 0, CITY_WIDTH, CITY_HEIGHT);
          ctx.restore();
        }
      }

      // =========================================================
      // 7. ANIMATED CHIBI CHARACTERS (Agents)
      //
      // READ-ONLY: SimulationEngine's movement system owns agent.x/y, the
      // path cursor and walk cycle. The renderer only paints the current state,
      // so pausing the simulation freezes citizens too.
      // =========================================================
      globalSimulation.agents.forEach(agent => {
        // CULL OFF-SCREEN CITIZENS!
        if (!inFrustum(agent.x - 30, agent.y - 45, 60, 90)) return;

        ctx.save();
        const ax = agent.x;
        const ay = agent.y + agent.bobOffset;

        // Larger adult silhouettes make citizens readable at city overview;
        // children remain visibly smaller and both stay anchored at the feet.
        const characterScale = agent.isChild ? 0.55 : 0.95;
        ctx.translate(ax, ay + 12);
        ctx.scale(characterScale, characterScale);
        ctx.translate(-ax, -(ay + 12));

        // --- Human-life markers -------------------------------------------
        // Pregnancy is visible on the map: a soft halo and a badge, so the
        // reproduction cycle can be watched instead of guessed.
        if (agent.isPregnant) {
          const pulse = 0.5 + 0.5 * Math.sin(animClockMs * 0.003);
          ctx.fillStyle = `rgba(244, 114, 182, ${0.14 + pulse * 0.10})`;
          ctx.beginPath();
          ctx.arc(ax, ay + 4, 24 + pulse * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🤰', ax + 15, ay - 24);
        }
        // Detained citizens are held at the station, never in a shop queue.
        if (agent.jailedUntil != null && globalSimulation.time.day < agent.jailedUntil) {
          ctx.font = '11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🚔', ax - 15, ay - 24);
        }
        // Homelessness is visible: the city is telling you it must build.
        if (agent.housing === 'homeless') {
          const bob = Math.sin(animClockMs * 0.004 + agent.x) * 2;
          ctx.font = '12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('🏠❗', ax + 16, ay - 28 + bob);
        }

        // Moral Alignment Aura (Altruistic: emerald / Selfish: crimson)
        if (agent.moralAlignment === 'Altruistic') {
          ctx.fillStyle = 'rgba(76, 175, 80, 0.20)';
          ctx.beginPath();
          ctx.arc(ax, ay + 6, 22, 0, Math.PI * 2);
          ctx.fill();
        } else if (agent.moralAlignment === 'Selfish') {
          ctx.fillStyle = 'rgba(239, 83, 80, 0.20)';
          ctx.beginPath();
          ctx.arc(ax, ay + 6, 22, 0, Math.PI * 2);
          ctx.fill();
        }

        // Activity rings make the city legible even while zoomed out.
        const activityColor = agent.state === 'BUILDING' || agent.state === 'REPAIRING'
          ? '#f97316'
          : agent.state === 'CHATTING'
          ? '#a855f7'
          : agent.state === 'SLEEPING'
          ? '#6366f1'
          : agent.state === 'HEALING'
          ? '#14b8a6'
          : null;
        if (activityColor) {
          const pulse = 20 + Math.sin(animClockMs * 0.006 + agent.x) * 2;
          ctx.strokeStyle = activityColor;
          ctx.globalAlpha = 0.42;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ax, ay + 5, pulse, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        // Selected halo
        if (selectedAgentId === agent.id) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(ax, ay + 6, 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.beginPath();
          ctx.arc(ax, ay + 6, 26, 0, Math.PI * 2);
          ctx.fill();
        }

        // Soft drop shadow beneath chibi feet
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.beginPath();
        ctx.ellipse(ax, ay + 15, 14, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Umbrella in bad weather
        if (agent.isCarryingUmbrella) {
          ctx.fillStyle = isSnowing ? '#38bdf8' : agent.color;
          ctx.strokeStyle = OUTLINE_COLOR;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ax + 7, ay - 26, 18, Math.PI, 0);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(ax + 7, ay - 26);
          ctx.lineTo(ax + 7, ay - 6);
          ctx.stroke();
        }

        // Chibi Body / Clothes
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;

        if (agent.role === 'builder') {
          // Orange contractor vest
          ctx.fillStyle = '#ff9800';
          ctx.beginPath();
          ctx.roundRect(ax - 10, ay - 3, 20, 18, 7);
          ctx.fill();
          ctx.stroke();

          // Reflective silver vest stripes
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(ax - 7, ay + 2, 4, 10);
          ctx.fillRect(ax + 3, ay + 2, 4, 10);
        } else {
          // Colorful citizen coat
          ctx.fillStyle = agent.color;
          ctx.beginPath();
          ctx.roundRect(ax - 10, ay - 3, 20, 18, 7);
          ctx.fill();
          ctx.stroke();
        }

        // Pregnant mothers show a soft, glowing baby bump.
        if (agent.isPregnant) {
          ctx.fillStyle = 'rgba(255, 205, 220, 0.95)';
          ctx.strokeStyle = OUTLINE_COLOR;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(ax + (agent.facing === 'right' ? 4 : -4), ay + 7, 4.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Gentle glow pulse announcing the coming baby
          const bumpPulse = 0.35 + Math.sin(animClockMs * 0.004) * 0.15;
          ctx.fillStyle = `rgba(255, 148, 180, ${bumpPulse})`;
          ctx.beginPath();
          ctx.arc(ax + (agent.facing === 'right' ? 4 : -4), ay + 7, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        // Animated stepping shoes
        ctx.fillStyle = '#37474f';
        const legOffset = Math.sin(agent.walkCycle) * 3.5;
        ctx.beginPath();
        ctx.roundRect(ax - 8, ay + 13 + legOffset, 6, 6, 2);
        ctx.roundRect(ax + 2, ay + 13 - legOffset, 6, 6, 2);
        ctx.fill();
        ctx.stroke();

        // Round Chibi Head with peach skin
        ctx.fillStyle = '#ffe0b2';
        ctx.beginPath();
        ctx.arc(ax, ay - 9, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Builder Hardhat vs Winter Cap vs Hair
        if (agent.role === 'builder') {
          // Golden Hardhat
          ctx.fillStyle = '#fbc02d';
          ctx.beginPath();
          ctx.arc(ax, ay - 14, 12, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
          // Rim
          ctx.fillRect(ax - 14, ay - 14, 28, 4);
          ctx.strokeRect(ax - 14, ay - 14, 28, 4);
          // Headlamp
          ctx.fillStyle = '#fff59d';
          ctx.beginPath();
          ctx.arc(ax, ay - 16, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (isSnowing) {
          // Winter Pompom Beanie
          ctx.fillStyle = '#e53935';
          ctx.beginPath();
          ctx.arc(ax, ay - 13, 11, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(ax, ay - 24, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Dark Hair Cap
          ctx.fillStyle = '#263238';
          ctx.beginPath();
          ctx.arc(ax, ay - 13, 11, Math.PI, 0);
          ctx.fill();
          ctx.stroke();
        }

        // Animated Swinging Wooden Hammer for Builders
        if (agent.isCarryingHammer || agent.state === 'BUILDING' || agent.state === 'REPAIRING') {
          const hammerAngle = Math.sin(animClockMs * 0.012) * 0.45;
          ctx.save();
          ctx.translate(ax + (agent.facing === 'right' ? 14 : -14), ay + 4);
          ctx.rotate(hammerAngle);
          // Handle
          ctx.fillStyle = '#8d6e63';
          ctx.strokeStyle = OUTLINE_COLOR;
          ctx.lineWidth = 1.5;
          ctx.fillRect(-2, -12, 4, 14);
          ctx.strokeRect(-2, -12, 4, 14);
          // Head
          ctx.fillStyle = '#90a4ae';
          ctx.fillRect(-6, -16, 12, 6);
          ctx.strokeRect(-6, -16, 12, 6);
          ctx.restore();
        }

        // Expressive Chibi Eyes with White Gleam Pupils
        ctx.fillStyle = '#263238';
        const eyeOffset = agent.facing === 'right' ? 2 : -2;
        ctx.beginPath();
        ctx.arc(ax - 4 + eyeOffset, ay - 9, 2.2, 0, Math.PI * 2);
        ctx.arc(ax + 3 + eyeOffset, ay - 9, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Eye glint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax - 4.5 + eyeOffset, ay - 9.8, 0.8, 0, Math.PI * 2);
        ctx.arc(ax + 2.5 + eyeOffset, ay - 9.8, 0.8, 0, Math.PI * 2);
        ctx.fill();

        // A tiny state-aware mouth gives each citizen a readable expression.
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (agent.stats.mood >= 65 || agent.state === 'CHATTING' || agent.state === 'RELAXING') {
          ctx.arc(ax + eyeOffset, ay - 4, 3.1, 0.12 * Math.PI, 0.88 * Math.PI);
        } else if (agent.stats.mood < 35 || agent.stats.energy < 25) {
          ctx.arc(ax + eyeOffset, ay - 1.5, 3.1, 1.12 * Math.PI, 1.88 * Math.PI);
        } else if (agent.state === 'SLEEPING') {
          ctx.moveTo(ax - 2 + eyeOffset, ay - 4);
          ctx.lineTo(ax + 3 + eyeOffset, ay - 4);
        } else {
          ctx.arc(ax + eyeOffset, ay - 5, 2.2, 0.2 * Math.PI, 0.8 * Math.PI);
        }
        ctx.stroke();

        // Mood blushes / tired under-eyes enrich close-up character reads.
        if (agent.stats.mood >= 72) {
          ctx.fillStyle = 'rgba(244, 114, 182, 0.42)';
          ctx.beginPath();
          ctx.arc(ax - 7 + eyeOffset, ay - 5.5, 2.2, 0, Math.PI * 2);
          ctx.arc(ax + 7 + eyeOffset, ay - 5.5, 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (agent.stats.energy < 30) {
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.72)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(ax - 6 + eyeOffset, ay - 5.3);
          ctx.lineTo(ax - 2 + eyeOffset, ay - 5.3);
          ctx.moveTo(ax + 1 + eyeOffset, ay - 5.3);
          ctx.lineTo(ax + 5 + eyeOffset, ay - 5.3);
          ctx.stroke();
        }

        // Cute Thought Emote Bubble
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(ax - 14, ay - 38, 28, 20, 10);
        ctx.fill();
        ctx.stroke();

        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(agent.thoughtEmoji || agent.avatarEmoji, ax, ay - 24);

        // Cute Name Tag Pill below feet
        const tagText = agent.role === 'builder' 
          ? `👷 L${agent.level} ${agent.name.split(' ')[0]}`
          : `${agent.moralAlignment === 'Altruistic' ? '💚 ' : agent.moralAlignment === 'Selfish' ? '🪙 ' : ''}${agent.name.split(' ')[0]}`;
        
        ctx.font = 'bold 10px system-ui, sans-serif';
        const tagW = ctx.measureText(tagText).width + 12;
        
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(ax - tagW / 2, ay + 21, tagW, 16, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = OUTLINE_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText(tagText, ax, ay + 33);

        ctx.restore();
      });

      // =========================================================
      // 7.4 CRIME SCENES & LIFE MOMENTS
      //
      // A crime is not only a notification: the scene is marked on the map
      // (pulsing red beacon, "REPORTED" until an officer is on the way, then
      // "POLICE"), and births float a short-lived badge over the family home.
      // =========================================================
      JUSTICE.incidents
        .filter(incident => incident.status !== 'resolved')
        .forEach(incident => {
          const place = CITY_LOCATIONS.find(l => l.id === incident.locationId);
          if (!place) return;
          const bx = place.door.x;
          const by = place.door.y;
          if (!inFrustum(bx - 60, by - 90, 120, 140)) return;

          const pulse = 0.5 + 0.5 * Math.sin(animClockMs * 0.006);
          ctx.fillStyle = `rgba(239, 68, 68, ${0.14 + pulse * 0.16})`;
          ctx.beginPath();
          ctx.arc(bx, by, 34 + pulse * 6, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(bx, by, 22 + pulse * 4, 0, Math.PI * 2);
          ctx.stroke();

          const label = incident.status === 'responding' ? '🚨 POLICE' : '⚠️ REPORTED';
          ctx.font = 'bold 10px system-ui, sans-serif';
          const chipW = ctx.measureText(label).width + 18;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.beginPath();
          ctx.roundRect(bx - chipW / 2, by - 74, chipW, 20, 10);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, bx, by - 64);
          ctx.textBaseline = 'alphabetic';
        });

      globalSimulation.celebrations.forEach(celebration => {
        if (!inFrustum(celebration.x - 40, celebration.y - 90, 80, 110)) return;
        const age = Math.min(1, Math.max(0, 1 - (celebration.until - Date.now()) / 9000));
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age);
        ctx.font = '22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(celebration.icon, celebration.x, celebration.y - 42 - age * 30);
        ctx.restore();
      });

      // =========================================================
      // 7.5 CITY EVENT MOMENT — a compact, animated world-space banner
      // =========================================================
      if (globalSimulation.activeEvent && inFrustum(1370, 710, 460, 92)) {
        const event = globalSimulation.activeEvent;
        const eventPulse = 0.75 + Math.sin(animClockMs * 0.004) * 0.15;
        const eventColors: Record<string, [string, string]> = {
          rainstorm: ['#0ea5e9', '#1e3a8a'],
          snowstorm: ['#93c5fd', '#4f46e5'],
          coffee_promo: ['#fb923c', '#9a3412'],
          power_outage: ['#facc15', '#7c2d12'],
          festival: ['#f472b6', '#7c3aed'],
          city_decree: ['#38bdf8', '#1d4ed8'],
        };
        const [eventStart, eventEnd] = eventColors[event.type] ?? ['#64748b', '#334155'];
        const eventX = 1600;
        const eventY = 748;
        const eventGradient = ctx.createLinearGradient(eventX - 210, eventY, eventX + 210, eventY);
        eventGradient.addColorStop(0, eventStart);
        eventGradient.addColorStop(1, eventEnd);

        ctx.save();
        ctx.globalAlpha = eventPulse;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.beginPath();
        ctx.roundRect(eventX - 208, eventY - 28, 416, 56, 24);
        ctx.fill();
        ctx.fillStyle = eventGradient;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(eventX - 212, eventY - 32, 416, 56, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 17px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${event.icon}  ${event.name.toUpperCase()}  •  ${Math.max(0, event.duration)}m`, eventX, eventY + 5);

        // Animated celebratory particles tether the current event to the map.
        for (let spark = 0; spark < 8; spark++) {
          const angle = animClockMs * 0.0015 + spark * (Math.PI / 4);
          const radius = 225 + Math.sin(animClockMs * 0.003 + spark) * 9;
          ctx.fillStyle = spark % 2 === 0 ? '#ffffff' : '#fde68a';
          ctx.beginPath();
          ctx.arc(eventX + Math.cos(angle) * radius, eventY + Math.sin(angle) * 25, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // =========================================================
      // 8. VECTOR POP-UP SPEECH BUBBLES
      // =========================================================
      const now = Date.now();
      globalSimulation.activeSpeechBubbles.forEach((bubble: SpeechBubble) => {
        const speaker = globalSimulation.agents.find(a => a.id === bubble.speakerId);
        if (!speaker) return;
        if (!inFrustum(speaker.x - 150, speaker.y - 120, 300, 100)) return;

        const age = now - bubble.startTime;
        const progress = age / bubble.duration;
        if (progress > 1) return;

        let alpha = 1;
        if (progress > 0.8) alpha = (1 - progress) / 0.2;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        const bx = speaker.x;
        const by = speaker.y - 48;

        ctx.font = '600 12px system-ui, sans-serif';
        const textMetrics = ctx.measureText(bubble.text);
        const padding = 12;
        const bWidth = Math.min(270, Math.max(130, textMetrics.width + padding * 2));
        
        const words = bubble.text.split(' ');
        const lines: string[] = [];
        let curLine = '';
        words.forEach(w => {
          const test = curLine ? `${curLine} ${w}` : w;
          if (ctx.measureText(test).width < bWidth - padding * 2) {
            curLine = test;
          } else {
            lines.push(curLine);
            curLine = w;
          }
        });
        if (curLine) lines.push(curLine);

        const lineH = 16;
        const bHeight = lines.length * lineH + 20;
        const boxLeft = Math.max(20, Math.min(CITY_WIDTH - bWidth - 20, bx - bWidth / 2));
        const boxTop = by - bHeight;

        // Bubble drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.beginPath();
        ctx.roundRect(boxLeft + 3, boxTop + 3, bWidth, bHeight, 14);
        ctx.fill();

        // Rounded White Speech Bubble
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.beginPath();
        ctx.roundRect(boxLeft, boxTop, bWidth, bHeight, 14);
        ctx.fill();
        ctx.stroke();

        // Downward pointer arrow
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(bx - 7, boxTop + bHeight);
        ctx.lineTo(bx + 7, boxTop + bHeight);
        ctx.lineTo(bx, boxTop + bHeight + 8);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(bx - 7, boxTop + bHeight);
        ctx.lineTo(bx, boxTop + bHeight + 8);
        ctx.lineTo(bx + 7, boxTop + bHeight);
        ctx.stroke();

        // Text inside speech bubble
        ctx.fillStyle = OUTLINE_COLOR;
        ctx.textAlign = 'left';
        lines.forEach((line, lIdx) => {
          ctx.fillText(line, boxLeft + padding, boxTop + 18 + lIdx * lineH);
        });

        ctx.restore();
      });

      // =========================================================
      // 9. DYNAMIC WEATHER FX (Rain streaks, ripples, snow)
      // =========================================================
      if (isRaining) {
        ctx.strokeStyle = 'rgba(129, 212, 250, 0.75)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();

        particlesRef.current.rain.forEach(drop => {
          if (!paused) {
            drop.y += drop.speed * motionScale;
            drop.x -= drop.speed * drop.angle * motionScale;
            if (drop.y > CITY_HEIGHT) {
              drop.y = -15;
              drop.x = Math.random() * (CITY_WIDTH + 300);
            }
          }
          if (inFrustum(drop.x, drop.y, 4, drop.len)) {
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x - 4, drop.y + drop.len);
          }
        });
        ctx.stroke();
      }

      if (isSnowing) {
        const isBlizzard = weather === 'blizzard';
        const windX = isBlizzard ? -2.2 : -0.6;
        const speedMult = isBlizzard ? 2.2 : 1.0;

        particlesRef.current.snow.forEach(flake => {
          if (!paused) {
            flake.y += flake.speed * speedMult * motionScale;
            flake.wobble += flake.wobbleSpeed * frameScale;
            flake.x += (Math.sin(flake.wobble) * 1.5 + windX) * motionScale;

            if (flake.y > CITY_HEIGHT) {
              flake.y = -10;
              flake.x = Math.random() * (CITY_WIDTH + 350);
            }
          }

          if (inFrustum(flake.x, flake.y, flake.radius, flake.radius)) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
            ctx.beginPath();
            ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }

      // =========================================================
      // 10. DAY / NIGHT LIGHTING & AMBIENT CLOUDS
      // =========================================================
      const timeOfDay = globalSimulation.time.timeOfDay;
      const light = globalSimulation.time.lightLevel;

      if (isRaining) {
        // Soft raincloud wash
        ctx.fillStyle = 'rgba(38, 50, 56, 0.25)';
        ctx.fillRect(camLeft, camTop, viewW / zoom + 2 * margin, viewH / zoom + 2 * margin);
      }

      if (timeOfDay === 'sunset') {
        ctx.fillStyle = `rgba(251, 140, 0, ${0.25 * (1 - light)})`;
        ctx.fillRect(camLeft, camTop, viewW / zoom + 2 * margin, viewH / zoom + 2 * margin);
      } else if (timeOfDay === 'dawn') {
        ctx.fillStyle = `rgba(255, 238, 88, ${0.12 * (1 - light)})`;
        ctx.fillRect(camLeft, camTop, viewW / zoom + 2 * margin, viewH / zoom + 2 * margin);
      } else if (timeOfDay === 'night') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.52)';
        ctx.fillRect(camLeft, camTop, viewW / zoom + 2 * margin, viewH / zoom + 2 * margin);
      }

      ctx.restore();

      // =========================================================
      // 11. RENDER MINIMAP RADAR
      // =========================================================
      const miniCanvas = minimapCanvasRef.current;
      if (miniCanvas) {
        const mctx = miniCanvas.getContext('2d');
        if (mctx) {
          const mw = miniCanvas.width;
          const mh = miniCanvas.height;
          const sx = mw / CITY_WIDTH;
          const sy = mh / CITY_HEIGHT;

          mctx.clearRect(0, 0, mw, mh);

          // Minimap Terrain
          mctx.fillStyle = isSnowing ? DRAWING_COLORS.terrain.grass.snow : DRAWING_COLORS.terrain.grass.base;
          mctx.fillRect(0, 0, mw, mh);

          // District colored sectors (same shared DISTRICT_RECTS as the main map)
          CITY_DISTRICTS.forEach(d => {
            const drect = DISTRICT_RECTS[d.id];
            if (!drect) return;
            mctx.fillStyle = d.color + '25';
            mctx.fillRect(drect.x * sx, drect.y * sy, drect.w * sx, drect.h * sy);
          });

          // Arterial Roads
          mctx.fillStyle = DRAWING_COLORS.terrain.asphalt.base;
          mctx.fillRect((WEST_AVENUE - 40) * sx, 0, 80 * sx, mh);
          mctx.fillRect((EAST_AVENUE - 40) * sx, 0, 80 * sx, mh);
          mctx.fillRect(0, (NORTH_AVENUE - 40) * sy, mw, 80 * sy);
          mctx.fillRect(0, (SOUTH_AVENUE - 40) * sy, mw, 80 * sy);
          ROADS.streets.horizontal.forEach(road => {
            mctx.fillRect(road.x1 * sx, (road.y - 16) * sy, (road.x2 - road.x1) * sx, 32 * sy);
          });
          ROADS.streets.vertical.forEach(road => {
            mctx.fillRect((road.x - 16) * sx, road.y1 * sy, 32 * sx, (road.y2 - road.y1) * sy);
          });

          // Park Lagoon
          mctx.fillStyle = isSnowing ? DRAWING_COLORS.terrain.water.snowSurface : DRAWING_COLORS.terrain.water.surface;
          mctx.beginPath();
          mctx.ellipse(1600 * sx, 1250 * sy, 290 * sx, 210 * sy, 0, 0, Math.PI * 2);
          mctx.fill();

          // Buildings
          CITY_LOCATIONS.forEach(loc => {
            if (loc.type === 'park') return;
            mctx.fillStyle = loc.accentColor;
            mctx.fillRect(loc.x * sx, loc.y * sy, loc.width * sx, loc.height * sy);
          });

          // Citizens dots
          globalSimulation.agents.forEach(agent => {
            mctx.fillStyle = agent.color;
            mctx.beginPath();
            mctx.arc(agent.x * sx, agent.y * sy, selectedAgentId === agent.id ? 4.5 : 2.5, 0, Math.PI * 2);
            mctx.fill();
          });

          // Camera Viewport Box on Radar
          const camBoxX = -cameraRef.current.x / zoom;
          const camBoxY = -cameraRef.current.y / zoom;
          const camBoxW = viewW / zoom;
          const camBoxH = viewH / zoom;

          mctx.strokeStyle = '#f59e0b';
          mctx.lineWidth = 1.6;
          mctx.strokeRect(camBoxX * sx, camBoxY * sy, camBoxW * sx, camBoxH * sy);
          mctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
          mctx.fillRect(camBoxX * sx, camBoxY * sy, camBoxW * sx, camBoxH * sy);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [selectedAgentId]);

  // -------------------------------------------------------------
  // MOUSE & WHEEL INTERACTION HANDLERS
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const camera = cameraRef.current;
      const newZoom = Math.min(Math.max(camera.zoom * zoomFactor, camera.minZoom), camera.maxZoom);

      camera.x = mouseX - (mouseX - camera.x) * (newZoom / camera.zoom);
      camera.y = mouseY - (mouseY - camera.y) * (newZoom / camera.zoom);
      camera.zoom = newZoom;

      setZoomLevel(Math.round(newZoom * 100));
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 || e.button === 1) {
      cameraRef.current.isDragging = true;
      cameraRef.current.hasDragged = false;
      cameraRef.current.mouseDownPos = { x: e.clientX, y: e.clientY };
      cameraRef.current.dragStart = { 
        x: e.clientX - cameraRef.current.x, 
        y: e.clientY - cameraRef.current.y 
      };
    }
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!cameraRef.current.isDragging) return;

      const dx = e.clientX - cameraRef.current.mouseDownPos.x;
      const dy = e.clientY - cameraRef.current.mouseDownPos.y;
      if (Math.hypot(dx, dy) > 4) {
        cameraRef.current.hasDragged = true;
      }

      cameraRef.current.x = e.clientX - cameraRef.current.dragStart.x;
      cameraRef.current.y = e.clientY - cameraRef.current.dragStart.y;
    };

    const handleWindowMouseUp = () => {
      cameraRef.current.isDragging = false;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (cameraRef.current.isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left - cameraRef.current.x) / cameraRef.current.zoom;
    const mouseY = (e.clientY - rect.top - cameraRef.current.y) / cameraRef.current.zoom;

    const hoveredAgent = globalSimulation.agents.find(a => {
      return Math.hypot(a.x - mouseX, a.y - mouseY) < 25;
    });

    if (hoveredAgent) {
      hoveredBuildingRef.current = null;
      setHoveredEntity(`agent:${hoveredAgent.id}`);
      return;
    }

    const hoveredBuilding = CITY_LOCATIONS.find(loc => {
      return (
        mouseX >= loc.x &&
        mouseX <= loc.x + loc.width &&
        mouseY >= loc.y &&
        mouseY <= loc.y + loc.height
      );
    });

    if (hoveredBuilding) {
      hoveredBuildingRef.current = hoveredBuilding.id;
      setHoveredEntity(`building:${hoveredBuilding.id}`);
      return;
    }

    hoveredBuildingRef.current = null;
    setHoveredEntity(null);
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (cameraRef.current.hasDragged) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - cameraRef.current.x) / cameraRef.current.zoom;
    const clickY = (e.clientY - rect.top - cameraRef.current.y) / cameraRef.current.zoom;

    const clickedAgent = globalSimulation.agents.find(a => {
      return Math.hypot(a.x - clickX, a.y - clickY) < 26;
    });

    if (clickedAgent) {
      soundEngine.playClickSound();
      onSelectAgent(clickedAgent.id);
      return;
    }

    const clickedBuilding = CITY_LOCATIONS.find(loc => {
      return (
        clickX >= loc.x &&
        clickX <= loc.x + loc.width &&
        clickY >= loc.y &&
        clickY <= loc.y + loc.height
      );
    });

    if (clickedBuilding) {
      soundEngine.playClickSound();
      if (onSelectLocation) {
        onSelectLocation(clickedBuilding.id);
      }
      return;
    }

    onSelectAgent(null);
  };

  const zoomIn = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const camera = cameraRef.current;
    const newZoom = Math.min(camera.maxZoom, camera.zoom * 1.25);
    camera.x = centerX - (centerX - camera.x) * (newZoom / camera.zoom);
    camera.y = centerY - (centerY - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
    setZoomLevel(Math.round(newZoom * 100));
  };

  const zoomOut = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const camera = cameraRef.current;
    const newZoom = Math.max(camera.minZoom, camera.zoom * 0.8);
    camera.x = centerX - (centerX - camera.x) * (newZoom / camera.zoom);
    camera.y = centerY - (centerY - camera.y) * (newZoom / camera.zoom);
    camera.zoom = newZoom;
    setZoomLevel(Math.round(newZoom * 100));
  };

  const handleMinimapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const mini = minimapCanvasRef.current;
    const canvas = canvasRef.current;
    if (!mini || !canvas) return;

    const rect = mini.getBoundingClientRect();
    const clickMx = e.clientX - rect.left;
    const clickMy = e.clientY - rect.top;

    const targetWorldX = (clickMx / rect.width) * CITY_WIDTH;
    const targetWorldY = (clickMy / rect.height) * CITY_HEIGHT;

    const viewW = canvas.clientWidth;
    const viewH = canvas.clientHeight;
    cameraRef.current.x = viewW / 2 - targetWorldX * cameraRef.current.zoom;
    cameraRef.current.y = viewH / 2 - targetWorldY * cameraRef.current.zoom;
    soundEngine.playClickSound();
  };

  return (
    <div className="relative w-full h-full flex-1 overflow-hidden bg-slate-900 select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        className={`w-full h-full block ${hoveredEntity ? 'cursor-pointer' : cameraRef.current.isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      />

      {/* Top District Quick-Navigation Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden md:flex items-center gap-1.5 p-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-2xl">
        <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span>Districts:</span>
        </span>
        {CITY_DISTRICTS.map(dist => (
          <button
            key={dist.id}
            onClick={() => jumpToDistrict(dist.id)}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeDistrictFilter === dist.id
                ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dist.color }} />
            <span>{dist.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Floating Canvas Camera Controls (Top Right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1 p-1 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-700/80 shadow-xl text-slate-200 z-20">
        <button
          onClick={zoomOut}
          title="Zoom Out"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-mono font-medium px-1 text-slate-300 tabular-nums min-w-[2.8rem] text-center">
          {zoomLevel}%
        </span>
        <button
          onClick={zoomIn}
          title="Zoom In"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-3.5 bg-slate-700 mx-0.5" />
        <button
          onClick={centerCamera}
          title="Fit Whole Metropolis (3200x2432)"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Real-Scale Specs & Active Citizen Count (Top Left) */}
      <div className="absolute top-4 left-4 pointer-events-none hidden sm:flex items-center gap-3 px-3 py-1.5 bg-slate-900/85 backdrop-blur-md rounded-lg border border-slate-700/70 text-xs text-slate-300 shadow-md z-20">
        <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
          <Navigation className="w-3.5 h-3.5" />
          <span>3200 × 2400</span>
        </div>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400 font-mono">6 Districts</span>
        <span className="text-slate-600">·</span>
        <span className="text-emerald-400 font-bold font-mono">
          {globalSimulation.agents.length} Citizens
        </span>
      </div>

      {/* Floating Interactive MiniMap / Radar HUD (Fixed Bottom Right, Collapsible) */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end">
        {!isMiniMapExpanded ? (
          <button
            onClick={() => setIsMiniMapExpanded(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl shadow-xl text-xs font-semibold backdrop-blur-md transition-all"
            title="Expand Metropolis Radar"
          >
            <MapIcon className="w-3.5 h-3.5 text-amber-400" />
            <span>Radar</span>
          </button>
        ) : (
          <div className="flex flex-col bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden transition-all duration-150">
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-xs text-slate-300">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <MapIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Radar</span>
              </div>
              <button
                onClick={() => setIsMiniMapExpanded(false)}
                className="p-0.5 hover:text-white text-slate-400 transition-colors"
                title="Collapse Radar"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-1.5 flex flex-col gap-1">
              <div className="relative border border-slate-700/60 rounded-lg overflow-hidden cursor-crosshair shadow-inner">
                <canvas
                  ref={minimapCanvasRef}
                  width={180}
                  height={135}
                  onClick={handleMinimapClick}
                  className="w-[180px] h-[135px] block"
                  title="Click anywhere to pan camera"
                />
              </div>
              <div className="flex items-center justify-between text-[9px] text-slate-400 px-0.5">
                <span>Click to jump</span>
                <span className="text-amber-400 font-mono">{globalSimulation.agents.length} Citizens</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Citizen Density Heatmap Legend */}
      {globalSimulation.showDensityHeatmap && (
        <div className="absolute top-16 right-4 flex flex-col gap-2 p-3 bg-slate-900/95 backdrop-blur-md rounded-xl border border-amber-500/50 shadow-2xl text-xs text-slate-200 z-20 max-w-xs animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 font-bold text-amber-400">
              <Flame className="w-4 h-4 fill-amber-400 animate-pulse" />
              <span>Metropolis Density Heatmap</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-950/70 text-amber-300 border border-amber-600/40 rounded">
              10-Min Window
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-snug">
            Real-time thermal density tracking 40+ citizens across all 6 districts.
          </p>

          <div className="space-y-1 pt-1">
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-500 shadow-inner" />
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
              <span>Light Transit</span>
              <span>Active Flow</span>
              <span className="text-rose-400 font-semibold">Social Hub</span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px] text-slate-400">
            <span>Logged Footprints:</span>
            <span className="font-mono text-amber-300 font-semibold tabular-nums">
              {globalSimulation.trafficHistory.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
