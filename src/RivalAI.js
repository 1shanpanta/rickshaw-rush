import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE } from './constants.js';
import { removeAndDispose } from './utils.js';

const RIVAL_COLORS = [0xcc3333, 0xcc8800, 0x8833cc];
const RIVAL_NAMES = ['Red Rider', 'Gold Rush', 'Purple Haze'];

export class RivalAI {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.rivals = [];
    this.destination = null;
  }

  setDestination(dest) {
    this.destination = dest;
    for (const r of this.rivals) r.target = dest.clone();
  }

  spawn(count) {
    const roads = this.city.getRoadPositions();
    for (let i = 0; i < count; i++) {
      const rp = roads[Math.floor(Math.random() * roads.length)];
      const color = RIVAL_COLORS[i % RIVAL_COLORS.length];
      const rival = {
        name: RIVAL_NAMES[i % RIVAL_NAMES.length],
        position: new THREE.Vector3(rp.x, 0, rp.z),
        rotation: Math.random() * Math.PI * 2,
        speed: 0,
        maxSpeed: 16 + Math.random() * 6,
        target: this.destination ? this.destination.clone() : null,
        mesh: this.createMesh(color, RIVAL_NAMES[i % RIVAL_NAMES.length]),
        radius: 2.5,
        slowTimer: 0,
        finished: false,
        finishTime: 0,
      };
      rival.mesh.position.copy(rival.position);
      this.scene.add(rival.mesh);
      this.rivals.push(rival);
    }
  }

  createMesh(color, name) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });

    // Body — bigger to match player
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 5), mat);
    body.position.y = 1.5;
    g.add(body);

    // Roof
    const roofColor = new THREE.Color(color).multiplyScalar(0.75);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.22, 5.4),
      new THREE.MeshLambertMaterial({ color: roofColor })
    );
    roof.position.y = 2.9;
    g.add(roof);

    // Front nose
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(2, 1.4, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x333333 })
    ).translateY(1.2).translateZ(2.8));

    // Accent stripe
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(3.02, 0.15, 5.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    ).translateY(0.7));

    // Headlights
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
    for (const side of [-0.8, 0.8]) {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 5), hlMat).translateX(side).translateY(1.3).translateZ(3.2));
    }

    // Wheels
    const wGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 8);
    const wMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    for (const [x, z] of [[0, 2.4], [-1.5, -1.4], [1.5, -1.4]]) {
      const w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.55, z);
      g.add(w);
    }

    // Name tag above
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.roundRect(2, 2, 252, 44, 6);
    ctx.fill();
    ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 128, 26);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(4, 1, 1);
    sprite.position.y = 4.5;
    g.add(sprite);

    return g;
  }

  update(delta, buildingBounds, gameTime) {
    for (const r of this.rivals) {
      if (r.finished) continue;

      // Slow debuff from bullets
      if (r.slowTimer > 0) {
        r.slowTimer -= delta;
      }
      const speedMult = r.slowTimer > 0 ? 0.3 : 1;

      if (!r.target && this.destination) r.target = this.destination.clone();
      if (!r.target) continue;

      // Steer toward destination
      const dx = r.target.x - r.position.x;
      const dz = r.target.z - r.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const desiredRot = Math.atan2(dx, dz);

      // Smooth rotation
      let rotDiff = desiredRot - r.rotation;
      while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
      while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
      r.rotation += rotDiff * Math.min(3.5 * delta, 1);

      // Speed — slow near destination
      const targetSpeed = (dist > 15 ? r.maxSpeed : r.maxSpeed * 0.4) * speedMult;
      r.speed += (targetSpeed - r.speed) * Math.min(4 * delta, 1);

      // Move
      r.position.x += Math.sin(r.rotation) * r.speed * delta;
      r.position.z += Math.cos(r.rotation) * r.speed * delta;

      // Building collisions
      this.handleBuildingCollisions(r, buildingBounds);

      // City bounds
      const citySize = GRID_SIZE * CELL_SIZE;
      r.position.x = Math.max(3, Math.min(citySize - 3, r.position.x));
      r.position.z = Math.max(3, Math.min(citySize - 3, r.position.z));

      // Update mesh
      r.mesh.position.set(r.position.x, 0, r.position.z);
      r.mesh.rotation.y = r.rotation;

      // Check if reached destination
      if (dist < 8) {
        r.finished = true;
        r.finishTime = gameTime;
      }
    }
  }

  // Called by Projectiles when a bullet hits a rival
  hitByBullet(rival) {
    rival.slowTimer = 3; // slowed for 3 seconds
    rival.speed *= 0.1;
  }

  handleBuildingCollisions(rival, bounds) {
    const pos = rival.position;
    const radius = 2.5;
    for (const b of bounds) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < radius) {
        const push = (radius - dist) + 1;
        if (dist > 0.001) { pos.x += (dx / dist) * push; pos.z += (dz / dist) * push; }
        else pos.x += push;
        rival.speed *= 0.4;
      }
    }
  }

  getPositions(playerPos, playerFinished, playerFinishTime, gameTime) {
    const racers = [
      { name: 'You', dist: playerFinished ? 0 : playerPos.distanceTo(this.destination || playerPos), finished: playerFinished, finishTime: playerFinishTime, isPlayer: true },
      ...this.rivals.map(r => ({
        name: r.name,
        dist: r.finished ? 0 : r.position.distanceTo(this.destination || r.position),
        finished: r.finished,
        finishTime: r.finishTime,
        isPlayer: false,
      })),
    ];
    // Finished racers first (sorted by finish time), then by distance
    racers.sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return a.dist - b.dist;
    });
    return racers;
  }

  getRivals() { return this.rivals; }

  reset() {
    for (const r of this.rivals) removeAndDispose(this.scene, r.mesh);
    this.rivals = [];
    this.destination = null;
  }
}
