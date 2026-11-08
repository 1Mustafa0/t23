/**
 * ============================================================================
 *  VEHICLE RENDERER — top-down, purpose-built vehicles
 * ============================================================================
 *
 *  No sprites: every vehicle is drawn from its function. A bus reads as a bus
 *  (long body, side window band, destination board, double doors), an
 *  ambulance carries a cross and a light bar, fire runs a ladder on the roof,
 *  vans/trucks show a separate cargo box, and private cars get a cabin,
 *  windscreen and headlamps.
 *
 *  Orientation comes from the traffic system: +x is the nose before rotation.
 */
import { TrafficVehicle } from '../simulation/vehicleSystem';

const INK = '#1f2a37';

interface Dims {
  length: number;
  width: number;
}

const DIMS: Record<TrafficVehicle['kind'], Dims> = {
  car: { length: 58, width: 22 },
  taxi: { length: 58, width: 22 },
  bus: { length: 126, width: 30 },
  police: { length: 62, width: 22 },
  ambulance: { length: 72, width: 24 },
  fire: { length: 96, width: 28 },
  van: { length: 70, width: 24 },
  truck: { length: 100, width: 28 },
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wheels(ctx: CanvasRenderingContext2D, dims: Dims): void {
  const { length: L, width: W } = dims;
  ctx.fillStyle = '#1b2430';
  const ww = 9;
  const wh = 4.5;
  const positions: Array<[number, number]> = [
    [-L / 2 + 9, -W / 2 - wh / 2 + 1],
    [L / 2 - 14, -W / 2 - wh / 2 + 1],
    [-L / 2 + 9, W / 2 - wh / 2 - 1],
    [L / 2 - 14, W / 2 - wh / 2 - 1],
  ];
  for (const [wx, wy] of positions) {
    roundRect(ctx, wx, wy, ww, wh, 2);
    ctx.fill();
  }
}

function headlights(ctx: CanvasRenderingContext2D, dims: Dims, isNight: boolean): void {
  const { length: L, width: W } = dims;
  ctx.fillStyle = isNight ? '#fff7cc' : '#e6eef5';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  [-1, 1].forEach(side => {
    roundRect(ctx, L / 2 - 4, side * (W / 2 - 6) - 3, 4, 6, 1.5);
    ctx.fill();
    ctx.stroke();
  });

  if (isNight) {
    const glow = ctx.createRadialGradient(L / 2 + 2, 0, 2, L / 2 + 2, 0, 54);
    glow.addColorStop(0, 'rgba(255, 244, 196, 0.30)');
    glow.addColorStop(1, 'rgba(255, 244, 196, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(L / 2, -W / 2 + 2);
    ctx.lineTo(L / 2 + 56, -W * 0.9);
    ctx.lineTo(L / 2 + 56, W * 0.9);
    ctx.lineTo(L / 2, W / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }
}

function tailLights(ctx: CanvasRenderingContext2D, dims: Dims, braking: boolean): void {
  const { length: L, width: W } = dims;
  ctx.fillStyle = braking ? '#ff2d2d' : '#b91c1c';
  [-1, 1].forEach(side => {
    roundRect(ctx, -L / 2 + 1, side * (W / 2 - 7) - 2.5, 3, 5, 1);
    ctx.fill();
  });
  if (braking) {
    ctx.fillStyle = 'rgba(255, 45, 45, 0.25)';
    ctx.beginPath();
    ctx.ellipse(-L / 2 - 6, 0, 10, W * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function lightBar(ctx: CanvasRenderingContext2D, dims: Dims, clock: number, emergency: boolean): void {
  const { length: L, width: W } = dims;
  const flashing = Math.floor(clock / 220) % 2 === 0;
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -6, -W / 2 + 4, 12, W - 8, 2);
  ctx.fill();
  ctx.fillStyle = !emergency ? '#334155' : flashing ? '#ef4444' : '#3b82f6';
  roundRect(ctx, -5, -W / 2 + 5, 5, W - 10, 1.5);
  ctx.fill();
  ctx.fillStyle = !emergency ? '#334155' : flashing ? '#3b82f6' : '#ef4444';
  roundRect(ctx, 0, -W / 2 + 5, 5, W - 10, 1.5);
  ctx.fill();

  if (emergency && flashing) {
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, L * 0.9);
    glow.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
    glow.addColorStop(0.5, 'rgba(59, 130, 246, 0.22)');
    glow.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, L * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  void L;
}

function windowsBand(ctx: CanvasRenderingContext2D, dims: Dims, from: number, to: number): void {
  const { width: W } = dims;
  ctx.fillStyle = 'rgba(168, 214, 233, 0.92)';
  ctx.strokeStyle = 'rgba(31, 42, 55, 0.5)';
  ctx.lineWidth = 0.8;
  [-1, 1].forEach(side => {
    roundRect(ctx, from, side * (W / 2 - 4.5) - 2, to - from, 4, 1.2);
    ctx.fill();
    ctx.stroke();
  });
}

/** Draw one vehicle in world space. */
export function drawVehicle(
  ctx: CanvasRenderingContext2D,
  vehicle: TrafficVehicle,
  isNight: boolean,
  clock: number,
): void {
  const dims = DIMS[vehicle.kind];
  const { length: L, width: W } = dims;

  // Drop shadow, offset in screen space so it does not rotate with the body.
  ctx.save();
  ctx.translate(vehicle.x + 3, vehicle.y + 4);
  ctx.rotate(vehicle.heading);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.20)';
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(vehicle.x, vehicle.y);
  ctx.rotate(vehicle.heading);

  wheels(ctx, dims);

  const body = vehicle.color;
  ctx.fillStyle = body;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.stroke();

  // Roof highlight: a lighter inset panel gives the body some volume.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, -L / 2 + 5, -W / 2 + 4, L - 10, W - 8, 4);
  ctx.fill();

  if (vehicle.kind === 'bus') {
    windowsBand(ctx, dims, -L / 2 + 10, L / 2 - 16);
    // Destination board.
    ctx.fillStyle = '#0f172a';
    roundRect(ctx, L / 2 - 15, -W / 2 + 4, 12, 9, 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.font = '5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L1', L / 2 - 9, -W / 2 + 8.5);
    ctx.textBaseline = 'alphabetic';
    // Double doors on the kerb side.
    ctx.fillStyle = 'rgba(31, 42, 55, 0.55)';
    ctx.fillRect(L / 2 - 40, W / 2 - 3, 14, 4);
    ctx.fillRect(-L / 2 + 16, W / 2 - 3, 14, 4);
  } else if (vehicle.kind === 'taxi') {
    ctx.fillStyle = '#111827';
    roundRect(ctx, -7, -5, 14, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 0, 0.5);
    ctx.textBaseline = 'alphabetic';
    // Checker band.
    ctx.fillStyle = '#111827';
    for (let i = 0; i < 4; i++) ctx.fillRect(-L / 2 + 8 + i * 8, -W / 2 + 1, 4, 3);
  } else if (vehicle.kind === 'police') {
    windowsBand(ctx, dims, -L / 2 + 8, L / 2 - 12);
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, -L / 2 + 2, -W / 2 + 1, L - 4, 4, 1);
    ctx.fill();
    lightBar(ctx, dims, clock, vehicle.emergency);
  } else if (vehicle.kind === 'ambulance') {
    windowsBand(ctx, dims, -L / 2 + 6, L / 2 - 16);
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(-6, -3, 12, 6);
    ctx.fillRect(-3, -6, 6, 12);
    lightBar(ctx, dims, clock, vehicle.emergency);
  } else if (vehicle.kind === 'fire') {
    windowsBand(ctx, dims, L / 2 - 26, L / 2 - 12);
    // Ladder rails on the roof.
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L / 2 + 8, -5);
    ctx.lineTo(L / 2 - 22, -5);
    ctx.moveTo(-L / 2 + 8, 5);
    ctx.lineTo(L / 2 - 22, 5);
    ctx.stroke();
    for (let x = -L / 2 + 12; x < L / 2 - 22; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, -5);
      ctx.lineTo(x, 5);
      ctx.stroke();
    }
    lightBar(ctx, dims, clock, vehicle.emergency);
  } else if (vehicle.kind === 'van' || vehicle.kind === 'truck') {
    // Cab + separate cargo box.
    ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
    roundRect(ctx, -L / 2 + 4, -W / 2 + 3, L * 0.55, W - 6, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(168, 214, 233, 0.9)';
    roundRect(ctx, L / 2 - 18, -W / 2 + 4, 8, W - 8, 2);
    ctx.fill();
  } else {
    // Private car: cabin + windscreen.
    ctx.fillStyle = 'rgba(168, 214, 233, 0.94)';
    roundRect(ctx, -L / 2 + 14, -W / 2 + 4, 10, W - 8, 2);
    ctx.fill();
    roundRect(ctx, L / 2 - 19, -W / 2 + 4, 9, W - 8, 2);
    ctx.fill();
  }

  headlights(ctx, dims, isNight);
  tailLights(ctx, dims, false);

  ctx.restore();
}
