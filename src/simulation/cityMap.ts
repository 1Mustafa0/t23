import { LocationNode, Waypoint, DistrictInfo, DistrictId } from '../types/simulation';
import { applyCityLayout } from '../layout';

/**
 * ============================================================================
 *  CITY MAP — the immutable world definition
 * ============================================================================
 *
 *  Pure data + one pathfinding helper. Nothing in here mutates at runtime
 * EXCEPT LocationNode live fields (status/revenue/progress) which the
 * simulation writes in-place — the world's geometry and coordinates never
 * change. Contains: world dimensions, districts, locations (with
 *  ownership, pricing, door/patio spots), navigation grid & A*-style findPath.
 */
// Real-Scale World Size: 3200 x 2432 pixels (50 x 38 grid of 64 x 64 px tiles)
export const CITY_WIDTH = 3200;
export const CITY_HEIGHT = 2432;
export const TILE_SIZE = 64;
export const GRID_COLS = 50;
export const GRID_ROWS = 38;

// The 6 Canonical Municipal Districts
export const CITY_DISTRICTS: DistrictInfo[] = [
  {
    id: 'residential',
    name: 'Sunset Hills Residential',
    nameAr: 'الحي السكني (تلال الغروب)',
    description: 'Multi-complex residences, peaceful townhouses, courtyards & tree-lined lanes.',
    color: '#EC4899',
    center: { x: 550, y: 1900 },
  },
  {
    id: 'commercial',
    name: 'Market Square & Leisure',
    nameAr: 'المنطقة التجارية والترفيهية',
    description: 'Bustling markets, fragrant bakeries, cinema arcade & artisan cafes.',
    color: '#F59E0B',
    center: { x: 550, y: 480 },
  },
  {
    id: 'financial',
    name: 'Innovation & Tech Corridor',
    nameAr: 'منطقة المال والتكنولوجيا',
    description: 'Modern AI laboratories, corporate headquarters & metro banking vaults.',
    color: '#2563EB',
    center: { x: 2650, y: 480 },
  },
  {
    id: 'civic',
    name: 'Republic Civic Plaza',
    nameAr: 'الحي المدني والإداري',
    description: 'Grand City Hall, marble assembly chambers & public research library.',
    color: '#6366F1',
    center: { x: 1600, y: 350 },
  },
  {
    id: 'healthcare',
    name: 'Lifeline Medical & Safety',
    nameAr: 'الرعاية الصحية والطوارئ',
    description: 'General trauma hospital, emergency response headquarters & wellness clinic.',
    color: '#06B6D4',
    center: { x: 2650, y: 1900 },
  },
  {
    id: 'park',
    name: 'Central Grand Park & Lagoon',
    nameAr: 'المنتزه المركزي والبحيرة الكبرى',
    description: 'Vast scenic lake, island bridges, duck ponds, botanical gardens & fountains.',
    color: '#10B981',
    center: { x: 1600, y: 1250 },
  },
];

/**
 * Ground-covered rectangle of each district in world pixels, in render order:
 * the canvas paints a soft tint with it and the minimap paints colored
 * sectors with it. One table, so the two drawings can never disagree.
 * (= the single source of truth for "where each district lies on the ground".)
 */
export const DISTRICT_RECTS: Record<DistrictId, { x: number; y: number; w: number; h: number }> = {
  residential: { x: 40,   y: 900,  w: 1000, h: 1460 },
  commercial:  { x: 40,   y: 40,   w: 1000, h: 860 },
  civic:       { x: 1040, y: 40,   w: 1120, h: 700 },
  financial:   { x: 2160, y: 40,   w: 1000, h: 860 },
  healthcare:  { x: 2160, y: 1400, w: 1000, h: 960 },
  park:        { x: 1040, y: 740,  w: 1120, h: 1020 },
};

// The Canonical City Locations across all 6 Districts
export const CITY_LOCATIONS: LocationNode[] = [
  // ================= 1. COMMERCIAL DISTRICT (Private Free Market) =================
  {
    id: 'cafe',
    name: 'Cozy Cafe & Roastery',
    type: 'cafe',
    sector: 'social',
    districtId: 'commercial',
    districtName: 'Market Square',
    x: 120,
    y: 180,
    width: 380,
    height: 240,
    door: { x: 500, y: 300 },
    patioSpots: [
      { x: 200, y: 440 },
      { x: 300, y: 440 },
      { x: 400, y: 440 }
    ],
    accentColor: '#D97706',
    roofColor: '#B45309',
    description: 'Specialty coffee, hot cocoa & warm chatter. Restores Social & Energy.',
    perks: '+Energy · +Social (Espresso & Pastries)',
    signEmoji: '☕',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Sofia Chen',
    ownerAgentId: 'agent_sofia',
    servicePrice: 3,
    operatingCost: 12,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 65,
    needImpact: {
      addresses: ['energy', 'commerce'],
      effectiveness: { energy: 0.6, healthcare: 0, food: 0, commerce: 0.4, housing: 0 },
      capacity: 30,
      constructionCost: 25,
      operatingCost: 12,
      preferredSector: 'private'
    },
  },
  {
    id: 'market',
    name: 'Grand Central Market',
    type: 'market',
    sector: 'economic',
    districtId: 'commercial',
    districtName: 'Market Square',
    x: 580,
    y: 180,
    width: 380,
    height: 240,
    door: { x: 770, y: 420 },
    patioSpots: [
      { x: 660, y: 440 },
      { x: 770, y: 440 },
      { x: 880, y: 440 }
    ],
    accentColor: '#F59E0B',
    roofColor: '#EA580C',
    description: 'Farmers stalls, fresh groceries & artisan produce trade.',
    perks: '+Hunger Satisfaction · Grocery Commerce',
    signEmoji: '🍎',
    isIndoor: false,
    ownership: 'private',
    ownerName: 'Hana Takahashi',
    ownerAgentId: 'agent_hana',
    servicePrice: 3,
    operatingCost: 15,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 70,
    needImpact: {
      addresses: ['food'],
      effectiveness: { energy: 0, healthcare: 0, food: 0.9, commerce: 0.3, housing: 0 },
      capacity: 50,
      constructionCost: 30,
      operatingCost: 15,
      preferredSector: 'private'
    },
  },
  {
    id: 'bakery',
    name: 'Golden Crust Bakery',
    type: 'bakery',
    sector: 'social',
    districtId: 'commercial',
    districtName: 'Market Square',
    x: 120,
    y: 540,
    width: 380,
    height: 240,
    door: { x: 500, y: 660 },
    patioSpots: [
      { x: 220, y: 520 },
      { x: 340, y: 520 }
    ],
    accentColor: '#EA580C',
    roofColor: '#9A3412',
    description: 'Warm baguettes, sweet croissants & herbal teas.',
    perks: '+Mood · Delicacies & Breakfast Treats',
    signEmoji: '🥐',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Maya Patel',
    ownerAgentId: 'agent_maya',
    servicePrice: 3,
    operatingCost: 10,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 60,
    needImpact: {
      addresses: ['food', 'commerce'],
      effectiveness: { energy: 0.2, healthcare: 0, food: 0.8, commerce: 0.3, housing: 0 },
      capacity: 25,
      constructionCost: 20,
      operatingCost: 10,
      preferredSector: 'private'
    },
  },
  {
    id: 'cinema',
    name: 'Starlight Cinema & Arcade',
    type: 'cinema',
    sector: 'social',
    districtId: 'commercial',
    districtName: 'Market Square',
    x: 580,
    y: 540,
    width: 380,
    height: 240,
    door: { x: 770, y: 540 },
    patioSpots: [
      { x: 670, y: 520 },
      { x: 870, y: 520 }
    ],
    accentColor: '#8B5CF6',
    roofColor: '#6D28D9',
    description: 'Retro arcade games, movies, popcorn & social entertainment.',
    perks: '++Mood · Evening Leisure & Games',
    signEmoji: '🎬',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Lucas Silva',
    ownerAgentId: 'agent_lucas',
    servicePrice: 4,
    operatingCost: 18,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 55,
  },

  // ================= 2. CIVIC & MUNICIPAL DISTRICT (Public Sector) =================
  {
    id: 'cityhall',
    name: 'Metropolis City Hall',
    type: 'cityhall',
    sector: 'civic',
    districtId: 'civic',
    districtName: 'Republic Civic Plaza',
    x: 1220,
    y: 150,
    width: 440,
    height: 280,
    door: { x: 1440, y: 430 },
    patioSpots: [
      { x: 1330, y: 450 },
      { x: 1550, y: 450 }
    ],
    accentColor: '#6366F1',
    roofColor: '#4338CA',
    description: 'Seat of municipal governance, voting assembly & civic decrees.',
    perks: '+Civic Pride · Municipal Decrees',
    signEmoji: '🏛️',
    isIndoor: true,
    ownership: 'public',
    ownerName: 'Metropolis Municipality',
    servicePrice: 0,
    operatingCost: 45,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 50,
  },
  {
    id: 'library',
    name: 'Central Public Library',
    type: 'library',
    sector: 'civic',
    districtId: 'civic',
    districtName: 'Republic Civic Plaza',
    x: 1740,
    y: 150,
    width: 380,
    height: 280,
    door: { x: 1930, y: 430 },
    patioSpots: [
      { x: 1820, y: 450 },
      { x: 2020, y: 450 }
    ],
    accentColor: '#3B82F6',
    roofColor: '#1D4ED8',
    description: 'Vast book stacks, quiet reading gardens & scientific archives.',
    perks: '+Intellect · Peace & Knowledge',
    signEmoji: '📚',
    isIndoor: true,
    ownership: 'public',
    ownerName: 'Metropolis Public System',
    servicePrice: 0,
    operatingCost: 20,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 45,
  },

  // ================= 3. FINANCIAL & TECH DISTRICT (Private Free Market) =================
  {
    id: 'office',
    name: 'AI & Tech Innovation Labs',
    type: 'office',
    sector: 'economic',
    districtId: 'financial',
    districtName: 'Innovation Corridor',
    x: 2260,
    y: 180,
    width: 400,
    height: 250,
    door: { x: 2260, y: 300 },
    patioSpots: [
      { x: 2340, y: 445 },
      { x: 2460, y: 445 }
    ],
    accentColor: '#2563EB',
    roofColor: '#1E3A8A',
    description: 'High-tech AI models, engineering & robotics workspace.',
    perks: '++Money ($) · -Energy (Work Shift)',
    signEmoji: '💻',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Alex Rivera & Tech Syndicate',
    ownerAgentId: 'agent_alex',
    servicePrice: 0,
    operatingCost: 35,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 75,
    needImpact: {
      addresses: ['commerce'],
      effectiveness: { energy: 0, healthcare: 0, food: 0, commerce: 0.7, housing: 0 },
      capacity: 60,
      constructionCost: 0,
      operatingCost: 35,
      preferredSector: 'private'
    },
  },
  {
    id: 'bank',
    name: 'Metro Financial Bank & Vault',
    type: 'bank',
    sector: 'economic',
    districtId: 'financial',
    districtName: 'Innovation Corridor',
    x: 2740,
    y: 180,
    width: 380,
    height: 250,
    door: { x: 2930, y: 430 },
    patioSpots: [
      { x: 2820, y: 445 },
      { x: 3020, y: 445 }
    ],
    accentColor: '#CA8A04',
    roofColor: '#854D0E',
    description: 'Gold vaults, investments & citizen savings accounts.',
    perks: '+Wealth Management · Currency Exchange',
    signEmoji: '🏦',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Marcus Vance & Partners',
    ownerAgentId: 'agent_marcus',
    servicePrice: 2,
    operatingCost: 40,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 60,
    needImpact: {
      addresses: ['commerce'],
      effectiveness: { energy: 0, healthcare: 0, food: 0, commerce: 0.8, housing: 0 },
      capacity: 50,
      constructionCost: 0,
      operatingCost: 40,
      preferredSector: 'private'
    },
  },
  {
    id: 'office_corp',
    name: 'Nexus Corporate Tower',
    type: 'office',
    sector: 'economic',
    districtId: 'financial',
    districtName: 'Innovation Corridor',
    x: 2480,
    y: 540,
    width: 440,
    height: 260,
    door: { x: 2480, y: 670 },
    patioSpots: [
      { x: 2580, y: 520 },
      { x: 2720, y: 520 }
    ],
    accentColor: '#4F46E5',
    roofColor: '#3730A3',
    description: 'Executive strategy, international trade & consulting.',
    perks: '+High Salaries · Career Ambition',
    signEmoji: '🏢',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Nexus Global Holdings',
    servicePrice: 0,
    operatingCost: 50,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 70,
  },

  // ================= 4. RESIDENTIAL DISTRICT (Sunset Hills - Private Housing) =================
  {
    id: 'home_sunset',
    name: 'Sunset Luxury Residences',
    type: 'home',
    sector: 'residential',
    districtId: 'residential',
    districtName: 'Sunset Hills',
    x: 120,
    y: 1540,
    width: 380,
    height: 260,
    door: { x: 500, y: 1670 },
    patioSpots: [
      { x: 210, y: 1520 },
      { x: 350, y: 1520 }
    ],
    accentColor: '#EC4899',
    roofColor: '#9D174D',
    description: 'Luxury apartments with balconies, hearths & panoramic views.',
    perks: '++Energy · Deep Rest & Night Sleep',
    signEmoji: '🏡',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Sunset Property Trust',
    servicePrice: 4,
    operatingCost: 10,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 75,
  },
  {
    id: 'home_maple',
    name: 'Maple Court Townhouses',
    type: 'home',
    sector: 'residential',
    districtId: 'residential',
    districtName: 'Sunset Hills',
    x: 580,
    y: 1540,
    width: 340,
    height: 240,
    door: { x: 770, y: 1540 },
    patioSpots: [
      { x: 670, y: 1520 },
      { x: 870, y: 1520 }
    ],
    accentColor: '#F43F5E',
    roofColor: '#BE123C',
    description: 'Cozy red-brick family townhouses with flower planters.',
    perks: '++Energy · Warm Home Comfort',
    signEmoji: '🏘️',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Maple Co-op Housing',
    servicePrice: 3,
    operatingCost: 8,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 70,
  },
  {
    id: 'home_pine',
    name: 'Pine Ridge Condominiums',
    type: 'home',
    sector: 'residential',
    districtId: 'residential',
    districtName: 'Sunset Hills',
    x: 120,
    y: 1940,
    width: 430,
    height: 240,
    door: { x: 500, y: 2070 },
    patioSpots: [
      { x: 210, y: 1920 },
      { x: 350, y: 1920 }
    ],
    accentColor: '#E11D48',
    roofColor: '#881337',
    description: 'Modern pine wood condos with garden courtyards.',
    perks: '++Energy · Quiet Sleep & Rest',
    signEmoji: '🏠',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Pine Realty Group',
    servicePrice: 3,
    operatingCost: 8,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 68,
    needImpact: {
      addresses: ['housing'],
      effectiveness: { energy: 0.3, healthcare: 0, food: 0, commerce: 0, housing: 0.9 },
      capacity: 40,
      constructionCost: 0,
      operatingCost: 8,
      preferredSector: 'private'
    },
  },
  {
    id: 'home_garden',
    name: 'Garden Terrace Flats',
    type: 'home',
    sector: 'residential',
    districtId: 'residential',
    districtName: 'Sunset Hills',
    x: 580,
    y: 1940,
    width: 360,
    height: 290,
    door: { x: 770, y: 1940 },
    patioSpots: [
      { x: 670, y: 1920 },
      { x: 870, y: 1920 }
    ],
    accentColor: '#DB2777',
    roofColor: '#9D174D',
    description: 'Botanical flats with rooftop solar & ivy garden.',
    perks: '++Energy · Nature Rest & Serenity',
    signEmoji: '🪴',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Green Terraces Syndicate',
    servicePrice: 4,
    operatingCost: 9,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 65,
  },

  // ================= 5. HEALTHCARE & SAFETY DISTRICT (Public & Private) =================
  {
    id: 'hospital',
    name: 'Metropolis General Hospital',
    type: 'hospital',
    sector: 'healthcare',
    districtId: 'healthcare',
    districtName: 'Lifeline Safety Sector',
    x: 2260,
    y: 1540,
    width: 440,
    height: 280,
    door: { x: 2260, y: 1680 },
    patioSpots: [
      { x: 2380, y: 1520 },
      { x: 2540, y: 1520 }
    ],
    accentColor: '#06B6D4',
    roofColor: '#0E7490',
    description: 'Level 1 trauma center, ICU wards, rooftop helipad & surgery bays.',
    perks: '++Health · Emergency Healing',
    signEmoji: '🏥',
    isIndoor: true,
    ownership: 'public',
    ownerName: 'Metropolis Health Authority',
    servicePrice: 2, // low subsidized copay
    operatingCost: 60,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 50,
  },
  {
    id: 'police',
    name: 'Central Emergency & Police Headquarters',
    type: 'police',
    sector: 'healthcare',
    districtId: 'healthcare',
    districtName: 'Lifeline Safety Sector',
    x: 2780,
    y: 1540,
    width: 360,
    height: 280,
    door: { x: 2960, y: 1540 },
    patioSpots: [
      { x: 2860, y: 1520 },
      { x: 3040, y: 1520 }
    ],
    accentColor: '#3B82F6',
    roofColor: '#1D4ED8',
    description: 'City safety command, rapid dispatch & disaster coordination.',
    perks: '+Public Safety · Emergency Rescue',
    signEmoji: '🚨',
    isIndoor: true,
    ownership: 'public',
    ownerName: 'Metropolis Emergency Services',
    servicePrice: 0,
    operatingCost: 40,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 40,
  },
  {
    id: 'wellness',
    name: 'Oasis Wellness & Therapy Center',
    type: 'wellness',
    sector: 'healthcare',
    districtId: 'healthcare',
    districtName: 'Lifeline Safety Sector',
    x: 2480,
    y: 1940,
    width: 420,
    height: 260,
    door: { x: 2480, y: 2070 },
    patioSpots: [
      { x: 2580, y: 1920 },
      { x: 2740, y: 1920 }
    ],
    accentColor: '#14B8A6',
    roofColor: '#0F766E',
    description: 'Hydrotherapy pools, acupuncture & mental decompression.',
    perks: '++Mood · Stress Relief & Wellness',
    signEmoji: '💆',
    isIndoor: true,
    ownership: 'private',
    ownerName: 'Chloe Dubois',
    ownerAgentId: 'agent_chloe',
    servicePrice: 5,
    operatingCost: 16,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 52,
  },

  // ================= 6. CENTRAL PARK & LAGOON (Public Municipal) =================
  {
    id: 'park',
    name: 'Central Park & Grand Lagoon',
    type: 'park',
    sector: 'social',
    districtId: 'park',
    districtName: 'Central Grand Park',
    x: 1100,
    y: 780,
    width: 1000,
    height: 940,
    door: { x: 1600, y: 780 },
    patioSpots: [
      { x: 1350, y: 1250 },
      { x: 1600, y: 1250 },
      { x: 1850, y: 1250 },
      { x: 1450, y: 1000 },
      { x: 1750, y: 1500 }
    ],
    accentColor: '#10B981',
    roofColor: '#047857',
    description: 'Expansive serene lake, wooden bridges, swimming swans & botanical trails.',
    perks: '++Mood · Nature Leisure & Serenity',
    signEmoji: '🌳',
    isIndoor: false,
    ownership: 'public',
    ownerName: 'Metropolis Parks Dept',
    servicePrice: 0,
    operatingCost: 15,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 70,
  },

  // ================= 7. DYNAMIC ZONING SITES (Public Municipal vs. Private Enterprise) =================
  {
    id: 'site_solar',
    name: 'Civic Eco-Solar Station',
    type: 'construction_site',
    sector: 'civic',
    districtId: 'civic',
    districtName: 'Republic Civic Plaza',
    x: 1220,
    y: 540,
    width: 380,
    height: 180,
    door: { x: 1410, y: 640 },
    patioSpots: [
      { x: 1320, y: 640 },
      { x: 1500, y: 640 }
    ],
    accentColor: '#F59E0B',
    roofColor: '#78350F',
    description: 'Municipal clean energy project with solar panel arrays & battery vaults.',
    perks: '⚡ Clean Grid Power · Immunity to Blackouts',
    signEmoji: '☀️',
    isIndoor: false,
    ownership: 'public',
    ownerName: 'Metropolis Energy Dept',
    fundingSource: 'treasury',
    funderName: 'City Municipal Treasury',
    servicePrice: 0,
    operatingCost: 25,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 80,
    needImpact: {
      addresses: ['energy'],
      effectiveness: { energy: 0.8, healthcare: 0, food: 0, commerce: 0, housing: 0 },
      capacity: 100,
      constructionCost: 220,
      operatingCost: 25,
      preferredSector: 'public'
    },
    status: 'under_construction',
    buildProgress: 35,
    constructionCost: 220,
  },
  {
    id: 'site_clinic',
    name: 'Sunset Community Clinic Plot',
    type: 'construction_site',
    sector: 'healthcare',
    districtId: 'residential',
    districtName: 'Sunset Hills',
    x: 120,
    y: 1150,
    width: 380,
    height: 180,
    door: { x: 440, y: 1240 },
    patioSpots: [
      { x: 250, y: 1240 },
      { x: 350, y: 1240 }
    ],
    accentColor: '#06B6D4',
    roofColor: '#0E7490',
    description: 'Municipal clinic commissioned when Healthcare Strain exceeds threshold.',
    perks: '🩺 Neighborhood Healing · Quick Recovery',
    signEmoji: '🏥',
    isIndoor: false,
    ownership: 'public',
    ownerName: 'Metropolis Health Authority',
    fundingSource: 'treasury',
    funderName: 'City Municipal Treasury',
    servicePrice: 2,
    operatingCost: 20,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 40,
    needImpact: {
      addresses: ['healthcare'],
      effectiveness: { energy: 0, healthcare: 0.9, food: 0, commerce: 0, housing: 0 },
      capacity: 25,
      constructionCost: 180,
      operatingCost: 20,
      preferredSector: 'public'
    },
    status: 'planned',
    buildProgress: 0,
    constructionCost: 180,
  },
  {
    id: 'site_condo',
    name: 'Highland Modular Residences',
    type: 'construction_site',
    sector: 'residential',
    districtId: 'residential',
    districtName: 'Sunset Hills',
    x: 580,
    y: 1150,
    width: 380,
    height: 180,
    door: { x: 770, y: 1240 },
    patioSpots: [
      { x: 670, y: 1240 },
      { x: 870, y: 1240 }
    ],
    accentColor: '#EC4899',
    roofColor: '#BE185D',
    description: 'Private high-density condos funded by private real-estate investors when housing is scarce.',
    perks: '🏡 Expanded Affordable Homes · Restful Sleep',
    signEmoji: '🏗️',
    isIndoor: false,
    ownership: 'private',
    ownerName: 'Highland Private Syndicate',
    fundingSource: 'private_capital',
    funderName: 'Private Investor Group',
    servicePrice: 4,
    operatingCost: 12,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 45,
    needImpact: {
      addresses: ['housing'],
      effectiveness: { energy: 0, healthcare: 0, food: 0, commerce: 0.3, housing: 0.9 },
      capacity: 40,
      constructionCost: 240,
      operatingCost: 12,
      preferredSector: 'private'
    },
    status: 'planned',
    buildProgress: 0,
    constructionCost: 240,
  },
  {
    id: 'site_tech',
    name: 'Quantum AI Foundry Wing',
    type: 'construction_site',
    sector: 'economic',
    districtId: 'financial',
    districtName: 'Innovation Corridor',
    x: 2740,
    y: 540,
    width: 380,
    height: 180,
    door: { x: 2740, y: 640 },
    patioSpots: [
      { x: 2850, y: 640 },
      { x: 3000, y: 640 }
    ],
    accentColor: '#3B82F6',
    roofColor: '#1E40AF',
    description: 'Private tech cluster funded by venture capital when commercial & innovation demand surges.',
    perks: '💻 Advanced Research Hub · High Wages ($)',
    signEmoji: '🔬',
    isIndoor: false,
    ownership: 'private',
    ownerName: 'Quantum AI Venture Syndicate',
    fundingSource: 'private_capital',
    funderName: 'Private Venture Capital',
    servicePrice: 0,
    operatingCost: 30,
    revenueToday: 0,
    customersToday: 0,
    demandScore: 50,
    needImpact: {
      addresses: ['commerce'],
      effectiveness: { energy: 0, healthcare: 0, food: 0, commerce: 0.8, housing: 0 },
      capacity: 30,
      constructionCost: 320,
      operatingCost: 30,
      preferredSector: 'private'
    },
    status: 'planned',
    buildProgress: 0,
    constructionCost: 320,
  }
];

// Positions, entrances and patios are generated from the grid block data.
applyCityLayout(CITY_LOCATIONS);

// Navigation Graph covering the 3200x2400 city network
export interface NavNode {
  id: string;
  x: number;
  y: number;
  neighbors: string[];
}

export const NAV_GRAPH: Record<string, NavNode> = {
  // Commercial District Doors
  'cafe_door': { id: 'cafe_door', x: 500, y: 300, neighbors: ['j_comm_nw'] },
  'market_door': { id: 'market_door', x: 770, y: 420, neighbors: ['j_comm_mid'] },
  'bakery_door': { id: 'bakery_door', x: 500, y: 660, neighbors: ['j_comm_sw'] },
  'cinema_door': { id: 'cinema_door', x: 770, y: 540, neighbors: ['j_comm_mid'] },

  // Commercial Grid Junctions
  'j_comm_nw': { id: 'j_comm_nw', x: 500, y: 448, neighbors: ['cafe_door', 'j_comm_mid'] },
  'j_comm_mid': { id: 'j_comm_mid', x: 770, y: 448, neighbors: ['market_door', 'cinema_door', 'j_comm_nw', 'j_w_blvd_n'] },
  'j_comm_sw': { id: 'j_comm_sw', x: 500, y: 660, neighbors: ['bakery_door', 'j_w_blvd_mid_1'] },

  // Civic District Doors & Junctions
  'cityhall_door': { id: 'cityhall_door', x: 1440, y: 430, neighbors: ['j_civic_w'] },
  'library_door': { id: 'library_door', x: 1930, y: 430, neighbors: ['j_civic_e'] },
  'j_civic_w': { id: 'j_civic_w', x: 1440, y: 448, neighbors: ['cityhall_door', 'j_w_blvd_n', 'j_civic_center'] },
  'j_civic_center': { id: 'j_civic_center', x: 1600, y: 448, neighbors: ['j_civic_w', 'j_civic_e', 'park_n_gate'] },
  'j_civic_e': { id: 'j_civic_e', x: 1930, y: 448, neighbors: ['library_door', 'j_civic_center', 'j_e_blvd_n'] },

  // Financial & Tech District Doors & Junctions
  'office_door': { id: 'office_door', x: 2260, y: 300, neighbors: ['j_e_blvd_n'] },
  'bank_door': { id: 'bank_door', x: 2930, y: 430, neighbors: ['j_fin_e'] },
  'office_corp_door': { id: 'office_corp_door', x: 2480, y: 670, neighbors: ['j_e_blvd_mid_1'] },
  'j_fin_e': { id: 'j_fin_e', x: 2930, y: 448, neighbors: ['bank_door', 'j_e_blvd_n'] },

  // Residential District (Sunset Hills) Doors & Junctions
  'home_sunset_door': { id: 'home_sunset_door', x: 500, y: 1670, neighbors: ['j_res_nw'] },
  'home_maple_door': { id: 'home_maple_door', x: 770, y: 1540, neighbors: ['j_res_mid'] },
  'home_pine_door': { id: 'home_pine_door', x: 500, y: 2070, neighbors: ['j_res_sw'] },
  'home_garden_door': { id: 'home_garden_door', x: 770, y: 1940, neighbors: ['j_res_mid'] },

  'j_res_nw': { id: 'j_res_nw', x: 500, y: 1670, neighbors: ['home_sunset_door', 'j_res_mid'] },
  'j_res_mid': { id: 'j_res_mid', x: 770, y: 1856, neighbors: ['home_maple_door', 'home_garden_door', 'j_res_nw', 'j_res_sw', 'j_w_blvd_s'] },
  'j_res_sw': { id: 'j_res_sw', x: 500, y: 2070, neighbors: ['home_pine_door', 'j_res_mid'] },

  // Healthcare District Doors & Junctions
  'hospital_door': { id: 'hospital_door', x: 2260, y: 1680, neighbors: ['j_e_blvd_mid_2'] },
  'police_door': { id: 'police_door', x: 2960, y: 1540, neighbors: ['j_med_e'] },
  'wellness_door': { id: 'wellness_door', x: 2480, y: 2070, neighbors: ['j_e_blvd_s'] },
  'j_med_e': { id: 'j_med_e', x: 2960, y: 1856, neighbors: ['police_door', 'j_e_blvd_s'] },

  // Main Arterial Intersections:
  // Boulevard West (x = 1024, 16 grid cells)
  'j_w_blvd_n': { id: 'j_w_blvd_n', x: 1024, y: 448, neighbors: ['j_comm_mid', 'j_civic_w', 'j_w_blvd_mid_1'] },
  'j_w_blvd_mid_1': { id: 'j_w_blvd_mid_1', x: 1024, y: 780, neighbors: ['j_w_blvd_n', 'j_comm_sw', 'park_w_gate', 'j_w_blvd_mid_2'] },
  'j_w_blvd_mid_2': { id: 'j_w_blvd_mid_2', x: 1024, y: 1250, neighbors: ['j_w_blvd_mid_1', 'park_w_gate_2', 'j_w_blvd_s'] },
  'j_w_blvd_s': { id: 'j_w_blvd_s', x: 1024, y: 1856, neighbors: ['j_w_blvd_mid_2', 'j_res_mid', 'j_avenue_s_center'] },

  // Boulevard East (x = 2176, 34 grid cells)
  'j_e_blvd_n': { id: 'j_e_blvd_n', x: 2176, y: 448, neighbors: ['j_civic_e', 'office_door', 'j_fin_e', 'j_e_blvd_mid_1'] },
  'j_e_blvd_mid_1': { id: 'j_e_blvd_mid_1', x: 2176, y: 780, neighbors: ['j_e_blvd_n', 'office_corp_door', 'park_e_gate', 'j_e_blvd_mid_2'] },
  'j_e_blvd_mid_2': { id: 'j_e_blvd_mid_2', x: 2176, y: 1250, neighbors: ['j_e_blvd_mid_1', 'hospital_door', 'park_e_gate_2', 'j_e_blvd_s'] },
  'j_e_blvd_s': { id: 'j_e_blvd_s', x: 2176, y: 1856, neighbors: ['j_e_blvd_mid_2', 'wellness_door', 'j_med_e', 'j_avenue_s_center'] },

  // South Avenue Connector (y = 1856, 29 grid cells)
  'j_avenue_s_center': { id: 'j_avenue_s_center', x: 1600, y: 1856, neighbors: ['j_w_blvd_s', 'j_e_blvd_s', 'park_s_gate'] },

  // Central Park Gates & Lagoon Walkways
  'park_n_gate': { id: 'park_n_gate', x: 1600, y: 780, neighbors: ['j_civic_center', 'park_bridge_n'] },
  'park_s_gate': { id: 'park_s_gate', x: 1600, y: 1720, neighbors: ['j_avenue_s_center', 'park_bridge_s'] },
  'park_w_gate': { id: 'park_w_gate', x: 1100, y: 780, neighbors: ['j_w_blvd_mid_1', 'park_bridge_n'] },
  'park_w_gate_2': { id: 'park_w_gate_2', x: 1100, y: 1250, neighbors: ['j_w_blvd_mid_2', 'park_center'] },
  'park_e_gate': { id: 'park_e_gate', x: 2100, y: 780, neighbors: ['j_e_blvd_mid_1', 'park_bridge_n'] },
  'park_e_gate_2': { id: 'park_e_gate_2', x: 2100, y: 1250, neighbors: ['j_e_blvd_mid_2', 'park_center'] },

  'park_center': { id: 'park_center', x: 1600, y: 1250, neighbors: ['park_bridge_n', 'park_bridge_s', 'park_w_gate_2', 'park_e_gate_2', 'park_lagoon_w', 'park_lagoon_e'] },
  'park_bridge_n': { id: 'park_bridge_n', x: 1600, y: 1000, neighbors: ['park_n_gate', 'park_center', 'park_w_gate', 'park_e_gate'] },
  'park_bridge_s': { id: 'park_bridge_s', x: 1600, y: 1500, neighbors: ['park_s_gate', 'park_center'] },
  'park_lagoon_w': { id: 'park_lagoon_w', x: 1350, y: 1250, neighbors: ['park_center', 'park_w_gate_2'] },
  'park_lagoon_e': { id: 'park_lagoon_e', x: 1850, y: 1250, neighbors: ['park_center', 'park_e_gate_2'] },

  // Construction Sites Doors
  'site_solar_door': { id: 'site_solar_door', x: 1410, y: 640, neighbors: ['j_civic_center', 'park_n_gate'] },
  'site_clinic_door': { id: 'site_clinic_door', x: 440, y: 1240, neighbors: ['j_w_blvd_mid_2', 'j_res_nw'] },
  'site_condo_door': { id: 'site_condo_door', x: 770, y: 1240, neighbors: ['j_w_blvd_mid_2', 'j_res_mid'] },
  'site_tech_door': { id: 'site_tech_door', x: 2740, y: 640, neighbors: ['office_corp_door', 'j_e_blvd_mid_1'] }
};

// Keep each navigation entrance exactly aligned with its generated building door.
CITY_LOCATIONS.forEach(location => {
  const doorNode = NAV_GRAPH[`${location.id}_door`];
  if (!doorNode) return;
  doorNode.x = location.door.x;
  doorNode.y = location.door.y;
});

// ---------------------------------------------------------------------------
// PEDESTRIAN SIDEWALK NETWORK
// ---------------------------------------------------------------------------
// Citizens used to walk from a door straight to a road junction in the middle
// of the carriageway. This pass adds pavement nodes along every street and
// re-wires each door to the pavement, so the walk graph hugs the kerb and the
// only road crossing left is at the signalised junctions (where zebras are).
const SIDEWALK_NODES: string[] = [];

function addSidewalkNode(id: string, x: number, y: number): void {
  NAV_GRAPH[id] = { id, x, y, neighbors: [] };
}

function linkNodes(a: string, b: string): void {
  const na = NAV_GRAPH[a];
  const nb = NAV_GRAPH[b];
  if (!na || !nb || a === b) return;
  if (!na.neighbors.includes(b)) na.neighbors.push(b);
  if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
}

function buildPavement(
  prefix: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  step = 140,
): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(2, Math.round(length / step));
  let previous: string | null = null;
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const id = `${prefix}_${i}`;
    addSidewalkNode(id, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    SIDEWALK_NODES.push(id);
    if (previous) linkNodes(previous, id);
    previous = id;
  }
}

const PAVEMENT_OFFSET = 52; // kerb-side walking line for the 88 px arterials
for (const avenueX of [1024, 2176]) {
  for (const side of [-1, 1]) {
    buildPavement(`sw_v${avenueX}_${side < 0 ? 'w' : 'e'}`, { x: avenueX + side * PAVEMENT_OFFSET, y: 60 }, { x: avenueX + side * PAVEMENT_OFFSET, y: 2380 });
  }
}
for (const avenueY of [448, 1856]) {
  for (const side of [-1, 1]) {
    buildPavement(`sw_h${avenueY}_${side < 0 ? 'n' : 's'}`, { x: 60, y: avenueY + side * PAVEMENT_OFFSET }, { x: 3140, y: avenueY + side * PAVEMENT_OFFSET });
  }
}
// Collector-street pavements (the residential and service frontages).
buildPavement('sw_col_x960', { x: 936, y: 420 }, { x: 936, y: 1790 }, 120);
buildPavement('sw_col_x3168', { x: 3140, y: 420 }, { x: 3140, y: 1790 }, 120);
buildPavement('sw_col_y384', { x: 60, y: 360 }, { x: 3140, y: 360 }, 140);
buildPavement('sw_col_y1664', { x: 60, y: 1640 }, { x: 940, y: 1640 }, 120);
buildPavement('sw_col_y1760', { x: 2260, y: 1736 }, { x: 3140, y: 1736 }, 120);

// Junctions are vehicle geometry, not footpaths. Pedestrians turn the corner
// on the pavement, so a junction only links the pavement nodes around it and
// never carries a walking route along the centreline.
for (const node of Object.values(NAV_GRAPH)) {
  if (!node.id.startsWith('j_')) continue;
  const nearby = SIDEWALK_NODES
    .map(id => ({ id, d: Math.hypot(NAV_GRAPH[id].x - node.x, NAV_GRAPH[id].y - node.y) }))
    .filter(entry => entry.d < 150)
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);

  // Corner links: pavement-to-pavement across the corner.
  for (let i = 0; i < nearby.length; i++) {
    for (let j = i + 1; j < nearby.length; j++) linkNodes(nearby[i].id, nearby[j].id);
  }

  // The junction itself keeps only pavement neighbours (fallback safety).
  node.neighbors = nearby.map(entry => entry.id);
}

// Doors connect to the pavement, not to the middle of the road.
for (const location of CITY_LOCATIONS) {
  const doorId = `${location.id}_door`;
  const door = NAV_GRAPH[doorId];
  if (!door) continue;

  const nearest = SIDEWALK_NODES
    .map(id => ({ id, d: Math.hypot(NAV_GRAPH[id].x - door.x, NAV_GRAPH[id].y - door.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2);

  if (nearest.length === 0 || nearest[0].d > 900) continue;

  door.neighbors = nearest.map(entry => entry.id);
  for (const entry of nearest) linkNodes(doorId, entry.id);
}


// Location-to-NavNode mapping
export const LOCATION_NAV_TARGETS: Record<string, string> = {
  cafe: 'cafe_door',
  market: 'market_door',
  bakery: 'bakery_door',
  cinema: 'cinema_door',

  cityhall: 'cityhall_door',
  library: 'library_door',

  office: 'office_door',
  bank: 'bank_door',
  office_corp: 'office_corp_door',

  home_sunset: 'home_sunset_door',
  home_maple: 'home_maple_door',
  home_pine: 'home_pine_door',
  home_garden: 'home_garden_door',
  home: 'home_sunset_door', // fallback alias

  hospital: 'hospital_door',
  police: 'police_door',
  wellness: 'wellness_door',

  park: 'park_center',

  // Construction Projects Sites
  site_solar: 'site_solar_door',
  site_clinic: 'site_clinic_door',
  site_condo: 'site_condo_door',
  site_tech: 'site_tech_door',
};

// Find closest NavNode
export function getClosestNavNodeId(x: number, y: number): string {
  let closestId = 'park_center';
  let minDist = Infinity;
  for (const [id, node] of Object.entries(NAV_GRAPH)) {
    const distSq = (node.x - x) ** 2 + (node.y - y) ** 2;
    if (distSq < minDist) {
      minDist = distSq;
      closestId = id;
    }
  }
  return closestId;
}

// A* / BFS Shortest Path algorithm on the waypoint graph
export function findPath(startX: number, startY: number, targetNodeId: string): Waypoint[] {
  const startNodeId = getClosestNavNodeId(startX, startY);
  if (startNodeId === targetNodeId) {
    const targetNode = NAV_GRAPH[targetNodeId];
    return targetNode ? [{ x: targetNode.x, y: targetNode.y }] : [];
  }

  const queue: string[] = [startNodeId];
  const cameFrom: Record<string, string | null> = { [startNodeId]: null };
  let found = false;

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === targetNodeId) {
      found = true;
      break;
    }

    const node = NAV_GRAPH[current];
    if (!node) continue;

    for (const neighborId of node.neighbors) {
      if (!(neighborId in cameFrom)) {
        cameFrom[neighborId] = current;
        queue.push(neighborId);
      }
    }
  }

  if (!found) {
    const targetNode = NAV_GRAPH[targetNodeId];
    return targetNode ? [{ x: targetNode.x, y: targetNode.y }] : [];
  }

  const path: Waypoint[] = [];
  let curr: string | null = targetNodeId;
  while (curr !== null) {
    const node = NAV_GRAPH[curr];
    if (node) {
      path.unshift({ x: node.x, y: node.y });
    }
    curr = cameFrom[curr];
  }

  return path;
}
