export const CELL_SIZE = 22;
export const GRID_SIZE = 40;

export const COLORS = {
  road: 0x3a3a3a,
  sidewalk: 0x888888,
  sky: 0x8ec8e8,
  fog: 0xc8dde8,
  grass: 0x5a8c4b,
  buildings: [
    0xd4573a, 0xd97a3e, 0xc44d2e, 0xe8a060,
    0xf0c878, 0xd49848, 0xcc6655, 0xf5e0b8,
    0xdd7744, 0xc4886a, 0xbb6644, 0xe8c498,
  ],
  shopSigns: [
    0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12,
    0x9b59b6, 0x1abc9c, 0xe67e22, 0x2980b9,
  ],
  temple: { base: 0x8b0000, gold: 0xffd700, white: 0xfffff0 },
  rickshaw: { body: 0x22a55b, roof: 0x1a8a48, accent: 0xffd700, wheel: 0x1a1a1a },
  prayerFlags: [0x1e40af, 0xffffff, 0xdc2626, 0x16a34a, 0xeab308],
};

export const VEHICLE = {
  maxSpeed: 44,
  boostSpeed: 65,
  acceleration: 34,
  brakeForce: 55,
  friction: 4.5,
  turnSpeed: 3.0,
  reverseMaxSpeed: 12,
  boostDuration: 2.5,
  boostCooldown: 4,
};

export const GAME = {
  totalTime: 150,
  nearMissBonus: 25,
  nearMissDistance: 3.5,
  comboWindow: 15,
  comboMultipliers: [1, 1.5, 2, 2.5, 3],
};

export const FARE = {
  baseFare: 14,
  ratePerUnit: 0.6,
  surgeMult: 1.5,
};

export const RATING = {
  timeThreshold: 28,
  tipMultipliers: [0.75, 1, 1.25, 1.6],
};

export const TRAFFIC_LIGHT = {
  greenDuration: 8,
  yellowDuration: 2,
  redDuration: 8,
  fineAmount: 50,
};

export const LEVELS = {
  deliveriesPerLevel: 3,
  extraTraffic: 2,
};

export const MUSIC = {
  bpm: 95,
  scale: [261.63, 293.66, 349.23, 392.00, 440.00, 523.25],
};

// --- Map presets ---
export const MAPS = {
  kathmandu: {
    name: 'Kathmandu',
    subtitle: 'The Capital Chaos',
    description: 'Dense traffic, narrow lanes, the iconic Stupa',
    terrainScale: 1.0,
    terrainAmplitude: [4, 1.8, 0.6],
    buildingColors: COLORS.buildings,
    skyColor: COLORS.sky,
    fogColor: COLORS.fog,
    fogDensity: 0.0018,
    grassColor: COLORS.grass,
    groundTint: COLORS.grass,
    mountainColor: 0x6b8e6b,
    ambientIntensity: 0.65,
    sunIntensity: 0.9,
    buildingHeightRange: [6, 30],
    treeChance: 0.15,
    trafficMultiplier: 1.0,
  },
  pokhara: {
    name: 'Pokhara',
    subtitle: 'Lakeside Hills',
    description: 'Rolling hills, lake views, relaxed vibes',
    terrainScale: 1.8,
    terrainAmplitude: [8, 3.5, 1.2],
    buildingColors: [0xdde8d0, 0xc8d8b8, 0xb8c8a8, 0xe8e0d0, 0xd0c8b8, 0xf0ece0, 0xc4b8a0, 0xe0d8c8, 0xd8d0c0, 0xc8c0b0, 0xb0a898, 0xe8e4d8],
    skyColor: 0x7ec4f0,
    fogColor: 0xd0e8f0,
    fogDensity: 0.0012,
    grassColor: 0x4a9a3a,
    groundTint: 0x4a9a3a,
    mountainColor: 0x8aaa8a,
    ambientIntensity: 0.75,
    sunIntensity: 1.0,
    buildingHeightRange: [4, 16],
    treeChance: 0.35,
    trafficMultiplier: 0.6,
  },
  bhaktapur: {
    name: 'Bhaktapur',
    subtitle: 'Ancient Alleys',
    description: 'Narrow brick streets, old temples, heritage zone',
    terrainScale: 0.5,
    terrainAmplitude: [2, 1, 0.3],
    buildingColors: [0x8b4513, 0xa0522d, 0x6b3410, 0x7a4320, 0x9c6836, 0x8a5e3c, 0x6e3b1e, 0x8c5e2e, 0x7c4e28, 0x9a6e44, 0x6c3a1a, 0x8e6240],
    skyColor: 0xa0c4d8,
    fogColor: 0xd8ccc0,
    fogDensity: 0.0022,
    grassColor: 0x6a7a4b,
    groundTint: 0x8a7a5b,
    mountainColor: 0x7a6a5a,
    ambientIntensity: 0.55,
    sunIntensity: 0.8,
    buildingHeightRange: [5, 18],
    treeChance: 0.08,
    trafficMultiplier: 0.8,
  },
};
