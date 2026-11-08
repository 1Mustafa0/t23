/**
 * ============================================================================
 *  GROUND — the city's meadow, without the checkerboard
 * ============================================================================
 *
 *  The old ground was a 100 px chessboard, which read as a placeholder texture.
 *  This module paints a calm lawn with no visible tiling:
 *
 *    1. a vertical tonal gradient (sun overhead)
 *    2. broad MOWING STRIPES at very low contrast — an intentional park
 *       pattern instead of a grid
 *    3. soft radial light/shade patches (gradients fade to transparent, so no
 *       circle edge ever appears)
 *    4. fine speckle + the occasional grass tuft and daisy, seeded per cell so
 *       the meadow is identical every frame
 *
 *  Everything is deterministic and culled to the visible rectangle.
 */

export interface GroundOptions {
  isSnowing: boolean;
  view: { x0: number; y0: number; x1: number; y1: number };
}

const WORLD_W = 3200;
const WORLD_H = 2432;

function hash2(x: number, y: number, salt = 0): number {
  let h = 2166136261 ^ Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function onCarriageway(x: number, y: number): boolean {
  if (Math.abs(x - 1024) < 66 || Math.abs(x - 2176) < 66) return true;
  if (Math.abs(y - 448) < 66 || Math.abs(y - 1856) < 66) return true;
  return false;
}

export function drawGround(ctx: CanvasRenderingContext2D, opts: GroundOptions): void {
  const { view, isSnowing } = opts;
  const x0 = Math.max(0, view.x0);
  const y0 = Math.max(0, view.y0);
  const x1 = Math.min(WORLD_W, view.x1);
  const y1 = Math.min(WORLD_H, view.y1);
  if (x1 <= x0 || y1 <= y0) return;

  // 1. Base gradient -------------------------------------------------------
  const base = ctx.createLinearGradient(0, y0, 0, y1);
  if (isSnowing) {
    base.addColorStop(0, '#eef4f9');
    base.addColorStop(0.55, '#e6eef5');
    base.addColorStop(1, '#dbe6ef');
  } else {
    base.addColorStop(0, '#a4d16b');
    base.addColorStop(0.55, '#9ac95f');
    base.addColorStop(1, '#8dbf56');
  }
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  // 2. Mowing stripes — a park pattern, not a grid -------------------------
  const stripe = 150;
  const bandStart = Math.floor(y0 / stripe) * stripe;
  for (let sy = bandStart; sy < y1 + stripe; sy += stripe * 2) {
    ctx.fillStyle = isSnowing ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.035)';
    ctx.fillRect(x0, sy, x1 - x0, stripe);
  }

  // 3. Soft light / shade patches (radial gradients fade to nothing) --------
  const CELL = 620;
  const startX = Math.floor(x0 / CELL) - 1;
  const startY = Math.floor(y0 / CELL) - 1;
  const endX = Math.ceil(x1 / CELL) + 1;
  const endY = Math.ceil(y1 / CELL) + 1;

  for (let gx = startX; gx <= endX; gx++) {
    for (let gy = startY; gy <= endY; gy++) {
      const h1 = hash2(gx, gy, 1);
      const h2 = hash2(gx, gy, 2);
      const h3 = hash2(gx, gy, 3);

      const cx = gx * CELL + h1 * CELL;
      const cy = gy * CELL + h2 * CELL;
      const radius = 300 + h3 * 320;
      const warm = h2 > 0.5;

      const tint = isSnowing
        ? (warm ? '255,255,255' : '190,208,224')
        : (warm ? '206,235,160' : '104,146,66');

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(${tint},0.10)`);
      gradient.addColorStop(0.6, `rgba(${tint},0.04)`);
      gradient.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Fine speckle --------------------------------------------------------
  const SPECK = 96;
  for (let sx = Math.floor(x0 / SPECK); sx <= Math.ceil(x1 / SPECK); sx++) {
    for (let sy = Math.floor(y0 / SPECK); sy <= Math.ceil(y1 / SPECK); sy++) {
      const h = hash2(sx, sy, 5);
      if (h < 0.55) continue;
      const px = sx * SPECK + hash2(sx, sy, 6) * SPECK;
      const py = sy * SPECK + hash2(sx, sy, 7) * SPECK;
      if (onCarriageway(px, py)) continue;
      ctx.fillStyle = isSnowing ? 'rgba(255,255,255,0.5)' : 'rgba(92, 132, 58, 0.16)';
      ctx.fillRect(px, py, 2, 1.4);
    }
  }

  // 5. Tufts & daisies -----------------------------------------------------
  if (isSnowing) return;

  const TUFT = 240;
  for (let gx = Math.floor(x0 / TUFT); gx <= Math.ceil(x1 / TUFT); gx++) {
    for (let gy = Math.floor(y0 / TUFT); gy <= Math.ceil(y1 / TUFT); gy++) {
      if (hash2(gx, gy, 11) < 0.55) continue;

      const tx = gx * TUFT + hash2(gx, gy, 12) * TUFT;
      const ty = gy * TUFT + hash2(gx, gy, 13) * TUFT;
      if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
      if (onCarriageway(tx, ty)) continue;

      ctx.strokeStyle = 'rgba(84, 126, 50, 0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - 3.5, ty - 6);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty - 8);
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + 3.5, ty - 6);
      ctx.stroke();

      if (hash2(gx, gy, 14) > 0.9) {
        ctx.fillStyle = 'rgba(255, 245, 157, 0.85)';
        ctx.beginPath();
        ctx.arc(tx + 9, ty - 4, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(240, 98, 146, 0.85)';
        ctx.beginPath();
        ctx.arc(tx + 9, ty - 4, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
