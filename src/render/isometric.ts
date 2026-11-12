/**
 * Isometric projection primitives for AgentVille.
 *
 * Simulation and pathfinding continue to use the existing Cartesian world
 * coordinates. Rendering converts those ground-plane coordinates at the edge
 * of the renderer, so schedules, A* paths, traffic and saved simulations do
 * not need to be rewritten when the camera changes.
 *
 * The projection uses a 2:1 diamond (64 x 32 screen pixels per 64 x 64
 * world-pixel tile). Positive world X projects down-right; positive world Y
 * projects down-left. Building elevation is screen-vertical and is therefore
 * kept separate from ground-plane projection.
 */

export const ISO_TILE_WIDTH = 64;
export const ISO_TILE_HEIGHT = 32;
export const ISO_HALF_WIDTH = ISO_TILE_WIDTH / 2;
export const ISO_QUARTER_HEIGHT = ISO_TILE_HEIGHT / 4;

export interface WorldPoint {
  x: number;
  y: number;
}

export interface IsometricPoint extends WorldPoint {
  /** Optional elevation in world pixels; positive values rise on screen. */
  z?: number;
}

export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Project a Cartesian ground-plane point into isometric screen coordinates.
 * Elevation is applied vertically after the ground plane has been projected.
 */
export function worldToIsometric(point: IsometricPoint): WorldPoint {
  return {
    x: (point.x - point.y) * ISO_HALF_WIDTH / 64,
    y: (point.x + point.y) * ISO_QUARTER_HEIGHT / 64 - (point.z ?? 0),
  };
}

/** Inverse of worldToIsometric for points on the ground plane (z = 0). */
export function isometricToWorld(point: WorldPoint): WorldPoint {
  const halfX = point.x / (ISO_HALF_WIDTH / 64);
  const quarterY = point.y / (ISO_QUARTER_HEIGHT / 64);
  return {
    x: (halfX + quarterY) / 2,
    y: (quarterY - halfX) / 2,
  };
}

/** Project a vector without applying any translation or elevation. */
export function projectIsometricVector(vector: WorldPoint): WorldPoint {
  return {
    x: (vector.x - vector.y) * ISO_HALF_WIDTH / 64,
    y: (vector.x + vector.y) * ISO_QUARTER_HEIGHT / 64,
  };
}

/** Four projected ground-plane corners of a Cartesian rectangle. */
export function projectIsometricRect(rect: WorldRect): WorldPoint[] {
  return [
    worldToIsometric({ x: rect.x, y: rect.y }),
    worldToIsometric({ x: rect.x + rect.width, y: rect.y }),
    worldToIsometric({ x: rect.x + rect.width, y: rect.y + rect.height }),
    worldToIsometric({ x: rect.x, y: rect.y + rect.height }),
  ];
}

/**
 * Stable painter-order key for ground-anchored entities. Draw lower (larger
 * x+y) anchors later so foreground objects overlap background objects.
 */
export function isometricDepth(point: WorldPoint): number {
  return point.x + point.y;
}

/** Rotate a world-space heading into the projected screen plane. */
export function projectIsometricHeading(heading: number): number {
  const direction = projectIsometricVector({
    x: Math.cos(heading),
    y: Math.sin(heading),
  });
  return Math.atan2(direction.y, direction.x);
}
