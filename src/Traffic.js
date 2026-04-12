import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE } from './constants.js';
import { removeAndDispose } from './utils.js';

const NPC_TYPES = {
  bus: { colors: [0x2255aa, 0xcc4400, 0x228844, 0x884422], width: 3.5, height: 4, length: 7.5, speed: 7, radius: 4.5 },
  microbus: { colors: [0xeeeeee, 0xddddaa, 0xccccbb], width: 3, height: 3, length: 5.5, speed: 10, radius: 3.5 },
  motorcycle: { colors: [0x222222, 0x882222, 0x444444, 0x224488, 0x111111], width: 1.0, height: 1.8, length: 2.2, speed: 18, radius: 1.4 },
  scooter: { colors: [0x4488aa, 0xaa4466, 0x88aa44], width: 0.9, height: 1.5, length: 1.8, speed: 14, radius: 1.2 },
  tempo: { colors: [0x22aa55, 0x2266aa], width: 3, height: 2.8, length: 5, speed: 9, radius: 3.2 },
  cow: { colors: [0xd2b48c, 0xb89878, 0xe0d0b0, 0xc8a87c], width: 2, height: 2, length: 3, speed: 1.2, radius: 2.0 },
  car: { colors: [0xcc3333, 0x3333cc, 0x33aa33, 0xdddd33, 0xffffff, 0x222222, 0x884400, 0x666666], width: 2.6, height: 2, length: 4.5, speed: 13, radius: 2.8 },
  truck: { colors: [0x556677, 0x445533, 0x664422], width: 3.5, height: 3.8, length: 8, speed: 6, radius: 4.8 },
  bicycle: { colors: [0x333333, 0x663333, 0x336633], width: 0.8, height: 1.8, length: 2.2, speed: 7, radius: 1.0 },
};

const DIR_DX = [1, 0, -1, 0];
const DIR_DZ = [0, 1, 0, -1];
const DIR_ROT = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
const LANE_OFFSET = 4;
const INTERSECTION_THRESHOLD = 3;
const HALF_CELL = CELL_SIZE / 2;

export class Traffic {
  constructor(scene, city, trafficLights) {
    this.scene = scene;
    this.city = city;
    this.trafficLights = trafficLights;
    this.vehicles = [];
    this.baseCounts = { bus: 10, microbus: 8, motorcycle: 25, scooter: 15, tempo: 6, cow: 8, car: 20, truck: 5, bicycle: 10 };
    this.spawnTraffic(this.baseCounts);
  }

  spawnTraffic(counts) {
    const rng = this.seededRandom(999 + this.vehicles.length);
    const roads = this.city.getRoadPositions();

    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        const rp = roads[Math.floor(rng() * roads.length)];
        this.spawnNPC(type, rp.x + (rng() - 0.5) * 8, rp.z + (rng() - 0.5) * 8, rng);
      }
    }
  }

  spawnNPC(type, x, z, rng) {
    const cfg = NPC_TYPES[type];
    if (!cfg) return;

    const npc = {
      type,
      position: new THREE.Vector3(x, 0, z),
      rotation: rng() * Math.PI * 2,
      speed: cfg.speed * (0.6 + rng() * 0.8),
      baseSpeed: cfg.speed * (0.6 + rng() * 0.8),
      radius: cfg.radius,
      mesh: null,
      direction: new THREE.Vector3(),
      turnTimer: rng() * 3,
      scaredTimer: 0,
      stoppedAtLight: false,
      obeysLights: rng() > 0.15, // 85% obey lights
    };

    npc.direction.set(Math.sin(npc.rotation), 0, Math.cos(npc.rotation));
    npc.mesh = this.createMesh(type, cfg, rng);
    npc.mesh.position.set(x, 0, z);
    this.scene.add(npc.mesh);
    this.vehicles.push(npc);
  }

  createMesh(type, cfg, rng) {
    const group = new THREE.Group();
    const color = cfg.colors[Math.floor(rng() * cfg.colors.length)];

    if (type === 'cow') {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.width, cfg.height * 0.8, cfg.length),
        new THREE.MeshLambertMaterial({ color })
      );
      body.position.y = cfg.height * 0.55;
      body.castShadow = false;
      group.add(body);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.7, 0.7),
        new THREE.MeshLambertMaterial({ color })
      );
      head.position.set(0, cfg.height * 0.6, cfg.length / 2 + 0.4);
      group.add(head);

      const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 4);
      const legMat = new THREE.MeshLambertMaterial({ color: 0xa08868 });
      for (const [lx, lz] of [[-0.45, -0.7], [0.45, -0.7], [-0.45, 0.7], [0.45, 0.7]]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, 0.35, lz);
        group.add(leg);
      }

      const hornGeo = new THREE.ConeGeometry(0.06, 0.4, 4);
      const hornMat = new THREE.MeshLambertMaterial({ color: 0xccccaa });
      for (const side of [-0.25, 0.25]) {
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(side, cfg.height * 0.8, cfg.length / 2 + 0.4);
        horn.rotation.z = side > 0 ? -0.3 : 0.3;
        group.add(horn);
      }
    } else if (type === 'motorcycle' || type === 'scooter' || type === 'bicycle') {
      const bodyH = type === 'bicycle' ? 0.3 : cfg.height * 0.5;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.width, bodyH, cfg.length),
        new THREE.MeshLambertMaterial({ color })
      );
      body.position.y = 0.5;
      group.add(body);

      // Rider
      const riderColor = type === 'bicycle' ? 0x336699 : 0x444444;
      const rider = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.85, 0.45),
        new THREE.MeshLambertMaterial({ color: riderColor })
      );
      rider.position.set(0, 1.05, -0.1);
      group.add(rider);

      // Head with helmet (motorcycle/scooter) or cap (bicycle)
      const headColor = type === 'bicycle' ? 0xc68642 : 0x333333;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 6, 6),
        new THREE.MeshLambertMaterial({ color: headColor })
      );
      head.position.set(0, 1.6, -0.1);
      group.add(head);

      // Wheels
      const wheelGeo = new THREE.CylinderGeometry(type === 'bicycle' ? 0.35 : 0.25, type === 'bicycle' ? 0.35 : 0.25, 0.1, 8);
      const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      for (const wz of [cfg.length * 0.4, -cfg.length * 0.4]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(0, type === 'bicycle' ? 0.35 : 0.25, wz);
        group.add(w);
      }

      // Scooter has a front basket
      if (type === 'scooter') {
        const basket = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.25, 0.3),
          new THREE.MeshLambertMaterial({ color: 0x888888 })
        );
        basket.position.set(0, 0.7, cfg.length * 0.4);
        group.add(basket);
      }

    } else if (type === 'tempo') {
      // Safa tempo (3-wheeler, similar to player but NPC)
      const bodyMat = new THREE.MeshLambertMaterial({ color });
      const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, cfg.height * 0.8, cfg.length), bodyMat);
      body.position.y = cfg.height * 0.5;
      body.castShadow = false;
      group.add(body);

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.width + 0.2, 0.15, cfg.length + 0.1),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.8) })
      );
      roof.position.y = cfg.height * 0.95;
      group.add(roof);

      // Front wheel
      const wGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 6);
      const wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
      const fw = new THREE.Mesh(wGeo, wMat);
      fw.rotation.z = Math.PI / 2;
      fw.position.set(0, 0.35, cfg.length * 0.4);
      group.add(fw);
      // Rear wheels
      for (const side of [-cfg.width * 0.45, cfg.width * 0.45]) {
        const rw = new THREE.Mesh(wGeo, wMat);
        rw.rotation.z = Math.PI / 2;
        rw.position.set(side, 0.35, -cfg.length * 0.3);
        group.add(rw);
      }

    } else if (type === 'truck') {
      // Decorated Nepali truck
      const cabMat = new THREE.MeshLambertMaterial({ color });
      const cab = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, cfg.height * 0.8, cfg.length * 0.3), cabMat);
      cab.position.set(0, cfg.height * 0.5, cfg.length * 0.3);
      cab.castShadow = false;
      group.add(cab);

      // Cargo area
      const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.width, cfg.height * 0.6, cfg.length * 0.65),
        new THREE.MeshLambertMaterial({ color: 0x445566 })
      );
      cargo.position.set(0, cfg.height * 0.4, -cfg.length * 0.15);
      group.add(cargo);

      // Colorful truck art stripes
      const stripColors = [0xff4444, 0x44ff44, 0xffff44, 0x4444ff];
      for (let s = 0; s < 3; s++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(cfg.width + 0.02, 0.12, cfg.length * 0.65 + 0.02),
          new THREE.MeshBasicMaterial({ color: stripColors[s % stripColors.length] })
        );
        stripe.position.set(0, cfg.height * 0.15 + s * 0.18, -cfg.length * 0.15);
        group.add(stripe);
      }

      // "Horn OK Please" sign (iconic Nepali truck detail)
      const signGeo = new THREE.PlaneGeometry(1.5, 0.5);
      const signMat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide });
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, cfg.height * 0.3, -cfg.length * 0.48 - 0.01);
      group.add(sign);

    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(cfg.width, cfg.height, cfg.length),
        new THREE.MeshLambertMaterial({ color })
      );
      body.position.y = cfg.height / 2 + 0.3;
      body.castShadow = false;
      group.add(body);

      const ws = new THREE.Mesh(
        new THREE.PlaneGeometry(cfg.width * 0.8, cfg.height * 0.4),
        new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 })
      );
      ws.position.set(0, cfg.height * 0.6 + 0.3, cfg.length / 2 + 0.01);
      group.add(ws);

      if (type === 'bus') {
        const rack = new THREE.Mesh(
          new THREE.BoxGeometry(cfg.width + 0.3, 0.15, cfg.length + 0.2),
          new THREE.MeshLambertMaterial({ color: 0x555555 })
        );
        rack.position.y = cfg.height + 0.38;
        group.add(rack);

        const winMat = new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.35 });
        for (const side of [-1, 1]) {
          for (let w = 0; w < 3; w++) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(1, cfg.height * 0.35), winMat);
            win.position.set(side * (cfg.width / 2 + 0.01), cfg.height * 0.55 + 0.3, -1.5 + w * 1.8);
            win.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            group.add(win);
          }
        }
      }
    }
    return group;
  }

  update(delta, playerVehicle) {
    const citySize = GRID_SIZE * CELL_SIZE;

    for (const npc of this.vehicles) {
      // Initialize road direction if not set
      if (npc.roadDir == null) {
        // Snap to nearest cardinal direction from current rotation
        let bestDir = 0;
        let bestDot = -Infinity;
        for (let d = 0; d < 4; d++) {
          const dot = npc.direction.x * DIR_DX[d] + npc.direction.z * DIR_DZ[d];
          if (dot > bestDot) { bestDot = dot; bestDir = d; }
        }
        npc.roadDir = bestDir;
        npc.lastIntersection = null;
      }

      // Honk reaction
      if (playerVehicle.honking) {
        const dx = npc.position.x - playerVehicle.position.x;
        const dz = npc.position.z - playerVehicle.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 18 && dist > 0.1) {
          npc.scaredTimer = 2.5;
          npc.direction.set(dx / dist, 0, dz / dist);
          npc.rotation = Math.atan2(npc.direction.x, npc.direction.z);
        }
      }

      if (npc.scaredTimer > 0) npc.scaredTimer -= delta;

      // Traffic light awareness
      npc.stoppedAtLight = false;
      if (npc.obeysLights && npc.scaredTimer <= 0 && this.trafficLights) {
        const lightState = this.trafficLights.getStateAt(npc.position);
        if (lightState === 'red' || lightState === 'yellow') {
          npc.stoppedAtLight = true;
        }
      }

      // Road-following AI (skip if scared / fleeing from honk)
      if (npc.scaredTimer <= 0) {
        const gx = Math.round(npc.position.x / CELL_SIZE - 0.5);
        const gz = Math.round(npc.position.z / CELL_SIZE - 0.5);

        // Check if NPC is off-road, steer back
        if (!this.city.isRoad(gx, gz)) {
          const roadPos = this.findNearestRoad(npc.position);
          if (roadPos) {
            const dx = roadPos.x - npc.position.x;
            const dz = roadPos.z - npc.position.z;
            npc.rotation = Math.atan2(dx, dz);
            npc.direction.set(Math.sin(npc.rotation), 0, Math.cos(npc.rotation));
          }
        } else {
          // Check for intersection: cell where both x%3==0 and z%3==0
          const isIntersection = (gx % 2 === 0) && (gz % 2 === 0);
          const intKey = gx + ',' + gz;
          const intCenterX = gx * CELL_SIZE + HALF_CELL;
          const intCenterZ = gz * CELL_SIZE + HALF_CELL;
          const distToCenter = Math.abs(npc.position.x - intCenterX) + Math.abs(npc.position.z - intCenterZ);

          if (isIntersection && distToCenter < INTERSECTION_THRESHOLD && npc.lastIntersection !== intKey) {
            npc.lastIntersection = intKey;

            // Determine valid turn directions at this intersection
            const possibleDirs = [];
            for (let d = 0; d < 4; d++) {
              const nextGx = gx + DIR_DX[d];
              const nextGz = gz + DIR_DZ[d];
              if (this.city.isRoad(nextGx, nextGz)) {
                possibleDirs.push(d);
              }
            }

            if (possibleDirs.length > 0) {
              // Weighted choice: prefer straight, then left/right, U-turn rare
              const straight = npc.roadDir;
              const left = (npc.roadDir + 3) % 4;
              const right = (npc.roadDir + 1) % 4;
              const uturn = (npc.roadDir + 2) % 4;

              const weighted = [];
              for (const d of possibleDirs) {
                if (d === straight) { weighted.push(d, d, d, d, d); } // weight 5
                else if (d === left || d === right) { weighted.push(d, d); } // weight 2
                else if (d === uturn) { weighted.push(d); } // weight 1
              }

              if (weighted.length > 0) {
                npc.roadDir = weighted[Math.floor(Math.random() * weighted.length)];
              } else {
                npc.roadDir = possibleDirs[Math.floor(Math.random() * possibleDirs.length)];
              }
            }
          }

          // Set direction from roadDir
          const dx = DIR_DX[npc.roadDir];
          const dz = DIR_DZ[npc.roadDir];
          npc.direction.set(dx, 0, dz);
          npc.rotation = DIR_ROT[npc.roadDir];

          // Lane discipline: offset perpendicular to travel direction
          // +X or +Z directions get positive perpendicular offset (drive on right side)
          // Perpendicular to (dx, dz) is (dz, -dx) for right-side offset
          const laneSign = (npc.roadDir === 0 || npc.roadDir === 1) ? 1 : -1;
          const perpX = dz * laneSign;
          const perpZ = -dx * laneSign;

          // Target position: road center + lane offset (along perpendicular axis)
          const roadCenterX = gx * CELL_SIZE + HALF_CELL;
          const roadCenterZ = gz * CELL_SIZE + HALF_CELL;
          const targetX = roadCenterX + perpX * LANE_OFFSET;
          const targetZ = roadCenterZ + perpZ * LANE_OFFSET;

          // Gently steer toward lane target (only on the perpendicular axis)
          const laneSteer = 3.0;
          if (Math.abs(dx) > 0) {
            // Moving along X, steer Z toward lane
            npc.position.z += (targetZ - npc.position.z) * laneSteer * delta;
          } else {
            // Moving along Z, steer X toward lane
            npc.position.x += (targetX - npc.position.x) * laneSteer * delta;
          }
        }
      }

      // Move
      let spd = npc.scaredTimer > 0 ? npc.baseSpeed * 2.5 : npc.baseSpeed;
      if (npc.stoppedAtLight) spd = 0;

      npc.position.x += npc.direction.x * spd * delta;
      npc.position.z += npc.direction.z * spd * delta;

      // Wrap
      if (npc.position.x < -5) npc.position.x = citySize + 5;
      if (npc.position.x > citySize + 5) npc.position.x = -5;
      if (npc.position.z < -5) npc.position.z = citySize + 5;
      if (npc.position.z > citySize + 5) npc.position.z = -5;

      npc.mesh.position.set(npc.position.x, 0, npc.position.z);
      npc.mesh.rotation.y = npc.rotation;
    }
    this.rebuildSpatialHash();
  }

  addMore(extra) {
    const rng = this.seededRandom(Date.now());
    const roads = this.city.getRoadPositions();
    const types = ['motorcycle', 'car', 'bus'];
    for (let i = 0; i < extra; i++) {
      const type = types[Math.floor(rng() * types.length)];
      const rp = roads[Math.floor(rng() * roads.length)];
      this.spawnNPC(type, rp.x + (rng() - 0.5) * 8, rp.z + (rng() - 0.5) * 8, rng);
    }
  }

  findNearestRoad(position) {
    const gx = Math.round(Math.floor(position.x / CELL_SIZE) / 3) * 3;
    const gz = Math.round(Math.floor(position.z / CELL_SIZE) / 3) * 3;
    let nearest = null;
    let nearestDist = Infinity;
    for (let dx = -6; dx <= 6; dx++) {
      for (let dz = -6; dz <= 6; dz++) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (!this.city.isRoad(nx, nz)) continue;
        const rx = nx * CELL_SIZE + CELL_SIZE / 2;
        const rz = nz * CELL_SIZE + CELL_SIZE / 2;
        const ddx = position.x - rx;
        const ddz = position.z - rz;
        const d = ddx * ddx + ddz * ddz;
        if (d < nearestDist) { nearestDist = d; nearest = { x: rx, z: rz }; }
      }
    }
    return nearest;
  }

  rebuildSpatialHash() {
    this._hash = {};
    for (const npc of this.vehicles) {
      const key = Math.floor(npc.position.x / CELL_SIZE) + ',' + Math.floor(npc.position.z / CELL_SIZE);
      if (!this._hash[key]) this._hash[key] = [];
      this._hash[key].push(npc);
    }
  }

  getNearby(worldX, worldZ) {
    if (!this._hash) return this.vehicles;
    const gx = Math.floor(worldX / CELL_SIZE);
    const gz = Math.floor(worldZ / CELL_SIZE);
    const result = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this._hash[(gx + dx) + ',' + (gz + dz)];
        if (cell) {
          for (const npc of cell) result.push(npc);
        }
      }
    }
    return result;
  }

  reset() {
    for (const npc of this.vehicles) removeAndDispose(this.scene, npc.mesh);
    this.vehicles = [];
    this.spawnTraffic(this.baseCounts);
  }

  seededRandom(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }
}
