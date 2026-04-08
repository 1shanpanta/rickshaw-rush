export const CELL_SIZE = 22;
export const GRID_SIZE = 24;

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
