import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE, COLORS } from './constants.js';

export class City {
  constructor(scene) {
    this.scene = scene;
    this.grid = [];
    this.buildingBounds = [];
    this.roadPositions = [];
    this.speedBumps = [];

    this.generateGrid();
    this.buildGround();
    this.buildRoads();
    this.buildBuildings();
    this.buildTemple();
    this.buildDecorations();
    this.buildPrayerFlags();
    this.buildSpeedBumps();
    this.buildShopSigns();
    this.buildMountains();
    this.buildPigeonGroups();
  }

  generateGrid() {
    for (let x = 0; x < GRID_SIZE; x++) {
      this.grid[x] = [];
      for (let z = 0; z < GRID_SIZE; z++) {
        this.grid[x][z] = (x % 3 === 0 || z % 3 === 0) ? 'road' : 'building';
      }
    }
    const tc = Math.floor(GRID_SIZE / 2);
    for (let dx = -1; dx <= 0; dx++) {
      for (let dz = -1; dz <= 0; dz++) {
        const gx = tc + dx;
        const gz = tc + dz;
        if (gx >= 0 && gz >= 0 && this.grid[gx]?.[gz] === 'building') {
          this.grid[gx][gz] = 'temple';
        }
      }
    }
  }

  isRoad(x, z) {
    if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return false;
    return this.grid[x][z] === 'road';
  }

  buildGround() {
    const size = GRID_SIZE * CELL_SIZE;
    const geo = new THREE.PlaneGeometry(size + 80, size + 80);
    const mat = new THREE.MeshLambertMaterial({ color: COLORS.grass });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(size / 2, -0.05, size / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildRoads() {
    const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x555555 });

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] !== 'road') continue;

        const px = x * CELL_SIZE + CELL_SIZE / 2;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;

        const road = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(px, 0.01, pz);
        road.receiveShadow = true;
        this.scene.add(road);

        // Dashed center line on straight road segments
        const isHorizRoad = x % 3 === 0 && z % 3 !== 0;
        const isVertRoad = z % 3 === 0 && x % 3 !== 0;
        if (isHorizRoad || isVertRoad) {
          for (let d = -3; d <= 3; d += 3) {
            const lineGeo = new THREE.PlaneGeometry(isVertRoad ? 2.5 : 0.15, isVertRoad ? 0.15 : 2.5);
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(
              px + (isVertRoad ? d : 0),
              0.02,
              pz + (isHorizRoad ? d : 0)
            );
            this.scene.add(line);
          }
        }

        this.addSidewalkEdges(x, z, px, pz, sidewalkMat);
        this.roadPositions.push(new THREE.Vector3(px, 0, pz));
      }
    }
  }

  addSidewalkEdges(gx, gz, px, pz, mat) {
    const half = CELL_SIZE / 2;
    const sw = 1.5;
    const neighbors = [
      { dx: -1, dz: 0, ox: -half + sw / 2, oz: 0, w: sw, d: CELL_SIZE },
      { dx: 1, dz: 0, ox: half - sw / 2, oz: 0, w: sw, d: CELL_SIZE },
      { dx: 0, dz: -1, ox: 0, oz: -half + sw / 2, w: CELL_SIZE, d: sw },
      { dx: 0, dz: 1, ox: 0, oz: half - sw / 2, w: CELL_SIZE, d: sw },
    ];
    for (const n of neighbors) {
      const nx = gx + n.dx;
      const nz = gz + n.dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && this.grid[nx][nz] !== 'road') {
        const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(n.w, n.d), mat);
        sidewalk.rotation.x = -Math.PI / 2;
        sidewalk.position.set(px + n.ox, 0.06, pz + n.oz);
        this.scene.add(sidewalk);
      }
    }
  }

  buildBuildings() {
    const rng = this.seededRandom(42);
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] === 'building') this.createBuilding(x, z, rng);
      }
    }
  }

  createBuilding(gx, gz, rng) {
    const height = 6 + rng() * 24;
    const margin = 1.2 + rng() * 1.8;
    const width = CELL_SIZE - margin * 2;
    const depth = CELL_SIZE - margin * 2;
    const color = COLORS.buildings[Math.floor(rng() * COLORS.buildings.length)];

    const px = gx * CELL_SIZE + CELL_SIZE / 2;
    const pz = gz * CELL_SIZE + CELL_SIZE / 2;

    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(px, height / 2, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Roof edge
    const edgeColor = new THREE.Color(color).multiplyScalar(0.82);
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.6, 0.4, depth + 0.6),
      new THREE.MeshLambertMaterial({ color: edgeColor })
    );
    edge.position.set(px, height + 0.2, pz);
    this.scene.add(edge);

    // Window grid
    if (height > 8) {
      const winColor = new THREE.Color(color).multiplyScalar(0.65);
      const winMat = new THREE.MeshLambertMaterial({ color: winColor });
      const floors = Math.floor(height / 3.5);
      for (let f = 0; f < Math.min(floors, 6); f++) {
        const wy = 2.5 + f * 3.5;
        if (wy > height - 2) break;
        for (let w = 0; w < 3; w++) {
          const wMesh = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.18, 1.3), winMat);
          wMesh.position.set(px - width * 0.28 + w * width * 0.28, wy, pz + depth / 2 + 0.01);
          this.scene.add(wMesh);
        }
      }
    }

    // Sometimes add balcony
    if (rng() > 0.7 && height > 10) {
      const balconyGeo = new THREE.BoxGeometry(width * 0.6, 0.15, 1.2);
      const balconyMat = new THREE.MeshLambertMaterial({ color: edgeColor });
      const balcony = new THREE.Mesh(balconyGeo, balconyMat);
      const bFloor = 2 + Math.floor(rng() * 3);
      balcony.position.set(px, bFloor * 3.5, pz + depth / 2 + 0.6);
      this.scene.add(balcony);
      // Railing
      const railing = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.6, 0.5, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x666666 })
      );
      railing.position.set(px, bFloor * 3.5 + 0.35, pz + depth / 2 + 1.15);
      this.scene.add(railing);
    }

    // Rooftop water tank (very Kathmandu!)
    if (rng() > 0.4) {
      const tankColor = rng() > 0.5 ? 0x222222 : 0x1a1a88;
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 1.5, 8),
        new THREE.MeshLambertMaterial({ color: tankColor })
      );
      tank.position.set(
        px + (rng() - 0.5) * width * 0.5,
        height + 1,
        pz + (rng() - 0.5) * depth * 0.5
      );
      this.scene.add(tank);

      // Tank stand
      const standMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 3), standMat);
        leg.position.set(tank.position.x + sx * 0.4, height + 0.3, tank.position.z + sz * 0.4);
        this.scene.add(leg);
      }
    }

    // AC unit on wall
    if (rng() > 0.6 && height > 6) {
      const ac = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.4, 0.3),
        new THREE.MeshLambertMaterial({ color: 0xdddddd })
      );
      const acFloor = 1 + Math.floor(rng() * Math.min(3, Math.floor(height / 4)));
      ac.position.set(px + width / 2 + 0.15, acFloor * 3.5, pz + (rng() - 0.5) * depth * 0.6);
      this.scene.add(ac);
    }

    // Satellite dish on roof
    if (rng() > 0.75) {
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 6, 4, 0, Math.PI),
        new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
      );
      dish.position.set(
        px + (rng() - 0.5) * width * 0.4,
        height + 0.8,
        pz + (rng() - 0.5) * depth * 0.4
      );
      dish.rotation.x = -0.5;
      this.scene.add(dish);

      // Dish pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1, 3),
        new THREE.MeshLambertMaterial({ color: 0x888888 })
      );
      pole.position.set(dish.position.x, height + 0.4, dish.position.z);
      this.scene.add(pole);
    }

    // Clothesline (random, between windows)
    if (rng() > 0.7 && height > 8) {
      const lineY = 4 + rng() * (height * 0.4);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x888888 });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(px - width * 0.35, lineY, pz + depth / 2 + 0.3),
        new THREE.Vector3(px + width * 0.35, lineY, pz + depth / 2 + 0.3),
      ]);
      this.scene.add(new THREE.Line(lineGeo, lineMat));

      // Hanging clothes (colored rectangles)
      const clothColors = [0xff4444, 0x4444ff, 0x44ff44, 0xffff44, 0xff44ff];
      for (let c = 0; c < 3; c++) {
        const cloth = new THREE.Mesh(
          new THREE.PlaneGeometry(0.4 + rng() * 0.3, 0.5 + rng() * 0.3),
          new THREE.MeshBasicMaterial({
            color: clothColors[Math.floor(rng() * clothColors.length)],
            side: THREE.DoubleSide,
          })
        );
        cloth.position.set(
          px - width * 0.25 + c * width * 0.25,
          lineY - 0.35,
          pz + depth / 2 + 0.31
        );
        this.scene.add(cloth);
      }
    }

    this.buildingBounds.push({
      minX: px - width / 2 - 0.3,
      maxX: px + width / 2 + 0.3,
      minZ: pz - depth / 2 - 0.3,
      maxZ: pz + depth / 2 + 0.3,
    });
  }

  buildTemple() {
    const tc = Math.floor(GRID_SIZE / 2);
    const cx = (tc - 0.5) * CELL_SIZE + CELL_SIZE / 2;
    const cz = (tc - 0.5) * CELL_SIZE + CELL_SIZE / 2;

    // Base platform (tiered)
    for (let tier = 0; tier < 3; tier++) {
      const r = 14 - tier * 2;
      const h = 1.5;
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r + 0.5, h, 20),
        new THREE.MeshLambertMaterial({ color: COLORS.temple.white })
      );
      base.position.set(cx, tier * h + h / 2, cz);
      base.castShadow = true;
      this.scene.add(base);
    }

    // Dome
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(9, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    dome.position.set(cx, 4.5, cz);
    dome.castShadow = true;
    this.scene.add(dome);

    // Harmika
    const harmika = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshLambertMaterial({ color: COLORS.temple.gold })
    );
    harmika.position.set(cx, 16, cz);
    this.scene.add(harmika);

    // Eyes (all 4 sides)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000080 });
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const eye = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), eyeMat);
      eye.position.set(cx + Math.sin(angle) * 2.51, 16.5, cz + Math.cos(angle) * 2.51);
      eye.rotation.y = angle;
      this.scene.add(eye);
    }

    // Spire rings
    for (let i = 0; i < 13; i++) {
      const r = 2.5 - i * 0.17;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r + 0.1, 0.55, 8),
        new THREE.MeshLambertMaterial({ color: COLORS.temple.gold })
      );
      ring.position.set(cx, 19 + i * 0.65, cz);
      this.scene.add(ring);
    }

    // Pinnacle
    const pin = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 2.5, 6),
      new THREE.MeshLambertMaterial({ color: COLORS.temple.gold })
    );
    pin.position.set(cx, 28.5, cz);
    this.scene.add(pin);

    // Butter lamps around base
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 4, 4), lampMat);
      lamp.position.set(cx + Math.cos(a) * 15, 0.5, cz + Math.sin(a) * 15);
      this.scene.add(lamp);
    }

    this.buildingBounds.push({
      minX: cx - 14, maxX: cx + 14,
      minZ: cz - 14, maxZ: cz + 14,
    });
  }

  buildDecorations() {
    const rng = this.seededRandom(777);

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] !== 'road') continue;
        if (rng() > 0.1) continue;

        const px = x * CELL_SIZE + CELL_SIZE / 2 + (rng() > 0.5 ? 1 : -1) * (CELL_SIZE * 0.4);
        const pz = z * CELL_SIZE + CELL_SIZE / 2 + (rng() > 0.5 ? 1 : -1) * (CELL_SIZE * 0.4);
        this.createTree(px, pz, rng);
      }
    }

    // Streetlights
    for (let x = 0; x < GRID_SIZE; x += 3) {
      for (let z = 1; z < GRID_SIZE; z += 3) {
        if (rng() > 0.5) continue;
        const px = x * CELL_SIZE + CELL_SIZE / 2 + CELL_SIZE * 0.42;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;
        this.createStreetlight(px, pz);
      }
    }

    // Tea stalls
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] !== 'road') continue;
        if (rng() > 0.04) continue;
        const px = x * CELL_SIZE + CELL_SIZE / 2 + (rng() > 0.5 ? 1 : -1) * CELL_SIZE * 0.38;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;
        this.createTeaStall(px, pz, rng);
      }
    }
  }

  createTree(x, z, rng) {
    const h = 2 + rng() * 2.5;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, h, 5),
      new THREE.MeshLambertMaterial({ color: 0x6b4226 })
    );
    trunk.position.set(x, h / 2, z);
    trunk.castShadow = true;
    this.scene.add(trunk);

    const r = 1.5 + rng() * 1.5;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r, 6, 5),
      new THREE.MeshLambertMaterial({ color: 0x2d5f2d + Math.floor(rng() * 0x101010) })
    );
    canopy.position.set(x, h + r * 0.5, z);
    canopy.castShadow = true;
    this.scene.add(canopy);
  }

  createStreetlight(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 5, 4),
      new THREE.MeshLambertMaterial({ color: 0x555555 })
    );
    pole.position.set(x, 2.5, z);
    this.scene.add(pole);

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffee88 })
    );
    lamp.position.set(x, 5.2, z);
    this.scene.add(lamp);
  }

  createTeaStall(x, z, rng) {
    // Small open structure with a roof
    const w = 2 + rng();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(w, 1.5, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x8b6914 })
    );
    base.position.set(x, 0.75, z);
    this.scene.add(base);

    // Counter top
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.2, 0.08, 1.7),
      new THREE.MeshLambertMaterial({ color: 0xdeb887 })
    );
    counter.position.set(x, 1.54, z);
    this.scene.add(counter);

    // Awning
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.8, 0.08, 2.2),
      new THREE.MeshLambertMaterial({
        color: COLORS.shopSigns[Math.floor(rng() * COLORS.shopSigns.length)],
      })
    );
    awning.position.set(x, 2.5, z);
    this.scene.add(awning);

    // Poles
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    for (const [px, pz] of [[-w / 2, 0.8], [w / 2, 0.8]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4), poleMat);
      pole.position.set(x + px, 1.9, z + pz);
      this.scene.add(pole);
    }
  }

  buildPrayerFlags() {
    const rng = this.seededRandom(555);
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] !== 'road') continue;
        if (rng() > 0.06) continue;

        const left = x > 0 && this.grid[x - 1]?.[z] !== 'road';
        const right = x < GRID_SIZE - 1 && this.grid[x + 1]?.[z] !== 'road';
        if (left && right) {
          const px = x * CELL_SIZE + CELL_SIZE / 2;
          const pz = z * CELL_SIZE + CELL_SIZE / 2 + (rng() - 0.5) * 8;
          const height = 7 + rng() * 8;
          this.createFlagString(
            new THREE.Vector3(px - CELL_SIZE * 0.45, height, pz),
            new THREE.Vector3(px + CELL_SIZE * 0.45, height, pz),
            rng
          );
        }
      }
    }
  }

  createFlagString(from, to, rng) {
    this.scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: 0x777777 })
    ));

    const count = 6 + Math.floor(rng() * 5);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const pos = new THREE.Vector3().lerpVectors(from, to, t);
      pos.y -= Math.sin(t * Math.PI) * 0.9;

      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.85),
        new THREE.MeshBasicMaterial({
          color: COLORS.prayerFlags[i % COLORS.prayerFlags.length],
          side: THREE.DoubleSide,
        })
      );
      flag.position.copy(pos);
      flag.position.y -= 0.4;
      flag.rotation.y = rng() * 0.4;
      this.scene.add(flag);
    }
  }

  buildSpeedBumps() {
    const rng = this.seededRandom(222);

    for (let x = 3; x < GRID_SIZE - 1; x += 3) {
      for (let z = 3; z < GRID_SIZE - 1; z += 3) {
        if (rng() > 0.35) continue;
        if (!this.isRoad(x, z)) continue;

        const px = x * CELL_SIZE + CELL_SIZE / 2;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;

        // Yellow bump stripe
        const bump = new THREE.Mesh(
          new THREE.BoxGeometry(CELL_SIZE * 0.7, 0.15, 0.8),
          new THREE.MeshLambertMaterial({ color: 0xddcc00 })
        );
        bump.position.set(px, 0.08, pz + CELL_SIZE * 0.3);
        this.scene.add(bump);

        // Striping
        for (let s = 0; s < 5; s++) {
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.16, 0.12),
            new THREE.MeshBasicMaterial({ color: 0x333333 })
          );
          stripe.position.set(px - 4 + s * 2, 0.09, pz + CELL_SIZE * 0.3);
          this.scene.add(stripe);
        }

        this.speedBumps.push(new THREE.Vector3(px, 0, pz + CELL_SIZE * 0.3));
      }
    }
  }

  createSignTexture(text, bgColor, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Background
    const hex = '#' + new THREE.Color(bgColor).getHexString();
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, width, height);

    // Subtle border
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    // Inner highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    // Text
    const fontSize = Math.floor(height * 0.5);
    ctx.font = `bold ${fontSize}px 'Noto Sans Devanagari', 'Mangal', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillText(text, width / 2 + 2, height / 2 + 2);

    // Main text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  buildShopSigns() {
    const rng = this.seededRandom(888);
    const signData = [
      { nepali: 'चिया', english: 'CHIYA' },
      { nepali: 'मोमो', english: 'MOMO' },
      { nepali: 'दालभात', english: 'DAL BHAT' },
      { nepali: 'नेवारी', english: 'NEWARI' },
      { nepali: 'थकाली', english: 'THAKALI' },
      { nepali: 'फोन', english: 'PHONE' },
      { nepali: 'साइकल', english: 'BIKE' },
      { nepali: 'कपडा', english: 'CLOTH' },
      { nepali: 'किताब', english: 'BOOKS' },
      { nepali: 'मिठाई', english: 'SWEETS' },
      { nepali: 'फलफूल', english: 'FRUITS' },
      { nepali: 'जुत्ता', english: 'SHOES' },
      { nepali: 'सुन', english: 'GOLD' },
      { nepali: 'फोटो', english: 'PHOTO' },
      { nepali: 'औषधि', english: 'CHEMIST' },
    ];

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] !== 'building') continue;
        if (rng() > 0.3) continue;

        const px = x * CELL_SIZE + CELL_SIZE / 2;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;
        const margin = 2;
        const bw = CELL_SIZE - margin * 2;
        const color = COLORS.shopSigns[Math.floor(rng() * COLORS.shopSigns.length)];
        const signInfo = signData[Math.floor(rng() * signData.length)];

        // Determine which face has a road
        let signX = px, signZ = pz, rotY = 0;
        if (this.isRoad(x, z + 1)) { signZ = pz + bw / 2 + 0.02; }
        else if (this.isRoad(x, z - 1)) { signZ = pz - bw / 2 - 0.02; rotY = Math.PI; }
        else if (this.isRoad(x + 1, z)) { signX = px + bw / 2 + 0.02; rotY = Math.PI / 2; }
        else if (this.isRoad(x - 1, z)) { signX = px - bw / 2 - 0.02; rotY = -Math.PI / 2; }
        else continue;

        const sw = 2.5 + rng() * 2;

        // Create canvas texture with Devanagari text
        const texture = this.createSignTexture(signInfo.nepali, color, 256, 96);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(sw, 1.2),
          new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
        );
        sign.position.set(signX, 3.5 + rng() * 2, signZ);
        sign.rotation.y = rotY;
        this.scene.add(sign);

        // Border
        const border = new THREE.Mesh(
          new THREE.PlaneGeometry(sw + 0.2, 1.4),
          new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide })
        );
        border.position.set(signX, sign.position.y, signZ);
        border.rotation.y = rotY;
        const norm = new THREE.Vector3(0, 0, -0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        border.position.add(norm);
        this.scene.add(border);
      }
    }
  }

  buildMountains() {
    const cityWidth = GRID_SIZE * CELL_SIZE;
    const peaks = [
      { x: -80,  z: -100, h: 95,  r: 55 },
      { x: -30,  z: -130, h: 110, r: 50 },
      { x: 20,   z: -90,  h: 65,  r: 35 },
      { x: 70,   z: -140, h: 120, r: 60 },
      { x: 130,  z: -110, h: 85,  r: 45 },
      { x: 190,  z: -80,  h: 50,  r: 30 },
      { x: 250,  z: -120, h: 105, r: 55 },
      { x: 310,  z: -95,  h: 75,  r: 40 },
      { x: 370,  z: -150, h: 115, r: 58 },
      { x: cityWidth + 30, z: -100, h: 90, r: 50 },
      { x: cityWidth + 80, z: -130, h: 70, r: 38 },
    ];

    const mountainColors = [0x2a3040, 0x2f2a40, 0x33304a, 0x3a2a4a, 0x2e3545];

    for (const peak of peaks) {
      const color = mountainColors[Math.abs(Math.floor(peak.x * 7)) % mountainColors.length];
      const geo = new THREE.ConeGeometry(peak.r, peak.h, 6);
      const mat = new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(peak.x, peak.h / 2, peak.z);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.scene.add(mesh);

      // Snow cap on tall peaks
      if (peak.h > 80) {
        const snowH = peak.h * 0.3;
        const snowR = peak.r * 0.4;
        const snowGeo = new THREE.ConeGeometry(snowR, snowH, 6);
        const snowMat = new THREE.MeshLambertMaterial({ color: 0xf0f0ff });
        const snowMesh = new THREE.Mesh(snowGeo, snowMat);
        snowMesh.position.set(peak.x, peak.h - snowH / 2, peak.z);
        snowMesh.castShadow = false;
        snowMesh.receiveShadow = false;
        this.scene.add(snowMesh);
      }
    }
  }

  buildPigeonGroups() {
    this.pigeonGroups = [];
    const rng = this.seededRandom(444);

    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z] !== 'road') continue;
        // Only at intersections where both x%3===0 and z%3===0
        if (x % 3 !== 0 || z % 3 !== 0) continue;
        // ~5% of qualifying intersections
        if (rng() > 0.05) continue;

        const cx = x * CELL_SIZE + CELL_SIZE / 2;
        const cz = z * CELL_SIZE + CELL_SIZE / 2;
        const count = 4 + Math.floor(rng() * 5); // 4-8 pigeons
        const meshes = [];

        for (let p = 0; p < count; p++) {
          const pigeonGroup = new THREE.Group();

          // Body
          const bodyGeo = new THREE.SphereGeometry(0.12, 4, 4);
          const bodyMat = new THREE.MeshLambertMaterial({ color: 0x888899 });
          const body = new THREE.Mesh(bodyGeo, bodyMat);
          body.position.y = 0.12;
          pigeonGroup.add(body);

          // Head
          const headGeo = new THREE.SphereGeometry(0.07, 4, 4);
          const headMat = new THREE.MeshLambertMaterial({ color: 0x888899 });
          const head = new THREE.Mesh(headGeo, headMat);
          head.position.set(0, 0.24, 0.08);
          pigeonGroup.add(head);

          // Scatter within 2-unit radius
          const angle = rng() * Math.PI * 2;
          const dist = rng() * 2;
          pigeonGroup.position.set(
            cx + Math.cos(angle) * dist,
            0,
            cz + Math.sin(angle) * dist
          );
          pigeonGroup.rotation.y = rng() * Math.PI * 2;

          this.scene.add(pigeonGroup);
          meshes.push(pigeonGroup);
        }

        this.pigeonGroups.push({
          position: new THREE.Vector3(cx, 0, cz),
          meshes,
        });
      }
    }
  }

  getSpeedBumps() { return this.speedBumps; }
  getBuildingBounds() { return this.buildingBounds; }
  getRoadPositions() { return this.roadPositions; }

  seededRandom(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }
}
