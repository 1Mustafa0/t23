/**
 * Shared colors for the CityCanvas scene. Keep these values in sync with the
 * existing renderer so palette extraction does not change the game's look.
 */
export const DRAWING_COLORS = {
  outline: '#2c3e50',
  terrain: {
    grass: {
      base: '#9ccc65',
      alternate: '#8bc34a',
      snow: '#e1f5fe',
      snowAlternate: '#edf7ed',
      park: '#7cb342',
      parkSnow: '#c5cae9',
    },
    asphalt: {
      base: '#455a64',
      snow: '#37474f',
    },
    sidewalk: {
      base: '#d7ccc8',
      inner: '#efebe9',
      snow: '#f1f5f9',
      innerSnow: '#e2e8f0',
    },
    water: {
      bank: '#b0bec5',
      rim: '#0288d1',
      surface: '#4fc3f7',
      snowSurface: '#b3e5fc',
    },
  },
  residential: {
    wall: '#fff8e1',
    roof: '#e53935',
    roofRidge: '#c62828',
  },
  serviceBuildings: {
    hospital: {
      wall: '#e0f2f1',
      header: '#06B6D4',
      cross: '#e53935',
      window: '#b2dfdb',
    },
    police: {
      wall: '#37474f',
      header: '#3B82F6',
      window: '#546e7a',
      sirenDay: '#ffd54f',
      sirenNight: '#2196f3',
    },
    fire: {
      wall: '#fff3e0',
      header: '#e53935',
    },
    school: {
      wall: '#fffde7',
      header: '#f9a825',
    },
    market: {
      wall: '#efebe9',
      awning: '#43a047',
      shelf: '#d7ccc8',
    },
    government: {
      wall: '#f5f5f5',
      bankWall: '#fffde7',
      roofFallback: '#3949ab',
      pillar: '#ffffff',
      pillarBase: '#cfd8dc',
    },
  },
  vehicles: {
    taxi: '#fbc02d',
    blue: '#42a5f5',
    green: '#66bb6a',
    red: '#ef5350',
    orange: '#ffa726',
    purple: '#ab47bc',
    teal: '#26a69a',
    glass: '#e1f5fe',
  },
} as const;
