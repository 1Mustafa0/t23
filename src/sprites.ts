/**
 * Static PNG sprite registry for the city scene.
 *
 * Sprites are loaded once and shared by every CityCanvas render frame.
 */
import type { LocationNode } from './types/simulation';

export type VehicleSpriteType = 'taxi' | 'beetle' | 'van' | 'coupe' | 'pickup';
export type VehicleColorKey = 'yellow' | 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'teal';

export const BUILDING_SPRITES: Record<Exclude<LocationNode['type'], 'park'>, string> = {
  home: '/sprites/buildings/home.png',
  cafe: '/sprites/buildings/cafe.png',
  office: '/sprites/buildings/office.png',
  market: '/sprites/buildings/market.png',
  bakery: '/sprites/buildings/bakery.png',
  cinema: '/sprites/buildings/cinema.png',
  cityhall: '/sprites/buildings/cityhall.png',
  bank: '/sprites/buildings/bank.png',
  library: '/sprites/buildings/library.png',
  hospital: '/sprites/buildings/hospital.png',
  wellness: '/sprites/buildings/wellness.png',
  police: '/sprites/buildings/police.png',
  construction_site: '/sprites/buildings/construction_site.png',
};

export const VEHICLE_COLOR_KEYS: Record<string, VehicleColorKey> = {
  '#fbc02d': 'yellow',
  '#42a5f5': 'blue',
  '#66bb6a': 'green',
  '#ef5350': 'red',
  '#ffa726': 'orange',
  '#ab47bc': 'purple',
  '#26a69a': 'teal',
};

export const VEHICLE_SPRITES: Record<VehicleSpriteType, Record<VehicleColorKey, string>> = {
  taxi: {
    yellow: '/sprites/vehicles/taxi-yellow.png', blue: '/sprites/vehicles/taxi-blue.png',
    green: '/sprites/vehicles/taxi-green.png', red: '/sprites/vehicles/taxi-red.png',
    orange: '/sprites/vehicles/taxi-orange.png', purple: '/sprites/vehicles/taxi-purple.png',
    teal: '/sprites/vehicles/taxi-teal.png',
  },
  beetle: {
    yellow: '/sprites/vehicles/beetle-yellow.png', blue: '/sprites/vehicles/beetle-blue.png',
    green: '/sprites/vehicles/beetle-green.png', red: '/sprites/vehicles/beetle-red.png',
    orange: '/sprites/vehicles/beetle-orange.png', purple: '/sprites/vehicles/beetle-purple.png',
    teal: '/sprites/vehicles/beetle-teal.png',
  },
  van: {
    yellow: '/sprites/vehicles/van-yellow.png', blue: '/sprites/vehicles/van-blue.png',
    green: '/sprites/vehicles/van-green.png', red: '/sprites/vehicles/van-red.png',
    orange: '/sprites/vehicles/van-orange.png', purple: '/sprites/vehicles/van-purple.png',
    teal: '/sprites/vehicles/van-teal.png',
  },
  coupe: {
    yellow: '/sprites/vehicles/coupe-yellow.png', blue: '/sprites/vehicles/coupe-blue.png',
    green: '/sprites/vehicles/coupe-green.png', red: '/sprites/vehicles/coupe-red.png',
    orange: '/sprites/vehicles/coupe-orange.png', purple: '/sprites/vehicles/coupe-purple.png',
    teal: '/sprites/vehicles/coupe-teal.png',
  },
  pickup: {
    yellow: '/sprites/vehicles/pickup-yellow.png', blue: '/sprites/vehicles/pickup-blue.png',
    green: '/sprites/vehicles/pickup-green.png', red: '/sprites/vehicles/pickup-red.png',
    orange: '/sprites/vehicles/pickup-orange.png', purple: '/sprites/vehicles/pickup-purple.png',
    teal: '/sprites/vehicles/pickup-teal.png',
  },
};

export const TREE_SPRITES = {
  leafy: '/sprites/trees/tree.png',
  snowy: '/sprites/trees/tree-snow.png',
} as const;

const imageCache = new Map<string, HTMLImageElement>();

export function loadSprite(path: string): HTMLImageElement {
  let image = imageCache.get(path);
  if (!image) {
    image = new Image();
    image.src = path;
    imageCache.set(path, image);
  }
  return image;
}

export function preloadSceneSprites(): void {
  Object.values(BUILDING_SPRITES).forEach(loadSprite);
  Object.values(VEHICLE_SPRITES).forEach(vehicles => Object.values(vehicles).forEach(loadSprite));
  Object.values(TREE_SPRITES).forEach(loadSprite);
}
